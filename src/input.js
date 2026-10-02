export function createInput() {
  const s = {
    thrust: 0, turn: 0, lift: 0, roll: 0,
    boost: false, fire: false, brake: false,
    camDX: 0, camDY: 0,
    isTouch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0
  };
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
    pollKeys();
  });
  addEventListener('keyup', e => { keys[e.code] = false; pollKeys(); });

  function pollKeys() {
    let thrust = 0, turn = 0, lift = 0, roll = 0;
    if (keys.KeyW || keys.ArrowUp) thrust += 1;
    if (keys.KeyS || keys.ArrowDown) thrust -= 1;
    if (keys.KeyA || keys.ArrowLeft) turn -= 1;
    if (keys.KeyD || keys.ArrowRight) turn += 1;
    if (keys.KeyR) lift += 1;
    if (keys.KeyF) lift -= 1;
    if (keys.KeyQ) roll -= 1;
    if (keys.KeyE) roll += 1;
    s.kb = { thrust, turn, lift, roll };
    s.boost = !!keys.ShiftLeft || !!keys.ShiftRight || s.touchBoost;
    s.fire = !!keys.Space || s.touchFire;
    s.brake = !!keys.KeyX || s.touchBrake;
    combine();
  }
  s.kb = { thrust: 0, turn: 0, lift: 0, roll: 0 };
  s.stickL = { x: 0, y: 0 };
  s.stickR = { x: 0, y: 0 };
  s.touchBoost = false; s.touchFire = false; s.touchBrake = false;

  function combine() {
    s.thrust = clamp((s.kb.thrust || 0) + (-s.stickL.y), -1, 1);
    s.turn = clamp((s.kb.turn || 0) + (s.stickL.x), -1, 1);
    s.lift = clamp((s.kb.lift || 0) + (-s.stickR.y), -1, 1);
    s.roll = clamp((s.kb.roll || 0) + (s.stickR.x), -1, 1);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  s._combine = combine;
  pollKeys();

  // --- Touch sticks ---
  function bindStick(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const nub = el.querySelector('.nub');
    let pid = null;
    const setNub = (dx, dy) => { nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
    el.addEventListener('pointerdown', e => {
      pid = e.pointerId; el.setPointerCapture(pid);
      move(e);
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
    const end = e => {
      if (e.pointerId !== pid) return;
      pid = null; target.x = 0; target.y = 0; setNub(0, 0); combine();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    function move(e) {
      const r = el.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      // deadzone
      if (Math.hypot(dx, dy) < 0.12) { dx = 0; dy = 0; }
      target.x = dx; target.y = dy;
      setNub(dx * 36, dy * 36);
      combine();
    }
  }
  bindStick('stick-left', s.stickL);
  bindStick('stick-right', s.stickR);

  function bindBtn(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = e => { e.preventDefault(); s[key] = true; pollKeys(); el.classList.add('active'); };
    const off = e => { e.preventDefault(); s[key] = false; pollKeys(); el.classList.remove('active'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  bindBtn('tbtn-boost', 'touchBoost');
  bindBtn('tbtn-fire', 'touchFire');
  bindBtn('tbtn-brake', 'touchBrake');

  // Maus-Drag = Kamera-Orbit (Desktop)
  let dragging = false, lx = 0, ly = 0;
  addEventListener('pointerdown', e => {
    if (e.target.closest('#side-menu,#start-overlay,#touch-ui,button,input')) return;
    dragging = true; lx = e.clientX; ly = e.clientY;
  });
  addEventListener('pointermove', e => {
    if (!dragging) return;
    s.camDX += (e.clientX - lx) * 0.005;
    s.camDY += (e.clientY - ly) * 0.005;
    s.camDY = clamp(s.camDY, -0.9, 0.9);
    lx = e.clientX; ly = e.clientY;
  });
  addEventListener('pointerup', () => {
    dragging = false;
    // slow recenter
  });

  setInterval(() => { s.camDX *= 0.95; s.camDY *= 0.95; }, 50);

  return s;
}
