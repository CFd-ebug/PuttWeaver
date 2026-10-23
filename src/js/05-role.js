// ================= roles =================
// Three ways to use this page (docs/console-plan.md has the full plan):
//   Evaluator  #play    the default. Try the games on any device with a simulated sheet; no camera or projector.
//   Host       #host    the camera phone over the hole: tracking and projection.
//   Manager    #manage  the remote console. Not built yet: this role shows a placeholder and never starts the game engine.
// The role comes from the address (#play, #host, #manage, or #manage=CODE for pairing), is remembered on the device,
// and falls back to Evaluator. A device that was already used as a camera phone before roles existed stays a Host.
const ROLE_INFO = {play: 'Evaluator', host: 'Host', manage: 'Manager'};
const ROLE_SUB = {
  play: 'Try the projected mini games on your own device and rate them',
  host: 'Camera phone: ball tracking and projection',
  manage: 'Management console'
};
const ROLE_KEY = 'putt-lab-role';
function roleFromHash(){ const h = (location.hash || '').slice(1).split('=')[0]; return ROLE_INFO[h] ? h : null; }
function resolveRole(){
  const fromHash = roleFromHash();
  if (fromHash){ try { localStorage.setItem(ROLE_KEY, fromHash); } catch (e) {} return fromHash; }
  try { const r = localStorage.getItem(ROLE_KEY); if (ROLE_INFO[r]) return r; } catch (e) {}
  try { if (localStorage.getItem('putt-lab-live')) return 'host'; } catch (e) {}
  return 'play';
}
const ROLE = resolveRole();
document.body.classList.add('role-' + ROLE);

(function bindRoleUi(){
  const el = id => document.getElementById(id);
  el('roleName').textContent = ROLE_INFO[ROLE];
  const sub = document.querySelector('.brand p'); if (sub) sub.textContent = ROLE_SUB[ROLE];
  const dlg = el('roleDlg');
  const open = () => { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); };
  const close = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
  dlg.querySelectorAll('.role-opt').forEach(b => {
    b.setAttribute('aria-current', String(b.dataset.role === ROLE));
    b.addEventListener('click', () => {
      const r = b.dataset.role;
      try { localStorage.setItem(ROLE_KEY, r); } catch (e) {}
      if (r === ROLE){ close(); return; }
      location.hash = '#' + r;          // the hashchange below reloads the page into the new role
    });
  });
  el('btnRole').addEventListener('click', open);
  el('roleClose').addEventListener('click', close);
  window.addEventListener('hashchange', () => { const r = roleFromHash(); if (r && r !== ROLE) location.reload(); });
  if (ROLE === 'manage') el('manageStub').hidden = false;
})();

// The Manager does not run the games or touch the camera.
if (ROLE === 'manage') return;
