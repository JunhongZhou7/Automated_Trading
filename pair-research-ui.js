import {PAIRS,pairById} from './universe.js';
import {api} from './connection.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sourceLink(a){try{const url=new URL(a.url);if(!['https:','http:'].includes(url.protocol))return escape(a.headline);return '<a href="'+escape(url.href)+'" target="_blank" rel="noopener noreferrer">'+escape(a.headline)+'</a>';}catch{return escape(a.headline);}}
export function setupPairResearch({getState,onChange,isReal}){
 const select=document.getElementById('pair-select'),root=document.getElementById('pair-research-results'),status=document.getElementById('pair-research-status');
 let result=null,busy=false;
 select.innerHTML=PAIRS.map(p=>'<option value="'+p.id+'">'+p.a+' / '+p.b+' · '+p.name+'</option>').join('');
 const choose=id=>{const s=getState();if(!pairById(id))return;if(s.pair){status.textContent='已有配对仓位：先平掉两条腿，再选择新的交易对。';render();return;}s.selectedPair=id;onChange();status.textContent='已选择 '+id+'。选择不会直接下单；开启配对策略后，仍等待分钟级价差信号。';};
 select.onchange=()=>choose(select.value);
 function renderResult(){
  if(!result)return;
  const stale=Date.now()>Date.parse(result.expiresAt),provider=result.provider==='semantic'?'语言模型语义NLP':'本地英文关键词NLP（非语言模型）';
  document.getElementById('pair-research-meta').textContent=provider+' · Alpaca '+result.feed.toUpperCase()+' · 最近7天新闻 · '+new Date(result.generatedAt).toLocaleString()+(result.newsTruncated?' · 新闻数量已截断，非完整覆盖':'')+(stale?' · 分析已过期，请刷新':'');
  root.innerHTML=result.rows.map((row,i)=>'<article class="research-row"><div class="panel-head"><div><h3>'+escape(row.pair.a)+' / '+escape(row.pair.b)+'</h3><p>'+escape(row.pair.name)+'</p></div><span class="tag">'+(stale?'已过期':row.eligible?'可优先研究':'需人工排查')+' · '+(row.score===null?'数据不足':row.score+'/100')+'</span></div><p><b>价格：</b>'+(row.metrics.ready?'对齐日K线 '+row.metrics.observations+' 根 · 价格截止 '+escape(new Date(row.metrics.asOf).toLocaleDateString())+' · OLS β '+row.metrics.beta.toFixed(2):escape(row.metrics.reason))+'</p><p><b>文本：</b>'+[row.pair.a,row.pair.b].map(symbol=>escape(symbol)+' 情绪 '+(row.nlp.assets[symbol].articleCount?row.nlp.assets[symbol].sentiment.toFixed(2):'未知')+' / 可用新闻 '+row.nlp.assets[symbol].articleCount).join('；')+'</p><ul>'+row.reasons.map(reason=>'<li>'+escape(reason)+'</li>').join('')+'</ul><p class="note">'+escape(row.nlp.reason)+' '+escape(row.nlp.limitations)+'</p><details><summary>新闻依据与出处（'+row.articles.length+'篇）</summary>'+row.articles.map(a=>'<div class="news-item">'+sourceLink(a)+'<small>'+escape(a.source)+' · '+escape(new Date(a.publishedAt).toLocaleString())+' · '+escape(a.symbols.join(', '))+(row.nlp.evidenceIds.includes(a.id)?' · NLP引用':'')+'</small><p>'+escape(a.summary)+'</p></div>').join('')+'</details><button data-select-pair="'+escape(row.pair.id)+'" '+(stale||getState().pair?'disabled':'')+'>选择此交易对'+(row.eligible?'':'（研究观察）')+'</button></article>').join('');
 }
 async function analyze(){
  if(busy)return;busy=true;const button=document.getElementById('analyze-pairs');button.disabled=true;status.textContent='正在获取真实日K线与新闻并分析；不会使用Synthetic价格进行排名…';
  try{result=await api('/api/pair-analysis',undefined,120000);renderResult();status.textContent='排名仅供研究，由你选择交易对；不自动下单。'+(isReal()?'':'当前交易界面仍为Synthetic；请选择Alpaca真实行情后再验证市场信号。');}
  catch(e){result=null;root.innerHTML='';document.getElementById('pair-research-meta').textContent='未取得有效分析';status.textContent=e.message+' 未使用模拟新闻或随机价格补充排名。';}
  finally{busy=false;button.disabled=false;}
 }
 root.onclick=e=>{const button=e.target.closest('[data-select-pair]');if(!button)return;if(!result||Date.now()>Date.parse(result.expiresAt)){status.textContent='分析已过期，请重新分析。';return;}choose(button.dataset.selectPair);};
 document.getElementById('analyze-pairs').onclick=analyze;
 function render(){select.value=getState().selectedPair;select.disabled=Boolean(getState().pair);document.getElementById('pair-current').textContent=(getState().pair?'持仓交易对：'+getState().pair.pairId:'当前交易对：'+getState().selectedPair)+(isReal()?' · 真实行情 / 本地模拟成交':' · Synthetic随机行情 / 仅验证机制');renderResult();}
 return {render};
}
