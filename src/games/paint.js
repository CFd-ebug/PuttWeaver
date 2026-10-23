// ---------- Paint Wars ----------
function makePaint(){
  const TURNS = 4;
  const P = [{name:'Magenta', color:'#d92b7a', logic:'#ff0000'}, {name:'Blue', color:'#2a5cff', logic:'#0000ff'}];
  const LW=320, LH=180;
  let shapes, turn, pct, log, disp, dispKey, logic, lg, pend = [];
  const who = () => turn%2;
  const finished = () => log.length >= TURNS*2;
  function holeScores(){
    const [a, b] = pct;
    if (Math.abs(a-b) < 0.5) return [3, 3];
    const hi = Math.max(a,b), lo = Math.min(a,b), ws = hi >= 2*lo ? 1 : 2;
    return a > b ? [ws, 6-ws] : [6-ws, ws];
  }
  function paint(g, sh, sc, logicMode){
    const col = logicMode ? P[sh.p].logic : P[sh.p].color; g.fillStyle=col; g.strokeStyle=col;
    if (sh.type==='seg'){ g.lineCap='round'; g.lineWidth=sh.w*sc; g.beginPath(); g.moveTo(sh.ax*sc,sh.ay*sc); g.lineTo(sh.bx*sc,sh.by*sc); g.stroke(); return; }
    const pts=sh.pts, n=pts.length, mid=i=>[(pts[i][0]+pts[(i+1)%n][0])/2*sc, (pts[i][1]+pts[(i+1)%n][1])/2*sc];
    g.beginPath(); const m=mid(n-1); g.moveTo(m[0],m[1]);
    for (let i=0;i<n;i++){ const nm=mid(i); g.quadraticCurveTo(pts[i][0]*sc, pts[i][1]*sc, nm[0], nm[1]); }
    g.closePath(); g.fill();
    for (const d of sh.drops){ g.beginPath(); g.arc(d[0]*sc,d[1]*sc,d[2]*sc,0,Math.PI*2); g.fill(); }
  }
  function ensureDisp(){
    const w=Math.max(1,Math.round(W*view.T)), h=Math.max(1,Math.round(D*view.T)), key=w+'x'+h;
    if (dispKey===key) return; disp.width=w; disp.height=h; dispKey=key;
    const g=disp.getContext('2d'); for (const sh of shapes) paint(g, sh, w/W, false);
  }
  function add(sh){ shapes.push(sh); paint(lg, sh, LW/W, true); if (dispKey) paint(disp.getContext('2d'), sh, disp.width/W, false); }
  function blob(x,y,r){
    const n=18, pts=[]; for (let i=0;i<n;i++){ const a=i/n*Math.PI*2, rr=r*(0.82+Math.random()*0.32); pts.push([x+Math.cos(a)*rr, y+Math.sin(a)*rr]); }
    const drops=[]; for (let i=0;i<5;i++){ const a=Math.random()*Math.PI*2, d=r*(1.15+Math.random()*0.5); drops.push([x+Math.cos(a)*d, y+Math.sin(a)*d, r*(0.08+Math.random()*0.12)]); }
    return {type:'blob', pts, drops};
  }
  function coverage(){
    const d=lg.getImageData(0,0,LW,LH).data; let a=0, b=0;
    for (let i=0;i<d.length;i+=4){ if (d[i+3]>127){ if (d[i]>=d[i+2]) a++; else b++; } }
    const t=LW*LH; pct=[a/t*100, b/t*100];
  }
  return {
    id:'paint', name:'Paint Wars', reads:'both', tapOK:true,
    how:'Two players share one ball and take turns. The rolling ball paints a stripe and its stopping point paints a splat. Later paint covers earlier paint. Four turns each.',
    rule:() => 'Head to head: a tie scores 3 each. The winner scores 2 and the loser 4, or 1 and 5 if the winner covers twice as much. The two scores always add up to 6.',
    hole:() => { const fin = finished(), s = fin ? holeScores() : [null, null]; return {par:3, list:[{who:P[0].name, strokes:s[0]}, {who:P[1].name, strokes:s[1]}], final:fin}; },
    start(){
      shapes=[]; turn=0; pct=[0,0]; log=[];
      disp=document.createElement('canvas'); dispKey='';
      logic=document.createElement('canvas'); logic.width=LW; logic.height=LH; lg=logic.getContext('2d', {willReadFrequently:true});
    },
    status(){ return finished() ? 'Match over' : `Turn ${Math.floor(turn/2)+1} of ${TURNS} · ${P[who()].name} to putt`; },
    /*SIM*/autoPutt(){ return puttTo(rnd(.15,.85)*W, rnd(.15,.8)*D); },/*/SIM*/
    onShotStart(){ pend = []; },
    onSample(s, prev){
      const stripe = (a, b) => add({type:'seg', ax:a.x, ay:a.y, bx:b.x, by:b.y, w:0.16*K, p:who()});
      if (!LIVE.on){ if (prev) stripe(prev, s); return; }
      // With the camera tracking, the stripe trails a few inches behind the ball, so the ball never sits on paint
      // that wasn't there when the empty sheet was photographed. The rest is painted when it stops.
      pend.push([prev, s]);
      while (pend.length && Math.hypot(pend[0][1].x - s.x, pend[0][1].y - s.y) > 0.35){ const [a, b] = pend.shift(); if (a) stripe(a, b); }
    },
    drawSheet(){
      ctx.fillStyle='#f4f5f8'; ctx.fillRect(0,0,W,D);
      ctx.strokeStyle='#e4e7ee'; ctx.lineWidth=0.01*K;
      for (let x=0.5*K;x<W;x+=0.5*K){ seg(x,0,x,D); ctx.stroke(); }
      for (let y=0.5*K;y<D;y+=0.5*K){ seg(0,y,W,y); ctx.stroke(); }
      ensureDisp(); ctx.drawImage(disp,0,0,W,D);
      const bx=W*0.3, bw=W*0.4, by=0.16*K, bh=0.09*K;
      rrect(bx,by,bw,bh,bh/2); ctx.fillStyle='rgba(30,36,52,0.15)'; ctx.fill();
      ctx.save(); rrect(bx,by,bw,bh,bh/2); ctx.clip();
      ctx.fillStyle=P[0].color; ctx.fillRect(bx,by,bw*pct[0]/100,bh);
      ctx.fillStyle=P[1].color; ctx.fillRect(bx+bw-bw*pct[1]/100,by,bw*pct[1]/100,bh);
      ctx.restore();
      txt(`${P[0].name.toUpperCase()} ${Math.round(pct[0])}%`, bx-0.1*K, by+bh/2, 0.1*K, {font:'display', align:'right', color:P[0].color, halo:'rgba(244,245,248,0.9)'});
      txt(`${Math.round(pct[1])}% ${P[1].name.toUpperCase()}`, bx+bw+0.1*K, by+bh/2, 0.1*K, {font:'display', align:'left', color:P[1].color, halo:'rgba(244,245,248,0.9)'});
      const pl=P[who()];
      if (!finished()) txt(`${pl.name.toUpperCase()} TO PUTT · ${Math.floor(turn/2)+1}/${TURNS}`, W/2, D-0.2*K, 0.1*K, {font:'display', color:pl.color, halo:'rgba(244,245,248,0.9)'});
    },
    onRest(p, why){
      const pl=P[who()];
      for (const [a, b] of pend) if (a) add({type:'seg', ax:a.x, ay:a.y, bx:b.x, by:b.y, w:0.16*K, p:who()}); pend = [];
      if (p){ const sh=blob(p.x,p.y,0.5*K); sh.p=who(); add(sh); }
      coverage(); log.push({p:who(), a:pct[0], b:pct[1], splat:!!p});
      return {title: p ? `${pl.name} splat` : `${pl.name}: stripe only`, detail:`${P[0].name} ${pct[0].toFixed(0)}% · ${P[1].name} ${pct[1].toFixed(0)}%.` + (p ? '' : ' '+WHY[why]+' The stripe still counts.')};
    },
    advance(){ turn++; return finished() ? 'over' : 'next'; },
    summary(){
      const [a, b] = pct, s = holeScores();
      const how = s[0] === 3 ? 'A tie within half a point.' : (s[0] === 1 || s[1] === 1) ? 'The winner covered at least twice as much.' : '';
      return {detail:`${P[0].name} ${a.toFixed(1)}% · ${P[1].name} ${b.toFixed(1)}% of the sheet. ${how}`.trim()};
    },
    card(){
      if (!log.length) return `<p class="empty">No putts yet. ${TURNS} turns each.</p>`;
      const r = log.map((x,i)=>`<tr><td>${i+1}</td><td class="name">${P[x.p].name}${x.splat?'':' <span class="off">(no splat)</span>'}</td><td class="num">${x.a.toFixed(0)}%</td><td class="num">${x.b.toFixed(0)}%</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>#</th><th>Putter</th><th class="num">${P[0].name}</th><th class="num">${P[1].name}</th></tr></thead><tbody>${r}</tbody></table>`;
    },
    notes(){ return li([
      'Reads <b>both</b>: the path paints a stripe and the stopping point paints a splat. One tracked ball keeps the vision simple even with two players.',
      '<b>Head-to-head scoring</b> for two players in the same group. Because the scores always add to 6, one player’s birdie is the other’s bogey.',
      'Coverage is counted from painted pixels, the same way the real system can count it from its own projected image. No extra sensing needed.',
      'Painting over the other color matters, so late turns get tactical. Splat size sets the pace: bigger splats mean a faster swing in coverage.'
    ]); }
  };
}


