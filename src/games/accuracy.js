// ---------- Accuracy Test ----------
function makeAccuracy(){
  const N = 10;
  let shots, num, target, last;
  const newTarget = () => ({x:rnd(0.15,0.85)*W, y:rnd(0.15,0.66)*D});
  const q = (a,p) => a[Math.min(a.length-1, Math.max(0, Math.ceil(p*a.length)-1))];
  return {
    id:'accuracy', name:'Accuracy Test', reads:'rest', tapOK:true,
    how:'Ten random targets. Each putt is measured in inches from the center and split into long/short and left/right. Use the result to size the targets in every other game.',
    start(){ shots=[]; num=1; target=newTarget(); last=null; },
    status(){ return `Target ${num} of ${N}`; },
    drawSheet(){
      ctx.fillStyle='#f5f6f9'; ctx.fillRect(0,0,W,D);
      ctx.strokeStyle='#dfe3eb'; ctx.lineWidth=0.012;
      for (let x=1;x<W;x++){ seg(x,0,x,D); ctx.stroke(); }
      for (let y=1;y<D;y++){ seg(0,y,W,y); ctx.stroke(); }
      for (let x=1;x<W;x++) txt(x+' ft', x+0.04, D-0.1, 0.07*K, {font:'mono', weight:400, color:'#98a1b4', align:'left', min:7});
      const t = target;
      for (const [r,a] of [[1,0.07],[0.5,0.12],[0.25,0.2]]){
        circle(t.x,t.y,r); ctx.fillStyle=`rgba(35,67,214,${a})`; ctx.fill();
        ctx.lineWidth=0.012; ctx.strokeStyle='rgba(35,67,214,0.6)'; ctx.stroke();
      }
      circle(t.x,t.y,CUP_R); ctx.fillStyle='#1c2540'; ctx.fill();
      for (const [r,l] of [[1,'12 in'],[0.5,'6 in'],[0.25,'3 in']]) txt(l, t.x+r*0.707, t.y-r*0.707, 0.065*K, {font:'mono', weight:500, color:'#2a3c8f', halo:'rgba(245,246,249,0.9)', min:7});
      if (last){
        dashed(t.x,t.y,last.p.x,last.p.y,'#c9302a',0.018*K);
        pill(last.miss.toFixed(1)+' in', last.p.x, last.p.y-0.24*K, 0.085*K, '#c9302a', '#fff', {font:'mono', weight:500});
      }
      txt(`TARGET ${num}/${N}`, 0.18*K, 0.24*K, 0.11*K, {font:'display', align:'left', color:'#2343d6'});
    },
    onRest(p, why){
      if (!p){ shots.push({off:true}); last=null; return {title:'No reading', detail:WHY[why], tone:'bad'}; }
      const ux=target.x-TEE.x, uy=target.y-TEE.y, ul=Math.hypot(ux,uy), u={x:ux/ul, y:uy/ul};
      const dx=p.x-target.x, dy=p.y-target.y;
      const miss=Math.hypot(dx,dy)*12, along=(dx*u.x+dy*u.y)*12, across=(u.x*dy-u.y*dx)*12;
      shots.push({miss, along, across}); last={p, miss};
      return {
        title: miss < CUP_R*12 ? 'In the cup' : `${miss.toFixed(1)} in from center`,
        detail: `${along>=0?'Long':'Short'} by ${Math.abs(along).toFixed(1)} in, ${Math.abs(across).toFixed(1)} in ${across>=0?'right':'left'}.`,
        tone: miss<3 ? 'good' : miss>10 ? 'bad' : ''
      };
    },
    advance(){ if (shots.length>=N) return 'over'; num++; target=newTarget(); last=null; return 'next'; },
    summary(){
      const m = shots.filter(s=>!s.off).map(s=>s.miss).sort((a,b)=>a-b), off = shots.length-m.length;
      if (!m.length) return {title:'No readings', detail:'Every putt left the sheet. Try a slower surface or rails.'};
      return {
        title:`Median miss ${q(m,0.5).toFixed(1)} in`,
        detail:`Four out of five putts that stayed on the sheet stopped within ${q(m,0.8).toFixed(1)} in of the center. Targets with a smaller radius than that will feel like luck to this player.` + (off ? ` ${off} putt${off>1?'s':''} left the sheet.` : '')
      };
    },
    card(){
      if (!shots.length) return '<p class="empty">No putts yet. Ten targets per test.</p>';
      const rows = shots.map((s,i) => s.off
        ? `<tr><td>${i+1}</td><td class="num off" colspan="3">off the sheet</td></tr>`
        : `<tr><td>${i+1}</td><td class="num">${s.miss.toFixed(1)}</td><td class="num">${s.along>=0?'+':'−'}${Math.abs(s.along).toFixed(1)}</td><td class="num">${Math.abs(s.across).toFixed(1)} ${s.across>=0?'R':'L'}</td></tr>`).join('');
      const m = shots.filter(s=>!s.off).map(s=>s.miss).sort((a,b)=>a-b);
      const foot = m.length ? `<tfoot><tr><td colspan="2">Median ${q(m,.5).toFixed(1)}</td><td class="num" colspan="2">80% within ${q(m,.8).toFixed(1)}</td></tr></tfoot>` : '';
      return `<table class="sc"><thead><tr><th>#</th><th class="num">Miss in</th><th class="num">Long +</th><th class="num">Side</th></tr></thead><tbody>${rows}</tbody>${foot}</table>`;
    },
    notes(){ return li([
      'Reads <b>where the ball stops</b>. Rings sit 3, 6 and 12 in from the center. The dark disc is a regulation 4.25 in cup.',
      'Run ten putts at each player setting. If a typical player lands inside a target only one time in five, the game will feel random rather than skillful.',
      'Distance error usually beats aim error: on a 5 ft putt, 10% speed error is 6 in long or short, while 1.5° of aim error is only 1.6 in sideways. Targets can be narrower across than they are deep.',
      'On the real rig, ten coworkers with a putter and a tape measure will give you the true numbers before you build any game around them.'
    ]); }
  };
}

