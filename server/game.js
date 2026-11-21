'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const {DatabaseSync} = require('node:sqlite');

const scrypt = promisify(crypto.scrypt);
const STATS = Object.freeze(['strength','dexterity','battle_iq','endurance','hacks','iq']);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}
function istanbulDay(date) {
  const parts = Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', year: 'numeric',
    month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return fields.year + '-' + fields.month + '-' + fields.day;
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function validateUsername(username) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_-]{3,22}$/.test(username)) {
    throw new ApiError(400, 'Username must contain 3–22 letters, digits, underscore or hyphen.');
  }
  return username;
}
function validatePassword(password) {
  if (typeof password !== 'string') {
    throw new ApiError(400, 'Password must be 10–72 bytes.');
  }
  const length = Buffer.byteLength(password, 'utf8');
  if (length < 10 || length > 72) {
    throw new ApiError(400, 'Password must be 10–72 bytes.');
  }
  return password;
}
async function passwordHash(password, saltHex) {
  const bytes = await scrypt(password, Buffer.from(saltHex, 'hex'), 64, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
  });
  return bytes.toString('hex');
}
function makeGame({
  dbPath = path.resolve(process.env.DB_PATH || path.join(os.tmpdir(), 'daily-stat-clash.sqlite')),
  charactersPath = path.resolve(__dirname, '../app/src/data/characters.json'),
  clock = () => new Date()
} = {}) {
  fs.mkdirSync(path.dirname(dbPath), {recursive:true});
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const roster = JSON.parse(fs.readFileSync(charactersPath,'utf8'));
  if (!Array.isArray(roster) || roster.length < 6) throw new Error('Character roster is missing.');

  function write(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch(e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  // Changing the roster must not leave obsolete cards, picks or match results.
  // Preserve player accounts and their sessions, but reset the full game
  // character catalog and match state in a single SQLite transaction.
  const rosterHash = sha256(JSON.stringify(roster));
  const storedVersion = db.prepare('SELECT value FROM game_meta WHERE key=?')
    .get('character_roster_sha256')?.value;
  const characterCount = db.prepare('SELECT count(*) AS n FROM characters').get().n;
  if(storedVersion !== rosterHash || characterCount !== roster.length) {
    const insertCharacter = db.prepare(
      'INSERT INTO characters ' +
      '(id,name,universe,portrait_url,strength,dexterity,battle_iq,endurance,hacks,iq)' +
      ' VALUES(?,?,?,?,?,?,?,?,?,?)'
    );
    write(() => {
      db.prepare('DELETE FROM matchups').run();
      db.prepare('DELETE FROM daily_picks').run();
      db.prepare('DELETE FROM daily_runs').run();
      db.prepare('DELETE FROM settled_days').run();
      db.prepare('DELETE FROM characters').run();
      for (const c of roster) {
        // Franchise-specific art is not present. Use the generic game icon
        // rather than mislabeling a portrait from the previous original roster.
        const portrait = typeof c.portrait_url === 'string' && c.portrait_url
          ? c.portrait_url : '/Daily-Stat-Clash/favicon.svg';
        insertCharacter.run(c.id,c.name,c.universe,portrait,
          c.strength,c.dexterity,c.battle_iq,c.endurance,c.hacks,c.iq);
      }
      db.prepare('INSERT INTO game_meta(key,value) VALUES(?,?) ' +
        'ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .run('character_roster_sha256',rosterHash);
    });
  }

  const time = () => clock().getTime();
  const today = () => istanbulDay(clock());
  const findUser = db.prepare(
    'SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id ' +
    'WHERE s.token_hash=? AND s.expires_at>?'
  );
  function userForToken(token) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
    return findUser.get(sha256(token), time()) || null;
  }
  function mustUser(token) {
    const user = userForToken(token);
    if (!user) throw new ApiError(401, 'Session expired. Please sign in again.');
    return user;
  }
  function issueSession(id) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(sha256(token), id, time() + SESSION_MS, time());
    return token;
  }
  function userView(user) {
    return {id:user.id,handle:user.username};
  }
  function clearExpiredSessions() {
    write(() => db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(time()));
  }

  async function register(username, password) {
    username = validateUsername(username);
    validatePassword(password);
    const usernameKey = username.toLowerCase();
    const existing = db.prepare('SELECT 1 FROM users WHERE username_key=?').get(usernameKey);
    if (existing) throw new ApiError(409, 'This username is already taken.');

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordDigest = await passwordHash(password,salt);
    try {
      return write(() => {
        const id = crypto.randomUUID();
        db.prepare('INSERT INTO users(id,username,username_key,password_salt,password_hash,created_at) ' +
          'VALUES(?,?,?,?,?,?)').run(id,username,usernameKey,salt,passwordDigest,time());
        const token = issueSession(id);
        return {token,user:{id,handle:username}};
      });
    } catch(error) {
      if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' ||
          (typeof error.message === 'string' && error.message.includes('UNIQUE constraint'))) {
        throw new ApiError(409, 'This username is already taken.');
      }
      throw error;
    }
  }

  async function login(username, password) {
    // Avoid disclosing whether the username exists.
    username = validateUsername(username);
    validatePassword(password);
    const key = username.toLowerCase();
    const guard = db.prepare('SELECT failures,last_failure,locked_until FROM login_attempts WHERE username_key=?')
      .get(key);
    if (guard && guard.locked_until > time()) {
      throw new ApiError(429,'Too many attempts. Try again in 15 minutes.');
    }
    const record = db.prepare('SELECT * FROM users WHERE username_key=?').get(key);
    // Equalize account-existence timing without logging or exposing passwords.
    const salt = record ? record.password_salt : '00000000000000000000000000000000';
    const computed = await passwordHash(password,salt);
    const expected = record ? record.password_hash : '0'.repeat(128);
    const verified = crypto.timingSafeEqual(
      Buffer.from(computed,'hex'), Buffer.from(expected,'hex')
    );
    if (!record || !verified) {
      write(() => {
        const fresh = !guard || time() - guard.last_failure > LOCK_MS;
        const failures = fresh ? 1 : guard.failures + 1;
        const lockedUntil = failures >= 8 ? time() + LOCK_MS : 0;
        db.prepare(
          'INSERT INTO login_attempts(username_key,failures,last_failure,locked_until) VALUES(?,?,?,?)' +
          ' ON CONFLICT(username_key) DO UPDATE SET failures=excluded.failures,' +
          'last_failure=excluded.last_failure,locked_until=excluded.locked_until'
        ).run(key,failures,time(),lockedUntil);
      });
      throw new ApiError(401,'Invalid username or password.');
    }
    return write(() => {
      db.prepare('DELETE FROM login_attempts WHERE username_key=?').run(key);
      return {token:issueSession(record.id),user:userView(record)};
    });
  }
  function logout(token) {
    if (typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)) {
      write(() => db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token)));
    }
    return {ok:true};
  }

  function pendingDays() {
    const day = today();
    return db.prepare(
      'SELECT DISTINCT r.day FROM daily_runs r WHERE r.submitted_at IS NOT NULL AND r.day<? ' +
      'AND NOT EXISTS(SELECT 1 FROM settled_days s WHERE s.day=r.day) ORDER BY r.day'
    ).all(day).map(v => v.day);
  }
  const picksForMatch = db.prepare(
    'SELECT p.stat,p.character_id,c.strength,c.dexterity,c.battle_iq,c.endurance,c.hacks,c.iq ' +
    'FROM daily_picks p JOIN characters c ON c.id=p.character_id WHERE p.user_id=? AND p.day=?'
  );
  function settlePending() {
    const days = pendingDays();
    let created = 0;
    for (const day of days) {
      created += write(() => {
        if (db.prepare('SELECT 1 FROM settled_days WHERE day=?').get(day)) return 0;
        const eligible = db.prepare(
          'SELECT r.user_id FROM daily_runs r WHERE r.day=? AND r.submitted_at IS NOT NULL ' +
          'AND (SELECT count(*) FROM daily_picks p WHERE p.user_id=r.user_id AND p.day=r.day)=6'
        ).all(day);
        eligible.sort((a,b) => {
          const aa=sha256(day+'|'+a.user_id),bb=sha256(day+'|'+b.user_id);
          return aa.localeCompare(bb);
        });
        let count = 0;
        for (let i=0; i+1<eligible.length; i+=2) {
          const a = eligible[i].user_id, b = eligible[i+1].user_id;
          const ap = Object.fromEntries(picksForMatch.all(a,day).map(p => [p.stat,p]));
          const bp = Object.fromEntries(picksForMatch.all(b,day).map(p => [p.stat,p]));
          let pointsA=0,pointsB=0;
          const details=[];
          for (const stat of STATS) {
            const x=ap[stat],y=bp[stat];
            if (!x || !y) throw new Error('Incomplete submitted lineup.');
            if (x[stat]>y[stat]) pointsA++;
            if (y[stat]>x[stat]) pointsB++;
            details.push({
              stat,a:x[stat],b:y[stat],
              a_character:x.character_id,b_character:y.character_id
            });
          }
          db.prepare('INSERT INTO matchups(id,day,user_a,user_b,points_a,points_b,details,created_at)' +
            ' VALUES(?,?,?,?,?,?,?,?)')
            .run(crypto.randomUUID(),day,a,b,pointsA,pointsB,JSON.stringify(details),time());
          count++;
        }
        db.prepare('INSERT INTO settled_days(day,settled_at) VALUES(?,?)').run(day,time());
        return count;
      });
    }
    return created;
  }

  function currentRun(userId,day) {
    return db.prepare('SELECT * FROM daily_runs WHERE user_id=? AND day=?').get(userId,day);
  }
  function state(token) {
    settlePending();
    const user = userForToken(token);
    const day = today();
    const run = user ? currentRun(user.id,day) : null;
    let current = null, picks = [], history = [];
    if (run && run.current_character_id && !run.submitted_at) {
      current = db.prepare('SELECT id,name,universe,portrait_url FROM characters WHERE id=?')
        .get(run.current_character_id) || null;
    }
    if (user) {
      picks = db.prepare(
        'SELECT p.stat,p.character_id,c.name,c.universe,c.portrait_url ' +
        'FROM daily_picks p JOIN characters c ON c.id=p.character_id ' +
        'WHERE p.user_id=? AND p.day=? ORDER BY p.picked_at,p.stat'
      ).all(user.id,day);
      const results = db.prepare(
        'SELECT m.*,a.username AS a_handle,b.username AS b_handle ' +
        'FROM matchups m JOIN users a ON a.id=m.user_a JOIN users b ON b.id=m.user_b ' +
        'WHERE m.user_a=? OR m.user_b=? ORDER BY m.day DESC LIMIT 100'
      ).all(user.id,user.id);
      history = results.map(m => {
        const reversed = m.user_b===user.id;
        return {
          day:m.day,
          self_points:reversed?m.points_b:m.points_a,
          opponent_points:reversed?m.points_a:m.points_b,
          opponent:reversed?m.a_handle:m.b_handle,
          reversed,
          details:JSON.parse(m.details)
        };
      });
    }
    return {
      day,user:user?userView(user):null,
      participants:db.prepare(
        'SELECT count(*) AS n FROM daily_runs WHERE day=? AND submitted_at IS NOT NULL'
      ).get(day).n,
      totalCharacters:db.prepare('SELECT count(*) AS n FROM characters').get().n,
      current,picks,submitted:!!run?.submitted_at,history
    };
  }
  function draw(token) {
    const user = mustUser(token);
    const day = today();
    write(() => {
      db.prepare('INSERT OR IGNORE INTO daily_runs(user_id,day) VALUES(?,?)')
        .run(user.id,day);
      const run = currentRun(user.id,day);
      if (run.submitted_at) throw new ApiError(409,'Lineup already submitted.');
      if (run.current_character_id) return;
      const n = db.prepare('SELECT count(*) AS n FROM daily_picks WHERE user_id=? AND day=?')
        .get(user.id,day).n;
      if (n>=6) throw new ApiError(409,'All six stats are assigned.');
      const card = db.prepare(
        'SELECT id FROM characters WHERE id NOT IN ' +
        '(SELECT character_id FROM daily_picks WHERE user_id=? AND day=?) ' +
        'ORDER BY RANDOM() LIMIT 1'
      ).get(user.id,day);
      if (!card) throw new ApiError(409,'No characters remaining.');
      db.prepare('UPDATE daily_runs SET current_character_id=? WHERE user_id=? AND day=?')
        .run(card.id,user.id,day);
    });
    return state(token);
  }
  function assign(token,stat) {
    const user = mustUser(token);
    if (!STATS.includes(stat)) throw new ApiError(400,'Unknown stat.');
    const day=today();
    write(() => {
      const run=currentRun(user.id,day);
      if (!run || !run.current_character_id) throw new ApiError(409,'Draw a character first.');
      if (run.submitted_at) throw new ApiError(409,'Lineup already submitted.');
      if (db.prepare('SELECT 1 FROM daily_picks WHERE user_id=? AND day=? AND stat=?')
        .get(user.id,day,stat)) throw new ApiError(409,'That stat is already assigned.');
      db.prepare('INSERT INTO daily_picks(user_id,day,stat,character_id,picked_at) ' +
        'VALUES(?,?,?,?,?)').run(user.id,day,stat,run.current_character_id,time());
      db.prepare('UPDATE daily_runs SET current_character_id=NULL WHERE user_id=? AND day=?')
        .run(user.id,day);
    });
    return state(token);
  }
  function submit(token) {
    const user=mustUser(token);
    const day=today();
    write(() => {
      const run=currentRun(user.id,day);
      if (!run) throw new ApiError(409,'No lineup started.');
      if (run.submitted_at) return;
      const n=db.prepare('SELECT count(*) AS n FROM daily_picks WHERE user_id=? AND day=?')
        .get(user.id,day).n;
      if (n!==6 || run.current_character_id) {
        throw new ApiError(409,'Assign six different characters before submitting.');
      }
      db.prepare('UPDATE daily_runs SET submitted_at=? WHERE user_id=? AND day=?')
        .run(time(),user.id,day);
    });
    return state(token);
  }
  function leaderboard(period='weekly') {
    settlePending();
    if (!['weekly','monthly','alltime'].includes(period)) {
      throw new ApiError(400,'Invalid leaderboard period.');
    }
    const day=today();
    let from='0001-01-01';
    if (period==='monthly') from=day.slice(0,7)+'-01';
    if (period==='weekly') {
      const d=new Date(day+'T12:00:00Z');
      const diff=(d.getUTCDay()+6)%7;
      d.setUTCDate(d.getUTCDate()-diff);
      from=d.toISOString().slice(0,10);
    }
    const rows=db.prepare(
      'SELECT u.username AS handle,coalesce(sum(m.points),0) AS score,' +
      'count(m.day) AS matches FROM users u LEFT JOIN (' +
      'SELECT user_a AS user_id,day,points_a AS points FROM matchups WHERE day>=? ' +
      'UNION ALL SELECT user_b AS user_id,day,points_b AS points FROM matchups WHERE day>=?' +
      ') m ON m.user_id=u.id GROUP BY u.id ' +
      'ORDER BY score DESC,matches DESC,u.username_key ASC LIMIT 100'
    ).all(from,from);
    return rows.map((r,i)=>({...r,rank:i+1}));
  }
  return {
    register,login,logout,state,draw,assign,submit,leaderboard,settlePending,
    getUser:userForToken,cleanup:clearExpiredSessions,today,
    close:()=>db.close()
  };
}
module.exports={makeGame,ApiError,istanbulDay,STATS};
