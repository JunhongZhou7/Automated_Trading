import {COMBOS,COMBO_NAMES} from './strategies.js';
const symbols=['AAPL','MSFT','SPY','QQQ'];
const specs={
 trend:{icon:'↗',category:'TREND FOLLOWING + VOLATILITY SIZING',scenario:'持续上涨趋势、突破后延续的行情；可研究日内或较长持仓。当前信号使用1分钟K线。',risk:'横盘时容易假突破、连续止损；跳空可能使亏损超过预算。',entry:'收盘价突破此前N根K线的最高价；当前K线不计入通道。',management:'ATR × 2设定初始止损距离；按单笔风险预算定仓，跌破退出通道或止损时平仓。',defaults:'ATR周期14 · 默认突破20根 / 退出10根 · 不补仓',fields:[['entryLookback','突破窗口',5,100,1],['exitLookback','退出窗口',2,100,1]]},
 vwap:{icon:'≋',category:'INTRADAY REVERSION + LIMITED SCALING',scenario:'高流动性股票或ETF的日内震荡、偏离均价后的反弹。',risk:'单边下跌时均价回归可能失效；IEX成交量只覆盖单一交易所，VWAP不等于全市场VWAP。',entry:'上一根K线明显低于当日VWAP波动带，当前收盘开始回升且仍低于VWAP时入场。',management:'先买目标仓位约50%；价格确认回升后最多加仓一次，不向下补仓。ATR止损、回到VWAP退出，正常日15:55纽约时间尝试平仓，提前收盘日相应提前。',defaults:'ATR周期14 · 默认偏离1.5个成交量加权标准差 · 仅正常交易时段',fields:[['deviation','偏离倍数',0.5,4,0.1],['maxAdds','最多加仓次数',0,1,1]]},
 rsi:{icon:'⌁',category:'MOMENTUM REVERSION + TIME STOP',scenario:'震荡市场、短期超卖后出现恢复的行情。',risk:'强下跌趋势可能持续超卖；与配对策略同属均值回归思路，分散效果需回测。',entry:'RSI先低于超卖阈值，再向上穿过阈值时买入；不因RSI低就直接买。',management:'ATR × 2定止损和股数；RSI达到目标、触及止损或达到最大持仓样本数时退出。',defaults:'RSI周期14 · 默认30回升入场 / 60退出 · 最多30个推进样本 · 不补仓',fields:[['oversold','超卖阈值',5,50,1],['target','RSI退出目标',50,95,1],['maxHold','最长持仓样本',1,390,1]]}
};
function numberField(name,key,label,min,max,step){return '<label>'+label+'<input data-combo="'+name+'" data-setting="'+key+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" required></label>';}
export function setupCombinationsUI(getState,onChange){
 const root=document.getElementById('combo-cards');
 root.innerHTML=COMBOS.map(name=>{const spec=specs[name];return '<article class="panel strategy"><div class="strategy-top"><span class="icon">'+spec.icon+'</span><label class="switch"><input aria-label="启用'+COMBO_NAMES[name]+'" type="checkbox" data-enable="'+name+'"><span></span></label></div><span class="eyebrow">'+spec.category+'</span><h3>'+COMBO_NAMES[name]+'</h3><div class="scenario"><b>适用场景</b><p>'+spec.scenario+'</p><b>主要风险</b><p>'+spec.risk+'</p></div><p><b>入场：</b>'+spec.entry+'</p><p><b>仓位与退出：</b>'+spec.management+'</p><div class="signal"><span>运行状态</span><strong id="status-'+name+'">未启用</strong></div><div class="fields"><label>交易标的<select data-combo="'+name+'" data-setting="symbol">'+symbols.map(symbol=>'<option>'+symbol+'</option>').join('')+'</select></label>'+numberField(name,'riskPercent','单笔风险 (%)',0.1,2,0.1)+numberField(name,'maxPositionPercent','最大仓位 (%)',1,50,1)+'</div><div class="fields">'+spec.fields.map(f=>numberField(name,...f)).join('')+'</div><small>'+spec.defaults+'<br>需要已完成的1分钟OHLCV K线；仅本地研究账户执行。修改参数用于下次入场；当前持仓继续使用入场时的管理参数。</small></article>';}).join('');
 root.onchange=e=>{
  const s=getState(),enable=e.target.dataset.enable;
  if(enable){s.strategies[enable]=e.target.checked;onChange();return;}
  const {combo,setting}=e.target.dataset;if(!COMBOS.includes(combo))return;
  const previous=s.comboConfig[combo][setting],next=setting==='symbol'?e.target.value:Number(e.target.value);
  const cfg={...s.comboConfig[combo],[setting]:next};
  if(!e.target.checkValidity()||setting==='symbol'&&!symbols.includes(next)||combo==='rsi'&&cfg.oversold>=cfg.target||combo==='trend'&&cfg.exitLookback>cfg.entryLookback){e.target.value=previous;document.getElementById('message').textContent='请使用有效参数：退出窗口不能大于突破窗口，RSI退出目标必须高于超卖阈值。';return;}
  s.comboConfig[combo]=cfg;onChange();
 };
 const daily=document.getElementById('daily-loss-limit');
 daily.onchange=()=>{if(daily.checkValidity()){getState().dailyLossPercent=Number(daily.value);onChange();}else daily.value=getState().dailyLossPercent;};
 return {render(){const s=getState();for(const input of root.querySelectorAll('[data-enable]'))input.checked=s.strategies[input.dataset.enable];for(const input of root.querySelectorAll('[data-setting]'))if(document.activeElement!==input)input.value=s.comboConfig[input.dataset.combo][input.dataset.setting];for(const name of COMBOS){const own=s.positions.find(p=>p.manager===name);document.getElementById('status-'+name).textContent=own?'持仓管理 · '+own.symbol+' · 止损 '+own.stop.toFixed(2)+(s.strategies[name]?'':' · 新入场已关闭'):!s.strategies[name]?'未启用':s.barError?'K线不可用：暂停新入场':s.comboStatus[name]||'等待K线 / 信号';}if(document.activeElement!==daily)daily.value=s.dailyLossPercent;document.getElementById('daily-risk-status').textContent=s.riskSession?.halted?'已触发：本交易时段暂停三组新入场，退出仍有效':'只限制三组新组合的入场和VWAP加仓；原有配对与百分比规则不受此限制';}};
}
