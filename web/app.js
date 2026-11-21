/* Daily Stat Clash — independent GitHub Pages client, Supabase GoTrue + RPC */
(() => {
  'use strict';
  const config = window.DAILY_CLASH_CONFIG || {};
  const ready = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const apiBase = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const sessionKey = 'daily-stat-clash.supabase-session.v1';
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
    try { const x = JSON.parse(localStorage.getItem(sessionKey) || 'null');
      return x && typeof x.access_token==='string' && typeof x.refresh_token==='string' ? x : null; }
    catch { return null; }
  };
  const setSession = x => {
    session = x;
    if (x) localStorage.setItem(sessionKey, JSON.stringify(x));
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
  async function authFetch(path,payload) {
    const res=await fetch(apiBase+'/auth/v1/'+path,{method:'POST',headers:{
      'Content-Type':'application/json','apikey':config.supabaseAnonKey,
      ...(session?.access_token?{'Authorization':'Bearer '+session.access_token}:{})
    },body:JSON.stringify(payload)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw Error(data.msg||data.error_description||data.message||data.error||'Authentication failed');
    return data;
  }
  async function refresh() {
    if(!session?.refresh_token)return false;
    try{
      const data=await authFetch('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
      setSession(data); return true;
    } catch {setSession(null);return false;}
  }
  async function rpc(name,body={},retry=true) {
    if(!ready) throw Error('Backend not connected. Configure Supabase URL and publishable key in web/config.js.');
    const request=()=>fetch(apiBase+'/rest/v1/rpc/'+name,{method:'POST',headers:{
      'Content-Type':'application/json','apikey':config.supabaseAnonKey,
      'Authorization':'Bearer '+(session?.access_token||config.supabaseAnonKey)
    },body:JSON.stringify(body)});
    let res=await request();
    if(res.status===401 && retry && await refresh()) res=await request();
    const data=await res.json().catch(()=>null);
    if(!res.ok) throw Error(data?.message||data?.error||'Server request failed ('+res.status+')');
    return data;
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
    if(!ready){redraw();drawBoard();notify('Supabase backend must be connected before accounts can be created.',true);return;}
    try{
      state=await rpc('game_state');
      redraw();await drawBoard();
    }catch(e){showError(e);redraw();}
  }
  async function action(name,args={}) {
    if(busy)return;
    busy=true;redraw();
    try{state=await rpc(name,args);if(name==='game_draw') {
      state=await rpc('game_state');
    }notify(name==='game_submit'?'Lineup submitted successfully.':'Choice saved.');}
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
    $('auth-hint').textContent=signup?'Create an account to compete every day.':'Sign in to save picks and face other challengers.';
    $('signup-handle-wrap').hidden=!signup;
    $('signup-handle').required=signup;
    $('auth-password').autocomplete=signup?'new-password':'current-password';
    $('auth-submit').textContent=signup?'CREATE ACCOUNT ↗':'SIGN IN ↗';
    $('auth-switch-prefix').textContent=signup?'Already have an account?':'New to the arena?';
    $('auth-switch').textContent=signup?'Sign in':'Create an account';
    $('auth-error').hidden=true;
  }
  async function submitAuth(event) {
    event.preventDefault();
    if(!ready){$('auth-error').textContent='Connect a Supabase project in web/config.js to activate registration and login.';$('auth-error').hidden=false;return;}
    const email=$('auth-email').value.trim();
    const password=$('auth-password').value;
    const handle=$('signup-handle').value.trim();
    if(password.length<8){$('auth-error').textContent='Password must have at least eight characters.';$('auth-error').hidden=false;return;}
    if(mode==='register'&&!/^[a-zA-Z0-9_-]{3,22}$/.test(handle)){$('auth-error').textContent='Player name must be 3–22 letters, numbers, _ or -.';$('auth-error').hidden=false;return;}
    $('auth-submit').disabled=true;
    try{
      const payload=mode==='register'?{email,password,data:{handle}}:{email,password};
      const data=await authFetch(mode==='register'?'signup':'token?grant_type=password',payload);
      if(data.access_token){
        setSession(data);
        $('auth-dialog').close();notify('Signed in successfully.');await loadState();
      }else {
        $('auth-dialog').close();notify('Account created. Check your email for a confirmation link before signing in.');
      }
    }catch(e){$('auth-error').textContent=e.message;$('auth-error').hidden=false;}
    finally{$('auth-submit').disabled=false;}
  }
  async function signOut() {
    if(session&&ready){try{await authFetch('logout',{});}catch{/* Local sign-out still completes */}}
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
  (async()=>{
    if(session)await refresh();
    await loadState();
  })();
})();
