#!/usr/bin/env node
// Serves dist/ on http://localhost:8080 (localhost counts as a secure context, so the camera works). Usage: npm run build && npm run serve
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'dist'), port = +process.env.PORT || 8080;
http.createServer((req, res) => {
  const name = req.url.split('?')[0] === '/' ? 'index.html' : path.basename(req.url.split('?')[0]);
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log('http://localhost:' + port + '/   (index.html = the page, test.html = the page with test hooks)'));
