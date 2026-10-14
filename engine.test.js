import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,order,equity,exposure,applyRules,step,closePosition,mark} from './engine.js';
test('stock accounting includes fills, unrealized returns, and fees',()=>{
 const s=createState(),p=order(s,{symbol:'AAPL',qty:10});assert.equal(s.cash,98099);assert.equal(equity(s),99999);
 s.prices.AAPL=200;assert.equal(equity(s),100099);closePosition(s,p);assert.equal(s.cash,100098);assert.equal(s.positions.length,0);
});
test('short proceeds and cover preserve equity accounting',()=>{
 const s=createState(),p=order(s,{symbol:'AAPL',qty:10,side:'short'});assert.equal(equity(s),99999);
 s.prices.AAPL=180;closePosition(s,p);assert.equal(equity(s),100098);
});
test('invalid, oversized, naked sell, and option-writing orders reject without mutation',()=>{
 const s=createState(),before=structuredClone(s);
 for(const request of [{symbol:'AAPL',qty:1.5},{symbol:'AAPL',qty:1000},{symbol:'AAPL',qty:1,side:'sell'},{symbol:'AAPL',type:'call',qty:1,side:'short'}])assert.throws(()=>order(s,request));
 assert.deepEqual(s,before);
});
test('ladder thresholds fire once and sales use remaining shares',()=>{
 const s=createState();s.strategies.ladder=true;const p=order(s,{symbol:'AAPL',qty:100});
 s.prices.AAPL=p.anchor*1.26;applyRules(s);assert.equal(p.qty,90);applyRules(s);assert.equal(p.qty,90);
 s.prices.AAPL=p.anchor*1.36;applyRules(s);assert.equal(p.qty,72);
 s.prices.AAPL=p.anchor*2.01;applyRules(s);assert.equal(s.positions.length,0);
});
test('drawdown ladder uses original entry and does not repeat averaging down',()=>{
 const s=createState();s.strategies.ladder=true;const p=order(s,{symbol:'AAPL',qty:100});
 s.prices.AAPL=160;applyRules(s);assert.equal(p.qty,110);applyRules(s);assert.equal(p.qty,110);
 s.prices.AAPL=140;applyRules(s);assert.equal(p.qty,137);assert.equal(p.anchor,190);
});
test('ladder leaves hedge legs and option positions to their own management',()=>{
 const s=createState();s.strategies.ladder=true;const p=order(s,{symbol:'AAPL',qty:10,group:'pair'});
 order(s,{symbol:'MSFT',type:'call',qty:1});s.prices.AAPL=400;applyRules(s);assert.equal(p.qty,10);assert.equal(s.positions.length,2);
});
test('options settle intrinsic value at expiry without an equity discontinuity',()=>{
 const s=createState(),p=order(s,{symbol:'AAPL',type:'call',qty:1});p.expiry=1;s.prices.AAPL=220;
 step(s);assert.equal(s.positions.length,0);assert.ok(s.events.some(e=>e.message.includes('cash settlement')));
 assert.equal(s.cash,100000-(p.entry*100)-1+Math.max(0,s.prices.AAPL-p.strike)*100);
});
test('put value increases as its underlying falls',()=>{
 const s=createState(),p=order(s,{symbol:'AAPL',type:'put',qty:1});const initial=mark(s,p);s.prices.AAPL=160;assert.ok(mark(s,p)>initial);
});
test('seeded simulation is repeatable and pairs enter and exit',()=>{
 const a=createState(),b=createState();a.strategies.pairs=true;b.strategies.pairs=true;
 for(let i=0;i<500;i++){step(a);step(b);assert.ok(Number.isFinite(equity(a)));assert.ok(a.cash>=0);}
 assert.deepEqual(a,b);assert.ok(a.trades.some(t=>t.side==='short'));assert.ok(a.trades.some(t=>t.side==='cover'));
 assert.ok(exposure(a)<=equity(a));
});
test('failed pair entry is atomic under low exposure limit',()=>{
 const s=createState();s.settings.maxExposure=1;s.strategies.pairs=true;for(let i=0;i<100;i++)step(s);
 assert.equal(s.trades.length,0);assert.equal(s.positions.length,0);assert.equal(s.cash,100000);assert.ok(s.events.some(e=>e.message.includes('skipped')));
});
