'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const app=fs.readFileSync(path.join(ROOT,'web/app.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'web/index.html'),'utf8');
const roster=JSON.parse(fs.readFileSync(path.join(ROOT,'web/guest-roster.json'),'utf8'));
const scoring=JSON.parse(fs.readFileSync(path.join(ROOT,'web/guest-score-map.json'),'utf8'));
const engine=require('../../web/matchup-engine.js');
const KEY='daily-stat-clash.local3.v1';
const STATS=['strength','dexterity','battle_iq','endurance','hacks','iq'];
const DAY='2026-11-22';

class Element {
  constructor(tag='div') {
    this.tagName=tag;this.id='';this.className='';this.textContent='';
    this.hidden=false;this.disabled=false;this.dataset={};this.style={};
    this.children=[];this.listeners=new Map();
    this.classList={
      toggle:(name,on)=>{
        const names=new Set(this.className.split(' ').filter(Boolean));
        if(on===true)names.add(name);
        else if(on===false)names.delete(name);
        else if(names.has(name))names.delete(name);
        else names.add(name);
        this.className=[...names].join(' ');
      }
    };
  }
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(type,fn) {
    const arr=this.listeners.get(type)||[];arr.push(fn);this.listeners.set(type,arr);
  }
  click() {
    if(this.disabled || this.hidden)return;
    for(const fn of this.listeners.get('click')||[])fn({target:this});
  }
  scrollIntoView(){}
  removeAttribute(name){if(name==='src')this.src='';}
}
function storage() {
  const values=new Map();
  return {
    getItem(key){return values.get(key)||null;},
    setItem(key,v){values.set(key,String(v));},
    removeItem(key){values.delete(key);}
  };
}
function persisted(store){return JSON.parse(store.getItem(KEY));}
function mount(store,clock,{deferData=false}={}) {
  const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  for(const [id,e] of ids)e.id=id;
  const created=[], intervals=[];
  const buttons=['weekly','monthly','alltime'].map(p=>{
    const node=new Element('button');
    node.dataset.period=p;node.className='board-tab';
    return node;
  });
  const details=new Element('div');
  const display=new Element('div');
  const doc={
    baseURI:'https://einsche.github.io/Daily-Stat-Clash/',
    createElement(type){const e=new Element(type);created.push(e);return e;},
    createTextNode(content){const e=new Element('#text');e.textContent=String(content);return e;},
    getElementById(id){return ids.get(id)||created.find(e=>e.id===id)||null;},
    querySelector(selector){
      if(selector==='.draw-panel .character-details')return details;
      if(selector==='.character-display')return display;
      throw Error('Unexpected selector '+selector);
    },
    querySelectorAll(selector) {
      if(selector==='.board-tab')return buttons;
      throw Error('Unexpected list selector '+selector);
    }
  };
  class FakeDate extends Date {
    constructor(...args){super(...(args.length?args:[clock.now]));}
    static now(){return clock.now;}
  }
  let done;
  const context={
    document:doc,window:{crypto:webcrypto,DailyStatMatchups:engine},
    localStorage:store,
    Date:FakeDate,Intl,URL,Uint32Array,Math,Set,Map,Promise,Object,console,
    setInterval(fn){intervals.push(fn);return intervals.length;},
    setTimeout(){return 1;},clearTimeout(){},
    fetch:deferData?()=>new Promise(resolve=>{
      if(!done)done=[];
      done.push(resolve);
      if(done.length===2) {
        done[0]({ok:true,json:async()=>roster});
        done[1]({ok:true,json:async()=>scoring});
      }
    }):async url=>{
      const name=String(url);
      return {ok:true,json:async()=>name.includes('guest-score-map')?scoring:roster};
    }
  };
  vm.runInNewContext(app,context,{filename:'app.js',timeout:4000});
  return {ids,doc,buttons,intervals};
}
async function flush(){await new Promise(setImmediate);await new Promise(setImmediate);}
function clickGuestSlot(page,index) {
  page.ids.get('guest-switcher').children[index].click();
}
function fillCurrentGuest(page,store) {
  const active=persisted(store).activeId;
  for(let i=0;i<6;i++){
    const league=persisted(store);
    const round=league.days[DAY].rounds[active];
    assert.ok(round.current,'Each selection auto-draws the next character.');
    const current=round.current.id;
    assert.match(current,/^(hxh|naruto|dc|marvel|witcher|jjk|aot|bleach)-/);
    page.ids.get('stat-grid').children[i].click();
    const after=persisted(store).days[DAY].rounds[active];
    assert.equal(after.picks.length,i+1);
    if(i<5)assert.notEqual(after.current?.id,current);
  }
  assert.equal(page.ids.get('submit-lineup').disabled,false);
  page.ids.get('submit-lineup').click();
  assert.equal(page.ids.get('confirm-backdrop').hidden,false);
  page.ids.get('confirm-submit').click();
  const round=persisted(store).days[DAY].rounds[active];
  assert.equal(round.submitted,true);
  assert.equal(round.picks.length,6);
  return round;
}

test('one device creates and switches three independently persisted guests',async()=>{
  const store=storage(),clock={now:Date.parse('2026-11-22T13:00:00Z')};
  const page=mount(store,clock);
  await flush();
  assert.equal(page.ids.get('guest-start').textContent,'CREATE GUEST 1 ↗');
  page.ids.get('guest-start').click();
  const first=persisted(store);
  assert.equal(first.profiles.length,1);
  assert.match(first.profiles[0].handle,/^[A-Za-z]{4,25}_[0-9]{4}$/);
  assert.ok(first.days[DAY].rounds['guest-1'].current);
  const firstId=first.days[DAY].rounds['guest-1'].current.id;
  page.ids.get('stat-grid').children[0].click();
  assert.equal(persisted(store).days[DAY].rounds['guest-1'].picks.length,1);

  page.ids.get('guest-start').click();
  let current=persisted(store);
  assert.equal(current.profiles.length,2,'Second guest must be created, not rename first.');
  assert.notEqual(current.profiles[0].handle,current.profiles[1].handle);
  assert.equal(current.activeId,'guest-2');
  assert.equal(current.days[DAY].rounds['guest-2'].picks.length,0);
  assert.ok(current.days[DAY].rounds['guest-2'].current);
  page.ids.get('stat-grid').children[1].click();
  assert.equal(persisted(store).days[DAY].rounds['guest-2'].picks.length,1);
  assert.equal(persisted(store).days[DAY].rounds['guest-1'].picks.length,1);

  page.ids.get('guest-start').click();
  current=persisted(store);
  assert.equal(current.profiles.length,3);
  assert.equal(new Set(current.profiles.map(p=>p.handle)).size,3);
  assert.equal(current.activeId,'guest-3');
  assert.equal(page.ids.get('guest-start').disabled,true);
  assert.equal(page.ids.get('guest-switcher').children.length,3);
  clickGuestSlot(page,0);
  assert.equal(persisted(store).activeId,'guest-1');
  assert.equal(page.ids.get('stat-grid').children.length,6);
  assert.equal(persisted(store).days[DAY].rounds['guest-1'].picks.length,1);
  assert.notEqual(persisted(store).days[DAY].rounds['guest-1'].current?.id,firstId);
  const reopened=mount(store,clock);
  await flush();
  assert.equal(reopened.ids.get('guest-count').textContent,'3 / 3 GUESTS');
  assert.equal(persisted(store).profiles.length,3);
  assert.equal(reopened.ids.get('guest-start').disabled,true);
});

test('all three guests submit six cards and see exactly three scored pairwise matches',async()=>{
  const store=storage(),clock={now:Date.parse('2026-11-22T13:00:00Z')};
  const page=mount(store,clock);
  await flush();
  for(let i=0;i<3;i++){
    page.ids.get('guest-start').click();
    fillCurrentGuest(page,store);
  }
  const before=persisted(store);
  assert.equal(before.profiles.length,3);
  assert.equal(before.days[DAY].resolvedAt,null);
  assert.equal(page.ids.get('resolve-matches').disabled,false);
  page.ids.get('resolve-matches').click();
  const after=persisted(store);
  const matches=after.days[DAY].matches;
  assert.equal(matches.length,3);
  assert.ok(after.days[DAY].resolvedAt);
  assert.equal(page.ids.get('matchup-results').children.length,3);
  for(const match of matches){
    assert.equal(match.details.length,6);
    assert.equal(match.pointsA+match.pointsB,
      match.details.filter(d=>d.winner!=='tie').length);
    let a=0,b=0;
    for(const detail of match.details){
      const va=scoring.stats[detail.characterA][detail.stat];
      const vb=scoring.stats[detail.characterB][detail.stat];
      assert.equal(detail.valueA,va);
      assert.equal(detail.valueB,vb);
      if(va>vb)a++;
      if(vb>va)b++;
    }
    assert.equal(match.pointsA,a);
    assert.equal(match.pointsB,b);
  }
  assert.equal(page.ids.get('leaderboard-rows').children.length,3);
  assert.equal(page.ids.get('history-list').children.length,2);
  assert.equal(page.ids.get('resolve-matches').hidden,true);
  const same=JSON.stringify(persisted(store).days[DAY].matches);
  page.ids.get('resolve-matches').click();
  assert.equal(JSON.stringify(persisted(store).days[DAY].matches),same,'Resolution is idempotent.');
  const reopened=mount(store,clock);
  await flush();
  assert.equal(reopened.ids.get('matchup-results').children.length,3);
  assert.equal(reopened.ids.get('history-list').children.length,2);
});

test('unsubmitted third guest blocks early settlement; Istanbul midnight settles submitted league',async()=>{
  const store=storage(),clock={now:Date.parse('2026-11-22T13:00:00Z')};
  const page=mount(store,clock);
  await flush();
  for(let i=0;i<3;i++){
    page.ids.get('guest-start').click();
    if(i<2)fillCurrentGuest(page,store);
  }
  assert.equal(page.ids.get('resolve-matches').disabled,true);
  fillCurrentGuest(page,store);
  assert.equal(page.ids.get('resolve-matches').disabled,false);
  clock.now=Date.parse('2026-11-22T21:00:03Z');
  for(const interval of page.intervals)interval();
  const l=persisted(store);
  assert.ok(l.days[DAY].resolvedAt,'Istanbul midnight must settle yesterday.');
  assert.equal(l.days[DAY].matches.length,3);
  assert.equal(l.days['2026-11-23'].rounds[l.activeId].picks.length,0);
  assert.ok(l.days['2026-11-23'].rounds[l.activeId].current);
  assert.equal(page.ids.get('history-list').children.length,2);
});

test('legacy local single guest migrates into first of the three slots',async()=>{
  const store=storage(),clock={now:Date.parse('2026-11-22T13:00:00Z')};
  store.setItem('daily-stat-clash.guest.player.v1',JSON.stringify({
    handle:'IronFalcon_4827',createdAt:1
  }));
  store.setItem('daily-stat-clash.guest.round.v1',JSON.stringify({
    day:DAY,submitted:false,picks:[{
      stat:'strength',character_id:'hxh-gon-freecss'
    }],current:{id:'dc-batman'}
  }));
  const page=mount(store,clock);
  await flush();
  const l=persisted(store);
  assert.equal(l.profiles.length,1);
  assert.equal(l.profiles[0].handle,'IronFalcon_4827');
  assert.equal(l.days[DAY].rounds['guest-1'].picks.length,1);
  assert.equal(l.days[DAY].rounds['guest-1'].current.id,'dc-batman');
  page.ids.get('guest-start').click();
  assert.equal(persisted(store).profiles.length,2);
});


test('reset confirmation clears all three submitted lineups and same-day points, preserving guests',async()=>{
  const store=storage(),clock={now:Date.parse('2026-11-22T13:00:00Z')};
  const page=mount(store,clock);
  await flush();
  assert.equal(page.ids.get('reset-three').disabled,true,'Reset disabled before any guest exists');
  for(let i=0;i<3;i++){
    page.ids.get('guest-start').click();
    fillCurrentGuest(page,store);
  }
  assert.equal(page.ids.get('reset-three').disabled,false);
  page.ids.get('resolve-matches').click();
  const original=persisted(store);
  assert.equal(original.days[DAY].matches.length,3);
  assert.equal(original.days[DAY].resolvedAt>0,true);
  const names=original.profiles.map(p=>p.handle);
  const active=original.activeId;
  const scoreCount=page.ids.get('leaderboard-rows').children.length;
  assert.equal(scoreCount,3);
  page.ids.get('reset-three').click();
  assert.equal(page.ids.get('reset-backdrop').hidden,false);
  assert.equal(persisted(store).days[DAY].matches.length,3,
    'Clicking reset alone must not erase anything');
  page.ids.get('reset-cancel').click();
  assert.equal(page.ids.get('reset-backdrop').hidden,true);
  assert.equal(persisted(store).days[DAY].resolvedAt>0,true);
  page.ids.get('reset-three').click();
  page.ids.get('reset-confirm').click();
  const reset=persisted(store);
  assert.equal(page.ids.get('reset-backdrop').hidden,true);
  assert.deepEqual(reset.profiles.map(p=>p.handle),names);
  assert.equal(reset.activeId,active);
  assert.equal(reset.days[DAY].resolvedAt,null);
  assert.equal(reset.days[DAY].matches.length,0);
  for(const profile of reset.profiles){
    const round=reset.days[DAY].rounds[profile.id];
    assert.equal(round.submitted,false);
    assert.equal(round.picks.length,0);
    if(profile.id===active)assert.ok(round.current,'Active guest immediately gets a new card');
    else assert.equal(round.current,null,'Inactive guests remain fresh');
  }
  assert.equal(page.ids.get('resolve-matches').disabled,true);
  assert.equal(page.ids.get('matchup-results').children.length,1,'Old match cards disappear');
  assert.equal(page.ids.get('submit-lineup').disabled,true,'Submit is unlocked but needs 6 fresh picks');
  const reopened=mount(store,clock);
  await flush();
  assert.deepEqual(persisted(store).profiles.map(p=>p.handle),names);
  assert.equal(persisted(store).days[DAY].resolvedAt,null);
  for(const profile of reset.profiles){
    assert.equal(persisted(store).days[DAY].rounds[profile.id].submitted,false);
  }
  assert.equal(reopened.ids.get('reset-three').disabled,false);
});

test('reset preserves previous days and allows another full three-person calculation',async()=>{
  const store=storage(),clock={now:Date.parse('2026-11-22T13:00:00Z')};
  let page=mount(store,clock);
  await flush();
  for(let i=0;i<3;i++){
    page.ids.get('guest-start').click();
    fillCurrentGuest(page,store);
  }
  page.ids.get('resolve-matches').click();
  const snapshot=persisted(store);
  const oldDay='2026-11-21';
  const previousResult=JSON.parse(JSON.stringify(snapshot.days[DAY]));
  previousResult.day=oldDay;
  for(const match of previousResult.matches){
    match.day=oldDay;
    match.id=match.id.replace(DAY,oldDay);
  }
  snapshot.days[oldDay]=previousResult;
  store.setItem(KEY,JSON.stringify(snapshot));
  page=mount(store,clock);
  await flush();
  page.ids.get('reset-three').click();
  page.ids.get('reset-confirm').click();
  let league=persisted(store);
  assert.deepEqual(league.days[oldDay],previousResult,
    'Historical matches and scores must remain unchanged');
  assert.equal(league.days[DAY].matches.length,0);
  assert.equal(page.ids.get('leaderboard-rows').children.length,3,
    'Local leaderboard still includes previous results');
  for(let i=0;i<3;i++){
    clickGuestSlot(page,i);
    fillCurrentGuest(page,store);
  }
  assert.equal(page.ids.get('resolve-matches').disabled,false);
  page.ids.get('resolve-matches').click();
  league=persisted(store);
  assert.equal(league.days[DAY].matches.length,3,
    'Reset guests should be able to play all three matches again');
  assert.deepEqual(league.days[oldDay],previousResult);
});
