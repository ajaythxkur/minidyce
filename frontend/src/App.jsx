import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useInterwovenKit } from "@initia/interwovenkit-react"
import { RESTClient, AccAddress } from "@initia/initia.js"
import { MsgExecute } from "@initia/initia.proto/initia/move/v1/tx"
import { Coins, Dices, Target, Rocket, CircleDot, Gift, Home, Gamepad2, ChevronDown, Zap, Shield, Eye, ArrowUpRight, Wallet, Power, ArrowRightLeft, RefreshCw, Copy, Check, LogOut, FileText, Trophy, ExternalLink, Volume2, VolumeX, Music } from 'lucide-react'

// ========== SOUND ENGINE (Web Audio API — no files, no copyright) ==========
const AudioCtx=window.AudioContext||window.webkitAudioContext
let _ctx=null
function getCtx(){if(!_ctx)_ctx=new AudioCtx();return _ctx}

// Global mute state
let _sfxMuted=localStorage.getItem('sfx_muted')==='1'
let _musicMuted=localStorage.getItem('music_muted')==='1'
let _musicGain=null
let _musicPlaying=false

const SFX={
  flip:()=>{if(_sfxMuted)return;const c=getCtx(),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(800,c.currentTime);o.frequency.exponentialRampToValueAtTime(400,c.currentTime+0.15);g.gain.setValueAtTime(0.15,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.15);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+0.15)},
  win:()=>{if(_sfxMuted)return;const c=getCtx();[523,659,784].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0.12,c.currentTime+i*0.1);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+i*0.1+0.3);o.connect(g);g.connect(c.destination);o.start(c.currentTime+i*0.1);o.stop(c.currentTime+i*0.1+0.3)})},
  lose:()=>{if(_sfxMuted)return;const c=getCtx(),o=c.createOscillator(),g=c.createGain();o.type='sawtooth';o.frequency.setValueAtTime(300,c.currentTime);o.frequency.exponentialRampToValueAtTime(150,c.currentTime+0.3);g.gain.setValueAtTime(0.1,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.3);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+0.3)},
  bet:()=>{if(_sfxMuted)return;const c=getCtx(),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(600,c.currentTime);o.frequency.exponentialRampToValueAtTime(900,c.currentTime+0.08);g.gain.setValueAtTime(0.08,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.08);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+0.08)},
  drop:()=>{if(_sfxMuted)return;const c=getCtx(),o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.setValueAtTime(1200,c.currentTime);o.frequency.exponentialRampToValueAtTime(200,c.currentTime+0.4);g.gain.setValueAtTime(0.1,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.4);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+0.4)},
  pop:()=>{if(_sfxMuted)return;const c=getCtx(),o=c.createOscillator(),g=c.createGain();o.type='square';o.frequency.setValueAtTime(400,c.currentTime);o.frequency.exponentialRampToValueAtTime(80,c.currentTime+0.12);g.gain.setValueAtTime(0.15,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.12);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+0.12)},
}

// Procedural ambient music — chill lo-fi loop, no copyright
let _musicTimer=null

function startMusic(){
  if(_musicPlaying)return
  const c=getCtx()
  _musicGain=c.createGain()
  _musicGain.gain.value=_musicMuted?0:0.03
  _musicGain.connect(c.destination)
  _musicPlaying=true

  const chords=[[220,261,330],[174,220,261],[261,330,392],[196,247,294]]
  const melody=[330,392,440,392,330,294,330,392]
  let chordIdx=0

  const playChord=()=>{
    if(!_musicPlaying)return
    const notes=chords[chordIdx%chords.length]
    notes.forEach(f=>{
      const o=c.createOscillator(),g=c.createGain()
      o.type='sine';o.frequency.value=f
      g.gain.setValueAtTime(0.3,c.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+4)
      o.connect(g);g.connect(_musicGain);o.start();o.stop(c.currentTime+4)
    })
    const note=melody[chordIdx%melody.length]
    const mo=c.createOscillator(),mg=c.createGain()
    mo.type='triangle';mo.frequency.value=note*2
    mg.gain.setValueAtTime(0.15,c.currentTime+0.5)
    mg.gain.exponentialRampToValueAtTime(0.001,c.currentTime+2)
    mo.connect(mg);mg.connect(_musicGain);mo.start(c.currentTime+0.5);mo.stop(c.currentTime+2)
    chordIdx++
    _musicTimer=setTimeout(playChord,4000)
  }
  playChord()
}

function stopMusic(){
  _musicPlaying=false
  clearTimeout(_musicTimer)
  if(_musicGain){_musicGain.gain.value=0;_musicGain=null}
}

function setMusicVolume(muted){
  _musicMuted=muted
  if(muted){stopMusic()}
  else if(!_musicPlaying){startMusic()}
}

const CHAIN = 'local-rollup-1'
const MOD = 'init1p689cmd8yrgag24z6dq0kpqnlz7t6qyj2chfgs'
const API = 'http://localhost:1317'
const rest = new RESTClient(API, { chainId: CHAIN })
const D = 6
const fmt = n => (n / 10**D).toFixed(2)

function enc(a){return Buffer.from(AccAddress.toHex(a).replace('0x','').padStart(64,'0'),'hex').toString('base64')}
async function qv(m,f,a=[]){try{const r=await rest.move.view(MOD,m,f,[],a);return JSON.parse(r.data)}catch{return null}}
function short(a){return a?`${a.slice(0,10)}..${a.slice(-4)}`:''}
function u64b(n){const b=new Uint8Array(8);let v=BigInt(n);for(let i=0;i<8;i++){b[i]=Number(v&0xFFn);v>>=8n}return b}
function ago(ts){const s=Math.floor((Date.now()-new Date(ts).getTime())/1000);if(s<60)return `${s}s`;if(s<3600)return `${Math.floor(s/60)}m`;if(s<86400)return `${Math.floor(s/3600)}h`;return `${Math.floor(s/86400)}d`}

const GAME_ICONS = {
  coinflip: <Coins size={18}/>,
  lootbox: <Gift size={18}/>,
  range: <Target size={18}/>,
  limbo: <Rocket size={18}/>,
  plinko: <CircleDot size={18}/>,
}

const GAMES=[
  {id:'home',name:'Home',icon:<Home size={18}/>},
  {id:'coinflip',name:'Coinflip',icon:GAME_ICONS.coinflip,mult:'x2'},
  {id:'lootbox',name:'Lootbox',icon:GAME_ICONS.lootbox,mult:'up to x10'},
  {id:'range',name:'Range',icon:GAME_ICONS.range,mult:'up to x99'},
  {id:'limbo',name:'Limbo',icon:GAME_ICONS.limbo,mult:'up to x100'},
  {id:'plinko',name:'Plinko',icon:GAME_ICONS.plinko,mult:'up to x6'},
]

// ========== TX HISTORY (INDEXER WS) ==========
const EXPLORER = 'https://scan.testnet.initia.xyz/local-rollup-1/txs'
const EXPLORER_ADDR = 'https://scan.testnet.initia.xyz/local-rollup-1/accounts'
const INDEXER_WS_URL = 'ws://localhost:4000/ws'
const INDEXER_API = 'http://localhost:4000/api'
const FN_GAME = {commit_flip:'Coinflip',reveal_flip:'Coinflip',commit_open:'Lootbox',reveal_open:'Lootbox',commit_roll:'Range',reveal_roll:'Range',commit_play:'Limbo',reveal_play:'Limbo',commit_drop:'Plinko',reveal_drop:'Plinko',flip:'Coinflip',open:'Lootbox',roll:'Range',play:'Limbo',drop:'Plinko'}
const FN_ICON = {reveal_flip:<Coins size={14}/>,reveal_open:<Gift size={14}/>,reveal_roll:<Target size={14}/>,reveal_play:<Rocket size={14}/>,reveal_drop:<CircleDot size={14}/>,commit_flip:<Coins size={14}/>,commit_open:<Gift size={14}/>,commit_roll:<Target size={14}/>,commit_play:<Rocket size={14}/>,commit_drop:<CircleDot size={14}/>,flip:<Coins size={14}/>,open:<Gift size={14}/>,roll:<Target size={14}/>,play:<Rocket size={14}/>,drop:<CircleDot size={14}/>}
const FN_MAP = {coinflip:'reveal_flip',lootbox:'reveal_open',range:'reveal_roll',limbo:'reveal_play',plinko:'reveal_drop'}

// Commit-reveal helpers
const vecb=b=>{const r=new Uint8Array(b.length+1);r[0]=b.length;r.set(b,1);return r}
async function commitRevealSecret(){
  const secret=crypto.getRandomValues(new Uint8Array(32))
  const hashBuf=await crypto.subtle.digest('SHA-256',secret)
  return {secret,commitHash:new Uint8Array(hashBuf)}
}

function useIndexer(){
  const [allTxs,setAllTxs]=useState([])
  const [leaderboard,setLeaderboard]=useState([])
  const wsRef=useRef(null)

  useEffect(()=>{
    let ws=null,retry=null
    const connect=()=>{
      try{ws=new WebSocket(INDEXER_WS_URL)}catch{retry=setTimeout(connect,3000);return}
      wsRef.current=ws
      ws.onopen=()=>{}
      ws.onclose=()=>{retry=setTimeout(connect,3000)}
      ws.onerror=()=>{}
      ws.onmessage=(e)=>{
        try{
          const msg=JSON.parse(e.data)
          if(msg.type==='init'){const txs=msg.data.txs||[];txRef.current=txs;setAllTxs(txs);setLeaderboard(msg.data.leaderboard||[])}
          if(msg.type==='new_tx'){
            const d=msg.data
            if(!d)return
            // Add to ref only — visible state updated via revealTx or periodic sync
            if(!txRef.current.find(t=>t.hash===d.hash)){
              txRef.current=[d,...txRef.current].slice(0,100)
            }
          }
          if(msg.type==='leaderboard'){setLeaderboard(msg.data||[])}
        }catch{}
      }
    }
    connect()
    return()=>{clearTimeout(retry);if(ws)try{ws.close()}catch{}}
  },[])

  // txRef is the source of truth — only updated by WS handlers, never overwritten by React state
  const txRef=useRef([])

  // waitForTx: polls txRef for a NEW tx (not in knownHashes at call time)
  const waitForTx=(playerAddr,fnName)=>{
    const knownHashes=new Set(txRef.current.map(t=>t.hash))
    return new Promise((resolve)=>{
      const startTime=Date.now()
      const check=()=>{
        const found=txRef.current.find(t=>t.player===playerAddr&&t.fn===fnName&&!knownHashes.has(t.hash))
        if(found){resolve(found);return}
        if(Date.now()-startTime>15000){resolve(null);return}
        setTimeout(check,200)
      }
      check()
    })
  }

  // revealTx: copy txRef → allTxs state so UI renders
  const revealTx=()=>setAllTxs([...txRef.current])

  const getTxs=(fnFilter,limit=20)=>{
    const filtered=fnFilter?allTxs.filter(t=>t.fn===fnFilter):allTxs
    return filtered.slice(0,limit)
  }

  // Periodic sync for other players' txs (every 3s)
  useEffect(()=>{
    const iv=setInterval(()=>{
      if(txRef.current.length>allTxs.length)setAllTxs([...txRef.current])
    },3000)
    return()=>clearInterval(iv)
  },[allTxs.length])

  return {allTxs,leaderboard,getTxs,waitForTx,revealTx}
}

// Keep parseTxPnl as fallback
function parseTxPnl(tx) {
  const events = tx.events || []
  const sender = tx.tx?.body?.messages?.[0]?.sender || ''
  const deposits = [],withdrawals = []
  for (const ev of events) {
    if (ev.type !== 'move') continue
    const typeTag = ev.attributes?.find(a => a.key === 'type_tag')?.value || ''
    const amount = parseInt(ev.attributes?.find(a => a.key === 'amount')?.value || '0')
    const owner = ev.attributes?.find(a => a.key === 'owner')?.value || ''
    if (!amount) continue
    const senderHex = (() => { try { return AccAddress.toHex(sender).toLowerCase() } catch { return '' } })()
    const ownerClean = owner.toLowerCase()
    if (typeTag.includes('DepositOwnerEvent') && ownerClean.includes(senderHex.replace('0x',''))) deposits.push(amount)
    if (typeTag.includes('WithdrawOwnerEvent') && ownerClean.includes(senderHex.replace('0x',''))) withdrawals.push(amount)
  }
  const totalIn = deposits.reduce((s,v) => s+v, 0)
  const totalOut = withdrawals.reduce((s,v) => s+v, 0)
  const profit = totalIn - totalOut
  const bet = totalOut > 0 ? Math.min(...withdrawals) : 0
  const payout = totalIn
  const won = profit > 0
  const multiplier = bet > 0 ? (payout / bet) : 0
  return { bet, payout, profit, won, multiplier }
}

// ========== MAIN APP ==========
export default function App() {
  const {initiaAddress,openConnect,openWallet,openBridge,requestTxSync,submitTxSync,estimateGas,autoSign} = useInterwovenKit()
  const [isAuto,setIsAuto]=useState(false)
  const [sfxOn,setSfxOn]=useState(!_sfxMuted)
  const [musicOn,setMusicOn]=useState(!_musicMuted)
  const musicStarted=useRef(false)

  // Start music on first user click anywhere
  useEffect(()=>{
    const handler=()=>{
      if(!musicStarted.current){musicStarted.current=true;if(!_musicMuted)startMusic()}
      document.removeEventListener('click',handler)
    }
    document.addEventListener('click',handler)
    return()=>document.removeEventListener('click',handler)
  },[])

  const toggleSfx=()=>{const v=!sfxOn;setSfxOn(v);_sfxMuted=!v;localStorage.setItem('sfx_muted',v?'0':'1')}
  const toggleMusic=()=>{
    const v=!musicOn;setMusicOn(v);_musicMuted=!v;localStorage.setItem('music_muted',v?'0':'1')
    if(v){startMusic()}else{stopMusic()}
  }
  const indexer = useIndexer()
  // Hash-based routing — persists page on refresh
  const getPage=()=>{const h=window.location.hash.slice(1);return['home','coinflip','lootbox','range','limbo','plinko','leaderboard','docs'].includes(h)?h:'home'}
  const [pg,setPgRaw]=useState(getPage)
  const setPg=(p)=>{setPgRaw(p);window.location.hash=p}
  useEffect(()=>{
    const handler=()=>setPgRaw(getPage())
    window.addEventListener('hashchange',handler)
    return()=>window.removeEventListener('hashchange',handler)
  },[])
  const [bal,setBal]=useState(0)
  const [busy,setBusy]=useState(false)
  const [toast,setToast]=useState(null)
  const [showOb,setShowOb]=useState(false)
  const [obStep,setObStep]=useState(0)
  const [gamesDD,setGamesDD]=useState(false)
  const [walletDD,setWalletDD]=useState(false)
  const tmr=useRef(null)
  const [copied,setCopied]=useState(false)
  const gamesRef=useRef(null)
  const walletRef=useRef(null)

  const copyAddr=()=>{if(!initiaAddress)return;navigator.clipboard.writeText(initiaAddress);setCopied(true);setTimeout(()=>setCopied(false),1500)}

  // close dropdowns on outside click
  useEffect(()=>{
    const handler=(e)=>{
      if(gamesRef.current&&!gamesRef.current.contains(e.target))setGamesDD(false)
      if(walletRef.current&&!walletRef.current.contains(e.target))setWalletDD(false)
    }
    document.addEventListener('mousedown',handler)
    return()=>document.removeEventListener('mousedown',handler)
  },[])

  const flash=(t,m)=>{setToast({t,m});if(tmr.current)clearTimeout(tmr.current);tmr.current=setTimeout(()=>setToast(null),3000)}

  const fetchBal=useCallback(async()=>{
    if(!initiaAddress)return
    try{const r=await fetch(`${API}/cosmos/bank/v1beta1/balances/${initiaAddress}`);const d=await r.json();const u=d.balances?.find(c=>c.denom==='umin');if(u)setBal(parseInt(u.amount))}catch{}
  },[initiaAddress])

  useEffect(()=>{fetchBal()},[fetchBal])
  useEffect(()=>{const iv=setInterval(fetchBal,5000);return()=>clearInterval(iv)},[fetchBal])
  useEffect(()=>{if(initiaAddress&&!localStorage.getItem('wg_ob'))setShowOb(true)},[initiaAddress])

  const tx=async(mod,fn,args=[])=>{
    if(!initiaAddress){flash('err','Connect wallet first');return false}
    setBusy(true)
    try{
      const messages=[{typeUrl:'/initia.move.v1.MsgExecute',value:MsgExecute.fromPartial({sender:initiaAddress,moduleAddress:MOD,moduleName:mod,functionName:fn,typeArgs:[],args})}]
      if(isAuto){
        // Direct submit — bypass kit's feegrant check which fails on local chains
        const gas=await estimateGas({messages,chainId:CHAIN})
        const fee={amount:[{denom:'umin',amount:String(Math.ceil(gas*1.4))}],gas:String(Math.ceil(gas*1.4))}
        await submitTxSync({messages,chainId:CHAIN,fee})
      } else {
        await requestTxSync({chainId:CHAIN,messages})
      }
      setTimeout(fetchBal,2000);return true
    }catch(e){flash('err',e?.message?.slice(0,80)||'Transaction failed');return false}finally{setBusy(false)}
  }

  const toggleAuto=async()=>{
    if(!initiaAddress)return
    if(isAuto){
      // Switching to manual — disable session key
      try{await autoSign?.disable(CHAIN)}catch{}
      setIsAuto(false)
    } else {
      // Switching to auto — create session key
      try{
        await autoSign?.enable(CHAIN,{permissions:['/initia.move.v1.MsgExecute']})
        setIsAuto(true)
      }catch(e){
        console.warn('Auto-sign enable failed:', e?.message)
        setIsAuto(false)
      }
    }
  }

  // Reset auto state on wallet disconnect
  useEffect(()=>{if(!initiaAddress)setIsAuto(false)},[initiaAddress])

  return(
    <div className="app no-sidebar">
      <header className="top-bar">
        {/* Left: Logo + Nav */}
        <div className="navbar-left">
          <div className="navbar-logo" onClick={()=>{setPg('home');setGamesDD(false)}}>
            <div className="navbar-logo-icon"><Dices size={16}/></div>
          </div>
          <nav className="navbar-nav">
            <button className={`nav-link ${pg==='home'?'active':''}`} onClick={()=>setPg('home')}>
              <Home size={15}/> Home
            </button>
            <button className="nav-link" onClick={()=>{if(!initiaAddress){openConnect();return};openBridge?.({srcChainId:'initiation-2',srcDenom:'uinit'})}}>
              <ArrowRightLeft size={15}/> Bridge
            </button>
            <div className="nav-dropdown" ref={gamesRef}>
              <button className={`nav-link ${['coinflip','lootbox','range','limbo','plinko'].includes(pg)?'active':''}`} onClick={()=>setGamesDD(!gamesDD)}>
                <Gamepad2 size={15}/> Games <ChevronDown size={12} className={`nav-chevron ${gamesDD?'open':''}`}/>
              </button>
              {gamesDD&&<div className="nav-dropdown-menu">
                {GAMES.filter(g=>g.id!=='home').map(g=>(
                  <button key={g.id} className={`nav-dd-item ${pg===g.id?'active':''}`} onClick={()=>{setPg(g.id);setGamesDD(false)}}>
                    <span className="nav-dd-icon">{g.icon}</span>
                    <div className="nav-dd-info">
                      <span className="nav-dd-name">{g.name}</span>
                      {g.mult&&<span className="nav-dd-mult">{g.mult}</span>}
                    </div>
                    {g.badge&&<span className="nav-dd-badge">{g.badge}</span>}
                  </button>
                ))}
              </div>}
            </div>
            <button className={`nav-link ${pg==='leaderboard'?'active':''}`} onClick={()=>setPg('leaderboard')}>
              <Trophy size={15}/> Leaderboard
            </button>
            <button className={`nav-link ${pg==='docs'?'active':''}`} onClick={()=>setPg('docs')}>
              <FileText size={15}/> Docs
            </button>
          </nav>
        </div>

        {/* Right: Connect or Wallet */}
        <div className="navbar-right">
          <button onClick={toggleMusic} className={`sound-btn ${musicOn?'on':''}`} title={musicOn?'Music on':'Music off'}>
            <Music size={13}/>
          </button>
          <button onClick={toggleSfx} className={`sound-btn ${sfxOn?'on':''}`} title={sfxOn?'Sounds on':'Sounds off'}>
            {sfxOn?<Volume2 size={13}/>:<VolumeX size={13}/>}
          </button>
          {initiaAddress?(<>
            <button onClick={toggleAuto} className={`signing-toggle ${isAuto?'on':''}`} title={isAuto?'Auto-signing enabled':'Manual signing'}>
              <span className="signing-indicator"/>
              <span className="signing-label">{isAuto?'Auto':'Manual'}</span>
            </button>
            <div className="wallet-dropdown" ref={walletRef}>
              <button className="wallet-trigger" onClick={()=>setWalletDD(!walletDD)}>
                <div className="wt-bal">
                  <Coins size={13} className="wt-coin-icon"/>
                  <span className="wt-amount">{fmt(bal)}</span>
                  <span className="wt-denom">MIN</span>
                </div>
                <div className="wt-divider"/>
                <div className="wt-addr">
                  <Wallet size={13}/>
                  <span>{short(initiaAddress)}</span>
                </div>
                <ChevronDown size={12} className={`wt-chevron ${walletDD?'open':''}`}/>
              </button>
              {walletDD&&<div className="wallet-dropdown-menu">
                <div className="wdm-balance-section">
                  <div className="wdm-label">Balance</div>
                  <div className="wdm-bal-row">
                    <Coins size={16} style={{color:'var(--yellow)'}}/>
                    <span className="wdm-bal-value">{fmt(bal)}</span>
                    <span className="wdm-bal-denom">MIN</span>
                    <button className="wdm-refresh" onClick={fetchBal} title="Refresh"><RefreshCw size={12}/></button>
                  </div>
                </div>
                <div className="wdm-divider"/>
                <div className="wdm-addr-section">
                  <div className="wdm-label">Address</div>
                  <button className="wdm-addr-row" onClick={copyAddr}>
                    <span className="wdm-addr-text">{`${initiaAddress.slice(0,16)}...${initiaAddress.slice(-8)}`}</span>
                    {copied?<Check size={12} className="copy-ok"/>:<Copy size={12} className="copy-icon"/>}
                  </button>
                </div>
                <div className="wdm-divider"/>
                <button className="wdm-action" onClick={()=>{openBridge?.({srcChainId:'initiation-2',srcDenom:'uinit'});setWalletDD(false)}}>
                  <ArrowRightLeft size={14}/> Bridge Tokens
                </button>
                <button className="wdm-action" onClick={()=>{openWallet();setWalletDD(false)}}>
                  <Wallet size={14}/> Wallet Settings
                </button>
                <div className="wdm-divider"/>
                <button className="wdm-action wdm-disconnect" onClick={()=>{setWalletDD(false);openWallet()}}>
                  <LogOut size={14}/> Disconnect
                </button>
              </div>}
            </div>
          </>):(
            <button onClick={openConnect} className="btn btn-primary connect-btn">
              <Wallet size={14}/> Connect Wallet
            </button>
          )}
        </div>
      </header>
      <div className="main-content">
        <div className="content-area">
          {pg==='home'&&<HomePage go={setPg} indexer={indexer}/>}
          {pg==='coinflip'&&<Coinflip tx={tx} busy={busy} flash={flash} addr={initiaAddress} bal={bal} indexer={indexer}/>}
          {pg==='lootbox'&&<Lootbox tx={tx} busy={busy} flash={flash} addr={initiaAddress} bal={bal} indexer={indexer}/>}
          {pg==='range'&&<Range tx={tx} busy={busy} flash={flash} addr={initiaAddress} bal={bal} indexer={indexer}/>}
          {pg==='limbo'&&<Limbo tx={tx} busy={busy} flash={flash} addr={initiaAddress} bal={bal} indexer={indexer}/>}
          {pg==='plinko'&&<Plinko tx={tx} busy={busy} flash={flash} addr={initiaAddress} bal={bal} indexer={indexer}/>}
          {pg==='docs'&&<DocsPage/>}
          {pg==='leaderboard'&&<LeaderboardPage indexer={indexer}/>}
        </div>
      </div>
      {showOb&&<Onboard step={obStep} setStep={setObStep} close={()=>{setShowOb(false);localStorage.setItem('wg_ob','1')}}/>}
      {toast&&<div className={`toast-msg ${toast.t==='err'?'err':'ok'}`}>{toast.m}</div>}
    </div>
  )
}

// ========== HOME PAGE ==========
const MASCOTS={coinflip:'/mascot/coinflip.png',lootbox:'/mascot/lootbox.png',range:'/mascot/range.png',limbo:'/mascot/limbo.png',plinko:'/mascot/plinko.png',hero:'/mascot/hero.png'}

function HomePage({go,indexer}){
  const liveTxs=indexer?indexer.allTxs.slice(0,20):[]
  const totalBets=liveTxs.length

  const cards=[
    {id:'coinflip',name:'Coinflip',mult:'x2',icon:<Coins size={32} strokeWidth={1.5}/>,desc:'Pick a side. Double or nothing.',color:'#ffbb33'},
    {id:'lootbox',name:'Lootbox',mult:'up to x10',icon:<Gift size={32} strokeWidth={1.5}/>,desc:'Open mystery boxes for prizes.',color:'#9966ff'},
    {id:'range',name:'Range',mult:'up to x99',icon:<Target size={32} strokeWidth={1.5}/>,desc:'Predict the roll. Set your odds.',color:'#4488ff'},
    {id:'limbo',name:'Limbo',mult:'up to x100',icon:<Rocket size={32} strokeWidth={1.5}/>,desc:'How high can the multiplier go?',color:'#ff4466'},
    {id:'plinko',name:'Plinko',mult:'up to x6',icon:<CircleDot size={32} strokeWidth={1.5}/>,desc:'Drop the ball. Watch it bounce.',color:'#33ddaa'},
  ]

  return(
    <div className="home-page">

      {/* Hero */}
      <div className="home-hero">
        <div className="home-hero-content">
          <h1 className="home-hero-title">On-chain games.<br/>Provably fair.</h1>
          <p className="home-hero-sub">Every bet is a blockchain transaction. Transparent outcomes, instant payouts, zero trust required.</p>
          <div className="home-hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">{totalBets}</span>
              <span className="hero-stat-label">Total bets</span>
            </div>
            <div className="hero-stat-divider"/>
            <div className="hero-stat">
              <span className="hero-stat-value">5</span>
              <span className="hero-stat-label">Games live</span>
            </div>
            <div className="hero-stat-divider"/>
            <div className="hero-stat">
              <span className="hero-stat-value">x100</span>
              <span className="hero-stat-label">Max multiplier</span>
            </div>
          </div>
        </div>
      </div>

      {/* Games */}
      <div className="section-header">
        <h2 className="section-title">Games</h2>
        <div className="section-stat"><span className="highlight">{cards.length}</span> available</div>
      </div>
      <div className="games-grid">
        {cards.map(c=>(
          <div key={c.id} className="game-card-home" onClick={()=>go(c.id)} style={{'--gc-color':c.color}}>
            <div className="gc-icon-wrap">{c.icon}</div>
            <div className="gc-body">
              <div className="gc-name">{c.name}</div>
              <div className="gc-desc">{c.desc}</div>
              <div className="gc-footer">
                <span className="gc-mult">{c.mult}</span>
                <ArrowUpRight size={13} className="gc-arrow"/>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live Activity */}
      <div className="home-section">
        <div className="section-header">
          <h2 className="section-title"><span className="live-dot"/>Live Activity</h2>
          <div className="section-stat"><span className="highlight">{liveTxs.length}</span> recent</div>
        </div>
        <div className="live-table">
          <div className="live-head"><span>Game</span><span>Player</span><span>Result</span><span>Multiplier</span><span>Tx</span><span>Time</span></div>
          {liveTxs.length>0?liveTxs.map((t,i)=>(
            <div key={i} className={`live-row ${t.won?'live-row-win':'live-row-lose'}`}>
              <div className="live-game"><span>{FN_ICON[t.fn]}</span>{t.game}</div>
              <a href={`${EXPLORER_ADDR}/${t.player}`} target="_blank" rel="noopener noreferrer" className="tx-player-link">{short(t.player)}</a>
              <span className={`tx-profit ${t.won?'pos':'neg'}`}>{t.won?`+${fmt(t.payout)}`:`-${fmt(t.bet)}`} MIN</span>
              <span className="tx-mult">x{(t.multiplier||0).toFixed(2)}</span>
              <a href={`${EXPLORER}/${t.hash}`} target="_blank" rel="noopener noreferrer" className="tx-hash-link">{t.hash?.slice(0,8)}.. <ArrowUpRight size={10}/></a>
              <span className="tx-time">{t.time?ago(t.time):'--'}</span>
            </div>
          )):<div className="live-empty">No activity yet. Be the first to play!</div>}
        </div>
      </div>
    </div>
  )
}

// ========== BET INPUT ==========
function BetInput({bet,setBet,bal}){
  return(
    <div>
      <div className="field-lbl">Bet Amount</div>
      <div className="bet-row">
        <div className="bet-currency">MIN</div>
        <input className="bet-field" type="number" step="0.1" min="0.1" value={bet} onChange={e=>setBet(e.target.value)}/>
        <div className="bet-adj-col">
          <button className="bet-adj-btn" onClick={()=>setBet(b=>{const v=(parseFloat(b)||0)*2;const max=bal/10**D;return String(max>0?Math.min(v,max):v)})}>x2</button>
          <button className="bet-adj-btn" onClick={()=>setBet(b=>String(Math.max((parseFloat(b)||0)/2,0.1)))}>/2</button>
        </div>
      </div>
      <div className="chip-row">
        {[0.25,0.5,1,2.5,5].map(v=>(<button key={v} className="chip" onClick={()=>setBet(String(v))}>{v}</button>))}
        <button className="chip" onClick={()=>setBet(String(Math.floor(bal/10**D)))}>MAX</button>
      </div>
    </div>
  )
}

// ========== TX TABLE (REAL-TIME) ==========
function TxTable({fnName,indexer}){
  const txs=indexer?indexer.getTxs(fnName,20):[]
  return(
    <div className="tx-panel">
      <div className="tx-header"><span className="tx-title">Recent Bets</span></div>
      <div className="tx-grid-head"><span>Player</span><span>Result</span><span>Multiplier</span><span>Tx</span><span>Time</span></div>
      {txs.length>0?txs.map((t,i)=>(
        <div key={i} className={`tx-row ${t.won?'tx-row-win':'tx-row-lose'}`} style={{gridTemplateColumns:'1.2fr 1fr 0.7fr 0.8fr 0.6fr'}}>
          <a href={`${EXPLORER_ADDR}/${t.player}`} target="_blank" rel="noopener noreferrer" className="tx-player-link">{short(t.player)} <ArrowUpRight size={8}/></a>
          <span className={`tx-profit ${t.won?'pos':'neg'}`}>{t.won?`+${fmt(t.payout)}`:`-${fmt(t.bet)}`} MIN</span>
          <span className="tx-mult">x{(t.multiplier||0).toFixed(2)}</span>
          <a href={`${EXPLORER}/${t.hash}`} target="_blank" rel="noopener noreferrer" className="tx-hash-link">{t.hash?.slice(0,8)}.. <ArrowUpRight size={9}/></a>
          <span className="tx-time">{t.time?ago(t.time):'--'}</span>
        </div>
      )):<div style={{padding:'1.25rem',textAlign:'center',color:'var(--fg-muted)',fontSize:'0.78rem'}}>No bets yet. Be the first!</div>}
    </div>
  )
}

// ========== COINFLIP ==========
function Coinflip({tx,busy,flash,addr,bal,indexer}){
  const [bet,setBet]=useState('1'),[ch,setCh]=useState(0),[res,setRes]=useState(null),[flipping,setFlipping]=useState(false)
  const play=async()=>{
    const a=Math.floor(parseFloat(bet)*10**D);if(a<=0){flash('err','Enter bet');return}
    setFlipping(true);setRes(null);SFX.flip()
    const {secret,commitHash}=await commitRevealSecret()
    if(await tx('coinflip','commit_flip',[u64b(a),new Uint8Array([ch]),vecb(commitHash)])){
      await new Promise(ok=>setTimeout(ok,1500))
      if(await tx('coinflip','reveal_flip',[vecb(secret)])){
        const itx=await indexer.waitForTx(addr,'reveal_flip')
        if(itx){
          const r=await qv('coinflip','get_last_result',[enc(addr)])
          const coinRes=Array.isArray(r)?+r[1]:ch
          await new Promise(ok=>setTimeout(ok,1000))
          setRes({ch,res:coinRes,w:itx.won,bet:itx.bet,pay:itx.payout})
          itx.won?SFX.win():SFX.lose()
          indexer.revealTx()
          flash(itx.won?'ok':'err',itx.won?`Won ${fmt(itx.payout)} MIN!`:'Lost!')
        }
      }
      setFlipping(false)
    } else setFlipping(false)
  }

  // Determine which face the coin shows
  const coinFace = res ? (res.res===0?'heads':'tails') : (ch===0?'heads':'tails')
  const coinState = flipping ? 'flipping' : res ? (res.w ? 'win' : 'lose') : 'idle'

  return(<div className="game-coinflip">
    <h1 className="game-page-title"><Coins size={28}/> Coinflip</h1>

    <div className="game-grid">
      <div className="ctrl-card">
        <BetInput bet={bet} setBet={setBet} bal={bal}/>
        <div><div className="field-lbl">Choose side</div>
          <div className="pick-row">
            <button className={`pick-btn ${ch===0?'picked':''}`} onClick={()=>setCh(0)}>Heads</button>
            <button className={`pick-btn ${ch===1?'picked':''}`} onClick={()=>setCh(1)}>Tails</button>
          </div></div>
        <div className="info-stack">
          <div className="info-line"><span className="k">Multiplier</span><span className="v">x2.00</span></div>
          <div className="info-line"><span className="k">Payout on win</span><span className="v">{((parseFloat(bet)||0)*2).toFixed(2)} MIN</span></div>
        </div>
        <button className="go-btn" disabled={busy||flipping} onClick={play}>{busy||flipping?<><span className="spin"/> Flipping...</>:'FLIP!'}</button>
      </div>
      <div className="right-col">
        <div className={`cf-result-area ${coinState}`} key={flipping?'flip':res?.pay||'idle'}>
          {res?.w&&!flipping&&<Confetti/>}
          <div className={`cf-coin-wrap ${coinState}`}>
            <div className={`cf-coin ${flipping?'cf-spinning':''} ${!flipping&&res?(res.res===0?'cf-land-heads':'cf-land-tails'):''}`}>
              <div className="cf-face cf-heads">H</div>
              <div className="cf-face cf-tails">T</div>
            </div>
          </div>
          {!flipping&&res&&(
            <div className="cf-outcome">
              <div className={`cf-outcome-label ${res.w?'win':'lose'}`}>{res.w?'YOU WIN':'YOU LOSE'}</div>
              <div className="cf-outcome-detail">Landed on {res.res===0?'Heads':'Tails'}</div>
              <div className={`cf-outcome-pnl ${res.w?'win':'lose'}`}>{res.w?`Won ${fmt(res.pay)} MIN`:`Lost ${fmt(res.bet)} MIN`}</div>
            </div>
          )}
          {!flipping&&!res&&(
            <div className="cf-idle-text">Pick a side and flip</div>
          )}
        </div>
        <TxTable fnName="flip" indexer={indexer}/>
      </div>
    </div></div>)
}

// ========== RANGE ==========
function Range({tx,busy,flash,addr,bal,indexer}){
  const [bet,setBet]=useState('1'),[tgt,setTgt]=useState(50),[res,setRes]=useState(null),[rolling,setRolling]=useState(false),[tickVal,setTickVal]=useState(null)
  const tickRef=useRef(null)
  const mult=tgt>1?(9900/(tgt-1)/100).toFixed(2):'0'
  const play=async()=>{
    const a=Math.floor(parseFloat(bet)*10**D);if(a<=0)return
    setRolling(true);setRes(null);SFX.bet()
    const tick=()=>{setTickVal(Math.floor(Math.random()*100)+1);tickRef.current=requestAnimationFrame(tick)}
    tickRef.current=requestAnimationFrame(tick)
    const {secret,commitHash}=await commitRevealSecret()
    if(await tx('range','commit_roll',[u64b(a),u64b(tgt),vecb(commitHash)])){
      await new Promise(ok=>setTimeout(ok,1500))
      if(await tx('range','reveal_roll',[vecb(secret)])){
        const itx=await indexer.waitForTx(addr,'reveal_roll')
        if(itx){
          const r=await qv('range','get_last_result',[enc(addr)])
          await new Promise(ok=>setTimeout(ok,1000))
          cancelAnimationFrame(tickRef.current);setTickVal(null)
          if(Array.isArray(r)){setRes({tgt:+r[0],roll:+r[1],w:itx.won,mult:+r[3],bet:itx.bet,pay:itx.payout})}
          itx.won?SFX.win():SFX.lose()
          indexer.revealTx()
          flash(itx.won?'ok':'err',itx.won?`Rolled ${r?.[1]}! Won!`:`Rolled ${r?.[1]}. Lost.`)
        } else {cancelAnimationFrame(tickRef.current);setTickVal(null)}
      } else {cancelAnimationFrame(tickRef.current);setTickVal(null)}
      setRolling(false)
    } else {cancelAnimationFrame(tickRef.current);setRolling(false);setTickVal(null)}
  }
  return(<div className="game-range">
    <h1 className="game-page-title"><Target size={28}/> Range</h1>

    <div className="game-grid">
      <div className="ctrl-card">
        <BetInput bet={bet} setBet={setBet} bal={bal}/>
        <div><div className="field-lbl">Roll Under</div>
          <div className="rg-slider-row">
            <input type="range" className="range-slider" min={2} max={96} value={tgt} onChange={e=>setTgt(+e.target.value)}/>
            <span className="rg-target-val">{tgt}</span>
          </div>
        </div>
        <div className="info-stack">
          <div className="info-line"><span className="k">Multiplier</span><span className="v">x{mult}</span></div>
          <div className="info-line"><span className="k">Win chance</span><span className="v">{tgt-1}%</span></div>
          <div className="info-line"><span className="k">Profit on win</span><span className="v">+{((parseFloat(bet)||0)*(parseFloat(mult)-1)).toFixed(2)} MIN</span></div>
        </div>
        <button className="go-btn" disabled={busy||rolling} onClick={play}>{busy||rolling?<><span className="spin"/> Rolling...</>:'ROLL!'}</button>
      </div>
      <div className="right-col">
        <div className={`rg-result-area ${res?(res.w?'win':'lose'):''}`} key={res?.roll}>
          {res?.w&&!rolling&&<Confetti/>}
          <div className={`rg-number ${rolling?'rg-ticking':''} ${!rolling&&res?(res.w?'rg-num-win':'rg-num-lose'):''}`}>
            {rolling?tickVal:res?res.roll:'?'}
          </div>
          {!rolling&&res&&(
            <div className="rg-outcome">
              <div className="rg-outcome-detail">Target: under {res.tgt}</div>
              <div className={`rg-outcome-pnl ${res.w?'win':'lose'}`}>{res.w?`+${fmt(res.pay-res.bet)}`:`-${fmt(res.bet)}`} MIN</div>
            </div>
          )}
          {!rolling&&!res&&<div className="rg-idle-text">Set your target and roll</div>}
          {/* Visual bar showing target zone */}
          <div className="rg-bar">
            <div className="rg-bar-fill" style={{width:`${tgt-1}%`}}/>
            {!rolling&&res&&<div className="rg-bar-marker" style={{left:`${res.roll}%`}}/>}
          </div>
          <div className="rg-bar-labels">
            <span>1</span>
            <span className="rg-bar-tgt">Under {tgt}</span>
            <span>100</span>
          </div>
        </div>
        <TxTable fnName="roll" indexer={indexer}/>
      </div>
    </div></div>)
}

// ========== LIMBO ==========
function Limbo({tx,busy,flash,addr,bal,indexer}){
  const [bet,setBet]=useState('1'),[pred,setPred]=useState(200),[res,setRes]=useState(null),[pumping,setPumping]=useState(false),[countVal,setCountVal]=useState(1.0)
  const countRef=useRef(null)
  const [popped,setPopped]=useState(false)
  const play=async()=>{
    const a=Math.floor(parseFloat(bet)*10**D);if(a<=0)return
    setPumping(true);setRes(null);setPopped(false);setCountVal(1.0);SFX.bet()
    const {secret,commitHash}=await commitRevealSecret()
    if(await tx('limbo','commit_play',[u64b(a),u64b(pred),vecb(commitHash)])){
      await new Promise(ok=>setTimeout(ok,1500))
      if(await tx('limbo','reveal_play',[vecb(secret)])){
        const itx=await indexer.waitForTx(addr,'reveal_play')
        if(itx){
          const r=await qv('limbo','get_last_result',[enc(addr)])
          const finalMult=Array.isArray(r)?+r[1]/100:(itx.multiplier||1)
          const duration=1500
          const start=Date.now()
          await new Promise(done=>{
            const tick=()=>{
              const elapsed=Date.now()-start
              const progress=Math.min(elapsed/duration,1)
              const eased=1-Math.pow(1-progress,3)
              const current=1+(finalMult-1)*eased
              setCountVal(current)
              if(progress<1){countRef.current=requestAnimationFrame(tick)}
              else{done()}
            }
            countRef.current=requestAnimationFrame(tick)
          })
          setCountVal(finalMult)
          setRes({pred:+r?.[0]||pred,res:Array.isArray(r)?+r[1]:Math.round(finalMult*100),w:itx.won,bet:itx.bet,pay:itx.payout})
          if(!itx.won){setPopped(true);SFX.pop()} else {SFX.win()}
          indexer.revealTx()
          flash(itx.won?'ok':'err',itx.won?`x${finalMult.toFixed(2)}! Won!`:`x${finalMult.toFixed(2)}. Busted.`)
        }
      }
      setPumping(false)
    } else {setPumping(false)}
  }

  // Balloon scale — grows with the real multiplier
  const balloonScale = pumping ? Math.min(0.5 + (countVal-1)*0.1, 1.6) : res ? (res.w ? 1.2 : 0) : 0.7

  return(<div className="game-limbo">
    <h1 className="game-page-title"><Rocket size={28}/> Limbo</h1>

    <div className="game-grid">
      <div className="ctrl-card">
        <BetInput bet={bet} setBet={setBet} bal={bal}/>
        <div><div className="field-lbl">Target Multiplier</div>
          <div className="lm-pred-row">
            <button className="lm-pred-btn" onClick={()=>setPred(p=>Math.max(101,p-25))}>-</button>
            <div className="lm-pred-val">x{(pred/100).toFixed(2)}</div>
            <button className="lm-pred-btn" onClick={()=>setPred(p=>Math.min(10000,p+25))}>+</button>
          </div>
        </div>
        <div className="info-stack">
          <div className="info-line"><span className="k">Win chance</span><span className="v">{(10000/pred*100/100).toFixed(1)}%</span></div>
          <div className="info-line"><span className="k">Profit on win</span><span className="v">+{((parseFloat(bet)||0)*(pred/100-1)).toFixed(2)} MIN</span></div>
        </div>
        <button className="go-btn" disabled={busy||pumping} onClick={play}>{busy||pumping?<><span className="spin"/> Pumping...</>:'PUMP!'}</button>
      </div>
      <div className="right-col">
        <div className={`lm-result-area ${res?(res.w?'win':'lose'):''}`} key={res?.res}>
          {res?.w&&!pumping&&<Confetti/>}

          {/* Balloon */}
          <div className="lm-balloon-zone">
            {(!res||res.w||pumping)&&!popped&&(
              <div className="lm-balloon" style={{transform:`scale(${balloonScale})`}}>
                <div className={`lm-balloon-body ${pumping?'lm-inflating':''}`}/>
                <div className="lm-balloon-knot"/>
                <div className="lm-balloon-string"/>
              </div>
            )}
            {popped&&(
              <div className="lm-pop-burst">
                {Array.from({length:10}).map((_,i)=>(
                  <div key={i} className="lm-pop-shard" style={{
                    '--angle':`${(i/10)*360}deg`,
                    '--dist':`${30+Math.random()*40}px`,
                    animationDelay:`${i*0.02}s`
                  }}/>
                ))}
              </div>
            )}
          </div>

          {/* Multiplier display */}
          <div className={`lm-mult-display ${pumping?'lm-counting':''} ${!pumping&&res?(res.w?'lm-mult-win':'lm-mult-lose'):''}`}>
            x{pumping?countVal.toFixed(2):res?(res.res/100).toFixed(2):'1.00'}
          </div>

          {!pumping&&res&&(
            <div className="lm-outcome">
              <div className="lm-outcome-detail">Target: x{(res.pred/100).toFixed(2)}</div>
              <div className={`lm-outcome-pnl ${res.w?'win':'lose'}`}>{res.w?`+${fmt(res.pay-res.bet)}`:`-${fmt(res.bet)}`} MIN</div>
            </div>
          )}
          {!pumping&&!res&&<div className="lm-idle-text">Set your target and pump</div>}
        </div>
        <TxTable fnName="play" indexer={indexer}/>
      </div>
    </div></div>)
}

// ========== PLINKO ==========
function Plinko({tx,busy,flash,addr,bal,indexer}){
  const [bet,setBet]=useState('1'),[rows,setRows]=useState(8),[risk,setRisk]=useState(0),[res,setRes]=useState(null),[dropping,setDropping]=useState(false)
  const [ballDrop,setBallDrop]=useState(null) // {bkt, numB}
  const [ballPos,setBallPos]=useState(null) // {x, y} during animation
  const boardRef=useRef(null)
  const bktRefs=useRef([])
  const play=async()=>{
    const a=Math.floor(parseFloat(bet)*10**D);if(a<=0)return
    setDropping(true);setRes(null);setBallDrop(null);setBallPos(null);SFX.drop()
    const {secret,commitHash}=await commitRevealSecret()
    if(await tx('plinko','commit_drop',[u64b(a),u64b(rows),new Uint8Array([risk]),vecb(commitHash)])){
      await new Promise(ok=>setTimeout(ok,1500))
      if(await tx('plinko','reveal_drop',[vecb(secret)])){
      const itx=await indexer.waitForTx(addr,'reveal_drop')
      if(itx){
        const r=await qv('plinko','get_last_result',[enc(addr)])
        const bkt=Array.isArray(r)?+r[2]:0
        const nb=rows+1
        // Calculate target X from actual bucket element position
        let targetX=50
        const boardEl=boardRef.current
        const bucketEl=bktRefs.current[bkt]
        if(boardEl&&bucketEl){
          const boardRect=boardEl.getBoundingClientRect()
          const bktRect=bucketEl.getBoundingClientRect()
          targetX=((bktRect.left+bktRect.width/2)-boardRect.left)/boardRect.width*100
        }
        // Build path: center → target bucket with realistic zig-zag
        const path=[{x:50,y:0}]
        let cx=50
        for(let i=0;i<rows;i++){
          const progress=(i+1)/rows
          const drift=(targetX-50)*progress
          const jitter=(Math.random()-0.5)*14*(1-progress*0.8)
          cx=50+drift+jitter
          cx=Math.max(5,Math.min(95,cx))
          path.push({x:cx,y:progress*100})
        }
        path[path.length-1].x=targetX
        setBallDrop({bkt,numB:nb})
        // Animate ball along path over 3s
        const dur=3000
        const startT=Date.now()
        await new Promise(done=>{
          const tick=()=>{
            const t=Math.min((Date.now()-startT)/dur,1)
            const eased=1-Math.pow(1-t,2.5)
            const idx=eased*(path.length-1)
            const lo=Math.floor(idx),hi=Math.min(lo+1,path.length-1)
            const frac=idx-lo
            const px=path[lo].x+(path[hi].x-path[lo].x)*frac
            const py=path[lo].y+(path[hi].y-path[lo].y)*frac
            setBallPos({x:px,y:py})
            if(t<1)requestAnimationFrame(tick);else done()
          }
          requestAnimationFrame(tick)
        })
        if(Array.isArray(r)){setRes({rows:+r[0],risk:r[1],bkt:+r[2],mult:+r[3],w:itx.won,bet:itx.bet,pay:itx.payout})}
        indexer.revealTx()
        itx.won?SFX.win():SFX.lose()
        flash(itx.won?'ok':'err',`x${(itx.multiplier||0).toFixed(2)}!`)
      }
      } // reveal_drop
      setDropping(false);setBallDrop(null);setBallPos(null)
    } else {setDropping(false);setBallDrop(null);setBallPos(null)}
  }
  const numB=rows+1
  const mults=risk===0?[50,70,100,150,200,300,400]:[20,40,70,180,300,500,600]
  const getM=i=>{const d=Math.abs(i-Math.floor(numB/2));return mults[Math.min(d,mults.length-1)]}
  const bktColor=m=>{if(m>=300)return'pk-bkt-high';if(m>=150)return'pk-bkt-mid';return'pk-bkt-low'}
  const isWin=res&&res.pay>=res.bet
  return(<div className="game-plinko">
    <h1 className="game-page-title"><CircleDot size={28}/> Plinko</h1>

    <div className="game-grid">
      {/* Left: Controls */}
      <div className="ctrl-card">
        <BetInput bet={bet} setBet={setBet} bal={bal}/>
        <div><div className="field-lbl">Rows: {rows}</div>
          <input type="range" className="range-slider" min={6} max={12} value={rows} onChange={e=>setRows(+e.target.value)}/></div>
        <div><div className="field-lbl">Risk Level</div>
          <div className="pick-row">
            <button className={`pick-btn ${risk===0?'picked':''}`} onClick={()=>setRisk(0)}>Low</button>
            <button className={`pick-btn ${risk===1?'picked':''}`} onClick={()=>setRisk(1)}>Medium</button>
          </div></div>
        {!dropping&&res&&(
          <div className="pk-result-inline">
            <span className={`pk-res-mult ${isWin?'win':'lose'}`}>x{(res.mult/100).toFixed(2)}</span>
            <span className={`pk-res-pnl ${isWin?'win':'lose'}`}>{isWin?`Won ${fmt(res.pay)} MIN`:`Lost ${fmt(res.bet-res.pay)} MIN`}</span>
          </div>
        )}
        {dropping&&<div className="pk-result-inline"><span style={{color:'var(--fg-muted)',fontSize:'0.78rem'}}>Dropping...</span></div>}
        <button className="go-btn" disabled={busy||dropping} onClick={play}>{busy||dropping?<><span className="spin"/> Dropping...</>:'DROP!'}</button>
      </div>
      {/* Right: Board with buckets inside */}
      <div className="right-col">
        <div className="pk-board-area">
          {isWin&&!dropping&&<Confetti/>}
          <div className="pk-board" ref={boardRef}>
            {ballPos&&<div className="pk-ball" style={{left:`${ballPos.x}%`,top:`${ballPos.y}%`}}/>}
            {Array.from({length:rows}).map((_,r)=>(
              <div key={r} className="pk-peg-row">
                {Array.from({length:r+3}).map((__,p)=>(<div key={p} className="pk-peg"/>))}
              </div>
            ))}
            {/* Buckets — same width as last peg row */}
            <div className="pk-buckets" style={{width:`${(rows+2)*12 + (rows+1)*28}px`}}>
              {Array.from({length:numB}).map((_,i)=>{const m=getM(i);return(
                <div key={i} ref={el=>bktRefs.current[i]=el} className={`pk-bkt ${bktColor(m)} ${res?.bkt===i?'pk-bkt-hit':''}`}>{(m/100).toFixed(1)}x</div>
              )})}
            </div>
          </div>
        </div>
        <TxTable fnName="drop" indexer={indexer}/>
      </div>
    </div>
  </div>)
}

// ========== LOOTBOX ==========
const LB_TIERS=[
  {id:0,name:'Bronze',cost:0.5},
  {id:1,name:'Silver',cost:1},
  {id:2,name:'Gold',cost:5},
  {id:3,name:'Diamond',cost:10},
  {id:4,name:'Legend',cost:50},
]
// Possible prize outcomes per tier (multipliers + approximate chances)
const LB_PRIZES=[
  {mult:0,label:'Empty',chance:'40%',icon:<CircleDot size={20} strokeWidth={1.5}/>,rarity:'common'},
  {mult:0.5,label:'x0.5',chance:'20%',icon:<Coins size={20} strokeWidth={1.5}/>,rarity:'common'},
  {mult:1,label:'x1',chance:'15%',icon:<Coins size={20} strokeWidth={1.5}/>,rarity:'uncommon'},
  {mult:2,label:'x2',chance:'12%',icon:<Gift size={20} strokeWidth={1.5}/>,rarity:'rare'},
  {mult:5,label:'x5',chance:'8%',icon:<Zap size={20} strokeWidth={1.5}/>,rarity:'epic'},
  {mult:10,label:'x10',chance:'5%',icon:<Shield size={20} strokeWidth={1.5}/>,rarity:'legendary'},
]

function Lootbox({tx,busy,flash,addr,bal,indexer}){
  const [tier,setTier]=useState(1),[res,setRes]=useState(null),[opening,setOpening]=useState(false),[highlightIdx,setHighlightIdx]=useState(null)
  const spinRef=useRef(null)
  const play=async()=>{
    setOpening(true);setRes(null);setHighlightIdx(null);SFX.bet()
    // Spin through prize cards while waiting
    let i=0
    const spin=()=>{setHighlightIdx(i%LB_PRIZES.length);i++;spinRef.current=setTimeout(spin,80+i*3)}
    spinRef.current=setTimeout(spin,80)
    const {secret,commitHash}=await commitRevealSecret()
    if(await tx('lootbox','commit_open',[new Uint8Array([tier]),vecb(commitHash)])){
      await new Promise(ok=>setTimeout(ok,1500))
      if(await tx('lootbox','reveal_open',[vecb(secret)])){
        const itx=await indexer.waitForTx(addr,'reveal_open')
        await new Promise(ok=>setTimeout(ok,1500))
        clearTimeout(spinRef.current)
        if(itx){
          const m=itx.multiplier||0
          const pidx=LB_PRIZES.findIndex(p=>p.mult===m)
          setHighlightIdx(pidx>=0?pidx:0)
          setRes({tier:tier,cost:t.cost*1e6,mult:Math.round(m*100),prize:itx.payout,w:itx.won})
          indexer.revealTx()
          itx.won?SFX.win():SFX.lose()
          flash(itx.won?'ok':'err',itx.won?`x${m.toFixed(2)}! Won ${fmt(itx.payout)} MIN!`:'Empty box!')
        }
      } else {clearTimeout(spinRef.current)}
      setOpening(false)
    } else {clearTimeout(spinRef.current);setOpening(false);setHighlightIdx(null)}
  }
  const t=LB_TIERS[tier]
  return(<div className="game-lootbox">
    <h1 className="game-page-title"><Gift size={28}/> Lootbox</h1>

    <div className="game-grid">
      <div className="ctrl-card">
        <div>
          <div className="field-lbl">Selected Lootbox</div>
          <div className="lb-selected-name">{t.name}</div>
        </div>
        <div className="lb-tiers">
          {LB_TIERS.map(t=>(<button key={t.id} className={`lb-tier ${tier===t.id?'chosen':''}`} onClick={()=>{setTier(t.id);setRes(null);setHighlightIdx(null)}}>
            <span className="lb-tier-name">{t.name}</span>
            <span className="lb-tier-cost">{t.cost} MIN</span>
          </button>))}
        </div>
        <div className="info-stack">
          <div className="info-line"><span className="k">Cost</span><span className="v">{t.cost} MIN</span></div>
          <div className="info-line"><span className="k">Max prize</span><span className="v">{(t.cost*10).toFixed(0)} MIN</span></div>
        </div>
        <button className="go-btn lb-open-btn" disabled={busy||opening} onClick={play}>{busy||opening?<><span className="spin"/> Opening...</>:`OPEN (${t.cost} MIN)`}</button>
      </div>
      <div className="right-col">
        {/* Prize cards */}
        <div className="lb-prizes-area">
          <div className="lb-prizes-grid">
            {LB_PRIZES.map((p,i)=>(
              <div key={i} className={`lb-prize-card lb-rarity-${p.rarity} ${highlightIdx===i?'lb-prize-lit':''} ${!opening&&res&&highlightIdx===i?(res.w?'lb-prize-won':'lb-prize-lost'):''}`}>
                <div className="lb-prize-top">
                  <span className="lb-prize-chance">{p.chance}</span>
                  <span className="lb-prize-mult-label">{p.label}</span>
                </div>
                <div className="lb-prize-icon">{p.icon}</div>
                <div className="lb-prize-bottom">
                  <div className="lb-prize-value">{p.mult>0?`${(p.mult*t.cost).toFixed(p.mult*t.cost>=1?0:1)}`:'0'}</div>
                  <div className="lb-prize-denom">MIN</div>
                </div>
              </div>
            ))}
          </div>
          {/* Result banner */}
          {!opening&&res&&(
            <div className={`lb-result-banner ${res.w?'win':'lose'}`}>
              {res.w&&<Confetti/>}
              <span className="lb-result-mult">{res.w?`x${(res.mult/100).toFixed(2)}`:'EMPTY'}</span>
              <span className="lb-result-pnl">{res.w?`+${fmt(res.prize-res.cost)}`:`-${fmt(res.cost)}`} MIN</span>
            </div>
          )}
        </div>
        <TxTable fnName="open" indexer={indexer}/>
      </div>
    </div>
  </div>)
}

// ========== DOCS ==========
function DocsPage(){
  const sections=[
    {title:'What is MiniDyce?',body:'MiniDyce is a fully on-chain casino built on Initia using the Move VM. Every bet, outcome, and payout is a blockchain transaction — transparent, verifiable, and trustless. The house pool is managed by a Move smart contract deployed on a local Initia rollup.'},
    {title:'How It Works',body:'MiniDyce uses a commit-reveal scheme for provably fair randomness. When you bet, your browser generates a random secret and sends sha256(secret) with your bet to the contract (commit). In the next block, the secret is revealed and the outcome is computed from sha256(secret + block_data + nonce) — neither you nor the block producer can predict or manipulate the result. All game logic runs on-chain with no off-chain server.'},
    {title:'Auto-Sign vs Manual',body:'Auto-Sign creates a session key that lets the app submit transactions without a popup for each bet. This makes gameplay instant. Manual mode requires you to approve every transaction in your wallet. Toggle this in the header.'},
    {title:'Games',sub:[
      {name:'Coinflip',desc:'Pick Heads or Tails. Win = 2x your bet. 50/50 odds.'},
      {name:'Lootbox',desc:'Choose a tier (Bronze to Legend). Open the box for a random multiplier up to x10. Higher tiers cost more but the prizes scale.'},
      {name:'Range',desc:'Pick a target number (2-96). A random number 1-100 is rolled. If the roll is under your target, you win. Lower targets = higher multipliers (up to x99).'},
      {name:'Limbo',desc:'Set a target multiplier (x1.01 to x100). The contract generates a random multiplier. If it reaches your target, you win that multiplier on your bet.'},
      {name:'Plinko',desc:'Choose rows (6-12) and risk level (Low/Medium). A ball drops through pegs into buckets with different multipliers. More rows and higher risk = more volatile payouts.'},
    ]},
    {title:'Token',body:'The native token is MIN (umin, 6 decimals). Use the Bridge button to transfer tokens from the Initia L1 testnet to this rollup.'},
    {title:'Smart Contract',body:`Module address: ${MOD}. The contract is written in Move and deployed on a local MiniMove rollup. Each game has its own module (coinflip, lootbox, range, limbo, plinko) with play and get_last_result functions.`},
    {title:'Chain Details',body:'Chain ID: local-rollup-1. RPC: localhost:26657. REST: localhost:1317. Bech32 prefix: init. This is a testnet rollup — tokens have no real value.'},
  ]
  return(
    <div className="docs-page">
      <h1 className="docs-title">Documentation</h1>
      <p className="docs-intro">Everything you need to know about MiniDyce.</p>
      <div className="docs-sections">
        {sections.map((s,i)=>(
          <div key={i} className="docs-section">
            <h2 className="docs-section-title">{s.title}</h2>
            {s.body&&<p className="docs-section-body">{s.body}</p>}
            {s.sub&&<div className="docs-game-list">
              {s.sub.map((g,j)=>(
                <div key={j} className="docs-game-item">
                  <div className="docs-game-name">{g.name}</div>
                  <div className="docs-game-desc">{g.desc}</div>
                </div>
              ))}
            </div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ========== LEADERBOARD ==========
function LeaderboardPage({indexer}){
  const players=indexer?indexer.leaderboard:[]
  const loading=false

  return(
    <div className="lb-page">
      <h1 className="lb-page-title"><Trophy size={24}/> Leaderboard</h1>
      <p className="lb-page-sub">Top players ranked by net profit.</p>

      <div className="lb-table">
        <div className="lb-table-head">
          <span>#</span>
          <span>Player</span>
          <span>Bets</span>
          <span>Wagered</span>
          <span>Profit</span>
          <span>Win Rate</span>
          <span>Last Tx</span>
        </div>
        {loading?(
          <div className="lb-table-empty"><span className="spin"/> Loading...</div>
        ):players.length>0?players.map((p,i)=>(
          <div key={p.addr} className={`lb-table-row ${i<3?'lb-top-'+i:''}`}>
            <span className="lb-rank">{i+1}</span>
            <a href={`${EXPLORER_ADDR}/${p.addr}`} target="_blank" rel="noopener noreferrer" className="lb-player">
              {short(p.addr)} <ExternalLink size={10}/>
            </a>
            <span className="lb-bets">{p.bets}</span>
            <span className="lb-wagered">{fmt(p.wagered)}</span>
            <span className={`lb-profit ${p.profit>=0?'pos':'neg'}`}>{p.profit>=0?'+':''}{fmt(p.profit)}</span>
            <span className="lb-winrate">{p.bets>0?Math.round(p.wins/p.bets*100):0}%</span>
            <a href={`${EXPLORER}/${p.lastTx}`} target="_blank" rel="noopener noreferrer" className="lb-tx-link">
              {p.lastTx?.slice(0,8)}.. <ExternalLink size={10}/>
            </a>
          </div>
        )):(
          <div className="lb-table-empty">No players yet. Be the first!</div>
        )}
      </div>
    </div>
  )
}


// ========== CONFETTI ==========
function Confetti(){
  const colors=['#ff6633','#ffbb33','#9966ff','#4488ff','#33ddaa','#fff']
  return(
    <div className="confetti-wrap">
      {Array.from({length:24}).map((_,i)=>(
        <div key={i} className="confetti-piece" style={{
          left:`${8+Math.random()*84}%`,
          background:colors[i%colors.length],
          borderRadius:Math.random()>0.5?'50%':'2px',
          width:`${5+Math.random()*7}px`,
          height:`${5+Math.random()*7}px`,
          animationDelay:`${Math.random()*0.5}s`,
          animationDuration:`${1+Math.random()*1.2}s`,
        }}/>
      ))}
    </div>
  )
}

// ========== ONBOARDING ==========
function Onboard({step,setStep,close}){
  const steps=[
    {t:'Welcome to MiniDyce!',d:'On-chain casino games on Initia. Every bet is a blockchain transaction \u2014 transparent and verifiable.'},
    {t:'Enable Auto-Sign',d:'Click AUTO in the header to skip approval popups. This creates a session key for seamless, instant gameplay.'},
    {t:'Pick a Game',d:'Choose from Coinflip, Range, Limbo, Plinko, or Lootbox. Each has unique mechanics and multipliers.'},
    {t:'Place Your Bet',d:'Enter your bet amount in MIN tokens. Use the preset chips or type a custom amount. Hit the action button!'},
    {t:'Play & Win!',d:'Results appear instantly. Wins are paid from the house pool. Check your transaction history below each game.'},
  ]
  const s=steps[step]
  return(
    <div className="ob-overlay" onClick={close}><div className="ob-card" onClick={e=>e.stopPropagation()}>
      <div className="ob-step">Step {step+1} / {steps.length}</div>
      <div className="ob-title">{s.t}</div>
      <div className="ob-desc">{s.d}</div>
      <div className="ob-nav">
        <button className="btn" onClick={()=>step>0?setStep(step-1):close()} style={{opacity:step>0?1:0.3}}>Back</button>
        <div className="ob-dots">{steps.map((_,i)=><div key={i} className={`ob-dot ${i===step?'on':''}`}/>)}</div>
        {step<steps.length-1?<button className="btn btn-primary" onClick={()=>setStep(step+1)}>Next</button>
          :<button className="btn btn-primary" onClick={close}>Start Playing</button>}
      </div>
    </div></div>
  )
}
