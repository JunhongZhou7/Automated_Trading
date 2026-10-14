import {BrokerError} from './brokers/base.js';
import {SYMBOLS} from './engine.js';
const closingStatuses=new Set(['filled','canceled','expired','rejected','replaced','done_for_day']);
export class PaperService {
 constructor(broker){this.broker=broker;this.busy=false;}
 async submit(input){
  if(this.busy)throw new BrokerError('Another order is being checked. Retry after refreshing the account.',409);
  this.busy=true;
  try {
   const {symbol,qty,side,clientOrderId,maxExposure=50}=input;
   if(!SYMBOLS.includes(symbol)||!Number.isInteger(qty)||qty<1||qty>100000||!['buy','sell','short','cover'].includes(side)||!Number.isFinite(maxExposure)||maxExposure<1||maxExposure>100||!/^ss-[a-zA-Z0-9-]{8,40}$/.test(clientOrderId||''))throw new BrokerError('Invalid stock order or client order ID.',400);
   const account=await this.broker.snapshot();
   // The same ID can be retried safely even after an ambiguous response. Never retry with a new ID automatically.
   const existing=account.orders.find(o=>o.clientOrderId===clientOrderId);
   if(existing){if(existing.symbol!==symbol||existing.qty!==qty||existing.side!==(side==='buy'||side==='cover'?'buy':'sell'))throw new BrokerError('Client order ID already belongs to a different order.',409);return existing;}
   if(account.account.blocked||account.account.status!=='ACTIVE')throw new BrokerError('Paper account cannot trade.',409);
   if(!account.market.open)throw new BrokerError('Market is closed. This interface does not queue market orders outside regular hours.',409);
   if(account.orders.some(o=>!closingStatuses.has(o.status)))throw new BrokerError('Pending paper orders exist. Wait for fills or cancel them before placing another order.',409);
   const p=account.positions.find(p=>p.symbol===symbol),current=p?.qty||0;
   if(side==='sell'&&(current<=0||qty>current)||side==='cover'&&(current>=0||qty>-current))throw new BrokerError('Closing quantity exceeds the broker position.',400);
   if(side==='buy'&&current<0||side==='short'&&current>0)throw new BrokerError('Use cover or sell to close an opposing position first.',400);
   const {quotes}=await this.broker.quotes([symbol]);const quote=quotes[0];
   if(quote.ageSeconds>120)throw new BrokerError('Quote is older than two minutes. Order blocked until fresh data is available.',409);
   const cost=qty*quote.price;
   if(side==='buy'||side==='short'){
    const gross=account.positions.reduce((sum,p)=>sum+Math.abs(p.marketValue),0);
    if(gross+cost>account.account.equity*maxExposure/100)throw new BrokerError('Order exceeds the gross exposure limit.',409);
    if(cost>account.account.buyingPower||side==='buy'&&cost>account.account.cash)throw new BrokerError('Insufficient paper buying power or cash.',409);
   }
   return await this.broker.submitOrder({symbol,qty,side:side==='buy'||side==='cover'?'buy':'sell',clientOrderId});
  } finally {this.busy=false;}
 }
}
