// ================= loop & drawing =================
let floorPat = null;
function makeFloor(){
  const c=document.createElement('canvas'); c.width=c.height=96; const g=c.getContext('2d');
  g.fillStyle='#1b1e25'; g.fillRect(0,0,96,96);
  for (let i=0;i<1100;i++){ g.fillStyle=`rgba(${Math.random()<.5?'255,255,255':'0,0,0'},${(Math.random()*0.06).toFixed(3)})`; g.fillRect(Math.random()*96, Math.random()*96, 1, 1); }
  floorPat = ctx.createPattern(c,'repeat');
}
function drawBall(){
  if (!ball.visible) return;
  /*SIM*/if (LIVE.src === 'sim' && (LIVE.simYellow || (LIVE.simBlur && ball.moving))){ // desk tests
    ctx.save(); if (LIVE.simYellow) ctx.globalCompositeOperation = 'multiply';   // lit by the projector, like a real ball
    if (LIVE.simBlur && ball.moving){ // smear a moving ball like a camera exposure would
      const sp = Math.hypot(ball.vx, ball.vy), L = sp*LIVE.simBlur, a = clamp(BALL_R*2/(BALL_R*2 + L), 0, 1);
      if (a >= 0.08){ ctx.globalAlpha = a; ctx.lineCap = 'round'; ctx.lineWidth = BALL_R*2; ctx.strokeStyle = LIVE.simYellow ? '#ffe100' : '#e1ff2b';
        seg(ball.x - ball.vx/sp*L/2, ball.y - ball.vy/sp*L/2, ball.x + ball.vx/sp*L/2, ball.y + ball.vy/sp*L/2); ctx.stroke(); }
      ctx.restore(); return;
    }
    const r = BALL_R, g = ctx.createRadialGradient(ball.x-r*0.35, ball.y-r*0.4, r*0.1, ball.x, ball.y, r);
    g.addColorStop(0,'#fff6c2'); g.addColorStop(0.45,'#ffe100'); g.addColorStop(1,'#d6b000');
    circle(ball.x+r*0.35, ball.y+r*0.45, r*1.02); ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fill();
    circle(ball.x,ball.y,r); ctx.fillStyle=g; ctx.fill(); ctx.restore(); return;
  }/*/SIM*/
  const r = Math.max(BALL_R, 3.5*dpr/view.T);
  circle(ball.x+r*0.35, ball.y+r*0.45, r*1.02); ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fill();
  const g = ctx.createRadialGradient(ball.x-r*0.35, ball.y-r*0.4, r*0.1, ball.x, ball.y, r);
  g.addColorStop(0,'#fbffd2'); g.addColorStop(0.45,'#e1ff2b'); g.addColorStop(1,'#a6c20a');
  circle(ball.x,ball.y,r); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=r*0.14; ctx.strokeStyle='rgba(38,48,0,0.6)'; ctx.stroke();
}
function drawAim(a){
  const ux=Math.cos(a.angle), uy=Math.sin(a.angle), bx=ball.x, by=ball.y;
  ctx.save(); ctx.setLineDash([0.07,0.06]); ctx.lineWidth=0.025; ctx.strokeStyle='rgba(255,255,255,0.85)'; seg(bx+ux*0.14, by+uy*0.14, bx+ux*1.6, by+uy*1.6); ctx.stroke(); ctx.restore();
  const tx=bx+ux*1.6, ty=by+uy*1.6, s=0.08;
  ctx.beginPath(); ctx.moveTo(tx+ux*s*1.4, ty+uy*s*1.4); ctx.lineTo(tx-uy*s, ty+ux*s); ctx.lineTo(tx+uy*s, ty-ux*s); ctx.closePath(); ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.fill();
  const R=0.3; ctx.lineWidth=0.05; circle(bx,by,R); ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(bx,by,R,-Math.PI/2,-Math.PI/2+a.frac*Math.PI*2); ctx.strokeStyle='#8fa8ff'; ctx.lineCap='round'; ctx.stroke(); ctx.lineCap='butt';
  txt(`${Math.round(a.frac*100)}%`, bx+(ux>0.3?-0.42:0.42), by, 0.11, {font:'mono', weight:500, color:'#e6eaf4', align: ux>0.3 ? 'right':'left'});
}
function drawProjAim(a){
  // in projector mode the tee is off screen, so show the aim where the ball will enter the sheet
  const ux=Math.cos(a.angle), uy=Math.sin(a.angle); if (uy >= -0.05) return;
  const t=(D-TEE.y)/uy, ex=TEE.x+ux*t, ey=D, L=0.9*K;
  ctx.save(); ctx.setLineDash([0.06*K,0.05*K]); ctx.lineWidth=0.025*K; ctx.strokeStyle='rgba(20,30,64,0.8)'; seg(ex, ey, ex+ux*L, ey+uy*L); ctx.stroke(); ctx.restore();
  pill(`${Math.round(a.frac*100)}%`, ex+(ux>0?-0.35:0.35)*K, ey-0.25*K, 0.09*K, '#2343d6', '#fff', {font:'mono', weight:500});
}
function drawToast(r){                              // the result of the putt, at the top of the sheet
  const v = r.verdict ? r.verdict.toUpperCase() : '', vh = v ? 0.2*K : 0, y = 0.32*K + vh, col = r.tone==='good' ? '#9fb3ff' : r.tone==='bad' ? '#ffb3aa' : '#ffffff';
  const w = Math.min(W*0.8, Math.max(tw(r.title, 0.14*K, {font:'display'}), v ? tw(v, 0.08*K, {font:'display', ls:.12}) : 0) + 0.8*K), x = W/2 - w/2;
  rrect(x, y-0.2*K-vh, w, 0.56*K+vh, 0.1*K); ctx.fillStyle='rgba(16,22,46,0.9)'; ctx.fill();
  if (v) txt(v, W/2, y-0.2*K-vh+0.2*K, 0.08*K, {font:'display', color:col, ls:.12, maxW:w-0.3*K});
  txt(r.title, W/2, y, 0.14*K, {font:'display', color: v ? '#ffffff' : col, maxW:w-0.3*K});
  txt(LIVE.on ? (r.detail || '') : 'Enter or tap for the next shot', W/2, y+0.22*K, 0.065*K, {weight:400, color:'#c8d2ee', maxW:w-0.3*K});     // while tracking, the "Reset ball" banner follows after a few seconds
}
function drawTestCard(){
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,D);
  ctx.strokeStyle='#e3e6ee'; ctx.lineWidth=0.006*K;
  for (let x=0.5; x<W; x+=1){ seg(x,0,x,D); ctx.stroke(); } for (let y=0.5; y<D; y+=1){ seg(0,y,W,y); ctx.stroke(); }
  ctx.strokeStyle='#9aa2b6'; ctx.lineWidth=0.012*K;
  for (let x=1; x<W; x++){ seg(x,0,x,D); ctx.stroke(); } for (let y=1; y<D; y++){ seg(0,y,W,y); ctx.stroke(); }
  for (let x=1; x<W; x++) txt(`${x} ft`, x+0.04, 0.12, 0.065*K, {font:'mono', weight:500, color:'#5a6276', align:'left'});
  for (let y=1; y<D; y++) txt(`${y} ft`, 0.05, y-0.1, 0.065*K, {font:'mono', weight:500, color:'#5a6276', align:'left'});
  ctx.strokeStyle='#141822'; ctx.lineWidth=0.03*K; const c=0.35*K;
  for (const [x,y,sx,sy] of [[0,0,1,1],[W,0,-1,1],[0,D,1,-1],[W,D,-1,-1]]){ ctx.beginPath(); ctx.moveTo(x+sx*c,y+sy*0.015*K); ctx.lineTo(x+sx*0.015*K,y+sy*0.015*K); ctx.lineTo(x+sx*0.015*K,y+sy*c); ctx.stroke(); }
  const cx=W/2, top=D*0.2;
  txt('PROJECTOR CHECK', cx, top, 0.16*K, {font:'display', color:'#141822'});
  txt(`Sheet set to ${W} × ${+D.toFixed(2)} ft. Each grid square should measure 12 in.`, cx, top+0.3*K, 0.085*K, {weight:700, color:'#1d2333', maxW:W*0.9});
  txt('If it doesn’t, change “Projected sheet” in Rig settings to the width you measured.', cx, top+0.48*K, 0.075*K, {weight:400, color:'#3a4258', maxW:W*0.9});
  const n=11, sw=Math.min(0.42*K, W*0.7/n), gx=cx-sw*n/2, gy=D*0.48;
  txt('Gray steps: every step should look different', cx, gy-0.12*K, 0.07*K, {weight:700, color:'#1d2333'});
  for (let i=0;i<n;i++){ const v=Math.round(255*i/(n-1)); ctx.fillStyle=`rgb(${v},${v},${v})`; ctx.fillRect(gx+i*sw, gy, sw, 0.36*K); }
  ctx.strokeStyle='#9aa2b6'; ctx.lineWidth=0.008*K; ctx.strokeRect(gx, gy, sw*n, 0.36*K);
  const cols=['#c2d5ea','#f8f6f1','#2343d6','#c9302a','#ee8427','#7b4bb7','#e66aa4','#24336e','#8a5a3c','#ecdccf','#d5dcef','#f6c6bf'];
  const cw2=Math.min(0.42*K, W*0.7/cols.length), cx0=cx-cw2*cols.length/2, cy0=gy+0.62*K;
  txt('Game colors: each should stay distinct with the room lights on', cx, cy0-0.12*K, 0.07*K, {weight:700, color:'#1d2333'});
  cols.forEach((c2,i) => { ctx.fillStyle=c2; ctx.fillRect(cx0+i*cw2, cy0, cw2, 0.36*K); });
  ctx.strokeRect(cx0, cy0, cw2*cols.length, 0.36*K);
  const ty=cy0+0.62*K;
  [[0.065,'Smallest label'],[0.09,'Banner label'],[0.14,'Scoreboard'],[0.19,'Prompt']].forEach(([sz,l],i) => {
    txt(`${l} · ${(sz*K*12).toFixed(1)} in`, W*0.12+i*W*0.2, ty, sz*K, {weight:700, color:'#141822', align:'left', maxW:W*0.19});
  });
  const bx=W*0.88, by=D*0.5; ctx.lineWidth=0.012*K; ctx.strokeStyle='#141822'; circle(bx, by, BALL_R); ctx.stroke(); seg(bx-0.25*K,by,bx+0.25*K,by); ctx.stroke(); seg(bx,by-0.25*K,bx,by+0.25*K); ctx.stroke();
  txt('Ball size', bx, by+0.32*K, 0.07*K, {weight:700, color:'#1d2333'});
  txt('Press T to return to the game', cx, D-0.2*K, 0.07*K, {weight:400, color:'#5a6276'});
}
/*SIM*/function drawSimPerson(p){ // desk test: a skin-colored arm and hand, and maybe a head, on the sheet
  const skin = p.skin || '#e2b48f';
  ctx.save(); ctx.globalCompositeOperation = 'multiply';   // lit by the projector, like a real hand
  if (p.body){ // someone standing on the sheet: their shadow and legs
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(p.body[0]+0.35, p.body[1]-0.2, 0.9, 0.55, -0.4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3b4f7a'; for (const dx of [-0.17, 0.17]){ ctx.beginPath(); ctx.ellipse(p.body[0]+dx, p.body[1], 0.13, 0.42, 0, 0, Math.PI*2); ctx.fill(); }
  }
  if (p.head){ circle(p.head[0], p.head[1], 0.36); ctx.fillStyle = p.hair || '#3b2a20'; ctx.fill(); circle(p.head[0], p.head[1] + 0.1, 0.25); ctx.fillStyle = skin; ctx.fill(); }
  if (p.x != null){
    ctx.fillStyle = skin;
    if (p.arm){ ctx.lineCap = 'round'; ctx.lineWidth = 0.26; ctx.strokeStyle = p.sleeve || skin; seg(p.arm[0], p.arm[1], p.x, p.y); ctx.stroke(); }
    ctx.translate(p.x, p.y); ctx.rotate(p.ang || 0);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.16, 0, 0, Math.PI*2); ctx.fill();
    for (let f=0; f<4; f++){ ctx.beginPath(); ctx.ellipse(0.27, -0.1 + f*0.065, 0.11, 0.026, 0, 0, Math.PI*2); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0.05, 0.19, 0.09, 0.03, 0.9, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}/*/SIM*/
function drawProj(){
  if (teeShown() !== !!view.tee) resize();
  refreshProjBar();
  const tee = !!view.tee;
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#000'; ctx.fillRect(0,0,cvs.width,cvs.height);
  setWorld();
  if (tee){
    rrect(TEE.x-1.1, D+0.42, 2.2, 1.33, 0.08); ctx.fillStyle='#22262f'; ctx.fill(); ctx.lineWidth=0.02; ctx.strokeStyle='#3a404e'; ctx.stroke();
    circle(TEE.x,TEE.y,0.06); ctx.fillStyle='#4f586b'; ctx.fill();
    txt('TEE', TEE.x, D+1.58, 0.09, {font:'display', color:'#596274', ls:.15});
    txt('Tee shown for simulated putts · V shows the true-size sheet', 0.02, D+0.3, 0.075, {font:'mono', weight:400, color:'#5d6679', align:'left'});
  }
  ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,D); ctx.clip();
  if (projTest){ drawTestCard(); ctx.restore(); return; }
  if (REMOTE.hold){ drawHold(); ctx.restore(); return; }       // the console is holding the screen (95-remote-host.js)
  ctx.fillStyle='#f8f8f5'; ctx.fillRect(0,0,W,D);
  if (FLOW.phase !== 'play'){ ctx.save(); if (FLOW.phase === 'results') flowDrawResults(); else flowDrawSelect(); ctx.restore(); setWorld(); drawLiveOverlay(); ctx.restore(); return; }     // between games the players pick the next one (97-flow.js)
  if (SHOTS.snap) snapCleanSheet();
  ctx.save(); game.drawSheet(); ctx.restore(); setWorld();
  if (S.washed){ ctx.fillStyle='rgba(238,238,230,0.38)'; ctx.fillRect(0,0,W,D); }
  if (mode==='over' && overInfo){
    const bh=D*0.36; ctx.fillStyle='rgba(16,22,46,0.88)'; ctx.fillRect(0,D/2-bh/2,W,bh);
    txt(overInfo.eyebrow, W/2, D/2-bh*0.3, 0.09*K, {font:'display', color:'#9fb3ff', ls:.15});
    txt(overInfo.title, W/2, D/2-bh*0.02, 0.26*K, {font:'display', color:'#ffffff', maxW:W*0.92});
    txt(LIVE.on ? 'The next game starts when the sheet is clear' : overInfo.sub, W/2, D/2+bh*0.3, 0.09*K, {weight:400, color:'#c8d2ee'});
  }
  if (S.showPath && shot && shot.delivered.length){
    const ds = shot.delivered;
    ctx.strokeStyle='rgba(0,170,255,0.45)'; ctx.lineWidth=0.012*K; ctx.beginPath(); ctx.moveTo(ds[0].x,ds[0].y); for (const s2 of ds) ctx.lineTo(s2.x,s2.y); ctx.stroke();
    ctx.fillStyle='#0090e6'; for (const s2 of ds){ circle(s2.x,s2.y,0.022*K); ctx.fill(); }
  }
  if (LIVE.sampling === 'ball') drawSampleTarget();
  if (!tee) drawBall();
  /*SIM*/if (LIVE.simPerson) drawSimPerson(LIVE.simPerson);/*/SIM*/
  if (mode==='aim' && !tee){ const a = drag ? dragAim() : (kb.active ? kb : null); if (a) drawProjAim(a); }
  if (mode==='result' && lastResult) drawToast(lastResult);
  drawLiveOverlay();
  ctx.restore();
  if (tee){
    drawBall();
    if (mode==='aim'){ const a = drag ? dragAim() : (kb.active ? kb : null); if (a) drawAim(a); }
  }
}
function draw(){
  if (proj) return drawProj();
  const T=view.T, cl=state.clock;
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=floorPat||'#1b1e25'; ctx.fillRect(0,0,cvs.width,cvs.height);
  setWorld();
  rrect(TEE.x-1.1, D+0.42, 2.2, 1.33, 0.08); ctx.fillStyle='#2a2f39'; ctx.fill(); ctx.lineWidth=0.02; ctx.strokeStyle='#394050'; ctx.stroke();
  circle(TEE.x,TEE.y,0.06); ctx.fillStyle='#4f586b'; ctx.fill();
  txt('TEE', TEE.x, D+1.58, 0.09, {font:'display', color:'#596274', ls:.15, min:8});
  txt(`${W} × ${+D.toFixed(2)} ft sheet · stimp ${SPEEDS[S.speed]}`, 0.02, D+0.62, 0.085, {font:'mono', weight:400, color:'#69728a', align:'left', min:8});
  if (ROLE !== 'play') txt(`camera ${S.fps} fps · lag ${S.latency} ms`, 0.02, D+0.86, 0.085, {font:'mono', weight:400, color:'#69728a', align:'left', min:8});
  ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(0.05,0.07,W,D);
  if (S.rails){
    ctx.fillStyle='#3f4655'; ctx.fillRect(-0.26,-0.26,0.26,D+0.26); ctx.fillRect(W,-0.26,0.26,D+0.26); ctx.fillRect(-0.26,-0.26,W+0.52,0.26);
    ctx.strokeStyle='#646e86'; ctx.lineWidth=0.02; ctx.beginPath(); ctx.moveTo(-0.01,D); ctx.lineTo(-0.01,-0.01); ctx.lineTo(W+0.01,-0.01); ctx.lineTo(W+0.01,D); ctx.stroke();
  }
  ctx.fillStyle='#f8f8f5'; ctx.fillRect(0,0,W,D);
  ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,D); ctx.clip();
  if (SHOTS.snap) snapCleanSheet();
  ctx.save(); game.drawSheet(); ctx.restore();
  setWorld();
  if (S.washed){ ctx.fillStyle='rgba(238,238,230,0.38)'; ctx.fillRect(0,0,W,D); }
  if (mode==='over' && overInfo){
    const bh=D*0.36; ctx.fillStyle='rgba(16,22,46,0.88)'; ctx.fillRect(0,D/2-bh/2,W,bh);
    txt(overInfo.eyebrow, W/2, D/2-bh*0.3, 0.09*K, {font:'display', color:'#9fb3ff', ls:.15});
    txt(overInfo.title, W/2, D/2-bh*0.02, 0.26*K, {font:'display', color:'#ffffff', maxW:W*0.92});
    txt(overInfo.sub, W/2, D/2+bh*0.3, 0.09*K, {weight:400, color:'#c8d2ee'});
  }
  ctx.restore();
  setWorld();
  if (S.showPath && shot && shot.delivered.length){
    const ds = shot.delivered;
    ctx.strokeStyle='rgba(0,170,255,0.45)'; ctx.lineWidth=Math.max(0.008, 1*dpr/T); ctx.beginPath(); ctx.moveTo(ds[0].x,ds[0].y); for (const s of ds) ctx.lineTo(s.x,s.y); ctx.stroke();
    ctx.fillStyle='#0090e6'; const r=Math.max(0.022, 1.6*dpr/T); for (const s of ds){ circle(s.x,s.y,r); ctx.fill(); }
  }
  if (mode==='read' && ball.visible && onSheet(ball.x,ball.y) && shot && shot.rest){
    ctx.save(); ctx.setLineDash([0.05,0.04]); ctx.lineDashOffset = -cl*0.2; ctx.lineWidth=0.018; ctx.strokeStyle='#2343d6'; circle(ball.x,ball.y,0.2); ctx.stroke(); ctx.restore();
  }
  drawBall();
  if (mode==='aim'){ const a = drag ? dragAim() : (kb.active ? kb : null); if (a) drawAim(a); }
}
function tick(dt){
  acc+=dt;
  while (acc >= STEP){ acc-=STEP; state.clock+=STEP; if (mode==='roll' && !LIVE.on) physics(STEP); if (LIVE.on && ball.moving) vPhysics(STEP); }
  if (game.update) game.update();
  deliver(false);
  if (mode==='read' && state.clock >= readAt){
    deliver(true);
    const r = game.onRest(shot.rest, shot.why);
    mode='result'; showResult(r); refreshPanel(); setHint();
  }
  liveTick();
}
function frame(now){
  const dt = Math.min(0.05, (now-lastT)/1000); lastT=now; pushRate(LIVE.rafTimes, now);
  tick(dt); draw(); blitWarp();
  requestAnimationFrame(frame);
}

