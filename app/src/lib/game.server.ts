import { bindings } from './bindings.server'
import type { D1Database } from '@cloudflare/workers-types'

export const STATS = ['strength', 'dexterity', 'battle_iq', 'endurance', 'hacks', 'iq'] as const
export type Stat = (typeof STATS)[number]
type User = { id: string; handle: string }
type Character = { id: string; name: string; universe: string; portrait_url: string; strength: number; dexterity: number; battle_iq: number; endurance: number; hacks: number; iq: number }
type Pick = { stat: Stat; character_id: string; name: string; universe: string; portrait_url: string }
const SESSION_COOKIE = 'statclash_session'
const SESSION_SECONDS = 60 * 60 * 24 * 30

function database(): D1Database {
  const db = bindings().DB
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED')
  return db
}
function utcIso() { return new Date().toISOString() }
export function localDay(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const grab = (key: string) => parts.find(p => p.type === key)?.value ?? ''
  return `${grab('year')}-${grab('month')}-${grab('day')}`
}
function monday(day: string): string {
  const date = new Date(day + 'T12:00:00Z')
  const n = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - n)
  return date.toISOString().slice(0, 10)
}
function randomIndex(max: number): number {
  if (max < 1) throw new Error('NO_CHARACTERS')
  const range = 2 ** 32
  const bound = range - range % max
  const bytes = new Uint32Array(1)
  do { crypto.getRandomValues(bytes) } while (bytes[0] >= bound)
  return bytes[0] % max
}
function bytesToBase64(a: Uint8Array): string {
  return btoa(Array.from(a, x => String.fromCharCode(x)).join(''))
}
async function hashText(value: string) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToBase64(new Uint8Array(result))
}
async function passwordHash(password: string, salt: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(atob(salt), x => x.charCodeAt(0)), iterations: 110000, hash: 'SHA-256' }, material, 256)
  return bytesToBase64(new Uint8Array(derived))
}
function randomToken(bytes = 32) { const b = crypto.getRandomValues(new Uint8Array(bytes)); return bytesToBase64(b).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') }
function cookieToken(request: Request) {
  const cookie = request.headers.get('cookie') || ''
  return cookie.split(';').map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1)
}
export async function currentUser(request: Request): Promise<User | null> {
  const token = cookieToken(request)
  if (!token || token.length < 32 || token.length > 100) return null
  return database().prepare('SELECT u.id, u.handle FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hashText(token), utcIso()).first<User>()
}
function sessionCookie(token: string) { return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax` }
function clearCookie() { return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` }
function httpError(status: number, message: string) { return Response.json({ error: message }, { status }) }
function allowedOrigin(request: Request) {
  const origin = request.headers.get('Origin')
  return !origin || origin === new URL(request.url).origin
}
async function authLimit(request: Request, operation: string) {
  const db = database()
  const ip = request.headers.get('CF-Connecting-IP') || 'unidentified'
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const count = await db.prepare('SELECT COUNT(*) as count FROM auth_attempts WHERE ip=? AND operation=? AND at>?').bind(ip, operation, oneHourAgo).first<{ count: number }>()
  if ((count?.count ?? 0) >= (operation === 'register' ? 6 : 25)) throw new Error('TOO_MANY_ATTEMPTS')
  await db.prepare('INSERT INTO auth_attempts (ip, operation, at) VALUES (?,?,?)').bind(ip, operation, utcIso()).run()
}
export async function authAction(request: Request, operation: string, body: Record<string, unknown>): Promise<Response> {
  if (!allowedOrigin(request)) return httpError(403, 'Invalid origin')
  const db = database()
  if (operation === 'logout') {
    const token = cookieToken(request)
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashText(token)).run()
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'Set-Cookie': clearCookie() } })
  }
  if (operation !== 'login' && operation !== 'register') return httpError(400, 'Unknown action')
  const handle = typeof body.handle === 'string' ? body.handle.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) return httpError(400, 'Username must be 3–20 letters, numbers or underscores')
  if (password.length < 8 || password.length > 72) return httpError(400, 'Password must be 8–72 characters')
  try { await authLimit(request, operation) } catch { return httpError(429, 'Too many requests. Try again later.') }
  let user: User
  if (operation === 'register') {
    const existing = await db.prepare('SELECT id FROM users WHERE handle=?').bind(handle).first()
    if (existing) return httpError(409, 'Username already in use')
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
    const id = crypto.randomUUID()
    try {
      await db.prepare('INSERT INTO users(id,handle,salt,password_hash,created_at) VALUES (?,?,?,?,?)').bind(id, handle, salt, await passwordHash(password, salt), utcIso()).run()
    } catch { return httpError(409, 'Username already in use') }
    user = { id, handle }
  } else {
    const record = await db.prepare('SELECT id, handle, salt, password_hash FROM users WHERE handle=?').bind(handle).first<User & { salt: string; password_hash: string }>()
    if (!record || await passwordHash(password, record.salt) !== record.password_hash) return httpError(401, 'Invalid username or password')
    user = { id: record.id, handle: record.handle }
  }
  const token = randomToken()
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await hashText(token), user.id, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString()).run()
  return new Response(JSON.stringify({ ok: true, user }), { headers: { 'content-type': 'application/json', 'Set-Cookie': sessionCookie(token), 'Cache-Control': 'no-store' } })
}
async function candidate(db: D1Database, userId: string, day: string) {
  const candidates = (await db.prepare("SELECT id FROM characters WHERE active=1 AND id NOT IN (SELECT character_id FROM daily_picks WHERE user_id=? AND day=?) ORDER BY id").bind(userId, day).all<{ id: string }>()).results
  return candidates.length ? candidates[randomIndex(candidates.length)].id : null
}
export async function draftAction(request: Request, operation: string, body: Record<string, unknown>): Promise<Response> {
  if (!allowedOrigin(request)) return httpError(403, 'Invalid origin')
  const user = await currentUser(request)
  if (!user) return httpError(401, 'Sign in to play')
  const db = database(); const day = localDay()
  const draft = await db.prepare('SELECT current_character_id, submitted_at FROM daily_drafts WHERE user_id=? AND day=?').bind(user.id, day).first<{ current_character_id: string | null; submitted_at: string | null }>()
  if (operation === 'draw') {
    if (draft) return Response.json({ ok: true })
    const character = await candidate(db, user.id, day)
    if (!character) return httpError(409, 'The character pool is empty')
    await db.prepare('INSERT OR IGNORE INTO daily_drafts(user_id,day,current_character_id,created_at) VALUES (?,?,?,?)').bind(user.id, day, character, utcIso()).run()
    return Response.json({ ok: true })
  }
  if (!draft) return httpError(409, 'Draw your first character')
  if (draft.submitted_at) return httpError(409, 'Today’s lineup has already been submitted')
  if (operation === 'assign') {
    const stat = body.stat
    if (typeof stat !== 'string' || !STATS.includes(stat as Stat)) return httpError(400, 'Invalid stat')
    if (!draft.current_character_id) return httpError(409, 'No current character')
    const assigned = await db.prepare('SELECT 1 FROM daily_picks WHERE user_id=? AND day=? AND stat=?').bind(user.id, day, stat).first()
    if (assigned) return httpError(409, 'Stat already filled')
    const picks = await db.prepare('SELECT stat FROM daily_picks WHERE user_id=? AND day=?').bind(user.id, day).all<{ stat: string }>()
    if (picks.results.length >= 6) return httpError(409, 'Lineup is full')
    // Never repeat the currently offered character; each account sees six distinct characters per day.
    const available = (await db.prepare('SELECT id FROM characters WHERE active=1 AND id != ? AND id NOT IN (SELECT character_id FROM daily_picks WHERE user_id=? AND day=?) ORDER BY id').bind(draft.current_character_id, user.id, day).all<{ id: string }>()).results
    const next = picks.results.length === 5 ? null : (available.length ? available[randomIndex(available.length)].id : null)
    if (picks.results.length < 5 && !next) return httpError(409, 'Not enough characters for a full lineup')
    try {
      await db.batch([
        db.prepare('INSERT INTO daily_picks(user_id,day,stat,character_id) VALUES (?,?,?,?)').bind(user.id, day, stat, draft.current_character_id),
        db.prepare('UPDATE daily_drafts SET current_character_id=? WHERE user_id=? AND day=? AND current_character_id=? AND submitted_at IS NULL').bind(next, user.id, day, draft.current_character_id),
      ])
    } catch { return httpError(409, 'This character has already been assigned. Refresh to continue.') }
    return Response.json({ ok: true })
  }
  if (operation === 'submit') {
    const count = await db.prepare('SELECT COUNT(*) as count FROM daily_picks WHERE user_id=? AND day=?').bind(user.id, day).first<{ count: number }>()
    if (count?.count !== 6) return httpError(409, 'Fill all six stats before submitting')
    await db.prepare('UPDATE daily_drafts SET submitted_at=? WHERE user_id=? AND day=? AND submitted_at IS NULL').bind(utcIso(), user.id, day).run()
    return Response.json({ ok: true })
  }
  return httpError(400, 'Unknown action')
}
function deterministicNumber(s: string) {
  let h = 2166136261
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
async function settleDay(db: D1Database, day: string) {
  const already = await db.prepare('SELECT 1 FROM settlements WHERE day=?').bind(day).first()
  if (already) return
  const players = (await db.prepare('SELECT d.user_id FROM daily_drafts d WHERE d.day=? AND d.submitted_at IS NOT NULL AND (SELECT COUNT(*) FROM daily_picks p WHERE p.user_id=d.user_id AND p.day=d.day)=6 ORDER BY d.user_id').bind(day).all<{ user_id: string }>()).results
  players.sort((a,b) => deterministicNumber(day+':'+a.user_id)-deterministicNumber(day+':'+b.user_id))
  const ids = players.map(p => p.user_id)
  const allPicks = (await db.prepare('SELECT p.user_id, p.stat, p.character_id, c.strength, c.dexterity, c.battle_iq, c.endurance, c.hacks, c.iq FROM daily_picks p JOIN characters c ON c.id=p.character_id WHERE p.day=?').bind(day).all<{user_id:string;stat:Stat;character_id:string}&Record<Stat,number>>()).results
  const byUser = new Map<string, Map<Stat, typeof allPicks[number]>>()
  for (const pick of allPicks) { if (!byUser.has(pick.user_id)) byUser.set(pick.user_id,new Map()); byUser.get(pick.user_id)!.set(pick.stat,pick) }
  const statements: ReturnType<D1Database['prepare']>[] = []
  let rows = 0
  for (let i=0;i+1<ids.length;i+=2) {
    const p1=ids[i],p2=ids[i+1]
    for (const stat of STATS) {
      const a=byUser.get(p1)?.get(stat);const b=byUser.get(p2)?.get(stat)
      if (!a||!b) continue
      const winner = a[stat]===b[stat] ? null : (a[stat]>b[stat]?p1:p2)
      statements.push(db.prepare('INSERT OR IGNORE INTO stat_matchups(id,day,p1,p2,stat,p1_character,p2_character,p1_value,p2_value,winner_id,settled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(`${day}:${p1}:${p2}:${stat}`,day,p1,p2,stat,a.character_id,b.character_id,a[stat],b[stat],winner,utcIso()))
      rows++
    }
  }
  // D1 batch is transactional; deterministic IDs make retried settlements idempotent.
  for (let i=0;i<statements.length;i+=80) await db.batch(statements.slice(i,i+80))
  await db.prepare('INSERT OR IGNORE INTO settlements(day,settled_at,player_count,matchup_count) VALUES (?,?,?,?)').bind(day,utcIso(),ids.length,rows).run()
}
export async function settlePastDays() {
  const db=database(),today=localDay()
  const days = (await db.prepare('SELECT DISTINCT d.day FROM daily_drafts d WHERE d.day<? AND d.submitted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.day=d.day) ORDER BY d.day LIMIT 5').bind(today).all<{day:string}>()).results
  for(const {day} of days) await settleDay(db,day)
}
async function leaderboard(db:D1Database, period:'weekly'|'monthly'|'alltime', day:string) {
  const lower=period==='weekly'?monday(day):period==='monthly'?day.slice(0,7)+'-01':'0000-01-01'
  const r=await db.prepare("SELECT u.handle, u.id, COALESCE(w.score,0) AS score, COALESCE(w.played,0) AS matches FROM users u LEFT JOIN (SELECT winner_id AS user_id, COUNT(*) AS score, COUNT(DISTINCT day) AS played FROM stat_matchups WHERE winner_id IS NOT NULL AND day>=? GROUP BY winner_id) w ON w.user_id=u.id ORDER BY score DESC, played DESC, u.handle COLLATE NOCASE ASC LIMIT 50").bind(lower).all<{id:string;handle:string;score:number;matches:number}>()
  return r.results.map((x,i)=>({rank:i+1,handle:x.handle,score:x.score,matches:x.matches,id:x.id}))
}
export async function readGame(request: Request) {
  const db = database(), day=localDay()
  await settlePastDays()
  const user=await currentUser(request)
  const [weekly,monthly,alltime] = await Promise.all([leaderboard(db,'weekly',day),leaderboard(db,'monthly',day),leaderboard(db,'alltime',day)])
  const total=await db.prepare('SELECT COUNT(*) as n FROM characters WHERE active=1').first<{n:number}>()
  const participants=await db.prepare('SELECT COUNT(*) as n FROM daily_drafts WHERE day=? AND submitted_at IS NOT NULL').bind(day).first<{n:number}>()
  if (!user) return {day, user:null, totalCharacters:total?.n??0, participants:participants?.n??0, leaderboards:{weekly,monthly,alltime}, picks:[],current:null,submitted:false,needsDraw:false,history:[]}
  const draft=await db.prepare('SELECT current_character_id, submitted_at FROM daily_drafts WHERE user_id=? AND day=?').bind(user.id,day).first<{current_character_id:string|null;submitted_at:string|null}>()
  const picks=(await db.prepare('SELECT p.stat,p.character_id,c.name,c.universe,c.portrait_url FROM daily_picks p JOIN characters c ON c.id=p.character_id WHERE p.user_id=? AND p.day=?').bind(user.id,day).all<Pick>()).results
  const currentRaw=draft?.current_character_id ? await db.prepare('SELECT id,name,universe,portrait_url FROM characters WHERE id=?').bind(draft.current_character_id).first<{id:string;name:string;universe:string;portrait_url:string}>() : null
  const current=currentRaw
  const history=(await db.prepare('SELECT m.day,m.stat,m.p1_value,m.p2_value,m.winner_id,m.p1,m.p2,c1.name as left_name,c2.name as right_name,c1.portrait_url as left_image,c2.portrait_url as right_image,u1.handle as left_handle,u2.handle as right_handle FROM stat_matchups m JOIN characters c1 ON c1.id=m.p1_character JOIN characters c2 ON c2.id=m.p2_character JOIN users u1 ON u1.id=m.p1 JOIN users u2 ON u2.id=m.p2 WHERE m.p1=? OR m.p2=? ORDER BY m.day DESC,m.stat LIMIT 84').bind(user.id,user.id).all()).results
  return {day,user,totalCharacters:total?.n??0,participants:participants?.n??0,leaderboards:{weekly,monthly,alltime},picks,current,submitted:!!draft?.submitted_at,needsDraw:!draft,history}
}
export async function gameRoute(request: Request) {
  try {
    if (request.method==='GET') return Response.json(await readGame(request),{headers:{'Cache-Control':'private, no-store'}})
    if (request.method!=='POST') return httpError(405,'Method not allowed')
    if ((request.headers.get('content-length')??'').match(/^\d+$/) && Number(request.headers.get('content-length'))>4096) return httpError(413,'Request too large')
    const body=await request.json() as Record<string,unknown>
    const action=typeof body.action==='string'?body.action:''
    if(['register','login','logout'].includes(action)) return await authAction(request,action,body)
    return await draftAction(request,action,body)
  } catch(error) {
    console.error('gameRoute',error)
    return httpError(500,'Server error. Please retry.')
  }
}
