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

class Element {
  constructor(tag='div'){
    this.tag=tag;
    this.id='';
    this.className='';
    this.textContent='';
    this.children=[];
    this.listeners=new Map();
    this.style={};
    this.hidden=false;
    this.disabled=false;
    this.dataset={};
    this.classList={
      toggle:(name,force)=>{
        const active=this.className.split(' ').filter(Boolean);
        const set=new Set(active);
        if(force===false)set.delete(name);
        else if(force===true)set.add(name);
        else if(set.has(name))set.delete(name);
        else set.add(name);
        this.className=[...set].join(' ');
      }
    };
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(event,callback){
    const handlers=this.listeners.get(event)||[];
    handlers.push(callback);this.listeners.set(event,handlers);
  }
  click(){
    if(this.disabled || this.hidden)return;
    for(const listener of this.listeners.get('click')||[]){
      listener({target:this});
    }
  }
  removeAttribute(name){if(name==='src')this.src='';}
  scrollIntoView(){}
}

function mount(storage,clock) {
  const ids=new Map(
    [...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()])
  );
  for(const [id,node] of ids)node.id=id;
  const created=[];
  const boards=['weekly','monthly','alltime'].map(period=>{
    const e=new Element('button');e.dataset.period=period;
    if(period==='weekly')e.className='board-tab active';
    return e;
  });
  const characterDetails=new Element('div');
  const document={
    baseURI:'https://einsche.github.io/Daily-Stat-Clash/',
    createElement(tag){const element=new Element(tag);created.push(element);return element;},
    createTextNode(text){const element=new Element('#text');element.textContent=String(text);return element;},
    getElementById(id){return ids.get(id)||created.find(e=>e.id===id)||null;},
    querySelector(selector){
      if(selector==='.draw-panel .character-details')return characterDetails;
      throw Error('Unexpected query selector '+selector);
    },
    querySelectorAll(selector){
      if(selector==='.board-tab')return boards;
      throw Error('Unexpected query selector '+selector);
    }
  };
  const intervals=[];
  class FakeDate extends Date {
    constructor(...args){super(...(args.length?args:[clock.now]));}
    static now(){return clock.now;}
  }
  const context={
    document,window:{crypto:webcrypto},
    localStorage:storage,
    Date:FakeDate,Intl,URL,
    Uint32Array,Math,Set,Map,Promise,console,
    setInterval(fn){intervals.push(fn);return intervals.length;},
    setTimeout(){return 1;},
    clearTimeout(){},
    fetch:async()=>({ok:true,json:async()=>roster}),
  };
  vm.runInNewContext(app,context,{filename:'web/app.js',timeout:3000});
  return {document,ids,boards,characterDetails,intervals};
}
function storage(){
  const data=new Map();
  return {
    getItem(key){return data.get(key)??null;},
    setItem(key,value){data.set(key,String(value));},
    removeItem(key){data.delete(key);}
  };
}
function saved(suffix,store){
  return JSON.parse(store.getItem('daily-stat-clash.guest.'+suffix+'.v1'));
}
async function flush(){await new Promise(setImmediate);}

test('guest button creates a persistent random name, without registration',async()=>{
  const cache=storage();
  const clock={now:Date.parse('2026-11-22T13:00:00Z')};
  const page=mount(cache,clock);
  await flush();
  assert.equal(page.ids.get('guest-start').textContent,'PLAY AS GUEST ↗');
  assert.equal(page.document.getElementById('auth-dialog'),null);
  page.ids.get('guest-start').click();
  const first=saved('player',cache);
  assert.match(first.handle,/^[A-Za-z]{4,25}_[0-9]{4}$/);
  assert.ok(page.ids.get('user-handle').textContent.includes(first.handle));
  page.ids.get('guest-start').click();
  const second=saved('player',cache);
  assert.notEqual(first.handle,second.handle,'Pressing again generates a different name');
  const reopened=mount(cache,clock);
  await flush();
  assert.equal(reopened.ids.get('user-handle').textContent,'@'+second.handle);
  assert.equal(reopened.ids.get('guest-start').textContent,'NEW RANDOM NAME ↻');
});

test('six unique local picks persist, submit locks and next Istanbul day resets',async()=>{
  const cache=storage();
  const clock={now:Date.parse('2026-11-22T13:00:00Z')};
  const page=mount(cache,clock);
  await flush();
  page.ids.get('guest-start').click();
  const picked=new Set();
  for(let i=0;i<6;i++){
    const button=page.document.getElementById('draw-character');
    assert.equal(button.disabled,false);
    button.click();
    const progress=saved('round',cache);
    assert.ok(progress.current);
    assert.ok(!picked.has(progress.current.id));
    picked.add(progress.current.id);
    const grid=page.ids.get('stat-grid');
    grid.children[i].click();
    assert.equal(saved('round',cache).picks.length,i+1);
  }
  assert.equal(picked.size,6);
  assert.equal(page.ids.get('submit-lineup').disabled,false);
  page.ids.get('submit-lineup').click();
  assert.equal(page.ids.get('confirm-backdrop').hidden,false);
  page.ids.get('confirm-submit').click();
  const submitted=saved('round',cache);
  assert.equal(submitted.submitted,true);
  assert.equal(submitted.picks.length,6);
  assert.equal(page.document.getElementById('draw-character').hidden,true);
  const history=saved('history',cache);
  assert.equal(history.length,1);
  assert.equal(history[0].day,'2026-11-22');
  assert.equal(history[0].picks.length,6);
  assert.equal(page.ids.get('leaderboard-rows').children[0].textContent.includes('unavailable'),true);

  const reopened=mount(cache,clock);
  await flush();
  assert.equal(reopened.ids.get('submit-lineup').disabled,true);
  assert.equal(reopened.ids.get('progress-fill').style.width,'100%');
  clock.now=Date.parse('2026-11-22T21:00:01Z');
  reopened.intervals.forEach(f=>f());
  assert.equal(saved('round',cache).day,'2026-11-23');
  assert.equal(saved('round',cache).picks.length,0);
  assert.equal(saved('history',cache).length,1,'Past submissions survive day rollover');
  assert.equal(reopened.ids.get('submit-lineup').disabled,true);
});
