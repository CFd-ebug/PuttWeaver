// ================= the results screen (Host, projector) =================
// Shown for FLOW.resultsSecs after a hole is finished and the ball is picked up (97-flow.js decides when). It has the score, how it
// compares with everyone who played the hole before on this rig (the Host's statistics, 96-remote-shots.js), and a looping replay of
// each putt. The controller shows the game picker meanwhile; a game picked there starts when the results end.
function flowHoleDone(){                                    // called when the last putt of a hole is in
  FLOW.res = null;
  if (ROLE !== 'host' || !game || !game.hole) return;
  const h = game.hole(); if (!h || !h.final || !h.list.length || h.list[0].strokes == null) return;
  const r = FLOW.res = {id: game.id, name: game.name, strokes: h.list[0].strokes, par: h.par, dist: null};
  if (remoteCounts()) statsLoad().then(() => { r.dist = Object.assign({}, STATS.holes[r.id] || {}); });      // after remoteHoleDone has counted this hole
}
function flowKeepShot(rec){                                  // a putt of this hole, with the picture of the sheet it was played on
  const s = {n: rec.n, title: rec.title, verdict: rec.verdict || '', tone: rec.tone, path: rec.path || [], rest: rec.rest, sw: rec.sw || W, sd: rec.sd || D, im: null};
  if (rec.img){ s.im = new Image(); s.im.src = rec.img; }
  FLOW.shots = FLOW.shots.filter(x => x.n !== s.n).concat(s).slice(-4);
}
// How the hole compares: counts for 1 to 5+ strokes, and the share of earlier players this score beat or tied (ties count half).
function flowCompare(r){
  const d = r.dist || {}, bars = [0, 0, 0, 0, 0];
  for (const k in d){ const n = Number(d[k]) || 0, i = Math.min(5, Math.max(1, Number(k) || 1)) - 1; bars[i] += n; }
  const total = bars.reduce((a, b) => a + b, 0), mine = Math.min(5, Math.max(1, r.strokes)) - 1, others = total - 1;
  let pct = null;
  if (r.dist && others >= 3){ let w = 0; for (let i = mine + 1; i < 5; i++) w += bars[i]; pct = Math.round((w + (bars[mine] - 1) / 2) / others * 100); }
  return {bars, total, mine, others, pct};
}
function flowDrawResults(){
  const r = FLOW.res; if (!r){ ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, D); return; }
  const t = (performance.now() - FLOW.t0) / 1000, left = Math.max(0, FLOW.resultsSecs - t), s = W / 1920;
  ctx.save(); ctx.scale(s, s);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1920, 1080);
  const sp = (g, em, size) => { if ('letterSpacing' in g) g.letterSpacing = (em * size) + 'px'; };
  const txt = (str, x, y, size, col, o) => {
    o = o || {}; ctx.font = o.mono ? `600 ${size}px "IBM Plex Mono", monospace` : htFont(size, o.w || 800); ctx.fillStyle = col; ctx.textAlign = o.al || 'left'; ctx.textBaseline = 'alphabetic';
    sp(ctx, o.em || 0, size); ctx.fillText(str, x, y); sp(ctx, 0, size);
  };
  // ---- left: the score ----
  txt('HOLE COMPLETE · ' + r.name.toUpperCase(), 56, 104, 32, '#0a0a0a', {mono: true});
  const big = String(r.strokes); ctx.font = htFont(440, 800); sp(ctx, -.06, 440); const bw = ctx.measureText(big).width; sp(ctx, 0, 440);
  txt(big, 44, 500, 440, '#0a0a0a', {em: -.06});
  const lx = 56 + bw + 36;
  txt(r.strokes === 1 ? 'STROKE' : 'STROKES', lx, 330, 84, '#1a3cff', {em: -.045});
  txt('PAR ' + r.par, lx, 392, 42, '#0a0a0a', {mono: true});
  const diff = r.strokes - r.par, word = diff === 0 ? 'ON PAR' : diff < 0 ? Math.abs(diff) + ' UNDER PAR' : diff + ' OVER PAR', col = diff < 0 ? '#1a3cff' : diff === 0 ? '#0a0a0a' : '#e5002b';
  ctx.font = htFont(44, 800); sp(ctx, -.02, 44); const ww = ctx.measureText(word).width; sp(ctx, 0, 44);
  ctx.fillStyle = col; ctx.fillRect(lx, 418, ww + 44, 70); txt(word, lx + 22, 469, 44, '#ffffff', {em: -.02});
  // ---- left: everyone else ----
  const c = flowCompare(r);
  txt('HOW EVERYONE ELSE DID', 56, 612, 28, '#0a0a0a', {mono: true});
  const line = c.pct != null ? 'BETTER THAN ' + c.pct + '% OF PLAYERS' : c.dist ? 'ONE OF THE FIRST PLAYERS ON THIS HOLE' : '';
  txt(line, 56, 684, 50, '#0a0a0a', {em: -.03});
  const bx = 56, by = 924, bwid = 132, gap = 36, mx = Math.max(1, ...c.bars);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(bx, by, 5 * bwid + 4 * gap, 4);
  c.bars.forEach((n, i) => {
    const x = bx + i * (bwid + gap), h = n ? Math.max(8, Math.round(n / mx * 190)) : 0, me = i === c.mine;
    if (h){ ctx.fillStyle = me ? '#1a3cff' : '#c8cce0'; ctx.fillRect(x, by - h, bwid, h); }
    if (c.dist) txt(String(n), x + bwid / 2, by - h - 14, 28, me ? '#1a3cff' : '#0a0a0a', {mono: true, al: 'center'});
    txt(i === 4 ? '5+' : String(i + 1), x + bwid / 2, by + 44, 30, me ? '#1a3cff' : '#0a0a0a', {mono: true, al: 'center'});
  });
  // ---- right: the putts ----
  const shots = FLOW.shots, n = shots.length, rx = 980, rw = 884;
  txt('YOUR PUTTS', rx, 104, 32, '#0a0a0a', {mono: true});
  if (n){
    const cols = n <= 1 ? 1 : 2, gx = 28, gy = 36, pw = (rw - gx * (cols - 1)) / cols, ph = pw * D / W, th = ph + 116, rows = Math.ceil(n / cols), gh = rows * th + (rows - 1) * gy, y0 = 150 + (860 - gh) / 2;
    shots.forEach((sh, i) => flowDrawReplay(sh, i, rx + (i % cols) * (pw + gx), y0 + Math.floor(i / cols) * (th + gy), pw, ph, t));
  }
  // ---- footer: what happens next ----
  const q = FLOW.queued >= 0 && GAMES[FLOW.queued] ? GAMES[FLOW.queued].name : '';
  txt(q ? 'UP NEXT · ' + q.toUpperCase() : 'NEXT · PICK YOUR GAME ON THE CONTROLLER', 56, 1030, 26, q ? '#1a3cff' : '#0a0a0a', {mono: true});
  txt(Math.ceil(left) + ' S', 1864, 1030, 26, '#0a0a0a', {mono: true, al: 'right'});
  ctx.fillStyle = '#e6e8f2'; ctx.fillRect(0, 1056, 1920, 24); ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 1056, 1920 * left / Math.max(1, FLOW.resultsSecs), 24);
  ctx.restore();
}
// one putt: the picture of the sheet, the ball rolling along its path again and again, a ring where it stopped
function flowDrawReplay(sh, i, x, y, w, h, t){
  ctx.fillStyle = '#eef0f8'; ctx.fillRect(x, y, w, h);
  if (sh.im && sh.im.complete && sh.im.naturalWidth) ctx.drawImage(sh.im, x, y, w, h);
  const P = sh.path, dur = P.length ? Math.max(.3, P[P.length - 1][2] / 1000) : .3, cyc = dur + 1.6, tt = (t + i * .4) % cyc, cur = Math.min(tt, dur) * 1000;
  const px = p => x + p[0] / sh.sw * w, py = p => y + p[1] / sh.sd * h;
  if (P.length > 1){
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.lineWidth = 6; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(10,10,10,.6)'; ctx.beginPath(); ctx.moveTo(px(P[0]), py(P[0]));
    let bx = px(P[0]), by = py(P[0]);
    for (let k = 1; k < P.length; k++){
      if (P[k][2] <= cur){ ctx.lineTo(px(P[k]), py(P[k])); bx = px(P[k]); by = py(P[k]); }
      else { const a = P[k - 1], f = (cur - a[2]) / Math.max(1, P[k][2] - a[2]); bx = px(a) + (px(P[k]) - px(a)) * f; by = py(a) + (py(P[k]) - py(a)) * f; ctx.lineTo(bx, by); break; }
    }
    ctx.stroke(); howtoBall(ctx, bx, by, 15); ctx.restore();
  }
  if (sh.rest && tt >= dur){ ctx.beginPath(); ctx.arc(x + sh.rest[0] / sh.sw * w, y + sh.rest[1] / sh.sd * h, 22, 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = '#1a3cff'; ctx.stroke(); }
  ctx.lineWidth = 3; ctx.strokeStyle = '#0a0a0a'; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  const col = sh.tone === 'good' ? '#1a3cff' : sh.tone === 'bad' ? '#e5002b' : '#0a0a0a';
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = `600 24px "IBM Plex Mono", monospace`; ctx.fillStyle = '#0a0a0a'; ctx.fillText('PUTT ' + String(sh.n).padStart(2, '0'), x, y + h + 32);
  if (sh.verdict){ ctx.font = `600 22px "IBM Plex Mono", monospace`; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(sh.verdict.toUpperCase(), x + w, y + h + 32); }
  // the quip gets lines of its own, so it never runs into the label above it: one line if it fits at a readable size, otherwise two
  const qt = sh.title || ''; let size = 30; ctx.textAlign = 'left'; ctx.fillStyle = '#0a0a0a'; ctx.font = htFont(size, 800);
  while (size > 24 && ctx.measureText(qt).width > w){ size -= 1; ctx.font = htFont(size, 800); }
  let lines = [qt];
  if (ctx.measureText(qt).width > w){
    const words = qt.split(' '); let best = 1e9;
    for (let i = 1; i < words.length; i++){ const a1 = words.slice(0, i).join(' '), b1 = words.slice(i).join(' '), m = Math.max(ctx.measureText(a1).width, ctx.measureText(b1).width); if (m < best){ best = m; lines = [a1, b1]; } }
    while (lines.length === 2 && size > 18 && Math.max(ctx.measureText(lines[0]).width, ctx.measureText(lines[1]).width) > w){ size -= 1; ctx.font = htFont(size, 800); }
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + h + 74 + i * (size + 6)));
}
