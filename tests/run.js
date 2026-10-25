#!/usr/bin/env node
// Runs the browser tests one after another and prints a pass/fail table.
//   node tests/run.js          quick suite (a few minutes): every game plays through, the page stays offline, ranking and Crowd Search checks
//   node tests/run.js --full   also closed-loop tracking on every game, hand/head/shadow rejection, calibration, projector mode, phone layout
// Needs `npm install` and a Chromium: either `npx playwright install chromium`, or point CHROMIUM_PATH at an existing one.
const { spawnSync } = require('child_process');
const path = require('path');
const full = process.argv.includes('--full');

const allGames = ['Accuracy', 'Map Quest', 'Timeline', 'Periodic', 'Crowd Search', 'Tic-Tac-Toe', 'Star Sweep', 'Bowling', 'Shooting Gallery', 'Paint Wars'];
const NO_ERRORS = /^ERRORS none/m;
const suite = [
  { name: 'QR generator decodes (OpenCV)', file: 'qr-decode.js', timeout: 60, ok: [/failures 0|skipped/] },
  { name: 'roles: Evaluator, Host and Manager', file: 'role-check.js', timeout: 180, ok: [NO_ERRORS] },
  { name: 'console: pairing, status, commands, reconnect', file: 'console-check.js', timeout: 240, ok: [NO_ERRORS] },
  { name: 'console: dashboard, shot replays, play statistics', file: 'dashboard-check.js', timeout: 240, ok: [NO_ERRORS] },
  { name: 'console: game picker and games shown', file: 'picker-check.js', timeout: 240, ok: [NO_ERRORS] },
  { name: 'console: Setup tab with the simulated camera', file: 'console-setup-check.js', timeout: 400, ok: [NO_ERRORS] },
  { name: 'console: Debug tab with the simulated camera', file: 'console-debug-check.js', timeout: 400, ok: [NO_ERRORS] },
  { name: 'console: event lock, wake lock, restart, cleanup', file: 'console-hardening-check.js', timeout: 400, ok: [NO_ERRORS] },
  { name: 'ui: every game plays to a score', file: 'ui-check.js', timeout: 420, ok: [NO_ERRORS] },
  { name: 'offline: no network requests', file: 'offline-check.js', timeout: 120, ok: [/"requests": \[\]/, /"errors": \[\]/] },
  { name: 'ranking and export panel', file: 'rank-check.js', timeout: 120, ok: [NO_ERRORS] },
  { name: 'Crowd Search difficulty', file: 'seek-check.js', timeout: 120, ok: [NO_ERRORS] },
];
if (full) {
  for (const g of allGames) suite.push({ name: 'tracking, closed loop: ' + g, file: 'play-check.js', args: [g, 'ref', 'x', '3'], timeout: 480, ok: [NO_ERRORS, /3\/3 scored/] });
  suite.push(
    { name: 'tracking: hands, heads and shadows are ignored', file: 'hand-check.js', timeout: 600, ok: [] },
    { name: 'tracking: walking person', file: 'walk-check.js', timeout: 300, ok: [] },
    { name: 'tracking: movement guard', file: 'motion-check.js', timeout: 300, ok: [] },
    { name: 'calibration, color sampling, delay', file: 'live-check.js', timeout: 300, ok: [] },
    { name: 'camera panel', file: 'cam-check.js', timeout: 120, ok: [] },
    { name: 'projector mode', file: 'proj-check.js', timeout: 120, ok: [] },
    { name: 'phone layout', file: 'phone-check.js', timeout: 120, ok: [] },
    { name: 'toolbar', file: 'bar-check.js', timeout: 120, ok: [] },
  );
}

let failed = 0;
for (const t of suite) {
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(__dirname, t.file), ...(t.args || [])], { encoding: 'utf8', timeout: t.timeout * 1000, cwd: __dirname });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = [];
  if (r.error) bad.push(r.error.code === 'ETIMEDOUT' ? 'timed out' : String(r.error.message));
  else if (r.status !== 0) bad.push('exit code ' + r.status);
  if (/\bSTUCK\b|pageerror|Error:/.test(out)) bad.push('errors in output');
  for (const re of t.ok) if (!re.test(out)) bad.push('missing expected output ' + re);
  const secs = ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
  console.log((bad.length ? 'FAIL' : 'ok  ') + '  ' + secs + '  ' + t.name + (bad.length ? '  <- ' + bad.join('; ') : ''));
  if (bad.length) { failed++; console.log(out.split('\n').slice(-25).map(l => '        ' + l).join('\n')); }
}
console.log(failed ? '\n' + failed + ' of ' + suite.length + ' failed' : '\nall ' + suite.length + ' passed');
process.exit(failed ? 1 : 0);
