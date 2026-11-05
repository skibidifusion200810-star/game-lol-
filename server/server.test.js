import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { safeQty } = await import('./server.js');
test('trade quantity is a bounded positive integer',()=>{
 assert.equal(safeQty(1),true);
 assert.equal(safeQty(1000),true);
 for(const n of [-1,0,1.5,1001,'2',null,Infinity,NaN]) assert.equal(safeQty(n),false);
});
