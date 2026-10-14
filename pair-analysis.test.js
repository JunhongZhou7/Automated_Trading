import test from 'node:test';
import assert from 'node:assert/strict';
import {keywordNlp,priceMetrics,rankPair,PairAnalysisService,SemanticNlp} from './pair-analysis.js';
import {PAIRS,hydrateUniverse} from './universe.js';
import {createState,zScore,step} from './engine.js';
import {AlpacaBroker} from './brokers/alpaca.js';
import {createServer} from './server.js';
const pair=PAIRS.find(p=>p.id==='PEP-KO'),now=Date.parse('2026-10-13T21:00:00Z');
function candles(symbol,offset=0){return Array.from({length:60},(_,i)=>({timestamp:new Date(now-(60-i)*86400000).toISOString(),close:Math.exp(4+i*.003+Math.sin(i*1.7)*.012+Math.cos(i*.7)*.005+offset+(symbol==='PEP'?Math.sin(i*.5)*.002:0))}));}
const daily={bars:{PEP:candles('PEP',.8),KO:candles('KO'),AAPL:candles('PEP',1),MSFT:candles('KO')},feed:'iex'};
const article=(symbol,id,headline='Company beats estimates on strong demand')=>({id,headline,summary:'Quarterly earnings update.',symbols:[symbol],publishedAt:new Date(now-3600000).toISOString(),url:'https://example.com/'+id,source:'Example news'});
test('keyword NLP attributes single-company news and marks structural-event words',()=>{
 const news=[article('PEP','1','PepsiCo raises guidance on strong demand'),article('KO','2','Coca-Cola cuts guidance after recall')];const result=keywordNlp(news,pair);
 assert.ok(result.assets.PEP.sentiment>0);assert.ok(result.assets.KO.sentiment<0);assert.equal(result.eventRisk,true);assert.deepEqual(result.evidenceIds,['1','2']);assert.match(result.limitations,/不是语言模型/);
 const shared=keywordNlp([{...article('PEP','3'),symbols:['PEP','KO']}],pair);assert.equal(shared.assets.PEP.articleCount,0);assert.equal(shared.assets.KO.articleCount,0);
});
test('price metrics align dates, exclude an unfinished daily bar and never claim cointegration',()=>{
 const metrics=priceMetrics(pair,daily.bars,now);assert.equal(metrics.ready,true);assert.equal(metrics.observations,60);assert.ok(metrics.correlation>.9);assert.ok(metrics.beta>0);assert.equal(metrics.cointegrationTested,false);
 const unfinished={...daily.bars,PEP:[...daily.bars.PEP,{timestamp:'2026-10-14T04:00:00Z',close:9999}],KO:[...daily.bars.KO,{timestamp:'2026-10-14T04:00:00Z',close:9999}]};
 assert.deepEqual(priceMetrics(pair,unfinished,now),metrics);
 assert.equal(priceMetrics(pair,{PEP:daily.bars.PEP.slice(0,20),KO:daily.bars.KO},now).ready,false);
 assert.equal(priceMetrics(pair,daily.bars,now+10*86400000).ready,false);
});
test('price regression excludes the latest close from its fitting window',()=>{
 const first=priceMetrics(pair,daily.bars,now),modified=structuredClone(daily.bars);modified.PEP.at(-1).close*=1.1;const second=priceMetrics(pair,modified,now);assert.equal(first.beta,second.beta);assert.notEqual(first.z,second.z);
});
test('rank is a research heuristic; absent text coverage, weak prices and event risk cannot be recommended',()=>{
 const metrics=priceMetrics(pair,daily.bars,now),news=[article('PEP','1'),article('KO','2')];const clean=rankPair(pair,metrics,keywordNlp(news,pair),news);assert.equal(clean.eligible,true);assert.ok(clean.score>=0&&clean.score<=100);assert.ok(clean.reasons.some(s=>s.includes('不是胜率')));
 const missing=rankPair(pair,metrics,keywordNlp([],pair),[]);assert.equal(missing.eligible,false);assert.ok(missing.reasons.some(s=>s.includes('信息不足')));
 const eventNews=[article('PEP','1','PepsiCo merger investigation'),article('KO','2')];assert.equal(rankPair(pair,metrics,keywordNlp(eventNews,pair),eventNews).eligible,false);
 assert.equal(rankPair(pair,{...metrics,correlation:.2},keywordNlp(news,pair),news).eligible,false);
 assert.equal(rankPair(pair,{...metrics,z:4},keywordNlp(news,pair),news).eligible,false);
});
test('service uses actual provider inputs, removes future/outdated news, caches and deduplicates requests',async()=>{
 let requests=0;const news=['PEP','KO','AAPL','MSFT'].map((s,i)=>article(s,String(i)));news.push({...article('PEP','future'),publishedAt:new Date(now+60000).toISOString()});news.push({...article('KO','old'),publishedAt:new Date(now-8*86400000).toISOString()});
 const broker={dailyBars:async()=>{requests++;return daily;},news:async()=>({articles:news,truncated:true})},service=new PairAnalysisService(broker,{provider:'keyword',now:()=>now});
 const [a,b]=await Promise.all([service.analyze(),service.analyze()]);assert.equal(requests,1);assert.deepEqual(a,b);assert.equal(a.rows.length,10);assert.equal(a.newsTruncated,true);assert.ok(a.rows.every(r=>r.articles.every(a=>!['future','old'].includes(a.id))));await service.analyze();assert.equal(requests,1);
});
test('upstream analysis failure returns an error instead of random market/news fallback',async()=>{
 const service=new PairAnalysisService({dailyBars:async()=>{throw Error('No credentials');},news:async()=>({articles:[]})});await assert.rejects(service.analyze(),/No credentials/);assert.equal(service.cached,null);
});
test('semantic NLP uses server key, validates citations and does not fall back to keywords',async()=>{
 let captured;const news=[article('PEP','1'),article('KO','2')],response={assets:{PEP:{sentiment:.2,articleCount:999},KO:{sentiment:.1,articleCount:999}},eventRisk:false,reason:'双方新闻均为常规财报。',evidenceIds:['1','2']};
 const nlp=new SemanticNlp({key:'unit-test-key',model:'test-model',fetchImpl:async(url,options)=>{captured={url,options};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}));}});
 const result=await nlp.analyze(news,pair);assert.equal(result.assets.PEP.articleCount,1);assert.equal(captured.url,'https://api.openai.com/v1/chat/completions');assert.equal(captured.options.headers.Authorization,'Bearer unit-test-key');assert.equal(captured.options.redirect,'error');assert.match(JSON.parse(captured.options.body).messages[0].content,/untrusted DATA/);assert.ok(!JSON.stringify(result).includes('unit-test-key'));
 response.evidenceIds=['invented'];await assert.rejects(nlp.analyze(news,pair),/依据/);
 await assert.rejects(new SemanticNlp({key:''}).analyze(news,pair),/NLP_API_KEY/);
 const broken=new SemanticNlp({key:'k',fetchImpl:async()=>new Response('invalid',{status:401})});await assert.rejects(broken.analyze(news,pair),/401/);
});
test('Alpaca news normalizes sources, strips summary HTML and daily request uses adjusted actual prices',async()=>{
 const calls=[],broker=new AlpacaBroker({key:'k',secret:'s',now:()=>now,fetchImpl:async url=>{calls.push(url);return new Response(JSON.stringify(url.includes('/news?')?{news:[{id:1,headline:'Pepsi update',summary:'<p>Revenue rises</p>',symbols:['PEP'],created_at:new Date(now-1000).toISOString(),url:'https://example.com/1',source:'Source'}]}:{bars:{PEP:[{t:'2026-10-12T04:00:00Z',c:160}]}}));}});
 const news=await broker.news(['PEP','KO']);assert.equal(news.articles[0].id,'1');assert.equal(news.articles[0].summary.trim(),'Revenue rises');assert.equal(news.articles[0].source,'Source');const bars=await broker.dailyBars(['PEP']);assert.equal(bars.bars.PEP[0].close,160);assert.ok(calls.some(url=>url.includes('timeframe=1Day')&&url.includes('adjustment=all')));
});
test('PEP/KO can trade and open pair keeps its original symbols after selection is changed',()=>{
 const s=createState();s.selectedPair='PEP-KO';s.strategies.pairs=true;for(let i=0;i<1000&&!s.pair;i++)step(s);assert.ok(s.pair);assert.equal(s.pair.pairId,'PEP-KO');assert.deepEqual(new Set(s.positions.map(p=>p.symbol)),new Set(['PEP','KO']));
 const score=zScore(s);s.selectedPair='AAPL-MSFT';assert.equal(zScore(s),score);assert.equal(s.pair.pairId,'PEP-KO');
});
test('older local accounts keep original position identity and do not fake prior PEP/KO history',()=>{
 const s=createState();delete s.prices.PEP;delete s.prices.KO;delete s.selectedPair;s.pair={id:'old'};s.history=Array.from({length:40},()=>({AAPL:190,MSFT:420}));hydrateUniverse(s);assert.equal(s.pair.pairId,'AAPL-MSFT');assert.equal(s.selectedPair,'AAPL-MSFT');assert.equal(zScore(s,'PEP-KO'),null);assert.ok(s.prices.PEP>0);
});
test('analysis HTTP endpoint serves results without exposing analyzer source or secrets',async t=>{
 const analysis={provider:'keyword',analyze:async()=>({rows:[],provider:'keyword'})},broker={configured:true};const server=createServer({broker,analysis});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/pair-analysis')).status,200);assert.equal((await fetch(base+'/pair-analysis.js')).status,404);assert.equal((await fetch(base+'/universe.js')).status,200);assert.equal((await fetch(base+'/pair-research-ui.js')).status,200);
});
test('model quota, authentication and model-access errors remain distinct without leaking upstream messages',async()=>{
 for(const [status,code,expected] of [[429,'insufficient_quota',/额度或计费/],[429,'rate_limit_exceeded',/频率/],[401,'invalid_api_key',/密钥无效/],[404,'model_not_found',/模型不存在/]]){
  const nlp=new SemanticNlp({key:'test-key',fetchImpl:async()=>new Response(JSON.stringify({error:{code,message:'sensitive upstream content must not be echoed'}}),{status})});
  await assert.rejects(nlp.analyze([article('PEP','1')],pair),error=>error.status===status&&error.code===code&&expected.test(error.message)&&!error.message.includes('sensitive upstream'));
 }
});
