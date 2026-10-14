import test from 'node:test';
import assert from 'node:assert/strict';
import {AlpacaBroker,PAPER_URL,DATA_URL} from './brokers/alpaca.js';
import {PaperService} from './broker-service.js';
import {createBroker} from './brokers/index.js';
import {createServer} from './server.js';
import {createState,stepMarket,SYMBOLS} from './engine.js';
const now=Date.parse('2026-10-13T15:00:00Z');
const quoteData=(time=now)=>({market:{open:true},quotes:SYMBOLS.map((symbol,i)=>({symbol,price:100+i*10,timestamp:new Date(time).toISOString(),ageSeconds:(now-time)/1000}))});
function fixture(){let calls=0;const snapshot={account:{equity:100000,cash:100000,buyingPower:100000,status:'ACTIVE',blocked:false},market:{open:true},positions:[],orders:[]};return {snapshot:async()=>structuredClone(snapshot),quotes:async()=>quoteData(),submitOrder:async input=>{calls++;return {id:'order-1',...input,status:'new',filledQty:0};},get calls(){return calls;},data:snapshot};}
const input={symbol:'AAPL',qty:10,side:'buy',clientOrderId:'ss-12345678',maxExposure:50};
test('Alpaca sends secrets only to fixed Alpaca endpoints and normalizes quotes',async()=>{
 const requests=[],broker=new AlpacaBroker({key:'test-key',secret:'test-secret',now:()=>now,fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({trades:{AAPL:{p:200,t:new Date(now).toISOString()}}}));}});
 const data=await broker.quotes(['AAPL']);assert.equal(data.quotes[0].price,200);assert.equal(data.quotes[0].ageSeconds,0);
 assert.ok(requests[0].url.startsWith(DATA_URL+'/'));assert.ok(requests[0].url.includes('feed=iex'));assert.equal(requests[0].options.headers['APCA-API-KEY-ID'],'test-key');assert.equal(requests[0].options.redirect,'error');assert.ok(!JSON.stringify(data).includes('test-secret'));
});
test('orders always use paper endpoint and preserve broker fill state',async()=>{
 let request;const broker=new AlpacaBroker({key:'k',secret:'s',fetchImpl:async(url,options)=>{request={url,options};return new Response(JSON.stringify({id:'id',symbol:'AAPL',side:'buy',qty:'10',filled_qty:'0',filled_avg_price:null,status:'new',client_order_id:'ss-12345678'}));}});
 const result=await broker.submitOrder(input);assert.equal(request.url,PAPER_URL+'/v2/orders');assert.equal(result.status,'new');assert.equal(result.filledQty,0);assert.equal(result.filledPrice,null);assert.equal(JSON.parse(request.options.body).time_in_force,'day');
});
test('missing credentials, missing quotes, and upstream errors do not synthesize data or leak response bodies',async()=>{
 await assert.rejects(new AlpacaBroker({key:'',secret:''}).quotes(['AAPL']),/Set ALPACA/);
 const denied=new AlpacaBroker({key:'k',secret:'s',fetchImpl:async()=>new Response('sensitive upstream content',{status:403})});await assert.rejects(denied.quotes(['AAPL']),e=>e.status===403&&!e.message.includes('sensitive'));
 const missing=new AlpacaBroker({key:'k',secret:'s',fetchImpl:async()=>new Response('{"trades":{}}')});await assert.rejects(missing.quotes(['AAPL']),/Missing/);
});
test('real feed rejects stale data, closed markets, and duplicates do not run strategies twice',()=>{
 const s=createState();assert.equal(stepMarket(s,quoteData(),now),true);assert.equal(s.tick,1);assert.equal(stepMarket(s,quoteData(),now),false);assert.equal(s.tick,1);
 const before=structuredClone(s);assert.throws(()=>stepMarket(s,quoteData(now-121000),now),/stale/);assert.deepEqual(s,before);
 assert.throws(()=>stepMarket(s,{...quoteData(),market:{open:false}},now),/closed/);
});
test('real sampling resets rolling history across market gaps',()=>{
 const s=createState();stepMarket(s,quoteData(),now);stepMarket(s,quoteData(now+60000),now+60000);assert.equal(s.history.length,2);
 stepMarket(s,quoteData(now+86400000),now+86400000);assert.equal(s.history.length,1);
});
test('paper service checks risk and keeps submission separate from fills',async()=>{
 const broker=fixture(),service=new PaperService(broker);const result=await service.submit(input);assert.equal(result.filledQty,0);assert.equal(broker.calls,1);
 await assert.rejects(service.submit({...input,qty:1000}),/exposure/);assert.equal(broker.calls,1);
});
test('closing cannot accidentally open a short and opposing entries require explicit close',async()=>{
 const broker=fixture(),service=new PaperService(broker);await assert.rejects(service.submit({...input,side:'sell'}),/Closing/);
 broker.data.positions=[{symbol:'AAPL',qty:5,marketValue:500}];await assert.rejects(service.submit({...input,qty:6,side:'sell'}),/Closing/);await assert.rejects(service.submit({...input,qty:1,side:'short'}),/opposing/);
 const result=await service.submit({...input,qty:5,side:'sell'});assert.equal(result.side,'sell');
});
test('closed market, stale quote, blocked account, and pending order block submission',async()=>{
 const broker=fixture(),service=new PaperService(broker);
 broker.data.market.open=false;await assert.rejects(service.submit(input),/closed/);broker.data.market.open=true;
 broker.data.account.blocked=true;await assert.rejects(service.submit(input),/cannot trade/);broker.data.account.blocked=false;
 broker.data.orders=[{id:'pending',status:'partially_filled'}];await assert.rejects(service.submit(input),/Pending/);broker.data.orders=[];
 broker.quotes=async()=>quoteData(now-200000);await assert.rejects(service.submit(input),/older/);assert.equal(broker.calls,0);
});
test('same client ID reconciles previously accepted submission without another POST',async()=>{
 const broker=fixture();broker.data.orders=[{id:'existing',clientOrderId:input.clientOrderId,status:'new',symbol:'AAPL',qty:10,side:'buy'}];const service=new PaperService(broker);const result=await service.submit(input);assert.equal(result.id,'existing');assert.equal(broker.calls,0);
 await assert.rejects(service.submit({...input,qty:20}),/different order/);
});
test('concurrent broker requests are serialized to avoid double exposure allocation',async()=>{
 const broker=fixture();let release;broker.snapshot=()=>new Promise(resolve=>{release=()=>resolve(structuredClone(broker.data));});const service=new PaperService(broker),first=service.submit(input);
 await assert.rejects(service.submit({...input,clientOrderId:'ss-87654321'}),/Another order/);release();await first;assert.equal(broker.calls,1);
});
test('IBKR is an explicit unimplemented extension and never silently switches providers',async()=>{
 const b=createBroker('ibkr');assert.equal(b.capabilities.paperOrders,false);await assert.rejects(b.snapshot(),/future integration/);assert.throws(()=>createBroker('unknown'),/Unknown/);
});
test('HTTP API rejects cross-origin mutation and does not expose credential files',async t=>{
 const broker=fixture();broker.configured=true;const server=createServer({broker,ordersEnabled:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/brokers/alpaca.js')).status,404);
 const c=await (await fetch(base+'/api/config')).json();assert.equal(c.ordersEnabled,false);
 assert.equal((await fetch(base+'/api/orders',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);
 assert.equal((await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json','X-Strategy-Studio':'1'},body:JSON.stringify(input)})).status,403);
});
test('HTTP paper API returns accepted order instead of fabricated fill',async t=>{
 const broker=fixture();broker.configured=true;const server=createServer({broker,ordersEnabled:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const result=await fetch('http://127.0.0.1:'+server.address().port+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json','X-Strategy-Studio':'1'},body:JSON.stringify(input)});assert.equal(result.status,200);const data=await result.json();assert.equal(data.status,'new');assert.equal(data.filledQty,0);
});
