// Encodes text with the page's own QR generator (src/js/06-qr.js) at every size from version 1 to 10, then decodes
// each code with OpenCV (python3 -c "import cv2"). Skipped with a note if OpenCV is not installed.
// No browser needed.
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '06-qr.js'), 'utf8');
const qrMake = new Function(src + ';return qrMake;')();
const have = spawnSync('python3', ['-I', '-c', 'import cv2, numpy']);
if (have.status !== 0) { console.log('qr-decode: OpenCV not installed, skipped'); process.exit(0); }
const lens = [1, 14, 20, 32, 46, 62, 84, 106, 122, 140, 154, 178, 213], texts = [];
for (const n of lens) texts.push(Array.from({length: n}, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789#=&/:.-'[(i * 7 + n) % 43]).join(''));
texts.push('https://cfd-ebug.github.io/PuttWeaver/#manage=K7M2QX9P', 'é ü 日本語 test');
const data = texts.map(t => { const q = qrMake(t); return {t, v: q.version, m: q.m.map(r => r.map(b => b ? 1 : 0))}; });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-')), file = path.join(dir, 'codes.json');
fs.writeFileSync(file, JSON.stringify(data));
const py = `
import json, sys, numpy as np, cv2
d = json.load(open(sys.argv[1])); det = cv2.QRCodeDetector(); bad = 0; seen = set()
for o in d:
    m = np.array(o['m'], dtype=np.uint8)
    img = cv2.resize(np.pad((1 - m) * 255, 4, constant_values=255).astype(np.uint8), None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    val = det.detectAndDecode(img)[0]; seen.add(o['v'])
    if val != o['t']: bad += 1; print('FAIL version', o['v'], repr(o['t'][:30]), '->', repr(val[:30]))
print('versions covered', sorted(seen), 'failures', bad); sys.exit(1 if bad else 0)
`;
const r = spawnSync('python3', ['-I', '-c', py, file], {encoding: 'utf8'});
console.log(r.stdout.trim()); if (r.stderr.trim()) console.log(r.stderr.trim());
fs.rmSync(dir, {recursive: true, force: true});
process.exit(r.status === 0 ? 0 : 1);
