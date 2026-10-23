// ---------- Periodic Table ----------
// ELEMENT_ROWS is injected at build time: [atomic number, symbol, name, column, row, category]
const ELEMENTS = ELEMENT_ROWS.map(([z, sym, name, col, row, cat]) => ({z, sym, name, col, row, cat}));
const FAMILIAR_Z = new Set([1,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,22,24,25,26,27,28,29,30,33,35,36,38,47,50,53,54,60,74,78,79,80,82,86]);
const ECAT = {
  alkali:'#f6c6bf', alkaline:'#f8d9c2', transition:'#d5dcef', post:'#c9dcee', metalloid:'#ddd0ec',
  nonmetal:'#f1d0e3', halogen:'#e9c3dc', noble:'#c6cdf5', lan:'#ecdccf', act:'#e6cbc6'
};
function makePeriodic(){
  const N = 4;
  const OPT = [
    {id:'zone', label:'Close counts', choices:[['touch','On it or touching · par 3'], ['exact','Exact square · par 4']]},
    {id:'pool', label:'Elements', choices:[['familiar','Familiar'], ['all','All 118']]},
    {id:'labels', label:'Table shows', choices:[['symbols','Symbols'], ['blank','Nothing']]}
  ];
  const opt = id => optVal('periodic', OPT, id);
  let picks, num, rows, last, hits;
  const cur = () => picks[num-1];
  const score = () => countdownScore(hits);
  function geo(){
    const mx = W*0.025, my = D*0.035, cw = (W-2*mx)/18, ch = (D-2*my)/9.45;
    return {mx, my, cw, ch, colX: c => mx + (c-1)*cw, rowY: r => my + (r <= 7 ? r-1 : r-1.55)*ch};
  }
  function rect(col, row){ const g = geo(); return {x:g.colX(col), y:g.rowY(row), w:g.cw, h:g.ch}; }
  function at(x, y){ for (const e of ELEMENTS){ const r = rect(e.col, e.row); if (x >= r.x && x < r.x+r.w && y >= r.y && y < r.y+r.h) return e; } return null; }
  function judge(p, t){
    const r = rect(t.col, t.row), ux = Math.abs(p.x-(r.x+r.w/2))/r.w, uy = Math.abs(p.y-(r.y+r.h/2))/r.h;
    return {exact: ux <= 0.5 && uy <= 0.5, touch: ux <= 1.5 && uy <= 1.5, away: Math.max(Math.round(ux), Math.round(uy))};
  }
  const zoneText = () => opt('zone') === 'exact' ? 'Exact square' : 'On it or touching';
  return {
    id:'periodic', name:'Periodic Table', reads:'rest', tapOK:true, opts:OPT,
    how:'An element’s name is projected in the gap at the top of the table. Putt so the ball stops on its square. Four elements per hole.',
    rule:() => opt('zone') === 'exact'
      ? 'Countdown: start at 5. Each ball that stops on the element’s own square takes a stroke off.'
      : 'Countdown: start at 5. Each ball that stops on the element or a square touching it takes a stroke off.',
    hole:() => ({par: opt('zone') === 'exact' ? 4 : 3, list:[{who:'', strokes:score()}], final: rows.length >= N}),
    start(){
      const pool = opt('pool') === 'all' ? ELEMENTS : ELEMENTS.filter(e => FAMILIAR_Z.has(e.z));
      picks = shuffle(pool).slice(0, N); num=1; rows=[]; last=null; hits=0;
    },
    status(){ return `Element ${num} of ${N} · score ${score()}`; },
    /*SIM*/autoPutt(){ const r = rect(cur().col, cur().row); return puttTo(r.x+r.w/2, r.y+r.h/2); },/*/SIM*/
    drawSheet(){
      const g = geo(), t = cur(), blank = opt('labels') === 'blank';
      const showNum = g.ch*view.T/dpr > 34;
      ctx.fillStyle='#f6f6f8'; ctx.fillRect(0,0,W,D);
      const pad = Math.min(g.cw, g.ch)*0.05;
      for (const e of ELEMENTS){
        const x=g.colX(e.col)+pad, y=g.rowY(e.row)+pad, w=g.cw-2*pad, h=g.ch-2*pad;
        rrect(x,y,w,h,w*0.08); ctx.fillStyle=ECAT[e.cat]; ctx.fill();
        if (!blank){
          txt(e.sym, x+w/2, y+h*0.57, h*0.42, {weight:700, color:'#1c2236', min:5});
          if (showNum) txt(String(e.z), x+w*0.1, y+h*0.17, h*0.17, {font:'mono', weight:500, color:'#4a5372', align:'left', min:0});
        }
      }
      for (const [r, label] of [[6,'57–71'], [7,'89–103']]){
        const x=g.colX(3)+pad, y=g.rowY(r)+pad, w=g.cw-2*pad, h=g.ch-2*pad;
        rrect(x,y,w,h,w*0.08); ctx.fillStyle='#e6e7ee'; ctx.fill();
        if (!blank) txt(label, x+w/2, y+h/2, h*0.2, {font:'mono', weight:500, color:'#6a7290', min:0});
      }
      // prompt sits in the empty notch above the transition metals
      const bx=g.colX(3)+g.cw*0.15, bw=g.cw*9.7, by=g.rowY(1)+g.ch*0.1, bh=g.ch*2.8;
      banner(bx,by,bw,bh);
      const prog = `${num}/${N} · SCORE ${score()}`;
      if (tw('FIND THE ELEMENT', 0.07*K, {font:'display', ls:.1}) + tw(prog, 0.07*K, {font:'mono', weight:500}) + 0.4*K < bw)
        txt('FIND THE ELEMENT', bx+0.14*K, by+0.17*K, 0.07*K, {font:'display', align:'left', color:'#9fb3ff', ls:.1});
      txt(prog, bx+bw-0.14*K, by+0.17*K, 0.07*K, {font:'mono', weight:500, align:'right', color:'#9fb3ff'});
      txt(t.name, bx+bw/2, by+bh*0.58, Math.min(0.3*K, bh*0.34), {font:'display', color:'#fff', maxW:bw-0.3*K});
      const lx = g.colX(1)+g.cw*0.12, ly = g.rowY(9)+g.ch*0.35;
      txt('CLOSE ZONE', lx, ly, 0.06*K, {font:'mono', weight:500, align:'left', color:'#5a6276', ls:.06});
      txt(zoneText(), lx, ly+0.17*K, 0.075*K, {weight:700, align:'left', color:'#1d2333', maxW:g.cw*1.75});
      if (last){
        const r = rect(t.col, t.row);
        if (opt('zone') !== 'exact'){
          ctx.fillStyle='rgba(35,67,214,0.14)'; ctx.fillRect(r.x-r.w, r.y-r.h, r.w*3, r.h*3);
          ctx.save(); ctx.setLineDash([0.04*K,0.03*K]); ctx.lineWidth=0.012*K; ctx.strokeStyle='rgba(35,67,214,0.8)'; ctx.strokeRect(r.x-r.w, r.y-r.h, r.w*3, r.h*3); ctx.restore();
        }
        ctx.lineWidth=0.03*K; ctx.strokeStyle='#c9302a'; ctx.strokeRect(r.x+pad*0.5, r.y+pad*0.5, r.w-pad, r.h-pad);
        if (blank) txt(t.sym, r.x+r.w/2, r.y+r.h*0.57, r.h*0.42, {weight:700, color:'#8f1d18', min:5});
        if (last.p) dashed(last.p.x, last.p.y, r.x+r.w/2, r.y+r.h/2, '#c9302a', 0.016*K);
      }
    },
    onRest(p, why){
      const t = cur();
      if (!p){ rows.push({name:t.name, on:null, hit:false}); last={p:null}; return {title:'No reading', detail:`${WHY[why]} ${t.name} is ${t.sym}, number ${t.z}. Score stays ${score()}.`, tone:'bad'}; }
      const j = judge(p, t), on = at(p.x, p.y), hit = opt('zone') === 'exact' ? j.exact : j.touch;
      if (hit) hits++;
      rows.push({name:t.name, on: on ? on.sym : '—', hit, away: j.exact ? 0 : j.away}); last={p, hit};
      const where = on ? `on ${on.name} (${on.sym})` : 'on an empty square';
      if (j.exact) return {title:`On ${t.name}: −1 stroke`, detail:`${t.name} is ${t.sym}, number ${t.z}. Score now ${score()}.`, tone:'good'};
      if (hit) return {title:'Touching: −1 stroke', detail:`You stopped ${where}, right next to ${t.name} (${t.sym}). Score now ${score()}.`, tone:'good'};
      if (j.touch) return {title:'Touching, not on it', detail:`You stopped ${where}. This hole needs the exact square, so the score stays ${score()}.`, tone:'bad'};
      return {title:`${plural(j.away,'square')} away`, detail:`You stopped ${where}. ${t.name} is ${t.sym}, number ${t.z}. Score stays ${score()}.`, tone:'bad'};
    },
    advance(){ if (rows.length>=N) return 'over'; num++; last=null; return 'next'; },
    summary(){ return {detail:`${hits} of ${N} elements counted as close (${zoneText().toLowerCase()}).`}; },
    card(){
      if (!rows.length) return '<p class="empty">No putts yet. Four elements per hole.</p>';
      const r = rows.map((x,i)=>`<tr><td>${i+1}</td><td class="name">${esc(x.name)}</td><td class="num${x.on==null?' off':''}">${x.on==null?'no read':esc(x.on)}</td><td class="num">${x.hit?'−1':'·'}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>#</th><th>Element</th><th class="num">Ball on</th><th class="num">Stroke</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="3">Score (started at 5)</td><td class="num">${score()}</td></tr></tfoot></table>`;
    },
    notes(){
      const g = geo();
      return li([
        `Reads <b>where the ball stops</b>. On a ${W} ft sheet each square is ${(g.cw*12).toFixed(1)} × ${(g.ch*12).toFixed(1)} in, about the size of the Accuracy Test’s 3 in ring.`,
        `<b>Countdown scoring.</b> In simulation at the default rig settings, an office-average putter who aims at the exact center lands on the square ${SIM.pt1}% of the time and on it or touching ${SIM.pt3}%. That gap is why touching plays as par 3 and exact plays as par 4.`,
        'Most misses are a row too long or too short, because distance control is harder than aim and the rows run across the putt. That makes the far rows and the f-block the hardest targets.',
        '“Nothing” hides the symbols, so it tests where elements sit, not just how to read them. “Familiar” keeps the pool to elements most people have heard of.',
        'The category tints avoid yellow and green so the table can’t be mistaken for the ball. The table uses the standard 18-column layout with the lanthanides and actinides in their own rows.'
      ]);
    }
  };
}

