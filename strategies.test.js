import test from 'node:test';
import assert from 'node:assert/strict';
import {atr,rsi,vwap,signalFor,riskQuantity,DEFAULT_COMBO_CONFIG,runCombinations,hydrateStrategies,ingestBars,marketSession} from './strategies.js';
import {createState,equity,exposure,order,closePosition,applyRules,step,stepMarket,SYMBOLS} from './engine.js';
import {AlpacaBroker} from './brokers/alpaca.js';
const bars=closes=>closes.map((close,i)=>({timestamp:new Date(Date.parse('2026-10-13T13:30:00Z')+i*60000).toISOString(),session:'test',minute:i,open:close,high:close+.2,low:close-.2,close,volume:100}));
const handlers={equity,exposure,order,closePosition,event(s,message){s.events.unshift({tick:s.tick,message});}};
function run(s,minute=30,session='test'){runCombinations(s,{session,minute,real:false},handlers);}
function prepare(name,closes){const s=createState();s.strategies[name]=true;const symbol=s.comboConfig[name].symbol;s.bars[symbol]=bars(closes);s.prices[symbol]=closes.at(-1);return s;}
test('ATR accounts for gaps, RSI handles flat/up/down markets, VWAP weights by volume',()=>{
 const b=bars([100,110]);assert.ok(Math.abs(atr(b,1)-10.2)<1e-9);
 assert.equal(rsi(bars(Array(15).fill(100))),50);assert.equal(rsi(bars(Array.from({length:15},(_,i)=>100+i))),100);assert.equal(rsi(bars(Array.from({length:15},(_,i)=>100-i))),0);
 const weighted=bars([100,110]);weighted[1].volume=300;assert.equal(vwap(weighted).value,107.5);assert.equal(vwap(weighted.map(b=>({...b,volume:0}))),null);
});
test('breakout excludes current candle and uses prior high instead of prior close',()=>{
 const cfg=DEFAULT_COMBO_CONFIG.trend,b=bars([...Array(20).fill(100),101]);assert.equal(signalFor('trend',b,cfg),true);
 b.at(-1).close=100.1;assert.equal(signalFor('trend',b,cfg),false);
});
test('risk sizing is bounded by risk, per-position size, cash, and shared gross exposure',()=>{
 const base={equity:100000,cash:100000,gross:0,price:100,distance:4,riskPercent:.5,maxPositionPercent:15,maxExposure:50};assert.equal(riskQuantity(base),125);
 assert.equal(riskQuantity({...base,cash:501}),5);assert.equal(riskQuantity({...base,gross:49900}),1);assert.equal(riskQuantity({...base,gross:50000}),0);assert.equal(riskQuantity({...base,distance:0}),0);
});
test('trend opens on breakout, stores frozen management, and stop survives disabled entry switch',()=>{
 const s=prepare('trend',[...Array(20).fill(100),101]);run(s);assert.equal(s.positions.length,1);const p=s.positions[0];assert.equal(p.manager,'trend');assert.ok(p.stop<101);assert.ok(p.qty*101<=15000);
 s.strategies.trend=false;s.comboConfig.trend.atrMultiple=9;s.prices.SPY=p.stop-.1;run(s);assert.equal(s.positions.length,0);assert.ok(s.events.some(e=>e.message.includes('ATR止损')));
});
test('trend channel exit uses prior lows and cannot immediately re-enter same step',()=>{
 const s=prepare('trend',[...Array(20).fill(100),101]);run(s);const p=s.positions[0];p.stop=80;s.bars.SPY.push({...bars([99])[0],timestamp:'2026-10-13T13:51:00Z'});s.prices.SPY=99;run(s);assert.equal(s.positions.length,0);assert.match(s.trades[0].source,/退出通道/);
});
test('VWAP buys recovery, scales only after favorable confirmation, and limits additions',()=>{
 const closes=[...Array(20).fill(100),90,91],s=prepare('vwap',closes);assert.equal(signalFor('vwap',s.bars.QQQ,s.comboConfig.vwap),true);run(s);assert.equal(s.positions.length,1);const p=s.positions[0],initial=p.qty;assert.ok(initial<=p.targetQty/2+.5);
 run(s);assert.equal(p.qty,initial);s.bars.QQQ.push({...bars([91.1])[0],timestamp:'2026-10-13T13:52:00Z'});s.prices.QQQ=91.1;run(s);assert.equal(p.adds,1);assert.ok(p.qty>initial);assert.ok(p.qty<=p.targetQty);const addedQty=p.qty;
 s.bars.QQQ.push({...bars([91.2])[0],timestamp:'2026-10-13T13:53:00Z'});s.prices.QQQ=91.2;run(s);assert.equal(p.qty,addedQty);
 s.prices.QQQ=100;run(s);assert.equal(s.positions.length,0);assert.match(s.trades[0].source,/回到VWAP/);
});
test('VWAP does not average down and flattens before regular or early close',()=>{
 const s=prepare('vwap',[...Array(20).fill(100),90,91]);run(s);const p=s.positions[0],qty=p.qty;s.bars.QQQ.push({...bars([90.9])[0],timestamp:'2026-10-13T13:52:00Z'});s.prices.QQQ=90.9;run(s);assert.equal(p.qty,qty);run(s,385);assert.equal(s.positions.length,0);
 const early=prepare('vwap',[...Array(20).fill(100),90,91]);run(early);runCombinations(early,{session:'test',minute:205,flattenMinute:205,real:false},handlers);assert.equal(early.positions.length,0);
});
test('RSI waits for upward threshold crossing and exits on target or time stop',()=>{
 const closes=[...Array.from({length:21},(_,i)=>100-i),88],s=prepare('rsi',closes);assert.equal(signalFor('rsi',s.bars.AAPL,s.comboConfig.rsi),true);run(s);assert.equal(s.positions.length,1);const p=s.positions[0];s.strategies.rsi=false;s.tick=p.entryTick+30;run(s);assert.equal(s.positions.length,0);assert.match(s.trades[0].source,/时间止损/);
 const target=prepare('rsi',closes);run(target);target.positions[0].stop=1;target.bars.AAPL.push(...bars([110,120,130]).map((b,i)=>({...b,timestamp:new Date(Date.parse('2026-10-13T13:52:00Z')+i*60000).toISOString()})));target.prices.AAPL=130;run(target);assert.equal(target.positions.length,0);assert.match(target.trades[0].source,/RSI止盈/);
 const falling=prepare('rsi',Array.from({length:25},(_,i)=>100-i));run(falling);assert.equal(falling.positions.length,0);
});
test('ladder never resizes combination-owned stocks and simultaneous signals do not duplicate symbol',()=>{
 const s=prepare('trend',[...Array(20).fill(100),101]);s.strategies.ladder=true;run(s);const p=s.positions[0],qty=p.qty;s.prices.SPY=202;applyRules(s);assert.equal(p.qty,qty);
 const overlapping=prepare('trend',[...Array(20).fill(100),101]);overlapping.strategies.vwap=true;overlapping.strategies.rsi=true;overlapping.comboConfig.vwap.symbol='SPY';overlapping.comboConfig.rsi.symbol='SPY';run(overlapping);assert.equal(overlapping.positions.length,1);assert.match(overlapping.comboStatus.rsi,/已有持仓/);
});
test('daily loss latch blocks new entry until next session while preserving exits',()=>{
 const s=prepare('trend',[...Array(20).fill(100),101]);s.riskSession={id:'test',startEquity:100000};s.cash=97000;run(s);assert.equal(s.positions.length,0);assert.equal(s.riskSession.halted,true);
 s.cash=100000;run(s);assert.equal(s.positions.length,0);for(const b of s.bars.SPY)b.session='next';run(s,30,'next');assert.equal(s.positions.length,1);assert.equal(s.riskSession.halted,undefined);
});
test('missing volume, incomplete candles, and failed bars never generate fabricated inputs',()=>{
 const s=createState(),now=Date.parse('2026-10-13T14:00:00Z');hydrateStrategies(s);
 const source=bars([100,101]);source[0].timestamp='2026-10-13T14:00:00Z';source[1].timestamp='2026-10-13T13:59:00Z';ingestBars(s,{bars:{SPY:source}},now);assert.equal(s.bars.SPY.length,1);assert.equal(s.bars.SPY[0].close,101);
 s.strategies.trend=true;s.barError='network failure';runCombinations(s,{session:'2026-10-13',minute:30,real:true,now},handlers);assert.equal(s.positions.length,0);assert.match(s.comboStatus.trend,/请求失败/);
});
test('market sessions respect US daylight saving time',()=>{
 assert.deepEqual(marketSession('2026-10-13T13:30:00Z'),{id:'2026-10-13',minute:0});assert.deepEqual(marketSession('2026-12-01T14:30:00Z'),{id:'2026-12-01',minute:0});
});
test('saved v1 accounts hydrate new strategy fields without losing original positions or rules',()=>{
 const s=createState();order(s,{symbol:'AAPL',qty:10});delete s.comboConfig;delete s.bars;delete s.comboStatus;delete s.comboLastBar;s.strategies={pairs:true,ladder:true};hydrateStrategies(s);assert.equal(s.positions[0].qty,10);assert.equal(s.strategies.pairs,true);assert.equal(s.strategies.trend,false);assert.equal(s.comboConfig.rsi.symbol,'AAPL');
});
test('all combinations execute entries and exits during a repeatable multi-session run',()=>{
 const s=createState();s.strategies.trend=true;s.strategies.vwap=true;s.strategies.rsi=true;for(let i=0;i<1200;i++)step(s);
 for(const name of ['趋势突破','VWAP回归','RSI回归']){assert.ok(s.trades.some(t=>t.side==='buy'&&t.source.includes(name)),name+' entered');assert.ok(s.trades.some(t=>t.side==='sell'&&t.source.includes(name)),name+' exited');}assert.ok(Number.isFinite(equity(s)));assert.ok(s.cash>=0);
});
test('Alpaca OHLCV adapter requests actual volume and discards unfinished candles',async()=>{
 const now=Date.parse('2026-10-13T14:00:00Z');let request;const broker=new AlpacaBroker({key:'k',secret:'s',now:()=>now,fetchImpl:async url=>{request=url;return new Response(JSON.stringify({bars:{SPY:[{t:'2026-10-13T13:59:00Z',o:100,h:102,l:99,c:101,v:12345},{t:'2026-10-13T14:00:00Z',o:101,h:102,l:100,c:101,v:99}]}}));}});
 const data=await broker.bars(['SPY']);assert.match(request,/timeframe=1Min/);assert.equal(data.bars.SPY.length,1);assert.equal(data.bars.SPY[0].volume,12345);
});
test('real-data trend trades only after actual completed bar input is supplied',()=>{
 const s=createState();s.strategies.trend=true;const now=Date.parse('2026-10-13T14:00:00Z');const data={market:{open:true},quotes:SYMBOLS.map(symbol=>({symbol,price:symbol==='SPY'?101:s.prices[symbol],timestamp:new Date(now).toISOString()}))};stepMarket(s,data,now);assert.equal(s.positions.length,0);
 const candles=bars([...Array(20).fill(100),101]);stepMarket(s,{...data,quotes:data.quotes.map(q=>({...q,timestamp:new Date(now+60000).toISOString()})),barData:{bars:{SPY:candles}}},now+60000);assert.equal(s.positions.length,0); // old candles are stale and cannot trigger a catch-up trade.
 const fresh=candles.map((b,i)=>({...b,timestamp:new Date(now-20*60000+i*60000).toISOString()}));stepMarket(s,{...data,quotes:data.quotes.map(q=>({...q,timestamp:new Date(now+120000).toISOString()})),barData:{bars:{SPY:fresh}}},now+120000);assert.equal(s.positions.length,1);assert.equal(s.positions[0].manager,'trend');
});
test('bar signals never use a candle that closed after the available execution quote',()=>{
 const s=createState();s.strategies.trend=true;const now=Date.parse('2026-10-13T14:02:00Z');
 const candles=bars([...Array(20).fill(100),101]).map((b,i)=>({...b,timestamp:new Date(now-21*60000+i*60000).toISOString()}));
 const data={market:{open:true},quotes:SYMBOLS.map(symbol=>({symbol,price:symbol==='SPY'?101:s.prices[symbol],timestamp:new Date(now-30000).toISOString()})),barData:{bars:{SPY:candles}}};
 stepMarket(s,data,now);assert.equal(s.positions.length,0);
 stepMarket(s,{...data,quotes:data.quotes.map(q=>({...q,timestamp:new Date(now+30000).toISOString()}))},now+30000);assert.equal(s.positions.length,1);
});
