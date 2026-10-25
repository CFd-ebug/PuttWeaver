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
