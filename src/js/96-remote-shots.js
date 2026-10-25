// ================= shot replays and play statistics (the Host side) =================
// Only a paired Host on the projector records anything: Evaluators (#play) never reach the network and never count.
//   rooms/<room>/shots/<n>   the shots of the hole being played: result, ball path, target, and a picture of the projected sheet
//   rooms/<room>/stats       running totals shared by every hole played on this rig (see STATS below)
// The Host is the only writer, so the totals are kept in memory here and written back whole; a console command resets them.
const SHOTS = {n: 0, rec: null, snap: false, timer: 0, rev: 0};     // rev and statsRev go into the published state, so a Manager knows when to fetch
let statsRev = 0;
const STATS_EMPTY = () => ({n: 0, holes: {}, places: {}});
// n: holes played; holes[gameId][strokes]: how many holes ended with that score; places[key]: {name, x, y, n, close, ksum, nk}
// where x and y are fractions of the sheet, n tries, close how many were close, ksum/nk the km miss total and how many had a reading.
let STATS = STATS_EMPTY(), statsReady = null, statsTimer = 0;
const statsBase = () => 'rooms/' + REMOTE.room + '/';
const remoteCounts = () => ROLE === 'host' && REMOTE.on && REMOTE.sync;

function statsLoad(){
  if (!statsReady) statsReady = relayGet(statsBase() + 'stats').then(v => { STATS = Object.assign(STATS_EMPTY(), v || {}); STATS.holes = STATS.holes || {}; STATS.places = STATS.places || {}; }).catch(() => { statsReady = null; });
  return statsReady;
}
function statsSave(){
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => { if (remoteCounts()) relayPut(statsBase() + 'stats', STATS).then(() => { statsRev++; REMOTE.key = ''; }).catch(() => {}); }, 1500);
}
async function remoteStatsReset(){
  clearTimeout(statsTimer); STATS = STATS_EMPTY(); statsReady = Promise.resolve();
  await relayDelete(statsBase() + 'stats'); await relayDelete(statsBase() + 'shots'); SHOTS.n = 0; SHOTS.rec = null; SHOTS.rev++; statsRev++; REMOTE.key = '';
}

// ---------- a new hole starts: the replays of the last one are no longer wanted ----------
function remoteHoleStart(){
  if (!remoteCounts()) return;
  clearTimeout(SHOTS.timer); SHOTS.n = 0; SHOTS.rec = null; SHOTS.snap = false;
  relayDelete(statsBase() + 'shots').then(() => { SHOTS.rev++; REMOTE.key = ''; }).catch(() => {});
}

// ---------- a shot has a result ----------
function remoteShotDone(r){
  if (!remoteCounts() || !game || !shot) return;
  const info = game.shotInfo ? game.shotInfo() : null;
  const t0 = shot.delivered.length ? shot.delivered[0].t : 0, ds = shot.delivered;
  const step = Math.max(1, Math.ceil(ds.length / 60)), path = [];
  for (let i = 0; i < ds.length; i += step) path.push([r3(ds[i].x), r3(ds[i].y), Math.round((ds[i].t - t0) * 1000)]);
  if (ds.length && (ds.length - 1) % step) { const l = ds[ds.length - 1]; path.push([r3(l.x), r3(l.y), Math.round((l.t - t0) * 1000)]); }
  const rec = {n: ++SHOTS.n, game: game.id, title: r.title || '', detail: r.detail || '', tone: r.tone || '', path, rest: shot.rest ? [r3(shot.rest.x), r3(shot.rest.y)] : null, sw: W, sd: D};
  if (info){
    rec.tgt = {x: r3(info.x), y: r3(info.y), r: r3(info.r), name: info.name}; rec.hit = !!info.hit;
    if (info.off != null) rec.off = Math.round(info.off * 10) / 10;
    if (info.km != null) rec.km = Math.round(info.km);
    statsLoad().then(() => {
      const p = STATS.places[info.key] = STATS.places[info.key] || {name: info.name, x: r3(info.x / W), y: r3(info.y / D), n: 0, close: 0, ksum: 0, nk: 0};
      p.n++; if (info.hit) p.close++; if (info.km != null){ p.ksum += Math.round(info.km); p.nk++; }
      statsSave();
    });
  }
  SHOTS.rec = rec; SHOTS.snap = true;
  clearTimeout(SHOTS.timer); SHOTS.timer = setTimeout(() => remoteShotSend(null), 900);         // no picture (not on the projector view)? send without
}
// Called from drawProj right after the game has drawn the sheet, before the ball and any banner: copies it as a small picture.
function sheetPicture(w, q0, max){           // the sheet as the projector shows it right now, as a small JPEG data address
  const h = Math.round(w * D / W), c = SHOTS.cv || (SHOTS.cv = document.createElement('canvas')); c.width = w; c.height = h;
  c.getContext('2d').drawImage(cvs, -view.ox * view.T, -view.oy * view.T, W * view.T, D * view.T, 0, 0, w, h);
  let q = q0, url = ''; for (;;){ url = c.toDataURL('image/jpeg', q); if (url.length < max || q <= 0.3) break; q -= 0.1; }
  return url;
}
function remoteSnapSheet(){
  SHOTS.snap = false;
  try { remoteShotSend(sheetPicture(480, 0.6, 45000)); } catch (e) { remoteShotSend(null); }
}
function remoteShotSend(img){
  const rec = SHOTS.rec; if (!rec || rec.sent) return; rec.sent = true; clearTimeout(SHOTS.timer); SHOTS.snap = false;
  const out = Object.assign({}, rec); delete out.sent; if (img && img.length < 60000) out.img = img;
  relayPut(statsBase() + 'shots/' + rec.n, out).then(() => { SHOTS.rev++; REMOTE.key = ''; }).catch(() => {});
}

// ---------- a hole is finished ----------
function remoteHoleDone(){
  if (!remoteCounts() || !game || !game.hole) return;
  const h = game.hole(); if (!h || !h.final || !h.list.length || h.list[0].strokes == null) return;
  const s = String(h.list[0].strokes);
  statsLoad().then(() => { STATS.n++; const g = STATS.holes[game.id] = STATS.holes[game.id] || {}; g[s] = (g[s] || 0) + 1; statsSave(); });
}
