import {createState,SYMBOLS,step,equity,exposure,mark,order,closePosition,zScore} from './engine.js';
const $=id=>document.getElementById(id),money=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
let state=createState(),timer=null;
try{const saved=JSON.parse(localStorage.getItem('strategy-studio-v1'));if(saved?.version===1&&Array.isArray(saved.positions))state=saved;}catch{}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){try{localStorage.setItem('strategy-studio-v1',JSON.stringify(state));}catch{$('message').textContent='Browser storage unavailable; this session will not persist.';}}
function render(){
  const value=equity(state),gain=value-state.initial;
  $('equity').textContent=money(value);$('cash').textContent=money(state.cash);$('return').textContent=(gain>=0?'+':'')+(gain/state.initial*100).toFixed(2)+'%';$('return').className=gain>=0?'positive':'negative';$('pnl').textContent=money(gain)+' since simulation start';$('exposure').textContent=(exposure(state)/value*100).toFixed(1)+'%';$('risk-label').textContent=state.settings.maxExposure+'% limit for new orders';
  $('clock').textContent='Simulation · minute '+state.tick;$('enabled').textContent=Object.values(state.strategies).filter(Boolean).length+' STRATEGIES ENABLED';
  $('pairs').checked=state.strategies.pairs;$('ladder').checked=state.strategies.ladder;
  for(const key of ['entryZ','exitZ','stopZ','maxExposure'])if(document.activeElement!==$(key))$(key).value=state.settings[key];
  const z=zScore(state);$('zscore').textContent=z===null?'Warming up ('+Math.min(state.history.length,30)+'/30)':z.toFixed(2)+(state.pair?' · pair open':'');
  $('quotes').innerHTML=SYMBOLS.map(symbol=>'<div class="quote"><div><b>'+symbol+'</b><small>'+({AAPL:'Apple Inc.',MSFT:'Microsoft Corp.',SPY:'S&P 500 ETF',QQQ:'Nasdaq 100 ETF'}[symbol])+'</small></div><strong>'+money(state.prices[symbol])+'</strong></div>').join('');
  const curve=state.curve,low=Math.min(...curve),high=Math.max(...curve),pad=Math.max(20,(high-low)*.15),min=low-pad,max=high+pad;
  const points=curve.map((n,i)=>[(i/Math.max(1,curve.length-1)*800).toFixed(2),(205-(n-min)/(max-min)*180).toFixed(2)]);
  const path=points.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ');
  $('chart').innerHTML='<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2ca083" stop-opacity=".18"/><stop offset="1" stop-color="#2ca083" stop-opacity="0"/></linearGradient></defs>'+[30,90,150,210].map(y=>'<path d="M0 '+y+' H800" stroke="#edf1f4" stroke-dasharray="4 5"/>').join('')+'<path d="'+path+' L800 225 L0 225 Z" fill="url(#fill)"/><path d="'+path+'" fill="none" stroke="#238c71" stroke-width="2.5"/>';
  $('chart-range').textContent=money(low)+' – '+money(high);$('position-count').textContent=state.positions.length+' OPEN';
  $('position-rows').innerHTML=state.positions.length?state.positions.map(p=>{const price=mark(state,p),pnl=(price-p.entry)*p.qty*(p.type==='stock'?1:100);return '<tr><td><b>'+p.symbol+' '+p.type.toUpperCase()+'</b><small>'+escape(p.source)+(p.type!=='stock'?' · strike '+p.strike+' · expires m'+p.expiry:'')+'</small></td><td>'+p.qty+'</td><td>'+money(p.entry)+'</td><td>'+money(price)+'</td><td class="'+(pnl>=0?'positive':'negative')+'">'+money(pnl)+'</td><td><button data-close="'+p.id+'">'+(p.group?'Close pair':'Close')+'</button></td></tr>';}).join(''):'<tr><td class="empty" colspan="6">Your next idea starts here. Place an order or enable pairs trading.</td></tr>';
  $('trade-rows').innerHTML=state.trades.length?state.trades.slice(0,50).map(t=>'<tr><td>'+t.tick+'</td><td><b>'+t.symbol+'</b> '+t.type+'</td><td>'+t.side.toUpperCase()+'</td><td>'+t.qty+'</td><td>'+money(t.price)+'</td><td>'+escape(t.source)+'</td></tr>').join(''):'<tr><td colspan="6" class="empty">No trades yet.</td></tr>';
  $('events').innerHTML=state.events.map(e=>'<div>m'+e.tick+' · '+escape(e.message)+'</div>').join('')||'No strategy events yet.';persist();
}
function renderRules(){$('rules').innerHTML=state.rules.map((r,i)=>'<label class="rule"><input type="number" aria-label="Rule '+(i+1)+' price change percent" data-rule="'+i+'" value="'+r.threshold+'" min="-99" max="1000" step="1"><span>% → '+(r.action==='hold'?'hold':r.action+' '+r.percent+'%')+'</span></label>').join('');}
function tick(n=1){try{for(let i=0;i<n;i++)step(state);render();}catch(e){pause();$('message').textContent=e.message;}}
function pause(){clearInterval(timer);timer=null;$('run').textContent='▶ Run simulation';}
function run(){timer=setInterval(()=>tick(),Number($('speed').value));$('run').textContent='Ⅱ Pause simulation';}
$('run').onclick=()=>timer?pause():run();$('advance').onclick=()=>tick(30);$('speed').onchange=()=>{if(timer){pause();run();}};
$('reset').onclick=()=>{if(confirm('Reset simulated positions, trades, and returns to $100,000?')){pause();state=createState();renderRules();render();}};
for(const name of ['pairs','ladder'])$(name).onchange=()=>{state.strategies[name]=$(name).checked;render();};
for(const name of ['entryZ','exitZ','stopZ','maxExposure'])$(name).onchange=()=>{const next=Number($(name).value),settings={...state.settings,[name]:next};if(!$(name).checkValidity()||!(settings.exitZ<settings.entryZ&&settings.entryZ<settings.stopZ)){$('message').textContent='Use exit < entry < stop and valid risk limits.';$(name).value=state.settings[name];return;}state.settings=settings;render();};
$('rules').onchange=e=>{const i=Number(e.target.dataset.rule);if(!Number.isInteger(i)||!e.target.checkValidity())return;state.rules[i].threshold=Number(e.target.value);$('message').textContent='Threshold updated. Already-fired rules remain fired for existing positions.';persist();};
$('instrument').onchange=()=>{$('side').value='buy';$('side').disabled=$('instrument').value!=='stock';};
$('order-form').onsubmit=e=>{e.preventDefault();try{order(state,{symbol:$('symbol').value,type:$('instrument').value,side:$('side').value,qty:Number($('quantity').value)});state.curve.push(equity(state));$('message').textContent='Paper order filled. No order sent to a broker.';render();}catch(err){$('message').textContent=err.message;}};
$('position-rows').onclick=e=>{const button=e.target.closest('[data-close]');if(!button)return;const p=state.positions.find(x=>x.id===Number(button.dataset.close));if(!p)return;try{const trial=structuredClone(state);for(const position of [...trial.positions].filter(x=>p.group?x.group===p.group:x.id===p.id))closePosition(trial,position);if(p.group)trial.pair=null;state=trial;state.curve.push(equity(state));render();$('message').textContent='Position closed.';}catch(err){$('message').textContent=err.message;}};
renderRules();render();
