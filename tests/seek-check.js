const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(dist('test.html')); await page.waitForTimeout(500);
  const stats = await page.evaluate(() => {
    const L = window.__lab, out = {};
    for (const lvl of ['quick','medium','tricky']){
      L.setOpt('seek','level',lvl); L.select(4);
      const s = []; for (let i = 0; i < 150; i++){ L.startGame(); s.push(L.game.searchStats()); }
      const avg = k => +(s.reduce((a,x) => a + x[k], 0)/s.length).toFixed(1), max = k => Math.max(...s.map(x => x[k]));
      out[lvl] = {crowd: avg('crowd'), crowdMin: Math.min(...s.map(x => x.crowd)), sameItemAvg: avg('sameItem'), sameItemMax: max('sameItem'), twoCluesAvg: avg('twoClues'), twoCluesMax: max('twoClues'), personIn: s[0].sizeIn};
    }
    L.setOpt('seek','level','quick'); L.setOpt('seek','hint','on'); L.select(4);
    for (let i = 0; i < 150; i++) L.tick(0.05);   // 7.5 s of searching: spotlight on
    L.draw();
    return out;
  });
  await page.waitForTimeout(200);
  await page.locator('#stage').screenshot({ path: out + '/' + ('shot-seek-quick.png') });
  for (const [k, v] of Object.entries(stats)) console.log(k.padEnd(7), JSON.stringify(v));
  console.log('ERRORS', errors.length ? errors.join('; ') : 'none');
  await browser.close();
})();
