// Browser-only game engine for the GitHub Pages edition.
// Everything here is simulated and saved on the current device. No shared multiplayer.
const KEY = 'shadow_market_browser_game_v1';
const HOUR = 3_600_000;
const ITEMS = [
  ['graphics-card','Graphics Card','TECH','◈',30000],
  ['luxury-watch','Luxury Watch','LUXURY','◉',50000],
  ['rare-collectible','Rare Collectible','COLLECTIBLE','✦',20000],
  ['mysterious-cargo','Mysterious Cargo','CARGO','⬡',15000],
  ['gold-bar','Gold Bar','PRECIOUS','◆',100000],
  ['smartphone','Smartphone','TECH','▣',60000],
  ['vintage-art','Vintage Art','ART','✳',80000]
];

const randomId = () => {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
};
const nowText = () => new Date().toISOString();
const maxPrice = (item,value) => Math.max(Math.round(item.base_price * .4), Math.min(Math.round(item.base_price * 3), Math.round(value)));
const whole = n => Number.isSafeInteger(n) && n >= 1 && n <= 1000;
const parseBody = options => {
  try { return JSON.parse(options?.body || '{}'); }
  catch { throw Error('Invalid request.'); }
};
const fail = (message) => { throw Error(message); };

const freshState = () => {
  const now = Date.now();
  const prices = ITEMS.map(([item_id,item_name,category,symbol,price]) => ({
    item_id,item_name,category,symbol,price,previous:price,base_price:price,
    supply:1000,demand:100,updated_at:nowText()
  }));
  const history = {};
  for (const item of prices) {
    history[item.item_id] = [];
    let price = item.base_price;
    for (let i = 36; i >= 1; i--) {
      price = maxPrice(item, price * (1 + (Math.random() - .5) * .046));
      history[item.item_id].push({ price, created_at: new Date(now - i * 15000).toISOString() });
    }
    history[item.item_id].push({ price:item.price, created_at:nowText() });
  }
  return {version:1,users:[],sessions:{},prices,history,inventory:{},shops:{},
    transactions:[],auctions:[],chat:[],events:[],nextId:1,lastTick:now,lastEvent:now};
};
function read() {
  let saved;
  try { saved = localStorage.getItem(KEY); }
  catch { throw Error('Browser storage is blocked. Allow site storage to save progress.'); }
  if (!saved) { const value = freshState(); save(value); return value; }
  try {
    const data = JSON.parse(saved);
    if (data.version !== 1 || !Array.isArray(data.users) || !Array.isArray(data.prices)) throw Error('Outdated browser save.');
    return data;
  } catch { throw Error('Your browser game save could not be read. Clear this site’s storage to reset it.'); }
}
function save(data) {
  try { localStorage.setItem(KEY,JSON.stringify(data)); }
  catch { throw Error('Unable to save game. Check available browser storage.'); }
}
function playerPublic(u) {
  return {id:u.id,username:u.username,balance:u.balance,created_at:u.created_at};
}
function authenticated(data,token) {
  const session = data.sessions[token];
  if (!session || session.expires < Date.now()) return fail('Please sign in again.');
  const user = data.users.find(u => u.id === session.id);
  if (!user) return fail('Please sign in again.');
  return user;
}
async function hash(password,salt) {
  const source = new TextEncoder().encode(salt + ':' + password);
  const digest = await crypto.subtle.digest('SHA-256',source);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('');
}
function localItem(state,itemId) { return state.prices.find(p => p.item_id === itemId); }
function quantityHeld(state,userId) { return Object.values(state.inventory[userId] || {}).reduce((sum,i) => sum + i.quantity,0); }
function putItem(state,userId,itemId,quantity,cost) {
  const inventory = state.inventory[userId] || (state.inventory[userId] = {});
  const previous = inventory[itemId] || {quantity:0,avg_cost:0};
  const combined = previous.quantity + quantity;
  inventory[itemId] = {quantity:combined,avg_cost:Math.round((previous.avg_cost * previous.quantity + cost * quantity)/combined)};
}
function takeItem(state,userId,itemId,quantity) {
  const owned = state.inventory[userId]?.[itemId];
  if (!owned || owned.quantity < quantity) fail('Not enough items in inventory.');
  owned.quantity -= quantity;
}
function changePrice(state,item,newPrice) {
  const cents = maxPrice(item,newPrice);
  item.previous=item.price;
  item.price=cents;
  item.updated_at=nowText();
  const history=state.history[item.item_id] || (state.history[item.item_id]=[]);
  history.push({price:cents,created_at:nowText()});
  if (history.length>100) history.splice(0,history.length-100);
}
function settleAuctions(state) {
  let settled=false;
  for (const auction of state.auctions) {
    if (auction.status !== 'active' || auction.ends_at > Date.now()) continue;
    const seller=state.users.find(u => u.id===auction.seller_id);
    if (auction.bidder_id) {
      const winner=state.users.find(u => u.id===auction.bidder_id);
      if (seller && winner) {
        seller.balance += auction.bid;
        putItem(state,winner.id,auction.item_id,auction.quantity,Math.round(auction.bid/auction.quantity));
      }
    } else if (seller) {
      putItem(state,seller.id,auction.item_id,auction.quantity,localItem(state,auction.item_id).price);
    }
    auction.status='closed';
    settled=true;
  }
  return settled;
}
function tickState(state) {
  const current=Date.now();
  const elapsed=Math.max(0,current - state.lastTick);
  if (elapsed >= 15000) {
    // Catch up a small number of steps to avoid huge jumps after a long absence.
    const steps=Math.min(8,Math.floor(elapsed / 15000));
    for (let i=0;i<steps;i++) for (const item of state.prices) {
      const drift=(Math.random()-.5)*.055;
      const pressure=Math.max(-.006,Math.min(.006,(item.demand - item.supply * .1)/20000));
      changePrice(state,item,item.price * (1+drift+pressure));
    }
    state.lastTick=current;
  }
  if (current - state.lastEvent >= 4 * 60 * 1000) {
    const item=state.prices[Math.floor(Math.random()*state.prices.length)];
    const rise=Math.random()>=.5;
    const description=(rise?'Demand spike: ':'Market drop: ')+item.item_name+(rise?' prices surged.':' prices tumbled.');
    changePrice(state,item,item.price*(rise?1.15:.86));
    state.events.unshift({id:state.nextId++,description,created_at:nowText()});
    state.events=state.events.slice(0,16);
    state.lastEvent=current;
  }
  settleAuctions(state);
}

export async function offlineTick() {
  const state=read();
  tickState(state);
  save(state);
  return {prices:state.prices};
}
export async function offlineApi(path, options={}, token='') {
  const method=(options.method||'GET').toUpperCase();
  const state=read();
  // Keep prices and auction settlements current on each visit.
  tickState(state);
  const body=method==='POST'?parseBody(options):{};
  let result;

  if (path==='/auth/register' && method==='POST') {
    const name=typeof body.username==='string'?body.username.trim():'';
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) fail('Username: 3–20 letters, digits or underscores.');
    if (typeof body.password!=='string'||body.password.length<8||body.password.length>128) fail('Password must contain 8–128 characters.');
    if (state.users.some(u=>u.username.toLowerCase()===name.toLowerCase())) fail('Username already exists on this device.');
    const id=state.nextId++, salt=randomId();
    const user={id,username:name,balance:100000,salt,password_hash:await hash(body.password,salt),created_at:nowText()};
    state.users.push(user);
    state.inventory[id]={};
    state.shops[id]={level:1};
    const session='browser-demo-'+randomId();
    state.sessions[session]={id,expires:Date.now()+7*24*HOUR};
    result={token:session,player:playerPublic(user)};
  } else if (path==='/auth/login' && method==='POST') {
    const name=typeof body.username==='string'?body.username.trim():'';
    const user=state.users.find(u=>u.username.toLowerCase()===name.toLowerCase());
    if (!user || typeof body.password !== 'string' || await hash(body.password,user.salt)!==user.password_hash) fail('Incorrect local username or password.');
    const session='browser-demo-'+randomId();
    state.sessions[session]={id:user.id,expires:Date.now()+7*24*HOUR};
    result={token:session,player:playerPublic(user)};
  } else if (path==='/market/prices') {
    result=state.prices;
  } else if (path.startsWith('/market/history/')) {
    const id=path.slice('/market/history/'.length);
    if (!localItem(state,id)) fail('Unknown item.');
    result=state.history[id]||[];
  } else if (path==='/leaderboard') {
    result=state.users.map(u=>({
      username:u.username,balance:u.balance,
      net_worth:u.balance+Object.entries(state.inventory[u.id]||{}).reduce((sum,[itemId,owned])=>sum+(localItem(state,itemId)?.price||0)*owned.quantity,0),
      trades:state.transactions.filter(t=>t.player_id===u.id).length
    })).sort((a,b)=>b.net_worth-a.net_worth).slice(0,50);
  } else if (path==='/events') {
    result=state.events.slice(0,12);
  } else if (path==='/auctions' && method==='GET') {
    result=state.auctions.filter(a=>a.status==='active').sort((a,b)=>a.ends_at-b.ends_at)
      .map(a=>({ ...a, item_name:localItem(state,a.item_id)?.item_name, symbol:localItem(state,a.item_id)?.symbol,
        category:localItem(state,a.item_id)?.category, seller:state.users.find(u=>u.id===a.seller_id)?.username,
        bidder:state.users.find(u=>u.id===a.bidder_id)?.username||null })).slice(0,50);
  } else if (path==='/chat' && method==='GET') {
    result=state.chat.slice(-40);
  } else if (path==='/auth/me') {
    result=playerPublic(authenticated(state,token));
  } else if (path==='/player/overview') {
    const user=authenticated(state,token);
    const inventory=Object.entries(state.inventory[user.id]||{})
      .filter(([,owned])=>owned.quantity>0)
      .map(([itemId,owned])=>({item_id:itemId,quantity:owned.quantity,avg_cost:owned.avg_cost,
        item_name:localItem(state,itemId)?.item_name,price:localItem(state,itemId)?.price,
        symbol:localItem(state,itemId)?.symbol,category:localItem(state,itemId)?.category}));
    const level=state.shops[user.id]?.level||1;
    const transactions=state.transactions.filter(t=>t.player_id===user.id).slice(-30).reverse()
      .map(t=>({...t,item_name:localItem(state,t.item_id)?.item_name,symbol:localItem(state,t.item_id)?.symbol}));
    result={player:playerPublic(user),inventory,shop:{level,capacity:level*20},transactions};
  } else if (path==='/market/trade' && method==='POST') {
    const user=authenticated(state,token);
    const item=localItem(state,body.itemId);
    if (!item || !['buy','sell'].includes(body.side) || !whole(body.quantity)) fail('Invalid trade.');
    const qty=body.quantity,total=item.price*qty;
    if (body.side==='buy') {
      if (user.balance<total) fail('Insufficient funds.');
      if (quantityHeld(state,user.id)+qty>(state.shops[user.id]?.level||1)*20) fail('Warehouse full: upgrade storage.');
      user.balance-=total;
      putItem(state,user.id,item.item_id,qty,item.price);
    } else {
      takeItem(state,user.id,item.item_id,qty);
      user.balance+=total;
    }
    state.transactions.push({id:state.nextId++,player_id:user.id,item_id:item.item_id,quantity:qty,
      side:body.side,price:item.price,total,created_at:nowText()});
    const impact=(body.side==='buy'?1:-1)*Math.min(.025,qty*.0015);
    changePrice(state,item,item.price*(1+impact));
    result={ok:true,balance:user.balance,price:item.previous,total};
  } else if (path==='/player/upgrade' && method==='POST') {
    const user=authenticated(state,token);
    const shop=state.shops[user.id]||(state.shops[user.id]={level:1});
    if (shop.level>=10) fail('Maximum warehouse level reached.');
    const cost=shop.level*150000;
    if (user.balance<cost) fail('Not enough funds.');
    user.balance-=cost;shop.level+=1;
    result={level:shop.level,balance:user.balance};
  } else if (path==='/auctions' && method==='POST') {
    const user=authenticated(state,token);
    if (!localItem(state,body.itemId) || !whole(body.quantity) ||
      !Number.isFinite(body.startingBid) || body.startingBid<1 || body.startingBid>1_000_000) fail('Invalid auction.');
    takeItem(state,user.id,body.itemId,body.quantity);
    const id=state.nextId++;
    state.auctions.push({id,seller_id:user.id,item_id:body.itemId,quantity:body.quantity,
      start_bid:Math.round(body.startingBid*100),bid:0,bidder_id:null,ends_at:Date.now()+300000,status:'active'});
    result={id};
  } else if (/^\/auctions\/\d+\/bid$/.test(path) && method==='POST') {
    const user=authenticated(state,token);
    const id=Number(path.split('/')[2]);
    const auction=state.auctions.find(a=>a.id===id&&a.status==='active');
    if (!auction || auction.ends_at<=Date.now()) fail('Auction expired.');
    if (auction.seller_id===user.id) fail('You cannot bid on your own auction. Create another local demo account to bid.');
    if (auction.bidder_id===user.id) fail('You are already the highest bidder.');
    if (!Number.isFinite(body.amount) || body.amount<1 || body.amount>1_000_000) fail('Invalid bid.');
    const bid=Math.round(body.amount*100), min=Math.max(auction.start_bid,auction.bid+100);
    if (bid<min) fail('Minimum bid: $'+(min/100).toFixed(2));
    if (user.balance<bid) fail('Insufficient funds.');
    user.balance-=bid;
    if (auction.bidder_id) {
      const previous=state.users.find(u=>u.id===auction.bidder_id);
      if (previous) previous.balance+=auction.bid;
    }
    auction.bid=bid;auction.bidder_id=user.id;
    result={ok:true};
  } else if (path==='/chat' && method==='POST') {
    const user=authenticated(state,token);
    const message=typeof body.message==='string'?body.message.replace(/[<>]/g,'').trim().slice(0,180):'';
    if (!message) fail('Type a message first.');
    const entry={id:state.nextId++,username:user.username,message,created_at:nowText()};
    state.chat.push(entry);
    state.chat=state.chat.slice(-100);
    result=entry;
  } else {
    fail('This feature is not available in browser-only mode.');
  }
  save(state);
  return result;
}

export const BROWSER_SAVE_KEY = KEY;
