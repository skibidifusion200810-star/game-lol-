import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'unit-tests-very-long-secret-not-for-production';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'shadow-market-')), 'test.db');
const { server, safeQty } = await import('./server.js');

test('trade quantities must be safe bounded integers', () => {
 assert.equal(safeQty(1), true);
 assert.equal(safeQty(1000), true);
 for (const n of [0,-1,1.5,1001,'2',null,Infinity,NaN]) assert.equal(safeQty(n), false);
});

test('registration, buying, selling, auctions and leaderboard', async () => {
 await new Promise(resolve => server.listen(0, resolve));
 const base = 'http://127.0.0.1:' + server.address().port;
 const request = async (url, body, token) => {
  const response = await fetch(base + '/api' + url, { method: body ? 'POST':'GET', headers: { 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer '+token } : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
  return { status:response.status, data:await response.json() };
 };
 try {
  const a = await request('/auth/register',{username:'TraderOne',password:'password123'});
  assert.equal(a.status,201);
  assert.equal(a.data.player.balance,100000);
  const token=a.data.token;
  const login=await request('/auth/login',{username:'TraderOne',password:'password123'});
  assert.equal(login.status,200);
  const invalid=await request('/market/trade',{itemId:'graphics-card',side:'buy',quantity:-5},token);
  assert.equal(invalid.status,400);
  const buy=await request('/market/trade',{itemId:'graphics-card',side:'buy',quantity:1},token);
  assert.equal(buy.status,200);
  assert.equal(buy.data.balance,70000);
  const inventory=await request('/player/overview',null,token);
  assert.equal(inventory.data.inventory[0].quantity,1);
  const auction=await request('/auctions',{itemId:'graphics-card',quantity:1,startingBid:200},token);
  assert.equal(auction.status,201);
  const b=await request('/auth/register',{username:'TraderTwo',password:'password321'});
  assert.equal(b.status,201);
  const bid=await request('/auctions/'+auction.data.id+'/bid',{amount:200},b.data.token);
  assert.equal(bid.status,200);
  const ranking=await request('/leaderboard');
  assert.equal(ranking.status,200);
  assert.equal(ranking.data.length,2);
  const health=await request('/health');
  assert.equal(health.data.ok,true);
 } finally { await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())); }
});
