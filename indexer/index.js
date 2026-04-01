import WebSocket, { WebSocketServer } from 'ws'
import express from 'express'
import cors from 'cors'
import http from 'http'
import pg from 'pg'

// ============================================================
// CONFIG
// ============================================================
const REST_API = 'http://localhost:1317'
const TENDERMINT_WS = 'ws://localhost:26657/websocket'
const PORT = 4000
const GAME_FNS = { commit_flip: 'Coinflip', reveal_flip: 'Coinflip', commit_open: 'Lootbox', reveal_open: 'Lootbox', commit_roll: 'Range', reveal_roll: 'Range', commit_play: 'Limbo', reveal_play: 'Limbo', commit_drop: 'Plinko', reveal_drop: 'Plinko', flip: 'Coinflip', open: 'Lootbox', roll: 'Range', play: 'Limbo', drop: 'Plinko' }

// ============================================================
// DATABASE
// ============================================================
const pool = new pg.Pool({ database: 'minidyce' })

async function db(text, params) {
  const res = await pool.query(text, params)
  return res
}

async function insertTx(entry) {
  const { hash, height, player, game, fn, bet, payout, profit, won, multiplier, time } = entry
  try {
    await db(
      `INSERT INTO game_txs (hash, height, player, game, fn, bet, payout, profit, won, multiplier, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (hash) DO NOTHING`,
      [hash, height, player, game, fn, bet, payout, profit, won, multiplier, time]
    )
    // Upsert player stats
    await db(
      `INSERT INTO player_stats (addr, bets, wagered, profit, wins, losses, last_tx, last_time, updated_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (addr) DO UPDATE SET
         bets = player_stats.bets + 1,
         wagered = player_stats.wagered + $2,
         profit = player_stats.profit + $3,
         wins = player_stats.wins + $4,
         losses = player_stats.losses + $5,
         last_tx = $6, last_time = $7, updated_at = NOW()`,
      [player, bet, profit, won ? 1 : 0, won ? 0 : 1, hash, time]
    )
    return true
  } catch (e) {
    if (e.code === '23505') return false // duplicate
    console.error('DB insert error:', e.message)
    return false
  }
}

async function txExists(hash) {
  const res = await db('SELECT 1 FROM game_txs WHERE hash=$1', [hash])
  return res.rowCount > 0
}

// ============================================================
// BECH32 DECODE
// ============================================================
function bech32Decode(str) {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  const sep = str.lastIndexOf('1')
  if (sep < 1) return ''
  const data = []
  for (let i = sep + 1; i < str.length; i++) {
    const c = CHARSET.indexOf(str.charAt(i).toLowerCase())
    if (c === -1) return ''
    data.push(c)
  }
  const conv = data.slice(0, -6)
  let acc = 0, bits = 0
  const result = []
  for (const v of conv) {
    acc = (acc << 5) | v
    bits += 5
    while (bits >= 8) { bits -= 8; result.push((acc >> bits) & 0xff) }
  }
  return Buffer.from(result).toString('hex').toLowerCase()
}

// ============================================================
// TX PARSING
// ============================================================
function extractGameMsg(txResp) {
  const msg0 = txResp.tx?.body?.messages?.[0]
  if (!msg0) return null
  if (msg0['@type'] === '/initia.move.v1.MsgExecute' || msg0.function_name) return msg0
  if (msg0['@type'] === '/cosmos.authz.v1beta1.MsgExec' && msg0.msgs?.[0]) {
    const inner = msg0.msgs[0]
    if (inner['@type'] === '/initia.move.v1.MsgExecute' || inner.function_name) return inner
  }
  return null
}

function parseTxPnl(txResp, sender) {
  const events = txResp.events || []
  const senderHex = bech32Decode(sender)
  if (!senderHex) return { bet: 0, payout: 0, profit: 0, won: false, multiplier: 0 }

  const deposits = [], withdrawals = []
  let pendingAmount = 0, pendingType = ''

  for (const ev of events) {
    if (ev.type !== 'move') continue
    const typeTag = ev.attributes?.find(a => a.key === 'type_tag')?.value || ''
    if (typeTag.includes('WithdrawEvent') && !typeTag.includes('Owner')) {
      pendingAmount = parseInt(ev.attributes?.find(a => a.key === 'amount')?.value || '0')
      pendingType = 'withdraw'
    } else if (typeTag.includes('WithdrawOwnerEvent')) {
      const owner = (ev.attributes?.find(a => a.key === 'owner')?.value || '').toLowerCase().replace('0x', '')
      if (pendingType === 'withdraw' && pendingAmount > 0 && owner.includes(senderHex)) withdrawals.push(pendingAmount)
      pendingAmount = 0; pendingType = ''
    } else if (typeTag.includes('DepositEvent') && !typeTag.includes('Owner')) {
      pendingAmount = parseInt(ev.attributes?.find(a => a.key === 'amount')?.value || '0')
      pendingType = 'deposit'
    } else if (typeTag.includes('DepositOwnerEvent')) {
      const owner = (ev.attributes?.find(a => a.key === 'owner')?.value || '').toLowerCase().replace('0x', '')
      if (pendingType === 'deposit' && pendingAmount > 0 && owner.includes(senderHex)) deposits.push(pendingAmount)
      pendingAmount = 0; pendingType = ''
    }
  }

  const totalIn = deposits.reduce((s, v) => s + v, 0)
  const totalOut = withdrawals.reduce((s, v) => s + v, 0)
  const profit = totalIn - totalOut
  const bet = totalOut > 0 ? Math.min(...withdrawals) : 0
  const payout = totalIn
  const won = profit > 0
  const multiplier = bet > 0 ? +(payout / bet).toFixed(4) : 0
  return { bet, payout, profit, won, multiplier }
}

function parseTxResponse(txResp) {
  if (txResp.code !== 0) return null
  const msg = extractGameMsg(txResp)
  if (!msg) return null
  const fn = msg.function_name
  if (!GAME_FNS[fn]) return null
  const pnl = parseTxPnl(txResp, msg.sender)
  return {
    player: msg.sender || '',
    hash: txResp.txhash,
    time: txResp.timestamp || new Date().toISOString(),
    height: parseInt(txResp.height || '0'),
    game: GAME_FNS[fn],
    fn,
    ...pnl,
  }
}

// ============================================================
// BACKFILL
// ============================================================
async function backfill() {
  console.log('Starting backfill...')
  let added = 0
  const queries = [
    "message.action%3D%27%2Finitia.move.v1.MsgExecute%27",
    "message.action%3D%27%2Fcosmos.authz.v1beta1.MsgExec%27",
  ]
  for (const query of queries) {
    let offset = 0
    while (true) {
      try {
        const url = `${REST_API}/cosmos/tx/v1beta1/txs?query=${query}&pagination.limit=50&pagination.offset=${offset}&order_by=ORDER_BY_DESC`
        const resp = await fetch(url)
        const data = await resp.json()
        if (!data.tx_responses?.length) break
        for (const tx of data.tx_responses) {
          const entry = parseTxResponse(tx)
          if (entry && await insertTx(entry)) added++
        }
        offset += data.tx_responses.length
        if (data.tx_responses.length < 50) break
      } catch (e) {
        console.error('Backfill error:', e.message)
        break
      }
    }
  }
  console.log(`Backfill done: ${added} new txs added`)
}

// ============================================================
// TENDERMINT WS
// ============================================================
function connectTendermint() {
  console.log('Connecting to Tendermint WS...')
  const ws = new WebSocket(TENDERMINT_WS)

  ws.on('open', () => {
    console.log('Connected to Tendermint WS')
    ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'subscribe', id: 1, params: { query: "tm.event='Tx'" } }))
  })

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      const hashArr = msg.result?.events?.['tx.hash']
      if (!hashArr?.[0]) return
      const hash = hashArr[0]
      if (await txExists(hash)) return

      await new Promise(r => setTimeout(r, 800))
      const resp = await fetch(`${REST_API}/cosmos/tx/v1beta1/txs/${hash}`)
      const data = await resp.json()
      if (!data.tx_response) return

      const entry = parseTxResponse(data.tx_response)
      if (!entry) return
      if (!await insertTx(entry)) return

      console.log(`[LIVE] ${entry.game} | ${entry.player.slice(0, 12)}.. | ${entry.won ? 'WIN' : 'LOSE'} | ${(entry.profit / 1e6).toFixed(2)} MIN`)
      broadcast({ type: 'new_tx', data: entry })
    } catch {}
  })

  ws.on('close', () => { console.log('TM WS disconnected, reconnecting...'); setTimeout(connectTendermint, 3000) })
  ws.on('error', () => {})
}

// ============================================================
// FRONTEND WS + REST API
// ============================================================
const app = express()
app.use(cors())
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const clients = new Set()

wss.on('connection', async (ws) => {
  clients.add(ws)
  // Send initial data from DB
  const txs = await getRecentTxs(100)
  const leaderboard = await getLeaderboard()
  ws.send(JSON.stringify({ type: 'init', data: { txs, leaderboard } }))
  ws.on('close', () => clients.delete(ws))
})

function broadcast(msg) {
  const str = JSON.stringify(msg)
  for (const ws of clients) { if (ws.readyState === WebSocket.OPEN) ws.send(str) }
}

// --- DB query helpers ---
async function getRecentTxs(limit = 20, fn = null) {
  const q = fn
    ? await db('SELECT * FROM game_txs WHERE fn=$1 ORDER BY created_at DESC LIMIT $2', [fn, limit])
    : await db('SELECT * FROM game_txs ORDER BY created_at DESC LIMIT $1', [limit])
  return q.rows.map(r => ({
    hash: r.hash, height: r.height, player: r.player, game: r.game, fn: r.fn,
    bet: parseInt(r.bet), payout: parseInt(r.payout), profit: parseInt(r.profit),
    won: r.won, multiplier: parseFloat(r.multiplier), time: r.created_at,
  }))
}

async function getLeaderboard() {
  const q = await db('SELECT * FROM player_stats ORDER BY profit DESC LIMIT 50')
  return q.rows.map(r => ({
    addr: r.addr, bets: r.bets, wagered: parseInt(r.wagered), profit: parseInt(r.profit),
    wins: r.wins, losses: r.losses, lastTx: r.last_tx, lastTime: r.last_time,
  }))
}

// --- REST endpoints ---
app.get('/api/txs', async (req, res) => {
  const { game, limit = 20 } = req.query
  const fnMap = { coinflip: 'reveal_flip', lootbox: 'reveal_open', range: 'reveal_roll', limbo: 'reveal_play', plinko: 'reveal_drop' }
  const fn = fnMap[game] || game || null
  res.json(await getRecentTxs(+limit, fn))
})

app.get('/api/leaderboard', async (req, res) => {
  res.json(await getLeaderboard())
})

app.get('/api/stats', async (req, res) => {
  const txCount = await db('SELECT COUNT(*) as c FROM game_txs')
  const playerCount = await db('SELECT COUNT(*) as c FROM player_stats')
  const totalWagered = await db('SELECT COALESCE(SUM(wagered),0) as s FROM player_stats')
  res.json({
    totalTxs: parseInt(txCount.rows[0].c),
    totalPlayers: parseInt(playerCount.rows[0].c),
    totalWagered: parseInt(totalWagered.rows[0].s),
  })
})

app.get('/api/player/:addr', async (req, res) => {
  const stats = await db('SELECT * FROM player_stats WHERE addr=$1', [req.params.addr])
  const txs = await db('SELECT * FROM game_txs WHERE player=$1 ORDER BY created_at DESC LIMIT 50', [req.params.addr])
  res.json({
    stats: stats.rows[0] || null,
    txs: txs.rows.map(r => ({
      hash: r.hash, game: r.game, fn: r.fn, bet: parseInt(r.bet), payout: parseInt(r.payout),
      profit: parseInt(r.profit), won: r.won, multiplier: parseFloat(r.multiplier), time: r.created_at,
    }))
  })
})

// ============================================================
// START
// ============================================================
async function start() {
  console.log('Starting MiniDyce Indexer (PostgreSQL)...')
  try {
    await db('SELECT 1')
    console.log('Database connected')
  } catch (e) {
    console.error('Database connection failed:', e.message)
    process.exit(1)
  }
  // Start server FIRST so frontend can connect immediately
  server.listen(PORT, async () => {
    const stats = await db('SELECT COUNT(*) as c FROM game_txs')
    console.log(`Indexer running on :${PORT} | ${stats.rows[0].c} txs in DB`)
    // Backfill and subscribe in background
    connectTendermint()
    backfill().catch(e => console.error('Backfill failed:', e.message))
  })
}

start()
