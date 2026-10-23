// ================= input =================
function dragAim(){
  if (!drag) return null;
  const dx=drag.x0-drag.x, dy=drag.y0-drag.y, L=Math.hypot(dx,dy);
  if (L<10) return null;
  const maxL = clamp(parseFloat(cvs.style.height)*0.55, 120, 300);
  return {angle:Math.atan2(dy,dx), frac:clamp(L/maxL,0.02,1)};
}
cvs.addEventListener('pointerdown', e => {
  if (e.button) return;
  cvs.focus({preventScroll:true});
  if (mode==='result' || mode==='over'){ pendingAdvance=true; return; }
  if (mode!=='aim') return;
  if (S.input==='tap' && game.tapOK){ tapPending=cssToWorld(e.clientX,e.clientY); return; }
  drag={id:e.pointerId, x0:e.clientX, y0:e.clientY, x:e.clientX, y:e.clientY};
  try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
  kb.active=false;
});
cvs.addEventListener('pointermove', e => { if (drag && e.pointerId===drag.id){ drag.x=e.clientX; drag.y=e.clientY; } });
cvs.addEventListener('pointerup', e => {
  if (pendingAdvance){ pendingAdvance=false; advance(); return; }
  if (tapPending){ const p=tapPending; tapPending=null; if (mode==='aim' && onSheet(p.x,p.y)) place(p); return; }
  if (drag && e.pointerId===drag.id){ const a=dragAim(); drag=null; if (a) putt(a.angle, a.frac); }
});
cvs.addEventListener('pointercancel', () => { drag=null; tapPending=null; pendingAdvance=false; });
cvs.addEventListener('keydown', e => {
  if (mode==='result' || mode==='over'){ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); advance(); } return; }
  if (mode!=='aim') return;
  const st = e.shiftKey ? 5 : 1;
  if (e.key==='ArrowLeft'){ kb.angle-=st*Math.PI/180; kb.active=true; }
  else if (e.key==='ArrowRight'){ kb.angle+=st*Math.PI/180; kb.active=true; }
  else if (e.key==='ArrowUp'){ kb.frac=clamp(kb.frac+0.02*st,0.02,1); kb.active=true; }
  else if (e.key==='ArrowDown'){ kb.frac=clamp(kb.frac-0.02*st,0.02,1); kb.active=true; }
  else if (e.key===' ' || e.key==='Enter'){ if (kb.active) putt(kb.angle, kb.frac); else kb.active=true; }
  else return;
  e.preventDefault();
});

