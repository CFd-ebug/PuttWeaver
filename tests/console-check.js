// The remote console end to end: a Host page and Manager pages (separate browser contexts, so separate "phones") talk through
// a fake Firebase Realtime Database (tests/fake-rtdb.js). Covers pairing by typed code and by the QR link, status and commands,
// stale and expired commands, expired and invalid codes, reconnecting after a network drop, Reset pairing, the connection
// self-test, and that Evaluators and unpaired Hosts never touch the network.
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const { dist } = require('./lib');
const { startFake } = require('./fake-rtdb');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function decodeQr(png) {                       // reads a QR code from an image with OpenCV; null if OpenCV is missing
  if (spawnSync('python3', ['-I', '-c', 'import cv2']).status !== 0) return null;
  const f = path.join(os.tmpdir(), 'qr-shot-' + process.pid + '.png'); fs.writeFileSync(f, png);
  const r = spawnSync('python3', ['-I', '-c', 'import cv2,sys; v=cv2.QRCodeDetector().detectAndDecode(cv2.imread(sys.argv[1]))[0]; print(v)', f], { encoding: 'utf8' });
  fs.unlinkSync(f); return r.stdout.trim();
}

(async () => {
  const fake = await startFake();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function phone(role, hash) {           // a fresh browser profile pointed at the fake relay
    const ctx = await browser.newContext({ viewport: { width: role === 'manage' ? 420 : 1280, height: role === 'manage' ? 860 : 800 } });
    await ctx.addInitScript(url => { try { if (!localStorage.getItem('putt-lab-relay-url')) localStorage.setItem('putt-lab-relay-url', url); } catch (e) {} }, fake.url);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(role + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(role + ' console: ' + m.text()); });
    await page.goto(dist('index.html', role) + (hash || '')); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const txt = (p, sel) => p.locator(sel).first().innerText();
  const tap2 = async loc => { const h = await loc.elementHandle(); await h.click(); await h.click(); };      // keys that change the game ask for a second tap
  const until = async (fn, ms = 8000, step = 100) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(step); } };

  // ---- nothing leaves the page until a Host is paired ----
  {
    const ev = await phone('play'), host = await phone('host');
    await sleep(1200);
    check(fake.requests.length === 0, 'An Evaluator and an unpaired Host make no relay requests (' + fake.requests.length + ')');
    await ev.ctx.close();
    // ---- Host opens the pairing window ----
    await host.page.locator('#btnPair').click();
    const code = await until(async () => { const t = (await txt(host.page, '#pairCode')).replace('-', '').trim(); return t.length === 8 && t; });
    check(!!code, 'Host shows an 8 character pairing code' + (code ? ' (' + code + ')' : ''));
    const rec = fake.get('pair/' + code);
    check(rec && rec.room && rec.room.length === 20 && rec.exp > Date.now() + 60000 && rec.exp <= Date.now() + 125000, 'The code is stored with a room id and a two-minute expiry');
    const shot = await host.page.locator('#pairQr').screenshot(), dec = decodeQr(shot);
    if (dec === null) notes.push('skip QR scan (OpenCV not installed)');
    else check(dec.includes('#manage=' + code), 'The QR code on the Host decodes to a link carrying the code (' + dec.slice(-30) + ')');

    // ---- Manager joins by typing the code ----
    const m1 = await phone('manage');
    check(await m1.page.locator('#mgrJoin').isVisible() && !await m1.page.locator('#mgrRun').isVisible(), 'An unpaired Manager shows the join card');
    await m1.page.fill('#mgrCodeIn', 'zzzz-zzzz'); await m1.page.click('#mgrJoinBtn');
    check(await until(async () => /not valid/.test(await txt(m1.page, '#mgrJoinMsg'))), 'A wrong code is refused with a plain message');
    fake.put('pair/OLDCODE2', { room: rec.room, exp: Date.now() - 5000 });
    await m1.page.fill('#mgrCodeIn', 'OLDCODE2'); await m1.page.click('#mgrJoinBtn');
    check(await until(async () => /expired/.test(await txt(m1.page, '#mgrJoinMsg'))), 'An expired code is refused');
    await m1.page.fill('#mgrCodeIn', code.toLowerCase()); await m1.page.click('#mgrJoinBtn');
    check(await until(() => m1.page.locator('#mgrRun').isVisible()), 'Typing the code (lower case) joins the Manager');
    check(!fake.get('pair/' + code), 'A code works once: it is deleted after joining');
    check(await until(async () => /Relay connected/.test(await txt(m1.page, '#mgrRelayTxt'))), 'Manager shows the relay as connected');
    check(await until(async () => /Host online/.test(await txt(m1.page, '#mgrHostTxt'))), 'Manager shows the Host as online');
    check(await until(async () => /1 controller is connected/.test(await txt(host.page, '#pairWho'))), 'Host sees one controller connected');
    check(/Controllers \(1\)/.test(await txt(host.page, '#btnPair')), 'Host toolbar button counts controllers');
    await host.page.locator('#pairClose').click();

    // ---- status flows to the Manager ----
    const hostGame = await txt(host.page, '#gTitle');
    check(await until(async () => (await txt(m1.page, '#mgrGame')) === hostGame), 'Manager shows the Host’s current game (' + hostGame + ')');
    check(await until(async () => /\S/.test(await txt(m1.page, '#mgrStatus'))), 'Manager shows the game status line');
    await m1.page.locator('#mgrPickBtn').click();
    check(await until(async () => (await m1.page.locator('#mgrPickGrid .gk').count()) === 6), 'Manager offers the six games that are shown');

    // ---- commands ----
    await tap2(m1.page.locator('#mgrPickGrid .gk', { hasText: 'Timeline' }));
    check(await until(async () => (await txt(host.page, '#gTitle')) === 'Timeline'), 'Choosing a game on the Manager changes the Host’s game');
    check(await until(async () => /Done/.test(await txt(m1.page, '#mgrCmdMsg'))), 'The Manager shows the Host’s acknowledgement');
    check(await until(async () => (await txt(m1.page, '#mgrGame')) === 'Timeline'), 'The new game appears on the Manager');
    await tap2(m1.page.locator('[data-cmd="next"]'));
    check(await until(async () => (await txt(host.page, '#gTitle')) === 'Periodic Table'), 'Next game');
    await tap2(m1.page.locator('[data-cmd="prev"]'));
    check(await until(async () => (await txt(host.page, '#gTitle')) === 'Timeline'), 'Previous game');
    const room = rec.room;
    check(await until(() => !fake.get('rooms/' + room + '/cmd')), 'Handled commands are removed from the relay');
    await m1.page.locator('#mgrHoldBtn').click();
    check(await until(() => fake.get('rooms/' + room + '/state/hold') === true), 'Hold screen is reported in the Host’s state');
    await m1.page.locator('#mgrHoldBtn').click();
    check(await until(() => fake.get('rooms/' + room + '/state/hold') === false), 'Resume game clears the hold');
    check(await m1.page.locator('#mgrTrackBtn').isDisabled(), 'Tracking cannot be started from the console before a camera is set up');
    await m1.page.locator('#mgrTrackBtn').evaluate(b => { b.disabled = false; }); await m1.page.locator('#mgrTrackBtn').click();
    check(await until(async () => /Start the camera/.test(await txt(m1.page, '#mgrCmdMsg'))), 'A command the Host cannot do comes back with the reason');

    // ---- commands written while the Host was away are ignored ----
    fake.put('rooms/' + room + '/cmd/-Nold', { type: 'game', args: { idx: 0 }, ts: Date.now() - 60000, ttl: 8000 });
    check(await until(() => (fake.get('rooms/' + room + '/ack/-Nold') || {}).ok === false), 'A stale command is refused, not run');
    check((await txt(host.page, '#gTitle')) === 'Timeline', 'The stale command did not change the game');

    // ---- a second Manager joins through the QR link ----
    await m1.page.click('#mgrAdd');
    const code2 = await until(async () => { const t = (await txt(m1.page, '#mgrAddCode')).replace('-', '').trim(); return t.length === 8 && t; });
    check(!!code2, 'A paired Manager can create a code for another controller');
    const dec2 = decodeQr(await m1.page.locator('#mgrAddQr').screenshot());
    const link = dec2 && dec2.includes('#manage=') ? dec2 : dist('index.html', 'manage') + '=' + code2;
    await m1.page.click('#mgrAddClose');
    const m2 = await phone('manage', ''); await m2.page.goto(link); await m2.page.waitForTimeout(300);
    check(await until(() => m2.page.locator('#mgrRun').isVisible()), 'Opening the link joins automatically (code ' + code2 + ')');
    check(!/manage=/.test(m2.page.url()), 'The code is removed from the address after joining');
    check(await until(async () => (await txt(m2.page, '#mgrGame')) === 'Timeline'), 'The second Manager sees the same game');
    check(await until(async () => /2 controllers are connected/.test(await txt(host.page, '#pairWho').catch(() => '')) || (await host.page.locator('#btnPair').innerText()).includes('(2)')), 'Host counts two controllers');
    await tap2(m2.page.locator('[data-cmd="next"]'));
    check(await until(async () => (await txt(host.page, '#gTitle')) === 'Periodic Table' && (await txt(m1.page, '#mgrGame')) === 'Periodic Table'), 'A command from the second Manager reaches the Host and shows on both');

    // ---- the network drops and comes back ----
    fake.setOffline(true);
    check(await until(async () => /offline/i.test(await txt(m1.page, '#mgrRelayTxt')), 8000), 'Manager shows the relay as offline when the network drops');
    fake.setOffline(false);
    check(await until(async () => /Relay connected/.test(await txt(m1.page, '#mgrRelayTxt')), 15000), 'Manager reconnects by itself');
    await tap2(m1.page.locator('[data-cmd="restart"]'));
    check(await until(async () => /Done/.test(await txt(m1.page, '#mgrCmdMsg'))), 'Commands work again after reconnecting');

    // ---- the connection self-test ----
    await m1.page.click('#mgrTest');
    check(await until(async () => await m1.page.locator('#mgrSteps li').count() >= 8, 15000), 'The connection test runs every step');
    const bad = await m1.page.locator('#mgrSteps .dot[data-s="bad"]').count();
    check(bad === 0, 'Every connection test step passes against rules like the real ones' + (bad ? ' (failed: ' + (await m1.page.locator('#mgrSteps li').allInnerTexts()).filter((t, i) => i >= 0).join(' | ') + ')' : ''));
    check(!Object.keys(fake.get('rooms') || {}).some(r => r !== room), 'The test cleans up its throwaway room');

    // ---- reset pairing cuts everyone off ----
    await host.page.locator('#btnPair').click(); await sleep(300);
    await host.page.locator('#pairReset').click(); await host.page.locator('#pairReset').click();
    check(await until(() => !fake.get('rooms/' + room)), 'Reset pairing deletes the old room');
    const newRoom = await host.page.evaluate(() => localStorage.getItem('putt-lab-room'));
    check(!newRoom, 'Reset pairing forgets the room on the Host');
    await host.page.locator('#pairNew').click();
    const code3 = await until(async () => { const t = (await txt(host.page, '#pairCode')).replace('-', '').trim(); return t.length === 8 && t; });
    const room3 = code3 && (fake.get('pair/' + code3) || {}).room;
    check(!!room3 && room3 !== room, 'A new code after a reset belongs to a new room');
    await m1.ctx.close(); await m2.ctx.close(); await host.ctx.close();
  }

  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
