import {hydrateStrategies,runCombinations,ingestBars,marketSession} from './strategies.js';
import {SYMBOLS,INITIAL_PRICES,pairById,hydrateUniverse} from './universe.js';
export {SYMBOLS} from './universe.js';
export const DEFAULT_RULES = [
  {threshold:-3,action:'hold',percent:0}, {threshold:-15,action:'buy',percent:10},
  {threshold:-25,action:'buy',percent:25}, {threshold:5,action:'hold',percent:0},
  {threshold:15,action:'hold',percent:0}, {threshold:25,action:'sell',percent:10},
  {threshold:35,action:'sell',percent:20}, {threshold:45,action:'sell',percent:30},
  {threshold:60,action:'sell',percent:40}, {threshold:100,action:'sell',percent:100}
];
export function createState(seed=42) {
  return hydrateStrategies(hydrateUniverse({version:1, seed, tick:0, cash:100000, initial:100000, prices:{...INITIAL_PRICES}, history:[], curve:[100000],positions:[],trades:[],events:[],nextId:1,pair:null,strategies:{pairs:false,ladder:false},rules:structuredClone(DEFAULT_RULES),settings:{entryZ:2,exitZ:0.4,stopZ:3.5,maxExposure:50}}));
}
function random(s) { s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0; return s.seed/4294967296; }
export function mark(s,p) {
  if(p.type==='stock') return s.prices[p.symbol];
  const intrinsic=Math.max(0,p.type==='call'?s.prices[p.symbol]-p.strike:p.strike-s.prices[p.symbol]);
  return intrinsic + Math.max(0,p.expiry-s.tick)/390 * p.timeValue;
}
export function equity(s) { return s.cash+s.positions.reduce((sum,p)=>sum+p.qty*mark(s,p)*(p.type==='stock'?1:100),0); }
export function exposure(s) { return s.positions.reduce((sum,p)=>sum+Math.abs(p.qty*mark(s,p)*(p.type==='stock'?1:100)),0); }
function event(s,message) { s.events.unshift({tick:s.tick,message}); s.events=s.events.slice(0,100); }
export function order(s,{symbol,type='stock',qty,side='buy',source='Manual',positionId=null,group=null}) {
  if(!SYMBOLS.includes(symbol)||!['stock','call','put'].includes(type)||!Number.isInteger(qty)||qty<=0||!['buy','sell','short','cover'].includes(side)) throw Error('Choose a valid symbol, instrument, side, and whole quantity.');
  let p=positionId?s.positions.find(p=>p.id===positionId):null;
  if(positionId&&!p) throw Error('Position no longer exists.');
  const closing=side==='sell'||side==='cover';
  if(closing&&(!p||qty>Math.abs(p.qty)||(side==='sell'&&p.qty<0)||(side==='cover'&&p.qty>0))) throw Error('Closing quantity exceeds the selected position.');
  if(p&&(p.symbol!==symbol||p.type!==type)) throw Error('Order does not match position.');
  if(p&&!closing&&((p.qty<0&&side!=='short')||(p.qty>0&&side!=='buy'))) throw Error('Use sell or cover to close an existing position.');
  if(type!=='stock'&&side==='short') throw Error('This simulator supports buying calls and puts, not writing options.');
  if(!p) p={id:s.nextId,symbol,type,qty:0,anchor:s.prices[symbol],entry:0,source,group,fired:[],strike:Math.round(s.prices[symbol]),expiry:s.tick+390,timeValue:s.prices[symbol]*0.015};
  const price=mark(s,p),multiplier=type==='stock'?1:100,sign=(side==='buy'||side==='cover')?1:-1,cost=qty*price*multiplier*sign,fee=1;
  if(cost+fee>s.cash) throw Error('Insufficient simulated cash.');
  if(!closing&&(exposure(s)+Math.abs(cost)>Math.max(0,equity(s))*s.settings.maxExposure/100)) throw Error('Order exceeds the gross exposure limit.');
  if(!positionId) {s.nextId++;s.positions.push(p);}
  const previous=Math.abs(p.qty);
  if(!closing) p.entry=(p.entry*previous+price*qty)/(previous+qty);
  p.qty+=sign*qty;s.cash-=cost+fee;
  s.trades.unshift({tick:s.tick,symbol,type,side,qty,price,fee,source});s.trades=s.trades.slice(0,500);
  s.positions=s.positions.filter(p=>p.qty!==0);
  return p;
}
export function closePosition(s,p,source='Manual close') { return order(s,{symbol:p.symbol,type:p.type,qty:Math.abs(p.qty),side:p.qty>0?'sell':'cover',positionId:p.id,source}); }
export function zScore(s,pairId=s.pair?.pairId||s.selectedPair||'AAPL-MSFT') {
  const pair=pairById(pairId);if(!pair)return null;
  const h=s.history.slice(-40).filter(p=>p[pair.a]>0&&p[pair.b]>0);if(h.length<30)return null;
  const ratios=h.map(p=>Math.log(p[pair.a]/p[pair.b])); const mean=ratios.reduce((a,b)=>a+b,0)/ratios.length;
  const sd=Math.sqrt(ratios.reduce((a,b)=>a+(b-mean)**2,0)/ratios.length);
  return sd>0?(ratios.at(-1)-mean)/sd:0;
}
function closePair(s,reason) { for(const p of [...s.positions].filter(p=>p.group===s.pair?.id))closePosition(s,p,reason);s.pair=null;event(s,reason); }
function pairStrategy(s) {
  const z=zScore(s);if(z===null)return;
  if(s.pair) {if(Math.abs(z)<=s.settings.exitZ||Math.abs(z)>=s.settings.stopZ)closePair(s,Math.abs(z)>=s.settings.stopZ?'Pairs stop: spread widened':'Pairs exit: spread reverted');return;}
  if(!s.strategies.pairs||Math.abs(z)<s.settings.entryZ)return;
  const pair=pairById(s.selectedPair||'AAPL-MSFT');
  if(s.positions.some(p=>p.type==='stock'&&[pair.a,pair.b].includes(p.symbol)))return;
  const long=z>0?pair.b:pair.a,short=z>0?pair.a:pair.b,budget=equity(s)*0.15;
  const a=Math.floor(budget/s.prices[long]),b=Math.floor(budget/s.prices[short]);if(!a||!b)return;
  // Trial on a copy keeps two-leg orders atomic if cash or exposure checks reject either leg.
  const trial=structuredClone(s),id='pair-'+s.nextId;
  try {order(trial,{symbol:long,qty:a,source:'Pairs arbitrage',group:id});order(trial,{symbol:short,qty:b,side:'short',source:'Pairs arbitrage',group:id});trial.pair={id,pairId:pair.id};Object.assign(s,trial);event(s,'Pairs entry: long '+long+', short '+short);}
  catch(e){event(s,'Pairs entry skipped: '+e.message);}
}
export function applyRules(s) {
  if(!s.strategies.ladder)return;
  for(const p of [...s.positions]) {
    // Pair exits own both legs; independent ladder adjustments would break the hedge.
    if(p.type!=='stock'||p.qty<=0||p.group||p.manager)continue;
    const change=(s.prices[p.symbol]/p.anchor-1)*100;
    for(let i=0;i<s.rules.length;i++) {
      const r=s.rules[i];if(p.fired.includes(i)||!(r.threshold<0?change<=r.threshold:change>=r.threshold))continue;
      if(r.action==='hold'){p.fired.push(i);event(s,p.symbol+': hold at '+r.threshold+'%');continue;}
      const qty=r.percent===100&&r.action==='sell'?p.qty:Math.floor(p.qty*r.percent/100);
      if(qty<1){p.fired.push(i);continue;}
      try {order(s,{symbol:p.symbol,qty,side:r.action,positionId:p.id,source:'Profit ladder'});p.fired.push(i);event(s,p.symbol+': '+r.action+' '+qty+' at '+r.threshold+'% rule');}
      catch(e){event(s,'Ladder skipped: '+e.message);}
      if(!s.positions.includes(p))break;
    }
  }
}
export function step(s) {
  hydrateStrategies(hydrateUniverse(s));const opens={...s.prices};
  s.tick++;const market=(random(s)-0.5)*0.006;
  for(const symbol of SYMBOLS) s.prices[symbol]*=Math.exp(market+(random(s)-0.5)*0.008);
  const minute=(s.tick-1)%390,session='demo-'+Math.floor((s.tick-1)/390),timestamp=new Date(Date.parse('2026-01-05T14:30:00Z')+Math.floor((s.tick-1)/390)*86400000+minute*60000).toISOString();
  for(const symbol of SYMBOLS){const close=s.prices[symbol],bar={timestamp,session,minute,open:opens[symbol],high:Math.max(opens[symbol],close)*(1+random(s)*.001),low:Math.min(opens[symbol],close)*(1-random(s)*.001),close,volume:Math.floor(50000+random(s)*500000)};s.bars[symbol]??=[];s.bars[symbol].push(bar);s.bars[symbol]=s.bars[symbol].slice(-1000);}
  s.barError=null;
  s.history.push({...s.prices});s.history=s.history.slice(-400);
  for(const p of [...s.positions])if(p.type!=='stock'&&p.expiry<=s.tick){const amount=mark(s,p)*p.qty*100;s.cash+=amount;s.positions=s.positions.filter(x=>x.id!==p.id);event(s,p.symbol+' '+p.type+' expired; cash settlement $'+amount.toFixed(2));}
  pairStrategy(s);runCombinations(s,{session,minute,real:false},{equity,exposure,order,closePosition,event});applyRules(s);s.curve.push(equity(s));s.curve=s.curve.slice(-600);return s;
}
// Real quotes are sampled once per minute; duplicate polls never accelerate strategy time.
export function validateMarket(data,now=Date.now()) {
  if(!data.market?.open)throw Error('Market is closed; strategies are paused.');
  const prices={},times=[];
  for(const symbol of SYMBOLS){const q=data.quotes?.find(q=>q.symbol===symbol),time=Date.parse(q?.timestamp);
    if(!q||!Number.isFinite(q.price)||q.price<=0||!Number.isFinite(time)||now-time>120000||time-now>5000)throw Error('Missing or stale Alpaca quote. Strategies are paused.');
    prices[symbol]=q.price;times.push(time);
  }
  if(Math.max(...times)-Math.min(...times)>60000)throw Error('Quote timestamps are not aligned. Strategies are paused.');
  return {prices,minute:Math.floor(Math.min(...times)/60000)};
}
export function stepMarket(s,data,now=Date.now()) {
  const {prices,minute}=validateMarket(data,now);
  hydrateStrategies(hydrateUniverse(s));ingestBars(s,data.barData||{error:'未取得OHLCV K线'},now);
  s.prices=prices;
  if(minute<= (s.lastMarketMinute??-1))return false;
  // Do not treat a market overnight gap as a continuous rolling intraday window.
  if(s.lastMarketMinute!==undefined&&minute-s.lastMarketMinute>5)s.history=[];
  s.lastMarketMinute=minute;s.tick++;s.history.push({...prices});s.history=s.history.slice(-400);
  const session=marketSession(now),closeTime=Date.parse(data.market.nextClose);
  const flattenMinute=Number.isFinite(closeTime)&&marketSession(closeTime).id===session.id?marketSession(closeTime).minute-5:385;
  const quoteTime=Math.min(...data.quotes.map(q=>Date.parse(q.timestamp)));
  pairStrategy(s);runCombinations(s,{session:session.id,minute:session.minute,flattenMinute,real:true,now,quoteTime},{equity,exposure,order,closePosition,event});applyRules(s);s.curve.push(equity(s));s.curve=s.curve.slice(-600);return true;
}
