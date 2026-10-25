// A small stand-in for a Firebase Realtime Database, so the console can be tested without the network.
// It speaks the same REST dialect the page uses (GET/PUT/PATCH/POST/DELETE on /path.json, and GET with
// Accept: text/event-stream for streaming), fills in {".sv":"timestamp"}, and enforces the same permission and
// validation rules as docs/console-plan.md (ids of the right length, no listing, no unknown keys).
//   const fake = await startFake();   fake.url   fake.db   fake.requests   fake.kick()   fake.setOffline(true)   fake.skew = 5000
const http = require('http');

const ROOM_KEYS = new Set(['state', 'cmd', 'ack', 'hb', 'want', 'preview', 'shots', 'stats']);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const sv = (v, now) => {                          // replace server-value placeholders with the time
  if (isObj(v)) { if (v['.sv'] === 'timestamp') return now; const o = {}; for (const k in v) o[k] = sv(v[k], now); return o; }
  return v;
};
function prune(v) {                               // objects with no children do not exist in the database
  if (!isObj(v)) return v;
  for (const k of Object.keys(v)) { v[k] = prune(v[k]); if (v[k] === null || v[k] === undefined) delete v[k]; }
  return Object.keys(v).length ? v : null;
}

function allowed(parts, write, value) {            // returns null if allowed, otherwise the reason
  if (parts.length < 2) return 'no access above a pairing code or a room';
  const [top, id] = parts;
  if (top === 'pair') {
    if (id.length !== 8) return 'pairing code must be 8 characters';
    if (!write) return null;
    if (parts.length > 2) return 'pairing codes hold {room, exp} only';
    if (value === null) return null;
    if (!isObj(value) || typeof value.room !== 'string' || value.room.length !== 20 || value.exp === undefined) return 'pair needs a 20 character room and exp';
    if (Object.keys(value).some(k => k !== 'room' && k !== 'exp')) return 'unknown key in pair';
    return null;
  }
  if (top === 'rooms') {
    if (id.length !== 20) return 'room id must be 20 characters';
    if (!write) return null;
    if (parts.length === 2) {
      if (value === null) return null;
      if (!isObj(value) || Object.keys(value).some(k => !ROOM_KEYS.has(k))) return 'unknown key in room';
      return null;
    }
    if (!ROOM_KEYS.has(parts[2])) return 'unknown key ' + parts[2];
    if (parts[2] === 'preview' && value !== null && (typeof value !== 'string' || value.length >= 120000)) return 'preview must be a string under 120000 characters';
    if (parts[2] === 'cmd' && parts.length === 4 && value !== null && (!isObj(value) || value.type === undefined || value.ts === undefined)) return 'cmd needs type and ts';
    if (parts[2] === 'state' && parts.length === 3 && value !== null && !isObj(value)) return 'state needs children';
    if (parts[2] === 'stats' && parts.length === 3 && value !== null && !isObj(value)) return 'stats needs children';
    if (parts[2] === 'shots' && parts.length === 4 && value !== null && (!isObj(value) || value.n === undefined || value.title === undefined || (value.img !== undefined && (typeof value.img !== 'string' || value.img.length >= 60000)))) return 'a shot needs n and title, and a picture under 60000 characters';
    return null;
  }
  return 'no such top-level path';
}

async function startFake(opts = {}) {
  const fake = { db: {}, requests: [], streams: new Set(), offline: false, skew: 0, pushN: 0, keepAliveMs: opts.keepAliveMs || 20000 };
  const now = () => Date.now() + fake.skew;
  const get = parts => { let v = fake.db; for (const p of parts) { if (!isObj(v) || !(p in v)) return null; v = v[p]; } return v === undefined ? null : v; };
  function put(parts, val) {
    if (!parts.length) { fake.db = isObj(val) ? val : {}; return; }
    let cur = fake.db;
    for (let i = 0; i < parts.length - 1; i++) { if (!isObj(cur[parts[i]])) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    const last = parts[parts.length - 1];
    if (val === null) delete cur[last]; else cur[last] = val;
    fake.db = prune(fake.db) || {};
  }
  const send = (s, event, data) => s.res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  function notify(parts, patchObj) {
    for (const s of fake.streams) {
      const sp = s.parts, n = Math.min(sp.length, parts.length);
      if (!sp.slice(0, n).every((p, i) => p === parts[i])) continue;                  // unrelated paths
      if (patchObj && sp.length === parts.length) { send(s, 'patch', { path: '/', data: patchObj }); continue; }
      if (parts.length <= sp.length) send(s, 'put', { path: '/', data: get(sp) });    // the write covers the stream's path
      else send(s, 'put', { path: '/' + parts.slice(sp.length).join('/'), data: get(parts) });
    }
  }
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (fake.offline) { req.socket.destroy(); return; }
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.endsWith('.json')) { res.writeHead(404); res.end(); return; }
    const parts = decodeURIComponent(url.pathname.slice(1, -5)).split('/').filter(Boolean);
    fake.requests.push({ method: req.method, path: parts.join('/'), stream: /event-stream/.test(req.headers.accept || '') });
    const deny = (why) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Permission denied' })); fake.lastDenied = why; };
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const write = req.method !== 'GET';
      if (req.method === 'GET' && /event-stream/.test(req.headers.accept || '')) {
        const why = allowed(parts, false); if (why) return deny(why);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        const s = { parts, res }; fake.streams.add(s);
        send(s, 'put', { path: '/', data: get(parts) });
        s.timer = setInterval(() => res.write('event: keep-alive\ndata: null\n\n'), fake.keepAliveMs);
        res.on('close', () => { clearInterval(s.timer); fake.streams.delete(s); });
        return;
      }
      let val = null;
      if (write && req.method !== 'DELETE') { try { val = sv(JSON.parse(body), now()); } catch (e) { res.writeHead(400); res.end('{"error":"bad json"}'); return; } }
      if (req.method === 'DELETE') val = null;
      let why;
      if (req.method === 'PATCH') {
        why = allowed(parts, false) || (isObj(val) ? null : 'patch needs an object');
        if (!why) for (const k in val) { why = allowed(parts.concat(k), true, val[k]) || (parts.length < 2 ? 'no access' : null); if (why) break; }
      } else if (req.method === 'POST') why = allowed(parts, false) || allowed(parts.concat('x'), true, val);
      else why = allowed(parts, write, val);
      if (why) return deny(why);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.method === 'GET') { res.end(JSON.stringify(get(parts))); return; }
      if (req.method === 'POST') {
        const id = '-N' + String(++fake.pushN).padStart(6, '0') + 'abcdefghijkl'.slice(0, 11);
        put(parts.concat(id), val); res.end(JSON.stringify({ name: id })); notify(parts.concat(id)); return;
      }
      if (req.method === 'PATCH') {
        for (const k in val) put(parts.concat(k), val[k] === undefined ? null : val[k]);
        res.end(JSON.stringify(val)); notify(parts, val); return;
      }
      put(parts, val); res.end(JSON.stringify(val)); notify(parts);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  fake.url = 'http://127.0.0.1:' + server.address().port;
  fake.kick = () => { for (const s of fake.streams) s.res.destroy(); fake.streams.clear(); };      // drops every stream, like a network blip
  fake.setOffline = on => { fake.offline = on; if (on) fake.kick(); };
  fake.close = () => new Promise(r => { fake.kick(); server.close(() => r()); if (server.closeAllConnections) server.closeAllConnections(); });
  fake.put = (p, v) => { const parts = p.split('/').filter(Boolean); put(parts, v); notify(parts); };   // direct writes for test setup
  fake.get = p => get(p.split('/').filter(Boolean));
  return fake;
}
module.exports = { startFake };
