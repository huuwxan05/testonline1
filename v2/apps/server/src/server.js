import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { startBotChat, BOT_PROFILES } from './chat-bots.js';
import crypto from 'crypto';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const PLAYER = path.join(ROOT, 'apps/player');
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me-change-me';
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
    })
  : null;

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || true, credentials: true }
});
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 180, standardHeaders: true, legacyHeaders: false }));

const CONFIG = {
  enabled: true, paused: false,
  bettingSeconds: Number(process.env.BETTING_SECONDS || 20),
  shakeSeconds: Number(process.env.SHAKE_SECONDS || 3),
  peekSeconds: Number(process.env.PEEK_SECONDS || 12),
  resultSeconds: Number(process.env.RESULT_SECONDS || 6),
  minBet: Number(process.env.MIN_BET || 1000),
  maxBet: Number(process.env.MAX_BET || 10000000),
  taiXiuMultiplier: 1, chanLeMultiplier: 1, baoAnyMultiplier: 30,
  sumMultipliers: {4:60,17:60,5:30,16:30,6:18,15:18,7:12,14:12,8:8,13:8,9:6,10:6,11:6,12:6},
  diceOne: 1, diceTwo: 2, diceThree: 3,
  botEnabled: true, botBetEnabled: true, botChatEnabled: true,
  botMinMs: 2500, botMaxMs: 6000,
  botGroups: { social: true, betting: true, result: true, vip: true },
  chatEnabled: true, chatMaxLength: 240, reactionsEnabled: true,
  roomTitle: 'PHÒNG CHAT SIC BO 3D', welcomeMessage: 'Chào mừng bạn vào phòng!'
};

// Compatible with both the older V6 database and a fresh database.
const schema = `
CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS characters(
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  level INT NOT NULL DEFAULT 1,
  exp BIGINT NOT NULL DEFAULT 0,
  coins BIGINT NOT NULL DEFAULT 1000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coin_ledger(
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  balance_after BIGINT,
  type TEXT NOT NULL,
  reason TEXT,
  actor_id INT,
  round_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rounds(
  id BIGSERIAL PRIMARY KEY,
  phase TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phase_ends_at TIMESTAMPTZ NOT NULL,
  dice JSONB,
  sum INT,
  result_type TEXT,
  forced_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bets(
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT REFERENCES rounds(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  bet_key TEXT NOT NULL,
  amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  payout BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(round_id,user_id,bet_key)
);

CREATE TABLE IF NOT EXISTS audit_log(
  id BIGSERIAL PRIMARY KEY,
  actor_id INT,
  action TEXT NOT NULL,
  target_user_id INT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_config(
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  betting_seconds INT NOT NULL DEFAULT 20,
  shake_seconds INT NOT NULL DEFAULT 3,
  peek_seconds INT NOT NULL DEFAULT 12,
  result_seconds INT NOT NULL DEFAULT 6,
  min_bet BIGINT NOT NULL DEFAULT 1000,
  max_bet BIGINT NOT NULL DEFAULT 10000000,
  tai_xiu_multiplier NUMERIC NOT NULL DEFAULT 1,
  chan_le_multiplier NUMERIC NOT NULL DEFAULT 1,
  bao_any_multiplier NUMERIC NOT NULL DEFAULT 30,
  sum_multipliers JSONB NOT NULL DEFAULT '{"4":60,"17":60,"5":30,"16":30,"6":18,"15":18,"7":12,"14":12,"8":8,"13":8,"9":6,"10":6,"11":6,"12":6}',
  dice_one NUMERIC NOT NULL DEFAULT 1,
  dice_two NUMERIC NOT NULL DEFAULT 2,
  dice_three NUMERIC NOT NULL DEFAULT 3,
  bot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  bot_bet_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  bot_chat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  bot_min_ms INT NOT NULL DEFAULT 2500,
  bot_max_ms INT NOT NULL DEFAULT 6000,
  chat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  chat_max_length INT NOT NULL DEFAULT 240,
  reactions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  room_title TEXT NOT NULL DEFAULT 'PHÒNG CHAT SIC BO 3D',
  welcome_message TEXT NOT NULL DEFAULT 'Chào mừng bạn vào phòng!',
  bot_groups JSONB NOT NULL DEFAULT '{"social":true,"betting":true,"result":true,"vip":true}',
  updated_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_config ADD COLUMN IF NOT EXISTS shake_seconds INT NOT NULL DEFAULT 3;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS peek_seconds INT NOT NULL DEFAULT 12;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS result_seconds INT NOT NULL DEFAULT 6;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS tai_xiu_multiplier NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS chan_le_multiplier NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS bao_any_multiplier NUMERIC NOT NULL DEFAULT 30;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS sum_multipliers JSONB NOT NULL DEFAULT '{"4":60,"17":60,"5":30,"16":30,"6":18,"15":18,"7":12,"14":12,"8":8,"13":8,"9":6,"10":6,"11":6,"12":6}';
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS dice_one NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS dice_two NUMERIC NOT NULL DEFAULT 2;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS dice_three NUMERIC NOT NULL DEFAULT 3;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS bot_bet_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS bot_chat_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS bot_min_ms INT NOT NULL DEFAULT 2500;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS bot_max_ms INT NOT NULL DEFAULT 6000;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS chat_max_length INT NOT NULL DEFAULT 240;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS reactions_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS room_title TEXT NOT NULL DEFAULT 'PHÒNG CHAT SIC BO 3D';
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT 'Chào mừng bạn vào phòng!';
ALTER TABLE game_config ADD COLUMN IF NOT EXISTS bot_groups JSONB NOT NULL DEFAULT '{"social":true,"betting":true,"result":true,"vip":true}';

CREATE TABLE IF NOT EXISTS chat_threads(
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages(
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL DEFAULT 'user' CHECK(sender_type IN ('user','admin','bot')),
  message TEXT NOT NULL DEFAULT '',
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  bot_id TEXT,
  name TEXT,
  avatar TEXT,
  text TEXT,
  kind TEXT DEFAULT 'PLAYER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS thread_id BIGINT REFERENCES chat_threads(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_user_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'user';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS bot_id TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'PLAYER';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE chat_messages ALTER COLUMN thread_id DROP NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN sender_type SET DEFAULT 'user';
ALTER TABLE chat_messages ALTER COLUMN message SET DEFAULT '';
`;

let dbReady = false;
let currentRound = null;
let scheduler = null;
let transitioning = false;
let cachedConfig = { ...CONFIG };

async function db() {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  if (!dbReady) {
    await pool.query(schema);
    // Normalize legacy values to the constraints used by the V6 database.
    await pool.query(`UPDATE users SET role='user' WHERE role IN ('PLAYER','USER')`);
    await pool.query(`UPDATE users SET role='admin' WHERE role IN ('ADMIN','SUPER_ADMIN')`);
    await pool.query(`UPDATE users SET status='active' WHERE status IN ('ACTIVE','PLAYER')`);
    await pool.query(`UPDATE users SET status='blocked' WHERE status IN ('SUSPENDED','BLOCKED')`);
    await pool.query(`UPDATE chat_messages SET sender_type='user' WHERE sender_type IS NULL OR sender_type NOT IN ('user','admin','bot')`);
    await pool.query(`UPDATE chat_messages SET message=COALESCE(message,text,'') WHERE message IS NULL`);
    await pool.query(`UPDATE chat_messages SET text=COALESCE(text,message,'') WHERE text IS NULL`);
    await pool.query(`UPDATE chat_messages SET name=COALESCE(name,'Player') WHERE name IS NULL`);
    await pool.query(`INSERT INTO game_config(id) VALUES(1) ON CONFLICT DO NOTHING`);
    await seedAdmin();
    dbReady = true;
  }
  return pool;
}

async function seedAdmin() {
  const username = process.env.ADMIN_SEED_USER;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!username || !password) return;
  const q = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (q.rowCount) {
    await pool.query("UPDATE users SET role='admin',status='active',updated_at=NOW() WHERE username=$1", [username]);
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  const email = (username + '@admin.local').slice(0, 255);
  const u = await pool.query("INSERT INTO users(username,email,password_hash,role,status) VALUES($1,$2,$3,'admin','active') RETURNING id", [username, email, hash]);
  const cname = (username + '_ADMIN').slice(0, 24);
  await pool.query('INSERT INTO characters(user_id,name,coins) VALUES($1,$2,0)', [u.rows[0].id, cname]);
}

function tokenFor(u) { return jwt.sign({ sub: u.id, role: u.role, username: u.username }, JWT_SECRET, { expiresIn: '12h' }); }
function verifyToken(t) { return jwt.verify(t, JWT_SECRET); }
function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });
    req.user = verifyToken(h.slice(7));
    next();
  } catch { return res.status(401).json({ error: 'INVALID_SESSION' }); }
}
function admin(req, res, next) {
  if (!['admin', 'ADMIN', 'super_admin', 'SUPER_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
  next();
}
function safeBetKey(k) {
  return ['TAI','XIU','CHAN','LE','BAO_ANY', ...Array.from({length:14},(_,i)=>`SUM_${i+4}`), ...Array.from({length:6},(_,i)=>`DICE_${i+1}`)].includes(k);
}
function resultFor(dice) {
  const sum = dice.reduce((a,b)=>a+b,0);
  const triple = dice[0]===dice[1] && dice[1]===dice[2];
  return { dice, sum, triple, isTai:sum>=11&&sum<=17&&!triple, isXiu:sum>=4&&sum<=10&&!triple, type:triple?'BÃO':sum>=11?'TÀI':'XỈU' };
}
function payoutFor(key, amount, r) {
  let won=false, multiplier=1;
  if (key==='TAI' && r.isTai) { won=true; multiplier=Number(cachedConfig.taiXiuMultiplier)||1; }
  if (key==='XIU' && r.isXiu) { won=true; multiplier=Number(cachedConfig.taiXiuMultiplier)||1; }
  if (key==='CHAN' && r.sum%2===0) { won=true; multiplier=Number(cachedConfig.chanLeMultiplier)||1; }
  if (key==='LE' && r.sum%2!==0) { won=true; multiplier=Number(cachedConfig.chanLeMultiplier)||1; }
  if (key==='BAO_ANY' && r.triple) { won=true; multiplier=Number(cachedConfig.baoAnyMultiplier)||30; }
  if (key.startsWith('SUM_') && r.sum===Number(key.slice(4))) { won=true; multiplier=Number(cachedConfig.sumMultipliers?.[r.sum]||6); }
  if (key.startsWith('DICE_')) { const pip=Number(key.slice(5)); const m=r.dice.filter(x=>x===pip).length; if(m>0){won=true;multiplier=m;} }
  return won ? Math.floor(amount + amount*multiplier) : 0;
}
function publicRound(r) { return r && { id:r.id, phase:r.phase, phaseEndsAt:r.phase_ends_at||r.phaseEndsAt, dice:r.dice||null, sum:r.sum||null, resultType:r.result_type||r.resultType||null, config:cachedConfig }; }

async function loadConfig() {
  const p=await db();
  const q=await p.query('SELECT * FROM game_config WHERE id=1');
  const x=q.rows[0];
  if(x) cachedConfig={...cachedConfig, enabled:x.enabled, paused:x.paused, bettingSeconds:x.betting_seconds, shakeSeconds:x.shake_seconds, peekSeconds:x.peek_seconds, resultSeconds:x.result_seconds, minBet:Number(x.min_bet), maxBet:Number(x.max_bet), taiXiuMultiplier:Number(x.tai_xiu_multiplier), chanLeMultiplier:Number(x.chan_le_multiplier), baoAnyMultiplier:Number(x.bao_any_multiplier), sumMultipliers:x.sum_multipliers||cachedConfig.sumMultipliers, diceOne:Number(x.dice_one), diceTwo:Number(x.dice_two), diceThree:Number(x.dice_three), botEnabled:x.bot_enabled, botBetEnabled:x.bot_bet_enabled, botChatEnabled:x.bot_chat_enabled, botMinMs:x.bot_min_ms, botMaxMs:x.bot_max_ms, chatEnabled:x.chat_enabled, chatMaxLength:x.chat_max_length, reactionsEnabled:x.reactions_enabled, roomTitle:x.room_title, welcomeMessage:x.welcome_message, botGroups:x.bot_groups||cachedConfig.botGroups};
  return cachedConfig;
}
function rollDice(){ return [crypto.randomInt(1,7),crypto.randomInt(1,7),crypto.randomInt(1,7)]; }
function broadcastRound(){ if(currentRound) io.emit('round:state',publicRound(currentRound)); }

async function createRound(){
  const p=await db(); await loadConfig();
  if(!cachedConfig.enabled||cachedConfig.paused)return null;
  const q=await p.query(`INSERT INTO rounds(phase,phase_ends_at) VALUES('BETTING',NOW()+make_interval(secs => $1)) RETURNING *`,[cachedConfig.bettingSeconds]);
  currentRound=q.rows[0]; broadcastRound(); return currentRound;
}
async function transitionRound(){
  if(transitioning)return; transitioning=true;
  try{
    const p=await db(); await loadConfig();
    if(!currentRound){await createRound();return;}
    if(Date.now()<new Date(currentRound.phase_ends_at).getTime()-50)return;
    if(currentRound.phase==='BETTING'){
      const q=await p.query(`UPDATE rounds SET phase='SHAKING',phase_ends_at=NOW()+make_interval(secs => $1),dice=$2 WHERE id=$3 RETURNING *`,[cachedConfig.shakeSeconds,JSON.stringify(currentRound.dice||rollDice()),currentRound.id]);
      currentRound=q.rows[0]; broadcastRound();
    }else if(currentRound.phase==='SHAKING'){
      const q=await p.query(`UPDATE rounds SET phase='PEEKING',phase_ends_at=NOW()+make_interval(secs => $1) WHERE id=$2 RETURNING *`,[cachedConfig.peekSeconds,currentRound.id]);
      currentRound=q.rows[0]; broadcastRound();
    }else if(currentRound.phase==='PEEKING'){
      await settleRound();
    }else if(currentRound.phase==='RESULT'){
      await createRound();
    }
  }catch(e){console.error('round transition',e)}finally{transitioning=false;}
}

const onlineUsers=new Map();
function onlineSnapshot(){return [...onlineUsers.values()].map(x=>({...x}));}
function broadcastOnline(){const botsOnline=BOT_PROFILES.map(x=>({userId:'bot:'+x.id,name:x.name,avatar:x.avatar,level:x.level,vip:x.vip,group:x.group,type:'BOT'}));io.emit('presence:update',{count:onlineUsers.size+botsOnline.length,users:[...botsOnline,...onlineSnapshot()]});}

async function saveChat(m){
  try{
    const p=await db();
    const senderType=m.kind==='BOT'?'bot':(m.kind==='ADMIN'?'admin':'user');
    await p.query(`INSERT INTO chat_messages(thread_id,sender_user_id,sender_type,message) VALUES(NULL,$1,$2,$3)`,[m.userId||null,senderType,m.text]);
  }catch(e){console.error('chat save',e.message)}
}
async function recentChat(){
  const p=await db();
  const q=await p.query(`SELECT id,COALESCE(user_id,sender_user_id) AS "userId",bot_id AS "botId",COALESCE(name,'Player') AS name,COALESCE(avatar,'🙂') AS avatar,COALESCE(text,message,'') AS text,COALESCE(kind,UPPER(sender_type)) AS kind,extract(epoch from created_at)*1000 AS ts FROM chat_messages ORDER BY id DESC LIMIT 60`);
  return q.rows.reverse();
}

async function settleRound(){
  const p=await db(); const c=await p.connect();
  try{
    await c.query('BEGIN');
    const locked=await c.query('SELECT * FROM rounds WHERE id=$1 FOR UPDATE',[currentRound.id]);
    if(!locked.rows[0]||locked.rows[0].phase!=='PEEKING'){await c.query('ROLLBACK');return;}
    const round=locked.rows[0]; const dice=round.dice||rollDice(); const r=resultFor(dice);
    await c.query(`UPDATE rounds SET phase='RESULT',phase_ends_at=NOW()+($1||' seconds')::interval,sum=$2,result_type=$3 WHERE id=$4`,[cachedConfig.resultSeconds,r.sum,r.type,round.id]);
    const bets=await c.query(`SELECT * FROM bets WHERE round_id=$1 AND status='OPEN' FOR UPDATE`,[round.id]);
    const byUser=new Map();
    for(const b of bets.rows){const payout=payoutFor(b.bet_key,Number(b.amount),r);byUser.set(b.user_id,(byUser.get(b.user_id)||0)+payout);await c.query(`UPDATE bets SET status='SETTLED',payout=$1 WHERE id=$2`,[payout,b.id]);}
    const walletUpdates=[];
    for(const [uid,payout] of byUser){if(payout>0){const cq=await c.query('UPDATE characters SET coins=coins+$1 WHERE user_id=$2 RETURNING coins',[payout,uid]);const balance=Number(cq.rows[0].coins);await c.query(`INSERT INTO coin_ledger(user_id,amount,balance_after,type,reason,round_id) VALUES($1,$2,$3,'GAME_WIN',$4,$5)`,[uid,payout,balance,`Round #${round.id} ${r.type}`,round.id]);walletUpdates.push([uid,balance]);}}
    await c.query('COMMIT');
    const q=await p.query('SELECT * FROM rounds WHERE id=$1',[round.id]); currentRound=q.rows[0];
    for(const [uid,balance] of walletUpdates)io.to(`user:${uid}`).emit('wallet:update',{coins:balance});
    io.emit('round:result',{...publicRound(currentRound),...r}); broadcastRound();
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release();}
}

async function playerSnapshot(userId){const p=await db();const q=await p.query('SELECT u.id,u.username,u.role,u.status,c.id character_id,c.name character_name,c.level,c.exp,c.coins FROM users u LEFT JOIN characters c ON c.user_id=u.id WHERE u.id=$1',[userId]);return q.rows[0];}
async function changeCoins(userId,delta,type,reason,actorId,roundId=null,client=null){
  const p=await db();const c=await p.connect();
  try{await c.query('BEGIN');const q=await c.query('UPDATE characters SET coins=coins+$1 WHERE user_id=$2 AND coins+$1>=0 RETURNING coins',[delta,userId]);if(!q.rows[0]){await c.query('ROLLBACK');throw Object.assign(new Error('INSUFFICIENT_COINS'),{code:'INSUFFICIENT_COINS'})}await c.query(`INSERT INTO coin_ledger(user_id,amount,balance_after,type,reason,actor_id,round_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[userId,delta,Number(q.rows[0].coins),type,reason,actorId,roundId]);await c.query('COMMIT');if(client)client.emit('wallet:update',{coins:Number(q.rows[0].coins)});return Number(q.rows[0].coins);}catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release();}
}
async function placeBet(userId,betKey,amount,client){
  await loadConfig(); if(!safeBetKey(betKey))throw new Error('INVALID_BET'); if(!Number.isSafeInteger(amount)||amount<cachedConfig.minBet||amount>cachedConfig.maxBet)throw new Error('INVALID_BET_AMOUNT');
  if(!currentRound||currentRound.phase!=='BETTING')throw new Error('BETTING_CLOSED');
  const p=await db();const c=await p.connect();
  try{await c.query('BEGIN');const rr=await c.query(`SELECT * FROM rounds WHERE id=$1 AND phase='BETTING' FOR UPDATE`,[currentRound.id]);if(!rr.rows[0])throw new Error('BETTING_CLOSED');const uq=await c.query('UPDATE characters SET coins=coins-$1 WHERE user_id=$2 AND coins>=$1 RETURNING coins',[amount,userId]);if(!uq.rows[0])throw new Error('INSUFFICIENT_COINS');await c.query(`INSERT INTO bets(round_id,user_id,bet_key,amount) VALUES($1,$2,$3,$4) ON CONFLICT(round_id,user_id,bet_key) DO UPDATE SET amount=bets.amount+EXCLUDED.amount`,[currentRound.id,userId,betKey,amount]);await c.query(`INSERT INTO coin_ledger(user_id,amount,balance_after,type,reason,round_id) VALUES($1,$2,$3,'GAME_BET',$4,$5)`,[userId,-amount,Number(uq.rows[0].coins),`Bet ${betKey}`,currentRound.id]);await c.query('COMMIT');client.emit('wallet:update',{coins:Number(uq.rows[0].coins)});client.emit('bet:accepted',{roundId:currentRound.id,betKey,amount});io.emit('bet:activity',{userId:String(userId),name:client?.user?.username||'Player',avatar:'🙂',betKey,amount,kind:'PLAYER_BET',ts:Date.now(),roundId:currentRound.id});}catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release();}
}
async function clearBets(userId,client){
  if(!currentRound||currentRound.phase!=='BETTING')throw new Error('BETTING_CLOSED');const p=await db();const c=await p.connect();
  try{await c.query('BEGIN');const b=await c.query(`SELECT COALESCE(SUM(amount),0) total FROM bets WHERE round_id=$1 AND user_id=$2 AND status='OPEN'`,[currentRound.id,userId]);const total=Number(b.rows[0].total);if(total){await c.query(`UPDATE bets SET status='REFUNDED' WHERE round_id=$1 AND user_id=$2 AND status='OPEN'`,[currentRound.id,userId]);const q=await c.query('UPDATE characters SET coins=coins+$1 WHERE user_id=$2 RETURNING coins',[total,userId]);await c.query(`INSERT INTO coin_ledger(user_id,amount,balance_after,type,reason,round_id) VALUES($1,$2,$3,'GAME_REFUND','Cancel current bets',$4)`,[userId,total,Number(q.rows[0].coins),currentRound.id]);client.emit('wallet:update',{coins:Number(q.rows[0].coins)});}await c.query('COMMIT');client.emit('bets:cleared',{roundId:currentRound.id});}catch(e){try{await c.query('ROLLBACK')}catch{}throw e}finally{c.release();}
}
async function getCurrentBets(userId){const p=await db();const q=await p.query(`SELECT bet_key,amount FROM bets WHERE round_id=$1 AND user_id=$2 AND status='OPEN'`,[currentRound?.id||0,userId]);return Object.fromEntries(q.rows.map(x=>[x.bet_key,Number(x.amount)]));}

io.use((socket,next)=>{try{const t=socket.handshake.auth?.token;if(!t)throw new Error('NO_TOKEN');socket.user=verifyToken(t);next();}catch{next(new Error('UNAUTHORIZED'));}});
io.on('connection',async socket=>{
  try{
    const me=await playerSnapshot(socket.user.sub);
    if(!me||!['active','ACTIVE'].includes(me.status)){socket.disconnect(true);return;}
    socket.join(`user:${socket.user.sub}`);
    onlineUsers.set(String(socket.user.sub),{userId:socket.user.sub,name:me.username,avatar:'🙂',level:Number(me.level||1),vip:'PLAYER',type:'PLAYER',socketId:socket.id});
    socket.emit('session:snapshot',{user:me,round:publicRound(currentRound),bets:await getCurrentBets(socket.user.sub)});
    socket.emit('chat:history',await recentChat()); broadcastOnline();
  }catch(e){console.error('socket init',e.message)}
  socket.on('bet:place',async({betKey,amount}={},ack=()=>{})=>{try{await placeBet(socket.user.sub,String(betKey),Number(amount),socket);ack({ok:true});}catch(e){ack({ok:false,error:e.message});socket.emit('game:error',{error:e.message});}});
  socket.on('bet:clear',async(_,ack=()=>{})=>{try{await clearBets(socket.user.sub,socket);ack({ok:true});}catch(e){ack({ok:false,error:e.message});}});
  socket.on('bet:double',async(_,ack=()=>{})=>{try{const bets=await getCurrentBets(socket.user.sub);for(const [k,v] of Object.entries(bets))await placeBet(socket.user.sub,k,v,socket);ack({ok:true});}catch(e){ack({ok:false,error:e.message});}});
  socket.on('chat:send',async({text}={},ack=()=>{})=>{try{await loadConfig();if(!cachedConfig.chatEnabled)throw new Error('CHAT_DISABLED');const msg=String(text||'').trim().slice(0,cachedConfig.chatMaxLength);if(!msg)throw new Error('TIN_NHAN_TRONG');const payload={userId:socket.user.sub,name:socket.user.username||'Player',avatar:'🙂',text:msg,kind:'PLAYER',ts:Date.now()};await saveChat(payload);io.emit('chat:message',payload);ack({ok:true});if(cachedConfig.botEnabled&&cachedConfig.botChatEnabled&&cachedConfig.botGroups?.social!==false)globalThis.__sicboBotReply?.(payload);}catch(e){ack({ok:false,error:e.message});}});
  socket.on('chat:reaction',({emoji}={},ack=()=>{})=>{if(!cachedConfig.reactionsEnabled)return ack({ok:false,error:'REACTIONS_DISABLED'});const allowed=['❤️','😂','🔥','🎲','👍','😮'];if(!allowed.includes(emoji))return ack({ok:false,error:'REACTION_INVALID'});io.emit('chat:reaction',{userId:socket.user.sub,name:socket.user.username||'Player',emoji,ts:Date.now()});ack({ok:true});});
  socket.on('disconnect',()=>{if(onlineUsers.get(String(socket.user.sub))?.socketId===socket.id)onlineUsers.delete(String(socket.user.sub));broadcastOnline();});
});

app.get('/health',(req,res)=>res.json({ok:true,service:'sicbo-server-v2',authoritative:true}));
app.post('/api/auth/register',async(req,res)=>{try{const {username,password,characterName}=req.body||{};if(!/^[a-zA-Z0-9_]{4,24}$/.test(username||''))return res.status(400).json({error:'USERNAME_INVALID'});if(typeof password!=='string'||password.length<8)return res.status(400).json({error:'PASSWORD_TOO_SHORT'});if(!/^\p{L}[\p{L}0-9 _-]{1,23}$/u.test(characterName||''))return res.status(400).json({error:'CHARACTER_NAME_INVALID'});const p=await db();const hash=await bcrypt.hash(password,12);const c=await p.connect();try{await c.query('BEGIN');const email=(username+'@demo.local').slice(0,255);const u=await c.query('INSERT INTO users(username,email,password_hash,role,status) VALUES($1,$2,$3,\'user\',\'active\') RETURNING id,username,role,status',[username,email,hash]);const ch=await c.query('INSERT INTO characters(user_id,name,coins) VALUES($1,$2,1000000) RETURNING id,name,level,exp,coins',[u.rows[0].id,characterName]);await c.query(`INSERT INTO coin_ledger(user_id,amount,balance_after,type,reason) VALUES($1,$2,$3,'SIGNUP_REWARD','Initial virtual demo coins')`,[u.rows[0].id,1000000,1000000]);await c.query('COMMIT');res.status(201).json({token:tokenFor(u.rows[0]),user:u.rows[0],character:ch.rows[0]});}catch(e){await c.query('ROLLBACK');if(e.code==='23505')return res.status(409).json({error:'USERNAME_OR_CHARACTER_EXISTS'});throw e}finally{c.release()}}catch(e){console.error(e);res.status(500).json({error:'SERVER_ERROR'})}});
app.post('/api/auth/login',async(req,res)=>{try{const {username,password}=req.body||{};const p=await db();const q=await p.query('SELECT u.*,c.id character_id,c.name character_name,c.level,c.exp,c.coins FROM users u LEFT JOIN characters c ON c.user_id=u.id WHERE u.username=$1',[username]);const u=q.rows[0];if(!u||!(await bcrypt.compare(password||'',u.password_hash)))return res.status(401).json({error:'INVALID_CREDENTIALS'});if(!['active','ACTIVE'].includes(u.status))return res.status(403).json({error:'ACCOUNT_DISABLED'});res.json({token:tokenFor(u),user:{id:u.id,username:u.username,role:u.role,status:u.status},character:{id:u.character_id,name:u.character_name,level:u.level,exp:u.exp,coins:Number(u.coins)}})}catch(e){console.error(e);res.status(500).json({error:'SERVER_ERROR'})}});
app.get('/api/me',auth,async(req,res)=>{const me=await playerSnapshot(req.user.sub);if(!me)return res.status(404).json({error:'NOT_FOUND'});res.json(me)});
app.get('/api/round/current',auth,async(req,res)=>res.json({round:publicRound(currentRound),bets:await getCurrentBets(req.user.sub)}));
app.get('/api/chat/history',auth,async(req,res)=>res.json({messages:await recentChat()}));
app.get('/api/presence',auth,async(req,res)=>res.json({count:onlineUsers.size,users:onlineSnapshot()}));
app.get('/api/admin/players',auth,admin,async(req,res)=>{const p=await db();const q=await p.query('SELECT u.id,u.username,u.role,u.status,u.created_at,c.name character_name,c.level,c.exp,c.coins FROM users u LEFT JOIN characters c ON c.user_id=u.id ORDER BY u.id DESC LIMIT 500');res.json(q.rows)});
app.post('/api/admin/players/:id/status',auth,admin,async(req,res)=>{const raw=String(req.body?.status||'').toUpperCase();if(!['ACTIVE','SUSPENDED','BLOCKED'].includes(raw))return res.status(400).json({error:'INVALID_STATUS'});const status=raw==='ACTIVE'?'active':'blocked';const p=await db();await p.query('UPDATE users SET status=$1,updated_at=NOW() WHERE id=$2',[status,req.params.id]);await p.query('INSERT INTO audit_log(actor_id,action,target_user_id,detail) VALUES($1,$2,$3,$4)',[req.user.sub,'PLAYER_STATUS_CHANGE',req.params.id,JSON.stringify({status})]);res.json({ok:true,status})});
app.post('/api/admin/players/:id/coins',auth,admin,async(req,res)=>{const amount=Number(req.body?.amount);const reason=String(req.body?.reason||'Admin adjustment').slice(0,200);if(!Number.isSafeInteger(amount)||amount===0)return res.status(400).json({error:'INVALID_AMOUNT'});try{const coins=await changeCoins(Number(req.params.id),amount,'ADMIN_ADJUSTMENT',reason,req.user.sub);await db().then(p=>p.query('INSERT INTO audit_log(actor_id,action,target_user_id,detail) VALUES($1,$2,$3,$4)',[req.user.sub,'COIN_ADJUSTMENT',req.params.id,JSON.stringify({amount,reason})]));res.json({ok:true,coins})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/admin/game',auth,admin,async(req,res)=>{await loadConfig();res.json({config:cachedConfig,round:publicRound(currentRound)})});
app.post('/api/admin/game/config',auth,admin,async(req,res)=>{try{const b=req.body||{};const n=(v,d,min,max)=>{const x=Number(v);return Number.isFinite(x)?Math.max(min,Math.min(max,x)):d;};const enabled=b.enabled===undefined?cachedConfig.enabled:Boolean(b.enabled);const paused=b.paused===undefined?cachedConfig.paused:Boolean(b.paused);const bettingSeconds=Math.round(n(b.bettingSeconds,cachedConfig.bettingSeconds,5,300));const shakeSeconds=Math.round(n(b.shakeSeconds,cachedConfig.shakeSeconds,1,60));const peekSeconds=Math.round(n(b.peekSeconds,cachedConfig.peekSeconds,1,120));const resultSeconds=Math.round(n(b.resultSeconds,cachedConfig.resultSeconds,1,120));const minBet=Math.floor(n(b.minBet,cachedConfig.minBet,1,Number.MAX_SAFE_INTEGER));const maxBet=Math.floor(n(b.maxBet,cachedConfig.maxBet,minBet,Number.MAX_SAFE_INTEGER));const taiXiuMultiplier=n(b.taiXiuMultiplier,cachedConfig.taiXiuMultiplier,0,1000);const chanLeMultiplier=n(b.chanLeMultiplier,cachedConfig.chanLeMultiplier,0,1000);const baoAnyMultiplier=n(b.baoAnyMultiplier,cachedConfig.baoAnyMultiplier,0,10000);const sm={...cachedConfig.sumMultipliers,...(b.sumMultipliers||{})};for(const k of Object.keys(sm))sm[k]=n(sm[k],cachedConfig.sumMultipliers[k]||6,0,10000);const diceOne=Math.round(n(b.diceOne,cachedConfig.diceOne,1,6));const diceTwo=Math.round(n(b.diceTwo,cachedConfig.diceTwo,1,6));const diceThree=Math.round(n(b.diceThree,cachedConfig.diceThree,1,6));const botMinMs=Math.round(n(b.botMinMs,cachedConfig.botMinMs,500,60000));const botMaxMs=Math.round(n(b.botMaxMs,cachedConfig.botMaxMs,botMinMs,120000));const chatMaxLength=Math.round(n(b.chatMaxLength,cachedConfig.chatMaxLength,20,1000));const botEnabled=b.botEnabled===undefined?cachedConfig.botEnabled:Boolean(b.botEnabled);const botBetEnabled=b.botBetEnabled===undefined?cachedConfig.botBetEnabled:Boolean(b.botBetEnabled);const botChatEnabled=b.botChatEnabled===undefined?cachedConfig.botChatEnabled:Boolean(b.botChatEnabled);const botGroups={...cachedConfig.botGroups,...(b.botGroups||{})};for(const k of ['social','betting','result','vip'])botGroups[k]=Boolean(botGroups[k]);const chatEnabled=b.chatEnabled===undefined?cachedConfig.chatEnabled:Boolean(b.chatEnabled);const reactionsEnabled=b.reactionsEnabled===undefined?cachedConfig.reactionsEnabled:Boolean(b.reactionsEnabled);const roomTitle=String(b.roomTitle??cachedConfig.roomTitle).slice(0,80);const welcomeMessage=String(b.welcomeMessage??cachedConfig.welcomeMessage).slice(0,240);const p=await db();await p.query(`UPDATE game_config SET enabled=$1,paused=$2,betting_seconds=$3,shake_seconds=$4,peek_seconds=$5,result_seconds=$6,min_bet=$7,max_bet=$8,tai_xiu_multiplier=$9,chan_le_multiplier=$10,bao_any_multiplier=$11,sum_multipliers=$12,dice_one=$13,dice_two=$14,dice_three=$15,bot_enabled=$16,bot_bet_enabled=$17,bot_chat_enabled=$18,bot_min_ms=$19,bot_max_ms=$20,bot_groups=$21,chat_enabled=$22,chat_max_length=$23,reactions_enabled=$24,room_title=$25,welcome_message=$26,updated_by=$27,updated_at=NOW() WHERE id=1`,[enabled,paused,bettingSeconds,shakeSeconds,peekSeconds,resultSeconds,minBet,maxBet,taiXiuMultiplier,chanLeMultiplier,baoAnyMultiplier,JSON.stringify(sm),diceOne,diceTwo,diceThree,botEnabled,botBetEnabled,botChatEnabled,botMinMs,botMaxMs,JSON.stringify(botGroups),chatEnabled,chatMaxLength,reactionsEnabled,roomTitle,welcomeMessage,req.user.sub]);const detail={enabled,paused,bettingSeconds,shakeSeconds,peekSeconds,resultSeconds,minBet,maxBet,taiXiuMultiplier,chanLeMultiplier,baoAnyMultiplier,sumMultipliers:sm,diceOne,diceTwo,diceThree,botEnabled,botBetEnabled,botChatEnabled,botMinMs,botMaxMs,botGroups,chatEnabled,chatMaxLength,reactionsEnabled,roomTitle,welcomeMessage};await p.query('INSERT INTO audit_log(actor_id,action,detail) VALUES($1,$2,$3)',[req.user.sub,'GAME_CONFIG_UPDATE',JSON.stringify(detail)]);await loadConfig();broadcastRound();io.emit('game:config',cachedConfig);res.json({ok:true,config:cachedConfig});}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/admin/game/force-result',auth,admin,async(req,res)=>{if(!currentRound||!['BETTING','SHAKING','PEEKING'].includes(currentRound.phase))return res.status(400).json({error:'NO_ACTIVE_ROUND'});const d=Array.isArray(req.body?.dice)?req.body.dice.map(Number):null;if(!d||d.length!==3||d.some(x=>x<1||x>6||!Number.isInteger(x)))return res.status(400).json({error:'INVALID_DICE'});const p=await db();await p.query('UPDATE rounds SET dice=$1,forced_by=$2 WHERE id=$3',[JSON.stringify(d),req.user.sub,currentRound.id]);await p.query('INSERT INTO audit_log(actor_id,action,detail) VALUES($1,$2,$3)',[req.user.sub,'FORCE_TEST_RESULT',JSON.stringify({roundId:currentRound.id,dice:d})]);const q=await p.query('SELECT * FROM rounds WHERE id=$1',[currentRound.id]);currentRound=q.rows[0];broadcastRound();res.json({ok:true,round:publicRound(currentRound)})});
app.post('/api/admin/game/force-phase',auth,admin,async(req,res)=>{const phase=String(req.body?.phase||'');if(!currentRound||!['BETTING','SHAKING','PEEKING','RESULT'].includes(phase))return res.status(400).json({error:'INVALID_PHASE'});const p=await db();const seconds={BETTING:cachedConfig.bettingSeconds,SHAKING:cachedConfig.shakeSeconds,PEEKING:cachedConfig.peekSeconds,RESULT:cachedConfig.resultSeconds}[phase];const q=await p.query('UPDATE rounds SET phase=$1,phase_ends_at=NOW()+make_interval(secs => $2) WHERE id=$3 RETURNING *',[phase,seconds,currentRound.id]);currentRound=q.rows[0];await p.query('INSERT INTO audit_log(actor_id,action,detail) VALUES($1,$2,$3)',[req.user.sub,'FORCE_PHASE',JSON.stringify({roundId:currentRound.id,phase})]);broadcastRound();res.json({ok:true,round:publicRound(currentRound)})});
app.get('/api/admin/audit',auth,admin,async(req,res)=>{const p=await db();const q=await p.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500');res.json(q.rows)});

app.use('/admin',express.static(path.join(PLAYER,'admin')));
app.use(express.static(PLAYER));

async function boot(){
  await db();
  await loadConfig();
  const q=await pool.query("SELECT * FROM rounds WHERE phase IN ('BETTING','SHAKING','PEEKING','RESULT') ORDER BY id DESC LIMIT 1");
  currentRound=q.rows[0]||null;
  if(!currentRound&&!cachedConfig.enabled&&!cachedConfig.paused) await createRound();
  if(!currentRound&&cachedConfig.enabled&&!cachedConfig.paused) await createRound();
  scheduler=setInterval(transitionRound,250);
  httpServer.listen(PORT,'0.0.0.0',()=>console.log(`SicBo V2 authoritative server on :${PORT}`));
  startBotChat(io,()=>currentRound?.phase||'BETTING',saveChat,()=>cachedConfig);
}
boot().catch(e=>{console.error(e);process.exit(1)});
