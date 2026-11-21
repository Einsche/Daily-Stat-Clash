'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeGame,istanbulDay}=require('../game.js');
const {createApp,ROOT}=require('../index.js');

const STATS=['strength','dexterity','battle_iq','endurance','hacks','iq'];
function createTestDb() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-test-'));
  return {dir,dbPath:path.join(dir,'test.sqlite')};
}
function cleanup(dir) {fs.rmSync(dir,{recursive:true,force:true});}

test('Istanbul day calculation crosses UTC 21:00',()=>{
  assert.equal(istanbulDay(new Date('2026-11-22T20:59:59Z')),'2026-11-22');
  assert.equal(istanbulDay(new Date('2026-11-22T21:00:00Z')),'2026-11-23');
});

test('persistent multiuser registration, password, six draws, settlement and history',async()=>{
  const {dir,dbPath}=createTestDb();
  let now=new Date('2026-11-22T13:00:00Z');
  let game=makeGame({dbPath,clock:()=>now});
  try{
    assert.equal(game.state().totalCharacters,101);
    const alice=await game.register('AlicePlayer','ALongPassword!2026');
    const bob=await game.register('BobPlayer','AnotherLongPassword2026');
    assert.match(alice.token,/^[0-9a-f]{64}$/);
    assert.notEqual(alice.token,bob.token);
    assert.equal(game.state().user,null);
    assert.deepEqual(game.state().picks,[]);
    await assert.rejects(game.register('ALICEPLAYER','ALongPassword!2026'),{status:409});
    await assert.rejects(game.login('AlicePlayer','WrongPassword111'),{status:401});
    const aliceLogin=await game.login('aliceplayer','ALongPassword!2026');
    assert.equal(aliceLogin.user.handle,'AlicePlayer');
    assert.notEqual(aliceLogin.token,alice.token);

    for(const account of [aliceLogin,bob]){
      const seen=new Set();
      for(let i=0;i<STATS.length;i++){
        let state=game.draw(account.token);
        assert.ok(state.current);
        assert.ok(!seen.has(state.current.id),'One character must not repeat in a day');
        assert.equal(state.current.strength,undefined,'Hidden values must not be sent to the client');
        seen.add(state.current.id);
        const repeat=game.draw(account.token);
        assert.equal(repeat.current.id,state.current.id,'A draw remains stable until assigned');
        state=game.assign(account.token,STATS[i]);
        assert.equal(state.picks.length,i+1);
        assert.equal(state.current,null);
      }
      assert.equal(game.submit(account.token).submitted,true);
      assert.throws(()=>game.draw(account.token),{status:409});
      assert.throws(()=>game.assign(account.token,'strength'),{status:409});
    }
    assert.equal(game.state(aliceLogin.token).participants,2);
    assert.equal(game.state(aliceLogin.token).history.length,0);
    // Istanbul midnight, 21:00 UTC
    now=new Date('2026-11-22T21:00:20Z');
    assert.equal(game.settlePending(),1);
    assert.equal(game.settlePending(),0,'Settlement must be idempotent');
    const a=game.state(aliceLogin.token),b=game.state(bob.token);
    assert.equal(a.history.length,1);
    assert.equal(b.history.length,1);
    assert.equal(a.history[0].details.length,6);
    assert.equal(b.history[0].details.length,6);
    assert.equal(a.history[0].self_points,b.history[0].opponent_points);
    assert.ok(a.history[0].self_points>=0 && a.history[0].self_points<=6);
    assert.equal(game.leaderboard('alltime').length,2);
    assert.equal(game.leaderboard('alltime')[0].score>=game.leaderboard('alltime')[1].score,true);
    assert.deepEqual(game.state(aliceLogin.token).picks,[],'New day resets picks');

    game.logout(aliceLogin.token);
    assert.equal(game.getUser(aliceLogin.token),null);
    assert.equal(game.getUser(alice.token).username,'AlicePlayer','Other sessions are unaffected');
    game.close();
    game=makeGame({dbPath,clock:()=>now});
    const restored=game.state(bob.token);
    assert.equal(restored.history.length,1,'Data persists across a full restart');
    assert.equal(restored.totalCharacters,101);
    assert.equal((await game.login('AlicePlayer','ALongPassword!2026')).user.handle,'AlicePlayer');
  }finally{game.close();cleanup(dir);}
});

test('username login rate limit and invalid inputs',async()=>{
  const {dir,dbPath}=createTestDb();
  const game=makeGame({dbPath});
  try{
    await assert.rejects(game.register('x','SomePassword111'),{status:400});
    await assert.rejects(game.register('OkayHandle','short'),{status:400});
    await game.register('LockTest','LongSecurePassword2026');
    for(let i=0;i<8;i++)await assert.rejects(game.login('LockTest','incorrectPassword'),{status:401});
    await assert.rejects(game.login('LockTest','LongSecurePassword2026'),{status:429});
    assert.throws(()=>game.draw(null),{status:401});
    assert.throws(()=>game.assign('a'.repeat(64),'iq'),{status:401});
  }finally{game.close();cleanup(dir);}
});

test('public HTTP frontend, API, login and strict CORS',async()=>{
  const {dir,dbPath}=createTestDb();
  const game=makeGame({dbPath});
  const {server}=createApp({game,allowedOrigin:'https://einsche.github.io'});
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+ROOT;
    const health=await fetch(url+'/api/health');
    assert.equal(health.status,200);
    assert.equal((await health.json()).backend,'sqlite');
    const home=await fetch(url+'/');
    const html=await home.text();
    assert.equal(home.status,200);
    assert.ok(html.includes('USERNAME'));
    assert.ok(!html.includes('EMAIL ADDRESS'));
    const portrait=await fetch(url+'/app/public/assets/portraits/bren-pell.svg');
    assert.equal(portrait.status,200);
    assert.match(await portrait.text(),/<svg/);
    const publicBoard=await fetch(url+'/api/leaderboard?period=weekly');
    assert.equal(publicBoard.status,200);
    assert.deepEqual(await publicBoard.json(),[]);
    const invalidOrigin=await fetch(url+'/api/state',{headers:{Origin:'https://attacker.example'}});
    assert.equal(invalidOrigin.status,403);
    const accepted=await fetch(url+'/api/state',{headers:{Origin:'https://einsche.github.io'}});
    assert.equal(accepted.status,200);
    assert.equal(accepted.headers.get('access-control-allow-origin'),'https://einsche.github.io');

    const register=await fetch(url+'/api/auth/register',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:'HttpUser',password:'ExamplePassword2026'})
    });
    assert.equal(register.status,201);
    const account=await register.json();
    assert.equal(account.user.handle,'HttpUser');
    assert.ok(account.token);

    const drawn=await fetch(url+'/api/draw',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.token},
      body:'{}'
    });
    assert.equal(drawn.status,200);
    const card=await drawn.json();
    assert.ok(card.current);
    assert.equal(card.current.iq,undefined);
    assert.equal((await fetch(url+'/api/draw',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    game.close();cleanup(dir);
  }
});
