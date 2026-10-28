// ================= projection angle (keystone) and the maths for fitting the picture to the sheet =================
// LIVE.pin says where the four corners of the sheet are drawn on the projector screen (fractions of the screen), top left,
// top right, bottom right, bottom left. It is made from two parts, so manual and automatic fitting can work together:
//   LIVE.pinBase  corners set by dragging, by Rotate 180° or by the automatic fit (null = square to the screen)
//   LIVE.ks       three angles applied on top of the base, in degrees: v (top/bottom), h (left/right), r (turn)
// When ks is all zero, pin is the base. Moving the pin does not make the camera calibration stale: the camera has not moved,
// only the picture on the floor has, so the calibration is re-expressed for the new pin (rebaseCal) instead of being redone.

const KS_LIMIT = {v: 45, h: 45, r: 45};
const ksNew = () => ({v: 0, h: 0, r: 0});
const ksZero = k => !k || (!k.v && !k.h && !k.r);
const clonePin = p => p ? p.map(q => [q[0], q[1]]) : null;
const HID = [1,0,0, 0,1,0, 0,0,1];
function homMul(a, b){
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i*3+j] = a[i*3]*b[j] + a[i*3+1]*b[3+j] + a[i*3+2]*b[6+j];
  return r;
}
const homNorm = h => h && Math.abs(h[8]) > 1e-12 ? h.map(v => v / h[8]) : h;

// ---- three angles -> the four corners ----
// The picture is treated as a flat card seen through a lens, turned about its centre: v tips it so the top edge goes away from
// the viewer (+) or comes closer (-), h the same for the right edge, r turns it in its own plane. The result is the
// pre-distortion: if the projector leans so the top of the picture comes out too wide, + makes the top narrower.
function ksQuad(base, ks){
  const a = cvs.width / Math.max(1, cvs.height), f = 1.6, rad = d => d * Math.PI / 180;
  const cx = base.reduce((s, p) => s + p[0], 0) / 4, cy = base.reduce((s, p) => s + p[1], 0) / 4;
  const cr = Math.cos(rad(ks.r)), sr = Math.sin(rad(ks.r)), cv = Math.cos(rad(ks.v)), sv = Math.sin(rad(ks.v)), ch = Math.cos(rad(ks.h)), sh = Math.sin(rad(ks.h));
  let pts = base.map(([x, y]) => {
    let X = (x - cx) * a, Y = y - cy;
    [X, Y] = [X*cr - Y*sr, X*sr + Y*cr];
    const Y1 = cv * Y, Z1 = -sv * Y, X2 = ch * X - sh * Z1, Z2 = sh * X + ch * Z1, k = f / (f + Z2);
    return [X2 * k / a, Y1 * k];                                    // offsets from the centre
  });
  let s = 1;                                                         // keep every corner on the screen
  for (const [ox, oy] of pts){
    for (const [o, c] of [[ox, cx], [oy, cy]]){ if (o > 1e-6) s = Math.min(s, (1 - c) / o); else if (o < -1e-6) s = Math.min(s, c / -o); }
  }
  s = Math.max(0.2, s);
  return pts.map(([ox, oy]) => [cx + ox * s, cy + oy * s]);
}
const ksText = (ax, v) => {
  const m = Math.abs(v).toFixed(1) + '°';
  if (!v) return '0°';
  return m + ' ' + (ax === 'v' ? (v > 0 ? 'top narrower' : 'top wider') : ax === 'h' ? (v > 0 ? 'right narrower' : 'right wider') : (v > 0 ? 'clockwise' : 'anticlockwise'));
};

// ---- the pin and the camera calibration ----
const pinScreenToSrc = pin => pin ? homFit(pin, sheetCornersFrac()) : HID;           // screen fraction -> picture fraction
function feetToSrcMat(){ const r = sheetRectFrac(); return [(r.x1 - r.x0) / W, 0, r.x0, 0, (r.y1 - r.y0) / D, r.y0, 0, 0, 1]; }
// The camera calibration was measured with the pin pin0 (Hcs0). Camera -> screen does not depend on the pin, so for another pin:
//   camera -> feet = A^-1 . M(pin1) . M(pin0)^-1 . A . Hcs0     (A: feet -> picture fraction, M: screen -> picture fraction)
function rebaseHcs(H0, pin0, pin1){
  const A = feetToSrcMat(), Ai = homInv(A), M0i = homInv(pinScreenToSrc(pin0)), M1 = pinScreenToSrc(pin1);
  if (!Ai || !M0i || !M1) return null;
  return homNorm(homMul(Ai, homMul(M1, homMul(M0i, homMul(A, H0)))));
}
function rebaseCal(){
  const c = LIVE.cal; if (!c || !c.Hcs0) return;
  const H = rebaseHcs(c.Hcs0, c.pinAt, LIVE.pin); if (!H) return;
  c.Hcs = H; setCal(c);
}
function pinSet(pin){
  LIVE.pin = clonePin(pin); rebaseCal(); liveSave();
  if (typeof placeHandles === 'function') placeHandles();
  if (typeof renderLiveStatus === 'function') renderLiveStatus();
  REMOTE.key = '';
}
function ksRecompute(){
  const base = LIVE.pinBase || sheetCornersFrac();
  pinSet(ksZero(LIVE.ks) ? clonePin(LIVE.pinBase) : ksQuad(base, LIVE.ks));
}
function setKs(axis, v){
  if (!(axis in KS_LIMIT)) throw new Error('No such angle');
  v = Math.round(clamp(Number(v) || 0, -KS_LIMIT[axis], KS_LIMIT[axis]) * 10) / 10;
  if (LIVE.ks[axis] === v) return;
  if (!LIVE.pinBase && ksZero(LIVE.ks) && LIVE.pin) LIVE.pinBase = clonePin(LIVE.pin);
  LIVE.ks[axis] = v; ksRecompute();
}
function resetKs(){ LIVE.ks = ksNew(); ksRecompute(); llog('Projection angles set to zero'); }
// manual edits of single corners (dragging, nudging, Rotate 180°) become the new base, and the angles start again from zero
function bakePin(pin){ LIVE.pinBase = clonePin(pin); LIVE.ks = ksNew(); pinSet(pin); }

// ---- finding the physical sheet in a camera picture ----
// Two pictures, the projector all black and all white. White minus black is the light each spot sends back, which leaves out
// the room light and anything the projector does not reach, and the white sheet sends back far more than the floor around it.
// Return the sheet's four corners as fractions of the camera picture, in order around the sheet, or null.
function otsu(vals, lo, hi){
  const bins = 128, h = new Float64Array(bins), sc = (bins - 1) / Math.max(1e-6, hi - lo); let n = 0;
  for (let i = 0; i < vals.length; i++){ h[Math.max(0, Math.min(bins - 1, Math.floor((vals[i] - lo) * sc)))]++; n++; }
  let sumAll = 0; for (let i = 0; i < bins; i++) sumAll += i * h[i];
  let wB = 0, sumB = 0, best = -1, thr = 0;
  for (let i = 0; i < bins; i++){
    wB += h[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sumB += i * h[i]; const mB = sumB / wB, mF = (sumAll - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best){ best = v; thr = i; }
  }
  return lo + (thr + 0.5) / sc;
}
function convexHull(pts){
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]), lo = [], up = [];
  for (const q of p){ while (lo.length > 1 && cross(lo[lo.length-2], lo[lo.length-1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--){ const q = p[i]; while (up.length > 1 && cross(up[up.length-2], up[up.length-1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
const polyArea = p => { let s = 0; for (let i = 0; i < p.length; i++){ const a = p[i], b = p[(i+1) % p.length]; s += a[0]*b[1] - b[0]*a[1]; } return s / 2; };
function simplifyHull(h, keep){       // drop the corner that changes the area least, until `keep` remain
  h = h.slice();
  while (h.length > keep){
    let bi = 0, ba = Infinity;
    for (let i = 0; i < h.length; i++){ const a = h[(i+h.length-1) % h.length], b = h[i], c = h[(i+1) % h.length], t = Math.abs((b[0]-a[0])*(c[1]-a[1]) - (c[0]-a[0])*(b[1]-a[1])) / 2; if (t < ba){ ba = t; bi = i; } }
    h.splice(bi, 1);
  }
  return h;
}
function bestQuad(h){                 // the four hull points that enclose the most area
  const p = simplifyHull(h, 22); let best = null, ba = -1;
  for (let i = 0; i < p.length; i++) for (let j = i+1; j < p.length; j++) for (let k = j+1; k < p.length; k++) for (let l = k+1; l < p.length; l++){
    const q = [p[i], p[j], p[k], p[l]], a = Math.abs(polyArea(q)); if (a > ba){ ba = a; best = q; }
  }
  return best;
}
function findSheetQuad(white, black, pw, ph){
  const n = pw * ph, d = new Float32Array(n); let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++){        // a 3 x 3 average, so noise does not tear the edge
    let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const xx = x+dx, yy = y+dy; if (xx < 0 || yy < 0 || xx >= pw || yy >= ph) continue; const i = yy*pw+xx; s += white[i] - black[i]; c++; }
    const v = s / c; d[y*pw+x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
  }
  if (hi - lo < 25) return {err: 'The camera saw almost no difference between the black and the white picture. Is it pointed at the projection?'};
  const thr = otsu(d, lo, hi), m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = d[i] > thr ? 1 : 0;
  // largest connected bright region
  const lab = new Int32Array(n), stack = new Int32Array(n); let bestL = 0, bestN = 0, L = 0;
  for (let s0 = 0; s0 < n; s0++){
    if (!m[s0] || lab[s0]) continue; L++; let sp = 0, cnt = 0; stack[sp++] = s0; lab[s0] = L;
    while (sp){
      const i = stack[--sp]; cnt++; const x = i % pw, y = (i - x) / pw;
      if (x > 0 && m[i-1] && !lab[i-1]){ lab[i-1] = L; stack[sp++] = i-1; }
      if (x < pw-1 && m[i+1] && !lab[i+1]){ lab[i+1] = L; stack[sp++] = i+1; }
      if (y > 0 && m[i-pw] && !lab[i-pw]){ lab[i-pw] = L; stack[sp++] = i-pw; }
      if (y < ph-1 && m[i+pw] && !lab[i+pw]){ lab[i+pw] = L; stack[sp++] = i+pw; }
    }
    if (cnt > bestN){ bestN = cnt; bestL = L; }
  }
  if (bestN < n * 0.02) return {err: 'No bright sheet-sized area was found.'};
  const pts = []; for (let y = 0; y < ph; y++){ let a = -1, b = -1; for (let x = 0; x < pw; x++) if (lab[y*pw+x] === bestL){ if (a < 0) a = x; b = x; } if (a >= 0){ pts.push([a, y], [b + 1, y], [a, y + 1], [b + 1, y + 1]); } }
  const hull = convexHull(pts), q = bestQuad(hull); if (!q) return {err: 'The bright area has no clear corners.'};
  const fill = Math.abs(polyArea(q)) / Math.max(1, Math.abs(polyArea(hull))), area = Math.abs(polyArea(q)) / n;
  const edge = q.some(([x, y]) => x < 2 || y < 2 || x > pw - 2 || y > ph - 2);
  const quad = q.map(([x, y]) => [x / pw, y / ph]);
  return {quad: orderQuad(quad), fill, area, edge, thr};
}
// order four points around their centre, clockwise on the screen, starting at the one nearest the top left
function orderQuad(q){
  const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
  const o = q.slice().sort((a, b) => Math.atan2(a[1]-cy, a[0]-cx) - Math.atan2(b[1]-cy, b[0]-cx));       // clockwise, y is down
  let k = 0; for (let i = 1; i < 4; i++) if (o[i][0] + o[i][1] < o[k][0] + o[k][1]) k = i;
  return [o[k], o[(k+1) % 4], o[(k+2) % 4], o[(k+3) % 4]];
}

// ---- the corners the picture needs so it lands on the sheet ----
// sheetCam: the sheet's corners in the camera picture (fractions). With the camera calibration (camera -> feet, measured for the pin
// that is on now) every camera spot is also a spot on the projector screen, so the screen position of each sheet corner is known.
function pinForSheet(sheetCam){
  if (!LIVE.Hcs || !LIVE.Hsc) return null;
  const A = feetToSrcMat(), M = pinScreenToSrc(LIVE.pin), Mi = homInv(M); if (!Mi) return null;
  const mine = [[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => homApply(LIVE.Hsc, x, y));     // where the picture's corners are in the camera now
  const orient = p => polyArea(p) > 0 ? 1 : -1;
  let q = sheetCam.map(p => [p[0], p[1]]); if (orient(q) !== orient(mine)) q = [q[0], q[3], q[2], q[1]];
  let bk = 0, bd = Infinity;                                                                    // which sheet corner is which picture corner
  for (let k = 0; k < 4; k++){ let d = 0; for (let i = 0; i < 4; i++) d += Math.hypot(q[(i+k) % 4][0] - mine[i][0], q[(i+k) % 4][1] - mine[i][1]); if (d < bd){ bd = d; bk = k; } }
  const out = [];
  for (let i = 0; i < 4; i++){
    const c = q[(i + bk) % 4], [fx, fy] = homApply(LIVE.Hcs, c[0], c[1]);                         // that camera spot in feet, then in the picture, then on the screen
    const src = homApply(A, fx, fy), scr = homApply(Mi, src[0], src[1]);
    if (!isFinite(scr[0]) || !isFinite(scr[1])) return null;
    out.push(scr);
  }
  return out;
}
// how far the picture's corners are from the sheet's corners, in inches on the sheet (uses the camera calibration as it is now)
function sheetFitError(sheetCam){
  if (!LIVE.Hcs || !sheetCam) return null;
  const mine = [[0, 0], [W, 0], [W, D], [0, D]], got = sheetCam.map(p => homApply(LIVE.Hcs, p[0], p[1]));
  let best = Infinity;
  for (const rev of [false, true]) for (let k = 0; k < 4; k++){
    let s = 0; for (let i = 0; i < 4; i++){ const g = got[rev ? (k - i + 8) % 4 : (i + k) % 4]; s += Math.hypot(g[0] - mine[i][0], g[1] - mine[i][1]); }
    best = Math.min(best, s / 4);
  }
  return best * 12;
}
const pinOnScreen = p => p.every(([x, y]) => x > -0.02 && x < 1.02 && y > -0.02 && y < 1.02);
