import * as THREE from 'three';

// ============ STATE ============
const S = {
  id: null, name: 'Survivor',
  x: 0, z: 0, rotY: 0, pitch: -0.35,
  hp: 100, hunger: 100, stamina: 100,
  alive: true, kills: 0, dmg: 34, sprint: false,
  players: new Map(), zombies: new Map(), loots: new Map(),
};
let scene, camera, renderer, me, clock;
let sun, hemi, lootGroup, colliders = [];
const raycaster = new THREE.Raycaster();
const keys = {};
const tmpV = new THREE.Vector3();

// ============ WS ============
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}`);
const $ = id => document.getElementById(id);

ws.onopen = () => { $('status').textContent = '✅ Verbunden — Name wählen & spielen!'; };
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'welcome') {
    S.id = m.id;
    for (const l of m.loots) S.loots.set(l.id, l);
    buildLootMeshes();
    if (me) { me.g.position.set(S.x, 0, S.z); }
  } else if (m.t === 'players' || m.t === 'tick') {
    $('online').textContent = '👥 ' + m.players.length;
    for (const p of m.players) {
      if (p.id === S.id) {
        if (p.hp < S.hp) flashDmg();
        S.hp = p.hp; S.hunger = p.hunger; S.kills = p.kills || S.kills;
        if (!p.alive && S.alive) { S.alive = false; $('dead').classList.remove('hidden'); }
        if (p.alive && !S.alive) { S.alive = true; $('dead').classList.add('hidden'); }
        $('kills').textContent = '💀 ' + S.kills;
        continue;
      }
      let o = S.players.get(p.id);
      if (!o) { o = makeHuman(p.name, false); scene.add(o.g); S.players.set(p.id, o); }
      o.target = p; o.g.visible = p.alive;
    }
    // entfernte Spieler löschen
    for (const [id, o] of S.players) {
      if (!m.players.find(p => p.id === id)) { scene.remove(o.g); S.players.delete(id); }
    }
  }
  if (m.t === 'tick' && m.zombies) {
    for (const z of m.zombies) {
      let o = S.zombies.get(z.id);
      if (!o) { o = makeZombie(); scene.add(o.g); S.zombies.set(z.id, o); }
      o.target = z;
    }
    for (const [id, o] of S.zombies) {
      if (!m.zombies.find(z => z.id === id)) { scene.remove(o.g); S.zombies.delete(id); }
    }
    for (const l of (m.loots || [])) if (!S.loots.has(l.id)) S.loots.set(l.id, l);
    // genommene entfernen
    const ids = new Set((m.loots || []).map(l => l.id));
    for (const [id, mesh] of lootMeshes) if (!ids.has(id)) { lootGroup.remove(mesh); lootMeshes.delete(id); S.loots.delete(id); }
  } else if (m.t === 'lootGranted') {
    applyLoot(m.loot.type);
    S.loots.delete(m.loot.id);
    const mesh = lootMeshes.get(m.loot.id);
    if (mesh) { lootGroup.remove(mesh); lootMeshes.delete(m.loot.id); }
  } else if (m.t === 'kill') {
    feed(`☠️ ${m.by}${m.victim ? ' ▸ ' + m.victim : ''}`);
  }
};
function send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }

// ============ WELT ============
const WORLD = 220;
function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1410, 30, 160);
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('game').appendChild(renderer.domElement);

  hemi = new THREE.HemisphereLight(0xbdd8ff, 0x2a4a2a, 0.9);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  scene.add(sun); scene.add(sun.target);

  // Boden mit leichtem Noise
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.sin(x * 0.08) * Math.cos(z * 0.07) * 1.2);
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3d6b35 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Straße (Kreuz)
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const r1 = new THREE.Mesh(new THREE.PlaneGeometry(8, WORLD), roadMat);
  r1.rotation.x = -Math.PI / 2; r1.position.y = 0.06; scene.add(r1);
  const r2 = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, 8), roadMat);
  r2.rotation.x = -Math.PI / 2; r2.position.y = 0.06; scene.add(r2);

  // Bäume
  const trunkM = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d22 });
  const leafM = new THREE.ConeGeometry(2.4, 5, 7);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1e5c22 });
  for (let i = 0; i < 160; i++) {
    const x = rnd(-105, 105), z = rnd(-105, 105);
    if (Math.abs(x) < 7 || Math.abs(z) < 7) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkM, trunkMat); trunk.position.y = 1.5; trunk.castShadow = true;
    const leaf = new THREE.Mesh(leafM, leafMat); leaf.position.y = 5; leaf.castShadow = true;
    t.add(trunk, leaf); t.position.set(x, groundH(x, z), z);
    const s = rnd(0.7, 1.6); t.scale.setScalar(s);
    scene.add(t);
    colliders.push(leaf); // Kamera-Kollision mit Baumkronen
  }

  // Häuser (DayZ Dörfer)
  const houseCols = [0x8a7f6a, 0x9a8a7a, 0x777766];
  for (let i = 0; i < 16; i++) {
    const x = rnd(-90, 90), z = rnd(-90, 90);
    if (Math.abs(x) < 10 || Math.abs(z) < 10) continue;
    const w = rnd(6, 10), d = rnd(6, 10), h = rnd(3, 4.5);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: houseCols[i % 3] }));
    base.position.y = h / 2; base.castShadow = true; base.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.5, 4),
      new THREE.MeshLambertMaterial({ color: 0x5c2e1e }));
    roof.position.y = h + 1.2; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(base, roof); g.position.set(x, groundH(x, z), z);
    g.rotation.y = rnd(0, Math.PI);
    scene.add(g);
    colliders.push(base); // Kamera-Kollision mit Häusern
  }

  lootGroup = new THREE.Group(); scene.add(lootGroup);
  me = makeHuman('ICH', true);
  scene.add(me.g);

  clock = new THREE.Clock();
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  bindInput();
  renderer.setAnimationLoop(tick);
}
function rnd(a, b) { return a + Math.random() * (b - a); }
function groundH(x, z) { return Math.sin(x * 0.08) * Math.cos(z * 0.07) * 1.2; }

// ============ CHARAKTERE ============
function makeHuman(name, isMe) {
  const g = new THREE.Group();
  const col = isMe ? 0x2e9bff : 0xff9b2e;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
    new THREE.MeshLambertMaterial({ color: col }));
  body.position.y = 1.2; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 2.25; head.castShadow = true;
  // Waffe (Bat)
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a4a22 }));
  bat.position.set(0.55, 1.3, 0.3); bat.rotation.z = 0.4;
  g.add(body, head, bat);
  const tag = makeTag(name);
  tag.position.y = 2.9; g.add(tag);
  return { g, body, target: null, bob: Math.random() * 9 };
}
function makeZombie() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x4da33d });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 8), mat);
  body.position.y = 1.2; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0x6fce5a }));
  head.position.y = 2.25; head.castShadow = true;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  eye.position.set(0.12, 2.3, 0.28); g.add(eye);
  const eye2 = eye.clone(); eye2.position.x = -0.12; g.add(eye2);
  g.add(body, head);
  return { g, body, target: null, bob: Math.random() * 9 };
}
function makeTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 8, 256, 48);
  x.fillStyle = '#fff'; x.font = 'bold 28px system-ui'; x.textAlign = 'center';
  x.fillText(text.slice(0, 12), 128, 43);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(3, 0.75, 1);
  return s;
}

// ============ LOOT ============
const lootMeshes = new Map();
const LOOT_COLOR = { food: 0xffb340, medkit: 0xff4444, ammo: 0x888888, bat: 0x8a5a2a };
function buildLootMeshes() {
  for (const l of S.loots.values()) {
    if (lootMeshes.has(l.id)) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color: LOOT_COLOR[l.type] || 0xffffff, emissive: 0x222222 }));
    m.position.set(l.x, groundH(l.x, l.z) + 0.5, l.z);
    m.castShadow = true;
    lootGroup.add(m); lootMeshes.set(l.id, m);
  }
}
function applyLoot(type) {
  if (type === 'food') { S.hunger = Math.min(100, S.hunger + 35); toast('🍖 +35 Nahrung'); }
  if (type === 'medkit') { S.hp = Math.min(100, S.hp + 50); toast('💊 +50 HP'); }
  if (type === 'ammo') { S.dmg = Math.min(80, S.dmg + 12); toast('🔫 Waffe stärker! DMG ' + S.dmg); }
  if (type === 'bat') { S.dmg = Math.min(80, S.dmg + 8); toast('🏏 Baseballschläger! DMG ' + S.dmg); }
}

// ============ INPUT (Touch + Desktop) ============
let joy = { x: 0, y: 0, active: false };
let lookId = null, lookLast = null;
function bindInput() {
  const stick = $('stick'), knob = $('knob');
  const setKnob = (dx, dy) => { knob.style.left = (41 + dx) + 'px'; knob.style.top = (41 + dy) + 'px'; };
  stick.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      const r = stick.getBoundingClientRect();
      if (t.clientX > r.left - 20 && t.clientX < r.right + 20 && t.clientY > r.top - 20 && t.clientY < r.bottom + 20) {
        joy.active = true; joy.id = t.identifier; moveJoy(t, r, setKnob);
      } else if (t.clientX > innerWidth * 0.35 && lookId === null && t.target.tagName !== 'BUTTON') {
        lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: true });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (joy.active && t.identifier === joy.id) moveJoy(t, stick.getBoundingClientRect(), setKnob);
      if (t.identifier === lookId) {
        S.rotY -= (t.clientX - lookLast.x) * 0.006;
        S.pitch = Math.max(-1.1, Math.min(-0.05, S.pitch - (t.clientY - lookLast.y) * 0.004));
        lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: true });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy?.id) { joy = { x: 0, y: 0, active: false }; setKnob(0, 0); }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
  function moveJoy(t, r, setKnob) {
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), max = 45;
    if (m > max) { dx *= max / m; dy *= max / m; }
    setKnob(dx, dy); joy.x = dx / max; joy.y = dy / max;
  }
  // Desktop
  addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') attack(); if (e.key.toLowerCase() === 'e') tryLoot(); });
  addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
  let drag = false, lx = 0, ly = 0;
  addEventListener('mousedown', e => { drag = true; lx = e.clientX; ly = e.clientY; });
  addEventListener('mousemove', e => {
    if (!drag) return;
    S.rotY -= (e.clientX - lx) * 0.005;
    S.pitch = Math.max(-1.1, Math.min(-0.05, S.pitch - (e.clientY - ly) * 0.003));
    lx = e.clientX; ly = e.clientY;
  });
  addEventListener('mouseup', () => drag = false);
  $('attackBtn').addEventListener('touchstart', e => { e.preventDefault(); attack(); }, { passive: false });
  $('attackBtn').addEventListener('click', attack);
  $('lootBtn').addEventListener('touchstart', e => { e.preventDefault(); tryLoot(); }, { passive: false });
  $('lootBtn').addEventListener('click', tryLoot);
  const sp = $('sprintBtn');
  const toggleSprint = e => { e.preventDefault(); S.sprint = !S.sprint; sp.classList.toggle('on', S.sprint); };
  sp.addEventListener('touchstart', toggleSprint, { passive: false });
  sp.addEventListener('click', toggleSprint);
  $('play').onclick = () => {
    S.name = ($('name').value || 'Survivor').slice(0, 14);
    S.x = rnd(-12, 12); S.z = rnd(-12, 12); // Spawn auf der Lichtung (keine Bäume)
    S.hp = 100; S.hunger = 100; S.alive = true;
    $('dead').classList.add('hidden');
    $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
    send({ t: 'join', name: S.name });
    send({ t: 'move', x: +S.x.toFixed(2), z: +S.z.toFixed(2), rot: 0, hp: 100, hunger: 100 });
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  $('respawn').onclick = () => {
    S.hp = 100; S.hunger = 100; S.stamina = 100; S.alive = true;
    S.x = rnd(-12, 12); S.z = rnd(-12, 12);
    send({ t: 'respawn' });
    send({ t: 'move', x: +S.x.toFixed(2), z: +S.z.toFixed(2), rot: S.rotY, hp: 100, hunger: 100 });
    $('dead').classList.add('hidden');
  };
}

// ============ KAMPF / LOOT ============
function nearestZombie(maxD = 4.5) {
  let best = null, bd = maxD * maxD;
  for (const [id, o] of S.zombies) {
    const dx = o.g.position.x - S.x, dz = o.g.position.z - S.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
function nearestPlayer(maxD = 4.5) {
  let best = null, bd = maxD * maxD;
  for (const [id, o] of S.players) {
    if (!o.target?.alive && !o.g.visible) continue;
    const dx = o.g.position.x - S.x, dz = o.g.position.z - S.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
function attack() {
  if (!S.alive) return;
  blip(180);
  const z = nearestZombie();
  if (z) { send({ t: 'hitZombie', zid: z, dmg: S.dmg }); toast('💥 Treffer! (' + S.dmg + ')'); return; }
  const p = nearestPlayer();
  if (p) { send({ t: 'hitPlayer', pid: p, dmg: 25 }); toast('⚔️ Spieler getroffen!'); }
  else toast('💨 Nichts in Reichweite');
}
function nearestLoot() {
  let best = null, bd = 25;
  for (const [id, m] of lootMeshes) {
    const dx = m.position.x - S.x, dz = m.position.z - S.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
function tryLoot() {
  const id = nearestLoot();
  if (id) send({ t: 'takeLoot', lid: id });
  else toast('🔍 Keine Kiste in der Nähe');
}

// ============ LOOP ============
let dayT = 0.3, netT = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  dayT = (dayT + dt * 0.005) % 1;
  // Tag/Nacht
  const ang = dayT * Math.PI * 2;
  sun.position.set(Math.cos(ang) * 80 + S.x, Math.sin(ang) * 80 + 20, 40 + S.z);
  sun.target.position.set(S.x, 0, S.z);
  const day = Math.max(0, Math.sin(ang));
  sun.intensity = 0.15 + day * 1.5;
  hemi.intensity = 0.25 + day * 0.7;
  const isDay = day > 0.25;
  scene.background = new THREE.Color(isDay ? 0x87b5e0 : 0x060a12);
  scene.fog.color.set(isDay ? 0x9dbfa8 : 0x060a12);
  const hh = Math.floor(dayT * 24), mm = Math.floor((dayT * 24 % 1) * 60);
  $('clock').textContent = (isDay ? '☀️' : '🌙') + ` ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  if (S.alive && !$('menu').classList.contains('hidden') === false) {
    // Bewegung
    let fw = 0, st = 0;
    if (keys['w']) fw += 1; if (keys['s']) fw -= 1;
    if (keys['a']) st -= 1; if (keys['d']) st += 1;
    if (joy.active) { fw -= joy.y; st += joy.x; }
    const sprint = S.sprint || keys['shift'];
    const speed = (sprint && S.stamina > 1 ? 9 : 5);
    if (sprint && (fw || st)) S.stamina = Math.max(0, S.stamina - dt * 18);
    else S.stamina = Math.min(100, S.stamina + dt * 12);
    const len = Math.hypot(fw, st) || 1;
    const nx = (Math.sin(S.rotY) * -fw + Math.cos(S.rotY) * st) / len;
    const nz = (Math.cos(S.rotY) * -fw + Math.sin(S.rotY) * -st) / len;
    if (fw || st || joy.active) {
      S.x = clamp(S.x + nx * speed * dt * Math.min(1, Math.hypot(fw, st) || 1), -108, 108);
      S.z = clamp(S.z + nz * speed * dt * Math.min(1, Math.hypot(fw, st) || 1), -108, 108);
      me.bob += dt * 10;
    }
    me.g.position.set(S.x, groundH(S.x, S.z) + Math.abs(Math.sin(me.bob)) * 0.08, S.z);
    me.g.rotation.y = S.rotY + Math.PI;
    // Kamera Third-Person (mit Kollisions-Schutz: nicht in Bäume/Häuser clippen)
    const cd = 6.5, ch = 3.2;
    tmpV.set(S.x + Math.sin(S.rotY) * cd, groundH(S.x, S.z) + ch - S.pitch * 4, S.z + Math.cos(S.rotY) * cd);
    const headPos = new THREE.Vector3(S.x, groundH(S.x, S.z) + 2, S.z);
    const camDir = tmpV.clone().sub(headPos);
    const camDist = camDir.length(); camDir.normalize();
    raycaster.set(headPos, camDir); raycaster.far = camDist;
    const hits = raycaster.intersectObjects(colliders, false);
    let want = tmpV.clone();
    if (hits.length) want = headPos.clone().add(camDir.multiplyScalar(Math.max(1.5, hits[0].distance - 0.6)));
    camera.position.lerp(want, 1 - Math.pow(0.001, dt));
    camera.lookAt(S.x, groundH(S.x, S.z) + 1.6, S.z);
    // Netz-Update 10Hz
    netT += dt;
    if (netT > 0.1) { netT = 0; send({ t: 'move', x: +S.x.toFixed(2), z: +S.z.toFixed(2), rot: +S.rotY.toFixed(2), hp: Math.round(S.hp), hunger: Math.round(S.hunger) }); }
    // HUD
    $('hp').style.width = S.hp + '%';
    $('hunger').style.width = S.hunger + '%';
    $('stamina').style.width = S.stamina + '%';
    $('lootBtn').classList.toggle('hidden', !nearestLoot());
    drawMinimap();
  }
  // Fremde Spieler interpolieren
  for (const o of S.players.values()) {
    if (!o.target) continue;
    o.g.position.lerp(tmpV.set(o.target.x, groundH(o.target.x, o.target.z), o.target.z), 0.2);
    o.g.rotation.y = (o.target.rotY || 0) + Math.PI;
  }
  // Zombies wackeln + laufen
  for (const o of S.zombies.values()) {
    if (!o.target) continue;
    o.bob += dt * 6;
    o.g.position.lerp(tmpV.set(o.target.x, groundH(o.target.x, o.target.z), o.target.z), 0.25);
    o.g.rotation.z = Math.sin(o.bob) * 0.12;
    o.g.position.y += Math.abs(Math.sin(o.bob)) * 0.05;
  }
  // Loot rotieren
  for (const m of lootMeshes.values()) m.rotation.y += dt;
  renderer.render(scene, camera);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ============ UI HELPER ============
let toastT;
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => el.style.opacity = 0, 1600); }
function feed(t) { const d = document.createElement('div'); d.textContent = t; $('killfeed').appendChild(d); setTimeout(() => d.remove(), 5000); }
function flashDmg() { const d = $('dmg'); d.style.boxShadow = 'inset 0 0 120px 60px rgba(255,0,0,.55)'; setTimeout(() => d.style.boxShadow = '', 250); }
function drawMinimap() {
  const c = $('minimap').getContext('2d');
  c.clearRect(0, 0, 120, 120);
  c.fillStyle = '#0d1f0d'; c.beginPath(); c.arc(60, 60, 58, 0, 9); c.fill();
  const dot = (x, z, col, r = 3) => {
    const dx = (x - S.x) * 0.5, dz = (z - S.z) * 0.5;
    if (dx * dx + dz * dz > 55 * 55) return;
    c.fillStyle = col; c.beginPath(); c.arc(60 + dx, 60 + dz, r, 0, 9); c.fill();
  };
  for (const m of lootMeshes.values()) dot(m.position.x, m.position.z, '#ffd24d', 2);
  for (const o of S.zombies.values()) dot(o.g.position.x, o.g.position.z, '#4dff4d', 3);
  for (const o of S.players.values()) dot(o.g.position.x, o.g.position.z, '#ff904d', 3);
  c.fillStyle = '#4da3ff'; c.beginPath(); c.arc(60, 60, 4, 0, 9); c.fill();
}
let AC;
function blip(f = 440) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = f; o.type = 'square';
    g.gain.setValueAtTime(0.08, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.12);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.12);
  } catch {}
}

init();
