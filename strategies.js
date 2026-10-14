export const COMBOS=['trend','vwap','rsi'];
export const COMBO_NAMES={trend:'趋势突破 + ATR仓位',vwap:'VWAP回归 + 风险限制',rsi:'RSI回归 + 时间止损'};
export const DEFAULT_COMBO_CONFIG={
 trend:{symbol:'SPY',riskPercent:0.5,maxPositionPercent:15,atrPeriod:14,atrMultiple:2,entryLookback:20,exitLookback:10},
 vwap:{symbol:'QQQ',riskPercent:0.5,maxPositionPercent:15,atrPeriod:14,atrMultiple:2,deviation:1.5,maxAdds:1,flattenMinute:385},
 rsi:{symbol:'AAPL',riskPercent:0.5,maxPositionPercent:15,atrPeriod:14,atrMultiple:2,rsiPeriod:14,oversold:30,target:60,maxHold:30}
};
const marketFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function marketSession(time){const p=Object.fromEntries(marketFormatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]));return {id:p.year+'-'+p.month+'-'+p.day,minute:Number(p.hour)*60+Number(p.minute)-570};}
export function atr(bars,period=14){if(bars.length<period+1)return null;let sum=0;for(let i=bars.length-period;i<bars.length;i++)sum+=Math.max(bars[i].high-bars[i].low,Math.abs(bars[i].high-bars[i-1].close),Math.abs(bars[i].low-bars[i-1].close));return sum/period;}
export function rsi(bars,period=14){if(bars.length<period+1)return null;let gain=0,loss=0;for(let i=1;i<=period;i++){const d=bars[i].close-bars[i-1].close;gain+=Math.max(0,d)/period;loss+=Math.max(0,-d)/period;}for(let i=period+1;i<bars.length;i++){const d=bars[i].close-bars[i-1].close;gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period;}return gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);}
export function vwap(bars){let weight=0,sum=0,squared=0;for(const b of bars){if(b.volume<=0)continue;const price=(b.high+b.low+b.close)/3;weight+=b.volume;sum+=price*b.volume;squared+=price*price*b.volume;}if(!weight)return null;const value=sum/weight;return {value,sd:Math.sqrt(Math.max(0,squared/weight-value*value))};}
export function signalFor(name,bars,cfg){
 if(bars.length<2)return false;const current=bars.at(-1),prior=bars.slice(0,-1);
 if(name==='trend')return prior.length>=cfg.entryLookback&&current.close>Math.max(...prior.slice(-cfg.entryLookback).map(b=>b.high));
 if(name==='vwap'){const before=vwap(prior),latest=vwap(bars);return Boolean(before&&latest&&before.sd>0&&prior.at(-1).close<=before.value-cfg.deviation*before.sd&&current.close>prior.at(-1).close&&current.close<latest.value);}
 if(name==='rsi'){const previous=rsi(prior,cfg.rsiPeriod),latest=rsi(bars,cfg.rsiPeriod);return previous!==null&&previous<=cfg.oversold&&latest>cfg.oversold;}
 return false;
}
export function riskQuantity({equity,cash,gross,price,distance,riskPercent,maxPositionPercent,maxExposure}){
 if(![equity,cash,gross,price,distance,riskPercent,maxPositionPercent,maxExposure].every(Number.isFinite)||price<=0||distance<=0||equity<=0)return 0;
 return Math.max(0,Math.floor(Math.min(equity*riskPercent/100/distance,equity*maxPositionPercent/100/price,(equity*maxExposure/100-gross)/price,(cash-1)/price)));
}
export function hydrateStrategies(s){
 s.strategies={trend:false,vwap:false,rsi:false,...s.strategies};
 s.comboConfig=Object.fromEntries(COMBOS.map(name=>[name,{...DEFAULT_COMBO_CONFIG[name],...s.comboConfig?.[name]}]));
 s.bars??={};s.comboStatus??={};s.comboLastBar??={};s.dailyLossPercent??=2;
 return s;
}
export function ingestBars(s,data,now=Date.now()){
 s.barError=data?.error||null;
 for(const [symbol,incoming] of Object.entries(data?.bars||{})){
  if(!Object.hasOwn(s.prices,symbol)||!Array.isArray(incoming))continue;
  const merged=new Map((s.bars[symbol]||[]).map(b=>[b.timestamp,b]));
  for(const b of incoming){const t=Date.parse(b.timestamp);if(![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.volume<0||!Number.isFinite(t)||t+60000>now)continue;
   const session=marketSession(t);if(session.minute<0||session.minute>=390)continue;
   merged.set(b.timestamp,{...b,session:session.id,minute:session.minute});
  }
  s.bars[symbol]=[...merged.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-1000);
 }
}
function currentBars(s,symbol,context){const all=(s.bars[symbol]||[]).filter(b=>b.session===context.session&&(!context.real||Date.parse(b.timestamp)+60000<=(context.quoteTime??context.now)));const last=all.at(-1);if(s.barError||!last)return [];if(context.real&&(context.now-Date.parse(last.timestamp)-60000>120000||Date.parse(last.timestamp)+60000>context.now))return [];return all;}
function summarize(name,bars,cfg){const a=atr(bars,cfg.atrPeriod);if(a===null)return 'K线预热 '+bars.length+'/'+Math.max(cfg.atrPeriod+1,name==='trend'?cfg.entryLookback+1:name==='rsi'?cfg.rsiPeriod+2:15);if(name==='vwap'){const v=vwap(bars);return v?'VWAP '+v.value.toFixed(2)+' · ATR '+a.toFixed(2):'缺少成交量，暂停入场';}if(name==='rsi'){const r=rsi(bars,cfg.rsiPeriod);return r===null?'RSI预热中':'RSI '+r.toFixed(1)+' · ATR '+a.toFixed(2);}return 'ATR '+a.toFixed(2)+' · 突破观察中';}
export function runCombinations(s,context,{equity,exposure,order,closePosition,event}){
 hydrateStrategies(s);
 if(!s.riskSession||s.riskSession.id!==context.session)s.riskSession={id:context.session,startEquity:equity(s)};
 const loss=(s.riskSession.startEquity-equity(s))/s.riskSession.startEquity*100;
 if(loss>=s.dailyLossPercent)s.riskSession.halted=true;
 const blocked=Boolean(s.riskSession.halted);
 const closedThisStep=new Set();
 // Exits remain active even when an entry switch is disabled or bar data is unavailable.
 for(const p of [...s.positions].filter(p=>COMBOS.includes(p.manager))){
  const cfg=p.management,bars=currentBars(s,p.symbol,context),price=s.prices[p.symbol];let reason=null;
  if(price<=p.stop)reason='ATR止损';
  else if(p.manager==='vwap'&&(p.session!==context.session||context.minute>=Math.min(cfg.flattenMinute,context.flattenMinute??385)))reason='日内时间退出';
  else if(p.manager==='rsi'&&s.tick-p.entryTick>=cfg.maxHold)reason='时间止损';
  else if(bars.length){
   const latest=bars.at(-1);
   if(p.manager==='trend'&&bars.length>cfg.exitLookback&&latest.close<Math.min(...bars.slice(0,-1).slice(-cfg.exitLookback).map(b=>b.low)))reason='跌破退出通道';
   if(p.manager==='vwap'&&vwap(bars)&&price>=vwap(bars).value)reason='回到VWAP';
   if(p.manager==='rsi'&&rsi(bars,cfg.rsiPeriod)>=cfg.target)reason='RSI止盈';
  }
  if(reason){closePosition(s,p,COMBO_NAMES[p.manager]+' · '+reason);event(s,p.symbol+' '+COMBO_NAMES[p.manager]+'：'+reason);closedThisStep.add(p.manager+':'+p.symbol);continue;}
  if(p.manager==='vwap'&&s.strategies.vwap&&!blocked&&bars.length&&p.adds<cfg.maxAdds&&bars.at(-1).timestamp!==p.entryBar&&price>p.entry&&price<vwap(bars)?.value&&p.qty<p.targetQty){
   const allowed=riskQuantity({equity:equity(s),cash:s.cash,gross:exposure(s),price,distance:Math.max(.01,price-p.stop),riskPercent:cfg.riskPercent,maxPositionPercent:cfg.maxPositionPercent,maxExposure:s.settings.maxExposure});
   const riskRoom=Math.floor(Math.max(0,p.riskBudget-p.qty*(price-p.stop))/(price-p.stop));
   const valueRoom=Math.floor(Math.max(0,equity(s)*cfg.maxPositionPercent/100-p.qty*price)/price);
   const qty=Math.min(p.targetQty-p.qty,allowed,riskRoom,valueRoom);
   if(qty>0){try{order(s,{symbol:p.symbol,qty,positionId:p.id,source:COMBO_NAMES.vwap+' · 确认加仓'});p.adds++;event(s,p.symbol+' VWAP确认加仓 '+qty+' 股');}catch(e){event(s,'VWAP加仓跳过：'+e.message);}}
  }
 }
 for(const name of COMBOS){
  const cfg=s.comboConfig[name],bars=currentBars(s,cfg.symbol,context),last=bars.at(-1);
  const own=s.positions.find(p=>p.manager===name);s.comboStatus[name]=own?'持仓管理中 · '+own.symbol+' · 止损 '+own.stop.toFixed(2):!s.strategies[name]?'未启用':blocked?'当日风险限制：暂停新入场':!last?(s.barError?'K线请求失败：暂停新入场':'等待有效的已完成1分钟OHLCV K线'):summarize(name,bars,cfg);
  if(!s.strategies[name]||own||blocked||!last||closedThisStep.has(name+':'+cfg.symbol))continue;
  if(s.positions.some(p=>p.type==='stock'&&p.symbol===cfg.symbol)){s.comboStatus[name]='该股票已有持仓：避免重复或相反入场';continue;}
  if(name==='vwap'&&context.minute>=Math.min(cfg.flattenMinute,context.flattenMinute??385)){s.comboStatus[name]='临近收盘：停止新入场';continue;}
  if(s.comboLastBar[name]===last.timestamp)continue;s.comboLastBar[name]=last.timestamp;
  const volatility=atr(bars,cfg.atrPeriod);if(volatility===null||volatility<=0||!signalFor(name,bars,cfg))continue;
  const price=s.prices[cfg.symbol],distance=volatility*cfg.atrMultiple;
  if(distance>=price){s.comboStatus[name]='ATR距离过大，无法设定正值止损';continue;}
  const targetQty=riskQuantity({equity:equity(s),cash:s.cash,gross:exposure(s),price,distance,riskPercent:cfg.riskPercent,maxPositionPercent:cfg.maxPositionPercent,maxExposure:s.settings.maxExposure});
  const qty=name==='vwap'?Math.max(1,Math.floor(targetQty/2)):targetQty;
  if(targetQty<1){s.comboStatus[name]='风险预算、现金或敞口不足';continue;}
  try{const riskBudget=equity(s)*cfg.riskPercent/100;const p=order(s,{symbol:cfg.symbol,qty,source:COMBO_NAMES[name]});Object.assign(p,{manager:name,management:{...cfg},stop:price-distance,entryTick:s.tick,entryBar:last.timestamp,session:context.session,targetQty,riskBudget,adds:0});event(s,cfg.symbol+' '+COMBO_NAMES[name]+' 入场 '+qty+' 股，止损 '+p.stop.toFixed(2));s.comboStatus[name]='已入场 · '+qty+' 股 · 止损 '+p.stop.toFixed(2);}catch(e){s.comboStatus[name]='入场跳过：'+e.message;}
 }
}
