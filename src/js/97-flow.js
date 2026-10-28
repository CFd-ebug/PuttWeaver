// ================= what the players see on the projector (Host) =================
// While tracking runs, the projector shows three banners that walk a player through a putt, and between games a "Pick your game" screen
// that is answered on the controller (the Manager console). The drawing is shared with the console (08-howto.js, 08-gamepick.js).
//   1 BALL AT START  the round is being set up (the empty-sheet photo); chevrons point down to where the ball goes (the tee, off the sheet)
//   2 PUTT NOW       ready; slightly see-through and gone after FLOW.bannerSecs, because it is the one banner that covers the game
//   3 RESET BALL     the result is showing and the ball is still on the sheet; a dotted route leads back to the start. It waits
//                    FLOW.feedbackSecs after the result so the players can read how the putt went (the toast at the top of the sheet)
//                    before being told to pick the ball up.
// Players never see any of this on an Evaluator, and without a paired controller the games simply restart as before.
const FLOW_KEY = 'putt-lab-flow';
const FLOW = {phase: 'play', hover: -1, hoverAt: 0, t0: 0, b3off: false, bannerSecs: 5, resultsSecs: 15, feedbackSecs: 4, resultAt: -1e9, queued: -1, res: null, shots: [], imgs: {}, lost: 0};
try { const c = JSON.parse(localStorage.getItem(FLOW_KEY) || '{}'); if (isFinite(c.bannerSecs)) FLOW.bannerSecs = clamp(+c.bannerSecs, 0, 30); if (isFinite(c.resultsSecs)) FLOW.resultsSecs = clamp(+c.resultsSecs, 0, 60); if (isFinite(c.feedbackSecs)) FLOW.feedbackSecs = clamp(+c.feedbackSecs, 0, 15); } catch (e) {}
try { document.fonts.load('800 20px Inter'); document.fonts.load('700 20px Inter'); document.fonts.load('600 20px "IBM Plex Mono"'); } catch (e) {}
const flowOn = () => ROLE === 'host' && LIVE.on;
const flowCanSelect = () => flowOn() && REMOTE.on && REMOTE.sync && REMOTE.mgrs > 0;
function flowReset(){ FLOW.phase = 'play'; FLOW.hover = -1; FLOW.b3off = false; FLOW.queued = -1; FLOW.res = null; FLOW.shots = []; }                      // a game has started: back to playing
function flowSelectStart(){
  FLOW.phase = 'select'; FLOW.hover = -1; FLOW.t0 = performance.now(); FLOW.lost = 0; REMOTE.key = '';
  llog('Waiting for the next game to be picked on the controller');
}
function flowSave(){ try { localStorage.setItem(FLOW_KEY, JSON.stringify({bannerSecs: FLOW.bannerSecs, resultsSecs: FLOW.resultsSecs, feedbackSecs: FLOW.feedbackSecs})); } catch (e) {} }
// called every tracking tick while the results or the "Pick your game" screen is up
function flowTick(){
  if (FLOW.phase === 'results'){ if ((performance.now() - FLOW.t0) / 1000 >= FLOW.resultsSecs) flowResultsEnd(); return; }
  if (FLOW.phase !== 'select') return;
  if (REMOTE.mgrs > 0 && REMOTE.sync) FLOW.lost = 0; else if (!FLOW.lost) FLOW.lost = state.clock;
  if (FLOW.lost && state.clock - FLOW.lost > 8){ llog('Nobody is picking a game; starting the same one again'); startGame(); if (LIVE.on) armReady(); }
}
// the hole is over and the ball is picked up: results first (if there is a score and they are switched on), then the game picker
function flowAfterHole(){
  if (FLOW.res && FLOW.resultsSecs > 0){
    FLOW.phase = 'results'; FLOW.hover = -1; FLOW.queued = -1; FLOW.t0 = performance.now(); FLOW.lost = 0; REMOTE.key = '';
    llog('Showing the results for ' + FLOW.resultsSecs + ' s');
  } else flowSelectStart();
}
function flowResultsEnd(){
  const q = FLOW.queued;
  if (q >= 0 && q < GAMES.length){ llog('Starting ' + GAMES[q].name + ', picked during the results'); gameIdx = q; startGame(); if (LIVE.on) armReady(); }
  else flowSelectStart();
}

// ---- banners ----
// The camera sees what the projector draws, so a banner changes the picture over the top strip of the sheet. Two rules keep the
// tracker from mistaking that for a ball: the empty-sheet photo is taken with no banner on the sheet (banner 1 is hidden for the
// last moments of setting up), and while a banner is on, blobs inside its strip are ignored (flowStripY, used by detectBall).
function flowStep(){                                          // which banner the players should see: 1, 2, 3 or 0
  if (LIVE.state !== 'collect') FLOW.b3off = false;
  if (!flowOn() || FLOW.phase !== 'play' || REMOTE.hold) return 0;
  if (LIVE.state === 'arming') return LIVE.refHideAt ? 0 : 1;
  if (LIVE.state === 'ready') return FLOW.bannerSecs > 0 && state.clock - LIVE.readyAt < FLOW.bannerSecs ? 2 : 0;
  if (LIVE.state === 'collect' && (mode === 'result' || mode === 'over') && !FLOW.b3off){
    if (state.clock - LIVE.lastSeen <= 0.5) return state.clock - FLOW.resultAt >= FLOW.feedbackSecs ? 3 : 0;      // the result is on show first; banner 3 follows
    FLOW.b3off = true;                                        // picked up (or hidden under the banner): shown once per result
  }
  return 0;
}
const flowStripY = () => flowStep() ? 200 / 1080 * D + 0.3 : 0;   // feet from the far edge covered by the banner (plus the reach of a blob that is half hidden by it); 0 when none is up
function flowDrawBanner(){                                    // inside the sheet's clip, in feet
  const step = flowStep(); if (!step) return;
  const t = performance.now() / 1000;
  ctx.save(); ctx.scale(W / 1920, W / 1920);
  if (step === 2){
    ctx.globalAlpha = .86 * Math.min(1, (FLOW.bannerSecs - (state.clock - LIVE.readyAt)) / .5); howtoBanner(ctx, 2, .8 + .2 * Math.cos((t % 1) * 2 * Math.PI));
  } else {
    howtoBanner(ctx, step);
    if (step === 1){ howtoChevrons(ctx, 430, 840, t); howtoChevrons(ctx, 1490, 840, t); }
    else if (shot && shot.rest){
      const from = [shot.rest.x / W * 1920, shot.rest.y / D * 1080], to = [TEE.x / W * 1920, 1080];
      howtoReturn(ctx, howtoRoute(from, to), t, 1); howtoHand(ctx, to[0], to[1] - 30);
    }
  }
  ctx.restore();
}

// what the projector shows right now, in words, for the console
function flowLabel(){ return FLOW.phase === 'select' ? 'Pick your game' : FLOW.phase === 'results' ? 'Results' + (FLOW.queued >= 0 && GAMES[FLOW.queued] ? ' · up next ' + GAMES[FLOW.queued].name : '') : (['', 'Ball at start', 'Putt now', 'Reset ball'][flowStep()] || (game ? game.name : '')); }

// ---- the "Pick your game" screen ----
function flowImg(id){
  if (FLOW.imgs[id]) return FLOW.imgs[id];
  const p = typeof GAME_PREVIEWS !== 'undefined' && GAME_PREVIEWS[id]; if (!p) return null;
  const im = FLOW.imgs[id] = new Image(); im.src = p.img; return im;
}
function flowTiles(){                                         // [{i, game}] for the games that are shown
  return GAMES.map((g, i) => ({i, g})).filter(e => shownIds.includes(e.g.id));
}
function flowDrawSelect(){
  const t = (performance.now() - FLOW.t0) / 1000, s = W / 1920;
  ctx.save(); ctx.scale(s, s);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const left = (txt, x, y, size, col, em, weight) => { ctx.font = htFont(size, weight); ctx.fillStyle = col; ctx.textAlign = 'left'; if ('letterSpacing' in ctx) ctx.letterSpacing = (em * size) + 'px'; ctx.fillText(txt, x, y); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; };
  left('PICK YOUR', 56, 148, 112, '#0a0a0a', -.065); left('GAME', 56, 246, 112, '#0a0a0a', -.065);
  // "on the controller" with a little tablet
  ctx.save(); ctx.translate(58, 286); ctx.lineWidth = 7; ctx.strokeStyle = '#0a0a0a'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(3, 3, 138, 96, 8); ctx.fill(); ctx.stroke();
  [[22, 22, '#1a3cff'], [60, 22, '#0a0a0a'], [98, 22, '#0a0a0a'], [22, 52, '#0a0a0a'], [60, 52, '#0a0a0a'], [98, 52, '#0a0a0a']].forEach(r => { ctx.fillStyle = r[2]; ctx.fillRect(r[0] - 4, r[1] - 4, 30, 20); });
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(40, 107, 58, 8);
  const pr = (t % 1.4) / 1.4; ctx.globalAlpha = 1 - pr; ctx.beginPath(); ctx.arc(71, 28, 6 + 14 * pr, 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = '#e5002b'; ctx.stroke(); ctx.restore();
  left('ON THE', 232, 332, 62, '#1a3cff', -.045); left('CONTROLLER', 232, 392, 62, '#1a3cff', -.045);
  // the person
  ctx.save(); ctx.translate(56, 437); howtoPerson(ctx, t, howtoSheetImage()); ctx.restore();
  // the tiles
  const tiles = flowTiles(), n = tiles.length, cols = n <= 6 ? 3 : n <= 8 ? 4 : 5, rows = Math.ceil(n / cols);
  const gx = 28, gy = 34, x0 = 745, w = (1864 - x0 - gx * (cols - 1)) / cols, k = w / 354, ph = w * 9 / 16, lh = 62 * k, th = ph + lh + 6, gh = rows * th + (rows - 1) * gy;
  const y0 = 56 + (980 - gh) / 2;
  tiles.forEach((e, j) => {
    const x = x0 + (j % cols) * (w + gx), y = y0 + Math.floor(j / cols) * (th + gy), sel = FLOW.hover === e.i && state.clock - FLOW.hoverAt < 4, bw = sel ? 9 : 3, col = sel ? '#1a3cff' : '#0a0a0a';
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, th);
    const ix = x + bw, iy = y + bw, iw = w - 2 * bw, ih = ph - bw;
    ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
    const im = flowImg(e.g.id), pv = typeof GAME_PREVIEWS !== 'undefined' && GAME_PREVIEWS[e.g.id];
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, ix, iy, iw, ih); else { ctx.fillStyle = '#e9ecf6'; ctx.fillRect(ix, iy, iw, ih); }
    if (pv){ ctx.save(); ctx.translate(ix, iy); ctx.scale(iw / 160, ih / 90); pickFx(ctx, e.g.id, pv.tx, pv.ty, t + (j + 1) * .62); ctx.restore(); }
    ctx.restore();
    const nb = String(e.i + 1).padStart(2, '0'); ctx.font = `600 ${22 * k}px "IBM Plex Mono", monospace`; ctx.fillStyle = '#0a0a0a'; ctx.fillRect(ix, iy, 24 * k + ctx.measureText(nb).width, 38 * k);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(nb, ix + 11 * k, iy + 28 * k);
    ctx.fillStyle = col; ctx.fillRect(x, y + ph, w, bw); ctx.fillStyle = '#fff'; ctx.fillRect(x + bw, y + ph + bw, w - 2 * bw, lh - bw);
    left(e.g.name, x + 18 * k, y + ph + bw + lh * .66, 32 * k, sel ? '#1a3cff' : '#0a0a0a', -.04, 700);
    ctx.lineWidth = bw; ctx.strokeStyle = col; ctx.strokeRect(x + bw / 2, y + bw / 2, w - bw, th - bw);
  });
  ctx.restore();
}
function flowClip(blobs){ const y = flowStripY(); return y ? blobs.filter(b => b.y > y) : blobs; }   // ignore what is inside the banner's strip
