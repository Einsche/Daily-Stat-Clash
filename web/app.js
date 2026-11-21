(() => {
  "use strict";
  const cfg = window.DAILY_STAT_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test((cfg.supabaseUrl || "").replace(/\/$/, "")) && /^[a-zA-Z0-9._-]{20,}$/.test(cfg.supabaseAnonKey || "");
  const apiBase = (cfg.supabaseUrl || "").replace(/\/$/, "");
  const S = [
    {id:"strength",name:"Strength",code:"STR",hint:"Raw physical power"},
    {id:"dexterity",name:"Dexterity",code:"DEX",hint:"Speed and precision"},
    {id:"battle_iq",name:"Battle IQ",code:"BIQ",hint:"Tactics and strategy"},
    {id:"endurance",name:"Endurance",code:"END",hint:"Durability and stamina"},
    {id:"hacks",name:"Hacks",code:"HAX",hint:"Extraordinary abilities"},
    {id:"iq",name:"IQ",code:"IQ",hint:"Intellect and reasoning"}
  ];
  const $ = id => document.getElementById(id);
  let session = loadSession();
  let game = {user:null,picks:[],current:null,submitted:false,participants:0,totalCharacters:101,leaderboards:{weekly:[],monthly:[],alltime:[]},history:[]};
  let boardPeriod = "weekly";
  let authMode = "login";
  let busy = false;
  let toastTimer;
  function el(tag, className, content) {
    const node = document.createElement(tag);
    if(className) node.className = className;
    if(content != null) node.textContent = String(content);
    return node;
  }
  function loadSession() {
    try {
      const raw = JSON.parse(sessionStorage.getItem("dsc_session_v1") || "null");
      if(!raw || !raw.access_token || !raw.refresh_token) return null;
      return raw;
    } catch {return null;}
  }
  function saveSession(data) {
    session = data ? {access_token:data.access_token, refresh_token:data.refresh_token,expires_at:(data.expires_at || Math.floor(Date.now()/1000)+(data.expires_in||3600))} : null;
    if(session) sessionStorage.setItem("dsc_session_v1", JSON.stringify(session));
    else sessionStorage.removeItem("dsc_session_v1");
  }
  function notify(message) {
    const n=$("notification");n.textContent=message;n.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,5500);
  }
  function asset(path) {return new URL(String(path||"").replace(/^\/+/, ""), document.baseURI).href;}
  function todayIstanbul() {
    const parts=Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const m=Object.fromEntries(parts.filter(v=>v.type!=="literal").map(p=>[p.type,Number(p.value)]));
    return {y:m.year,m:m.month,d:m.day,iso:[m.year,String(m.month).padStart(2,"0"),String(m.day).padStart(2,"0")].join("-")};
  }
  function tick() {
    const t=todayIstanbul();
    $("today-label").textContent=t.iso;
    const next=Date.UTC(t.y,t.m-1,t.d+1,-3,0,0);
    let seconds=Math.max(0,Math.floor((next-Date.now())/1000));
    const hh=String(Math.floor(seconds/3600)).padStart(2,"0");seconds%=3600;
    const mm=String(Math.floor(seconds/60)).padStart(2,"0");const ss=String(seconds%60).padStart(2,"0");
    $("countdown").textContent=hh+" : "+mm+" : "+ss;
  }
  async function request(endpoint, body, useToken=true, retry=true) {
    if(!configured) throw new Error("The account backend has not been connected yet. An administrator must configure Supabase.");
    if(useToken && session && session.expires_at && session.expires_at < Math.floor(Date.now()/1000)+90) {
      await refreshSession();
    }
    const headers={"apikey":cfg.supabaseAnonKey,"Content-Type":"application/json"};
    if(useToken && session) headers.Authorization="Bearer "+session.access_token;
    else headers.Authorization="Bearer "+cfg.supabaseAnonKey;
    const r=await fetch(apiBase+endpoint,{method:"POST",headers,body:JSON.stringify(body||{}),cache:"no-store"});
    let data;try {data=await r.json();}catch {data={};}
    if(!r.ok) {
      if(r.status===401 && retry && useToken && session) {
        try {await refreshSession();return request(endpoint,body,useToken,false);}catch {logout(false);}
      }
      throw new Error(data.msg || data.error_description || data.message || data.error || "Unable to complete this request.");
    }
    return data;
  }
  async function refreshSession(){
    if(!session || !configured) throw new Error("Session expired. Please sign in.");
    const r=await fetch(apiBase+"/auth/v1/token?grant_type=refresh_token",{
      method:"POST",headers:{"apikey":cfg.supabaseAnonKey,"Content-Type":"application/json"},
      body:JSON.stringify({refresh_token:session.refresh_token})
    });
    if(!r.ok) {saveSession(null);throw new Error("Your session expired. Please sign in again.");}
    saveSession(await r.json());
  }
  async function rpc(name, body={}, useToken=true){return request("/rest/v1/rpc/"+name,body,useToken);}
  async function reloadGame() {
    if(!configured){render();return;}
    try {
      if(session){game=await rpc("game_state");}
      else {
        const [weekly,monthly,alltime]=await Promise.all(["weekly","monthly","alltime"].map(p=>rpc("leaderboard",{p_period:p},false)));
        game={user:null,picks:[],current:null,submitted:false,totalCharacters:101,participants:0,leaderboards:{weekly,monthly,alltime},history:[]};
      }
      render();
    } catch(e){render();notify(e.message);}
  }
  function render() {
    const picks=Array.isArray(game.picks)?game.picks:[];
    const signedIn=!!(session && game.user);
    $("user-handle").hidden=!signedIn;
    $("user-handle").textContent=signedIn?"@"+game.user.handle:"";
    $("auth-toggle").textContent=signedIn?"SIGN OUT ↗":"SIGN IN ↗";
    $("count-players").textContent=String(game.participants||0).padStart(2,"0");
    $("count-characters").textContent=game.totalCharacters || 101;
    $("progress-count").innerHTML="";
    $("progress-count").append(document.createTextNode(String(picks.length).padStart(2,"0")+" "));
    $("progress-count").append(el("span","", "/ 6"));
    $("progress-fill").style.width=(100*picks.length/6)+"%";
    const statGrid=$("stat-grid");statGrid.replaceChildren();
    for(const stat of S){
      const pick=picks.find(p=>p.stat===stat.id);
      const slot=el("button","stat-slot"+(pick?" filled":signedIn && game.current && !game.submitted?" available":""));
      slot.type="button";slot.disabled=!!pick || !signedIn || !game.current || !!game.submitted || busy;
      slot.setAttribute("aria-label",pick ? stat.name+" assigned to "+pick.name : "Assign current character to "+stat.name);
      const left=el("div","slot-person");
      if(pick && pick.portrait_url){const img=el("img");img.src=asset(pick.portrait_url);img.alt="";img.loading="lazy";left.append(img);}
      const info=el("div","slot-person-name");
      info.append(el("strong","",stat.name),el("small","",pick?pick.name:stat.hint));
      left.append(info);
      slot.append(left,el("span","stat-code",pick?"✓":stat.code));
      if(!pick) slot.addEventListener("click",()=>choose(stat.id));
      statGrid.append(slot);
    }
    const current=game.current;
    const img=$("current-portrait");
    img.hidden=!current;
    $("portrait-fallback").hidden=!!current;
    if(current){img.src=asset(current.portrait_url);img.alt="Portrait of "+current.name;}
    else {img.removeAttribute("src");img.alt="";}
    $("current-world").textContent=current ? current.universe : game.submitted?"LINEUP LOCKED":signedIn?"ALL DRAWS COMPLETE":"THE ARENA AWAITS";
    $("current-name").textContent=current ? current.name : game.submitted?"Ready for battle.":signedIn&&picks.length===6?"All six assigned.":"A fighter is waiting.";
    $("draw-description").textContent=current ? "Choose a stat slot for this character. The value remains hidden until midnight." : game.submitted?"Your lineup is submitted. Come back for the results after midnight Istanbul time.":signedIn?"Your next challenge is ready as soon as you start.":"Sign in to reveal your next character and build your lineup.";
    $("draw-number").textContent=game.submitted?"SUBMITTED": "DRAW "+String(Math.min(6,picks.length+1)).padStart(2,"0")+" / 06";
    $("draw-note").textContent=game.submitted?"AWAITING THE NEXT MATCHUP":"STATS HIDDEN UNTIL REVEAL";
    const submit=$("submit-lineup");submit.disabled=!signedIn||picks.length!==6||!!game.submitted||busy;
    submit.textContent=game.submitted?"LINEUP LOCKED ✓":"SUBMIT LINEUP ↗";
    $("lineup-status").textContent=!configured?"Awaiting server connection. Configure Supabase to activate accounts.":!signedIn?"Sign in to begin today's challenge.":game.submitted?"Your picks are final for today.":picks.length<6?String(6-picks.length)+" more fighter"+(6-picks.length===1?"":"s")+" to assign.":"Your lineup is ready to submit.";
    renderLeaderboard();renderHistory();
  }
  function renderLeaderboard() {
    const root=$("leaderboard-rows");root.replaceChildren();
    const rows=(game.leaderboards||{})[boardPeriod]||[];
    if(!rows.length){root.append(el("div","empty-state",configured?"No ranked players yet. Be the first to enter the arena.":"Rankings appear once the backend is connected."));return;}
    rows.forEach((p,i)=>{
      const row=el("div","board-row");
      const player=el("div","board-player");player.append(el("span","board-rank",String(i+1).padStart(2,"0")),el("span","board-avatar",p.handle.slice(0,1).toUpperCase()),el("span","board-player-name",p.handle));
      row.append(player,el("span","",p.matches||0),el("span","board-score",p.score||0));
      root.append(row);
    });
  }
  function renderHistory() {
    const root=$("history-list");root.replaceChildren();
    if(!game.history?.length){root.append(el("div","empty-state",!session?"Sign in to view your match history.":"Your past matchups will appear here after the daily settlement."));return;}
    game.history.forEach(h=>{
      const div=el("div","history-entry");div.append(el("span","history-date",h.day));
      const player=el("div","history-opponent","VS "+(h.opponent_handle||"UNKNOWN"));
      player.append(el("small","",h.is_bye?"No opponent":h.your_score>h.opponent_score?"VICTORY":h.your_score<h.opponent_score?"DEFEAT":"DRAW"));
      div.append(player,el("span","history-result "+(h.your_score>h.opponent_score?"win":h.your_score<h.opponent_score?"lose":""),(h.your_score||0)+" : "+(h.opponent_score||0)));
      root.append(div);
    });
  }
  async function choose(stat) {
    if(busy||!game.current||game.submitted)return;busy=true;render();
    try{game=await rpc("assign_stat",{p_stat:stat});}
    catch(e){notify(e.message);}
    finally{busy=false;render();}
  }
  async function submit() {
    if(busy||game.picks.length!==6)return;
    busy=true;render();
    try{game=await rpc("submit_lineup");notify("Lineup locked. Your daily challenge has been submitted!");}
    catch(e){notify(e.message);}
    finally{busy=false;render();}
  }
  function showAuth() {
    if(!configured) {notify("Account registration needs the Supabase project connection. The GitHub Pages interface is ready.");return;}
    setAuthMode("login");$("auth-dialog").showModal();
  }
  function setAuthMode(mode) {
    authMode=mode;$("auth-title").textContent=mode==="login"?"Welcome back.":"Join the contenders.";
    $("auth-hint").textContent=mode==="login"?"Sign in to save your picks and challenge other players.":"Create your player account. Your scores and match history will be saved permanently.";
    $("signup-handle-wrap").hidden=mode!=="register";
    $("auth-password").autocomplete=mode==="login"?"current-password":"new-password";
    $("auth-submit").textContent=mode==="login"?"SIGN IN ↗":"CREATE ACCOUNT ↗";
    $("auth-switch-prefix").textContent=mode==="login"?"New to the arena?":"Already competing?";
    $("auth-switch").textContent=mode==="login"?"Create an account":"Sign in";
    $("auth-error").hidden=true;
  }
  async function onAuth(e) {
    e.preventDefault();if(busy)return;
    const email=$("auth-email").value.trim().toLowerCase();
    const password=$("auth-password").value;
    const handle=$("signup-handle").value.trim();
    const err=$("auth-error");err.hidden=true;
    if(!email||!email.includes("@")){err.textContent="Enter a valid email address.";err.hidden=false;return;}
    if(password.length<8){err.textContent="Password must be at least 8 characters.";err.hidden=false;return;}
    if(authMode==="register" && !/^[A-Za-z0-9_]{3,22}$/.test(handle)){err.textContent="Player name must be 3–22 characters using letters, numbers or underscore.";err.hidden=false;return;}
    busy=true;$("auth-submit").disabled=true;
    try{
      if(authMode==="register"){
        const d=await request("/auth/v1/signup",{email,password,data:{handle}},false);
        if(d.access_token && d.refresh_token){saveSession(d);$("auth-dialog").close();await reloadGame();notify("Account created. Welcome to the arena.");}
        else{setAuthMode("login");notify("Account created. Check your email for a confirmation link before signing in.");}
      }else{
        const d=await request("/auth/v1/token?grant_type=password",{email,password},false);
        if(!d.access_token)throw new Error("Sign-in did not return a session.");
        saveSession(d);$("auth-dialog").close();await reloadGame();notify("Signed in successfully.");
      }
    }catch(ex){err.textContent=ex.message;err.hidden=false;}
    finally{busy=false;$("auth-submit").disabled=false;}
  }
  function logout(message=true){saveSession(null);game={...game,user:null,picks:[],current:null,submitted:false,history:[]};render();reloadGame();if(message)notify("Signed out.");}
  document.querySelectorAll(".board-tab").forEach(btn=>btn.addEventListener("click",()=>{
    boardPeriod=btn.dataset.period;document.querySelectorAll(".board-tab").forEach(b=>b.classList.toggle("active",b===btn));renderLeaderboard();
  }));
  $("auth-toggle").addEventListener("click",()=>session?logout():showAuth());
  $("close-auth").addEventListener("click",()=>$("auth-dialog").close());
  $("auth-switch").addEventListener("click",()=>setAuthMode(authMode==="login"?"register":"login"));
  $("auth-form").addEventListener("submit",onAuth);
  $("submit-lineup").addEventListener("click",()=>$("confirm-backdrop").hidden=false);
  $("confirm-cancel").addEventListener("click",()=>$("confirm-backdrop").hidden=true);
  $("confirm-submit").addEventListener("click",()=>{$("confirm-backdrop").hidden=true;submit();});
  $("confirm-backdrop").addEventListener("click",e=>{if(e.target===$("confirm-backdrop"))$("confirm-backdrop").hidden=true;});
  tick();setInterval(tick,1000);
  if(session && !configured)saveSession(null);
  render();reloadGame();
})();