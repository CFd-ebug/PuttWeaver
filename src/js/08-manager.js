// ================= Manager console (and pairing helpers shared with the Host) =================
// The Manager never starts the game engine: this file ends by running the console and returning from the script.
// It talks to the Host only through the relay (07-relay.js); docs/console-plan.md has the data model.
const MGR_KEY = 'putt-lab-mgr';                          // {room, id} for a paired Manager
const PAIR_WINDOW_MS = 120000;                           // a pairing code works for two minutes, once
const HOST_ALIVE_MS = 20000;                             // the Host writes a heartbeat every 5 s

function pairLink(code){ return location.href.split('#')[0] + '#manage=' + code; }
// Writes a short-lived pairing code for a room and resolves {code, exp, link}. Used by the Host and by a paired Manager.
async function pairOpen(room){
  if (!relayState.synced) await relaySyncClock(room);
  const code = relayRandom(8), exp = relayNow() + PAIR_WINDOW_MS;
  await relayPut('pair/' + code, {room, exp});
  return {code, exp, link: pairLink(code)};
}
function pairPaint(canvas, link){ qrDraw(canvas, qrMake(link), 6); }
function pairSteps(ul, rows){          // test results as a list: dot, name, detail
  ul.textContent = '';
  for (const r of rows){
    const li = document.createElement('li'), dot = document.createElement('span'), name = document.createElement('span'), det = document.createElement('small');
    dot.className = 'dot'; dot.dataset.s = r.ok ? 'ok' : 'bad'; name.textContent = r.name; det.textContent = r.detail;
    li.append(dot, name, det); ul.append(li);
  }
}

function runManager(){
  const el = id => document.getElementById(id);
  const root = el('mgr'); root.hidden = false;
  let room = '', myId = '', acks = {}, tab = 'run', pvStream = null, wantTimer = 0, pvImg = null, pvSeq = 0, fitPin = null, fitDrag = -1, fitTimer = 0, fitLast = -1, streams = [], pending = new Map(), timers = [], lastState = null, hostBeat = 0, relayLive = false, gamesKey = '', shownIds = [], shownHold = 0, pendTile = null, pendTimer = 0, addTimer = 0, statsData = {}, shotList = [], repSel = 0, repAuto = true, repSpd = 1, repT0 = 0, repRaf = 0, armed = null, armTimer = 0, worldImg = null;
  const repImgs = new Map();
  const say = (id, msg) => { el(id).textContent = msg; };

  function load(){ try { const v = JSON.parse(localStorage.getItem(MGR_KEY) || 'null'); if (v && v.room && v.room.length === 20) return v; } catch (e) {} return null; }
  function save(v){ try { if (v) localStorage.setItem(MGR_KEY, JSON.stringify(v)); else localStorage.removeItem(MGR_KEY); } catch (e) {} }

  // ---------- joining ----------
  async function join(codeRaw){
    const code = relayCleanCode(codeRaw);
    if (code.length !== 8) throw new Error('A pairing code has 8 letters and numbers.');
    const rec = await relayGet('pair/' + code);
    if (!rec || typeof rec.room !== 'string') throw new Error('That code is not valid. Check it, or ask the Host for a new one.');
    await relaySyncClock(rec.room);
    if (!(rec.exp > relayNow())){ relayDelete('pair/' + code).catch(() => {}); throw new Error('That code has expired. Tap Add a controller on the Host for a new one.'); }
    relayDelete('pair/' + code).catch(() => {});                      // a code works once
    save({room: rec.room, id: relayRandom(6)});
  }
  async function tryJoin(code){
    const btn = el('mgrJoinBtn'); btn.disabled = true; say('mgrJoinMsg', 'Connecting…');
    try { await join(code); say('mgrJoinMsg', ''); start(); }
    catch (e) { say('mgrJoinMsg', e.status === 0 ? 'Could not reach the relay. Check this phone’s connection and try again. (' + e.message + ')' : e.message); }
    finally { btn.disabled = false; }
  }
  el('mgrJoinBtn').addEventListener('click', () => tryJoin(el('mgrCodeIn').value));
  el('mgrCodeIn').addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(el('mgrCodeIn').value); });
  el('mgrCodeIn').addEventListener('input', e => {
    const c = relayCleanCode(e.target.value).slice(0, 8); e.target.value = relayShowCode(c);
  });

  // ---------- running ----------
  function start(){
    stop(); showTab('run'); const v = load(); if (!v){ showJoin(); return; }
    room = v.room; myId = v.id || relayRandom(6);
    el('mgrJoin').hidden = true; el('mgrRun').hidden = false; el('mgrAdd').hidden = false; el('mgrUnpair').hidden = false;
    streams.push(relayStream('rooms/' + room + '/state', {
      onData: c => { lastState = c; render(); dashSync(c); },
      onStatus: s => { relayLive = s === 'live'; strip(); }
    }));
    streams.push(relayStream('rooms/' + room + '/hb', {onData: c => { hostBeat = c && typeof c.host === 'number' ? c.host : 0; strip(); }}));
    streams.push(relayStream('rooms/' + room + '/ack', {onData: onAcks}));
    const beat = () => relayPut('rooms/' + room + '/hb/mgr/' + myId, RELAY_TS).catch(() => {});
    relaySyncClock(room).catch(() => {}).then(beat);
    timers.push(setInterval(beat, 5000), setInterval(strip, 2000));
    strip(); render();
  }
  function stop(){ srKey = ''; stopPreview(); cancelAnimationFrame(repRaf); repRaf = 0; statsData = {}; shotList = []; repImgs.clear(); streams.forEach(s => s.close()); streams = []; timers.forEach(clearInterval); timers = []; pending.clear(); lastState = null; hostBeat = 0; relayLive = false; gamesKey = ''; pickClose(); }
  function showJoin(){ stop(); room = ''; el('mgrJoin').hidden = false; el('mgrRun').hidden = true; el('mgrAdd').hidden = true; el('mgrUnpair').hidden = true; el('mgrCodeIn').focus(); }

  function setDot(id, s){ el(id).dataset.s = s; }
  function strip(){
    if (!room) return;
    setDot('mgrDotRelay', relayLive ? 'ok' : 'bad'); say('mgrRelayTxt', relayLive ? 'Relay connected' : 'Relay offline, retrying…');
    const age = hostBeat ? relayNow() - hostBeat : Infinity;
    if (!relayLive) { setDot('mgrDotHost', 'warn'); say('mgrHostTxt', 'Host: unknown'); }
    else if (age < HOST_ALIVE_MS) { setDot('mgrDotHost', 'ok'); say('mgrHostTxt', 'Host online'); }
    else { setDot('mgrDotHost', 'bad'); say('mgrHostTxt', hostBeat ? 'Host not responding (last seen ' + Math.round(age / 1000) + ' s ago)' : 'Host has not checked in yet'); }
    const l = lastState && lastState.live;
    say('mgrVer', lastState && lastState.ver ? (lastState.ver === BUILD.label ? 'Version ' + lastState.ver : 'Host runs ' + lastState.ver + ', this phone runs ' + BUILD.label + ': reload the older one') : '');
    say('mgrTrack', l ? (l.on ? 'Tracking: ' + l.state + (l.fps ? ' · ' + l.fps + ' fps' : '') : (l.src ? 'Tracking paused' : 'No camera on the Host')) : '');
  }

  function render(){
    const st = lastState;
    if (!st || !st.game){ renderDash(); say('mgrGame', 'Waiting for the Host…'); say('mgrStatus', ''); say('mgrHint', 'The Host sends its status as soon as it sees this console.'); el('mgrResult').hidden = true; say('mgrHole', ''); drawMap(null); return; }
    say('mgrGame', st.game.name); say('mgrStatus', st.game.status || ''); say('mgrHint', st.hint || '');
    const r = el('mgrResult');
    if (st.result){ r.hidden = false; r.dataset.tone = st.result.tone || ''; say('mgrResTitle', st.result.title || ''); say('mgrResDetail', st.result.detail || ''); } else r.hidden = true;
    if (st.hole){ const done = st.hole.strokes.filter(x => x != null); say('mgrHole', 'Par ' + st.hole.par + ' · score ' + (done.length ? done.join(' / ') : '—') + (st.hole.final ? ' · hole complete' : '')); } else say('mgrHole', '');
    const gkey = (st.games || []).join('|') + '#' + (st.gids || []).join('|') + '#' + (st.shown || []).join(',');
    if (gkey !== gamesKey){
      gamesKey = gkey; const fromHost = (st.shown || []).map(i => (st.gids || [])[i]).filter(Boolean);
      if (Date.now() < shownHold && fromHost.join() !== shownIds.join()) gamesKey = '';        // just changed here: ignore the Host's older list until it catches up
      else shownIds = fromHost;
      renderPick(st); renderShown(st);
    }
    else if (!el('mgrPick').hidden) markPickCurrent(st.game.idx);
    const l = st.live || {}, tb = el('mgrTrackBtn');
    tb.textContent = l.on ? 'Pause tracking' : 'Start tracking'; tb.setAttribute('aria-pressed', String(!!l.on)); tb.disabled = !l.src || !l.cal;
    el('mgrHoldBtn').setAttribute('aria-pressed', String(!!st.hold)); el('mgrHoldBtn').textContent = st.hold ? 'Resume game' : 'Hold screen';
    el('mgrBall').textContent = st.ball ? 'x ' + st.ball.x.toFixed(2) + ' ft · y ' + st.ball.y.toFixed(2) + ' ft' : 'No ball in view';
    drawMap(st); strip(); renderSetup(st); renderDebug(st); renderDash();
  }
  function drawMap(st){
    const c = el('mgrMap'), g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h); if (!st || !st.sheet) return;
    const sw = st.sheet.w, sd = st.sheet.d, s = Math.min((w - 20) / sw, (h - 40) / sd), ox = (w - sw * s) / 2, oy = 10;
    g.fillStyle = '#f8f8f5'; g.fillRect(ox, oy, sw * s, sd * s); g.strokeStyle = '#8b94a8'; g.lineWidth = 2; g.strokeRect(ox, oy, sw * s, sd * s);
    g.fillStyle = '#8b94a8'; g.font = '600 12px sans-serif'; g.textAlign = 'center'; g.fillText('TEE EDGE', w / 2, oy + sd * s + 14);
    if (st.ball){ g.fillStyle = '#2343d6'; g.beginPath(); g.arc(ox + st.ball.x * s, oy + st.ball.y * s, 8, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  }


  // ---------- the dashboard: this hole, everyone's results, the replay ----------
  const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmtN = n => Math.round(n).toLocaleString('en-US');
  const rateOf = p => p && p.n ? p.close / p.n : 0;
  const rateClass = r => r >= 0.6 ? 'easy' : r < 0.35 ? 'hard' : 'mid';
  // Shots and totals are fetched when the Host's state says they changed, which saves streams (a browser keeps only a few connections open).
  let srKey = '', srBusy = false, srAgain = false;
  async function dashSync(st){
    const k = st && st.sr ? st.sr.join(',') : ''; if (!room || !k || k === srKey) return;
    if (srBusy){ srAgain = true; return; }
    srBusy = true; srKey = k;
    try {
      const [sh, sx] = await Promise.all([relayGet('rooms/' + room + '/shots'), relayGet('rooms/' + room + '/stats')]);
      statsData = sx || {}; onShots(sh);
    } catch (e) { srKey = ''; }
    srBusy = false; if (srAgain){ srAgain = false; dashSync(lastState); }
  }
  function onShots(c){                                              // Firebase may hand back an array when the keys are small whole numbers
    const list = (Array.isArray(c) ? c : c ? Object.values(c) : []).filter(x => x && typeof x === 'object' && x.n);
    list.sort((a, b) => a.n - b.n);
    const had = shotList.length; shotList = list;
    if (list.length > had && (repAuto || repSel >= list.length || had === 0)){ repSel = list.length - 1; repAuto = true; repT0 = performance.now(); }     // a new shot: loop it until the next one
    if (repSel >= list.length) repSel = Math.max(0, list.length - 1);
    renderDash();
  }
  function renderDash(){
    renderLadder(); renderShots(); renderReplayBar(); drawWorld(); startReplay();
  }
  function renderLadder(){
    const box = el('mgrLadder'), st = lastState, gid = st && st.game ? st.game.id : '', h = st && st.hole;
    const g = (statsData.holes && statsData.holes[gid]) || {}, n = [5, 4, 3, 2, 1].reduce((a, k) => a + (Number(g[k]) || 0), 0), mx = Math.max(1, ...[5, 4, 3, 2, 1].map(k => Number(g[k]) || 0));
    const done = h ? h.strokes.filter(x => x != null) : [], mine = done.length ? done[0] : null;
    const avg = n ? [5, 4, 3, 2, 1].reduce((a, k) => a + k * (Number(g[k]) || 0), 0) / n : 0;
    box.textContent = '';
    if (!h){ box.append(mk('div', 'eyebrow', 'Hole score'), mk('p', 'd-empty', 'This game has no hole score.')); return; }
    box.append(mk('div', 'eyebrow', n ? 'Everyone’s holes · ' + n + ' played · avg ' + avg.toFixed(1) : 'Hole score · nobody has finished one yet'));
    const pips = mk('div', 'd-pips'), dist = mk('div', 'd-dist');
    for (const k of [5, 4, 3, 2, 1]){
      const pip = mk('div', 'd-pip' + (k === h.par ? ' par' : '') + (mine === k ? (h.final ? ' on' : ' live') : ''), String(k));
      pip.append(mk('small', '', mine === k ? (h.final ? 'YOU' : 'NOW') : k === h.par ? 'PAR' : k === 1 ? 'BEST' : ''));
      pips.append(pip);
      const c = Number(g[k]) || 0, cell = mk('div', mine === k ? 'me' : '');
      cell.append(mk('span', '', n ? Math.round(c / n * 100) + '%' : '·')); const bar = mk('i'); bar.style.height = Math.max(4, Math.round(c / mx * 100)) + '%'; cell.append(bar); dist.append(cell);
    }
    box.append(pips, dist);
  }
  function renderShots(){
    const box = el('mgrShots'), key = JSON.stringify([shotList.map(x => [x.n, x.title]), statsData.places]);
    if (box.dataset.key === key) return; box.dataset.key = key; box.textContent = '';
    if (!shotList.length){ box.append(mk('p', 'd-empty', 'No shots yet.')); return; }
    for (const r of shotList){
      const card = mk('div', 'd-shot ' + (r.tone || '')); card.append(mk('span', 'no', String(r.n).padStart(2, '0')));
      const body = mk('div', 'sb'); body.append(mk('b', '', (r.tgt ? r.tgt.name + ' · ' : '') + r.title), mk('span', '', r.detail)); card.append(body);
      const pl = r.tgt && statsData.places ? statsData.places[r.tgt.name] : null;
      if (pl && pl.n){
        const rate = rateOf(pl), st = mk('div', 'd-pst ' + rateClass(rate));
        st.append(mk('span', 'lab', 'All players on ' + r.tgt.name), mk('b', '', Math.round(rate * 100) + '%'), mk('small', '', 'get close' + (pl.nk ? ' · avg miss ' + fmtN(pl.ksum / pl.nk) + ' km' : '')));
        const m = mk('div', 'd-meter'), i = mk('i'); i.style.width = Math.round(rate * 100) + '%'; m.append(i); st.append(m); card.append(st);
      }
      box.append(card);
    }
  }
  function renderReplayBar(){
    const sw = el('mgrRepSw'), key = shotList.map(x => x.n).join(',') + ':' + repSel;
    if (sw.dataset.key !== key){
      sw.dataset.key = key; sw.textContent = '';
      shotList.forEach((r, i) => { const b = mk('button', i === repSel ? 'on' : '', String(r.n).padStart(2, '0')); b.type = 'button'; b.dataset.shot = String(i); b.setAttribute('aria-pressed', String(i === repSel)); sw.append(b); });
    }
    const r = shotList[repSel];
    say('mgrRepHead', r ? 'Replay · shot ' + String(r.n).padStart(2, '0') : 'Replay');
    say('mgrRepInfo', r ? (r.tgt ? r.tgt.name + ' · ' : '') + (r.off != null ? r.off + ' in off' : r.title) : 'Waiting for the next shot');
  }
  // The replay loops until the next shot arrives. The picture is what the projector showed; the ball and its path are drawn over it.
  function startReplay(){ if (!repRaf && shotList.length && !el('mgrTabRun').hidden) repRaf = requestAnimationFrame(replayFrame); }
  function replayImg(r){
    if (!r.img) return null;
    let im = repImgs.get(r.n + ':' + r.img.length);
    if (!im){ im = new Image(); im.src = r.img; repImgs.set(r.n + ':' + r.img.length, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  function replayFrame(now){
    repRaf = 0;
    const r = shotList[repSel], c = el('mgrReplay'); if (!r || el('mgrTabRun').hidden || document.hidden) return;
    const g = c.getContext('2d'), w = c.width, h = c.height, sx = w / r.sw, sy = h / r.sd, im = replayImg(r);
    g.clearRect(0, 0, w, h);
    if (im) g.drawImage(im, 0, 0, w, h); else { g.fillStyle = '#eef0f7'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8b94a8'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); }
    if (r.tgt && !im){ g.strokeStyle = '#1a3cff'; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.arc(r.tgt.x * sx, r.tgt.y * sy, r.tgt.r * sx, 0, 7); g.stroke(); g.setLineDash([]); }
    const path = r.path || [], total = path.length ? Math.max(0.5, path[path.length - 1][2] / 1000) : 0.5, hold = 1.2;
    const t = ((now - repT0) / 1000 * repSpd) % (total + hold), tt = Math.min(t, total) * 1000;
    const col = r.hit === false || r.tone === 'bad' ? '#e5002b' : '#1a3cff';
    if (path.length){
      let upto = 0; while (upto < path.length - 1 && path[upto + 1][2] <= tt) upto++;
      const a = path[upto], b = path[Math.min(path.length - 1, upto + 1)], f = b[2] > a[2] ? Math.min(1, (tt - a[2]) / (b[2] - a[2])) : 0;
      const bx = a[0] + (b[0] - a[0]) * f, by = a[1] + (b[1] - a[1]) * f;
      g.strokeStyle = col; g.lineWidth = Math.max(3, w / 120); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(path[0][0] * sx, path[0][1] * sy);
      for (let i = 1; i <= upto; i++) g.lineTo(path[i][0] * sx, path[i][1] * sy); g.lineTo(bx * sx, by * sy); g.stroke();
      ball(g, bx * sx, by * sy, w);
    } else if (r.rest) ball(g, r.rest[0] * sx, r.rest[1] * sy, w);
    repRaf = requestAnimationFrame(replayFrame);
  }
  function ball(g, x, y, w){ const R = Math.max(7, w / 55); g.fillStyle = '#fff'; g.strokeStyle = '#0a0a0a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(x, y, R / 3, 0, 7); g.fill(); }
  function drawWorld(){
    const c = el('mgrWorld'), g = c.getContext('2d'), w = c.width, h = c.height, places = statsData.places ? Object.values(statsData.places) : [];
    if (!worldImg){ worldImg = document.createElement('canvas'); worldImg.width = w; worldImg.height = h; try { worldMapDraw(worldImg.getContext('2d'), w, h, w / 8); } catch (e) {} }
    g.drawImage(worldImg, 0, 0);
    const colors = {easy: '#1a3cff', mid: '#0a0a0a', hard: '#e5002b'};
    for (const p of places){
      const r = 5 + Math.min(14, p.n * 0.5), k = rateClass(rateOf(p));
      g.fillStyle = colors[k]; g.globalAlpha = 0.85; g.beginPath(); g.arc(p.x * w, p.y * h, r, 0, 7); g.fill(); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    }
    const here = shotList.filter(r => r.tgt);
    g.font = '700 22px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const r of here){ const x = r.tgt.x / r.sw * w, y = r.tgt.y / r.sd * h; g.fillStyle = '#0a0a0a'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.rect(x - 15, y - 15, 30, 30); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillText(String(r.n), x, y + 1); }
    say('mgrWorldN', places.length ? places.length + ' places · ' + fmtN(places.reduce((a, p) => a + p.n, 0)) + ' tries' : 'No results yet');
    el('mgrWorld').closest('.d-world').hidden = !places.length && !here.length;
  }
  // Two taps for anything that changes the game: the first arms the key, the second sends it.
  // ---------- game picker (overlay on the Run tab) and Setup, Games shown ----------
  const pickOpen = () => !el('mgrPick').hidden;
  function pickClose(){ clearTimeout(pendTimer); pendTile = null; el('mgrPick').hidden = true; }
  function pickShow(){ if (!lastState || !lastState.game) return; renderPick(lastState); el('mgrPick').hidden = false; const c = el('mgrPickGrid').querySelector('.gk[aria-pressed="true"]') || el('mgrPickGrid').querySelector('.gk'); if (c) c.focus(); }
  function markPickCurrent(idx){ el('mgrPickGrid').querySelectorAll('.gk').forEach(t => t.setAttribute('aria-pressed', String(Number(t.dataset.idx) === idx))); }
  function renderPick(st){
    const box = el('mgrPickGrid'); box.textContent = ''; pendTile = null; clearTimeout(pendTimer);
    const names = st.games || [], ids = st.gids || [];
    ids.map((id, i) => shownIds.includes(id) ? i : -1).filter(i => i >= 0).forEach((idx, k) => box.append(pickTile({id: ids[idx], name: names[idx]}, idx + 1, idx, k)));
    markPickCurrent(st.game ? st.game.idx : -1);
  }
  function pickTap(tile){                 // the first tap arms the tile (dashed outline, TAP AGAIN); the second tap changes the game
    if (pendTile === tile){ clearTimeout(pendTimer); pendTile = null; pickClose(); send('game', {idx: Number(tile.dataset.idx)}); return; }
    if (pendTile) pendTile.classList.remove('pend');
    clearTimeout(pendTimer); pendTile = tile; tile.classList.add('pend');
    pendTimer = setTimeout(() => { tile.classList.remove('pend'); if (pendTile === tile) pendTile = null; }, 3000);
  }
  const SHOWN_REC = ['map', 'timeline', 'periodic', 'ttt', 'bowling', 'gallery'];
  function renderShown(st){
    const list = el('mgrShownList'), names = st.games || [], ids = st.gids || [];
    list.textContent = '';
    ids.forEach((id, i) => {
      const on = shownIds.includes(id), row = document.createElement('div'); row.className = 'gs-row' + (on ? '' : ' off');
      const th = document.createElement('span'); th.className = 'gs-th'; const p = typeof GAME_PREVIEWS !== 'undefined' && GAME_PREVIEWS[id]; if (p){ const im = document.createElement('img'); im.alt = ''; im.src = p.img; th.append(im); }
      const nm = document.createElement('span'); nm.className = 'gs-nm'; const sm = document.createElement('small'); sm.textContent = String(i + 1).padStart(2, '0'); const b = document.createElement('b'); b.textContent = names[i]; nm.append(sm, b);
      const sw = document.createElement('span'); sw.className = 'gs-sw'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', names[i] + ' shown to players');
      [['Off', false], ['On', true]].forEach(([t, v]) => { const k = document.createElement('button'); k.type = 'button'; k.className = 'gs-k' + (on === v ? (v ? ' on' : ' on2') : ''); k.textContent = t; k.dataset.gid = id; k.dataset.on = v ? '1' : '0'; k.setAttribute('aria-pressed', String(on === v)); sw.append(k); });
      row.append(th, nm, sw); list.append(row);
    });
    say('mgrShownN', shownIds.length + ' of ' + ids.length + ' on');
  }
  function setShown(ids){
    if (!ids.length){ say('mgrShownMsg', 'Leave at least one game on.'); return; }
    shownIds = ids; shownHold = Date.now() + 2500; say('mgrShownMsg', ''); if (lastState) renderShown(lastState);
    send('shown', {ids});
  }
  function disarm(){ clearTimeout(armTimer); if (armed){ armed.textContent = armed.dataset.t; delete armed.dataset.armed; armed = null; } }
  function confirmTap(b){
    if (armed === b){ disarm(); return true; }
    disarm(); armed = b; b.dataset.t = b.textContent; b.dataset.armed = '1'; b.textContent = 'Tap again';
    armTimer = setTimeout(disarm, 3000); return false;
  }
  // Full screen, for the touch screen that runs this console.
  const fullBtn = el('mgrFull');
  if (document.documentElement.requestFullscreen){
    fullBtn.hidden = false;
    fullBtn.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
    document.addEventListener('fullscreenchange', () => { fullBtn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden){ repT0 = performance.now(); startReplay(); } });

  // ---------- commands ----------
  const msg = t => { say('mgrCmdMsg', t); say('mgrCmdMsg2', t); };
  async function send(type, args, quiet){
    if (!room) return;
    if (!quiet) msg('Sending…');
    try {
      const r = await relayPost('rooms/' + room + '/cmd', {type, args: args || {}, ts: RELAY_TS, ttl: 8000});
      const done = new Promise(res => { pending.set(r.name, res); setTimeout(() => { if (pending.delete(r.name)) res({ok: false, error: 'No answer from the Host. Is it on and online?'}); }, 8000); });
      onAcks(acks);                       // the answer may already have arrived while this request was still finishing
      const ack = await done;
      if (!quiet || !ack.ok) msg(ack.ok ? 'Done.' : 'The Host said: ' + ack.error);
      return ack;
    } catch (e) { msg('Could not send: ' + e.message); }
  }
  function onAcks(c){
    acks = c || {};
    if (!c) return;
    for (const id of Object.keys(c)) if (pending.has(id)) {
      const res = pending.get(id); pending.delete(id); res(c[id]);
      relayDelete('rooms/' + room + '/ack/' + id).catch(() => {});
    }
  }
  root.addEventListener('click', e => {
    if (e.target === el('mgrPick')){ pickClose(); return; }                 // a tap on the dark area closes the picker
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('gk')){ pickTap(b); return; }
    if (b.id === 'mgrPickBtn'){ pickShow(); return; }
    if (b.classList.contains('gs-k')){ const id = b.dataset.gid, on = b.dataset.on === '1'; setShown(on ? (shownIds.includes(id) ? shownIds : shownIds.concat(id)) : shownIds.filter(x => x !== id)); return; }
    if (b.id === 'mgrShownRec'){ setShown(SHOWN_REC.filter(id => ((lastState && lastState.gids) || []).includes(id))); return; }
    if (b.id === 'mgrShownAll'){ setShown((lastState && lastState.gids) || []); return; }
    if (b.classList.contains('tc') && !confirmTap(b)) return;
    if (b.dataset.spd){ repSpd = Number(b.dataset.spd); el('mgrRepSpd').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); repT0 = performance.now(); return; }
    if (b.dataset.shot){ repSel = Number(b.dataset.shot); repAuto = repSel === shotList.length - 1; repT0 = performance.now(); renderDash(); return; }
    if (b.dataset.cmd) { let a; try { a = b.dataset.args ? JSON.parse(b.dataset.args) : undefined; } catch (err) {} send(b.dataset.cmd, a); }
    else if (b.classList.contains('mgr-tab')) showTab(b.dataset.tab);
    else if (b.dataset.nudge) nudge(b.dataset.nudge);
    else if (b.dataset.opt) send('opt', {k: b.dataset.opt});
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pickOpen()) pickClose(); });
  el('mgrTrackBtn').addEventListener('click', () => send('track', {on: !(lastState && lastState.live && lastState.live.on)}));
  el('mgrTrackBtn2').addEventListener('click', () => send('track', {on: !(lastState && lastState.live && lastState.live.on)}));
  el('mgrFitBtn').addEventListener('click', () => send('fit', {on: !(lastState && lastState.setup && lastState.setup.fit)}));
  el('mgrHoldBtn').addEventListener('click', () => send('hold', {on: !(lastState && lastState.hold)}));


  // ---------- Setup tab ----------
  function showTab(name){
    if (name !== 'run' && !unlockedAt) name = 'run';                    // Setup and Debug are behind the event lock
    tab = name;
    root.querySelectorAll('.mgr-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    el('mgrTabRun').hidden = name !== 'run'; el('mgrTabSetup').hidden = name !== 'setup'; el('mgrTabDebug').hidden = name !== 'debug';
    syncWants(); if (name !== 'run') render(); else startReplay();
  }
  // The Host only sends pictures and details while someone keeps saying they want them (every 4 s, and only while this page is visible).
  const wantsNow = () => ({pv: tab === 'setup' || (tab === 'debug' && el('mgrPvOn').checked), dbg: tab === 'debug'});
  function beatWants(){ if (document.hidden || !room) return; const w = wantsNow(); if (w.pv) relayPut('rooms/' + room + '/want/preview', RELAY_TS).catch(() => {}); if (w.dbg) relayPut('rooms/' + room + '/want/debug', RELAY_TS).catch(() => {}); }
  function syncWants(){
    if (!room){ stopPreview(); return; }
    const w = wantsNow();
    if (w.pv && !pvStream) pvStream = relayStream('rooms/' + room + '/preview', {onData: c => { if (typeof c === 'string' && c.startsWith('data:image/')) paintPreview(c); }});
    if (!w.pv && pvStream){ pvStream.close(); pvStream = null; }
    if ((w.pv || w.dbg) && !wantTimer){ beatWants(); wantTimer = setInterval(beatWants, 4000); }
    else if (!w.pv && !w.dbg){ clearInterval(wantTimer); wantTimer = 0; }
    else beatWants();
  }
  function stopPreview(){ if (pvStream){ pvStream.close(); pvStream = null; } clearInterval(wantTimer); wantTimer = 0; }
  function paintPreview(url){ const img = new Image(); img.onload = () => { pvImg = img; pvSeq++; drawPv(); }; img.src = url; }
  function drawPv(){
    if (!pvImg) return;
    const su = lastState && lastState.setup, dbg = lastState && lastState.debug;
    for (const id of ['mgrPv', 'mgrPv2']){
      const c = el(id); if (c.offsetParent === null) continue;          // only the visible one
      if (c.width !== pvImg.naturalWidth || c.height !== pvImg.naturalHeight){ c.width = pvImg.naturalWidth; c.height = pvImg.naturalHeight; }
      const g = c.getContext('2d'); g.drawImage(pvImg, 0, 0);
      if (su && su.quad){ g.strokeStyle = '#6f9bff'; g.lineWidth = 2; g.beginPath(); su.quad.forEach(([u, v], k) => k ? g.lineTo(u * c.width, v * c.height) : g.moveTo(u * c.width, v * c.height)); g.closePath(); g.stroke(); }
      if (id === 'mgrPv2' && dbg){ g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; for (const [u, v] of dbg.blobs || []) g.strokeRect(u * c.width - 5, v * c.height - 5, 10, 10); }
      if (su && su.det){ g.strokeStyle = '#ff3b8d'; g.lineWidth = 2; g.beginPath(); g.arc(su.det[0] * c.width, su.det[1] * c.height, 9, 0, 7); g.stroke(); }
      c.dataset.seq = String(pvSeq);
    }
    say('mgrPvNote', 'Updated ' + new Date().toLocaleTimeString() + '. Tap the ball to sample its color. The blue outline is the sheet as the calibration sees it.');
  }
  el('mgrPv').addEventListener('click', e => {
    const r = el('mgrPv').getBoundingClientRect();
    send('sampleat', {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height});
  });
  function renderSetup(st){
    const su = st.setup; if (!su || tab !== 'setup') return;
    const box = el('mgrSetupList'), row = (step, s, text, note) => {
      const li = box.querySelector('[data-step="' + step + '"]'); li.querySelector('.dot').dataset.s = s; li.querySelector('.st').textContent = text;
      const n = li.querySelector('.note'); if (n && note){ n.textContent = note.t || ''; n.dataset.tone = note.tone || ''; }
    };
    row('cam', su.src ? 'ok' : 'no', su.src ? su.label + (su.res ? ' · ' + su.res : '') : 'Off', {t: [su.notes.cam.t, su.lock].filter(Boolean).join(' '), tone: su.notes.cam.tone});
    row('fit', 'ok', su.pin ? 'Corners adjusted' : 'Square to the screen', {t: su.fit ? 'Adjusting: the Host is showing its test card.' : ''});
    const c = su.cal;
    row('cal', c ? (c.max != null && c.max > 1.5 ? 'warn' : 'ok') : 'no', c ? c.n + ' of ' + c.of + ' dots · ' + c.avg.toFixed(2) + ' in average' + (c.max != null ? ', ' + c.max.toFixed(2) + ' in worst' : '') : 'Not calibrated', su.notes.cal);
    row('color', su.sampled ? 'ok' : 'warn', (su.method === 'ref' ? 'Empty-sheet match' : 'Color only') + ' · ' + (su.sampled ? 'sampled' : 'not sampled yet'), su.notes.color);
    row('delay', 'ok', su.lat + ' ms');
    const on = !!(st.live && st.live.on); row('track', on ? 'ok' : 'no', on ? 'On · ' + st.live.state : 'Off');
    el('mgrTrackBtn2').textContent = on ? 'Pause tracking' : 'Start tracking';
    const busy = el('mgrBusy'); busy.hidden = !su.task; busy.textContent = su.task ? su.task + '…' : '';
    box.querySelectorAll('button').forEach(b => { b.disabled = !!su.task; });
    const fb = el('mgrFitBtn'); fb.setAttribute('aria-pressed', String(su.fit)); fb.textContent = su.fit ? 'Done adjusting' : 'Adjust corners';
    const lg = el('mgrSetupLog'); lg.textContent = ''; (su.log || []).forEach(m => { const li = document.createElement('li'); li.textContent = m; lg.append(li); });
    el('mgrFitCard').hidden = !su.fit;
    if (su.fit && fitDrag < 0 && !fitTimer && su.pin) fitPin = su.pin.map(p => p.slice());
    drawFit(); drawPv();
  }
  // corner handles: a picture of the projector screen with four dots to drag, or one dot to nudge
  const FIT_PAD = 0.08;            // the picture is inset so a corner at the very edge of the screen can still be grabbed
  const fitIn = v => FIT_PAD + v * (1 - 2 * FIT_PAD);
  function drawFit(){
    const c = el('mgrFitCv'), g = c.getContext('2d'), w = c.width, h = c.height; g.fillStyle = '#10131a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3d4454'; g.lineWidth = 1; g.strokeRect(fitIn(0) * w, fitIn(0) * h, (1 - 2 * FIT_PAD) * w, (1 - 2 * FIT_PAD) * h); if (!fitPin) return;
    g.strokeStyle = '#6f9bff'; g.lineWidth = 2; g.beginPath(); fitPin.forEach(([x, y], i) => i ? g.lineTo(fitIn(x) * w, fitIn(y) * h) : g.moveTo(fitIn(x) * w, fitIn(y) * h)); g.closePath(); g.stroke();
    const sel = Number(el('mgrFitSel').value);
    fitPin.forEach(([x, y], i) => { g.fillStyle = i === sel ? '#ff3b8d' : '#ffffff'; g.beginPath(); g.arc(fitIn(x) * w, fitIn(y) * h, 10, 0, 7); g.fill(); g.fillStyle = '#10131a'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), fitIn(x) * w, fitIn(y) * h + 1); });
  }
  function sendCorner(i){          // at most about 6 a second while dragging; the last position always goes out
    fitLast = i; if (fitTimer) return;
    const go = () => { fitTimer = 0; const p = fitPin[fitLast]; send('pin', {i: fitLast, x: p[0], y: p[1]}, true); };
    fitTimer = setTimeout(go, 160);
  }
  function nudge(v){
    if (!fitPin) return; const i = Number(el('mgrFitSel').value), [dx, dy] = v.split(',').map(Number), step = el('mgrFitCoarse').checked ? 0.02 : 0.004;
    fitPin[i] = [fitPin[i][0] + dx * step, fitPin[i][1] + dy * step]; drawFit(); sendCorner(i);
  }
  const fitCv = el('mgrFitCv');
  const fitXY = e => { const r = fitCv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width - FIT_PAD) / (1 - 2 * FIT_PAD), ((e.clientY - r.top) / r.height - FIT_PAD) / (1 - 2 * FIT_PAD)]; };
  fitCv.addEventListener('pointerdown', e => {
    if (!fitPin) return; const [x, y] = fitXY(e); let best = -1, bd = 0.14;
    fitPin.forEach((p, i) => { const d = Math.hypot((p[0] - x), (p[1] - y) * 0.63); if (d < bd){ bd = d; best = i; } });
    if (best < 0) return; fitDrag = best; el('mgrFitSel').value = String(best); fitCv.setPointerCapture(e.pointerId); e.preventDefault(); drawFit();
  });
  fitCv.addEventListener('pointermove', e => { if (fitDrag < 0) return; const [x, y] = fitXY(e); fitPin[fitDrag] = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]; drawFit(); sendCorner(fitDrag); });
  const fitEnd = () => { fitDrag = -1; };
  fitCv.addEventListener('pointerup', fitEnd); fitCv.addEventListener('pointercancel', fitEnd);
  el('mgrFitSel').addEventListener('change', drawFit);


  // ---------- Debug tab ----------
  const lastEdit = {};          // slider id -> time of the last local change, so a refresh does not snap it back mid-drag
  const sendSoon = (() => { const t = {}; return (key, fn) => { clearTimeout(t[key]); t[key] = setTimeout(fn, 200); }; })();
  function buildSliders(box, items, cmd, idKey){
    const key = items.map(x => x.id || x.k).join('|');
    if (box.dataset.key !== key){
      box.dataset.key = key; box.textContent = '';
      for (const it of items){
        const id = it.id || it.k, lab = document.createElement('label'), name = document.createElement('span'), inp = document.createElement('input'), val = document.createElement('b');
        lab.className = 'mgr-sl'; name.textContent = it.label; inp.type = 'range'; inp.dataset.id = id; val.dataset.val = id;
        inp.min = it.min; inp.max = it.max; inp.step = it.step; lab.append(name, inp, val); box.append(lab);
        inp.addEventListener('input', () => { lastEdit[id] = Date.now(); val.textContent = inp.value; sendSoon(id, () => send(cmd, {[idKey]: id, v: Number(inp.value)}, true)); });
      }
    }
    for (const it of items){
      const id = it.id || it.k, inp = box.querySelector('input[data-id="' + id + '"]'), val = box.querySelector('b[data-val="' + id + '"]');
      if (Date.now() - (lastEdit[id] || 0) > 1500){ inp.value = it.v; val.textContent = it.t; }
    }
  }
  function kv(rows){
    const dl = el('mgrKv'); dl.textContent = '';
    for (const [k, v, s] of rows){ const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; if (s) dd.dataset.s = s; dl.append(dt, dd); }
  }
  function renderDebug(st){
    const d = st.debug; if (!d || tab !== 'debug') return;
    const rt = d.rates || {}, l = st.live || {}, f = n => n >= 1 ? n.toFixed(0) : '–', m = d.motion || {}, b = d.det && d.det.best;
    kv([
      ['Tracking', l.on ? 'on · ' + l.state : 'off'],
      ['Frame rate', f(rt.disp) + ' display · ' + f(rt.cam) + ' camera · ' + f(rt.ana) + ' analyzed' + (l.src ? ' · ' + (rt.ms || 0).toFixed(0) + ' ms' : ''), l.src && rt.ana < 10 ? 'warn' : ''],
      ['Ball seen', l.src ? d.seen + '% of recent frames' + (d.weak ? ' · ' + d.weak + ' by the loose match' : '') : '–'],
      ['Match', d.det ? d.det.count + ' px · ' + d.det.blobs + ' blobs' + (d.det.note ? ' · ' + d.det.note : '') : '–'],
      ['Last ball', b ? b.x.toFixed(2) + ', ' + b.y.toFixed(2) + ' ft · area ' + b.area + ' px (expected ' + b.exp + ') · fill ' + b.fill + ' · aspect ' + b.aspect + (d.det.weak ? ' · loose match' : '') : 'none'],
      ['Movement guard', m.busy ? 'MOVING' : 'still', m.busy ? 'warn' : ''],
      ['Guard numbers', m.now + '% changing · usual ' + m.floor + '% · limit ' + m.thr + '%'],
      ['Empty-sheet photo', d.refAge != null ? d.refAge + ' s old' : 'none'],
      ['Shots started', (d.starts || [0, 0])[0] + ' rolling in · ' + (d.starts || [0, 0])[1] + ' at rest'],
      ['Analysis size', d.pw ? d.pw + '×' + d.ph : '–'],
      ['Screen kept awake', d.wake && d.wake.on ? 'yes' : 'no' + (d.wake && d.wake.why ? ' · ' + d.wake.why : ''), d.wake && d.wake.on ? '' : 'warn']
    ]);
    const o = d.opts || {};
    root.querySelectorAll('#mgrTabDebug [data-opt]').forEach(x => {
      if (x.tagName === 'BUTTON' || document.activeElement === x) return;
      if (x.type === 'checkbox') x.checked = !!o[x.dataset.opt]; else x.value = String(o[x.dataset.opt]);
    });
    buildSliders(el('mgrSliders'), d.sliders || [], 'tune', 'id');
    const cams = Object.keys(d.cam || {}).map(k => Object.assign({k}, d.cam[k]));
    el('mgrCamHead').hidden = el('mgrCamSliders').hidden = !cams.length;
    buildSliders(el('mgrCamSliders'), cams, 'camset', 'k');
    say('mgrCamNote', d.canCam ? (cams.length ? 'If a rolling ball is not seen, shorten the exposure time until the ball is crisp mid-roll. ' : 'This camera has no adjustable exposure, zoom or brightness. ') + (d.lock || '') : 'Camera settings need the phone camera on the Host.');
    const lg = el('mgrDbgLog'); lg.textContent = ''; (d.log || []).slice().reverse().forEach(t => { const li = document.createElement('li'); li.textContent = t; lg.append(li); });
    drawPv();
  }
  root.addEventListener('change', e => {
    const x = e.target; if (x.id === 'mgrPvOn'){ syncWants(); return; }
    if (!x.dataset || !x.dataset.opt || x.tagName === 'BUTTON') return;
    send('opt', {k: x.dataset.opt, v: x.type === 'checkbox' ? x.checked : x.value});
  });
  el('mgrReportBtn').addEventListener('click', async () => {
    const box = el('mgrReportText'); say('mgrReportMsg', 'Asking the Host…');
    const ack = await send('report', undefined, true);
    if (!ack || !ack.ok || !ack.text){ say('mgrReportMsg', ack && ack.error ? 'The Host said: ' + ack.error : 'No report came back. Is the Host online?'); return; }
    box.value = ack.text; box.hidden = false; box.focus(); box.select();
    let ok = false; try { await navigator.clipboard.writeText(ack.text); ok = true; } catch (err) { try { ok = document.execCommand('copy'); } catch (e2) {} }
    say('mgrReportMsg', ok ? 'Report copied (' + Math.round(ack.text.length / 100) / 10 + ' kB). Paste it into an issue or a message.' : 'Copying was blocked, so the report is selected below: press Copy on your keyboard, or touch and hold it.');
  });

  // ---------- footer: add a controller, test, unpair ----------
  el('mgrAdd').addEventListener('click', async () => {
    const dlg = el('mgrAddDlg'); say('mgrAddNote', 'Creating a code…'); el('mgrAddCode').textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    try {
      const p = await pairOpen(room); pairPaint(el('mgrAddQr'), p.link); el('mgrAddCode').textContent = relayShowCode(p.code);
      const tick = () => { const left = Math.round((p.exp - relayNow()) / 1000); say('mgrAddNote', left > 0 ? 'Scan with the other phone’s camera, or type the code. Works once, for ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' more.' : 'This code has expired. Close this and tap Add a controller again.'); };
      clearInterval(addTimer); tick(); addTimer = setInterval(tick, 1000);
    } catch (e) { say('mgrAddNote', 'Could not create a code: ' + e.message); }
  });
  el('mgrAddClose').addEventListener('click', () => { clearInterval(addTimer); const d = el('mgrAddDlg'); if (d.close) d.close(); else d.removeAttribute('open'); });
  el('mgrTest').addEventListener('click', async () => {
    const box = el('mgrTestBox'), ul = el('mgrSteps'), rows = []; box.hidden = false; ul.textContent = ''; el('mgrTest').disabled = true;
    try { await relaySelfTest(r => { rows.push(r); pairSteps(ul, rows); }); } finally { el('mgrTest').disabled = false; }
  });
  let unpairArm = 0;
  el('mgrUnpair').addEventListener('click', () => {            // two taps, so it can't happen by accident
    const b = el('mgrUnpair');
    if (!unpairArm){ b.textContent = 'Tap again to unpair'; unpairArm = setTimeout(() => { unpairArm = 0; b.textContent = 'Unpair'; }, 4000); return; }
    clearTimeout(unpairArm); unpairArm = 0; b.textContent = 'Unpair'; if (room && myId) relayDelete('rooms/' + room + '/hb/mgr/' + myId).catch(() => {}); save(null); showJoin();
  });

  // ---------- event lock ----------
  // Setup and Debug can change calibration and tracking, so they stay hidden during an event until someone holds the lock button.
  // The unlock lasts for this browser session and ends after ten idle minutes or a tap on the button.
  const LOCK_HOLD_MS = 900, LOCK_IDLE_MS = 600000, LOCK_KEY = 'putt-lab-mgr-unlocked';
  let unlockedAt = 0, holdTimer = 0, idleTimer = 0, justUnlocked = false;
  try { const t = Number(sessionStorage.getItem(LOCK_KEY)); if (t && Date.now() - t < LOCK_IDLE_MS) unlockedAt = t; } catch (e) {}
  function applyLock(){
    const u = unlockedAt > 0;
    root.querySelectorAll('.mgr-tab[data-tab="setup"], .mgr-tab[data-tab="debug"]').forEach(b => { b.hidden = !u; });
    el('mgrLock').dataset.s = u ? 'open' : 'locked'; say('mgrLockTxt', u ? 'Lock' : 'Hold to unlock Setup and Debug');
    if (!u && tab !== 'run') showTab('run');
    clearTimeout(idleTimer); if (u) idleTimer = setTimeout(() => setLock(false), Math.max(1000, LOCK_IDLE_MS - (Date.now() - unlockedAt)));
  }
  function setLock(open){
    unlockedAt = open ? Date.now() : 0;
    try { if (open) sessionStorage.setItem(LOCK_KEY, String(unlockedAt)); else sessionStorage.removeItem(LOCK_KEY); } catch (e) {}
    applyLock();
  }
  function holdStart(){
    if (unlockedAt || holdTimer) return;
    el('mgrLock').classList.add('holding');
    holdTimer = setTimeout(() => { holdTimer = 0; el('mgrLock').classList.remove('holding'); justUnlocked = true; setTimeout(() => { justUnlocked = false; }, 400); setLock(true); }, LOCK_HOLD_MS);
  }
  function holdEnd(){ clearTimeout(holdTimer); holdTimer = 0; el('mgrLock').classList.remove('holding'); }
  const lockBtn = el('mgrLock');
  lockBtn.addEventListener('pointerdown', holdStart);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => lockBtn.addEventListener(t, holdEnd));
  lockBtn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) holdStart(); });
  lockBtn.addEventListener('keyup', holdEnd);
  lockBtn.addEventListener('contextmenu', e => e.preventDefault());
  lockBtn.addEventListener('click', () => { if (unlockedAt && !justUnlocked) setLock(false); });
  root.addEventListener('pointerdown', e => { if (unlockedAt && e.target !== lockBtn && !lockBtn.contains(e.target)){ unlockedAt = Date.now(); try { sessionStorage.setItem(LOCK_KEY, String(unlockedAt)); } catch (err) {} applyLock(); } }, true);
  applyLock();

  // ---------- go ----------
  function joinFromAddress(){
    const code = (location.hash.match(/^#manage=([A-Za-z0-9-]+)/) || [])[1]; if (!code) return false;
    try { history.replaceState(null, '', location.href.split('#')[0] + '#manage'); } catch (e) {}      // do not leave the code in the address
    el('mgrCodeIn').value = relayShowCode(relayCleanCode(code));
    tryJoin(code); return true;
  }
  window.addEventListener('hashchange', joinFromAddress);       // a pairing link opened on a page that is already showing
  if (!joinFromAddress()){ if (load()) start(); else showJoin(); }
}

// The Manager does not run the games or touch the camera.
if (ROLE === 'manage'){ runManager(); return; }
