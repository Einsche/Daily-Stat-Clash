/* Daily Stat Clash — three separate guests on one device, local round-robin.
 * No server or login. All three independent lineups are stored in this browser.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const engine=window.DailyStatMatchups;
  if(!engine)throw Error('The Daily Stat Clash scoring engine did not load.');
  const STORAGE_KEY='daily-stat-clash.local3.v1';
  const LEGACY_PLAYER='daily-stat-clash.guest.player.v1';
  const LEGACY_ROUND='daily-stat-clash.guest.round.v1';
  const ROSTER_VERSION='hxh-naruto-dc-marvel-witcher-jjk-aot-bleach-v2';
  const ASSET_VERSION='local3-reset-20261122-v1';
  const MAX_GUESTS=3;
  const STAT_INFO=[
    ['strength','STR','Strength','Raw physical power'],
    ['dexterity','DEX','Dexterity','Speed & precision'],
    ['battle_iq','BIQ','Battle IQ','Tactical intelligence'],
    ['endurance','END','Endurance','Durability & stamina'],
    ['hacks','HAX','Hacks','Special abilities'],
    ['iq','IQ','IQ','Reasoning & intellect']
  ];
  const UNIVERSES=[
    'Hunter x Hunter','Naruto','DC','Marvel','The Witcher',
    'Jujutsu Kaisen','Attack on Titan','Bleach'
  ];
  const adjectives=[
    'Iron','Swift','Solar','Nova','Wild','Shadow','Lunar','Frost',
    'Brave','Crimson','Golden','Storm','Echo','Blazing','Silent','Cosmic'
  ];
  const nouns=[
    'Falcon','Raven','Knight','Wolf','Comet','Fox','Dragon','Hawk',
    'Panda','Titan','Phoenix','Tiger','Viper','Rider','Saber','Otter'
  ];
  const drawButton=document.createElement('button');
  drawButton.type='button';
  drawButton.id='draw-character';
  drawButton.className='btn btn-primary draw-action';
  drawButton.textContent='DRAW CHARACTER ↗';
  document.querySelector('.draw-panel .character-details').append(drawButton);

  let league;
  let roster=[];
  let scoreMap=null;
  let loaded=false;
  let period='weekly';
  let observedDay='';
  let toastTimer;
  let loadFailure=null;

  function el(tag,cls,value) {
    const x=document.createElement(tag);
    if(cls)x.className=cls;
    if(value!==undefined)x.textContent=String(value);
    return x;
  }
  function read(key) {
    try{return JSON.parse(localStorage.getItem(key)||'null');}
    catch{return null;}
  }
  function persist() {
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(league));return true;}
    catch {notify('Browser storage unavailable. Guest progress may not persist.',true);return false;}
  }
  function notify(message,error=false) {
    const node=$('notification');
    node.textContent=message;
    node.classList.toggle('is-error',error);
    node.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>node.hidden=true,4900);
  }
  function nowDay() {
    const parts=Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day;
  }
  function rand(max) {
    if(window.crypto&&window.crypto.getRandomValues) {
      const a=new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0]%max;
    }
    return Math.floor(Math.random()*max);
  }
  function newName() {
    let candidate='';
    do {
      candidate=adjectives[rand(adjectives.length)]+
        nouns[rand(nouns.length)]+'_'+String(rand(10000)).padStart(4,'0');
    } while(league.profiles.some(p=>p.handle===candidate));
    return candidate;
  }
  function freshRound() {return {picks:[],current:null,submitted:false};}
  function validId(id) {
    return typeof id==='string' && /^(hxh|naruto|dc|marvel|witcher|jjk|aot|bleach)-[a-z0-9-]+$/.test(id);
  }
  function normalizeRound(r) {
    if(!r || !Array.isArray(r.picks))return freshRound();
    const picks=r.picks.filter(p=>p && engine.STATS.includes(p.stat) && validId(p.character_id)).slice(0,6);
    if(new Set(picks.map(p=>p.stat)).size!==picks.length ||
       new Set(picks.map(p=>p.character_id)).size!==picks.length)return freshRound();
    return {
      picks:picks.map(p=>({stat:p.stat,character_id:p.character_id})),
      current:r.current && validId(r.current.id)?{id:r.current.id}:null,
      submitted:r.submitted===true && picks.length===6
    };
  }
  function freshLeague() {
    return {version:ROSTER_VERSION,profiles:[],activeId:null,days:{}};
  }
  function loadLeague() {
    const saved=read(STORAGE_KEY);
    if(saved && saved.version===ROSTER_VERSION && Array.isArray(saved.profiles) &&
       saved.profiles.length<=3 && Array.isArray(Object.keys(saved.days||{}))) {
      const profiles=saved.profiles.filter(p=>p && /^guest-[123]$/.test(p.id||'') &&
        typeof p.handle==='string' && /^[A-Za-z]{4,25}_[0-9]{4}$/.test(p.handle));
      if(new Set(profiles.map(p=>p.id)).size===profiles.length){
        return {
          version:ROSTER_VERSION,profiles,
          activeId:profiles.some(p=>p.id===saved.activeId)?saved.activeId:profiles[0]?.id||null,
          days:saved.days && typeof saved.days==='object' && !Array.isArray(saved.days)?saved.days:{}
        };
      }
    }
    const next=freshLeague();
    // One-time migration of the previous single-guest local mode.
    const legacy=read(LEGACY_PLAYER);
    if(legacy && typeof legacy.handle==='string' &&
       /^[A-Za-z]{4,25}_[0-9]{4}$/.test(legacy.handle)) {
      next.profiles.push({id:'guest-1',handle:legacy.handle,createdAt:legacy.createdAt||Date.now()});
      next.activeId='guest-1';
      const old=read(LEGACY_ROUND);
      if(old && old.day===nowDay()) {
        next.days[old.day]={day:old.day,rounds:{'guest-1':normalizeRound(old)},matches:[],resolvedAt:null};
      }
    }
    return next;
  }
  function dayData(day=nowDay()) {
    if(!league.days[day] || !league.days[day].rounds) {
      league.days[day]={day,rounds:{},matches:[],resolvedAt:null};
    }
    return league.days[day];
  }
  function roundFor(id,day=nowDay()) {
    const entry=dayData(day);
    if(!entry.rounds[id])entry.rounds[id]=freshRound();
    return entry.rounds[id];
  }
  function activeProfile() {return league.profiles.find(p=>p.id===league.activeId)||null;}
  function activeRound() {
    const profile=activeProfile();
    return profile?roundFor(profile.id):freshRound();
  }
  function character(id){return roster.find(c=>c.id===id)||null;}
  function shortName(id){return character(id)?.name||id;}
  function initials(name) {
    return String(name||'').replace(/\([^)]*\)/g,'').trim().split(/\s+/)
      .slice(0,2).map(word=>word[0]||'').join('').toUpperCase()||'✦';
  }
  function ensureActiveDraw() {
    const profile=activeProfile();
    if(!profile || !loaded)return;
    const round=roundFor(profile.id);
    if(round.current || round.submitted || round.picks.length===6)return;
    const used=new Set(round.picks.map(p=>p.character_id));
    const available=roster.filter(c=>!used.has(c.id));
    if(!available.length)return;
    const next=available[rand(available.length)];
    round.current={id:next.id};
    persist();
  }
  function createGuest(slot=league.profiles.length) {
    if(!loaded && loadFailure)notify('Could not load characters. Refresh and retry.',true);
    if(slot<0 || slot>=MAX_GUESTS || league.profiles.length>=MAX_GUESTS)return;
    // Guests are created in numeric order so the UI cannot skip a slot.
    if(slot!==league.profiles.length)return;
    const id='guest-'+(slot+1);
    const guest={id,handle:newName(),createdAt:Date.now()};
    league.profiles.push(guest);
    league.activeId=id;
    roundFor(id);
    ensureActiveDraw();
    persist();
    render();
    notify('Guest '+(slot+1)+' created: '+guest.handle);
    $('arena').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function switchGuest(id) {
    if(!league.profiles.some(p=>p.id===id))return;
    league.activeId=id;
    ensureActiveDraw();
    persist();
    render();
  }
  function draw() {
    if(!activeProfile()){createGuest();return;}
    if(!loaded){notify('Character data is still loading.',true);return;}
    ensureActiveDraw();
    render();
  }
  function assign(stat) {
    const guest=activeProfile(),round=activeRound();
    if(!guest || !loaded || round.submitted || !round.current ||
       !engine.STATS.includes(stat) || round.picks.some(p=>p.stat===stat))return;
    const current=character(round.current.id);
    if(!current || round.picks.some(p=>p.character_id===current.id))return;
    round.picks.push({stat,character_id:current.id});
    round.current=null;
    ensureActiveDraw();
    persist();
    render();
  }
  function submit() {
    $('confirm-backdrop').hidden=true;
    const guest=activeProfile(),round=activeRound();
    if(!guest || round.submitted || round.current || round.picks.length!==6)return;
    try {
      // Check all six distinct stats, characters and values before locking.
      engine.assertRound({...round,submitted:true},scoreMap);
    }catch(e){notify(e.message,true);return;}
    round.submitted=true;
    persist();
    render();
    const submitted=league.profiles.filter(p=>roundFor(p.id).submitted).length;
    notify('Lineup saved for '+guest.handle+'. '+submitted+'/3 guests submitted.');
  }
  function canResetToday() {
    if(!league.profiles.length)return false;
    const entry=dayData();
    return Boolean(entry.resolvedAt || (entry.matches||[]).length ||
      league.profiles.some(profile=>{
        const round=entry.rounds[profile.id];
        return round && (round.submitted || round.picks.length>0 || !!round.current);
      }));
  }
  function openReset() {
    if(!canResetToday())return;
    $('reset-backdrop').hidden=false;
  }
  function resetToday() {
    $('reset-backdrop').hidden=true;
    if(!canResetToday())return;
    const entry=dayData();
    // Reset the *current Istanbul day* for all existing guest slots, not the
    // profiles or historical dates. Reverses all three Submit locks and scores.
    entry.rounds={};
    for(const profile of league.profiles)entry.rounds[profile.id]=freshRound();
    entry.matches=[];
    entry.resolvedAt=null;
    delete entry.manual;
    ensureActiveDraw();
    persist();
    render();
    notify('Today reset: all 3 guest lineups, Submit locks and matchup scores cleared.');
  }
  function canResolve(day=nowDay()) {
    if(!loaded || !scoreMap || league.profiles.length!==MAX_GUESTS)return false;
    const entry=dayData(day);
    return !entry.resolvedAt && league.profiles.every(p=>{
      const r=entry.rounds[p.id];
      return r && r.submitted && r.picks.length===6;
    });
  }
  function settle(day,manual=false) {
    if(!canResolve(day))return false;
    const entry=dayData(day);
    try {
      const matchups=engine.resolveLeague(day,league.profiles,entry.rounds,scoreMap);
      entry.matches=matchups;
      entry.resolvedAt=Date.now();
      entry.manual=manual;
      persist();
      if(day===nowDay())render();
      return true;
    }catch(e) {
      console.error('Local matchup failed',e);
      notify('Matchup calculation failed: '+e.message,true);
      return false;
    }
  }
  function settlePast() {
    if(!loaded)return;
    for(const day of Object.keys(league.days).sort()) {
      if(day<nowDay() && !league.days[day]?.resolvedAt)settle(day,false);
    }
  }
  function calculate() {
    if(!canResolve())return;
    if(settle(nowDay(),true)) {
      notify('All 3 matchups calculated. Each winning stat earns +1; ties earn 0.');
      $('matchups').scrollIntoView({behavior:'smooth',block:'start'});
    }
  }

  function renderProfiles() {
    const root=$('guest-switcher');root.replaceChildren();
    $('guest-count').textContent=league.profiles.length+' / 3 GUESTS';
    $('reset-three').disabled=!canResetToday();
    for(let i=0;i<MAX_GUESTS;i++) {
      const p=league.profiles[i],slot=el('button','guest-slot'+(p?.id===league.activeId?' active':''));
      slot.type='button';
      if(p) {
        const r=roundFor(p.id);
        slot.append(el('span','guest-index','GUEST 0'+(i+1)));
        slot.append(el('strong','guest-name',p.handle));
        slot.append(el('span','guest-progress',r.submitted?'✓ Submitted':r.picks.length+'/6 picks'));
        slot.addEventListener('click',()=>switchGuest(p.id));
      } else {
        slot.className+=' empty';
        slot.append(el('span','guest-index','GUEST 0'+(i+1)));
        slot.append(el('strong','guest-name','+ CREATE GUEST'));
        slot.append(el('span','guest-progress','Random player name'));
        slot.disabled=i!==league.profiles.length;
        slot.addEventListener('click',()=>createGuest(i));
      }
      root.append(slot);
    }
    const button=$('guest-start');
    button.disabled=league.profiles.length>=MAX_GUESTS;
    button.textContent=league.profiles.length>=MAX_GUESTS?
      '3 GUESTS READY ✓': 'CREATE GUEST '+(league.profiles.length+1)+' ↗';
    $('user-handle').hidden=!activeProfile();
    $('user-handle').textContent=activeProfile()?'@'+activeProfile().handle:'';
  }

  function renderRound() {
    const guest=activeProfile(),r=activeRound();
    const current=character(r.current?.id),picks=r.picks;
    $('progress-count').replaceChildren(
      document.createTextNode(String(picks.length).padStart(2,'0')+' '),
      el('span','','/ 6')
    );
    $('progress-fill').style.width=(picks.length/6*100)+'%';
    const grid=$('stat-grid');grid.replaceChildren();
    for(const [id,code,label,description] of STAT_INFO) {
      const pick=picks.find(p=>p.stat===id);
      const slot=el('button','stat-slot'+(pick?' filled':''));
      slot.type='button';
      slot.disabled=!guest || !loaded || !!pick || !current || r.submitted;
      const mark=el('span','slot-symbol',code);
      const info=el('span','slot-content');
      info.append(el('strong','',label));
      info.append(el('small','',pick?shortName(pick.character_id):description));
      slot.append(mark,info);
      slot.append(el('span',pick?'slot-tick':'slot-plus',pick?'✓':current?'+':'○'));
      if(!pick)slot.addEventListener('click',()=>assign(id));
      grid.append(slot);
    }
    const image=$('current-portrait');
    image.hidden=true;image.removeAttribute('src');
    $('portrait-fallback').hidden=false;
    $('portrait-fallback').textContent=current?initials(current.name):'✦';
    const display=document.querySelector('.character-display');
    if(display)display.dataset.universe=current?.universe||'';
    $('current-name').textContent=current?current.name:r.submitted?'Lineup locked.':
      picks.length===6?'Ready to submit.':'A fighter is waiting.';
    $('current-world').textContent=current?current.universe:'THREE-GUEST LOCAL LEAGUE';
    $('draw-description').textContent=current?
      'Assign this character to any empty stat. A new fighter appears immediately.':
      !guest?'Create Guest 1 to start playing on this device.':
      r.submitted?'Six choices are locked for '+guest.handle+'.':
      picks.length===6?'All six assigned. Submit your lineup.':
      !loaded?'Loading 160 characters and scoring rules…':'Draw a new fighter.';
    $('draw-number').textContent=r.submitted?'SUBMITTED':
      'DRAW '+String(Math.min(picks.length+1,6)).padStart(2,'0')+' / 06';
    $('draw-note').textContent=r.submitted?'PICKS LOCKED':current?
      'SELECT A STAT TO ADVANCE':'HIDDEN UNTIL MATCHUP RESOLUTION';
    drawButton.hidden=!!current || r.submitted || picks.length===6;
    drawButton.disabled=!guest || !loaded;
    drawButton.textContent=!guest?'CREATE GUEST FIRST ↗':'DRAW CHARACTER ↗';
    $('submit-lineup').disabled=!guest || !loaded || r.submitted ||
      picks.length!==6 || !!current;
    $('submit-lineup').textContent=r.submitted?'LINEUP SAVED ✓':'SUBMIT LINEUP ↗';
    $('lineup-status').textContent=!guest?'Create Guest 1 above to begin.':
      r.submitted?guest.handle+' has submitted all six picks.':
      current?'Assign '+current.name+' to an empty stat.':
      picks.length===6?'Submit your six selections.':
      'Awaiting next character draw.';
  }
  function duelDetail(match) {
    const wrapper=el('div','matchup-breakdown');
    for(const d of match.details) {
      const statLabel=STAT_INFO.find(x=>x[0]===d.stat)?.[2]||d.stat;
      const line=el('div','matchup-stat-line');
      line.append(
        el('span',d.winner==='a'?'winner':'',shortName(d.characterA)+' · '+d.valueA),
        el('span','matchup-stat-name',statLabel),
        el('span',d.winner==='b'?'winner':'',d.valueB+' · '+shortName(d.characterB))
      );
      wrapper.append(line);
    }
    return wrapper;
  }
  function renderMatches() {
    const day=dayData(),result=$('matchup-results');result.replaceChildren();
    const done=league.profiles.filter(p=>day.rounds[p.id]?.submitted).length;
    $('resolve-matches').disabled=!canResolve();
    $('resolve-matches').hidden=!!day.resolvedAt;
    if(league.profiles.length<3) {
      $('matchup-status').textContent='Create all three guest profiles ('+
        league.profiles.length+'/3). Each has its own daily lineup.';
    } else if(done<3) {
      $('matchup-status').textContent='Waiting for '+(3-done)+
        ' guest lineup'+(3-done===1?'':'s')+'. '+done+'/3 submitted.';
    } else if(!day.resolvedAt) {
      $('matchup-status').textContent='All 3 lineups submitted! Click Calculate Matchups for immediate local results, or wait for automatic midnight settlement (Istanbul).';
    } else {
      $('matchup-status').textContent='Results for '+day.day+
        ' · 3 one-on-one matchups · six stat comparisons each · +1 per winning stat, 0 for ties.';
    }
    if(!day.resolvedAt || !Array.isArray(day.matches)) {
      result.append(el('div','empty-state','Once all three guests submit, the three pairwise matchups appear here.'));
      return;
    }
    for(const match of day.matches) {
      const card=el('article','duel-card');
      const head=el('div','duel-head');
      head.append(el('strong','',match.handleA),el('span','duel-score',
        match.pointsA+' : '+match.pointsB),el('strong','',match.handleB));
      card.append(head);
      const verdict=match.pointsA===match.pointsB?'TIED MATCH':
        'WINNER · '+(match.pointsA>match.pointsB?match.handleA:match.handleB);
      card.append(el('div','duel-verdict',verdict));
      card.append(duelDetail(match));
      result.append(card);
    }
  }
  function renderLeaderboard() {
    const root=$('leaderboard-rows');root.replaceChildren();
    const hasMatch=Object.values(league.days).some(d=>d?.resolvedAt && d?.matches?.length);
    if(!hasMatch) {
      root.append(el('div','empty-state',
        'Local rankings will appear after the first three-guest matchup is calculated.'));
      return;
    }
    for(const row of engine.leaderboard(league.profiles,league.days,period,nowDay())) {
      const item=el('div','leaderboard-row');
      const main=el('div','board-player');
      main.append(el('span','board-rank',String(row.rank).padStart(2,'0')));
      main.append(el('strong','',row.handle));
      item.append(main,el('span','board-matches',row.matches),el('span','board-score',row.points));
      root.append(item);
    }
  }
  function renderHistory() {
    const root=$('history-list');root.replaceChildren();
    const guest=activeProfile();
    if(!guest) {
      root.append(el('div','empty-state','Select a guest profile to see its local match results.'));
      return;
    }
    let count=0;
    const dates=Object.keys(league.days).sort().reverse();
    for(const date of dates) {
      const day=league.days[date];
      if(!day?.resolvedAt || !Array.isArray(day.matches))continue;
      for(const match of day.matches) {
        if(match.playerA!==guest.id && match.playerB!==guest.id)continue;
        const isA=match.playerA===guest.id;
        const self=isA?match.pointsA:match.pointsB;
        const opponent=isA?match.pointsB:match.pointsA;
        const other=isA?match.handleB:match.handleA;
        const row=el('div','history-row');
        row.append(el('span','history-day',date));
        row.append(el('strong','history-rival','VS '+other));
        row.append(el('span','history-score',self+' : '+opponent));
        row.append(el('span','history-outcome '+(self>opponent?'win':self<opponent?'loss':'draw'),
          self>opponent?'WIN':self<opponent?'LOSS':'TIE'));
        const toggle=el('button','history-detail-button','DETAILS ▾');
        toggle.type='button';
        const details=duelDetail(match);details.hidden=true;
        toggle.addEventListener('click',()=>{details.hidden=!details.hidden;});
        row.append(toggle,details);
        root.append(row);count++;
      }
    }
    if(!count)root.append(el('div','empty-state',
      'No resolved matchups for '+guest.handle+' yet. Complete three lineups and calculate.'));
  }
  function render() {
    const today=nowDay();
    observedDay=today;
    dayData(today);
    $('today-label').textContent=today;
    $('count-characters').textContent=loaded?roster.length:'—';
    $('count-players').textContent=league.profiles.length+' / 3';
    renderProfiles();renderRound();renderMatches();renderLeaderboard();renderHistory();
  }
  function tick() {
    const day=nowDay();
    if(day!==observedDay){
      settlePast();
      dayData(day);
      ensureActiveDraw();
      persist();
      render();
    }
    const [y,m,d]=day.split('-').map(Number);
    const next=Date.UTC(y,m-1,d,21,0,0);
    const secs=Math.max(0,Math.floor((next-Date.now())/1000));
    $('countdown').textContent=
      String(Math.floor(secs/3600)).padStart(2,'0')+' : '+
      String(Math.floor(secs/60)%60).padStart(2,'0')+' : '+
      String(secs%60).padStart(2,'0');
  }
  function validateAssets(publicRoster,scorePayload) {
    if(!Array.isArray(publicRoster) || publicRoster.length!==160 ||
       !scorePayload || scorePayload.rosterVersion!==ROSTER_VERSION ||
       !scorePayload.stats)throw Error('Invalid or mismatched 160-character dataset.');
    const approved=new Set(UNIVERSES);
    const ids=new Set();
    for(const c of publicRoster) {
      if(!validId(c.id) || !approved.has(c.universe) || typeof c.name!=='string' ||
         !scorePayload.stats[c.id] || ids.has(c.id))throw Error('Character data integrity error.');
      ids.add(c.id);
    }
    for(const universe of UNIVERSES){
      if(publicRoster.filter(c=>c.universe===universe).length!==20)
        throw Error('Universe roster is incomplete: '+universe);
    }
    return {publicRoster,stats:scorePayload.stats};
  }
  async function fetchJson(file) {
    const url=new URL(file+'?build='+encodeURIComponent(ASSET_VERSION),document.baseURI);
    const response=await fetch(url,{cache:'reload'});
    if(!response.ok)throw Error('Failed to load '+file);
    return response.json();
  }
  async function boot() {
    try {
      const data=validateAssets(...await Promise.all([
        fetchJson('guest-roster.json'),fetchJson('guest-score-map.json')
      ]));
      roster=data.publicRoster;
      scoreMap=data.stats;
      loaded=true;
      for(const day of Object.values(league.days)){
        if(!day?.rounds)continue;
        for(const guest of league.profiles) {
          const original=day.rounds[guest.id];
          if(!original)continue;
          const cleaned=normalizeRound(original);
          cleaned.picks=cleaned.picks.filter(p=>character(p.character_id));
          if(cleaned.current&&!character(cleaned.current.id))cleaned.current=null;
          cleaned.submitted=cleaned.submitted&&cleaned.picks.length===6;
          day.rounds[guest.id]=cleaned;
        }
      }
      settlePast();
      ensureActiveDraw();
      persist();
      render();
    }catch(error) {
      console.error('Could not load local game data',error);
      loadFailure=error;
      loaded=false;
      render();
      notify('The local game data could not load. Refresh the page.',true);
    }
  }

  $('guest-start').addEventListener('click',()=>createGuest());
  drawButton.addEventListener('click',draw);
  $('resolve-matches').addEventListener('click',calculate);
  $('reset-three').addEventListener('click',openReset);
  $('reset-cancel').addEventListener('click',()=>{$('reset-backdrop').hidden=true;});
  $('reset-confirm').addEventListener('click',resetToday);
  $('reset-backdrop').addEventListener('click',event=>{
    if(event.target===$('reset-backdrop'))$('reset-backdrop').hidden=true;
  });
  $('submit-lineup').addEventListener('click',()=>{
    const r=activeRound();
    if(r.submitted || r.picks.length!==6 || r.current)return;
    $('confirm-backdrop').hidden=false;
  });
  $('confirm-cancel').addEventListener('click',()=>{$('confirm-backdrop').hidden=true;});
  $('confirm-submit').addEventListener('click',submit);
  $('confirm-backdrop').addEventListener('click',e=>{
    if(e.target===$('confirm-backdrop'))$('confirm-backdrop').hidden=true;
  });
  document.querySelectorAll('.board-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      period=btn.dataset.period;
      document.querySelectorAll('.board-tab').forEach(x=>
        x.classList.toggle('active',x===btn));
      renderLeaderboard();
    });
  });

  league=loadLeague();
  dayData();
  render();
  tick();
  setInterval(tick,1000);
  boot();
})();
