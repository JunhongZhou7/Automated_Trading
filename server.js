import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createBroker} from './brokers/index.js';
import {PaperService} from './broker-service.js';
import {SYMBOLS} from './engine.js';
const files=new Map(['index.html','app.js','engine.js','style.css','connection.js'].map(f=>['/'+f,f]));
const types={html:'text/html',js:'text/javascript',css:'text/css'};
export function createServer({broker=createBroker(),ordersEnabled=process.env.ALPACA_PAPER_ORDERS==='true'}={}){
 const service=new PaperService(broker);
 return http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try {
   if(url.pathname.startsWith('/api/')){
    // Same-origin checks also protect localhost credentials from cross-site browser requests.
    const origin=req.headers.origin,host=req.headers.host;
    if(req.headers['sec-fetch-site']==='cross-site'||origin&&new URL(origin).host!==host){json(403,{error:'Cross-origin API requests are forbidden.'});return;}
    if(req.method==='GET'&&url.pathname==='/api/config'){json(200,{provider:'alpaca',mode:'paper',configured:broker.configured||false,feed:broker.feed,ordersEnabled,capabilities:broker.capabilities,brokers:[{id:'alpaca',available:true},{id:'ibkr',available:false}]});return;}
    if(req.method==='GET'&&url.pathname==='/api/quotes'){const [data,market]=await Promise.all([broker.quotes(SYMBOLS),broker.marketClock()]);json(200,{...data,market});return;}
    if(req.method==='GET'&&url.pathname==='/api/account'){json(200,await broker.snapshot());return;}
    if(req.method==='POST'&&(url.pathname==='/api/orders'||url.pathname==='/api/orders/cancel')){
     if(!ordersEnabled){json(403,{error:'Set ALPACA_PAPER_ORDERS=true on the server to enable broker paper orders.'});return;}
     if(!req.headers['content-type']?.startsWith('application/json')||req.headers['x-strategy-studio']!=='1'){json(400,{error:'A same-origin JSON request is required.'});return;}
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192){json(413,{error:'Request too large.'});return;}}
     let input;try{input=JSON.parse(raw);}catch{json(400,{error:'Invalid JSON.'});return;}
     if(!input||typeof input!=='object'){json(400,{error:'Invalid request.'});return;}
     if(url.pathname==='/api/orders/cancel'){if(!/^[a-zA-Z0-9-]{1,64}$/.test(input.id||'')){json(400,{error:'Invalid order ID.'});return;}await broker.cancelOrder(input.id);json(200,{status:'cancel_requested'});}
     else json(200,await service.submit(input));return;
    }
    json(404,{error:'API route not found.'});return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
   const file=files.get(url.pathname==='/'?'/index.html':url.pathname);
   if(!file){res.writeHead(404);res.end('Not found');return;}
   const body=await readFile(fileURLToPath(new URL(file,import.meta.url)));
   res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
  }catch(error){if(url.pathname.startsWith('/api/'))json(error.status||500,{error:error.status?error.message:'Internal server error.'});else{res.writeHead(500);res.end('Unable to read application file');}}
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const server=createServer();server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Strategy Studio listening on port '+server.address().port));
}
