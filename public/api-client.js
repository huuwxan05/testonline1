window.RoyalAPI = (() => {
  let csrfToken = null;
  async function request(action, options={}) {
    const method = options.method || 'GET';
    if (method !== 'GET' && !csrfToken) {
      const r = await fetch('/api/index.php?action=csrf', {credentials:'include'});
      const j = await r.json(); csrfToken = j.csrf;
    }
    const headers = {'Accept':'application/json'};
    if (method !== 'GET') { headers['Content-Type']='application/json'; headers['X-CSRF-Token']=csrfToken; }
    const r = await fetch('/api/index.php?action='+encodeURIComponent(action), {method,headers,credentials:'include',body: method==='GET'?undefined:JSON.stringify(options.body||{})});
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'API error');
    return j;
  }
  return {request, health:()=>request('health'), me:()=>request('me'), login:(login,password)=>request('login',{method:'POST',body:{login,password}}), register:(username,email,password)=>request('register',{method:'POST',body:{username,email,password}}), logout:()=>request('logout',{method:'POST'}), wallet:()=>request('wallet'), games:()=>request('games'), quests:()=>request('quests'), vip:()=>request('vip'), leaderboard:()=>request('leaderboard'), history:()=>request('history'), chat:()=>request('chat_list'), sendChat:message=>request('chat_send',{method:'POST',body:{message}}), placeBet:(game,selection,amount,round_id=null)=>request('place_bet',{method:'POST',body:{game,selection,amount,round_id}})};
})();
