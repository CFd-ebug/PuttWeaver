// ---------- Shooting Gallery ----------
function makeGallery(){
  const GOAL = 4;
  const ROWS = [{v:.22, dir:1, sp:1.5}, {v:.42, dir:-1, sp:1.1}, {v:.62, dir:1, sp:.75}];
  let ducks, shot, popped, pops, hits, log, trail, done;
  const DR = () => 0.2*K;
  const strokes = () => done === 'pick' ? 5 : shot;
  function pos(d, time){
    const r=ROWS[d.ri], Lp=W+0.8*K, raw=d.ph*Lp + r.dir*r.sp*K*time, m=((raw%Lp)+Lp)%Lp;
    return {x:m-0.4*K, y:r.v*D};
  }
  const alive = (d, time) => d.poppedAt===null || time > d.poppedAt+2.5;
  function drawDuck(x,y,dir,s,a){
    ctx.save(); ctx.globalAlpha=a; ctx.translate(x,y); ctx.scale(dir,1);
    ctx.strokeStyle='#6b4a33'; ctx.lineWidth=0.025*K; seg(0,s*0.1,0,s*1.0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,0,s,s*0.62,0,0,Math.PI*2); ctx.fillStyle='#ff7a1a'; ctx.fill(); ctx.lineWidth=0.012*K; ctx.strokeStyle='#a9480c'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-s*0.15,-s*0.05,s*0.5,s*0.28,-0.25,0,Math.PI*2); ctx.fillStyle='#ffa45c'; ctx.fill();
    circle(s*0.72,-s*0.62,s*0.4); ctx.fillStyle='#ff7a1a'; ctx.fill(); ctx.strokeStyle='#a9480c'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s*1.05,-s*0.66); ctx.lineTo(s*1.45,-s*0.55); ctx.lineTo(s*1.05,-s*0.44); ctx.closePath(); ctx.fillStyle='#c4301f'; ctx.fill();
    circle(s*0.82,-s*0.72,s*0.08); ctx.fillStyle='#141822'; ctx.fill();
    ctx.restore();
  }
  return {
    id:'gallery', name:'Shooting Gallery', reads:'path', tapOK:false,
    how:'Ducks slide across three rows and keep moving while you aim, so you have to lead them. The far row is fastest. Pop four ducks.',
    rule:() => `Putts to finish: your score is the putts it takes to pop ${GOAL} ducks. After 4 putts you pick up and take 5.`,
    hole:() => ({par:SIM.galPar, list:[{who:'', strokes:strokes()}], final:!!done}),
    start(){ shot=0; popped=0; log=[]; pops=[]; hits=[]; trail=[]; done=null; ducks=[]; ROWS.forEach((r,ri)=>{ for (let j=0;j<2;j++) ducks.push({ri, ph:j/2+ri*0.17, poppedAt:null}); }); },
    status(){ return done ? 'Hole complete' : `Putt ${shot+1} of ${MAX_PUTTS} · ${popped} of ${GOAL} ducks`; },
    /*SIM*/autoPutt(){
      const a = rollDecel(), mr = maxRoll(), t0 = state.clock; let pick = null;
      for (const d of ducks){
        if (!alive(d, t0)) continue;
        for (let t=0.4; t<3.5; t+=0.05){
          const P = pos(d, t0+t); if (P.x < 0.2*K || P.x > W-0.2*K) continue;
          const dist = Math.hypot(P.x-TEE.x, P.y-TEE.y), v0 = (dist + a*t*t/2)/t;
          if (v0 - a*t < 0.8) continue; const roll = v0*v0/(2*a); if (roll > mr) continue;
          const Q = pos(d, t0+t+gauss()*0.3), sc = -t; if (!pick || sc > pick.sc) pick = {sc, x:Q.x, y:Q.y, roll}; break;
        }
      }
      if (!pick) return puttTo(W/2, D*0.5);
      return {angle:Math.atan2(pick.y-TEE.y, pick.x-TEE.x), frac:pick.roll/mr};
    },/*/SIM*/
    onShotStart(){ hits=[]; trail=[]; },
    onSample(s, prev){
      trail.push(s); const a = prev || s;
      for (const d of ducks){
        if (!alive(d, s.t)) continue;
        if (d.poppedAt!==null) d.poppedAt=null;
        const pa=pos(d,a.t), pb=pos(d,s.t); if (Math.abs(pb.x-pa.x) > W/2) continue;
        const r = segClosest(0,0, a.x-pa.x, a.y-pa.y, s.x-pb.x, s.y-pb.y);
        if (r.d < DR()+BALL_R){ d.poppedAt=state.clock; const at=pos(d,state.clock); pops.push({x:at.x, y:at.y, t:state.clock}); hits.push(d.ri); }
      }
    },
    drawSheet(){
      const t=state.clock;
      ctx.fillStyle='#f3f1f7'; ctx.fillRect(0,0,W,D);
      const sw=0.5*K, ah=0.32*K;
      for (let i=0; i*sw<W; i++){ ctx.fillStyle = i%2 ? '#ffffff' : '#c9302a'; ctx.fillRect(i*sw,0,sw,ah); circle(i*sw+sw/2, ah, sw/2); ctx.fill(); }
      for (const r of ROWS){
        const y=r.v*D;
        ctx.fillStyle='#8a5a3c'; ctx.fillRect(0, y+DR()*1.05, W, 0.045*K);
        txt(r.dir>0 ? '→' : '←', W-0.3*K, y+DR()*1.05-0.12*K, 0.12*K, {color:'#8a5a3c'});
      }
      if (trail.length>1){ ctx.strokeStyle='rgba(30,50,120,0.28)'; ctx.lineWidth=0.05*K; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(trail[0].x,trail[0].y); for (const s of trail) ctx.lineTo(s.x,s.y); ctx.stroke(); }
      for (const d of ducks){
        if (!(d.poppedAt===null || t > d.poppedAt+2.5)) continue;
        const a = d.poppedAt===null ? 1 : clamp((t-d.poppedAt-2.5)/0.4,0,1);
        const p = pos(d,t); drawDuck(p.x, p.y, ROWS[d.ri].dir, DR(), a);
      }
      pops = pops.filter(p => t-p.t < 0.9);
      for (const p of pops){
        const k=(t-p.t)/0.9; ctx.strokeStyle=`rgba(201,48,42,${1-k})`; ctx.lineWidth=0.02*K;
        for (let i=0;i<10;i++){ const a=i*Math.PI/5, r0=DR()*(0.6+k), r1=DR()*(1+k*1.8); seg(p.x+Math.cos(a)*r0,p.y+Math.sin(a)*r0,p.x+Math.cos(a)*r1,p.y+Math.sin(a)*r1); ctx.stroke(); }
        txt('POP', p.x, p.y-DR()-k*0.4*K, 0.14*K, {font:'display', color:'#c9302a', alpha:1-k});
      }
      hud(`PUTT ${Math.min(shot+(done?0:1),MAX_PUTTS)}/${MAX_PUTTS} · PAR ${SIM.galPar}`, 0.2*K, D-0.18*K, 0.09*K, '#4b4560');
      hud(`${Math.min(popped,GOAL)}/${GOAL} DUCKS`, W-0.2*K, D-0.18*K, 0.09*K, '#4b4560', 'right');
    },
    onRest(p, why){
      shot++; popped += hits.length; log.push({n:hits.length, total:popped});
      if (popped >= GOAL){ done='clear'; return {title: shot===1 ? `${GOAL} ducks in one putt` : `${GOAL} ducks in ${plural(shot,'putt')}`, detail:`Hole score ${shot}.`, tone:'good'}; }
      if (shot >= MAX_PUTTS){ done='pick'; return {title:'Pick up', detail:`${popped} of ${GOAL} ducks after ${MAX_PUTTS} putts, so the hole scores 5.`, tone:'bad'}; }
      return {title: hits.length ? `+${plural(hits.length,'duck')}` : 'Clean miss', detail:`${popped} of ${GOAL} ducks, ${plural(shot,'stroke')} so far.` + (why && !hits.length ? ' '+WHY[why] : ''), tone: hits.length ? 'good' : 'bad'};
    },
    advance(){ if (done) return 'over'; trail=[]; return 'next'; },
    summary(){ return {detail: done === 'clear' ? `${GOAL} ducks in ${plural(shot,'putt')}.` : `${popped} of ${GOAL} ducks in ${MAX_PUTTS} putts.`}; },
    card(){
      if (!log.length) return `<p class="empty">No putts yet. Pop ${GOAL} ducks.</p>`;
      const r = log.map((x,i)=>`<tr><td>${i+1}</td><td class="num">${x.n}</td><td class="num">${Math.min(x.total,GOAL)}/${GOAL}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>Putt</th><th class="num">Ducks</th><th class="num">Total</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="2">Strokes</td><td class="num">${strokes()}</td></tr></tfoot></table>`;
    },
    notes(){ return li([
      'Reads <b>the path with timestamps</b>. A hit compares where the ball was and where the duck was at the same instant, so scoring stays fair even with lag.',
      `<b>Putts-to-finish scoring.</b> A straight putt crosses each row once, so a hole in one needs a rebound off the back rail to come down through the rows again. In simulation at the default rig settings, an office-average putter averages ${SIM.galAvg} strokes.`,
      'This is the luckiest game in the lab: simulated beginners and strong putters finish within a quarter stroke of each other. It makes a fun hole but a weak test of skill.',
      'This is the game most exposed to lag. The hit is scored at the right moment, but the pop is projected late. Try 250 ms: the ball is past the duck before it reacts.',
      'The ducks are orange, not the usual yellow, so they never look like the ball to the color tracker.'
    ]); }
  };
}

