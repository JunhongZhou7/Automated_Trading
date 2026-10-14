import {Broker,BrokerError} from './base.js';
export const PAPER_URL='https://paper-api.alpaca.markets';
export const DATA_URL='https://data.alpaca.markets';
const terminal=new Set(['filled','canceled','expired','rejected','replaced','done_for_day']);
function number(value){const n=Number(value);if(!Number.isFinite(n))throw new BrokerError('Alpaca returned an invalid number.');return n;}
export function normalizeOrder(o){return {id:o.id,clientOrderId:o.client_order_id,symbol:o.symbol,side:o.side,qty:number(o.qty),filledQty:number(o.filled_qty),filledPrice:o.filled_avg_price===null||o.filled_avg_price===undefined?null:number(o.filled_avg_price),status:o.status,submittedAt:o.submitted_at,open:!terminal.has(o.status)};}
export class AlpacaBroker extends Broker {
  constructor({key=process.env.ALPACA_API_KEY,secret=process.env.ALPACA_SECRET_KEY,feed=process.env.ALPACA_DATA_FEED||'iex',fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){super();this.key=key;this.secret=secret;this.feed=feed;this.fetch=fetchImpl;this.now=now;if(!['iex','sip'].includes(feed))throw new BrokerError('ALPACA_DATA_FEED must be iex or sip.',400);}
  get configured(){return Boolean(this.key&&this.secret);}
  get capabilities(){return {marketData:true,paperOrders:true,options:false,automatedExecution:false};}
  async request(base,path,{method='GET',body}={}){
    if(!this.configured)throw new BrokerError('Set ALPACA_API_KEY and ALPACA_SECRET_KEY on the server using Alpaca paper credentials.',503);
    let response;
    try{response=await this.fetch(base+path,{method,headers:{'APCA-API-KEY-ID':this.key,'APCA-API-SECRET-KEY':this.secret,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw new BrokerError('Alpaca request timed out or could not connect. Check network access. Order submission failures may be ambiguous; refresh orders before retrying.',502);}
    if(!response.ok){const messages={401:'Alpaca authentication failed. Check paper credentials.',403:'Alpaca denied access. Check account permissions, data subscription, and network policy.',404:'Alpaca resource not found.',422:'Alpaca rejected the order parameters or account eligibility.',429:'Alpaca rate limit reached. Wait before retrying.'};throw new BrokerError(messages[response.status]||'Alpaca request failed ('+response.status+').',messages[response.status]?response.status:502);}
    if(response.status===204)return null;
    try{return await response.json();}catch{throw new BrokerError('Alpaca returned an unreadable response.');}
  }
  async quotes(symbols){
    const result=await this.request(DATA_URL,'/v2/stocks/trades/latest?symbols='+encodeURIComponent(symbols.join(','))+'&feed='+this.feed);
    const quotes=symbols.map(symbol=>{const t=result.trades?.[symbol];if(!t||!Number.isFinite(Date.parse(t.t))||number(t.p)<=0)throw new BrokerError('Missing or invalid quote for '+symbol+'. No synthetic fallback is used.');return {symbol,price:number(t.p),timestamp:t.t,ageSeconds:Math.max(0,(this.now()-Date.parse(t.t))/1000)};});
    return {provider:'alpaca',feed:this.feed,receivedAt:new Date(this.now()).toISOString(),quotes};
  }
  async snapshot(){
    const [a,positions,orders,clock]=await Promise.all([
      this.request(PAPER_URL,'/v2/account'),this.request(PAPER_URL,'/v2/positions'),this.request(PAPER_URL,'/v2/orders?status=all&limit=100&direction=desc'),this.request(PAPER_URL,'/v2/clock')
    ]);
    return {provider:'alpaca',mode:'paper',account:{equity:number(a.equity),cash:number(a.cash),buyingPower:number(a.buying_power),lastEquity:number(a.last_equity),status:a.status,blocked:Boolean(a.trading_blocked)},market:{open:clock.is_open,nextOpen:clock.next_open,nextClose:clock.next_close},positions:positions.map(p=>({symbol:p.symbol,qty:number(p.qty),entry:number(p.avg_entry_price),mark:number(p.current_price),marketValue:number(p.market_value),unrealizedPnl:number(p.unrealized_pl)})),orders:orders.map(normalizeOrder)};
  }
  async bars(symbols){
    const now=this.now(),start=new Date(now-86400000).toISOString(),end=new Date(now).toISOString();
    const result=await this.request(DATA_URL,'/v2/stocks/bars?symbols='+encodeURIComponent(symbols.join(','))+'&timeframe=1Min&start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end)+'&limit=10000&adjustment=raw&feed='+this.feed);
    if(result.next_page_token)throw new BrokerError('Alpaca bar response is incomplete; no strategy entry will use partial data.');
    const bars={};
    for(const symbol of symbols){bars[symbol]=(result.bars?.[symbol]||[]).map(b=>({timestamp:b.t,open:number(b.o),high:number(b.h),low:number(b.l),close:number(b.c),volume:number(b.v)})).filter(b=>Number.isFinite(Date.parse(b.timestamp))&&Date.parse(b.timestamp)+60000<=now).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));}
    return {provider:'alpaca',feed:this.feed,timeframe:'1Min',receivedAt:end,bars};
  }
  async marketClock(){const c=await this.request(PAPER_URL,'/v2/clock');return {open:c.is_open,nextOpen:c.next_open,nextClose:c.next_close};}
  async submitOrder({symbol,qty,side,clientOrderId}){
    const result=await this.request(PAPER_URL,'/v2/orders',{method:'POST',body:{symbol,qty:String(qty),side,type:'market',time_in_force:'day',client_order_id:clientOrderId}});
    return normalizeOrder(result);
  }
  async cancelOrder(id){await this.request(PAPER_URL,'/v2/orders/'+encodeURIComponent(id),{method:'DELETE'});}
}
