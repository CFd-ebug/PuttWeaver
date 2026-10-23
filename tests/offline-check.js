const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const requests = [], errors = [];
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(dist('index.html'));
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    const fams = ['400 16px "Bungee"', '400 16px "Atkinson Hyperlegible"', '700 16px "Atkinson Hyperlegible"', '400 16px "IBM Plex Mono"', '500 16px "IBM Plex Mono"'];
    const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight);
    // play one shot of each game by clicking chips and dragging on the canvas
    const out = { loaded, check: fams.map(f => document.fonts.check(f)) };
    return out;
  });
  // real pointer-driven putts in three games
  const results = [];
  for (const name of ['Map Quest', 'Crowd Search', 'Periodic Table', 'Tic-Tac-Toe', 'Paint Wars']) {
    await page.getByRole('button', { name: new RegExp('^' + name) }).click();
    const box = await page.locator('#stage').boundingBox();
    const sx = box.x + box.width / 2, sy = box.y + box.height * 0.85;
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(sx + 5, sy + 120, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 15000 });
    results.push(name + ': ' + await page.locator('#rTitle').textContent());
    await page.mouse.click(sx, sy); await page.waitForTimeout(200);
  }
  await page.screenshot({ path: out + '/' + ('offline.png') });
  console.log(JSON.stringify({ ...r, results, requests, errors }, null, 1));
  await browser.close();
})();
