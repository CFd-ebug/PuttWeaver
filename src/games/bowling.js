// ---------- Bowling ----------
function makeBowling(){
  let pins, knocked, trail, putts, done, log, gutter, onLane;
  const SP = () => 0.42*K, PIN_R = () => 0.13*K, HIT = () => 0.13*K + BALL_R;
  const PIN_HIT = () => 0.55*SP(), REACH = () => 3.5*SP(), PIN_V = () => 4*K;   // pin-to-pin contact distance, how far a full-speed pin flies, how fast pins fly on screen
  const BALL_PUSH = 1.6, PIN_PUSH = 0.65, WOBBLE = 0.08;   // energy a head-on hit gives a pin (the ball is much heavier), share a pin passes on, least energy that topples a pin
  const SPEED_MIN = 0.4, SPEED_FULL = 3;                    // ball speeds (ft/s) that give no push and a full push
  const LB = () => 1.75*K, GUT = () => 0.2*K, headY = () => D*0.42;
  const strokes = () => done === 'pick' ? 5 : putts;
  function rack(){
    pins=[]; const sp=SP(), hy=headY();
    for (let r=0;r<4;r++) for (let i=0;i<=r;i++) pins.push({x:W/2+(i-r/2)*sp, y:hy-r*sp*0.866, down:false, gone:false, fall:null});
  }
  const standing = () => pins.filter(p=>!p.down && !p.gone).length;
  // A struck pin flies along (dx, dy) with energy v (1 = a firm head-on putt) and topples the first standing pin it meets, the
  // way two equal pins collide: the struck pin leaves along the line between their centers with the head-on share of the
  // energy and the striker carries on sideways with the rest, so a thin hit sends a pin off slowly. Pins bounce off the lane
  // edges (kickbacks). Too little energy and the pin only wobbles. No dice: the same path always leaves the same pins.
  function topple(p, dx, dy, v, delay, depth){
    if (v < WOBBLE){ p.wob = state.clock+delay; return; }
    p.down=true; p.fall={dx,dy,v,t:state.clock+delay}; knocked++; fly(p.x, p.y, dx, dy, v, delay, depth);
  }
  function fly(x, y, dx, dy, v, delay, depth){
    if (v < 0.12 || depth > 12) return;
    const L=REACH()*v, pc=PIN_HIT(), lx=W/2-LB()/2; let hit=null, wall=false, at=L;
    for (const q of pins){
      if (q.down || q.gone) continue;
      const rx=q.x-x, ry=q.y-y, a=rx*dx+ry*dy, perp=Math.abs(rx*dy-ry*dx); if (a<=0 || perp>=pc) continue;
      const ac=a-Math.sqrt(pc*pc-perp*perp); if (ac>=0 && ac<at){ hit=q; at=ac; }
    }
    if (dx){ const a=((dx>0 ? lx+LB()-PIN_R() : lx+PIN_R())-x)/dx; if (a>0 && a<at){ hit=null; wall=true; at=a; } }
    if (!hit && !wall) return;
    const cx=x+dx*at, cy=y+dy*at, vr=v*(1-0.4*at/L), dl=delay+at/PIN_V();
    if (wall) return fly(cx, cy, -dx, dy, vr*0.6, dl, depth+1);
    let nx=hit.x-cx, ny=hit.y-cy; const nl=Math.hypot(nx,ny); nx/=nl; ny/=nl;
    const c=nx*dx+ny*dy; topple(hit, nx, ny, vr*c*PIN_PUSH, dl, depth+1);
    const px=dx-c*nx, py=dy-c*ny, pl=Math.hypot(px,py);
    if (pl>1e-6) fly(cx, cy, px/pl, py/pl, vr*pl*PIN_PUSH, dl, depth+1);
  }
  // Ball speed now: the average over the last fifth of a second (steady against camera noise) is the speed at the middle of
  // that window, so take off the slowing for half of it.
  function speedAt(s){
    let i=trail.length-1; while (i>0 && s.t-trail[i].t < 0.2) i--; const q=trail[i], dt=s.t-q.t;
    return q===s || dt<=0 ? 0 : Math.max(0, Math.hypot(s.x-q.x, s.y-q.y)/dt - rollDecel()*dt/2);
  }
  function drawPin(x,y,r){ circle(x,y,r); ctx.fillStyle='#ffffff'; ctx.fill(); ctx.lineWidth=0.012*K; ctx.strokeStyle='#7d879c'; ctx.stroke(); circle(x,y,r*0.58); ctx.lineWidth=r*0.2; ctx.strokeStyle='#c9302a'; ctx.stroke(); circle(x,y,r*0.2); ctx.fillStyle='#d7dbe5'; ctx.fill(); }
  return {
    id:'bowling', name:'Bowling', reads:'path', tapOK:false,
    how:'Ten projected pins at the far end of a lane. Pins fall where the ball’s path crosses them and can take neighbors down. Knocked pins are cleared between putts.',
    rule:() => 'Putts to finish: your score is the putts it takes to knock down all ten pins, so a strike is a hole in one. After 4 putts you pick up and take 5.',
    hole:() => ({par:SIM.bowlPar, list:[{who:'', strokes:strokes()}], final:!!done}),
    start(){ rack(); putts=0; done=null; log=[]; knocked=0; trail=[]; gutter=false; onLane=false; },
    status(){ return done ? 'Hole complete' : `Putt ${putts+1} of ${MAX_PUTTS} · ${plural(standing(),'pin')} standing`; },
    /*SIM*/autoPutt(){   // the pocket beside the head pin on a full rack, otherwise straight at the nearest standing pin
      const st = pins.filter(p=>!p.down && !p.gone), f = st.reduce((a,p) => p.y > a.y ? p : a);
      return puttTo(f.x + (st.length === 10 ? 0.24*SP() : 0), f.y, 1.5*K); },
    leave(nums){ pins.forEach((p,i) => { p.gone = !nums.includes(i+1); }); },   // desk tests: set up a spare, pins numbered as in bowling/*/SIM*/
    onShotStart(){ knocked=0; trail=[]; gutter=false; onLane=false; },
    onSample(s, prev){
      trail.push(s); if (!prev || gutter) return;
      const dx=s.x-prev.x, dy=s.y-prev.y, L=Math.hypot(dx,dy); if (L<1e-6) return;
      const bx=dx/L, by=dy/L, v=clamp((speedAt(s)-SPEED_MIN)/(SPEED_FULL-SPEED_MIN), 0, 1), h=HIT();
      for (const p of pins){
        if (p.down || p.gone) continue;
        // where along this step the ball first touches the pin; the pin leaves along the line between their centers
        const fx=prev.x-p.x, fy=prev.y-p.y, b=fx*bx+fy*by, disc=b*b-(fx*fx+fy*fy-h*h); if (disc<0) continue;
        const t0=-b-Math.sqrt(disc), t1=-b+Math.sqrt(disc); if (t1<0 || t0>L) continue;
        if (p.wob != null && t0 < 0) continue;   // still touching the pin it just wobbled
        const t=Math.max(0,t0); let nx=p.x-(prev.x+bx*t), ny=p.y-(prev.y+by*t); const nl=Math.hypot(nx,ny)||1; nx/=nl; ny/=nl;
        topple(p, nx, ny, v*BALL_PUSH*Math.max(0, nx*bx+ny*by), 0, 0);
      }
      // the tee box is wider than the lane, so a ball may come onto it from the side; once on, leaving it is the gutter and nothing counts after
      if (Math.abs(s.x-W/2) <= LB()/2) onLane=true; else if (onLane) gutter=true;
    },
    drawSheet(){
      const t=state.clock, lb=LB(), g=GUT(), lx=W/2-lb/2, hy=headY();
      ctx.fillStyle='#e9ecf2'; ctx.fillRect(0,0,W,D);
      ctx.fillStyle='#b9c1d1'; ctx.fillRect(lx-g,0,lb+2*g,D);
      ctx.fillStyle='#ebdfcb'; ctx.fillRect(lx,0,lb,D);
      ctx.fillStyle='#f3ecdf'; ctx.fillRect(lx, hy-SP()*3*0.866-0.3*K, lb, SP()*3*0.866+0.6*K);
      ctx.strokeStyle='rgba(150,120,80,0.18)'; ctx.lineWidth=0.006*K;
      for (let b=1;b<39;b++){ const x=lx+b/39*lb; seg(x,0,x,D); ctx.stroke(); }
      const ay = hy + (D-hy)*0.55;
      ctx.fillStyle='#6d4c32';
      for (let b=5;b<=35;b+=5){ const x=lx+(b-0.5)/39*lb, s=0.06*K; ctx.beginPath(); ctx.moveTo(x,ay-s*1.6); ctx.lineTo(x+s*0.6,ay); ctx.lineTo(x-s*0.6,ay); ctx.closePath(); ctx.fill(); }
      for (const b of [3,5,8,11,14,26,29,32,35,37]){ circle(lx+(b-0.5)/39*lb, D-0.32*K, 0.018*K); ctx.fill(); }
      ctx.fillStyle='#2a2f3a'; ctx.fillRect(lx-g, D-0.05*K, lb+2*g, 0.025*K);
      if (trail.length>1){ ctx.strokeStyle='rgba(30,50,120,0.3)'; ctx.lineWidth=0.05*K; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(trail[0].x,trail[0].y); for (const s of trail) ctx.lineTo(s.x,s.y); ctx.stroke(); }
      for (const p of pins){
        if (p.gone) continue;
        if (!p.down || t < p.fall.t){
          const w = p.wob != null && !p.down ? t-p.wob : -1, j = w >= 0 && w < 0.9 ? Math.sin(w*34)*0.02*K*(1-w/0.9) : 0;   // a wobbling pin rocks and settles
          drawPin(p.x+j, p.y, PIN_R()); continue;
        }
        // harder hits topple faster and slide farther
        const f = Math.min(1, p.fall.v/BALL_PUSH), pr = clamp((t-p.fall.t)/(0.5-0.25*f),0,1), e = 1-(1-pr)*(1-pr), sl = (0.1+0.25*f)*K*e;
        const cx=p.x+p.fall.dx*sl, cy=p.y+p.fall.dy*sl, ang=Math.atan2(p.fall.dy,p.fall.dx);
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang); ctx.globalAlpha = t-p.fall.t > 1.2 ? 0.55 : 1;
        const len = PIN_R()*2*(1+e*0.5), wd = PIN_R()*2*(1-e*0.45);
        rrect(-len/2,-wd/2,len,wd,wd/2); ctx.fillStyle='#ffffff'; ctx.fill(); ctx.lineWidth=0.012*K; ctx.strokeStyle='#7d879c'; ctx.stroke();
        ctx.fillStyle='#c9302a'; ctx.fillRect(len*0.12,-wd/2,len*0.08,wd);
        ctx.restore(); ctx.globalAlpha=1;
      }
      const mx = (lx-g)/2, sx = W-mx;
      txt('PUTT', mx, D*0.16, 0.08*K, {font:'display', color:'#5a6276', ls:.1});
      txt(String(Math.min(putts+(done?0:1), MAX_PUTTS)), mx, D*0.16+0.3*K, 0.34*K, {font:'display', color:'#1d2333'});
      hud(`OF ${MAX_PUTTS} · PAR ${SIM.bowlPar}`, mx, D*0.16+0.62*K, 0.08*K, '#5a6276', 'center');
      txt('STROKES', mx, D*0.62, 0.08*K, {font:'display', color:'#5a6276', ls:.1});
      txt(String(strokes()), mx, D*0.62+0.3*K, 0.3*K, {font:'display', color:'#1d2333'});
      txt('PINS', sx, D*0.16, 0.08*K, {font:'display', color:'#5a6276', ls:.1});
      // head pin at the bottom, as on the lane
      for (const p of pins){ const x=sx+(p.x-W/2)*0.75, y=D*0.16+0.32*K+(p.y-hy+SP()*3*0.866)*0.75; circle(x,y,0.07*K); if (!p.gone && (!p.down || t < p.fall.t)){ ctx.fillStyle='#1d2333'; ctx.fill(); } else { ctx.lineWidth=0.012*K; ctx.strokeStyle='#9aa2b4'; ctx.stroke(); } }
    },
    onRest(p, why){
      putts++; const left = standing(); log.push({down:knocked, left});
      const note = why && !knocked ? ' '+WHY[why] : '', reached = trail.some(s => s.y < headY()+PIN_R());
      if (!left){ done='clear'; return {title: putts===1 ? 'Strike: hole in one' : putts===2 ? 'Spare: all ten in 2' : `All ten in ${putts}`, detail:`Hole score ${putts}.`, tone:'good'}; }
      if (putts >= MAX_PUTTS){ done='pick'; return {title:'Pick up', detail:`${plural(left,'pin')} still standing after ${MAX_PUTTS} putts, so the hole scores 5.`+note, tone:'bad'}; }
      const wobbled = pins.some(q => q.wob != null && !q.down && !q.gone);
      return {title: knocked ? plural(knocked,'pin') : gutter ? 'Gutter ball' : wobbled ? 'Wobbler' : why === 'short' || (p && !reached) ? 'Short' : 'No pins', detail:`${plural(left,'pin')} standing, ${plural(putts,'stroke')} so far.`+note, tone: knocked ? '' : 'bad'};
    },
    advance(){ if (done) return 'over'; pins.forEach(p => { if (p.down) p.gone = true; p.wob = null; }); trail=[]; return 'next'; },
    summary(){ return {detail: done === 'clear' ? `All ten pins down in ${plural(putts,'putt')}.` : `${plural(standing(),'pin')} left standing after ${MAX_PUTTS} putts.`}; },
    card(){
      if (!log.length) return '<p class="empty">No putts yet. Ten pins to clear.</p>';
      const r = log.map((x,i)=>`<tr><td>${i+1}</td><td class="num">${x.down}</td><td class="num">${x.left}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>Putt</th><th class="num">Knocked</th><th class="num">Standing</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="2">Strokes</td><td class="num">${strokes()}</td></tr></tfoot></table>`;
    },
    notes(){ return li([
      `Reads <b>the ball’s path</b>. A pin falls when the path passes within ${(HIT()*12).toFixed(1)} in of its center, the same ratio a bowling ball has to real pins. The tee box is wider than the lane, so the ball may come onto the lane from the side; once its center has been on the lane and crosses an edge, it is in the gutter and knocks nothing down after that.`,
      `Falling pins collide like real pins: a struck pin flies off along the line between the centers with the head-on share of the hit, knocks over what it meets and bounces off the lane edges. There is no randomness, so the same path always leaves the same pins. As in bowling, a ball about ${(0.24*SP()*12).toFixed(1)} in to either side of the head pin (the pocket) strikes far more often than a dead-center hit.`,
      `<b>Speed matters.</b> The push grows with the ball’s speed at the pin, from nothing at ${SPEED_MIN} ft/s to full at ${SPEED_FULL} ft/s. A creeping ball or a thin graze only makes a pin wobble; a firm putt carries pins across the rack. Splits like the 2-10 and 4-10 can be picked up with a firm, thin hit from a corner of the tee box; the 7-10 cannot.`,
      `<b>Putts-to-finish scoring</b> turns bowling into golf: a strike is an ace and a spare is a 2. In simulation at the default rig settings, an office-average putter averages ${SIM.bowlAvg} strokes and strikes ${SIM.bowlStrike}% of the time, which sets par at ${SIM.bowlPar}.`,
      'Pins drop when the camera reports the hit. With 250 ms of lag the ball is visibly past the rack before anything falls, which looks broken to players. Aim for under 100 ms.',
      'Pins reset by redrawing, so there is no pinsetter to build. Ball retrieval is the only reset time between putts.'
    ]); }
  };
}

