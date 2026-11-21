import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/')({ component: DailyClash })

type Stat = 'strength' | 'dexterity' | 'battle_iq' | 'endurance' | 'hacks' | 'iq'
type Character = { id: string; name: string; universe: string; portrait_url: string }
type Pick = { character_id: string; stat: Stat; name: string; universe: string; portrait_url: string }
type Leader = { id: string; rank: number; handle: string; score: number; matches: number }
type Duel = {day:string;stat:Stat;p1_value:number;p2_value:number;winner_id:string|null;p1:string;p2:string;left_name:string;right_name:string;left_image:string;right_image:string;left_handle:string;right_handle:string}
type Game = {day:string;user:{id:string;handle:string}|null;participants:number;totalCharacters:number;leaderboards:{weekly:Leader[];monthly:Leader[];alltime:Leader[]};picks:Pick[];current:Character|null;submitted:boolean;needsDraw:boolean;history:Duel[]}
type Mode = 'login'|'register'
type BoardPeriod = 'weekly'|'monthly'|'alltime'
const STAT_INFO: Array<{id:Stat;label:string;symbol:string;description:string}> = [
  {id:'strength',label:'Strength',symbol:'STR',description:'Raw physical power'},
  {id:'dexterity',label:'Dexterity',symbol:'DEX',description:'Speed & precision'},
  {id:'battle_iq',label:'Battle IQ',symbol:'BIQ',description:'Tactics in a fight'},
  {id:'endurance',label:'Endurance',symbol:'END',description:'Durability & stamina'},
  {id:'hacks',label:'Hacks',symbol:'HAX',description:'Special abilities'},
  {id:'iq',label:'IQ',symbol:'IQ',description:'Intellect & reasoning'},
]
function shortDate(day:string) {try {return new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}catch{return day}}
function countdown(day:string,now:number){if(!now)return '— : — : —';const t=Math.max(0,Date.parse(day+'T21:00:00Z')-now);const sec=Math.floor(t/1000);return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(x=>String(x).padStart(2,'0')).join(' : ')}

function Portrait({character,variant='standard'}:{character:Character;variant?:'standard'|'mini'|'hero'}) {
  const [broken,setBroken]=useState(false)
  useEffect(()=>setBroken(false),[character.id,character.portrait_url])
  return <div className={'portrait portrait-'+variant}>
    {character.portrait_url && !broken ? <img src={character.portrait_url} alt={character.name+' character reference'} loading={variant==='mini'?'lazy':'eager'} onError={()=>setBroken(true)}/> : <div className="portrait-placeholder"><span className="portrait-mark">{character.name.slice(0,1)}</span><span className="portrait-orbit"/></div>}
    <div className="portrait-grain"/>
  </div>
}
function StatIcon({symbol}:{symbol:string}){return <span className="stat-glyph">{symbol}</span>}

function DailyClash(){
  const [data,setData]=useState<Game|null>(null)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [authOpen,setAuthOpen]=useState(false)
  const [mode,setMode]=useState<Mode>('register')
  const [handle,setHandle]=useState('')
  const [password,setPassword]=useState('')
  const [boardPeriod,setBoardPeriod]=useState<BoardPeriod>('weekly')
  const [now,setNow]=useState(0)
  const [activeView,setActiveView]=useState<'leaderboard'|'history'>('leaderboard')
  useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer)},[])
  async function refresh(tryDraw=true):Promise<Game|null>{
    try{
      const response=await fetch('/api/game',{cache:'no-store',credentials:'include'})
      if(!response.ok)throw new Error('Could not load today’s arena')
      const next=await response.json() as Game
      if(tryDraw && next.user && next.needsDraw){
        const drawn=await fetch('/api/game',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({action:'draw'})})
        if(drawn.ok)return refresh(false)
      }
      setData(next);return next
    }catch(e){setError(e instanceof Error?e.message:'Something went wrong');return null}
  }
  useEffect(()=>{void refresh()},[])
  async function action(kind:string,extra:Record<string,string>={}) {
    setBusy(kind);setError('')
    try{
      const r=await fetch('/api/game',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({action:kind,...extra})})
      const json=await r.json() as {ok?:boolean;error?:string}
      if(!r.ok)throw new Error(json.error||'Could not complete action')
      if(kind==='register'||kind==='login'){setAuthOpen(false);setPassword('')}
      await refresh()
    }catch(e){setError(e instanceof Error?e.message:'Action failed')}
    finally{setBusy('')}
  }
  const completed=data?.picks.length??0
  const pickMap=useMemo(()=>new Map(data?.picks.map(p=>[p.stat,p])??[]),[data?.picks])
  const leaders=data?.leaderboards[boardPeriod]??[]
  const myRank=leaders.find(x=>x.id===data?.user?.id)
  const myDuels=data?.history??[]
  const wins=myDuels.filter(x=>x.winner_id===data?.user?.id).length
  const matchDays=[...new Set(myDuels.map(x=>x.day))]
  return <div className="site-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar container">
      <a className="brand" href="/" aria-label="Daily Stat Clash home"><span className="brand-icon"><span>✳</span></span><span className="brand-word"><strong>STAT CLASH</strong><small>THE DAILY DRAFT</small></span></a>
      <div className="topnav"><span className="nav-current">THE ARENA</span><a href="#rankings">RANKINGS</a><a href="#rules">HOW IT WORKS</a></div>
      <div className="header-end"><span className="online-dot"/><span className="header-player-count">{data?.participants??0} lineups today</span>{data?.user?<button className="profile-pill" onClick={()=>action('logout')} disabled={!!busy}><span className="avatar-initial">{data.user.handle.slice(0,1).toUpperCase()}</span>{data.user.handle}<span className="logout-label">Sign out</span></button>:<button className="header-signin" onClick={()=>{setMode('login');setAuthOpen(true)}}>Sign in <span>↗</span></button>}</div>
    </header>
    <main className="container">
      <div className="intro"><div><div className="season-line"><span className="season-mark">SEASON 01</span><span className="separator-dot">•</span><span>DAILY CHARACTER MATCHUP</span></div><h1>Build your <em>legendary</em><br/>lineup.</h1><p>Six random characters. Six stats. One final decision for each.<br className="desktop-break"/> Make your picks before the midnight showdown.</p></div><div className="countdown-block"><div className="countdown-label"><span className="live-indicator"/> NEXT MATCHUP IN</div><div className="countdown-time">{data?countdown(data.day,now):'— : — : —'}</div><div className="countdown-foot">{data?shortDate(data.day):'Loading date'} <span>·</span> 00:00 Istanbul (UTC+3)</div></div></div>
      {error&&<div className="alert"><span>!</span>{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
      <section className="game-layout" aria-label="Today's draft">
        <div className="draft-surface"><div className="surface-heading"><div className="heading-left"><span className="micro-tag">01 / THE DRAW</span><h2>Today's challenger</h2></div><div className="top-status"><span className={data?.submitted?'status-dot is-submitted':'status-dot'}/>{data?.submitted?'LOCKED IN':`${completed} OF 6 ASSIGNED`}</div></div>
          <div className="draft-core">
            <div className="character-stage">
              {data?.current && !data.submitted ? <>
                <div className="frame-stamp">CHARACTER #{String(completed+1).padStart(2,'0')}</div>
                <Portrait character={data.current} variant="hero"/>
                <div className="character-details"><span className="character-universe">{data.current.universe}</span><h3>{data.current.name}</h3><div className="no-peek"><span>◉</span> STATS HIDDEN</div></div>
              </>:data?.user && data.submitted ? <div className="stage-complete"><div className="complete-seal">✓</div><h3>Lineup submitted</h3><p>Your six picks are locked. The results will be revealed after the daily matchup.</p><div className="complete-date">NEXT DRAFT · TOMORROW</div></div>:data?.user && completed===6 ? <div className="stage-complete"><div className="complete-seal">6/6</div><h3>All slots filled</h3><p>Your lineup is ready. Review your six characters and submit your draft.</p></div>:data?.user ? <div className="stage-loading"><span className="loading-ring"/><p>Drawing your next challenger...</p></div>:<div className="stage-guest"><div className="guest-emblem"><span>✳</span></div><span className="guest-eyebrow">YOUR DAILY CHALLENGE AWAITS</span><h3>A new challenger.<br/><em>Every pick.</em></h3><p>Every account receives six surprise characters. Choose the best stat for each one. No rerolls. No second chances.</p><button className="primary-cta" onClick={()=>{setMode('register');setAuthOpen(true)}}>JOIN THE ARENA <span>↗</span></button><div className="guest-bottom">FREE TO PLAY <span>·</span> NEW DRAFT EVERY DAY</div></div>}
            </div>
            <div className="assign-zone"><div className="assign-heading"><div><span className="micro-tag">02 / THE LINEUP</span><h2>Assign a stat</h2></div><span className="assign-helper">{data?.user?'Tap an empty slot':'Your six stat slots'}</span></div>
              <div className="slots-grid">{STAT_INFO.map((info,i)=>{const pick=pickMap.get(info.id);const playable=!!data?.user&&!data.submitted&&!!data.current&&!pick&&!busy;return <button key={info.id} className={'stat-slot '+(pick?'filled ':'')+(playable?'playable ':'')+(data?.submitted?'frozen':'')} disabled={!playable} onClick={()=>action('assign',{stat:info.id})} aria-label={pick?`${info.label}: ${pick.name}`:`Assign ${data?.current?.name??'current character'} to ${info.label}`}><div className="slot-upper"><StatIcon symbol={info.symbol}/><span className="slot-index">0{i+1}</span></div><div className="slot-name">{info.label}</div>{pick?<div className="slot-assigned"><Portrait character={{id:pick.character_id,name:pick.name,universe:pick.universe,portrait_url:pick.portrait_url}} variant="mini"/><span>{pick.name}</span><b>✓</b></div>:<div className="slot-empty"><span>+</span> {info.description}</div>}</button>})}</div>
              <div className="draft-footer"><div className="progress-line"><div className="progress-text"><span>LINEUP PROGRESS</span><strong>{completed}<span> / 6</span></strong></div><div className="progress-track"><div style={{width:`${completed/6*100}%`}}/></div></div><button className={'submit-button '+(completed===6&&!data?.submitted?'submit-ready':'')} disabled={!data?.user||completed!==6||data.submitted||!!busy} onClick={()=>action('submit')}>{data?.submitted?'✓ LINEUP LOCKED':busy==='submit'?'SUBMITTING...':'SUBMIT LINEUP'}<span>↗</span></button></div>
              <div className="integrity-note"><span>⌁</span> One draw per pick. Characters are unique within your daily lineup. Your picks are saved automatically.</div>
            </div>
          </div>
        </div>
        <aside className="sidebar" id="rankings"><div className="leaderboard-card"><div className="sidebar-head"><span className="micro-tag">03 / THE COMPETITION</span><h2>Leaderboard <span>✦</span></h2><p>Every winning stat matchup earns one point.</p></div><div className="period-tabs" role="tablist">{(['weekly','monthly','alltime'] as const).map(period=><button role="tab" aria-selected={boardPeriod===period} key={period} onClick={()=>setBoardPeriod(period)} className={boardPeriod===period?'selected':''}>{period==='alltime'?'All time':period[0].toUpperCase()+period.slice(1)}</button>)}</div><div className="leaders-head"><span>RANK / PLAYER</span><span>PTS</span></div><div className="leaders-list">{leaders.length?leaders.slice(0,10).map(p=><div key={p.id} className={'leader-row '+(p.rank<=3?'leader-top ':'')+(p.id===data?.user?.id?'leader-you':'')}><span className="leader-rank">{String(p.rank).padStart(2,'0')}</span><span className="leader-avatar">{p.handle[0]?.toUpperCase()}</span><span className="leader-name">{p.handle}{p.id===data?.user?.id&&<small>YOU</small>}</span><span className="leader-score">{p.score}</span></div>):<p className="empty-board">No scores yet. Your first matchup is waiting.</p>}</div>{myRank&&myRank.rank>10&&<div className="your-rank"><span>YOUR POSITION #{myRank.rank}</span><strong>{myRank.score} PTS</strong></div>}<div className="sidebar-foot"><span className="tiny-sparkle">✧</span> Rankings update after midnight.</div></div>
          <div className="side-mini-card"><div className="side-mini-icon">◈</div><div><span>THE CHARACTER POOL</span><strong>{data?.totalCharacters??101} challengers</strong><p>Across 12 original fantasy worlds</p></div></div>
        </aside>
      </section>
      <section className="secondary-grid" id="rules"><div className="how-card"><div className="section-kicker">THE RULEBOOK</div><h2>Every choice<br/><em>has consequences.</em></h2><div className="steps"><div><b>01</b><strong>Draw</strong><p>One mystery character at a time. No skips, no rerolls.</p></div><div><b>02</b><strong>Assign</strong><p>Give each of your six characters a different stat.</p></div><div><b>03</b><strong>Battle</strong><p>At midnight, your lineup faces another player's. Higher stat wins +1, ties score 0.</p></div></div></div><div className="history-card"><div className="history-header"><div><div className="section-kicker">THE ARCHIVE</div><h2>Match history</h2></div><span className="history-tally">{data?.user?`${wins} TOTAL WINS`:'SIGN IN TO VIEW'}</span></div>{data?.user&&myDuels.length? <><div className="history-filter"><button className={activeView==='leaderboard'?'chosen':''} onClick={()=>setActiveView('leaderboard')}>Latest results</button><button className={activeView==='history'?'chosen':''} onClick={()=>setActiveView('history')}>Recent days ({matchDays.length})</button></div><div className="duel-list">{myDuels.filter(x=>activeView==='history'||x.day===matchDays[0]).slice(0,24).map((duel,i)=>{const mine=duel.p1===data.user?.id, won=duel.winner_id===data.user?.id, tie=duel.winner_id===null;return <div className="duel-row" key={i}><div className="duel-topline"><span>{shortDate(duel.day)} · {STAT_INFO.find(x=>x.id===duel.stat)?.label}</span><span className={won?'duel-win':tie?'duel-tie':'duel-loss'}>{won?'+1 WIN':tie?'DRAW':'LOSS'}</span></div><div className="duel-comparison"><span className="duel-fighter">{mine?duel.left_name:duel.right_name}<small>YOU · {mine?duel.p1_value:duel.p2_value}</small></span><span className="duel-versus">VS</span><span className="duel-fighter duel-right">{mine?duel.right_name:duel.left_name}<small>{mine?duel.right_handle:duel.left_handle} · {mine?duel.p2_value:duel.p1_value}</small></span></div></div>})}</div></>:<div className="history-empty"><span className="history-empty-emblem">◎</span><strong>{data?.user?'Your story begins at midnight.':'Your battles. Your legacy.'}</strong><p>{data?.user?'Submit your daily draft to enter the matchup pool. Results appear here after the midnight showdown.':'Sign in to see your previous matchups, character stat reveals and points earned.'}</p></div>}</div></section>
      <footer className="footer"><div className="footer-brand">✳ <strong>STAT CLASH</strong></div><span>Daily Character Matchup · Independent fan project</span><span>All times Europe/Istanbul · Original character illustrations</span></footer>
    </main>
    {authOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setAuthOpen(false)}} role="presentation"><div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" aria-label="Close" onClick={()=>setAuthOpen(false)}>×</button><div className="modal-sigil">✳</div><span className="section-kicker">ENTER THE ARENA</span><h2 id="auth-title">{mode==='register'?'Your legend starts here.':'Welcome back.'}</h2><p>{mode==='register'?'Create your free account to start drafting today.':'Sign in to continue your daily lineup.'}</p>{error&&<div className="auth-error" role="alert">{error}</div>}<form onSubmit={e=>{e.preventDefault();void action(mode,{handle,password})}}><label>USERNAME<input autoComplete="username" required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" value={handle} onChange={e=>setHandle(e.target.value)} placeholder="your_handle"/></label><label>PASSWORD<input autoComplete={mode==='register'?'new-password':'current-password'} required minLength={8} maxLength={72} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="auth-submit" disabled={!!busy} type="submit">{busy?'PLEASE WAIT...':mode==='register'?'CREATE ACCOUNT':'SIGN IN'} <span>↗</span></button></form><div className="switch-auth">{mode==='register'?'Already have an account?':'New to the arena?'} <button onClick={()=>{setMode(mode==='register'?'login':'register');setError('')}}>{mode==='register'?'Sign in':'Create account'}</button></div></div></div>}
  </div>
}
