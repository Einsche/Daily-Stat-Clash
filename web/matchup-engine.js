/* Daily Stat Clash — deterministic, standalone local matchup rules.
 * Every pair plays six same-stat comparisons. Larger stat gets +1; tie = 0.
 * In three-guest local mode, everyone plays everyone (three matches total).
 * No server, account system, external libraries, or random outcome generation.
 */
(function(root,factory) {
  const result=factory();
  if(typeof module !== 'undefined' && module.exports)module.exports=result;
  if(root)root.DailyStatMatchups=result;
})(typeof window!=='undefined'?window:null,function() {
  'use strict';
  const STATS=Object.freeze(['strength','dexterity','battle_iq','endurance','hacks','iq']);
  function assertRound(round,scoreMap) {
    if(!round || !round.submitted || !Array.isArray(round.picks) || round.picks.length!==6)
      throw Error('Each participant must submit exactly six selections.');
    const stats=new Set(),characters=new Set();
    const byStat={};
    for(const pick of round.picks) {
      if(!STATS.includes(pick.stat) || stats.has(pick.stat))throw Error('Duplicate or invalid stat.');
      if(typeof pick.character_id!=='string' || characters.has(pick.character_id))
        throw Error('Duplicate or invalid character.');
      const character=scoreMap[pick.character_id];
      if(!character)throw Error('Unknown character in scoring data.');
      for(const field of STATS) {
        if(!Number.isInteger(character[field]) || character[field]<0 || character[field]>100)
          throw Error('Missing valid scoring values.');
      }
      stats.add(pick.stat);
      characters.add(pick.character_id);
      byStat[pick.stat]=pick;
    }
    return byStat;
  }
  function scorePair(a,b,roundA,roundB,scoreMap,day) {
    if(a.id===b.id)throw Error('A guest cannot play themselves.');
    const pickA=assertRound(roundA,scoreMap),pickB=assertRound(roundB,scoreMap);
    let pointsA=0,pointsB=0;
    const details=STATS.map(stat=>{
      const ca=pickA[stat].character_id,cb=pickB[stat].character_id;
      const va=scoreMap[ca][stat],vb=scoreMap[cb][stat];
      const winner=va>vb?'a':va<vb?'b':'tie';
      if(winner==='a')pointsA++;
      if(winner==='b')pointsB++;
      return {stat,characterA:ca,characterB:cb,valueA:va,valueB:vb,winner};
    });
    return {
      id:day+'|'+a.id+'|'+b.id,day,
      playerA:a.id,playerB:b.id,
      handleA:a.handle,handleB:b.handle,
      pointsA,pointsB,details
    };
  }
  function resolveLeague(day,guests,rounds,scoreMap) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid local day.');
    if(!Array.isArray(guests) || guests.length!==3 || new Set(guests.map(g=>g.id)).size!==3)
      throw Error('Exactly three unique guest profiles are needed.');
    for(const guest of guests)assertRound(rounds[guest.id],scoreMap);
    const matches=[];
    for(let i=0;i<guests.length;i++){
      for(let j=i+1;j<guests.length;j++) {
        matches.push(scorePair(guests[i],guests[j],
          rounds[guests[i].id],rounds[guests[j].id],scoreMap,day));
      }
    }
    return matches;
  }
  function leaderboard(guests,days,period,today) {
    if(!['weekly','monthly','alltime'].includes(period))throw Error('Unknown period');
    const firstDay=period==='monthly'?today.slice(0,7)+'-01':
      period==='weekly'?startOfWeek(today):'0001-01-01';
    const byId=new Map(guests.map(g=>[g.id,{id:g.id,handle:g.handle,points:0,score:0,matches:0,wins:0,losses:0,ties:0}]));
    for(const record of Object.values(days||{})) {
      if(!record || !record.resolvedAt || !Array.isArray(record.matches) ||
         record.day<firstDay || record.day>today)continue;
      for(const match of record.matches) {
        for(const [id,own,other] of [
          [match.playerA,match.pointsA,match.pointsB],
          [match.playerB,match.pointsB,match.pointsA]
        ]) {
          const p=byId.get(id);if(!p)continue;
          p.points+=own;
          p.score=p.points;
          p.matches++;
          if(own>other)p.wins++;
          else if(own<other)p.losses++;
          else p.ties++;
        }
      }
    }
    return [...byId.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||
      a.handle.localeCompare(b.handle)).map((p,i)=>({...p,rank:i+1}));
  }
  function startOfWeek(iso) {
    const d=new Date(iso+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
    return d.toISOString().slice(0,10);
  }
  return {STATS,assertRound,scorePair,resolveLeague,leaderboard,startOfWeek};
});
