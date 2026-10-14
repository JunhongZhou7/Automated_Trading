const $=id=>document.getElementById(id);
const money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function api(path,body){
 const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Strategy-Studio':'1'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok){const error=Error(data.error||'Request failed.');error.status=response.status;throw error;}return data;
}
export function setupConnection({onSource,onQuotes,onFailure,maxExposure}){
 let enabled=false,polling=false,config={},account=null,accountPending=false,requestPending=false;
 let pendingSubmission=null;
 try{pendingSubmission=JSON.parse(localStorage.getItem('strategy-studio-pending-order'));}catch{}
 const keepPending=value=>{pendingSubmission=value;try{if(value)localStorage.setItem('strategy-studio-pending-order',JSON.stringify(value));else localStorage.removeItem('strategy-studio-pending-order');}catch{}};
 function orderButton(){ $('broker-submit').textContent=pendingSubmission?'Reconcile previous paper submission':'Submit to Alpaca PAPER'; }
 orderButton();
 async function refreshQuotes(){
  if(polling)return;polling=true;
  try{const data=await api('/api/quotes');const oldest=Math.max(...data.quotes.map(q=>Math.max(0,(Date.now()-Date.parse(q.timestamp))/1000)));
   $('data-status').textContent='Alpaca '+data.feed.toUpperCase()+' · latest trades '+data.quotes.map(q=>q.symbol+' '+new Date(q.timestamp).toLocaleTimeString()).join(' · ')+' · '+(data.market.open?'Market open':'Market closed')+(oldest>120?' · STALE':'');
   if(enabled)onQuotes(data);
  }catch(e){$('data-status').textContent=e.message;if(enabled)onFailure(e.message);}finally{polling=false;}
 }
 async function refreshAccount(){
  if(accountPending)return;accountPending=true;
  try{account=await api('/api/account');
   $('broker-summary').textContent='ALPACA PAPER · Equity '+money(account.account.equity)+' · Cash '+money(account.account.cash)+' · Buying power '+money(account.account.buyingPower)+' · '+(account.market.open?'Market open':'Market closed')+' · Daily return '+(account.account.lastEquity>0?((account.account.equity/account.account.lastEquity-1)*100).toFixed(2)+'%':'Unavailable');
   $('broker-positions').innerHTML=account.positions.map(p=>'<div>'+escape(p.symbol)+' · '+p.qty+' shares · Entry '+money(p.entry)+' · Mark '+money(p.mark)+' · Unrealized '+money(p.unrealizedPnl)+'</div>').join('')||'No broker positions.';
   $('broker-orders').innerHTML=account.orders.map(o=>'<tr><td>'+escape(o.symbol)+'</td><td>'+escape(o.side)+'</td><td>'+o.qty+' / '+o.filledQty+'</td><td>'+(o.filledPrice===null?'—':money(o.filledPrice))+'</td><td>'+escape(o.status)+'</td><td>'+(o.open?'<button data-cancel="'+escape(o.id)+'">Cancel</button>':'')+'</td></tr>').join('')||'<tr><td colspan="6">No broker orders.</td></tr>';
   $('broker-submit').disabled=!config.ordersEnabled||requestPending||account.account.blocked||!account.market.open;
   if(pendingSubmission&&account.orders.some(o=>o.clientOrderId===pendingSubmission.clientOrderId)){keepPending(null);orderButton();}
  }catch(e){$('broker-message').textContent=e.message;$('broker-submit').disabled=true;}finally{accountPending=false;}
 }
 $('data-source').onchange=async()=>{enabled=$('data-source').value==='alpaca';onSource(enabled);if(enabled)await refreshQuotes();else $('data-status').textContent='Synthetic prices. No market data connection.';};
 $('refresh-quotes').onclick=refreshQuotes;$('refresh-account').onclick=refreshAccount;
 $('broker-order-form').onsubmit=async e=>{e.preventDefault();if(requestPending)return;
  requestPending=true;$('broker-submit').disabled=true;
  const submission=pendingSubmission||{symbol:$('broker-symbol').value,qty:Number($('broker-qty').value),side:$('broker-side').value,maxExposure:maxExposure(),clientOrderId:'ss-'+crypto.randomUUID()};
  const clientOrderId=submission.clientOrderId;
  keepPending(submission);orderButton();
  try{const result=await api('/api/orders',submission);keepPending(null);orderButton();
   $('broker-message').textContent='Order '+result.id+' · '+result.status+' · filled '+result.filledQty+'/'+result.qty+'. Refresh to reconcile with Alpaca.';
  }catch(err){if(err.status&&err.status!==502&&err.status!==500){keepPending(null);orderButton();}$('broker-message').textContent=err.message+' Reference: '+clientOrderId+'. Refresh orders first; an ambiguous submission retains its reference for reconciliation.';}
  finally{requestPending=false;await refreshAccount();}
 };
 $('broker-orders').onclick=async e=>{const button=e.target.closest('[data-cancel]');if(!button)return;button.disabled=true;try{await api('/api/orders/cancel',{id:button.dataset.cancel});$('broker-message').textContent='Cancellation requested; refresh to confirm.';await refreshAccount();}catch(err){$('broker-message').textContent=err.message;button.disabled=false;}};
 let disposed=false;
 const timer=setInterval(()=>{if(disposed)return;if(enabled)refreshQuotes();if(account)refreshAccount();},15000);
 api('/api/config').then(c=>{config=c;$('connection-status').textContent=c.configured?'ALPACA CONFIGURED':'API KEYS REQUIRED';$('broker-message').textContent=c.ordersEnabled?'Paper order execution enabled on server.':'Read-only account access. Set ALPACA_PAPER_ORDERS=true to enable manual paper orders.';}).catch(e=>{$('connection-status').textContent='SERVER UNAVAILABLE';$('broker-message').textContent=e.message;});
 return {refreshQuotes,dispose(){disposed=true;clearInterval(timer);}};
}
