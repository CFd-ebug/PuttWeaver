// Projection angle and fitting the picture to the sheet, on the simulated camera:
//   - ksQuad maths (zero angles change nothing, angles are symmetric and stay on the screen)
//   - Fit to the sheet: a physical sheet (simCam.sheet) seen from an angle, a projector that lands skewed on it; after the fit the picture's
//     corners and interior must land on the sheet as a true rectangle (checked against the sheet's own metric)
//   - angles moved by hand keep the camera calibration valid (checked with the accuracy dots)
//   - the camera can sit at a steep angle: calibration and accuracy check still work
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  await page.locator('#btnLive').click(); await page.waitForTimeout(300);
  await page.selectOption('#lpSource', 'sim'); await page.locator('#lpStart').click(); await page.waitForTimeout(800);

  // ---- the angle maths ----
  const m = await page.evaluate(() => {
    const L = window.__lab, id = L.sheetCornersFrac(), z = L.ksQuad(id, {v:0, h:0, r:0}), top = L.ksQuad(id, {v:15, h:0, r:0}), left = L.ksQuad(id, {v:0, h:-15, r:0}), big = L.ksQuad(id, {v:45, h:45, r:45});
    const w = q => [Math.hypot(q[1][0]-q[0][0], q[1][1]-q[0][1]), Math.hypot(q[2][0]-q[3][0], q[2][1]-q[3][1])];
    const hgt = q => [Math.hypot(q[3][0]-q[0][0], q[3][1]-q[0][1]), Math.hypot(q[2][0]-q[1][0], q[2][1]-q[1][1])];
    return { zero: Math.max(...z.map((p, i) => Math.hypot(p[0]-id[i][0], p[1]-id[i][1]))), topW: w(top), leftH: hgt(left), inside: big.every(p => p[0] >= -1e-6 && p[0] <= 1 + 1e-6 && p[1] >= -1e-6 && p[1] <= 1 + 1e-6) };
  });
  check(m.zero < 1e-9, 'Zero angles leave the corners where they were');
  check(m.topW[0] < m.topW[1] * 0.97, `Top / bottom + makes the top narrower (${m.topW.map(v => v.toFixed(3)).join(' vs ')})`);
  check(m.leftH[0] > m.leftH[1] * 1.03, `Left / right - makes the right edge taller than the left... (${m.leftH.map(v => v.toFixed(3)).join(' vs ')})`);
  check(m.inside, 'Even 45° on every axis keeps the picture on the screen');

  // ---- fit to the sheet ----
  const geo = { proj: [[0.12,0.08],[0.86,0.10],[0.97,0.95],[0.03,0.93]], sheet: [[0.30,0.20],[0.70,0.24],[0.88,0.82],[0.10,0.78]] };
  await page.evaluate(g => { const L = window.__lab; L.simCam.noise = 0.02; L.simCam.quad = g.proj; L.simCam.sheet = g.sheet; }, geo);
  await page.waitForTimeout(600);
  const r = await page.evaluate(async () => { const L = window.__lab; const ok = await L.runAutoFit(); return { ok, note: document.getElementById('lpFitNote').textContent, sheet: L.LIVE.sheet, hand: L.LIVE.sheetHand, pin: L.LIVE.pin, cal: L.LIVE.cal && { n: L.LIVE.cal.n, chk: L.LIVE.cal.checkMax }, log: L.LIVE.log.slice(-8).map(e => e.msg) }; });
  check(r.ok, 'Fit to the sheet finishes: ' + r.note);
  if (!r.ok) console.log(r.log.join('\n'));
  const q = (a, b) => a.map(p => Math.min(...b.map(o => Math.hypot(p[0]-o[0], p[1]-o[1]))));
  if (r.sheet) check(Math.max(...q(r.sheet, geo.sheet)) < 0.015, `The sheet's corners are found in the camera picture (worst ${(Math.max(...q(r.sheet, geo.sheet)) * 100).toFixed(2)}% of the picture)`);
  const g = await page.evaluate(sheet => {
    const L = window.__lab, W = L.W, D = L.D, corners = [[0,0],[W,0],[W,D],[0,D]];
    const Gs = L.homFit ? null : null;
    return { W, D };
  }, geo.sheet);
  const fit = await page.evaluate(sheet => {
    // ground truth: the sheet is a W x D rectangle, so feet -> camera is the homography through its four corners (try both winding orders and the four turns, take the best)
    const L = window.__lab, W = L.W, D = L.D, V = L.LIVE, feet = [[0,0],[W,0],[W,D],[0,D]];
    const solve = (src, dst) => { // tiny homography fit: exact for four points
      const A = [], b = []; for (let i = 0; i < 4; i++){ const [x,y] = src[i], [u,v] = dst[i]; A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u); A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v); }
      const n = 8; for (let c = 0; c < n; c++){ let p = c; for (let r = c+1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = 0; r < n; r++){ if (r === c) continue; const f = A[r][c]/A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f*A[c][k]; b[r] -= f*b[c]; } }
      return [...b.map((v, i) => v/A[i][i]), 1];
    };
    let best = null;
    for (const rev of [false, true]) for (let k = 0; k < 4; k++){
      const dst = feet.map((_, i) => sheet[rev ? (k - i + 8) % 4 : (i + k) % 4]); const G = solve(feet, dst);
      let e = 0; for (let i = 0; i < 4; i++){ const [u, v] = L.homApply(V.Hsc, ...feet[i]), [gu, gv] = L.homApply(G, ...feet[i]); e += Math.hypot(u-gu, v-gv); }
      if (!best || e < best.e) best = { e, G, dst };
    }
    // errors in inches: send the camera difference back through the ground-truth map
    const Gi = solve(best.dst, feet), pts = []; for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fy of [0, 0.5, 1]) pts.push([fx*W, fy*D]);
    const errs = pts.map(([x, y]) => { const [u, v] = L.homApply(V.Hsc, x, y), [bx, by] = L.homApply(Gi, u, v); return Math.hypot(bx-x, by-y)*12; });
    return { max: Math.max(...errs), avg: errs.reduce((a, b) => a + b, 0)/errs.length, chk: V.cal && V.cal.checkMax, fitErr: V.fitInfo && V.fitInfo.err };
  }, geo.sheet);
  check(fit.max < 1.5, `The picture lands on the sheet as a true rectangle: ${fit.avg.toFixed(2)} in average, ${fit.max.toFixed(2)} in worst over a 5 x 3 grid`);
  check(fit.chk != null && fit.chk < 1.5, `Calibration after the fit checks out (${fit.chk != null ? fit.chk.toFixed(2) : '-'} in worst)`);
  await page.screenshot({ path: out + '/keystone-fitted.png' });

  // ---- angles by hand keep the calibration ----
  const man = await page.evaluate(async () => { const L = window.__lab; L.setKs('v', 6); L.setKs('h', -4); L.setKs('r', 2); await L.checkAccuracy(false); return { chk: L.LIVE.cal.checkMax, avg: L.LIVE.cal.checkAvg, ks: L.LIVE.ks, pin: L.LIVE.pin }; });
  check(man.chk < 1.5, `After moving the angles by hand the calibration still checks out (${man.avg.toFixed(2)} in average, ${man.chk.toFixed(2)} in worst)`);
  const zer = await page.evaluate(async () => { const L = window.__lab; L.resetKs(); await L.checkAccuracy(false); return { chk: L.LIVE.cal.checkMax, ks: L.LIVE.ks }; });
  check(zer.chk < 1.5 && !zer.ks.v && !zer.ks.h && !zer.ks.r, `Zeroing the angles puts it back (${zer.chk.toFixed(2)} in worst)`);

  // ---- a camera at a steep angle ----
  for (const [name, quad] of [['steep, far edge a third as wide', [[0.34,0.10],[0.66,0.10],[0.99,0.94],[0.01,0.94]]], ['steep and turned', [[0.12,0.06],[0.50,0.22],[0.86,0.93],[0.04,0.66]]]]){
    await page.evaluate(q => { const L = window.__lab; L.resetKs(); L.pinSet(null); L.LIVE.pinBase = null; L.simCam.sheet = null; L.simCam.quad = q; }, quad); await page.waitForTimeout(500);
    const c = await page.evaluate(async () => { const L = window.__lab; const ok = await L.runCalibration(); return { ok, n: L.LIVE.cal && L.LIVE.cal.n, avg: L.LIVE.cal && L.LIVE.cal.checkAvg, max: L.LIVE.cal && L.LIVE.cal.checkMax, note: document.getElementById('lpCalNote').textContent }; });
    check(c.ok && c.max != null && c.max < 1.5, `Camera ${name}: ${c.n} dots, accuracy ${c.avg != null ? c.avg.toFixed(2) : '-'} in average, ${c.max != null ? c.max.toFixed(2) : '-'} in worst`);
    if (!(c.ok && c.max < 1.5)) console.log(c.note);
    await page.screenshot({ path: out + '/keystone-' + (name.includes('turned') ? 'turned' : 'steep') + '.png' });
  }
  console.log(notes.concat(fails).join('\n'));
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
