import test from 'node:test';
import assert from 'node:assert/strict';
import {PAIRS,SYMBOLS,requiredMarketSymbols} from './universe.js';
import {PairAnalysisService,keywordNlp} from './pair-analysis.js';
import {BrokerError} from './brokers/base.js';
import {createState,stepMarket,step} from './engine.js';
import {createServer} from './server.js';
const now=Date.parse('2026-10-13T21:00:00Z');
const allSymbols=[...new Set(PAIRS.flatMap(p=>[p.a,p.b]))];
const daily={feed:'iex',bars:Object.fromEntries(allSymbols.map((symbol,j)=>[symbol,Array.from({length:60},(_,i)=>({timestamp:new Date(now-(60-i)*86400000).toISOString(),close:Math.exp(4+j*.02+i*.003+Math.sin(i*1.7)*.012+Math.cos(i*.7)*.005+(j%2===0?Math.sin(i*.5)*.002:0))}))]))};
const news=symbols=>({truncated:false,articles:symbols.map(symbol=>({id:symbol,headline:symbol+' beats estimates',summary:'Strong demand.',symbols:[symbol],publishedAt:new Date(now-60000).toISOString(),source:'Fixture',url:'https://example.com/'+symbol}))});
test('default pool has ten unique, selectable industry pairs with complete symbol metadata',()=>{
 const expected=['AAPL-MSFT','PEP-KO','V-MA','XOM-CVX','JPM-BAC','WMT-COST','HD-LOW','UPS-FDX','MCD-YUM','GOOGL-META'];
 assert.deepEqual(PAIRS.map(p=>p.id),expected);assert.equal(new Set(PAIRS.map(p=>[p.a,p.b].sort().join('-'))).size,10);
 const s=createState();for(const pair of PAIRS){assert.ok(pair.sector);assert.ok(SYMBOLS.includes(pair.a)&&SYMBOLS.includes(pair.b));assert.ok(s.prices[pair.a]>0&&s.prices[pair.b]>0);}
});
test('full scan queries news separately for every pair, limits concurrency, and ranks all ten',async()=>{
 let dailyRequests=0,active=0,maxActive=0;const requested=[];
 const broker={dailyBars:async symbols=>{dailyRequests++;assert.deepEqual(new Set(symbols),new Set(allSymbols));return daily;},news:async symbols=>{requested.push(symbols);active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setImmediate(resolve));active--;return news(symbols);}};
 const service=new PairAnalysisService(broker,{provider:'keyword',now:()=>now});
 const started=service.startScan();assert.equal(started.status,'running');assert.equal(started.progress.total,10);
 const result=await service.analyze();assert.equal(dailyRequests,1);assert.equal(requested.length,10);assert.ok(maxActive<=3&&maxActive>1);assert.deepEqual(new Set(requested.map(s=>s.join('-'))),new Set(PAIRS.map(p=>p.id)));assert.equal(result.summary.total,10);assert.equal(result.summary.failed,0);assert.equal(result.rows.length,10);assert.ok(result.rows.every(r=>r.metrics.ready&&r.nlp.assets[r.pair.a].articleCount===1&&r.nlp.assets[r.pair.b].articleCount===1));
 assert.equal(service.scanStatus().status,'complete');assert.equal(service.progress.completed,10);await service.analyze();assert.equal(requested.length,10);
});
test('one news failure or missing coverage does not remove pairs or poison other rankings',async()=>{
 const broker={dailyBars:async()=>daily,news:async symbols=>{if(symbols[0]==='V')throw new BrokerError('Payment news unavailable',403);if(symbols[0]==='UPS')return {articles:[],truncated:false};return news(symbols);}};
 const result=await new PairAnalysisService(broker,{now:()=>now}).analyze();assert.equal(result.rows.length,10);assert.equal(result.summary.failed,1);
 const failed=result.rows.find(r=>r.pair.id==='V-MA'),missing=result.rows.find(r=>r.pair.id==='UPS-FDX');assert.equal(failed.status,'failed');assert.equal(failed.score,null);assert.ok(failed.reasons.some(s=>s.includes('Payment news unavailable')));assert.equal(missing.status,'complete');assert.equal(missing.score,null);assert.equal(missing.eligible,false);assert.ok(result.rows.find(r=>r.pair.id==='PEP-KO').eligible);
});
test('semantic mode processes all ten with per-pair failures and no keyword fallback',async()=>{
 const calls=[],semantic={analyze:async(articles,pair)=>{calls.push(pair.id);if(pair.id==='JPM-BAC')throw new BrokerError('Model refused this pair');return {...keywordNlp(articles,pair),provider:'semantic'};}};
 const result=await new PairAnalysisService({dailyBars:async()=>daily,news:async symbols=>news(symbols)},{provider:'semantic',semantic,now:()=>now}).analyze();assert.equal(calls.length,10);assert.equal(result.summary.failed,1);assert.equal(result.rows.find(r=>r.pair.id==='JPM-BAC').score,null);assert.ok(result.rows.filter(r=>r.status==='complete').every(r=>r.nlp.provider==='semantic'));
});
test('daily service failure reports failed job status, and an explicit retry can recover',async()=>{
 let fail=true;const service=new PairAnalysisService({dailyBars:async()=>{if(fail)throw new BrokerError('Missing Alpaca credentials',503);return daily;},news:async symbols=>news(symbols)},{now:()=>now});
 service.startScan();await assert.rejects(service.analyze(),/Missing Alpaca/);assert.equal(service.scanStatus().status,'failed');fail=false;service.startScan();const result=await service.analyze();assert.equal(result.rows.length,10);assert.equal(service.scanStatus().status,'complete');
});
test('active real quotes include selected legs and holdings, not the entire research pool',()=>{
 const s=createState();s.selectedPair='V-MA';let required=requiredMarketSymbols(s);assert.ok(required.includes('V')&&required.includes('MA'));assert.ok(!required.includes('FDX'));
 const quotes=required.map(symbol=>({symbol,price:s.prices[symbol],timestamp:new Date(now).toISOString()}));const data={market:{open:true},quotes:[...quotes,{symbol:'FDX',price:123,timestamp:new Date(now-86400000).toISOString()}]};
 assert.equal(stepMarket(s,data,now),true);const other=s.prices.FDX;assert.equal(other,createState().prices.FDX);
 assert.throws(()=>stepMarket(s,{...data,quotes:quotes.filter(q=>q.symbol!=='V')},now),/Missing/);
 s.positions.push({symbol:'XOM',qty:1,type:'stock'});assert.ok(requiredMarketSymbols(s).includes('XOM'));
});
test('each of the ten selected pairs can open matching synthetic legs',()=>{
 for(const pair of PAIRS){const s=createState();s.selectedPair=pair.id;s.strategies.pairs=true;for(let i=0;i<1000&&!s.pair;i++)step(s);assert.ok(s.pair,pair.id);assert.equal(s.pair.pairId,pair.id);assert.deepEqual(new Set(s.positions.map(p=>p.symbol)),new Set([pair.a,pair.b]));}
});
test('HTTP scan progress and explicit symbol requests work without requesting unrelated quotes',async t=>{
 const requested=[],broker={configured:true,dailyBars:async()=>daily,news:async symbols=>news(symbols),quotes:async symbols=>{requested.push(symbols);return {quotes:[]};},marketClock:async()=>({open:true})};const analysis=new PairAnalysisService(broker,{now:()=>now});const server=createServer({broker,analysis});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 const first=await fetch(base+'/api/pair-analysis?async=1&start=1');assert.ok([200,202].includes(first.status));await analysis.analyze();const done=await (await fetch(base+'/api/pair-analysis?async=1')).json();assert.equal(done.status,'complete');assert.equal(done.rows.length,10);
 assert.equal((await fetch(base+'/api/quotes?symbols=AAPL,MSFT,V,MA')).status,200);assert.deepEqual(requested[0],['AAPL','MSFT','V','MA']);assert.equal((await fetch(base+'/api/quotes?symbols=INVALID')).status,400);assert.equal((await fetch(base+'/api/bars?symbols=')).status,400);
});
