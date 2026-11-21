/* Daily Stat Clash — no-login guest mode. Browser-local daily picks, no fake online scoring. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const PLAYER_KEY = 'daily-stat-clash.guest.player.v1';
  const ROUND_KEY = 'daily-stat-clash.guest.round.v1';
  const HISTORY_KEY = 'daily-stat-clash.guest.history.v1';

  const stats = [
    ['strength','STR','Strength','Raw physical power'],
    ['dexterity','DEX','Dexterity','Speed & precision'],
    ['battle_iq','BIQ','Battle IQ','Tactical intelligence'],
    ['endurance','END','Endurance','Durability & stamina'],
    ['hacks','HAX','Hacks','Special abilities'],
    ['iq','IQ','IQ','Reasoning & intellect']
  ];
  const adjectives = [
    'Iron','Swift','Solar','Nova','Wild','Shadow','Lunar','Frost',
    'Brave','Crimson','Golden','Storm','Echo','Blazing','Silent','Cosmic'
  ];
  const nouns = [
    'Falcon','Raven','Knight','Wolf','Comet','Fox','Dragon','Hawk',
    'Panda','Titan','Phoenix','Tiger','Viper','Rider','Saber','Otter'
  ];
  const drawButton = document.createElement('button');
  drawButton.type='button';
  drawButton.id='draw-character';
  drawButton.className='btn btn-primary draw-action';
  drawButton.textContent='DRAW CHARACTER ↗';
  document.querySelector('.draw-panel .character-details').append(drawButton);

  let player=null;
  let round=null;
  let roster=[];
  let loaded=false;
  let selectedPeriod='weekly';
  let toastTimer=null;
  let observedDay='';

  function read(key) {
    try {return JSON.parse(localStorage.getItem(key) || 'null');}
    catch {return null;}
  }
  function store(key,value) {
    try {localStorage.setItem(key,JSON.stringify(value));return true;}
    catch {
      notify('Browser storage is unavailable. Picks may disappear when you reload.',true);
      return false;
    }
  }
  function notify(message,isError=false) {
    const node=$('notification');
    node.textContent=message;
    node.classList.toggle('is-error',!!isError);
    node.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>node.hidden=true,5000);
  }
  function el(tag,className,text) {
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function dayIstanbul() {
    const parts=Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day;
  }
  function rand(max) {
    if(window.crypto && window.crypto.getRandomValues) {
      const v=new Uint32Array(1);
      window.crypto.getRandomValues(v);
      return v[0]%max;
    }
    return Math.floor(Math.random()*max);
  }
  function generateName() {
    return adjectives[rand(adjectives.length)]+
      nouns[rand(nouns.length)]+'_'+String(rand(10000)).padStart(4,'0');
  }
  function newRound(day) {return {day,picks:[],current:null,submitted:false};}
  function validPlayer(p) {
    return p && typeof p.handle==='string' &&
      /^[A-Za-z]{4,25}_[0-9]{4}$/.test(p.handle);
  }
  function normalizeRound(value,day) {
    if(!value || value.day!==day || !Array.isArray(value.picks))return newRound(day);
    const picks=value.picks.filter(p =>
      p && stats.some(s=>s[0]===p.stat) &&
      typeof p.character_id==='string' && /^[a-z0-9-]+$/.test(p.character_id)
    ).slice(0,6);
    if(new Set(picks.map(x=>x.stat)).size!==picks.length ||
       new Set(picks.map(x=>x.character_id)).size!==picks.length) return newRound(day);
    return {
      day,picks,
      current:value.current && /^[a-z0-9-]+$/.test(value.current.id||'') ? value.current:null,
      submitted:value.submitted===true && picks.length===6
    };
  }
  function ensureDay() {
    const day=dayIstanbul();
    if(!round || round.day!==day) {
      round=normalizeRound(read(ROUND_KEY),day);
      store(ROUND_KEY,round);
    }
    observedDay=day;
  }
  function portrait(id) {
    if(!/^[a-z0-9-]+$/.test(id||''))return '';
    return new URL('app/public/assets/portraits/'+id+'.svg',document.baseURI).href;
  }
  function smallName(c) {
    return c && typeof c.name==='string' ? c.name:'Unknown fighter';
  }

  function render() {
    ensureDay();
    const active=!!player;
    const picks=round.picks;
    const current=round.current;
    const submitted=round.submitted;
    $('user-handle').hidden=!active;
    $('user-handle').textContent=active?'@'+player.handle:'';
    $('guest-start').textContent=active?'NEW RANDOM NAME ↻':'PLAY AS GUEST ↗';
    $('count-characters').textContent=loaded?roster.length:'—';
    $('count-players').textContent='—';
    $('today-label').textContent=round.day;
    $('progress-count').replaceChildren(
      document.createTextNode(String(picks.length).padStart(2,'0')+' '),
      el('span','','/ 6')
    );
    $('progress-fill').style.width=Math.round(picks.length/6*100)+'%';

    const grid=$('stat-grid');
    grid.replaceChildren();
    for(const [id,abbreviation,label,description] of stats) {
      const chosen=picks.find(p=>p.stat===id);
      const slot=el('button','stat-slot'+(chosen?' filled':'')+(submitted?' locked':''));
      slot.type='button';
      slot.disabled=!!chosen || !active || !current || submitted || !loaded;
      const symbol=el('span','slot-symbol',abbreviation);
      const content=el('span','slot-content');
      content.append(
        el('strong','',label),
        el('small','',chosen?chosen.name:description)
      );
      slot.append(symbol,content);
      if(chosen) {
        const src=portrait(chosen.character_id);
        if(src) {
          const image=el('img','slot-portrait');
          image.src=src;
          image.alt='';
          image.loading='lazy';
          slot.append(image);
        }
        slot.append(el('span','slot-tick','✓'));
      } else {
        slot.append(el('span','slot-plus',current?'+':'○'));
        slot.addEventListener('click',()=>assign(id));
      }
      grid.append(slot);
    }

    const image=$('current-portrait');
    const src=current?portrait(current.id):'';
    if(src) {
      image.src=src;image.alt=smallName(current);image.hidden=false;
      $('portrait-fallback').hidden=true;
    } else {
      image.removeAttribute('src');image.alt='';image.hidden=true;
      $('portrait-fallback').hidden=false;
    }
    $('current-name').textContent=current?smallName(current):
      submitted?'Lineup locked.':
      active&&picks.length===6?'Ready to submit.':'A fighter is waiting.';
    $('current-world').textContent=current?current.universe:
      submitted?'GUEST ROUND COMPLETE':'THE ARENA AWAITS';
    $('draw-description').textContent=current?
      'Assign this fighter to one unused stat. Each character can be used only once.':
      submitted?'Your six picks are saved in this browser until the next day.':
      !active?'Press Play as Guest to get a random player name and begin.':
      picks.length===6?'Your six stat slots are full. Submit your lineup.':
      !loaded?'Loading the character roster…':'Draw your next randomly selected character.';
    $('draw-number').textContent=submitted?'SUBMITTED':
      'DRAW '+String(Math.min(picks.length+1,6)).padStart(2,'0')+' / 06';
    drawButton.hidden=!!current || submitted || picks.length>=6;
    drawButton.disabled=!active || !loaded;
    drawButton.textContent=!active?'PLAY AS GUEST FIRST ↗':
      !loaded?'LOADING CHARACTERS…':'DRAW CHARACTER ↗';
    $('draw-note').textContent=submitted?'SAVED ON THIS DEVICE':
      current?'CHOOSE A STAT TO CONTINUE':'SCORES HIDDEN IN GUEST MODE';
    $('lineup-status').textContent=submitted?'Your lineup is saved and locked for today.':
      !active?'Press Play as Guest to start without an account.':
      !loaded?'Loading characters…':
      current?'Assign the drawn character to an available stat.':
      picks.length===6?'All six slots assigned. Submit your lineup.':
      'Draw '+(6-picks.length)+' more character'+(picks.length===5?'':'s')+'.';
    $('submit-lineup').disabled=!active || !loaded || submitted ||
      picks.length!==6 || !!current;
    $('submit-lineup').textContent=submitted?'LINEUP SAVED ✓':'SUBMIT LINEUP ↗';
    renderHistory();
    renderLeaderboard();
  }

  function startGuest() {
    const old=player?.handle;
    let name=generateName();
    while(name===old) name=generateName();
    player={handle:name,createdAt:Date.now()};
    store(PLAYER_KEY,player);
    render();
    notify(old?'New guest name: '+name+' · Today’s picks are preserved.':
      'You are now '+name+'! Draw your first fighter.');
    if(!old)document.getElementById('arena').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function draw() {
    if(!player) {startGuest();return;}
    if(!loaded) {notify('Characters are still loading. Try again.',true);return;}
    ensureDay();
    if(round.submitted || round.current || round.picks.length===6)return;
    const used=new Set(round.picks.map(p=>p.character_id));
    const available=roster.filter(c=>!used.has(c.id));
    if(!available.length){notify('No characters left to draw.',true);return;}
    round.current=available[rand(available.length)];
    store(ROUND_KEY,round);
    render();
  }
  function assign(stat) {
    ensureDay();
    if(!player||!loaded||round.submitted||!round.current)return;
    if(!stats.some(x=>x[0]===stat) || round.picks.some(p=>p.stat===stat))return;
    const card=roster.find(c=>c.id===round.current.id);
    if(!card)return;
    if(round.picks.some(p=>p.character_id===card.id))return;
    round.picks.push({
      stat,
      character_id:card.id,
      name:card.name,
      universe:card.universe
    });
    round.current=null;
    store(ROUND_KEY,round);
    render();
  }
  function openConfirm() {
    ensureDay();
    if(!player || round.submitted || round.picks.length!==6 || round.current)return;
    $('confirm-backdrop').hidden=false;
  }
  function submit() {
    $('confirm-backdrop').hidden=true;
    ensureDay();
    if(!player||round.submitted||round.current||round.picks.length!==6)return;
    if(new Set(round.picks.map(p=>p.stat)).size!==6 ||
       new Set(round.picks.map(p=>p.character_id)).size!==6)return;
    round.submitted=true;
    store(ROUND_KEY,round);
    const history=read(HISTORY_KEY);
    const entries=Array.isArray(history)?history.filter(x=>x&&x.day!==round.day):[];
    entries.push({
      day:round.day,
      handle:player.handle,
      picks:round.picks.map(p=>({...p}))
    });
    entries.sort((a,b)=>b.day.localeCompare(a.day));
    store(HISTORY_KEY,entries.slice(0,90));
    render();
    notify('Your six selections have been saved! Global results are not active in guest mode.');
  }

  function renderLeaderboard() {
    const root=$('leaderboard-rows');
    root.replaceChildren(el('div','empty-state',
      selectedPeriod==='weekly'?'Weekly global rankings are unavailable in guest mode.':
      selectedPeriod==='monthly'?'Monthly global rankings are unavailable in guest mode.':
      'All-time global rankings are unavailable in guest mode.'));
  }
  function renderHistory() {
    const root=$('history-list');
    root.replaceChildren();
    const entries=read(HISTORY_KEY);
    if(!Array.isArray(entries)||!entries.length) {
      root.append(el('div','empty-state',
        'No local guest submissions yet. Finish your six-character lineup to save one.'));
      return;
    }
    for(const entry of entries.slice(0,30)) {
      if(!entry || typeof entry.day!=='string'||!Array.isArray(entry.picks))continue;
      const row=el('div','history-row');
      row.append(
        el('span','history-day',entry.day),
        el('strong','history-rival',entry.handle||'Guest'),
        el('span','history-score',entry.picks.length+'/6 picks'),
        el('span','history-outcome win','SAVED')
      );
      const detail=el('div','history-breakdown');
      detail.hidden=true;
      for(const p of entry.picks) {
        const label=stats.find(x=>x[0]===p.stat)?.[2]||p.stat;
        detail.append(el('span','',label),el('span','',p.name||''));
      }
      const toggle=el('button','history-detail-button','VIEW PICKS ▾');
      toggle.type='button';
      toggle.addEventListener('click',()=>{detail.hidden=!detail.hidden;});
      row.append(toggle,detail);
      root.append(row);
    }
  }
  function tick() {
    const day=dayIstanbul();
    if(day!==observedDay){
      ensureDay();
      render();
    }
    const [year,month,date]=day.split('-').map(Number);
    const nextMidnightUtc=Date.UTC(year,month-1,date,21,0,0);
    const seconds=Math.max(0,Math.floor((nextMidnightUtc-Date.now())/1000));
    const hh=String(Math.floor(seconds/3600)).padStart(2,'0');
    const mm=String(Math.floor(seconds/60)%60).padStart(2,'0');
    const ss=String(seconds%60).padStart(2,'0');
    $('countdown').textContent=hh+' : '+mm+' : '+ss;
  }

  $('guest-start').addEventListener('click',startGuest);
  drawButton.addEventListener('click',draw);
  $('submit-lineup').addEventListener('click',openConfirm);
  $('confirm-cancel').addEventListener('click',()=>{$('confirm-backdrop').hidden=true;});
  $('confirm-submit').addEventListener('click',submit);
  $('confirm-backdrop').addEventListener('click',event=>{
    if(event.target===$('confirm-backdrop'))$('confirm-backdrop').hidden=true;
  });
  document.querySelectorAll('.board-tab').forEach(button=>{
    button.addEventListener('click',()=>{
      selectedPeriod=button.dataset.period;
      document.querySelectorAll('.board-tab').forEach(tab=>
        tab.classList.toggle('active',tab===button));
      renderLeaderboard();
    });
  });

  player=validPlayer(read(PLAYER_KEY))?read(PLAYER_KEY):null;
  ensureDay();
  render();
  tick();
  setInterval(tick,1000);

  fetch(new URL('guest-roster.json',document.baseURI),{cache:'no-cache'})
    .then(response=>{
      if(!response.ok)throw Error('Character roster request failed ('+response.status+').');
      return response.json();
    })
    .then(data=>{
      if(!Array.isArray(data)||data.length<6)throw Error('The roster is incomplete.');
      roster=data.filter(c=>c&&/^[a-z0-9-]+$/.test(c.id||'') &&
        typeof c.name==='string' && typeof c.universe==='string');
      if(roster.length!==101 || new Set(roster.map(c=>c.id)).size!==101)
        throw Error('Character roster validation failed.');
      // Never persist or expose scores: the guest build contains only public identities.
      const ids=new Map(roster.map(c=>[c.id,c]));
      round.picks=round.picks.map(p=>{
        const c=ids.get(p.character_id);
        return c?{stat:p.stat,character_id:c.id,name:c.name,universe:c.universe}:null;
      }).filter(Boolean);
      if(round.current)round.current=ids.get(round.current.id)||null;
      if(round.submitted && round.picks.length!==6)round.submitted=false;
      store(ROUND_KEY,round);
      loaded=true;
      render();
    })
    .catch(error=>{
      loaded=false;
      render();
      notify('Unable to load the character roster. Refresh the page to retry.',true);
      console.error(error);
    });
})();
