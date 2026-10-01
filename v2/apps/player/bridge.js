(function(){
'use strict';
const w=window, p=window.parent;
const token=w.__SICBO_TOKEN;
if(!token||!p.io){console.warn('SicBo bridge: missing token/socket.io');return;}
let socket=null, serverRound=null, lastRoundId=null, originalForceOpen=null, originalAnimate=null;
const E=(code)=>{try{return w.eval(code)}catch{return undefined}};
const S=(code)=>{try{w.eval(code)}catch(e){console.warn('bridge eval',code,e)}};
function toast(m,t='info'){try{w.showToast(m,t)}catch{}}
function parentCoins(n){const el=p.document.getElementById('coins');if(el)el.textContent='🪙 '+Number(n||0).toLocaleString('vi-VN')+' COIN';}
function status(text,cls='bg-green-500'){try{w.updateStatusBadge(text,cls)}catch{}}
function setBets(obj){S(`currentBets=${JSON.stringify(obj||{})}; updateBetBadges();`)}
function setBalance(n){S(`userBalance=${Number(n)||0}; updateBalanceDisplay();`);parentCoins(n)}
function addBet(k,a){const bets=E('currentBets')||{};bets[k]=(Number(bets[k])||0)+Number(a);setBets(bets)}
function countdownUntil(ts){return Math.max(0,Math.ceil((new Date(ts).getTime()-Date.now())/1000));}
function showServerResult(r){
  const dice=r.dice||E('roundResults')||[1,1,1];
  S(`roundResults=${JSON.stringify(dice)};`);
  try{w.showResultOverlay(dice,r.sum,r.type)}catch{}
  try{w.sound?.playWin?.()}catch{}
  try{w.gameState='RESULT'}catch{}
}
function serverFinish(){
  if(!serverRound?.dice)return;
  const r={dice:serverRound.dice,sum:serverRound.sum||serverRound.dice.reduce((a,b)=>a+b,0),type:serverRound.resultType||'RESULT'};
  showServerResult(r);
  const old=E('currentBets')||{};if(Object.keys(old).length){S(`previousBets={...currentBets}; currentBets={}; updateBetBadges();`)}
}
function beginShake(){
  const dice=serverRound?.dice||[1,1,1];S(`roundResults=${JSON.stringify(dice)}; gameState='SHAKING';`);
  if(originalAnimate)originalAnimate(()=>{});
}
function applyRound(r){
  if(!r)return;serverRound=r;
  if(r.id!==lastRoundId && r.phase==='BETTING'){lastRoundId=r.id;setBets({});S('v5Locked=false;');}
  const remain=countdownUntil(r.phaseEndsAt);
  try{w.document.getElementById('timer-display').innerText=remain}catch{}
  if(r.phase==='BETTING'){
    S("gameState='BETTING';");status('ĐANG ĐẶT CƯỢC','bg-green-500');
    try{w.document.getElementById('peek-instruction')?.classList.add('hidden');w.document.getElementById('result-overlay')?.classList.add('opacity-0','pointer-events-none')}catch{}
  }else if(r.phase==='SHAKING'){
    status('ĐANG XÓC BÁT','bg-yellow-500');beginShake();
  }else if(r.phase==='PEEKING'){
    S("gameState='PEEKING';");status('HÃY MỞ BÁT!','bg-amber-400');
    try{w.document.getElementById('peek-instruction')?.classList.remove('hidden')}catch{}
  }else if(r.phase==='RESULT'){
    S("gameState='RESULT';");status('TRẢ THƯỞNG','bg-rose-500');showServerResult({dice:r.dice,sum:r.sum,type:r.resultType});
  }
}
function patchGame(){
  try{if(w.timerInterval)clearInterval(w.timerInterval)}catch{}
  originalForceOpen=w.forceOpenBowl;
  originalAnimate=w.animateShakeDice;
  // Disable all client-side round transitions. The server is the only round clock.
  w.startBettingPhase=function(){};
  w.startShakingPhase=function(){};
  w.startPeekingPhase=function(){};
  w.finishPeekingPhase=serverFinish;
  w.forceOpenBowl=function(){if(serverRound?.phase==='PEEKING'&&originalForceOpen)return originalForceOpen();toast('Chưa đến thời điểm mở bát!','warning')};
  // Preserve the original 3D, only redirect economic actions to the server.
  w.placeBet=function(key){
    const amount=Number(E('selectedChipValue')||0);if(!socket||serverRound?.phase!=='BETTING'){toast('Phiên chưa mở cược','warning');return;}
    socket.emit('bet:place',{betKey:key,amount},res=>{if(!res?.ok)toast(res?.error||'Không thể đặt cược','error')});
  };
  w.clearBets=function(){if(socket)socket.emit('bet:clear',{},res=>{if(!res?.ok)toast(res?.error||'Không thể hủy cược','error')})};
  w.doubleBets=function(){if(socket)socket.emit('bet:double',{},res=>{if(!res?.ok)toast(res?.error||'Không thể gấp cược','error')})};
  // Rebet remains a visual helper: the actual new bets are sent one-by-one to the server.
  w.reBet=function(){const prev=E('previousBets')||{};if(!Object.keys(prev).length){toast('Chưa có cược phiên trước','info');return;}for(const [key,amount] of Object.entries(prev)){socket.emit('bet:place',{betKey:key,amount:Number(amount)},()=>{})}};
  // Keep the original 3D scene fully alive.
  S("gameState='BETTING';");
}
function connect(){
 socket=p.io({auth:{token},transports:['websocket','polling']});
 socket.on('connect',()=>{p.document.getElementById('connection').textContent='● Server đã kết nối';p.document.getElementById('connection').style.color='#7ee787'});
 socket.on('disconnect',()=>{p.document.getElementById('connection').textContent='● Mất kết nối';p.document.getElementById('connection').style.color='#ff7b72'});
 socket.on('connect_error',e=>{p.document.getElementById('connection').textContent='● Lỗi kết nối';console.warn(e.message)});
 socket.on('session:snapshot',x=>{if(x?.round)applyRound(x.round);setBets(x?.bets||{});if(x?.user) setBalance(Number(x.user.coins))});
 socket.on('round:state',applyRound);
 socket.on('wallet:update',x=>setBalance(Number(x.coins)));
 socket.on('bet:accepted',x=>{addBet(x.betKey,x.amount);toast('Đã đặt cược '+Number(x.amount).toLocaleString('vi-VN')+' COIN','success')});
 socket.on('bets:cleared',()=>{setBets({});toast('Đã hoàn tiền cược','info')});
 socket.on('round:result',r=>{serverRound=r;S(`roundResults=${JSON.stringify(r.dice)}; gameState='RESULT';`);showServerResult(r);setBets({});});
 socket.on('game:error',x=>toast(x?.error||'Game error','error'));
}
function start(){patchGame();connect();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,250),{once:true});else setTimeout(start,250);
})();

/* V6 SOCIAL LOUNGE: additive only; game.html remains untouched. */
(function installRealtimeLounge(){
  const d=w.document;
  function boot(){
    if(d.getElementById('sicbo-lounge-v6')) return;
    const style=d.createElement('style');style.id='sicbo-lounge-v6-style';
    style.textContent=`#sicbo-lounge-v6{position:fixed;right:12px;bottom:12px;width:min(390px,36vw);min-width:275px;height:390px;z-index:99999;background:rgba(6,9,17,.96);border:1px solid rgba(255,215,0,.42);border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.5);color:#fff;font-family:system-ui;display:flex;flex-direction:column;overflow:hidden}#sicbo-lounge-v6 .h{padding:9px 11px;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,rgba(255,215,0,.17),rgba(0,245,255,.09));font-weight:800}.v6-online{font-size:10px;color:#7ee787}.v6-tabs{display:flex;gap:5px;padding:6px;background:#0b1020}.v6-tabs button{flex:1;padding:5px;border:0;border-radius:8px;background:#182033;color:#b9c3d4;font-size:10px}.v6-tabs button.on{background:#ffd700;color:#111;font-weight:900}.v6-pane{flex:1;overflow:auto;padding:7px}.v6-msg{font-size:11px;line-height:1.3;margin:5px 0}.v6-msg .name{font-weight:800;color:#00f5ff}.v6-msg .me{color:#7ee787}.v6-msg .vip{font-size:8px;color:#ffd700;border:1px solid #7b6420;border-radius:5px;padding:1px 3px;margin-left:3px}.v6-msg small{opacity:.42;margin-left:5px}.v6-user{display:flex;align-items:center;gap:7px;padding:6px;border-bottom:1px solid rgba(255,255,255,.05)}.v6-user .ava{font-size:20px}.v6-user .meta{flex:1}.v6-user .lv{font-size:9px;color:#9aa6ba}.v6-bet{display:flex;gap:7px;align-items:center;padding:7px;margin:4px 0;border-radius:9px;background:rgba(255,215,0,.06);border:1px solid rgba(255,215,0,.1);font-size:10px}.v6-bet .coin{margin-left:auto;color:#ffd700;font-weight:800}.v6-reactions{display:flex;gap:4px;padding:5px 8px;border-top:1px solid rgba(255,255,255,.05)}.v6-reactions button{padding:3px 7px;background:#182033;color:#fff;border:0;border-radius:8px}.v6-form{display:flex;gap:6px;padding:7px;border-top:1px solid rgba(255,255,255,.08)}.v6-form input{flex:1;min-width:0;background:#111827;border:1px solid #30384a;color:#fff;border-radius:9px;padding:8px;font-size:12px}.v6-form button{border:0;border-radius:9px;padding:0 11px;background:#ffd700;color:#111;font-weight:900}`;
    d.head.appendChild(style);
    const box=d.createElement('section');box.id='sicbo-lounge-v6';
    box.innerHTML=`<div class="h"><span id="v6-title">💬 PHÒNG CHAT</span><span class="v6-online" id="v6-online">● ONLINE 0</span></div><div class="v6-tabs"><button class="on" data-tab="chat">💬 Chat</button><button data-tab="online">👥 Online</button><button data-tab="bets">🎲 Cược live</button></div><div class="v6-pane" id="v6-pane"></div><div class="v6-reactions">${['❤️','😂','🔥','🎲','👍','😮'].map(e=>`<button type="button" data-react="${e}">${e}</button>`).join('')}</div><form class="v6-form"><input id="v6-input" maxlength="240" placeholder="Nhập tin nhắn..." autocomplete="off"><button>Gửi</button></form>`;
    d.body.appendChild(box);
    const pane=d.getElementById('v6-pane'),input=d.getElementById('v6-input');let active='chat',messages=[],users=[],bets=[];
    const safe=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const render=()=>{if(active==='chat'){pane.innerHTML=messages.map(x=>`<div class="v6-msg"><span class="name">${safe(x.avatar||'🤖')} ${safe(x.name||'Player')}</span>${x.vip?` <span class="vip">${safe(x.vip)}</span>`:''}: ${safe(x.text)}<small>${new Date(x.ts||Date.now()).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</small></div>`).join('');}else if(active==='online'){pane.innerHTML=users.map(u=>`<div class="v6-user"><span class="ava">${safe(u.avatar||'🙂')}</span><div class="meta"><b>${safe(u.name||'Player')}</b><div class="lv">${u.type==='BOT'?'BOT • ':''}LV.${safe(u.level||1)} • ${safe(u.vip||'PLAYER')}</div></div><span>●</span></div>`).join('');}else{pane.innerHTML=bets.slice(-50).reverse().map(x=>`<div class="v6-bet"><span>${safe(x.avatar||'🎲')}</span><b>${safe(x.name||'Player')}</b><span>→ ${safe(x.betKey)}</span><span class="coin">${Number(x.amount||0).toLocaleString('vi-VN')}</span></div>`).join('');}pane.scrollTop=pane.scrollHeight;};
    const addMsg=x=>{messages.push(x);if(messages.length>100)messages.shift();if(active==='chat')render()};
    box.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{active=btn.dataset.tab;box.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===btn));render()});
    box.querySelectorAll('[data-react]').forEach(btn=>btn.onclick=()=>socket?.emit('chat:reaction',{emoji:btn.dataset.react}));
    box.querySelector('form').onsubmit=e=>{e.preventDefault();const text=input.value.trim();if(!text||!socket)return;socket.emit('chat:send',{text},r=>{if(!r?.ok)toast(r?.error||'Không gửi được chat','error')});input.value='';};
    if(socket){
      socket.on('chat:history',arr=>{messages=arr||[];render()});
      socket.on('chat:message',x=>addMsg(x));
      socket.on('presence:update',x=>{users=x?.users||[];const el=d.getElementById('v6-online');if(el)el.textContent='● ONLINE '+Number(x?.count||0);render()});
      socket.on('bet:activity',x=>{bets.push(x);if(bets.length>80)bets.shift();if(active==='bets')render();});
      socket.on('chat:reaction',x=>addMsg({name:x.name,avatar:'💬',text:x.emoji,ts:x.ts}));
      socket.on('game:config',cfg=>{if(cfg?.roomTitle)d.getElementById('v6-title').textContent='💬 '+cfg.roomTitle;if(cfg?.chatMaxLength)input.maxLength=Number(cfg.chatMaxLength);});
    }
    render();window.__SICBO_CHAT_ADD=addMsg;
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',()=>setTimeout(boot,500),{once:true});else setTimeout(boot,500);
})();
