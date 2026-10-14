// Curated research candidates, not an assertion that these pairs are cointegrated.
export const PAIRS=[
 {id:'AAPL-MSFT',a:'AAPL',b:'MSFT',name:'Apple / Microsoft',sector:'大型科技'},
 {id:'PEP-KO',a:'PEP',b:'KO',name:'PepsiCo / Coca-Cola',sector:'饮料与消费品'},
 {id:'V-MA',a:'V',b:'MA',name:'Visa / Mastercard',sector:'支付网络'},
 {id:'XOM-CVX',a:'XOM',b:'CVX',name:'Exxon Mobil / Chevron',sector:'综合能源'},
 {id:'JPM-BAC',a:'JPM',b:'BAC',name:'JPMorgan Chase / Bank of America',sector:'大型银行'},
 {id:'WMT-COST',a:'WMT',b:'COST',name:'Walmart / Costco',sector:'零售'},
 {id:'HD-LOW',a:'HD',b:'LOW',name:'Home Depot / Lowe’s',sector:'家居建材零售'},
 {id:'UPS-FDX',a:'UPS',b:'FDX',name:'UPS / FedEx',sector:'快递物流'},
 {id:'MCD-YUM',a:'MCD',b:'YUM',name:'McDonald’s / Yum! Brands',sector:'连锁餐饮'},
 {id:'GOOGL-META',a:'GOOGL',b:'META',name:'Alphabet / Meta',sector:'数字广告'}
];
export const WATCH_SYMBOLS=['AAPL','MSFT','SPY','QQQ'];
export const CORE_SYMBOLS=[...WATCH_SYMBOLS,'PEP','KO'];
export const SYMBOLS=[...new Set([...CORE_SYMBOLS,...PAIRS.flatMap(p=>[p.a,p.b])])];
export const INITIAL_PRICES={AAPL:190,MSFT:420,SPY:550,QQQ:480,PEP:160,KO:70,V:280,MA:500,XOM:110,CVX:150,JPM:220,BAC:40,WMT:80,COST:900,HD:400,LOW:260,UPS:130,FDX:280,MCD:300,YUM:140,GOOGL:170,META:580};
export const COMPANY_NAMES={AAPL:'Apple Inc.',MSFT:'Microsoft Corp.',SPY:'S&P 500 ETF',QQQ:'Nasdaq 100 ETF',PEP:'PepsiCo',KO:'The Coca-Cola Company',V:'Visa',MA:'Mastercard',XOM:'Exxon Mobil',CVX:'Chevron',JPM:'JPMorgan Chase',BAC:'Bank of America',WMT:'Walmart',COST:'Costco',HD:'Home Depot',LOW:'Lowe’s',UPS:'UPS',FDX:'FedEx',MCD:'McDonald’s',YUM:'Yum! Brands',GOOGL:'Alphabet',META:'Meta Platforms'};
export function pairById(id){return PAIRS.find(pair=>pair.id===id);}
export function requiredMarketSymbols(s,extra=[]){
 const pairs=[pairById(s.selectedPair||'AAPL-MSFT'),pairById(s.pair?.pairId)].filter(Boolean);
 return [...new Set([...WATCH_SYMBOLS,...pairs.flatMap(p=>[p.a,p.b]),...s.positions.map(p=>p.symbol),...Object.entries(s.comboConfig||{}).filter(([name])=>s.strategies[name]).map(([,cfg])=>cfg.symbol),...extra])].filter(symbol=>SYMBOLS.includes(symbol));
}
export function hydrateUniverse(s){
 for(const symbol of SYMBOLS)if(!Number.isFinite(s.prices[symbol]))s.prices[symbol]=INITIAL_PRICES[symbol];
 s.selectedPair=pairById(s.selectedPair)?.id||'AAPL-MSFT';
 if(s.pair&&!s.pair.pairId)s.pair.pairId='AAPL-MSFT';
 return s;
}
