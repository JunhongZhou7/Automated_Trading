import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const files = new Map(['index.html','app.js','engine.js','style.css'].map(f => ['/'+f, f]));
const types = { html:'text/html', js:'text/javascript', css:'text/css' };
const server = http.createServer(async (req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = files.get(pathname === '/' ? '/index.html' : pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try { const body = await readFile(fileURLToPath(new URL(file,import.meta.url))); res.writeHead(200, {'Content-Type':types[file.split('.').pop()], 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(body); }
  catch { res.writeHead(500); res.end('Unable to read application file'); }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log('Strategy Studio listening on port '+server.address().port));
