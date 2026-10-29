// Calibration with bad dot readings: findDot ignores hot pixels and refuses a lit spot that has a rival; fitWithRejection keeps the true map when several dots are wrong.
const { chromium } = require('playwright');
const { dist } = require('./lib');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html', 'host')); await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const L = window.__lab, pw = 360, ph = 640; L.LIVE.pw = pw; L.LIVE.ph = ph;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const frame = (blobs, hot) => { const a = new Float32Array(pw * ph); for (let i = 0; i < a.length; i++) a[i] = (rnd() - 0.5) * 8;
      for (const [u, v, amp, rad] of blobs) for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const d = Math.hypot(x - u * pw, y - v * ph); if (d < rad) a[y * pw + x] += amp; }
      for (const [x, y] of hot || []) a[y * pw + x] += 255; return a; };
    const base = new Float32Array(pw * ph), out = {};
    const f1 = L.findDot(base, frame([[0.4, 0.3, 120, 9]])); out.clean = f1 && Math.hypot(f1.u - 0.4, f1.v - 0.3);
    const f2 = L.findDot(base, frame([[0.4, 0.3, 120, 9]], [[300, 600], [20, 30]])); out.hot = f2 && Math.hypot(f2.u - 0.4, f2.v - 0.3);
    out.glint = L.findDot(base, frame([[0.4, 0.3, 120, 9], [0.8, 0.7, 100, 9]]));
    out.faint = L.findDot(base, frame([[0.4, 0.3, 6, 9]]));
    // fit: a known camera-to-sheet map, 13 dots, 4 read wrongly
    const H = [6.2, 0.9, -0.3, -0.4, 8.1, -0.2, 0.05, 0.03, 1], pts = [];
    const grid = []; for (const fy of [0.1, 0.5, 0.9]) for (const fx of [0.07, 0.5, 0.93]) grid.push([fx * 8, fy * 5]); for (const fx of [0.28, 0.72]) for (const fy of [0.3, 0.7]) grid.push([fx * 8, fy * 5]);
    // invert H numerically by fitting sheet -> camera with the library's own homFit through a known forward map
    const fwd = ([u, v]) => L.homApply(H, u, v), cam = grid.map((g, i) => { let u = 0.5, v = 0.5; for (let k = 0; k < 60; k++) { const [x, y] = fwd([u, v]); u += (g[0] - x) * 0.05; v += (g[1] - y) * 0.05; } return [u, v]; });
    cam.forEach((c, i) => pts.push({ cam: i === 1 || i === 4 || i === 7 || i === 10 ? [c[0] + 0.12 * (i % 2 ? 1 : -1), c[1] - 0.09] : c, sheet: grid[i] }));
    const fit = L.fitWithRejection(pts);
    out.fit = fit && { used: fit.use.length, worst: Math.max(...fit.res), leftOut: [1, 4, 7, 10].every(i => !fit.use.includes(pts[i])) };
    const few = L.fitWithRejection(pts.slice(0, 4).map((p, i) => ({ cam: [Math.random(), Math.random()], sheet: p.sheet })).concat(pts.slice(4, 6)));
    out.few = few === null || (few && few.use.length >= 5 ? 'accepted' : null);
    return out;
  });
  check(r.clean != null && r.clean < 0.004, `a clean dot is found where it is (off by ${r.clean && r.clean.toFixed(4)} of the picture)`);
  check(r.hot != null && r.hot < 0.004, `hot pixels elsewhere do not pull the reading (off by ${r.hot && r.hot.toFixed(4)})`);
  check(r.glint === null, 'a second lit spot nearly as strong gives no reading');
  check(r.faint === null, 'a faint dot gives no reading');
  check(r.fit && r.fit.used >= 9 && r.fit.worst < 0.5 && r.fit.leftOut, `four wrong dots of 13 are left out and the rest fit (${r.fit && r.fit.used} used, worst ${r.fit && r.fit.worst.toFixed(2)} in)`);
  check(r.few !== 'accepted', 'random readings are not accepted as a calibration');
  check(!errors.length, 'no script errors' + (errors.length ? ': ' + errors[0] : ''));
  console.log(notes.concat(fails).join('\n')); await browser.close(); process.exit(fails.length ? 1 : 0);
})();
