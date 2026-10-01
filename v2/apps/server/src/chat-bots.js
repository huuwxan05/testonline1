export const BOT_PROFILES = [
  {id:'bot_linh',name:'Linh_DaiGia',avatar:'👩‍💼',level:42,vip:'VIP 5',group:'social'},
  {id:'bot_shark',name:'Shark_Hung',avatar:'🦈',level:68,vip:'VIP 8',group:'betting'},
  {id:'bot_soicau',name:'Trum_SoiCau',avatar:'🔮',level:55,vip:'VIP 6',group:'betting'},
  {id:'bot_vip',name:'Minh_VIP99',avatar:'💎',level:99,vip:'VIP 10',group:'vip'},
  {id:'bot_pro',name:'HoangPro88',avatar:'🎩',level:77,vip:'VIP 9',group:'result'},
  {id:'bot_tuan',name:'Tuan_Bo_Doi',avatar:'🪖',level:31,vip:'VIP 3',group:'social'},
  {id:'bot_cute',name:'ThanhNu_Casino',avatar:'🌸',level:25,vip:'VIP 2',group:'social'},
  {id:'bot_game',name:'GameIsEasy',avatar:'🎮',level:60,vip:'VIP 7',group:'result'}
];
const GENERAL=['Chào anh em 👋','Phòng hôm nay đông vui ghê 😎','Chúc mọi người chơi vui nhé!','Mình vừa vào phòng đây.','Có ai đang theo dõi phiên này không?'];
const BETTING=['Mình đang ngó Tài/Xỉu phiên này.','Đặt nhẹ thôi, quản lý vốn nhé.','Có ai cùng bàn luận phiên này không?','Mình vào một lệnh mô phỏng nhỏ 🎲','Chờ sát giờ mới quyết định.'];
const SHAKE=['Đang xóc rồi! 🎲','Chờ mở bát nào!','Hóng kết quả 👀'];
const RESULT=['Ra kết quả rồi!','Phiên này bất ngờ thật 😮','GG phiên vừa rồi!','Chúc mừng anh em 🎉','Xem lịch sử rồi tính phiên sau.'];
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function botMessage(phase,cfg){
  const list=BOT_PROFILES.filter(p=>cfg.botGroups?.[p.group]!==false && (cfg.botGroups?.vip!==false || p.vip!=='VIP 10'));
  const p=list[Math.floor(Math.random()*list.length)]||BOT_PROFILES[0];
  const pool=phase==='BETTING'?BETTING:phase==='SHAKING'?SHAKE:phase==='RESULT'?RESULT:GENERAL;
  return {botId:p.id,name:p.name,avatar:p.avatar,level:p.level,vip:p.vip,group:p.group,text:pick(pool),kind:'BOT',ts:Date.now()};
}
const BET_KEYS=['TAI','XIU','CHAN','LE','BAO_ANY'];
function simulatedBet(cfg){const list=BOT_PROFILES.filter(p=>cfg.botGroups?.betting!==false && cfg.botGroups?.[p.group]!==false);const p=list[Math.floor(Math.random()*list.length)]||BOT_PROFILES[1];const key=BET_KEYS[Math.floor(Math.random()*BET_KEYS.length)];const amount=[10000,20000,50000,100000,200000][Math.floor(Math.random()*5)];return {botId:p.id,name:p.name,avatar:p.avatar,level:p.level,vip:p.vip,group:p.group,betKey:key,amount,kind:'BOT_SIMULATED',ts:Date.now()};}
export function startBotChat(io,getPhase,saveChat,getConfig=()=>({})){
  let timer=null;
  const emitBot=(m)=>{io.emit('chat:message',m);saveChat?.(m);};
  globalThis.__sicboBotReply=(payload)=>{
    const cfg=getConfig()||{}; if(!cfg.botEnabled||!cfg.botChatEnabled||cfg.botGroups?.social===false)return;
    const txt=String(payload.text||'').toLowerCase();
    let reply='';
    if(txt.includes('bot')) reply='Có mình đây 😎';
    else if(txt.includes('chào')||txt.includes('hello')) reply='Chào bạn 👋 Chúc bạn vui vẻ!';
    else if(txt.includes('tài')||txt.includes('xỉu')) reply='Mình đang theo dõi phiên này cùng bạn 👀';
    else if(txt.includes('bao')||txt.includes('bão')) reply='Bình tĩnh soi phiên nhé 🎲';
    else if(txt.includes('?')) reply='Mình cũng đang hóng câu trả lời cùng phòng 😄';
    if(!reply && Math.random()<0.38) reply='Haha 😄';
    if(!reply)return;
    setTimeout(()=>{const p=BOT_PROFILES.filter(x=>cfg.botGroups?.[x.group]!==false)[Math.floor(Math.random()*BOT_PROFILES.length)]||BOT_PROFILES[0];emitBot({botId:p.id,name:p.name,avatar:p.avatar,level:p.level,vip:p.vip,group:p.group,text:reply,kind:'BOT_REPLY',replyToUserId:payload.userId,ts:Date.now()});},700+Math.floor(Math.random()*2200));
  };
  const tick=()=>{const phase=getPhase();const cfg=getConfig()||{};if(cfg.botEnabled){if(cfg.botChatEnabled&&cfg.botGroups?.social!==false&&Math.random()<0.78&&['BETTING','SHAKING','PEEKING','RESULT'].includes(phase))emitBot(botMessage(phase,cfg));if(cfg.botBetEnabled&&phase==='BETTING'&&cfg.botGroups?.betting!==false&&Math.random()<0.65){const b=simulatedBet(cfg);io.emit('bot:activity',b);io.emit('bet:activity',b);emitBot({...b,text:`🎲 mô phỏng đặt ${b.betKey} ${b.amount.toLocaleString('vi-VN')} COIN`});}}const min=Math.max(500,Number(cfg.botMinMs||2500)),max=Math.max(min,Number(cfg.botMaxMs||6000));timer=setTimeout(tick,min+Math.floor(Math.random()*(max-min+1)));};
  timer=setTimeout(tick,1800);return ()=>{if(timer)clearTimeout(timer);delete globalThis.__sicboBotReply;};
}
