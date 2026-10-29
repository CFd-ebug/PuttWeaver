// Bowling pin physics and result shows. usage: node tests/bowling-check.js
// Rolls straight ball paths into the game (as the camera would report them, without noise) and checks: the same path always
// leaves the same pins, a pocket hit strikes, a ball may come onto the lane from the side of the tee box, a ball that leaves the
// lane is a gutter ball, a creeping ball only wobbles a pin, splits are recognized, the 4-10 can be picked up and the 7-10
// cannot, and the result ribbon never covers the resting ball (the camera would lose it and think it was picked up).
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let fails = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };
  await page.goto(dist('test.html', 'play')); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Bowling/ }).click(); await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const L = window.__lab, g = L.game, W = L.W, D = L.D, hy = D*0.42, a = 36/22;   // a: rolling deceleration at stimp 11
    // a ball from (sx, tee) through (tx, ty), moving at v ft/s there, sampled at 30 fps; leave: pins standing at the start
    const roll = (sx, tx, ty, v, leave) => {
      g.start(); if (leave) g.leave(leave); g.onShotStart();
      let ux = tx-sx, uy = ty-L.TEE.y; const ul = Math.hypot(ux,uy); ux /= ul; uy /= ul;
      const v0 = Math.sqrt(v*v + 2*a*ul), stop = v0*v0/(2*a); let prev = null, last = null;
      for (let k=0;k<600;k++){ const t = k/30, d = Math.min(stop, v0*t - a*t*t/2), x = sx+ux*d, y = L.TEE.y+uy*d;
        if (y <= D && y >= 0 && x >= 0 && x <= W){ const s = {x, y, t}; g.onSample(s, prev); prev = s; last = s; }
        if (d >= stop || y < 0) break; }
      const res = g.onRest(last && last.y > 0.05 ? last : null, last && last.y > 0.05 ? null : 'off');
      return {title: res.title, detail: res.detail, left: +((g.status().match(/(\d+) pins? standing/) || [0, 0])[1])};
    };
    const out = {};
    out.same = [0,1,2].map(() => roll(W/2, W/2+0.02, hy, 2.2)).map(x => x.title + '/' + x.left);
    out.pocket = roll(W/2, W/2+0.1, hy, 2.5).title;
    out.side = roll(W/2-1.1, W/2+0.1, hy, 2.5).title;
    out.gutter = roll(W/2, W/2-1.3, hy, 1).title;
    out.wobble = roll(W/2, W/2, hy+0.15, 0).title;
    out.split410 = roll(W/2, W/2-1.6, D-0.3, 0, [4,10]).detail;
    out.split47 = roll(W/2, W/2-1.6, D-0.3, 0, [4,7]).detail;
    let made = 0; for (let o=-0.75; o<=-0.6; o+=0.0025){ const x = roll(W/2-1.1, W/2+o, hy, 3, [4,10]); if (x.left === 0) made++; }
    out.made410 = made;
    let made710 = 0; for (let sx=-1.1; sx<=1.101; sx+=0.1) for (const v of [2,3,4]) for (let o=-0.9; o<=0.9; o+=0.005){ if (roll(W/2+sx, W/2+o, hy, v, [7,10]).left === 0) made710++; }
    out.made710 = made710;
    return out;
  });
  check(new Set(r.same).size === 1, `The same path leaves the same pins every time (${r.same.join(', ')})`);
  check(/Strike/.test(r.pocket), `A firm pocket hit strikes (${r.pocket})`);
  check(!/Gutter/.test(r.side) && /pin|Strike/.test(r.side), `A ball from the corner of the tee box onto the lane counts (${r.side})`);
  check(r.gutter === 'Gutter ball', `A ball that leaves the lane is a gutter ball (${r.gutter})`);
  check(r.wobble === 'Wobbler', `A ball that creeps into the head pin only wobbles it (${r.wobble})`);
  check(/4-10 split/.test(r.split410), 'A 4-10 leave is named as a split');
  check(!/split/.test(r.split47), 'A 4-7 leave is not a split');
  check(r.made410 > 0, `The 4-10 can be picked up from the corner of the tee box (${r.made410} lines)`);
  check(r.made710 === 0, `The 7-10 cannot be picked up (${r.made710} lines)`);

  // the PICK UP ribbon after four short putts that stop mid-lane: it has to move off the ball
  const pick = await page.evaluate(() => {
    const L = window.__lab; L.set('flat','flat'); L.set('skill','perfect'); L.buildSurface(); L.startGame();
    for (let i=0;i<4;i++){ if (L.mode === 'result') L.advance();
      L.putt(-Math.PI/2, 0.5); const b = L.ball, a = 36/22; b.x = L.W/2; b.y = L.TEE.y; const d = L.TEE.y - 2.6, v0 = Math.sqrt(2*a*d); b.vx = 0; b.vy = -v0;
      for (let n=0;n<20000&&(L.mode==='roll'||L.mode==='read');n++) L.tick(1/60); }
    return {title: document.getElementById('rTitle').textContent, x: L.ball.x, y: L.ball.y};
  });
  await page.waitForTimeout(1600);
  const px = await page.evaluate(b => {
    const L = window.__lab; L.draw(); const c = document.getElementById('stage'), x2 = c.getContext('2d');
    const at = (x, y) => { const [u, v] = L.toDev(x, y); return [...x2.getImageData(Math.round(u), Math.round(v), 1, 1).data].slice(0, 3); };
    const near = [[-0.3,0],[0.3,0],[0,-0.3],[0,0.3],[0.3,0.3],[-0.3,0.3]].map(([dx, dy]) => at(b.x+dx, b.y+dy));
    return {near, band: at(L.W/2 + 1.3*L.W/8, L.D - 0.75*L.W/8)};
  }, pick);
  const isBand = c => Math.hypot(c[0]-0x49, c[1]-0x50, c[2]-0x62) < 30;   // the PICK UP ribbon's gray
  const isRibbon = c => isBand(c) || Math.hypot(c[0]-0x1d, c[1]-0x23, c[2]-0x33) < 30 || Math.min(...c) > 245;   // its band, letter outline or letters
  check(pick.title === 'Pick up', `Four short putts pick up (${pick.title})`);
  check(isBand(px.band), `The PICK UP ribbon moved below the ball (${px.band})`);
  check(!px.near.some(isRibbon), `No ribbon around the resting ball (${px.near.map(c => c.join('/')).join(' ')})`);
  await page.locator('#stage').screenshot({ path: out + '/bowling-pickup.png' });

  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
  if (fails) process.exitCode = 1;
})();
