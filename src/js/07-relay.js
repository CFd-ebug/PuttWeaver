// ================= relay (the only network code in the page) =================
// A thin client for a Firebase Realtime Database over its REST API; docs/console-plan.md has the data model and rules.
// The Manager console and a paired Host talk through it. Nothing here runs until a device is paired or the owner taps
// the self-test, so a Host or Evaluator that never pairs makes no network requests (tests/offline-check.js).
//   relayGet / relayPut / relayPatch / relayPost / relayDelete (path, value)    promises; paths look like 'rooms/<id>/state'
//   relayStream(path, {onData(cache, changedPath), onStatus(s)})                -> {close()}   s is 'connecting' | 'live' | 'offline'
//   relayNow()                  server time in ms, once relaySyncClock has run
//   relayRandom(n)              n random characters from an alphabet without look-alikes (no 0 O 1 I L)
// To use a different database, set localStorage 'putt-lab-relay-url' (tests point it at tests/fake-rtdb.js).
const RELAY_DEFAULT_URL = 'https://puttweaver2-default-rtdb.firebaseio.com';
const RELAY_URL_KEY = 'putt-lab-relay-url';
const RELAY_TS = {'.sv': 'timestamp'};            // the server fills this in with its own clock
const RELAY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const relayState = {offset: 0, synced: false};
function relayBase(){
  try { const u = localStorage.getItem(RELAY_URL_KEY); if (u) return u.replace(/\/+$/, ''); } catch (e) {}
  return RELAY_DEFAULT_URL;
}
function relayUrl(path){ return relayBase() + '/' + path.split('/').filter(Boolean).map(encodeURIComponent).join('/') + '.json'; }
function relayRandom(n){
  const bytes = new Uint8Array(n); (self.crypto || window.crypto).getRandomValues(bytes);
  let s = ''; for (let i = 0; i < n; i++) s += RELAY_ALPHABET[bytes[i] % RELAY_ALPHABET.length];   // 31 characters; the tiny bias is harmless here
  return s;
}
function relayNow(){ return Date.now() + relayState.offset; }
async function relaySend(method, path, body, timeoutMs){
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs || 8000);
  try {
    const res = await fetch(relayUrl(path), {method, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal, cache: 'no-store'});
    if (!res.ok){
      let detail = ''; try { detail = (await res.json()).error || ''; } catch (e) {}
      const err = new Error(method + ' ' + path + ': ' + res.status + (detail ? ' ' + detail : '')); err.status = res.status; throw err;
    }
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError'){ const err = new Error(method + ' ' + path + ': timed out'); err.status = 0; throw err; }
    if (e.status === undefined) e.status = 0;       // network failure
    throw e;
  } finally { clearTimeout(timer); }
}
const relayGet = path => relaySend('GET', path);
const relayPut = (path, v) => relaySend('PUT', path, v);
const relayPatch = (path, v) => relaySend('PATCH', path, v);
const relayPost = (path, v) => relaySend('POST', path, v);          // resolves {name: <new push id>}
const relayDelete = path => relaySend('DELETE', path);

// sets (or with null, removes) a value inside a cached tree and returns the tree
function relaySetAt(root, path, val){
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return val === undefined ? null : val;
  const top = root && typeof root === 'object' ? root : {};
  let cur = top;
  for (let i = 0; i < parts.length - 1; i++){ const k = parts[i]; if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }
  const last = parts[parts.length - 1];
  if (val === null || val === undefined) delete cur[last]; else cur[last] = val;
  return top;
}
function relayStream(path, handlers){
  let es = null, cache = null, closed = false, tries = 0, retryTimer = null, watchdog = null, status = '';
  const setStatus = s => { if (s !== status){ status = s; if (handlers.onStatus) handlers.onStatus(s); } };
  const bump = () => { clearTimeout(watchdog); watchdog = setTimeout(() => fail(), 50000); };   // the server sends a keep-alive every ~30 s
  const parse = ev => { try { return JSON.parse(ev.data); } catch (e) { return null; } };
  function fail(){
    clearTimeout(watchdog); if (es){ es.close(); es = null; }
    if (closed) return;
    setStatus('offline'); tries++;
    retryTimer = setTimeout(open, Math.min(8000, 400 * Math.pow(2, tries - 1)));
  }
  function open(){
    if (closed) return;
    setStatus('connecting');
    try { es = new EventSource(relayUrl(path)); } catch (e) { fail(); return; }
    bump();
    es.addEventListener('put', ev => {
      const m = parse(ev); if (!m) return; bump(); tries = 0;
      cache = relaySetAt(cache, m.path || '/', m.data);
      setStatus('live'); if (handlers.onData) handlers.onData(cache, m.path || '/');
    });
    es.addEventListener('patch', ev => {
      const m = parse(ev); if (!m || !m.data) return; bump(); tries = 0;
      const base = (m.path || '/').replace(/\/+$/, '');
      for (const k in m.data) cache = relaySetAt(cache, base + '/' + k, m.data[k]);
      setStatus('live'); if (handlers.onData) handlers.onData(cache, m.path || '/');
    });
    es.addEventListener('keep-alive', bump);
    es.addEventListener('cancel', fail);
    es.addEventListener('auth_revoked', fail);
    es.onerror = fail;
  }
  open();
  return {
    close(){ closed = true; clearTimeout(retryTimer); clearTimeout(watchdog); if (es){ es.close(); es = null; } },
    get cache(){ return cache; }
  };
}
// Learn how far this device's clock is from the server's: write a server timestamp, read it back, split the round trip.
async function relaySyncClock(room){
  const p = 'rooms/' + room + '/hb/clock', t0 = Date.now();
  await relayPut(p, RELAY_TS);
  const t1 = Date.now(), server = await relayGet(p);
  if (typeof server !== 'number') throw new Error('The server did not return a time');
  relayState.offset = Math.round(server - (t0 + (t1 - t0) / 2)); relayState.synced = true;
  return relayState.offset;
}
// Pairing codes are typed by hand, so accept lower case, spaces and dashes.
function relayCleanCode(s){ return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function relayShowCode(c){ return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c; }

// The owner's one-tap check of the real database: every kind of request the console uses, on a throwaway room.
// Resolves to [{name, ok, detail}] and never throws.
async function relaySelfTest(onStep){
  const steps = [], room = relayRandom(20), code = relayRandom(8);
  const step = async (name, fn) => {
    const t0 = Date.now(); let ok = false, detail = '';
    try { detail = (await fn()) || ''; ok = true; } catch (e) { detail = String(e.message || e); }
    const row = {name, ok, detail: (detail + ' ' + (Date.now() - t0) + ' ms').trim()};
    steps.push(row); if (onStep) onStep(row); return ok;
  };
  const base = 'rooms/' + room;
  let ok = await step('Reach the database', async () => { await relayGet('rooms/' + room + '/state'); return relayBase().replace(/^https?:\/\//, ''); });
  if (ok) ok = await step('Write and read a state snapshot', async () => {
    await relayPut(base + '/state', {game: 'selftest', rev: 1});
    const back = await relayGet(base + '/state'); if (!back || back.rev !== 1) throw new Error('Read back ' + JSON.stringify(back));
  });
  if (ok) ok = await step('Server clock', async () => { const off = await relaySyncClock(room); return 'clock is ' + (off >= 0 ? '' : '−') + Math.abs(off) + ' ms ' + (off >= 0 ? 'behind' : 'ahead of') + ' the server'; });
  if (ok) ok = await step('Live updates (streaming)', () => new Promise((resolve, reject) => {
    let got = false; const timer = setTimeout(() => { s.close(); reject(new Error('No update arrived within 6 s')); }, 6000);
    const s = relayStream(base + '/state', {onData: c => {
      if (c && c.rev === 2 && !got){ got = true; clearTimeout(timer); s.close(); resolve(); }
      else if (c && c.rev === 1 && !got) relayPatch(base + '/state', {rev: 2}).catch(reject);
    }});
  }));
  if (ok) ok = await step('Send a command and an acknowledgement', async () => {
    const r = await relayPost(base + '/cmd', {type: 'selftest', ts: RELAY_TS});
    if (!r || !r.name) throw new Error('No id returned');
    await relayPut(base + '/ack/' + r.name, {ok: true, ts: RELAY_TS}); await relayDelete(base + '/cmd/' + r.name);
  });
  if (ok) ok = await step('Pairing code', async () => {
    await relayPut('pair/' + code, {room, exp: RELAY_TS}); const back = await relayGet('pair/' + code);
    if (!back || back.room !== room) throw new Error('Read back ' + JSON.stringify(back));
    await relayDelete('pair/' + code);
  });
  if (ok) ok = await step('Rules block listing and junk', async () => {
    let listed = false; try { await relayGet('rooms'); listed = true; } catch (e) {}
    if (listed) throw new Error('rooms can be listed: the database rules are too open');
    let junk = false; try { await relayPut(base + '/junk', {a: 1}); junk = true; } catch (e) {}
    if (junk) throw new Error('an unknown key was accepted: the database rules are too open');
  });
  await step('Clean up', async () => { await relayDelete(base); });
  return steps;
}
