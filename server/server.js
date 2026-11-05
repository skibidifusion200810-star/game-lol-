import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import db, { ITEMS } from './db.js';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw Error('Set a strong JWT_SECRET (32+ characters).');
const SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) console.warn('JWT_SECRET missing: sessions will expire after restart.');
const app = express(), server = createServer(app), wss = new WebSocketServer({ server, path:'/ws' });
app.disable('x-powered-by');
app.use(cors({ origin:process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map(s=>s.trim()) : true }));
app.use(express.json({ limit:'16kb' }));
const allPrices = () => db.prepare('SELECT * FROM market_prices ORDER BY item_name').all();
const item = id => db.prepare('SELECT * FROM market_prices WHERE item_id=?').get(id);
const player = id => db.prepare('SELECT id,username,balance,created_at FROM players WHERE id=?').get(id);
const money = value => Math.round(value*100);
const safeQty = value => Number.isSafeInteger(value) && value>0 && value<=1000;
const send = (type, payload={}) => { const message=JSON.stringify({type,...payload}); for(const ws of wss.clients) if(ws.readyState===1) ws.send(message); };
const getToken = token => { try { return player(Number(jwt.verify(token || '',SECRET).sub)) || null; } catch { return null; } };
const authorize = (req,res,next) => { const p=getToken((req.headers.authorization||'').replace(/^Bearer /i,'')); if(!p) return res.status(401).json({error:'Please sign in again.'}); req.player=p; next(); };
const bad = (res,msg,code=400)=>res.status(code).json({error:msg});
const ownItems = id => db.prepare('SELECT i.*,m.item_name,m.price,m.symbol,m.category FROM inventory i JOIN market_prices m ON m.item_id=i.item_id WHERE player_id=? AND quantity>0 ORDER BY item_name').all(id);
const shop = id => db.prepare('SELECT level,level*20 AS capacity FROM shops WHERE player_id=?').get(id);
const addItem = (id,product,quantity,cost) => {
 const old=db.prepare('SELECT quantity,avg_cost FROM inventory WHERE player_id=? AND item_id=?').get(id,product);
 const count=(old?.quantity||0)+quantity;
 const avg=Math.round(((old?.quantity||0)*(old?.avg_cost||0)+quantity*cost)/count);
 db.prepare('INSERT INTO inventory(player_id,item_id,quantity,avg_cost) VALUES(?,?,?,?) ON CONFLICT(player_id,item_id) DO UPDATE SET quantity=excluded.quantity,avg_cost=excluded.avg_cost').run(id,product,count,avg);
};
const removeItem=(id,product,quantity) => { if(!db.prepare('UPDATE inventory SET quantity=quantity-? WHERE player_id=? AND item_id=? AND quantity>=?').run(quantity,id,product,quantity).changes) throw Error('Not enough items.'); };
const pushPrice=(product,price) => { db.prepare('UPDATE market_prices SET previous=price, price=?, updated_at=CURRENT_TIMESTAMP WHERE item_id=?').run(price,product); db.prepare('INSERT INTO price_history(item_id,price) VALUES(?,?)').run(product,price); };

app.get('/api/health',(_req,res)=>res.json({ok:true,name:'SHADOW MARKET'}));
app.post('/api/auth/register',(req,res)=>{
 const username=typeof req.body.username==='string'?req.body.username.trim():'';
 const password=req.body.password;
 if(!/^[a-z0-9_]{3,20}$/i.test(username)) return bad(res,'Username: 3–20 letters, digits or underscores.');
 if(typeof password!=='string'||password.length<8||password.length>128) return bad(res,'Password must contain 8–128 characters.');
 if(db.prepare('SELECT id FROM players WHERE username=?').get(username)) return bad(res,'Username already taken.',409);
 try {
  const hash=bcrypt.hashSync(password,11);
  const id=db.transaction(()=>{ const id=Number(db.prepare('INSERT INTO players(username,password_hash) VALUES(?,?)').run(username,hash).lastInsertRowid); db.prepare('INSERT INTO shops(player_id) VALUES(?)').run(id); return id; })();
  res.status(201).json({token:jwt.sign({sub:String(id)},SECRET,{expiresIn:'7d'}),player:player(id)});
 } catch(e) { if(e.code?.startsWith('SQLITE_CONSTRAINT')) return bad(res,'Username already taken.',409); throw e; }
});
app.post('/api/auth/login',(req,res)=>{
 const username=typeof req.body.username==='string'?req.body.username.trim():'';
 const row=db.prepare('SELECT * FROM players WHERE username=?').get(username);
 if(!row||typeof req.body.password!=='string'||!bcrypt.compareSync(req.body.password,row.password_hash)) return bad(res,'Incorrect username or password.',401);
 res.json({token:jwt.sign({sub:String(row.id)},SECRET,{expiresIn:'7d'}),player:player(row.id)});
});
app.get('/api/auth/me',authorize,(req,res)=>res.json(player(req.player.id)));
app.get('/api/market/prices',(_req,res)=>res.json(allPrices()));
app.get('/api/market/history/:id',(req,res)=> {
 if(!item(req.params.id)) return bad(res,'Unknown item.',404);
 res.json(db.prepare('SELECT price,created_at FROM (SELECT * FROM price_history WHERE item_id=? ORDER BY id DESC LIMIT 80) ORDER BY id').all(req.params.id));
});
app.get('/api/player/overview',authorize,(req,res)=> {
 const id=req.player.id;
 res.json({player:player(id),inventory:ownItems(id),shop:shop(id),transactions:db.prepare('SELECT t.*,m.item_name,m.symbol FROM transactions t JOIN market_prices m ON m.item_id=t.item_id WHERE t.player_id=? ORDER BY t.id DESC LIMIT 30').all(id)});
});
const executeTrade=db.transaction((id,product,side,quantity)=>{
 const record=item(product);
 if(!record) throw Error('Item not found.');
 const total=record.price*quantity;
 if(side==='buy') {
  if(player(id).balance<total) throw Error('Insufficient funds.');
  const occupied=db.prepare('SELECT COALESCE(SUM(quantity),0) AS qty FROM inventory WHERE player_id=?').get(id).qty;
  if(occupied+quantity>shop(id).capacity) throw Error('Warehouse full: upgrade storage.');
  db.prepare('UPDATE players SET balance=balance-? WHERE id=?').run(total,id);
  addItem(id,product,quantity,record.price);
 } else {
  removeItem(id,product,quantity);
  db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(total,id);
 }
 db.prepare('INSERT INTO transactions(player_id,item_id,quantity,side,price,total) VALUES(?,?,?,?,?,?)').run(id,product,quantity,side,record.price,total);
 const impact=(side==='buy'?1:-1)*Math.min(0.025,quantity*0.0015);
 const next=Math.max(Math.round(record.base_price*0.4),Math.min(Math.round(record.base_price*3),Math.round(record.price*(1+impact))));
 pushPrice(product,next);
 return {balance:player(id).balance,price:record.price,total};
});
app.post('/api/market/trade',authorize,(req,res)=>{
 const {itemId,side,quantity}=req.body;
 if(typeof itemId!=='string'||!['buy','sell'].includes(side)||!safeQty(quantity)) return bad(res,'Invalid trade.');
 try { const result=executeTrade(req.player.id,itemId,side,quantity); send('market_update',{prices:allPrices()}); res.json({ok:true,...result}); }
 catch(e){ bad(res,e.message); }
});
app.post('/api/player/upgrade',authorize,(req,res)=>{
 try { const result=db.transaction(()=>{
  const level=shop(req.player.id).level,cost=level*150000;
  if(level>=10) throw Error('Maximum warehouse level reached.');
  if(player(req.player.id).balance<cost) throw Error('Not enough funds.');
  db.prepare('UPDATE players SET balance=balance-? WHERE id=?').run(cost,req.player.id);
  db.prepare('UPDATE shops SET level=level+1 WHERE player_id=?').run(req.player.id);
  return {level:level+1,balance:player(req.player.id).balance};
 })(); res.json(result); } catch(e){bad(res,e.message);}
});
app.get('/api/leaderboard',(_req,res)=>res.json(db.prepare('SELECT p.username,p.balance,p.balance+COALESCE(SUM(i.quantity*m.price),0) AS net_worth,(SELECT COUNT(*) FROM transactions t WHERE t.player_id=p.id) AS trades FROM players p LEFT JOIN inventory i ON i.player_id=p.id LEFT JOIN market_prices m ON m.item_id=i.item_id GROUP BY p.id ORDER BY net_worth DESC LIMIT 50').all()));
app.get('/api/events',(_req,res)=>res.json(db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 12').all()));
const getAuctions=()=>db.prepare('SELECT a.*,m.item_name,m.symbol,s.username AS seller,b.username AS bidder FROM auctions a JOIN market_prices m ON m.item_id=a.item_id JOIN players s ON s.id=a.seller_id LEFT JOIN players b ON b.id=a.bidder_id WHERE a.status=? ORDER BY a.ends_at ASC LIMIT 50').all('active');
app.get('/api/auctions',(_req,res)=>res.json(getAuctions()));
app.post('/api/auctions',authorize,(req,res)=>{
 const {itemId,quantity,startingBid}=req.body;
 if(typeof itemId!=='string'||!safeQty(quantity)||!Number.isFinite(startingBid)||startingBid<1||startingBid>1000000) return bad(res,'Invalid auction.');
 try { const id=db.transaction(()=>{
  if(!item(itemId)) throw Error('Unknown item.');
  removeItem(req.player.id,itemId,quantity);
  return Number(db.prepare('INSERT INTO auctions(seller_id,item_id,quantity,start_bid,ends_at) VALUES(?,?,?,?,?)').run(req.player.id,itemId,quantity,money(startingBid),Date.now()+300000).lastInsertRowid);
 })(); send('auction_update'); res.status(201).json({id}); } catch(e){bad(res,e.message);}
});
app.post('/api/auctions/:id/bid',authorize,(req,res)=>{
 const amount=req.body.amount;
 if(!Number.isFinite(amount)||amount<1||amount>1000000) return bad(res,'Invalid bid.');
 try { db.transaction(()=>{
  const auction=db.prepare('SELECT * FROM auctions WHERE id=? AND status=?').get(req.params.id,'active');
  if(!auction||auction.ends_at<=Date.now()) throw Error('Auction expired.');
  if(auction.seller_id===req.player.id) throw Error('Cannot bid on your own auction.');
  if(auction.bidder_id===req.player.id) throw Error('Already the highest bidder.');
  const bid=money(amount),minimum=Math.max(auction.start_bid,auction.bid+100);
  if(bid<minimum) throw Error('Minimum bid: $'+(minimum/100).toFixed(2));
  if(player(req.player.id).balance<bid) throw Error('Insufficient funds.');
  db.prepare('UPDATE players SET balance=balance-? WHERE id=?').run(bid,req.player.id);
  if(auction.bidder_id) db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(auction.bid,auction.bidder_id);
  db.prepare('UPDATE auctions SET bid=?,bidder_id=? WHERE id=?').run(bid,req.player.id,auction.id);
 })(); send('auction_update'); res.json({ok:true}); } catch(e){bad(res,e.message);}
});
const settle=()=>{
 const expired=db.prepare('SELECT * FROM auctions WHERE status=? AND ends_at<=?').all('active',Date.now());
 if(!expired.length) return;
 db.transaction(()=>{ for(const a of expired){
  if(a.bidder_id){ db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(a.bid,a.seller_id); addItem(a.bidder_id,a.item_id,a.quantity,Math.round(a.bid/a.quantity)); }
  else addItem(a.seller_id,a.item_id,a.quantity,item(a.item_id).price);
  db.prepare('UPDATE auctions SET status=? WHERE id=?').run('closed',a.id);
 } })();
 send('auction_update');
};
app.get('/api/chat',(_req,res)=>res.json(db.prepare('SELECT c.message,c.created_at,p.username FROM chat c JOIN players p ON p.id=c.player_id ORDER BY c.id DESC LIMIT 40').all().reverse()));
wss.on('connection',ws=>{
 ws.player=null;ws.lastChat=0;
 ws.send(JSON.stringify({type:'market_update',prices:allPrices()}));
 ws.on('message',raw=>{
  if(raw.length>1024) return;
  let data;try{data=JSON.parse(raw.toString());}catch{return;}
  if(data.type==='auth'){ ws.player=getToken(data.token);return;}
  if(data.type==='chat'&&ws.player&&Date.now()-ws.lastChat>=2000){
   const message=typeof data.message==='string'?data.message.replace(/[<>]/g,'').trim().slice(0,180):'';
   if(!message) return;
   ws.lastChat=Date.now();
   db.prepare('INSERT INTO chat(player_id,message) VALUES(?,?)').run(ws.player.id,message);
   send('chat',{username:ws.player.username,message,created_at:new Date().toISOString()});
  }
 });
});
function marketTick(){
 db.transaction(()=>{
  for(const record of allPrices()){
   const shift=(Math.random()-0.5)*0.055;
   const pressure=Math.max(-0.006,Math.min(0.006,(record.demand-record.supply*0.1)/20000));
   const next=Math.round(record.price*(1+shift+pressure));
   pushPrice(record.item_id,Math.max(Math.round(record.base_price*0.4),Math.min(Math.round(record.base_price*3),next)));
  }
  db.prepare('DELETE FROM price_history WHERE id NOT IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER(PARTITION BY item_id ORDER BY id DESC) AS r FROM price_history) WHERE r<=100)').run();
 })();
 send('market_update',{prices:allPrices()});
}
function eventTick(){
 const record=item(ITEMS[Math.floor(Math.random()*ITEMS.length)][0]),rise=Math.random()>=0.5;
 const msg=(rise?'Demand spike: ':'Market drop: ')+record.item_name+(rise?' is surging!':' is falling!');
 db.transaction(()=>{
  pushPrice(record.item_id,Math.max(Math.round(record.base_price*0.4),Math.min(Math.round(record.base_price*3),Math.round(record.price*(rise?1.15:0.86)))));
  db.prepare('INSERT INTO events(description) VALUES(?)').run(msg);
 })();
 send('event',{description:msg});send('market_update',{prices:allPrices()});
}
const base=dirname(fileURLToPath(import.meta.url)),dist=join(base,'../client/dist');
if(existsSync(join(dist,'index.html'))){
 app.use(express.static(dist));
 app.get('*',(req,res)=>req.path.startsWith('/api/')?bad(res,'Not found.',404):res.sendFile(join(dist,'index.html')));
}
app.use((err,_req,res,_next)=>{console.error(err);bad(res,'Internal server error.',500);});
if(process.env.NODE_ENV!=='test'){
 const port=Number(process.env.PORT||5000);
 server.listen(port,()=>console.log('SHADOW MARKET: http://localhost:'+port));
 setInterval(()=>{try{marketTick();}catch(e){console.error(e);}},15000);
 setInterval(()=>{try{settle();}catch(e){console.error(e);}},2000);
 setInterval(()=>{try{eventTick();}catch(e){console.error(e);}},240000);
}
export {app,server,safeQty,executeTrade};
