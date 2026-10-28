// ================= game picker pictures (Manager console) =================
// Each game gets a tile: a picture of what the projector shows at the start of the game (GAME_PREVIEWS, made by
// scripts/gen-previews.js from the real engine) with a small looping animation on top: a ball rolls from the tee to where a good
// putt would end, and the game's reaction pops up. This file sits before 08-manager.js because the Manager returns from the script
// there; it must not use the engine (games, rig, units).
const PICK_PINS = [[67.4, 15.9], [75.7, 15.9], [84.2, 15.9], [92.5, 15.9], [71.5, 23.2], [80, 23.2], [88.3, 23.2], [75.7, 30.5], [84.2, 30.5], [80, 37.8]];
const PICK_BALL = '<circle r="2.7" fill="#fff" stroke="#0a0a0a" stroke-width=".9"/><circle r=".7" fill="#0a0a0a"/>';

// The looping animation for one game as SVG markup (viewBox 160 x 90, drawn over the picture). Only fixed numbers go in.
function pickAnimation(id, tx, ty){
  const x = Math.round(tx * 160 * 10) / 10, y = Math.round(ty * 90 * 10) / 10;
  const path = `M80 97 C ${(80 + (x - 80) * 0.15).toFixed(1)} ${(97 - (97 - y) * 0.45).toFixed(1)}, ${(x - (x - 80) * 0.1).toFixed(1)} ${(y + (97 - y) * 0.3).toFixed(1)}, ${x} ${y}`;
  const ring = (r, col, fill, extra) => `<circle class="gk-fx" cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${col}" stroke-width="1.1" ${extra || ''}/>`;
  let fx;
  if (id === 'timeline') fx = `<g class="gk-fx"><line x1="${x}" y1="12" x2="${x}" y2="${y}" stroke="#c9302a" stroke-width="1.2"/><rect x="${x}" y="12" width="26" height="9" fill="#c9302a"/></g>`;
  else if (id === 'ttt') fx = `<g class="gk-fx" stroke="#1a3cff" stroke-width="3" stroke-linecap="round"><line x1="${x - 8}" y1="${y - 8}" x2="${x + 8}" y2="${y + 8}"/><line x1="${x + 8}" y1="${y - 8}" x2="${x - 8}" y2="${y + 8}"/></g>`;
  else if (id === 'bowling') fx = PICK_PINS.map((p, k) => `<circle class="gk-fx" cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#c4c8d6" stroke="#8a8fa3" stroke-width=".6" style="animation-delay:calc(var(--d) + ${(0.05 * (k % 5)).toFixed(2)}s)"/>`).join('');
  else if (id === 'gallery') fx = ring(8, '#e5002b', 'rgba(229,0,43,.18)') + `<g class="gk-fx" stroke="#e5002b" stroke-width="1.3" stroke-linecap="round"><line x1="${x}" y1="${y - 13}" x2="${x}" y2="${y - 9}"/><line x1="${x - 12}" y1="${y - 7}" x2="${x - 9}" y2="${y - 4}"/><line x1="${x + 12}" y1="${y - 7}" x2="${x + 9}" y2="${y - 4}"/></g>`;
  else if (id === 'periodic') fx = `<rect class="gk-fx" x="${x - 6.4}" y="${y - 5}" width="12.8" height="10" fill="rgba(26,60,255,.18)" stroke="#1a3cff" stroke-width="1.4"/>`;
  else if (id === 'paint') fx = `<path class="gk-fx2" d="M135 8 C 120 20, 150 30, 110 44 C 96 49, 120 62, 100 70" fill="none" stroke="#1a3cff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`;
  else fx = ring(id === 'map' ? 10 : 9, '#1a3cff', 'rgba(26,60,255,.16)');
  const trail = `<path class="gk-pt" pathLength="1" d="${path}" fill="none" stroke="${id === 'paint' ? '#e0187f' : '#0a0a0a'}" stroke-width="${id === 'paint' ? 5 : 1.2}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${id === 'paint' ? 0.75 : 0.45}" stroke-dasharray="1" stroke-dashoffset="1"/>`;
  const ball = `<g class="gk-pb" style="offset-path:path('${path}')">${PICK_BALL}</g>`;
  return `<svg viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true">${trail}${fx}${ball}</svg>`;
}

// One tile. n is the game's number in the full list (1-based), shown in the corner. Returns a button.
function pickTile(g, n, idx, k){
  const p = (typeof GAME_PREVIEWS !== 'undefined' && GAME_PREVIEWS[g.id]) || null;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'gk'; b.dataset.idx = String(idx); b.style.setProperty('--d', (-(k + 1) * 0.62).toFixed(2) + 's');
  const pv = document.createElement('span'); pv.className = 'gk-pv';
  if (p){ const im = document.createElement('img'); im.alt = ''; im.src = p.img; pv.append(im); pv.insertAdjacentHTML('beforeend', pickAnimation(g.id, p.tx, p.ty)); }
  const num = document.createElement('span'); num.className = 'gk-n'; num.textContent = String(n).padStart(2, '0');
  const tag = document.createElement('span'); tag.className = 'gk-p'; tag.textContent = 'TAP AGAIN';
  pv.append(num, tag);
  const gl = document.createElement('span'); gl.className = 'gk-l'; gl.textContent = g.name;
  b.append(pv, gl);
  return b;
}

// ---- the same looping animation drawn on a canvas (the Host's projector uses this; g is scaled to 160 x 90 units over the tile picture) ----
// t is seconds into the 6 s loop. Timing mirrors the keyframes used by the console's tiles above.
function pickFx(g, id, tx, ty, t){
  const ph = (((t % 6) + 6) % 6) / 6, x = tx * 160, y = ty * 90;
  const c = new HtCurve([80, 97], [80 + (x - 80)*.15, 97 - (97 - y)*.45], [x - (x - 80)*.1, y + (97 - y)*.3], [x, y]);
  const fade = ph < .06 ? ph / .06 : ph > .88 ? Math.max(0, 1 - (ph - .88) / .12) : 1;                // the ball and its trail appear, then fade at the end
  const prog = ph < .06 ? 0 : ph > .52 ? 1 : htEase((ph - .06) / .46);
  const pop = ph < .52 ? 0 : ph < .60 ? (ph - .52) / .08 : 1, popScale = ph < .52 ? .5 : ph < .60 ? .5 + .6*(ph - .52)/.08 : ph < .66 ? 1.1 - .1*(ph - .60)/.06 : 1;
  const pa = ph > .88 ? Math.max(0, 1 - (ph - .88) / .12) : pop;                                       // effects: in at 52-60 %, out at 88-100 %
  const withScale = (cx, cy, fn, a) => { g.save(); g.globalAlpha = a; g.translate(cx, cy); g.scale(popScale, popScale); g.translate(-cx, -cy); fn(); g.restore(); };
  const paint = id === 'paint';
  if (prog > 0){                                                                                        // the trail
    g.save(); g.globalAlpha = fade * (paint ? .75 : .45); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = paint ? 5 : 1.2; g.strokeStyle = paint ? '#e0187f' : '#0a0a0a'; c.trace(g, prog); g.stroke(); g.restore();
  }
  const ring = r => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = 'rgba(26,60,255,.16)'; g.fill(); g.lineWidth = 1.1; g.strokeStyle = '#1a3cff'; g.stroke(); };
  if (id === 'timeline') withScale(x + 13, (12 + y)/2, () => { g.strokeStyle = '#c9302a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, 12); g.lineTo(x, y); g.stroke(); g.fillStyle = '#c9302a'; g.fillRect(x, 12, 26, 9); }, pa);
  else if (id === 'ttt') withScale(x, y, () => { g.strokeStyle = '#1a3cff'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x + 8, y + 8); g.moveTo(x + 8, y - 8); g.lineTo(x - 8, y + 8); g.stroke(); }, pa);
  else if (id === 'bowling') PICK_PINS.forEach((p, k) => {
    const pk = ph - .05*(k % 5)/6, a = pk < .52 ? 0 : pk > .88 ? Math.max(0, 1 - (pk - .88)/.12) : 1, sc = pk < .52 ? .5 : pk < .60 ? .5 + .6*(pk - .52)/.08 : pk < .66 ? 1.1 - .1*(pk - .60)/.06 : 1;
    g.save(); g.globalAlpha = a; g.translate(p[0], p[1]); g.scale(sc, sc); g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fillStyle = '#c4c8d6'; g.fill(); g.lineWidth = .6; g.strokeStyle = '#8a8fa3'; g.stroke(); g.restore();
  });
  else if (id === 'gallery') withScale(x, y, () => {
    g.beginPath(); g.arc(x, y, 8, 0, 7); g.fillStyle = 'rgba(229,0,43,.18)'; g.fill(); g.lineWidth = 1.1; g.strokeStyle = '#e5002b'; g.stroke();
    g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x, y - 9); g.moveTo(x - 12, y - 7); g.lineTo(x - 9, y - 4); g.moveTo(x + 12, y - 7); g.lineTo(x + 9, y - 4); g.stroke();
  }, pa);
  else if (id === 'periodic') withScale(x, y, () => { g.fillStyle = 'rgba(26,60,255,.18)'; g.fillRect(x - 6.4, y - 5, 12.8, 10); g.lineWidth = 1.4; g.strokeStyle = '#1a3cff'; g.strokeRect(x - 6.4, y - 5, 12.8, 10); }, pa);
  else if (paint){
    const a = ph < .56 ? 0 : ph < .70 ? .75*(ph - .56)/.14 : ph > .88 ? Math.max(0, .75*(1 - (ph - .88)/.12)) : .75;
    g.save(); g.globalAlpha = a; g.lineWidth = 5; g.lineCap = 'round'; g.strokeStyle = '#1a3cff'; g.beginPath(); g.moveTo(135, 8); g.bezierCurveTo(120, 20, 150, 30, 110, 44); g.bezierCurveTo(96, 49, 120, 62, 100, 70); g.stroke(); g.restore();
  } else withScale(x, y, () => ring(id === 'map' ? 10 : 9), pa);
  {                                                                           // the ball
    const p = c.at(prog); g.save(); g.globalAlpha = fade; g.beginPath(); g.arc(p[0], p[1], 2.7, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = .9; g.strokeStyle = '#0a0a0a'; g.stroke();
    g.beginPath(); g.arc(p[0], p[1], .7, 0, 7); g.fillStyle = '#0a0a0a'; g.fill(); g.restore();
  }
}
