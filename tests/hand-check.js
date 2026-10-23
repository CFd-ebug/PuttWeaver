// Desk test of false detections: a bright yellow virtual ball, plus a skin-colored hand/arm and a head moving on the sheet.
// usage: node hand-check.js [ref|hue|huewide] [skin hex] [full]
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
const method = process.argv[2] || 'ref', skin = process.argv[3] || '#e2b48f', full = process.argv[4] === 'full';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Map Quest/ }).click();
  await page.locator('#btnLive').click(); await page.waitForTimeout(300);
  await page.selectOption('#lpSource', 'sim'); await page.locator('#lpStart').click(); await page.waitForTimeout(800);
  await page.evaluate(NZ => { const L = window.__lab; L.LIVE.simYellow = true; L.simCam.noise = NZ; L.LIVE.simManual = true; }, +(process.env.NOISE || 0.035));
  await page.locator('#lpCal').click();
  await page.waitForFunction(() => { const L = window.__lab.LIVE; return L.cal && L.cal.checkAvg != null && !L.calib; }, null, { timeout: 90000 });
  await page.locator('#lpSample').click(); await page.waitForTimeout(1800);
  console.log(method, skin, '| sample:', await page.locator('#lpColorNote').textContent());
  await page.evaluate(m => { const L = window.__lab.LIVE; L.method = m === 'ref' ? 'ref' : 'hue';
    if (m === 'huewide') Object.assign(L.color, {dh:40, s:0.25, v:0.3}); }, method);
  await page.locator('#lpPlay').click(); await page.waitForTimeout(300);
  await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 30000 });
  const stat = () => page.evaluate(() => { const V = window.__lab.LIVE, s = V.stats; return {frames:s.frames, hits:s.hits, starts:s.moveStarts + s.restStarts, mode:window.__lab.mode, state:V.state}; });
  // a person animation in sheet feet; times in real seconds
  const animate = (skinC, script) => page.evaluate(([skinC, script]) => new Promise(res => {
    const L = window.__lab, V = L.LIVE, t0 = performance.now(), W = L.W, D = L.D, busy = [];
    const lerp = (a, b, u) => a + (b - a)*Math.max(0, Math.min(1, u));
    const id = setInterval(() => {
      const t = (performance.now() - t0)/1000; let p = null;
      for (const k of script){ if (t >= k.t0 && t < k.t1){ const u = (t - k.t0)/(k.t1 - k.t0);
        p = {x:lerp(k.a[0]*W, k.b[0]*W, u), y:lerp(k.a[1]*D, k.b[1]*D, u), ang:k.ang || -1.2, skin:skinC, arm:[k.base[0]*W, k.base[1]*D]};
        if (k.head) p.head = [k.head[0]*W, k.head[1]*D];
        if (k.grab && u > 0.5) L.ball.visible = false;
      } }
      V.simPerson = p; busy.push(V.busy ? 1 : 0);
      if (t > script[script.length-1].t1){ clearInterval(id); V.simPerson = null; res({busyShare:+(busy.reduce((a,b)=>a+b,0)/busy.length).toFixed(2)}); }
    }, 30);
  }), [skinC, script]);
  // Phase A: nobody has putted. A hand reaches in, rests, wanders, a head leans in, then they leave.
  const A0 = await stat(), log0 = await page.evaluate(() => window.__lab.LIVE.log.length);
  const rA = await animate(skin, [
    {t0:0, t1:2, a:[0.3,1.1], b:[0.4,0.55], base:[0.25,1.25]},
    {t0:2, t1:5, a:[0.4,0.55], b:[0.4,0.55], base:[0.25,1.25]},          // rests 3 s
    {t0:5, t1:7, a:[0.4,0.55], b:[0.68,0.4], base:[0.6,1.25]},
    {t0:7, t1:10, a:[0.68,0.4], b:[0.68,0.4], base:[0.6,1.25], head:[0.62,0.18]},  // head leans in, hand rests
    {t0:10, t1:11.5, a:[0.68,0.4], b:[0.7,1.15], base:[0.6,1.25]}
  ]);
  await page.waitForTimeout(800);
  const A1 = await stat(), logA = await page.evaluate(n => window.__lab.LIVE.log.slice(n).map(e => e.msg), log0);
  console.log(`A (hand+head, no ball): false detections in ${A1.hits - A0.hits} of ${A1.frames - A0.frames} frames · false shot starts ${A1.starts - A0.starts} · movement guard on ${Math.round(rA.busyShare*100)}% of the time · now ${A1.state}/${A1.mode}`);
  for (const m of logA) console.log('   log:', m);
  if (full){
    // Phase B: a real putt, then the player walks in, picks the ball up and leaves; the next round must set itself up.
    if (A1.state !== 'ready') { await page.keyboard.press('n'); await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 40000 }); }
    const shoot = async (dy, dx) => { await page.mouse.move(640, 650); await page.mouse.down(); await page.mouse.move(640 + dx, 650 + dy, { steps: 5 }); await page.mouse.up(); };
    await shoot(80, -12);
    await page.waitForFunction(() => window.__lab.mode === 'result', null, { timeout: 40000 });
    const r1 = await page.evaluate(() => { const L = window.__lab, s = L.shot; return {rest:[+s.rest.x.toFixed(3), +s.rest.y.toFixed(3)], ball:[+L.ball.x.toFixed(3), +L.ball.y.toFixed(3)], n:s.delivered.length}; });
    r1.errIn = +(Math.hypot(r1.rest[0]-r1.ball[0], r1.rest[1]-r1.ball[1])*12).toFixed(2);
    console.log('B shot 1', JSON.stringify(r1));
    const bx = r1.ball[0]/8, by = r1.ball[1]/4.5;   // fractions (default 8 x 4.5 ft sheet)
    const rB = await animate(skin, [
      {t0:0, t1:2, a:[bx-0.1,1.1], b:[bx-0.02,by+0.03], base:[bx-0.15,1.25]},
      {t0:2, t1:3, a:[bx-0.02,by+0.03], b:[bx-0.02,by+0.03], base:[bx-0.15,1.25], head:[bx-0.05, Math.max(0.15, by-0.3)], grab:true},
      {t0:3, t1:5, a:[bx-0.02,by+0.03], b:[bx-0.1,1.15], base:[bx-0.15,1.25]}
    ]);
    const t0 = Date.now();
    await page.waitForFunction(() => window.__lab.LIVE.state === 'ready', null, { timeout: 60000 });
    console.log(`B pickup: guard on ${Math.round(rB.busyShare*100)}% of the walk-in; next round ready ${((Date.now()-t0)/1000).toFixed(1)} s after they left`);
    // Phase C: a putt while a hand waves on the far side of the sheet the whole time
    await page.evaluate(() => { window.__lab.ball.visible = true; });
    const C0 = await stat();
    const anim = animate(skin, [
      {t0:0, t1:3, a:[0.85,0.3], b:[0.9,0.8], base:[1.05,0.5]},
      {t0:3, t1:7, a:[0.9,0.8], b:[0.85,0.25], base:[1.05,0.5]}
    ]);
    await page.waitForTimeout(300);
    await shoot(70, 20);
    await page.waitForFunction(() => window.__lab.mode === 'result', null, { timeout: 40000 });
    const r2 = await page.evaluate(() => { const L = window.__lab, s = L.shot; return {rest:s.rest ? [+s.rest.x.toFixed(3), +s.rest.y.toFixed(3)] : null, why:s.why, ball:[+L.ball.x.toFixed(3), +L.ball.y.toFixed(3)], n:s.delivered.length}; });
    if (r2.rest) r2.errIn = +(Math.hypot(r2.rest[0]-r2.ball[0], r2.rest[1]-r2.ball[1])*12).toFixed(2);
    await anim;
    console.log('C shot with a hand on the far side', JSON.stringify(r2));
    const tail = await page.evaluate(() => window.__lab.LIVE.log.slice(-10).map(e => e.msg));
    for (const m of tail) console.log('   log:', m);
    await page.keyboard.press('f'); await page.keyboard.press('d'); await page.waitForTimeout(700);
    await page.screenshot({ path: out + '/' + ('hand-hud.png') });
  }
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
