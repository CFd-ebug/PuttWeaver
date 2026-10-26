// ================= how-to animation (canvas) =================
// The three steps a player follows: 1 BALL AT START, 2 PUTT NOW, 3 RESET BALL. This file draws them as a looping 9 s picture:
// three small scenes (a sheet with a banner, the start spot and the ball) and a pictogram person standing beside a tilted sheet who
// does the steps. It is pure drawing code with no engine globals, because the Manager's game picker (08-manager.js, which returns
// before the engine starts) and the Host's projector both use it.
// Scene units are those of a 1920 x 1080 projector picture plus a 160 unit strip of table below the sheet (1920 x 1240).
const HT_STEPS = [
  {n: 1, col: '#0a0a0a', text: 'BALL AT START'},
  {n: 2, col: '#1a3cff', text: 'PUTT NOW'},
  {n: 3, col: '#e5002b', text: 'RESET BALL'}
];
const HT_CYCLE = 9, HT_SLOT = 3;
const HT_RING = [960, 1160];                                      // the start spot, on the table 1.1 ft below the sheet
const HT_REST = [567, 596];                                       // where the ball rests in the example (a place on the map)
const HT_P1 = [[1520, 1100], [1340, 1210], [1120, 1200], [960, 1160]];
const HT_P2 = [[960, 1170], [930, 830], [HT_REST[0] + 170, HT_REST[1] + 330], HT_REST];
const HT_P3 = [HT_REST, [HT_REST[0] + 110, HT_REST[1] + 300], [1100, 1040], [960, 1150]];

// ---- curves and easing ----
function htBezierEase(x1, y1, x2, y2){
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = 0.5;
    for (let i = 0; i < 30; i++){ t = (lo + hi) / 2; const bx = 3*(1-t)*(1-t)*t*x1 + 3*(1-t)*t*t*x2 + t*t*t; if (bx < x) lo = t; else hi = t; }
    t = (lo + hi) / 2; return 3*(1-t)*(1-t)*t*y1 + 3*(1-t)*t*t*y2 + t*t*t;
  };
}
const htEase = htBezierEase(.3, .6, .3, 1), htSoft = htBezierEase(.42, 0, .58, 1);
const htSmooth = x => { x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); };
const htLerp = (a, b, t) => a + (b - a)*t;
const htLerp2 = (a, b, t) => [htLerp(a[0], b[0], t), htLerp(a[1], b[1], t)];
// a cubic bezier that is walked by distance travelled (like CSS offset-distance)
class HtCurve {
  constructor(p0, p1, p2, p3){
    this.p = [p0, p1, p2, p3]; this.s = []; let acc = 0, prev = null;
    for (let i = 0; i <= 300; i++){ const q = this.pt(i / 300); if (prev) acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); this.s.push([acc, q]); prev = q; }
    this.len = acc;
  }
  pt(t){ const [a, b, c, d] = this.p, m = 1 - t; return [0, 1].map(i => m*m*m*a[i] + 3*m*m*t*b[i] + 3*m*t*t*c[i] + t*t*t*d[i]); }
  at(f){
    const target = Math.max(0, Math.min(1, f)) * this.len; let lo = 0, hi = this.s.length - 1;
    while (lo < hi){ const m = (lo + hi) >> 1; if (this.s[m][0] < target) lo = m + 1; else hi = m; }
    return this.s[lo][1];
  }
  trace(g, f){                                                    // the first fraction f of the curve as a line
    g.beginPath(); const n = Math.max(2, Math.round(f * 60)); for (let i = 0; i <= n; i++){ const q = this.at(f * i / n); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
  }
}
const HT_C1 = new HtCurve(...HT_P1), HT_C2 = new HtCurve(...HT_P2), HT_C3 = new HtCurve(...HT_P3);

// value of a keyframed quantity: steps are [u, value, eased] with u in 0..1 inside the 3 s slot; after the slot the last value holds
function htKf(u, steps){
  if (u <= steps[0][0]) return steps[0][1];
  for (let i = 1; i < steps.length; i++){
    if (u <= steps[i][0]){
      const a = steps[i-1], b = steps[i]; let f = (u - a[0]) / (b[0] - a[0]); if (a[2]) f = htEase(f);
      return a[1] + (b[1] - a[1]) * f;
    }
  }
  return steps[steps.length - 1][1];
}
const HT_MV_A = [[0, 0, 1], [.55, 1]], HT_HF_A = [[0, 1], [.6, 1], [.8, 0]];
const HT_MV_B = [[0, 0], [.34, 0, 1], [.84, 1]], HT_GH_B = [[0, .9], [.84, .9], [.96, 0]];
const HT_MV_C = [[0, 0], [.22, 0, 1], [.7, 1]], HT_HF_C = [[0, 0], [.12, 0], [.22, 1], [.7, 1], [.85, 0]], HT_AR_C = [[0, 1], [.7, 1], [.8, 0]];
const htFont = (size, weight) => `${weight || 800} ${size}px Inter, "Atkinson Hyperlegible", sans-serif`;
function htText(g, s, x, y, size, fill, spacing, weight){
  g.font = htFont(size, weight); g.fillStyle = fill; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  if ('letterSpacing' in g) g.letterSpacing = spacing + 'px';
  g.fillText(s, x, y);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

// ---- the banner across the top of the sheet: number box, name, white rule. 1920 x 198 units ----
function howtoBanner(g, step, pulse){
  const s = HT_STEPS[step - 1];
  g.fillStyle = s.col; g.fillRect(0, 0, 1920, 190);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 190, 190);
  htText(g, String(s.n), 95, 146, 140, s.col, -6);
  g.globalAlpha = pulse == null ? 1 : pulse; htText(g, s.text, 1055, 136, 118, '#ffffff', -3); g.globalAlpha = 1;
  g.fillStyle = '#ffffff'; g.fillRect(0, 190, 1920, 8);
}
// three downward chevrons that pulse in turn
function howtoChevrons(g, cx, cy, t){
  for (let j = 0; j < 3; j++){
    const ph = (((t - j*.18) % 1.2) + 1.2) % 1.2 / 1.2, a = ph < .4 ? .12 + .88*ph/.4 : 1 - .88*(ph - .4)/.6;
    g.globalAlpha = a; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - 66, cy + j*74); g.lineTo(cx, cy + j*74 + 56); g.lineTo(cx + 66, cy + j*74);
    g.strokeStyle = '#ffffff'; g.lineWidth = 40; g.stroke(); g.strokeStyle = '#1a3cff'; g.lineWidth = 22; g.stroke();
  }
  g.globalAlpha = 1;
}
function howtoBall(g, x, y, r){
  r = r || 31; g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = r*8/31; g.strokeStyle = '#0a0a0a'; g.stroke();
  g.beginPath(); g.arc(x, y, r*7/31, 0, 7); g.fillStyle = '#0a0a0a'; g.fill();
}
function howtoHand(g, x, y){
  g.save(); g.translate(x + 26, y - 36); g.rotate(8 * Math.PI / 180); g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = '#0a0a0a'; g.fillStyle = '#fff';
  const rr = (rx, ry, w, h, r) => { g.beginPath(); g.roundRect(rx, ry, w, h, r); g.fill(); g.stroke(); };
  rr(-46, -70, 22, 78, 11); rr(-22, -80, 22, 88, 11); rr(2, -76, 22, 84, 11); rr(26, -62, 22, 70, 11); rr(-52, -10, 108, 80, 30);
  g.save(); g.translate(-70, 30); g.rotate(-28 * Math.PI / 180); g.translate(70, -30); rr(-84, 2, 28, 62, 14); g.restore();
  g.restore();
}
// The dotted route back to the start (a HtCurve) with an arrowhead, marching toward the start.
function howtoRoute(from, to){ const dx = to[0] - from[0], dy = to[1] - from[1]; return new HtCurve(from, [from[0] + dx*.2, from[1] + dy*.45], [to[0] - dx*.1, to[1] - dy*.35], to); }
function howtoReturn(g, c, t, alpha){
  g.save(); g.globalAlpha = alpha; g.lineCap = 'round'; g.setLineDash([4, 30]); g.lineDashOffset = -((t % 1) * 34);
  c.trace(g, 1); g.strokeStyle = '#fff'; g.lineWidth = 32; g.stroke(); g.strokeStyle = '#e5002b'; g.lineWidth = 16; g.stroke();
  g.setLineDash([]); const a = c.at(.86), b = c.at(.88), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  g.translate(a[0], a[1]); g.rotate(ang); g.beginPath(); g.moveTo(-34, -44); g.lineTo(40, 0); g.lineTo(-34, 44); g.closePath();
  g.fillStyle = '#e5002b'; g.fill(); g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.stroke(); g.restore();
}

// ---- one scene (1920 x 1240 units). step 1..3, t = seconds into this scene's own 9 s loop. actors false hides the ball and hand (the person carries them) ----
function howtoScene(g, step, t, img, actors){
  const u = (((t % HT_CYCLE) + HT_CYCLE) % HT_CYCLE) / HT_SLOT;      // 0..1 inside this step's slot, then it holds
  g.save(); g.beginPath(); g.rect(0, 0, 1920, 1240); g.clip();
  g.fillStyle = '#fff'; g.fillRect(0, 0, 1920, 1240);
  if (img && img.complete && img.naturalWidth) g.drawImage(img, 0, 0, 1920, 1080); else { g.fillStyle = '#c7d6ee'; g.fillRect(0, 0, 1920, 1080); }
  g.fillStyle = '#e4e7f0'; g.fillRect(0, 1080, 1920, 160); g.fillStyle = '#0a0a0a'; g.fillRect(0, 1076, 1920, 10);
  // the start spot pulses
  const ph = (t % 1.2) / 1.2, sc = 1 + .14 * htSoft(ph < .5 ? ph / .5 : 1 - (ph - .5) / .5);
  g.save(); g.translate(HT_RING[0], HT_RING[1]); g.scale(sc, sc); g.beginPath(); g.arc(0, 0, 64, 0, 7); g.fillStyle = 'rgba(26,60,255,.10)'; g.fill();
  g.setLineDash([26, 16]); g.lineWidth = 9; g.strokeStyle = step === 2 ? '#8a8fa3' : '#1a3cff'; g.stroke(); g.restore();
  g.beginPath(); g.arc(HT_RING[0], HT_RING[1], 8, 0, 7); g.fillStyle = '#0a0a0a'; g.fill();
  if (step === 1){
    howtoChevrons(g, 430, 840, t); howtoChevrons(g, 1490, 840, t);
    if (actors){ const p = HT_C1.at(htKf(u, HT_MV_A)); howtoBall(g, p[0], p[1]); const o = htKf(u, HT_HF_A); if (o > .01){ g.globalAlpha = o; howtoHand(g, p[0], p[1]); g.globalAlpha = 1; } }
  } else if (step === 2){
    const f = htKf(u, HT_MV_B), gh = htKf(u, HT_GH_B);
    if (f > 0){ g.save(); g.globalAlpha = .55 * gh; g.lineCap = 'round'; g.lineWidth = 12; g.strokeStyle = '#0a0a0a'; HT_C2.trace(g, f); g.stroke(); g.restore(); }
    if (actors){ const p = HT_C2.at(f); howtoBall(g, p[0], p[1]); }
  } else {
    const a = htKf(u, HT_AR_C); if (a > .01) howtoReturn(g, HT_C3, t, a);
    if (actors){
      const p = HT_C3.at(htKf(u, HT_MV_C)); howtoBall(g, p[0], p[1]);
      const o = htKf(u, HT_HF_C); if (o > .01){ g.globalAlpha = o; howtoHand(g, p[0], p[1]); g.globalAlpha = 1; }
    }
  }
  const pulse = step === 2 ? .8 + .2 * Math.cos((t % 1) * 2 * Math.PI) : 1;
  howtoBanner(g, step, pulse);
  g.restore();
}

// ---- the person: a pictogram standing beside the sheet, seen from the side and above ----
const HT_PW = 640, HT_PH = 492;
const HT_K = 48, HT_PSI = 30 * Math.PI / 180, HT_EPS = 40 * Math.PI / 180;
const HT_U = [8*HT_K*Math.sin(HT_PSI), 8*HT_K*Math.sin(HT_EPS)*Math.cos(HT_PSI)];              // across the sheet, left to right
const HT_V = [4.5*HT_K*Math.cos(HT_PSI), -4.5*HT_K*Math.sin(HT_EPS)*Math.sin(HT_PSI)];         // depth, near to far
const HT_GY = 380;                                                                              // the floor line under the feet
const HT_O = [130 - .5*HT_U[0] + .27*HT_V[0], HT_GY - .5*HT_U[1] + .27*HT_V[1]];
const htS = (x, y) => [HT_O[0] + x/1920*HT_U[0] + (1080 - y)/1080*HT_V[0], HT_O[1] + x/1920*HT_U[1] + (1080 - y)/1080*HT_V[1]];
const HT_PS = 1.05, HT_PDX = 80, HT_PDY = -28;                                                 // panel placement
const HT_RING_P = htS(HT_RING[0], HT_RING[1]), HT_REST_P = htS(HT_REST[0], HT_REST[1]), HT_C0 = [166, 214];
const HT_PA = new HtCurve(HT_C0, [HT_C0[0] + 14, HT_C0[1] + 50], [HT_RING_P[0] - 20, HT_RING_P[1] - 60], HT_RING_P);
const HT_PB = new HtCurve(HT_RING_P, [HT_RING_P[0] + 40, HT_RING_P[1] - 60], [HT_REST_P[0] - 50, HT_REST_P[1] + 80], HT_REST_P);
const HT_PC = new HtCurve(HT_REST_P, [HT_REST_P[0] - 60, HT_REST_P[1] + 70], [HT_RING_P[0] + 60, HT_RING_P[1] - 50], HT_RING_P);
const HT_LEG = 64, HT_ARM = 52, HT_TORSO = 88, HT_FB0 = [108, HT_GY], HT_FF0 = [150, HT_GY], HT_HOLD = [-9, -13], HT_LP = 100, HT_PSI_AD = -12;

function htIk(a, b, l1, l2, prefer){                                                               // two-bone limb: where the middle joint goes
  let dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy); const dmax = l1 + l2 - .5;
  if (d > dmax){ b = [a[0] + dx/d*dmax, a[1] + dy/d*dmax]; dx = b[0] - a[0]; dy = b[1] - a[1]; d = dmax; }
  d = Math.max(d, 8); const ux = dx/d, uy = dy/d, aa = (l1*l1 - l2*l2 + d*d) / (2*d), h = Math.sqrt(Math.max(l1*l1 - aa*aa, 0));
  const c1 = [-uy, ux], c2 = [uy, -ux], best = (c1[0]*prefer[0] + c1[1]*prefer[1]) >= (c2[0]*prefer[0] + c2[1]*prefer[1]) ? c1 : c2;
  return [[a[0] + ux*aa + best[0]*h, a[1] + uy*aa + best[1]*h], b];
}
function htIdleHand(hip, th){ const r = th * Math.PI / 180; return [hip[0] + Math.sin(r)*HT_TORSO + 7, hip[1] - Math.cos(r)*HT_TORSO + 96]; }
const HT_REST_POSE = {hip: [128, 322 + (HT_GY - 444)], th: 4};
const HT_GRIP_AD = [HT_RING_P[0] - HT_LP*Math.sin(HT_PSI_AD*Math.PI/180), HT_RING_P[1] - HT_LP*Math.cos(HT_PSI_AD*Math.PI/180)];
function htPose(t){                                                                                 // what the body is doing at second t of the 9 s loop
  const slot = Math.floor(t / HT_SLOT) % 3, u = (t - HT_SLOT*slot) / HT_SLOT, GY = HT_GY, off = GY - 444;
  const P = {hip: HT_REST_POSE.hip, th: HT_REST_POSE.th, FB: HT_FB0, FF: HT_FF0, put: null, putOp: 0};
  const hold = b => [b[0] + HT_HOLD[0], b[1] + HT_HOLD[1]];
  if (slot === 0){                                                                                  // put the ball on the start spot
    const p = u < .55 ? htEase(u / .55) : 1, ball = HT_PA.at(p);
    if (u < .62){
      const hand = hold(ball);
      P.hip = [htLerp(128, 142, p), htLerp(322 + off, 366 + off, p)]; P.th = htLerp(6, 40, p);
      P.FB = [htLerp(HT_FB0[0], 100, p), GY]; P.FF = [htLerp(HT_FF0[0], 152, p), GY];
      P.rh = hand; P.lh = p < .98 ? [hand[0] - 10, hand[1] + 4] : htIdleHand(P.hip, P.th);
    } else {
      const k = htSmooth((u - .62) / .38);
      P.hip = htLerp2([142, 366 + off], HT_REST_POSE.hip, k); P.th = htLerp(40, HT_REST_POSE.th, k);
      P.FB = [htLerp(100, HT_FB0[0], k), GY]; P.FF = [htLerp(152, HT_FF0[0], k), GY];
      P.rh = htLerp2(hold(HT_RING_P), htIdleHand(P.hip, P.th), k); P.lh = htIdleHand(P.hip, P.th);
    }
  } else if (slot === 1){                                                                           // address, swing, follow through, step back
    const kIn = htSmooth(u / .1), kOut = htSmooth((u - .62) / .3), k = kIn * (1 - kOut);
    P.hip = htLerp2(HT_REST_POSE.hip, [136, 262], k); P.th = htLerp(HT_REST_POSE.th, 22, k);
    let psi;
    if (u < .14) psi = HT_PSI_AD; else if (u < .26) psi = htLerp(HT_PSI_AD, -42, htSmooth((u - .14) / .12));
    else if (u < .34) psi = htLerp(-42, HT_PSI_AD, Math.pow((u - .26) / .08, 1.6)); else if (u < .44) psi = htLerp(HT_PSI_AD, 24, 1 - Math.pow(1 - (u - .34) / .10, 2)); else psi = 24;
    const grip = [HT_GRIP_AD[0] + (psi - HT_PSI_AD)*.35, HT_GRIP_AD[1] - Math.abs(psi - HT_PSI_AD)*.05], idle = htIdleHand(P.hip, P.th);
    const hand = u < .62 ? htLerp2(idle, grip, kIn) : htLerp2(grip, idle, kOut);
    P.rh = hand; P.lh = [hand[0] - 5, hand[1] + 2];
    const r = psi * Math.PI / 180, tip = [hand[0] + HT_LP*Math.sin(r), hand[1] + HT_LP*Math.cos(r)], side = [tip[0] + 17*Math.cos(r), tip[1] - 17*Math.sin(r)];
    P.put = [hand, tip, side]; P.putOp = htSmooth(u / .08) * (1 - htSmooth((u - .8) / .12));
  } else {                                                                                          // walk forward, take the ball and bring it back
    if (u < .22){
      const k = htSmooth(u / .2), tgt = hold(HT_REST_P);
      P.hip = [htLerp(128, 200, k), htLerp(322 + off, 350 + off, k)]; P.th = htLerp(4, 46, k);
      P.FB = [htLerp(HT_FB0[0], 184, k), GY - 8*Math.sin(Math.PI*k)]; P.FF = [htLerp(HT_FF0[0], 234, k), GY];
      const idle = htIdleHand(P.hip, P.th); P.rh = htLerp2(idle, tgt, k); P.lh = [idle[0] + 2, idle[1] + 4];
    } else if (u < .7){
      const p = htEase((u - .22) / .48), ball = HT_PC.at(p);
      P.hip = [htLerp(200, 142, p), htLerp(350 + off, 366 + off, p)]; P.th = htLerp(46, 40, p);
      P.FB = [htLerp(184, 100, p), GY]; P.FF = [htLerp(234, 152, p), GY];
      P.rh = hold(ball); P.lh = htIdleHand(P.hip, P.th);
    } else {
      const k = u > .74 ? htSmooth((u - .74) / .26) : 0;
      P.hip = htLerp2([142, 366 + off], HT_REST_POSE.hip, k); P.th = htLerp(40, HT_REST_POSE.th, k);
      P.FB = [htLerp(100, HT_FB0[0], k), GY]; P.FF = [htLerp(152, HT_FF0[0], k), GY];
      P.rh = htLerp2(hold(HT_RING_P), htIdleHand(P.hip, P.th), k); P.lh = htIdleHand(P.hip, P.th);
    }
  }
  return P;
}
function htFigure(P){                                                                               // joints from the pose
  const [hx, hy] = P.hip, th = P.th * Math.PI / 180, dir = [Math.sin(th), -Math.cos(th)];
  const sh = [hx + dir[0]*HT_TORSO, hy + dir[1]*HT_TORSO], neck = [hx + dir[0]*(HT_TORSO + 12), hy + dir[1]*(HT_TORSO + 12)];
  const head = [hx + dir[0]*(HT_TORSO + 38) + 4, hy + dir[1]*(HT_TORSO + 38)];
  const [elR, hR] = htIk(sh, P.rh, HT_ARM, HT_ARM, [-.6, 1]), [elL, hL] = htIk(sh, P.lh, HT_ARM, HT_ARM, [-.6, 1]);
  const [knB, aB] = htIk([hx - 4, hy], P.FB, HT_LEG, HT_LEG, [1, 0]), [knF, aF] = htIk([hx + 4, hy], P.FF, HT_LEG, HT_LEG, [1, 0]);
  return {torso: [[hx, hy], neck], head, armR: [sh, elR, hR], hR, armL: [sh, elL, hL], hL, legR: [[hx + 4, hy], knF, aF], legL: [[hx - 4, hy], knB, aB]};
}
function htLimb(g, pts, col, w, halo){
  g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
  if (halo){ g.strokeStyle = '#fff'; g.lineWidth = w + halo; g.stroke(); }
  g.strokeStyle = col; g.lineWidth = w; g.stroke();
}
function htDot(g, p, r, fill, stroke, sw){ g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fillStyle = fill; g.fill(); if (stroke){ g.lineWidth = sw; g.strokeStyle = stroke; g.stroke(); } }
const HT_PLANE = (() => {                                                                           // scene units -> panel pixels (an affine map), with the panel placement folded in
  const a = HT_U[0]/1920*HT_PS, b = HT_U[1]/1920*HT_PS, c = -HT_V[0]/1080*HT_PS, d = -HT_V[1]/1080*HT_PS;
  return [a, b, c, d, (HT_O[0] + HT_V[0])*HT_PS + HT_PDX, (HT_O[1] + HT_V[1])*HT_PS + HT_PDY];
})();
// Draws the person panel (HT_PW x HT_PH units) at t seconds into the 9 s loop. img is the picture of the sheet.
function howtoPerson(g, t, img){
  t = ((t % HT_CYCLE) + HT_CYCLE) % HT_CYCLE;
  const slot = Math.floor(t / HT_SLOT), fade = t < .162 ? t / .162 : t > 8.82 ? (HT_CYCLE - t) / .18 : 1;
  g.save(); g.fillStyle = '#f3f4f9'; g.fillRect(0, 0, HT_PW, HT_PH);
  g.save(); g.beginPath(); g.rect(0, 0, HT_PW, HT_PH); g.clip(); g.globalAlpha = Math.max(0, Math.min(1, fade));
  g.save(); g.translate(HT_PDX, HT_PDY); g.scale(HT_PS, HT_PS);
  const corners = [[0, 0], [1920, 0], [1920, 1240], [0, 1240]].map(p => htS(p[0], p[1]));
  const poly = (dx, dy) => { g.beginPath(); corners.forEach((p, i) => i ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy)); g.closePath(); };
  poly(6, 8); g.fillStyle = 'rgba(10,10,10,.10)'; g.fill();
  g.restore();
  g.save(); g.transform(...HT_PLANE); howtoScene(g, slot + 1, t - HT_SLOT*slot, img, false); g.restore();
  g.save(); g.translate(HT_PDX, HT_PDY); g.scale(HT_PS, HT_PS); poly(0, 0); g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = '#0a0a0a'; g.stroke();
  const P = htPose(t), f = htFigure(P), u = (t - HT_SLOT*slot) / HT_SLOT;
  g.beginPath(); g.ellipse(132, 385, 78, 9, 0, 0, 7); g.fillStyle = 'rgba(10,10,10,.14)'; g.fill();
  htLimb(g, f.legL, '#4a4f63', 18); htLimb(g, f.armL, '#7d92ff', 15); htDot(g, f.hL, 8, '#4a4f63');
  htLimb(g, f.legR, '#0a0a0a', 20); htLimb(g, f.torso, '#1a3cff', 36, 6); htDot(g, f.head, 23, '#0a0a0a', '#fff', 4);
  const bp = slot === 0 ? HT_PA.at(htKf(u, HT_MV_A)) : slot === 1 ? HT_PB.at(htKf(u, HT_MV_B)) : HT_PC.at(htKf(u, HT_MV_C));
  htDot(g, bp, 13, '#fff', '#0a0a0a', 5); htDot(g, bp, 3.4, '#0a0a0a');
  if (P.put && P.putOp > .01){ g.globalAlpha *= P.putOp; htLimb(g, P.put, '#0a0a0a', 7); g.globalAlpha /= P.putOp; }
  htLimb(g, f.armR, '#1a3cff', 17, 5); htDot(g, f.hR, 9.5, '#0a0a0a', '#fff', 3);
  g.restore(); g.restore();
  // the step label across the top
  const s = HT_STEPS[slot]; g.fillStyle = s.col; g.fillRect(0, 0, HT_PW, 64); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  htText(g, String(s.n), 32, 50, 46, '#0a0a0a', -2); htText(g, s.text, 64 + (HT_PW - 64)/2, 46, 38, '#ffffff', -1);
  g.lineWidth = 6; g.strokeStyle = '#0a0a0a'; g.strokeRect(0, 0, HT_PW, HT_PH);
  g.restore();
}
// a picture of a game's sheet for the scenes and the person (the Map Quest picture, falling back to any game)
let htImg = null;
function howtoSheetImage(){
  if (htImg) return htImg;
  const p = typeof GAME_PREVIEWS !== 'undefined' && (GAME_PREVIEWS.map || Object.values(GAME_PREVIEWS)[0]);
  if (p){ htImg = new Image(); htImg.src = p.img; }
  return htImg;
}
