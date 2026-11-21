/* Daily Stat Clash — independent username/password client for Node.js + SQLite */
(() => {
  'use strict';
  const config = window.DAILY_CLASH_CONFIG || {};
  const ready = Boolean(config.apiBase) || !window.location.hostname.endsWith('github.io');
  const apiBase = String(config.apiBase || new URL('.', document.baseURI).href).replace(/\/+$/, '');
  const sessionKey = 'daily-stat-clash.username-session.v2';
  const stats = [
    ['strength','STR','Strength','Raw physical power'],['dexterity','DEX','Dexterity','Speed & precision'],
    ['battle_iq','BIQ','Battle IQ','Tactical intelligence'],['endurance','END','Endurance','Durability & stamina'],
    ['hacks','HAX','Hacks','Special abilities'],['iq','IQ','IQ','Reasoning & intellect']
  ];
  const $ = id => document.getElementById(id);
  let mode = 'login';
  let state = null;
  let session = null;
  let period = 'weekly';
  let busy = false;
  let toastTimer = 0;
  const pending = document.createElement('button');
  pending.id = 'draw-character';
  pending.className = 'btn btn-primary draw-action';
  pending.type = 'button';
  pending.textContent = 'DRAW CHARACTER ↗';
  document.querySelector('.draw-panel .character-details').append(pending);

  const getSession = () => {
    try {
      const value = JSON.parse(localStorage.getItem(sessionKey) || 'null');
      return value && /^[0-9a-f]{64}$/.test(value.token || '') ? value : null;
    } catch { return null; }
  };
  const setSession = value => {
    session = value && value.token ? {token: value.token, user: value.user || null} : null;
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  };
  session = getSession();

  function notify(message, error=false) {
    const el = $('notification'); el.textContent = message;
    el.classList.toggle('is-error', error); el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{el.hidden=true;}, 5300);
  }
  function showError(e) { notify(e instanceof Error ? e.message : String(e),true); }
  function shortDate(day) {
    if (!day) return '—';
    return new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  }
  function imgFor(c) {
    const path = c && c.portrait_url;
    if (!path || !/^\/Daily-Stat-Clash\/app\/public\/assets\/portraits\/[a-z0-9-]+\.svg$/.test(path)) return '';
    return path;
  }
  // Never trust localStorage for identity. The server verifies every bearer token.
  // Passwords travel over HTTPS and are never stored in the browser.
  async function rpc(name,body={}) {
    if(!ready) throw Error('The game server has not been connected to this GitHub Pages site.');
    const endpoints={
      game_state:['GET','/api/state'],
      game_leaderboard:['GET','/api/leaderboard'],
      game_register:['POST','/api/auth/register'],
      game_login:['POST','/api/auth/login'],
      game_logout:['POST','/api/auth/logout'],
      game_draw:['POST','/api/draw'],
      game_assign:['POST','/api/assign'],
      game_submit:['POST','/api/submit']
    };
    const entry=endpoints[name];
    if(!entry)throw Error('Unknown game operation.');
    const [method,route]=entry;
    let address=apiBase+route;
    if(name==='game_leaderboard'){
      address+='?period='+encodeURIComponent(body.p_period || 'weekly');
    }
    const requestBody=name==='game_register'||name==='game_login'
      ? {username:body.p_handle,password:body.p_password}
      : name==='game_assign'?{stat:body.p_stat}:{};
    const headers={'Accept':'application/json'};
    if(method==='POST')headers['Content-Type']='application/json';
    if(session?.token)headers['Authorization']='Bearer '+session.token;
    let response;
    try {
      response=await fetch(address,{
        method,cache:'no-store',headers,
        ...(method==='POST'?{body:JSON.stringify(requestBody)}:{})
      });
    }catch{
      throw Error('Cannot reach the game server. Check the connection and try again.');
    }
    const result=await response.json().catch(()=>null);
    if(!response.ok){
      const error=Error(result?.error || 'Server request failed ('+response.status+').');
      error.status=response.status;
      throw error;
    }
    return result;
  }
  function el(tag,cls,txt) {
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(txt!==undefined)n.textContent=String(txt);
    return n;
  }
  function updateAuthUi() {
    const logged=Boolean(session && state?.user);
    $('user-handle').hidden=!logged;
    $('user-handle').textContent=logged?'@'+state.user.handle:'';
    $('auth-toggle').innerHTML=logged?'SIGN OUT <span>↗</span>':'SIGN IN <span>↗</span>';
  }
  function redraw() {
    updateAuthUi();
    const choices=state?.picks||[];
    const current=state?.current||null;
    const submitted=Boolean(state?.submitted);
    $('count-characters').textContent=state?.totalCharacters??101;
    $('count-players').textContent=state?.participants??'—';
    $('today-label').textContent=state?.day?shortDate(state.day).toUpperCase():'ISTANBUL TIME';
    $('progress-count').innerHTML=choices.length+' <span>/ 6</span>';
    $('progress-fill').style.width=(choices.length/6*100)+'%';
    const grid=$('stat-grid'); grid.replaceChildren();
    for(const [id,abbr,label,description] of stats) {
      const chosen=choices.find(p=>p.stat===id);
      const slot=el('button','stat-slot'+(chosen?' filled':'')+(submitted?' locked':''));slot.type='button';
      slot.disabled=Boolean(chosen||submitted||busy||!session);
      const symbol=el('span','slot-symbol',abbr);
      const content=el('span','slot-content');
      content.append(el('strong','',label),el('small','',chosen?chosen.name:description));
      slot.append(symbol,content);
      if(chosen) {
        const portrait=imgFor(chosen);
        if(portrait){const im=el('img','slot-portrait');im.src=portrait;im.alt='';slot.append(im);}
        slot.append(el('span','slot-tick','✓'));
      } else slot.append(el('span','slot-plus',current?'+':'○'));
      slot.addEventListener('click',()=>assign(id));
      grid.append(slot);
    }
    $('current-name').textContent=current?.name||(submitted?'Lineup locked.':choices.length===6?'Ready to submit.':'A fighter is waiting.');
    $('current-world').textContent=current?.universe||(submitted?'TODAY IS COMPLETE':'THE ARENA AWAITS');
    $('draw-description').textContent=current?'Choose one unused stat for this character. This choice cannot be undone.':
      submitted?'Results will appear after the daily settlement at midnight.':
      !session?'Sign in to reveal your next fighter.':choices.length===6?'Your six stat slots are filled. Submit your lineup.':
      'Reveal your next randomly selected character.';
    const portrait=$('current-portrait');
    const src=imgFor(current);
    if(src){portrait.src=src;portrait.alt=current.name;portrait.hidden=false;$('portrait-fallback').hidden=true;}
    else{portrait.removeAttribute('src');portrait.hidden=true;$('portrait-fallback').hidden=false;}
    $('draw-number').textContent='DRAW '+String(Math.min(choices.length+1,6)).padStart(2,'0')+' / 06';
    $('draw-character').hidden=Boolean(current||submitted||choices.length===6);
    $('draw-character').disabled=busy||!session||!ready;
    $('draw-character').textContent=!session?'SIGN IN TO DRAW ↗':'DRAW CHARACTER ↗';
    $('draw-note').textContent=submitted?'LINEUP SUBMITTED':current?'CHOOSE A STAT TO CONTINUE':'STATS HIDDEN UNTIL MATCHUP';
    $('lineup-status').textContent=submitted?'Your lineup is submitted and locked.':
      !session?'Sign in to begin today’s challenge.':current?'Assign the drawn character to an available stat.':
      choices.length===6?'All six slots are assigned. Submit your lineup.':
      'Draw '+(6-choices.length)+' more character'+(choices.length===5?'':'s')+'.';
    $('submit-lineup').disabled=busy||submitted||choices.length!==6||!ready;
    drawHistory();
  }
  function drawHistory() {
    const holder=$('history-list');holder.replaceChildren();
    if(!session) {holder.append(el('div','empty-state','Sign in to view your results and past opponents.'));return;}
    const records=state?.history||[];
    if(!records.length) {holder.append(el('div','empty-state','No settled matches yet. Submit today’s lineup and check back after midnight.'));return;}
    for(const h of records) {
      const row=el('div','history-row');
      row.append(el('span','history-day',shortDate(h.day)));
      row.append(el('strong','history-rival','vs '+h.opponent));
      row.append(el('span','history-score',h.self_points+' — '+h.opponent_points));
      const outcome=h.self_points>h.opponent_points?'WIN':h.self_points<h.opponent_points?'LOSS':'DRAW';
      row.append(el('span','history-outcome '+outcome.toLowerCase(),outcome));
      const toggle=el('button','history-detail-button','DETAILS ▾');
      const detail=el('div','history-breakdown');
      detail.hidden=true;
      const by=stats.map(x=>x[0]);
      for(const d of h.details||[]) {
        const left=h.reversed?d.b:d.a,right=h.reversed?d.a:d.b;
        detail.append(el('span','',stats[by.indexOf(d.stat)]?.[2]||d.stat),
          el('span','',String(left)+' — '+String(right)));
      }
      toggle.onclick=()=>{detail.hidden=!detail.hidden;};
      row.append(toggle,detail);
      holder.append(row);
    }
  }
  async function drawBoard() {
    const holder=$('leaderboard-rows');
    holder.replaceChildren(el('div','empty-state',ready?'Loading rankings…':'Leaderboard will appear when the backend is connected.'));
    if(!ready)return;
    try{
      const leaders=await rpc('game_leaderboard',{p_period:period});
      if(!Array.isArray(leaders)||!leaders.length){holder.replaceChildren(el('div','empty-state','Be the first challenger.'));return;}
      holder.replaceChildren();
      for(const person of leaders) {
        const row=el('div','leaderboard-row');
        const player=el('span','board-player');player.append(el('span','board-rank','#'+person.rank),el('strong','',person.handle));
        row.append(player,el('span','board-matches',person.matches),el('strong','board-score',person.score));
        holder.append(row);
      }
    }catch(e){holder.replaceChildren(el('div','empty-state',e.message||'Leaderboard unavailable.'));}
  }
  async function loadState() {
    if(!ready){redraw();drawBoard();notify('The GitHub Pages frontend needs a game-server URL. The Node.js version works independently.',true);return;}
    try {
      state=await rpc('game_state');
      if(session && !state?.user) {
        setSession(null);
        notify('Session expired. Please sign in again.',true);
      }
      redraw();await drawBoard();
    } catch(e) {
      if(e.status===401){
        setSession(null);
        state=null;
        notify('Your session has expired. Please sign in again.',true);
        try{state=await rpc('game_state');}catch{}
        redraw();await drawBoard();return;
      }
      showError(e);redraw();
    }
  }
  async function action(name,args={}) {
    if(busy)return;
    busy=true;redraw();
    try{state=await rpc(name,args);notify(name==='game_submit'?'Lineup submitted successfully.':'Choice saved.');}
    catch(e){showError(e);}
    finally{busy=false;redraw();}
  }
  function assign(stat) {
    if(!session){openAuth('login');return;}
    if(!state?.current){notify('Draw a character first.',true);return;}
    action('game_assign',{p_stat:stat});
  }
  function openAuth(kind) {
    mode=kind||'login';authMode();
    const dialog=$('auth-dialog');
    if(!dialog.open)dialog.showModal();
  }
  function authMode() {
    const signup=mode==='register';
    $('auth-title').textContent=signup?'Join the arena.':'Welcome back.';
    $('auth-hint').textContent=signup?'Choose a unique username and password. No email required.':'Enter your username and password to continue.';
    $('signup-handle-wrap').hidden=false;
    $('signup-handle').required=true;
    $('auth-password').autocomplete=signup?'new-password':'current-password';
    $('auth-submit').textContent=signup?'CREATE ACCOUNT ↗':'SIGN IN ↗';
    $('auth-switch-prefix').textContent=signup?'Already have an account?':'New to the arena?';
    $('auth-switch').textContent=signup?'Sign in':'Create an account';
    $('auth-error').hidden=true;
  }
  async function submitAuth(event) {
    event.preventDefault();
    if(!ready){
      $('auth-error').textContent='Game server not connected yet. Use the public Node.js deployment.';
      $('auth-error').hidden=false;return;
    }
    const username=$('signup-handle').value.trim();
    const password=$('auth-password').value;
    const error=$('auth-error');
    error.hidden=true;
    if(!/^[A-Za-z0-9_-]{3,22}$/.test(username)){
      error.textContent='Username must be 3–22 letters, numbers, _ or -.';
      error.hidden=false;return;
    }
    if(new TextEncoder().encode(password).length<10 || new TextEncoder().encode(password).length>72){
      error.textContent='Password must be 10–72 bytes.';
      error.hidden=false;return;
    }
    $('auth-submit').disabled=true;
    try {
      const isNew=mode==='register';
      const data=await rpc(isNew?'game_register':'game_login',{
        p_handle:username,p_password:password
      });
      if(!data?.token)throw Error('The account server did not return a session.');
      setSession(data);
      $('auth-password').value='';
      $('auth-dialog').close();
      notify(isNew?'Your account has been created. Welcome!':'Signed in successfully.');
      await loadState();
    } catch(e) {
      error.textContent=e.message||String(e);error.hidden=false;
    } finally {$('auth-submit').disabled=false;}
  }
  async function signOut() {
    if(session&&ready){try{await rpc('game_logout');}catch{/* Local sign-out still completes */}}
    setSession(null);state=null;redraw();await loadState();notify('Signed out.');
  }
  function tickCountdown(){
    const now=new Date();
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const obj=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    const midnight=Date.parse(obj.year+'-'+obj.month+'-'+obj.day+'T21:00:00Z');
    let seconds=Math.max(0,Math.floor((midnight-Date.now())/1000));
    const h=Math.floor(seconds/3600);seconds%=3600;
    const m=Math.floor(seconds/60);const s=seconds%60;
    $('countdown').textContent=[h,m,s].map(x=>String(x).padStart(2,'0')).join(' : ');
  }
  $('auth-toggle').addEventListener('click',()=>session?signOut():openAuth('login'));
  $('auth-switch').addEventListener('click',()=>{mode=mode==='login'?'register':'login';authMode();});
  $('close-auth').addEventListener('click',()=>$('auth-dialog').close());
  $('auth-form').addEventListener('submit',submitAuth);
  $('auth-dialog').addEventListener('click',e=>{if(e.target===$('auth-dialog'))$('auth-dialog').close();});
  $('draw-character').addEventListener('click',()=>session?action('game_draw'):openAuth('login'));
  $('submit-lineup').addEventListener('click',()=>{$('confirm-backdrop').hidden=false;});
  $('confirm-cancel').addEventListener('click',()=>{$('confirm-backdrop').hidden=true;});
  $('confirm-submit').addEventListener('click',()=>{$('confirm-backdrop').hidden=true;action('game_submit');});
  document.querySelectorAll('.board-tab').forEach(btn=>btn.addEventListener('click',()=>{
    period=btn.dataset.period;document.querySelectorAll('.board-tab').forEach(t=>t.classList.toggle('active',t===btn));drawBoard();
  }));
  tickCountdown();setInterval(tickCountdown,1000);
  const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let trackedDay=localDay();
  setInterval(()=>{const next=localDay();if(next!==trackedDay){trackedDay=next;loadState();}},15000);
  (async()=>{await loadState();})();
})();
