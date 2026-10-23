// ================= units & constants (feet, seconds) =================
const IN = 1/12;
const BALL_R = 1.68/2*IN;          // regulation golf ball
const G = 32.174;
const SLOPE_K = 5/7*G;             // rolling ball on an incline
const STIMP_V = 6;                 // stimpmeter release speed, ft/s
const STEP = 1/240;
const NOISE = 0.25*IN;             // camera position noise (1 sigma)
const REST_WINDOW = 0.5;           // camera waits this long to call the ball stopped
const E_RAIL = 0.68, F_RAIL = 0.93;
const CUP_R = 4.25/2*IN;

const SPEEDS = {slow:8, medium:11, fast:15};
const SKILLS = {perfect:{d:0,a:0}, pro:{d:.04,a:.6}, average:{d:.10,a:1.5}, beginner:{d:.18,a:3}};
const FLATS = {flat:{amp:0,tilt:0,n:0}, slight:{amp:.04*IN,tilt:.1,n:7}, wavy:{amp:.12*IN,tilt:.3,n:10}};
const DEFAULTS = {width:8, rails:true, speed:'medium', flat:'slight', skill:'average', fps:30, latency:100, showPath:true, washed:false, input:'putt'};
const S = Object.assign({}, DEFAULTS);
try {
  const saved = JSON.parse(localStorage.getItem('putt-lab-settings') || '{}');
  for (const key in DEFAULTS) if (key in saved && typeof saved[key] === typeof DEFAULTS[key]) S[key] = saved[key];
} catch (e) {}
function saveSettings(){ try { localStorage.setItem('putt-lab-settings', JSON.stringify(S)); } catch (e) {} }

const WHY = {
  off: 'The ball rolled off the sheet, so the camera lost it.',
  wide: 'The ball missed the sheet.',
  back: 'The ball rolled back off the front edge.',
  short: 'The ball stopped before it reached the sheet.'
};

// ================= helpers =================
const $ = id => document.getElementById(id);
const rnd = (a,b) => a + Math.random()*(b-a);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function gauss(){ let u=0, v=0; while(!u) u=Math.random(); while(!v) v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function shuffle(a){ a=a.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function segClosest(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy;
  let t = L2 ? ((px-ax)*dx+(py-ay)*dy)/L2 : 0; t = clamp(t,0,1);
  const x=ax+dx*t, y=ay+dy*t;
  return {d:Math.hypot(px-x,py-y), t, x, y};
}
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function hav(lat1,lon1,lat2,lon2){
  const r=Math.PI/180, dLat=(lat2-lat1)*r, dLon=(lon2-lon1)*r;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;
  return 2*6371*Math.asin(Math.min(1, Math.sqrt(a)));
}
const li = items => '<ul class="notes-list">' + items.map(t => '<li>'+t+'</li>').join('') + '</ul>';

// ================= geometry & surface =================
let W, D, K, TEE, WORLD;
let bumps = [], tilt = {x:0, y:0};
function setGeometry(){
  W = S.width; D = W*9/16; K = W/8;
  TEE = {x:W/2, y:D+1.1};
  WORLD = {x0:-0.45, y0:-0.45, x1:W+0.45, y1:D+1.9};
  buildSurface();
}
function buildSurface(){
  const f = FLATS[S.flat] || FLATS.flat; bumps = [];
  for (let i=0;i<f.n;i++) bumps.push({x:Math.random()*W, y:Math.random()*D, s:(0.5+Math.random()*0.8)*K, a:f.amp*(Math.random()*2-1)});
  const ang = Math.random()*Math.PI*2, t = Math.sin(f.tilt*Math.PI/180);
  tilt = {x:Math.cos(ang)*t, y:Math.sin(ang)*t};
}
function grad(x,y){
  let gx=tilt.x, gy=tilt.y;
  for (const b of bumps){ const dx=x-b.x, dy=y-b.y, s2=b.s*b.s; const e=b.a*Math.exp(-(dx*dx+dy*dy)/(2*s2)); gx -= e*dx/s2; gy -= e*dy/s2; }
  return {x:gx, y:gy};
}
const rollDecel = () => STIMP_V*STIMP_V/(2*SPEEDS[S.speed]);
const maxRoll = () => 1.45*Math.hypot(W/2, D+1.1);
const onSheet = (x,y) => x>=0 && x<=W && y>=0 && y<=D;

// ================= canvas & drawing helpers =================
const cvs = $('stage'), ctx = cvs.getContext('2d');
let dpr = 1; const view = {T:1, css:1, ox:0, oy:0};
let proj = false, projTest = false, lastResult = null, projTee = true;
try { projTee = localStorage.getItem('putt-lab-tee') !== '0'; } catch (e) {}
// In projector mode the tee is shown below the sheet for simulated putting. The true-size, sheet-only layout
// is used for the test card and anything camera-related, because the camera calibration depends on it.
const teeShown = () => proj && projTee && !projTest && !LIVE.src && !LIVE.pin && !LIVE.panel && !LIVE.fitting && !LIVE.calib;
let state = {clock:0};
function setWorld(){ ctx.setTransform(view.T,0,0,view.T,-view.ox*view.T,-view.oy*view.T); }
function toDev(x,y){ return [(x-view.ox)*view.T, (y-view.oy)*view.T]; }
function cssToWorld(cx,cy){
  const r=cvs.getBoundingClientRect(); let fx=(cx-r.left)/r.width, fy=(cy-r.top)/r.height;
  if (typeof pinActive === 'function' && pinActive()){ const H = pinMatrix(); if (H) [fx, fy] = homApply(H, fx, fy); }
  return {x:fx*r.width/view.css+view.ox, y:fy*r.height/view.css+view.oy};
}

const FONT = {
  display:'"Bungee", "Arial Black", Impact, sans-serif',
  body:'"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif',
  mono:'"IBM Plex Mono", ui-monospace, Menlo, monospace'
};
function effSize(size, o){ return Math.max(size, (o.min ?? 9)*dpr/view.T); }
function fontStr(px, o){ const f=o.font||'body'; return `${o.weight ?? (f==='display'?400:700)} ${px}px ${FONT[f]}`; }
function txt(str, x, y, size, o={}){
  const [px,py] = toDev(x,y); const sp = effSize(size,o)*view.T;
  ctx.save(); ctx.setTransform(1,0,0,1,0,0);
  ctx.font = fontStr(sp,o); ctx.textAlign = o.align||'center'; ctx.textBaseline = o.base||'middle';
  if (o.ls && 'letterSpacing' in ctx) ctx.letterSpacing = (o.ls*sp).toFixed(2)+'px';
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  const mw = o.maxW ? o.maxW*view.T : undefined;
  if (o.halo){ ctx.lineJoin='round'; ctx.lineWidth=sp*0.28; ctx.strokeStyle=o.halo; ctx.strokeText(str,px,py,mw); }
  ctx.fillStyle = o.color || '#1b2030'; ctx.fillText(str,px,py,mw);
  ctx.restore();
}
function tw(str, size, o={}){
  const sp = effSize(size,o)*view.T;
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.font = fontStr(sp,o);
  if (o.ls && 'letterSpacing' in ctx) ctx.letterSpacing = (o.ls*sp).toFixed(2)+'px';
  const w = ctx.measureText(str).width; ctx.restore(); return w/view.T;
}
function wrapLines(str, maxW, size, o={}){
  const words = str.split(' '), lines=[]; let cur='';
  for (const w of words){ const t = cur ? cur+' '+w : w; if (tw(t,size,o) > maxW && cur){ lines.push(cur); cur=w; } else cur=t; }
  if (cur) lines.push(cur); return lines;
}
function rrect(x,y,w,h,r){ ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x,y,w,h,r); else ctx.rect(x,y,w,h); }
function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,Math.max(0,r),0,Math.PI*2); }
function seg(ax,ay,bx,by){ ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); }
function pill(str, x, y, size, bg, fg, o={}){
  const s = effSize(size,o); const w = tw(str,size,o) + s*1.1, h = s*1.75;
  rrect(x-w/2, y-h/2, w, h, h/2); ctx.fillStyle=bg; ctx.fill();
  txt(str, x, y+s*0.05, size, Object.assign({color:fg}, o));
}
function dashed(ax,ay,bx,by,color,w){
  ctx.save(); ctx.setLineDash([w*2.6, w*2]); ctx.lineCap='round'; ctx.strokeStyle=color; ctx.lineWidth=w; seg(ax,ay,bx,by); ctx.stroke(); ctx.restore();
}
function banner(x,y,w,h){ rrect(x,y,w,h,0.08*K); ctx.fillStyle='rgba(20,30,64,0.92)'; ctx.fill(); }
function hud(str, x, y, size, color, align){ txt(str, x, y, size, {font:'mono', weight:500, color, align:align||'left', ls:.04}); }

