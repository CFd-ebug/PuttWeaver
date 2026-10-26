const TAGS = {rest:'Rest', path:'Path', both:'Both'};
const READS = {rest:'Reads: where it stops', path:'Reads: ball path', both:'Reads: path + stop'};

// ================= rig state =================
let game, gameIdx = 1;
let mode = 'aim';
let ball = {};
let shot = null;
let acc = 0, lastT = performance.now(), readAt = 0;
let drag = null, pendingAdvance = false, tapPending = null;
const kb = {active:false, angle:-Math.PI/2, frac:0.5};
let overInfo = null;

function resetBall(){ ball = {x:TEE.x, y:TEE.y, vx:0, vy:0, moving:false, visible:true, entered:false}; }
function newShot(){ return {pending:[], delivered:[], prev:null, sampleAcc:0, out:null, rest:null, why:null, info:null}; }

function putt(angle, frac){
  if (mode!=='aim') return;
  if (LIVE.on){ if (LIVE.src === 'sim' && !ball.moving) launchVirtual(angle, frac); return; }
  const sk = SKILLS[S.skill];
  const dInt = Math.max(0.05, frac*maxRoll());
  const errD = gauss()*sk.d, errA = gauss()*sk.a;
  const dAct = Math.max(0.05, dInt*(1+errD)), ang = angle + errA*Math.PI/180;
  const v = Math.sqrt(2*rollDecel()*dAct);
  resetBall(); ball.vx=Math.cos(ang)*v; ball.vy=Math.sin(ang)*v; ball.moving=true;
  shot = newShot(); shot.info = {angle, frac, errA, errD};
  mode='roll'; kb.active=false;
  if (game.onShotStart) game.onShotStart();
  setHint(); updateShotInfo();
}
function place(p){
  resetBall(); ball.x=p.x; ball.y=p.y;
  shot = newShot(); shot.info = {tap:true};
  if (game.onShotStart) game.onShotStart();
  endShot({x:p.x+gauss()*NOISE/2, y:p.y+gauss()*NOISE/2}, null, 0);
  updateShotInfo();
}
function physics(dt){
  const b = ball; if (!b.moving) return;
  let ax=0, ay=0;
  if ((bumps.length || tilt.x || tilt.y) && onSheet(b.x,b.y)){ const g=grad(b.x,b.y); ax=-SLOPE_K*g.x; ay=-SLOPE_K*g.y; }
  const aR = rollDecel();
  let sp = Math.hypot(b.vx,b.vy);
  if (sp < 0.03 && Math.hypot(ax,ay) < aR){ b.vx=b.vy=0; settle(); return; }
  b.vx += ax*dt; b.vy += ay*dt; sp = Math.hypot(b.vx,b.vy);
  if (sp>0){ const ns=Math.max(0, sp-aR*dt); b.vx*=ns/sp; b.vy*=ns/sp; }
  b.x += b.vx*dt; b.y += b.vy*dt;
  if (S.rails && b.y <= D+BALL_R){
    if (b.x < BALL_R && b.x > -0.2){ b.x=BALL_R; b.vx=Math.abs(b.vx)*E_RAIL; b.vy*=F_RAIL; }
    else if (b.x > W-BALL_R && b.x < W+0.2){ b.x=W-BALL_R; b.vx=-Math.abs(b.vx)*E_RAIL; b.vy*=F_RAIL; }
    if (b.y < BALL_R){ b.y=BALL_R; b.vy=Math.abs(b.vy)*E_RAIL; b.vx*=F_RAIL; }
  }
  if (!b.entered && b.y < D-BALL_R && b.x>0 && b.x<W) b.entered=true;
  if (!shot.out){
    if (!S.rails && (b.x < -BALL_R || b.x > W+BALL_R || b.y < -BALL_R)) shot.out='off';
    else if (b.y > D && (b.x < -BALL_R || b.x > W+BALL_R)) shot.out = b.entered ? 'back' : 'wide';
    else if (b.entered && b.y > D+BALL_R) shot.out='back';
  }
  if (b.x < WORLD.x0-0.3 || b.x > WORLD.x1+0.3 || b.y < WORLD.y0-0.3 || b.y > WORLD.y1+0.3){
    b.visible=false; if (!shot.out) shot.out = b.entered ? 'back' : 'wide'; settle(); return;
  }
  shot.sampleAcc += dt; const fp = 1/S.fps;
  if (shot.sampleAcc >= fp){
    shot.sampleAcc -= fp;
    if (onSheet(b.x,b.y)) shot.pending.push({at:state.clock + S.latency/1000, s:{x:b.x+gauss()*NOISE, y:b.y+gauss()*NOISE, t:state.clock}});
  }
}
function settle(){
  ball.moving=false;
  if (shot.out) return endShot(null, shot.out, 0);
  if (!onSheet(ball.x,ball.y)) return endShot(null, 'short', 0);
  endShot({x:ball.x+gauss()*NOISE/2, y:ball.y+gauss()*NOISE/2}, null, REST_WINDOW);
}
function endShot(p, why, extra){ shot.rest=p; shot.why=why; readAt = state.clock + extra + S.latency/1000; mode='read'; setHint(); }
function deliver(all){
  if (!shot) return;
  while (shot.pending.length && (all || shot.pending[0].at <= state.clock)){
    const {s} = shot.pending.shift();
    const prev = shot.prev && (s.t - shot.prev.t) < 4/S.fps + 1e-6 ? shot.prev : null;
    if (game.onSample) game.onSample(s, prev);
    shot.delivered.push(s); shot.prev = s;
  }
}
function advance(){
  if (mode==='over'){ startGame(); return; }
  if (mode!=='result') return;
  const r = game.advance();
  shot = null; resetBall();
  if (r==='over'){ mode='over'; overInfo=buildOver(); showSummary(); logHole(); remoteHoleDone(); }
  else { mode='aim'; $('result').hidden=true; }
  refreshPanel(); setHint(); updateShotInfo();
}
function expireRound(r){
  // a game ended the round without a putt (e.g. its time limit ran out)
  if (mode !== 'aim') return;
  drag = null; kb.active = false; shot = null; resetBall();
  mode = 'result'; showResult(r); refreshPanel(); setHint(); updateShotInfo();
}
function startGame(){
  game = GAMES[gameIdx]; game.start(); remoteHoleStart(); flowReset(); resetBall(); shot=null; mode='aim'; overInfo=null;
  $('result').hidden=true; renderOpts(); refreshPanel(); setHint(); updateShotInfo();
}
function holeTitle(h){
  if (h.list.length === 1){ const s = h.list[0].strokes; return `${plural(s,'stroke')} · ${golfTerm(s, h.par)}`; }
  return h.list.map(e => `${e.who} ${e.strokes}`).join(' · ');
}
function buildOver(){
  const h = game.hole ? game.hole() : null, sm = game.summary();
  if (!h) return {eyebrow:'FINAL', title:sm.title, sub:'Tap the stage to play again'};
  if (h.list.length === 1){ const s = h.list[0].strokes; return {eyebrow:`HOLE SCORE · PAR ${h.par}`, title:plural(s,'stroke').toUpperCase(), sub:`${golfTerm(s, h.par)} · Tap the stage to play again`}; }
  return {eyebrow:`HOLE SCORES · PAR ${h.par}`, title:h.list.map(e => `${e.who.toUpperCase()} ${e.strokes}`).join(' · '), sub:'Tap the stage to play again'};
}

// playtest log: every finished hole, per browser
let HLOG = {};
try { HLOG = JSON.parse(localStorage.getItem('putt-lab-log') || '{}') || {}; } catch (e) { HLOG = {}; }
function logHole(){
  const h = game.hole ? game.hole() : null; if (!h || !h.final) return;
  const arr = HLOG[game.id] = HLOG[game.id] || [];
  for (const e of h.list) if (e.strokes != null) arr.push({s:e.strokes, p:h.par});
  if (arr.length > 300) arr.splice(0, arr.length-300);
  try { localStorage.setItem('putt-lab-log', JSON.stringify(HLOG)); } catch (e) {}
  renderLog();
}

