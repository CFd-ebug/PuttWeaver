#!/usr/bin/env node
// Assembles the modular source in src/ into two single-file pages in dist/:
//   dist/index.html  the real thing: fully offline (fonts embedded), simulation-only code stripped. This is what GitHub Pages serves.
//   dist/test.html   the same page plus a `window.__lab` hook and the desk-test simulation code, used by tests/.
// `node scripts/build.js --check` builds and only validates (used by CI and `npm run check`).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const src = (...p) => path.join(root, 'src', ...p);
const read = p => fs.readFileSync(p, 'utf8');

// ---- which version is this? (shown in the page footer so you can tell whether GitHub Pages has caught up) ----
// In CI: a pull request run says "PR #n preview"; a run on main takes the PR number from the merge or squash commit message.
function buildInfo() {
  const sh = c => { try { return require('child_process').execSync(c, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
  const ref = process.env.GITHUB_REF || '';
  let sha = process.env.GITHUB_SHA || sh('git rev-parse HEAD'), pr = null, kind = 'local';
  const m = ref.match(/^refs\/pull\/(\d+)\//);
  if (m) {
    kind = 'preview'; pr = +m[1];
    try { const ev = JSON.parse(read(process.env.GITHUB_EVENT_PATH)); if (ev.pull_request && ev.pull_request.head) sha = ev.pull_request.head.sha; } catch (e) {}   // the PR's own last commit, not the temporary merge
  } else if (process.env.GITHUB_ACTIONS && ref === 'refs/heads/main') {
    kind = 'main'; const n = sh('git log -1 --format=%s').match(/#(\d+)/); pr = n ? +n[1] : null;
  }
  sha = sha.slice(0, 7);
  const label = kind === 'preview' ? `PR #${pr} preview · ${sha}` : kind === 'main' ? (pr ? `PR #${pr} · ${sha}` : `commit ${sha}`) : `local build${sha ? ' · ' + sha : ''}`;
  return { kind, pr, sha, label, time: new Date().toISOString() };
}
const BUILD = buildInfo();

// ---- source assembly ----
function assemble() {
  const manifest = JSON.parse(read(src('games', 'games.json')));
  for (const g of manifest) if (!fs.existsSync(src('games', g.file))) throw new Error('games.json lists a missing file: ' + g.file);
  const onDisk = fs.readdirSync(src('games')).filter(f => f.endsWith('.js'));
  const unlisted = onDisk.filter(f => !manifest.some(g => g.file === f));
  if (unlisted.length) throw new Error('game file(s) not listed in src/games/games.json: ' + unlisted.join(', '));

  const games = manifest.map(g => read(src('games', g.file))).join('')
    + 'const GAMES = [' + manifest.map(g => g.make + '()').join(', ') + '];\n';
  const files = fs.readdirSync(src('js')).filter(f => f.endsWith('.js')).sort();   // numeric prefixes give the order
  const script = files.map(f => read(src('js', f))).join('')
    .replace('/*__GAMES__*/', () => games)
    .replace('/*__MAPDATA__*/', () => read(src('data', 'map.js')).trim())
    .replace('/*__ELEMENTS__*/', () => read(src('data', 'elements.js')).trim())
    .replace('/*__BUILD__*/', () => JSON.stringify(BUILD));
  return read(src('template.html'))
    .replace('/*__STYLES__*/', () => read(src('styles.css')))
    .replace('<!--__BODY__-->', () => read(src('body.html')))
    .replace('/*__SCRIPT__*/', () => script);
}

// Hook for the tests: exposes internals as window.__lab
const TEST_HOOK = `window.__lab = { tick, draw, putt, place, advance, startGame, buildSurface, maxRoll,
  select(i){ gameIdx=i; startGame(); }, set(k,v){ S[k]=v; }, setOpt(g,k,v){ setOpt(g,k,v); },
  get mode(){ return mode; }, get game(){ return game; }, get ball(){ return ball; },
  get W(){ return W; }, get D(){ return D; }, get TEE(){ return TEE; }, get shot(){ return shot; },
  get LIVE(){ return LIVE; }, liveReport, homApply, enterProj, toggleFit, sheetCornersFrac, simCam };`;

// ---- offline wrapper: embedded fonts + full document skeleton ----
const fontDir = path.join(root, 'assets', 'fonts');
const b64 = f => fs.readFileSync(path.join(fontDir, f)).toString('base64');
const face = (family, weight, file) => {
  const fmt = file.endsWith('.ttf') ? 'ttf' : 'woff';
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/${fmt};base64,${b64(file)}) format("${fmt === 'ttf' ? 'truetype' : 'woff'}")}`;
};
const fontCss = `<style>
/* Embedded fonts, all under the SIL Open Font License 1.1 (https://openfontlicense.org); license texts are in assets/fonts/.
   Bungee: Copyright 2023 The Bungee Project Authors (https://github.com/djrrb/Bungee). Latin subset.
   Atkinson Hyperlegible: Copyright 2020 Braille Institute of America, Inc. Latin subset.
   IBM Plex Mono: Copyright 2017 IBM Corp. with Reserved Font Name "Plex". Embedded unmodified.
   Inter: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter). Latin subset. */
${face('Bungee', 400, 'Bungee-Regular.woff')}
${face('Atkinson Hyperlegible', 400, 'AtkinsonHyperlegible-Regular.woff')}
${face('Atkinson Hyperlegible', 700, 'AtkinsonHyperlegible-Bold.woff')}
${face('IBM Plex Mono', 400, 'IBMPlexMono-Regular.ttf')}
${face('IBM Plex Mono', 500, 'IBMPlexMono-Medium.ttf')}
${face('Inter', 400, 'Inter-Regular.woff')}
${face('Inter', 600, 'Inter-SemiBold.woff')}
${face('Inter', 700, 'Inter-Bold.woff')}
${face('Inter', 800, 'Inter-ExtraBold.woff')}
/* base reset */
html{-webkit-text-size-adjust:100%}
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0}
[hidden]{display:none!important}
</style>`;

function wrap(page) {
  const i = page.indexOf('<div class="app">');
  const head = page.slice(0, i), rest = page.slice(i);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head.trim()}
${fontCss}
</head>
<body>
${rest.trim()}
</body>
</html>
`;
}

// ---- build ----
const full = assemble();                                                  // still has the simulation blocks and the __TEST__ marker
const prod = full.replace(/\/\*SIM\*\/[\s\S]*?\/\*\/SIM\*\//g, '').replace('/*__TEST__*/', '');
const test = full.replace('/*__TEST__*/', () => TEST_HOOK);

// every script must at least parse
const inline = html => html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
for (const [name, html] of [['index', prod], ['test', test]]) {
  try { new vm.Script(inline(html), { filename: name + ' (inline script)' }); }
  catch (e) { console.error('Syntax error in the ' + name + ' build:\n' + e.stack.split('\n').slice(0, 6).join('\n')); process.exit(1); }
}
const leftovers = [...prod.matchAll(/\/\*__[A-Z]+__\*\/|<!--__[A-Z]+__-->/g)].map(m => m[0]);
if (leftovers.length) { console.error('Unreplaced placeholders: ' + leftovers.join(', ')); process.exit(1); }
// the page must stay fully offline: nothing may be fetched from the network (tests/offline-check.js also verifies this at runtime)
const fetched = [...wrap(prod).matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+|url\((?:["'])?https?:[^)]+|@import[^;]*https?:/g)].map(m => m[0]);
if (fetched.length) { console.error('The page references network resources: ' + fetched.slice(0, 3).join(' | ')); process.exit(1); }

if (process.argv.includes('--check')) { console.log('ok: both builds parse'); process.exit(0); }
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), wrap(prod));
fs.writeFileSync(path.join(root, 'dist', 'test.html'), wrap(test));
console.log('version:', BUILD.label, '·', BUILD.time);
console.log('dist/index.html', Buffer.byteLength(wrap(prod)), 'bytes · dist/test.html', Buffer.byteLength(wrap(test)), 'bytes');
