export const SYMBOLS=['AAPL','MSFT','SPY','QQQ','PEP','KO'];
export const INITIAL_PRICES={AAPL:190,MSFT:420,SPY:550,QQQ:480,PEP:160,KO:70};
export const COMPANY_NAMES={AAPL:'Apple Inc.',MSFT:'Microsoft Corp.',SPY:'S&P 500 ETF',QQQ:'Nasdaq 100 ETF',PEP:'PepsiCo',KO:'The Coca-Cola Company'};
export const PAIRS=[{id:'AAPL-MSFT',a:'AAPL',b:'MSFT',name:'Apple / Microsoft'},{id:'PEP-KO',a:'PEP',b:'KO',name:'PepsiCo / Coca-Cola'}];
export function pairById(id){return PAIRS.find(pair=>pair.id===id);}
export function hydrateUniverse(s){
 for(const symbol of SYMBOLS)if(!Number.isFinite(s.prices[symbol]))s.prices[symbol]=INITIAL_PRICES[symbol];
 s.selectedPair=pairById(s.selectedPair)?.id||'AAPL-MSFT';
 // Prior saved positions belonged to the original AAPL/MSFT pair.
 if(s.pair&&!s.pair.pairId)s.pair.pairId='AAPL-MSFT';
 return s;
}
