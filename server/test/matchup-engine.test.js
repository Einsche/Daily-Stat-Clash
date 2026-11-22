'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../../web/matchup-engine.js');
const STATS=[...engine.STATS];
function chars(id,value) {
  return Object.fromEntries(STATS.map(k=>[k,value]));
}
const guests=[
  {id:'guest-1',handle:'Alpha'},
  {id:'guest-2',handle:'Beta'},
  {id:'guest-3',handle:'Gamma'}
];
const scoreMap={};
for(const [id,value] of [['a',65],['b',45],['c',80],['d',60],['e',70],['f',20],
  ['g',55],['h',45],['i',90],['j',60],['k',65],['l',20],
  ['m',90],['n',35],['o',70],['p',60],['q',85],['r',20]])scoreMap[id]=chars(id,value);
function round(ids) {
  return {submitted:true,picks:STATS.map((stat,i)=>({stat,character_id:ids[i]}))};
}
const rounds={
  'guest-1':round(['a','b','c','d','e','f']),
  'guest-2':round(['g','h','i','j','k','l']),
  'guest-3':round(['m','n','o','p','q','r'])
};

test('higher stat gets +1, equal values award zero for both sides',()=>{
  const result=engine.scorePair(guests[0],guests[1],
    rounds['guest-1'],rounds['guest-2'],scoreMap,'2026-11-22');
  assert.deepEqual([result.pointsA,result.pointsB],[2,1]);
  assert.deepEqual(result.details.map(x=>x.winner),['a','tie','b','tie','a','tie']);
  assert.equal(result.details.length,6);
  assert.equal(result.pointsA+result.pointsB,3,'Ties must not award points.');
});

test('three-guest local league creates exactly 3 head-to-head matches',()=>{
  const matches=engine.resolveLeague('2026-11-22',guests,rounds,scoreMap);
  assert.equal(matches.length,3);
  assert.deepEqual(matches.map(m=>[m.playerA,m.playerB]),[
    ['guest-1','guest-2'],['guest-1','guest-3'],['guest-2','guest-3']
  ]);
  assert.ok(matches.every(m=>m.details.length===6));
  assert.ok(matches.every(m=>m.pointsA<=6 && m.pointsB<=6));
  const days={'2026-11-22':{day:'2026-11-22',resolvedAt:1000,matches}};
  const rows=engine.leaderboard(guests,days,'alltime','2026-11-22');
  assert.equal(rows.length,3);
  assert.ok(rows.every(row=>row.matches===2),'Each guest should play both others.');
  assert.equal(rows.reduce((sum,x)=>sum+x.points,0),
    matches.reduce((sum,m)=>sum+m.pointsA+m.pointsB,0));
  assert.ok(rows[0].points>=rows[1].points && rows[1].points>=rows[2].points);
});

test('invalid and duplicate stat assignments are rejected before scoring',()=>{
  const duplicate=rounds['guest-1'].picks.map(x=>({...x}));
  duplicate[1].stat=duplicate[0].stat;
  assert.throws(()=>engine.resolveLeague('2026-11-22',guests,
    {...rounds,'guest-1':{submitted:true,picks:duplicate}},scoreMap),/Duplicate/);
  const duplicateChar=rounds['guest-1'].picks.map(x=>({...x}));
  duplicateChar[5].character_id=duplicateChar[0].character_id;
  assert.throws(()=>engine.scorePair(guests[0],guests[1],
    {submitted:true,picks:duplicateChar},rounds['guest-2'],scoreMap,'2026-11-22'),/Duplicate/);
});

test('weekly, monthly and all-time local boards filter by Istanbul game day',()=>{
  assert.equal(engine.startOfWeek('2026-11-22'),'2026-11-16');
  const matches=engine.resolveLeague('2026-11-22',guests,rounds,scoreMap);
  const days={
    '2026-11-22':{day:'2026-11-22',resolvedAt:1000,matches},
    '2026-10-31':{day:'2026-10-31',resolvedAt:1000,matches:matches.map(m=>({...m,day:'2026-10-31'}))}
  };
  const week=engine.leaderboard(guests,days,'weekly','2026-11-22');
  const month=engine.leaderboard(guests,days,'monthly','2026-11-22');
  const all=engine.leaderboard(guests,days,'alltime','2026-11-22');
  for(const i of [0,1,2]){
    assert.equal(week[i].matches,2);
    assert.equal(month[i].matches,2);
    assert.equal(all[i].matches,4);
    assert.equal(all[i].points,2*week[i].points);
  }
});
