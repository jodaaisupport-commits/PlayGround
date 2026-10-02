import * as THREE from 'three';

// ============ STELLAR EMPIRE — 3D Space Sandbox ============
const canvas = document.getElementById('scene');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch });
renderer.setPixelRatio(isTouch ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030612);
scene.fog = new THREE.FogExp2(0x030612, 0.00028);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.5, 12000);
camera.position.set(0, 30, 60);

scene.add(new THREE.AmbientLight(0x88aaff, 0.55));
const sunLight = new THREE.PointLight(0xfff2cc, 2.2, 0, 0);
scene.add(sunLight);

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const toast = (msg) => {
  const d = document.createElement('div');
  d.className = 'toast-msg'; d.textContent = msg;
  $('toast').appendChild(d); setTimeout(() => d.remove(), 3400);
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- audio (procedural) ----------
let audioOn = true, actx = null;
function beep(freq = 440, dur = 0.12, type = 'square', vol = 0.12) {
  if (!audioOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch {}
}

// ---------- starfield + nebula ----------
function makeStars() {
  const g = new THREE.BufferGeometry();
  const N = isTouch ? 1500 : 3500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = rand(2500, 6000), t = rand(0, Math.PI * 2), p = Math.acos(rand(-1, 1));
    pos[i * 3] = r * Math.sin(p) * Math.cos(t); pos[i * 3 + 1] = r * Math.cos(p); pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    const c = new THREE.Color().setHSL(rand(0, 1), 0.7, rand(0.5, 1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 14, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9 })));
}
makeStars();

// sun
const sun = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd27a }));
scene.add(sun);
const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(115, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.22 }));
scene.add(sunGlow);

// ---------- planets ----------
const PLANETS = [
  { name: 'Aurea', color: 0x4dc3ff, size: 34, dist: 420, speed: 0.008, desc: 'Ozeanwelt — ideal für Kolonien. Hohe Bevölkerung.', bonus: 'pop' },
  { name: 'Crimson', color: 0xff5d5d, size: 26, dist: 640, speed: 0.006, desc: 'Vulkanwelt — reich an Metall, viel Energie nötig.', bonus: 'metal' },
  { name: 'Verdant', color: 0x59ff8a, size: 30, dist: 880, speed: 0.0045, desc: 'Dschungelwelt — ausgeglichen, gute Forschung.', bonus: 'sci' },
  { name: 'Dune', color: 0xffcf6e, size: 22, dist: 1120, speed: 0.0035, desc: 'Wüstenwelt — billige Kolonie, Handelsbonus.', bonus: 'credits' },
  { name: 'Frost', color: 0xbfe9ff, size: 28, dist: 1380, speed: 0.0028, desc: 'Eiswelt am Rand — langsam, aber riesige Erträge.', bonus: 'all' },
];
const planetObjs = [];
PLANETS.forEach((p, i) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 40, 40),
    new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85, metalness: 0.08 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(p.size + 3, p.size + 4, 64),
    new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2; mesh.add(ring);
  // orbit line
  const og = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 128 }, (_, k) => new THREE.Vector3(Math.cos(k / 128 * Math.PI * 2) * p.dist, 0, Math.sin(k / 128 * Math.PI * 2) * p.dist)));
  scene.add(new THREE.LineLoop(og, new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.7 })));
  mesh.userData = { kind: 'planet', idx: i, ...p, angle: rand(0, 6.28), colonized: false, level: 0 };
  scene.add(mesh); planetObjs.push(mesh);
  // label sprite
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#dff3ff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillText(p.name, 128, 42);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(90, 22, 1); sp.position.y = p.size + 22; mesh.add(sp);
});

// ---------- asteroid belt ----------
const asteroids = [];
const astGeo = new THREE.DodecahedronGeometry(4, 0);
const astMat = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1, flatShading: true });
for (let i = 0; i < 190; i++) {
  const m = new THREE.Mesh(astGeo, astMat.clone());
  m.material.color.offsetHSL(rand(-0.03, 0.03), 0, rand(-0.08, 0.08));
  const a = rand(0, Math.PI * 2), r = rand(480, 780), s = rand(1.5, 7);
  m.position.set(Math.cos(a) * r, rand(-35, 35), Math.sin(a) * r);
  m.scale.setScalar(s);
  m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  m.userData = { kind: 'asteroid', hp: Math.round(s * 6), metal: Math.round(s * 4), spin: rand(-1, 1) };
  scene.add(m); asteroids.push(m);
}
// belt marker
const beltRing = new THREE.Mesh(new THREE.TorusGeometry(630, 3, 8, 128),
  new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.25 }));
beltRing.rotation.x = Math.PI / 2; scene.add(beltRing);

// ---------- player ship ----------
function buildShip(color = 0x38e1ff) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.ConeGeometry(3, 10, 6), new THREE.MeshStandardMaterial({ color: 0xdfefff, metalness: 0.7, roughness: 0.3 }));
  hull.rotation.x = Math.PI / 2; g.add(hull);
  const wingMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4, emissive: color, emissiveIntensity: 0.35 });
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 3), wingMat); w1.position.z = 1.5; g.add(w1);
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10), new THREE.MeshBasicMaterial({ color })); e1.position.set(-6, 0, 1.5); g.add(e1);
  const e2 = e1.clone(); e2.position.x = 6; g.add(e2);
  const eng = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 8), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.9 }));
  eng.rotation.x = -Math.PI / 2; eng.position.z = 5.4; eng.name = 'engine'; g.add(eng);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(7.5, 18, 18), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.13 }));
  shield.name = 'shield'; g.add(shield);
  return g;
}
const ship = buildShip(); ship.position.set(0, 40, 560); scene.add(ship);

// ---------- state ----------
const S = {
  credits: 120, metal: 90, energy: 60, energyCap: 100, pop: 0, sci: 0,
  hull: 100, shield: 100, rank: 1, colonies: 0,
  minedTotal: 0, kills: 0, built: { miner: 0, solar: 0, shipyard: 0 },
  time: 0, autopilot: null, camMode: 0, selected: null, started: false,
};
const CAMS = ['Follow', 'Frei', 'Orbit'];

// ---------- stations / fleets ----------
const stations = [], fighters = [], pirates = [], lasers = [], particles = [];
const stationColors = { miner: 0xff9a3c, solar: 0x38e1ff, shipyard: 0xb98bff };

function stationMesh(type) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.OctahedronGeometry(type === 'shipyard' ? 9 : 6, 0),
    new THREE.MeshStandardMaterial({ color: stationColors[type], metalness: 0.6, roughness: 0.35, emissive: stationColors[type], emissiveIntensity: 0.25 }));
  g.add(base);
  if (type === 'solar') {
    for (let i = -1; i <= 1; i += 2) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 5), new THREE.MeshStandardMaterial({ color: 0x123a6e, emissive: 0x38e1ff, emissiveIntensity: 0.5 }));
      p.position.x = i * 8; g.add(p);
    }
  }
  if (type === 'miner') {
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(1, 2.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffd27a }));
    drill.position.y = -7; g.add(drill);
  }
  const light = new THREE.PointLight(stationColors[type], 1.2, 60); g.add(light);
  return g;
}

const BUILDINGS = [
  { id: 'miner', key: '1', name: '⛏ Bergbau-Station', cost: { metal: 80 }, desc: '+2 Metall/s nahe Asteroiden, +1 ⚡-Verbrauch. Verteidige sie!' },
  { id: 'solar', key: '2', name: '🔆 Solar-Kraftwerk', cost: { metal: 60 }, desc: '+40 Energie-Cap, +3 Energie/s. Basis jeder Expansion.' },
  { id: 'shipyard', key: '3', name: '🏗 Werft', cost: { metal: 180, energy: 20 }, desc: 'Schaltet Jäger (Taste 5) frei. Repariert Hülle langsam.' },
  { id: 'colony', key: '4', name: '🌍 Kolonie-Modul', cost: { metal: 150, energy: 30 }, desc: 'Planet anklicken → gründen. Gibt Credits, Bevölk., Forschung.' },
  { id: 'fighter', key: '5', name: '🛸 Jäger bauen', cost: { metal: 100, energy: 15 }, desc: 'Braucht Werft. Patrouilliert & greift Piraten an.' },
  { id: 'repair', key: '6', name: '🔧 Voll-Reparatur', cost: { credits: 50 }, desc: 'Hülle + Schild sofort auf 100%.' },
];

function canAfford(cost) {
  return Object.entries(cost).every(([k, v]) => (S[k === 'credits' ? 'credits' : k] ?? 0) >= v);
}
function pay(cost) { for (const [k, v] of Object.entries(cost)) S[k] -= v; }

function buildAt(type, pos) {
  const def = BUILDINGS.find(b => b.id === type);
  if (type === 'repair') {
    if (!canAfford(def.cost)) return toast('Nicht genug Credits für Reparatur!');
    pay(def.cost); S.hull = 100; S.shield = 100; beep(660, 0.2, 'sine'); return toast('🔧 Schiff voll repariert!');
  }
  if (type === 'fighter') {
    if (!stations.some(s => s.userData.type === 'shipyard')) return toast('Brauche zuerst eine Werft (Taste 3)!');
    if (!canAfford(def.cost)) return toast('Nicht genug Ressourcen für Jäger!');
    pay(def.cost);
    const f = buildShip(0x5dff9d); f.position.copy(ship.position).add(new THREE.Vector3(rand(-15, 15), rand(0, 8), rand(-15, 15)));
    f.userData = { kind: 'fighter', hp: 60, cooldown: 0 };
    scene.add(f); fighters.push(f); beep(520, 0.15); return toast('🛸 Jäger gestartet — patrouilliert jetzt!');
  }
  if (type === 'colony') return toast('🌍 Wähle einen Planeten per Klick → „Kolonie gründen“');
  if (!canAfford(def.cost)) return toast(`Nicht genug Ressourcen für ${def.name}!`);
  pay(def.cost);
  const g = stationMesh(type);
  g.position.copy(pos);
  g.userData = { kind: 'station', type, hp: 150, tick: 0 };
  scene.add(g); stations.push(g);
  S.built[type] = (S.built[type] || 0) + 1;
  beep(440, 0.2, 'triangle'); toast(`${def.name} errichtet!`);
  checkMissions();
}

// render build menu
function renderBuild() {
  $('build-list').innerHTML = '';
  BUILDINGS.forEach(b => {
    const d = document.createElement('div'); d.className = 'build-item';
    const cost = Object.entries(b.cost).map(([k, v]) => `${v} ${k === 'metal' ? 'Metall' : k === 'energy' ? '⚡' : 'Credits'}`).join(' + ');
    d.innerHTML = `<b>[${b.key}] ${b.name}</b><span class="cost">${cost}</span><small>${b.desc}</small>`;
    const btn = document.createElement('button'); btn.textContent = 'Bauen';
    btn.onclick = () => {
      const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
      buildAt(b.id, ship.position.clone().add(ahead.multiplyScalar(28)).add(new THREE.Vector3(0, 4, 0)));
    };
    d.appendChild(btn); $('build-list').appendChild(d);
  });
}
renderBuild();

// ---------- missions ----------
const MISSIONS = [
  { id: 'mine', text: 'Baue 40 Metall ab (Laser auf Asteroiden)', done: () => S.minedTotal >= 40 },
  { id: 'miner', text: 'Errichte 1 Bergbau-Station [1]', done: () => S.built.miner >= 1 },
  { id: 'colony', text: 'Gründe 1 Kolonie (Planet anklicken)', done: () => S.colonies >= 1 },
  { id: 'pirates', text: 'Zerstöre 3 Piraten', done: () => S.kills >= 3 },
  { id: 'empire', text: 'Erreiche 600 Credits Imperiums-Wert', done: () => S.credits >= 600 },
];
let missionsDone = new Set();
function checkMissions() {
  const el = $('missions'); el.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const done = m.done();
    if (done && !missionsDone.has(m.id)) { missionsDone.add(m.id); toast(`✅ Mission geschafft: ${m.text}`); beep(880, 0.3, 'sine'); S.credits += 60; S.sci += 5; }
    const active = !done && (i === 0 || MISSIONS[i - 1].done());
    const d = document.createElement('div');
    d.className = done ? 'done' : (active ? 'active' : '');
    d.textContent = (done ? '✔ ' : '○ ') + m.text;
    el.appendChild(d);
  });
}

// ---------- lasers / combat ----------
const laserGeo = new THREE.BoxGeometry(0.4, 0.4, 8);
function shoot(from, dir, friendly = true, power = 12) {
  const m = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: friendly ? 0x38e1ff : 0xff5470 }));
  m.position.copy(from); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  scene.add(m); lasers.push({ mesh: m, vel: dir.clone().normalize().multiplyScalar(320), life: 1.6, friendly, power });
  beep(friendly ? 900 : 220, 0.07, 'sawtooth', 0.06);
}
function explode(pos, color = 0xff9a3c, n = 16) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rand(0.5, 1.6), 6, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos);
    scene.add(m);
    particles.push({ mesh: m, vel: new THREE.Vector3(rand(-40, 40), rand(-40, 40), rand(-40, 40)), life: rand(0.4, 1) });
  }
  beep(120, 0.3, 'sawtooth', 0.15);
}

// pirates
function spawnPirate() {
  if (pirates.length >= 2 + S.rank) return;
  const g = buildShip(0xff5470);
  const a = rand(0, Math.PI * 2);
  g.position.set(Math.cos(a) * rand(500, 900), rand(-40, 40), Math.sin(a) * rand(500, 900));
  g.userData = { kind: 'pirate', hp: 50 + S.rank * 15, cooldown: rand(1, 2) };
  scene.add(g); pirates.push(g);
  toast('☠ Piraten-Angriff erkannt! Verteidige dein Imperium!');
}
setInterval(() => { if (S.started && (stations.length > 0 || S.colonies > 0)) spawnPirate(); }, 22000);

// ---------- selection ----------
const ray = new THREE.Raycaster();
function select(obj) {
  S.selected = obj;
  if (!obj) { $('selection').classList.add('hidden'); return; }
  const u = obj.userData;
  $('selection').classList.remove('hidden');
  if (isTouch) { $('build-menu').classList.add('hidden-mobile'); const tb = $('tab-build'); if (tb) tb.classList.remove('active'); }
  const acts = $('sel-actions'); acts.innerHTML = '';
  $('sel-stats').innerHTML = '';
  const stat = (k, v) => $('sel-stats').innerHTML += `<div><b>${k}</b><br>${v}</div>`;
  if (u.kind === 'planet') {
    $('sel-title').textContent = `🌍 ${u.name}`;
    $('sel-desc').textContent = u.desc + (u.colonized ? ` — Kolonie Stufe ${u.level}` : ' — unbesiedelt');
    stat('Status', u.colonized ? `Kolonie St.${u.level}` : 'Unbesiedelt');
    stat('Bonus', u.bonus); stat('Distanz', Math.round(obj.position.distanceTo(ship.position)) + ' m');
    if (!u.colonized) {
      const b = document.createElement('button'); b.textContent = '🌍 Kolonie gründen (150 Metall + 30⚡)';
      b.onclick = () => {
        if (!canAfford({ metal: 150, energy: 30 })) return toast('Nicht genug Ressourcen!');
        if (obj.position.distanceTo(ship.position) > 120) return toast('Zu weit weg — fliege näher an den Planeten!');
        pay({ metal: 150, energy: 30 }); u.colonized = true; u.level = 1; S.colonies++;
        S.rank = 1 + Math.floor(S.colonies / 2) + Math.floor(stations.length / 4);
        toast(`🌍 Kolonie auf ${u.name} gegründet!`); beep(700, 0.3, 'sine'); checkMissions(); rankCheck();
      };
      acts.appendChild(b);
    } else {
      const b = document.createElement('button'); b.textContent = `⬆ Upgrade auf St.${u.level + 1} (${u.level * 100} Metall)`;
      b.onclick = () => {
        const c = u.level * 100;
        if (S.metal < c) return toast('Nicht genug Metall!');
        S.metal -= c; u.level++; toast(`${u.name} → Stufe ${u.level}! Produktion steigt.`); beep(760, 0.2);
      };
      acts.appendChild(b);
    }
    const t = document.createElement('button'); t.textContent = '🧭 Autopilot hierher';
    t.onclick = () => { S.autopilot = obj.position.clone(); $('btn-autopilot').textContent = 'Autopilot: AN'; toast('Autopilot aktiv — [X] zum Abbrechen'); };
    acts.appendChild(t);
  } else if (u.kind === 'station') {
    $('sel-title').textContent = `🛰 ${u.type === 'miner' ? 'Bergbau-Station' : u.type === 'solar' ? 'Solar-Kraftwerk' : 'Werft'}`;
    $('sel-desc').textContent = `Hülle: ${Math.round(u.hp)} — arbeitet für dein Imperium.`;
    stat('Typ', u.type); stat('Hülle', Math.round(u.hp));
    const r = document.createElement('button'); r.textContent = 'Reparieren (30 Metall)';
    r.onclick = () => { if (S.metal < 30) return toast('Nicht genug Metall!'); S.metal -= 30; u.hp = 150; toast('Station repariert!'); };
    acts.appendChild(r);
    const x = document.createElement('button'); x.textContent = 'Abreißen (+40 Metall)';
    x.onclick = () => { scene.remove(obj); stations.splice(stations.indexOf(obj), 1); S.metal += 40; select(null); toast('Station abgerissen.'); };
    acts.appendChild(x);
  } else if (u.kind === 'asteroid') {
    $('sel-title').textContent = '🪨 Asteroid';
    $('sel-desc').textContent = `Enthält ${u.metal} Metall. Zerschieße ihn mit Laser!`;
    stat('Metall', u.metal); stat('HP', u.hp);
    const b = document.createElement('button'); b.textContent = '🧭 Autopilot zum Abbauen';
    b.onclick = () => { S.autopilot = obj.position.clone(); $('btn-autopilot').textContent = 'Autopilot: AN'; };
    acts.appendChild(b);
  }
}

function rankCheck() {
  const newRank = 1 + Math.floor(S.colonies / 2) + Math.floor((S.built.miner + S.built.solar + S.built.shipyard) / 3);
  if (newRank > S.rank) {
    S.rank = newRank;
    $('victory').classList.remove('hidden');
    $('victory-text').textContent = `Dein Imperium erreicht Rang ${S.rank}! Bonus: +150 Credits, +50 Metall.`;
    S.credits += 150; S.metal += 50; beep(990, 0.5, 'sine');
  }
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  if (e.key === ' ') e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  const map = { 1: 'miner', 2: 'solar', 3: 'shipyard', 4: 'colony', 5: 'fighter', 6: 'repair' };
  if (map[e.key] && S.started) {
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
    buildAt(map[e.key], ship.position.clone().add(ahead.multiplyScalar(28)).add(new THREE.Vector3(0, 4, 0)));
  }
  if (e.key.toLowerCase() === 'c') { S.camMode = (S.camMode + 1) % 3; $('btn-cam').textContent = 'Kamera: ' + CAMS[S.camMode]; }
  if (e.key.toLowerCase() === 'e' && !e.repeat) scanPulse();
  if (e.key.toLowerCase() === 't' && !e.repeat) scanPulse();
  if (e.key.toLowerCase() === 'x') { S.autopilot = null; $('btn-autopilot').textContent = 'Autopilot: AUS'; }
  if (e.key.toLowerCase() === 'b') $('build-menu').classList.toggle('hidden');
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// ---------- touch state (Mobil) ----------
const touch = { thrust: 0, turn: 0, up: 0, boost: false, fire: false, jx: 0, jy: 0 };
function showTouchUI() { if (isTouch) { $('touch-ui').classList.remove('hidden'); $('mobile-tabs').classList.remove('hidden'); } }
function closeSheets() { $('build-menu').classList.add('hidden-mobile'); $('selection').classList.add('hidden'); const tb = $('tab-build'); if (tb) tb.classList.remove('active'); }

// mouse: drag look + click select/shoot
let dragging = false, rdrag = false, lx = 0, ly = 0, moved = 0, yaw = 0, pitch = -0.15, camDist = 58;
canvas.addEventListener('mousedown', e => { if (e.button === 2) rdrag = true; else dragging = true; lx = e.clientX; ly = e.clientY; moved = 0; });
addEventListener('mouseup', e => {
  if (moved < 6 && S.started && e.target === canvas) {
    // click: shoot + select
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [...planetObjs, ...asteroids, ...stations, ...pirates];
    const hit = ray.intersectObjects(targets, true)[0];
    let root = hit ? hit.object : null;
    while (root && root.parent && root.parent !== scene) root = root.parent;
    if (root && root.userData && root.userData.kind) select(root); else select(null);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
    shoot(ship.position.clone().add(dir.clone().multiplyScalar(10)), dir, true, 12);
  }
  dragging = rdrag = false;
});
addEventListener('mousemove', e => {
  if (!dragging && !rdrag) return;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  moved += Math.abs(dx) + Math.abs(dy); lx = e.clientX; ly = e.clientY;
  yaw -= dx * 0.004; pitch = clamp(pitch - dy * 0.003, -1.2, 1.2);
});
addEventListener('wheel', e => camDist = clamp(camDist + e.deltaY * 0.03, 15, 160));
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- touch controls (Mobil): joystick + buttons + tap/pinch ----------
(function initTouch() {
  const joy = document.getElementById('joystick'), stick = document.getElementById('stick');
  if (!joy) return;
  let joyId = null;
  const setStick = (dx, dy) => { stick.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; };
  joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); touchMove(e); e.preventDefault(); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) touchMove(e); });
  const endJoy = e => { if (e.pointerId === joyId) { joyId = null; touch.jx = touch.jy = 0; touch.thrust = touch.turn = 0; setStick(0, 0); } };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  function touchMove(e) {
    const r = joy.getBoundingClientRect();
    let dx = ((e.clientX - r.left) / r.width) * 2 - 1;
    let dy = ((e.clientY - r.top) / r.height) * 2 - 1;
    const len = Math.hypot(dx, dy) || 1;
    if (len > 1) { dx /= len; dy /= len; }
    touch.jx = dx; touch.jy = dy;
    touch.thrust = clamp(-dy, -1, 1);   // hoch = vorwärts
    touch.turn = clamp(-dx, -1, 1);     // links/rechts drehen
    setStick(dx, dy);
  }
  const hold = (id, on, off) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('active'); on(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { el.classList.remove('active'); off && off(); }));
  };
  hold('t-fire', () => touch.fire = true, () => touch.fire = false);
  hold('t-boost', () => touch.boost = true, () => touch.boost = false);
  hold('t-up', () => touch.up = 1, () => touch.up = 0);
  hold('t-down', () => touch.up = -1, () => touch.up = 0);

  // canvas: 1-Finger drag = umsehen, tap = auswählen+schießen, 2-Finger pinch = zoom
  let lastTap = 0, pinchD = 0, lookId = null, slx = 0, sly = 0, smoved = 0;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    else { lookId = e.touches[0].identifier; slx = e.touches[0].clientX; sly = e.touches[0].clientY; smoved = 0; }
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinchD > 0) camDist = clamp(camDist - (d - pinchD) * 0.25, 18, 200);
      pinchD = d; e.preventDefault(); return;
    }
    for (const t of e.touches) {
      if (t.identifier !== lookId) continue;
      const dx = t.clientX - slx, dy = t.clientY - sly;
      smoved += Math.abs(dx) + Math.abs(dy); slx = t.clientX; sly = t.clientY;
      yaw -= dx * 0.006; pitch = clamp(pitch - dy * 0.004, -1.2, 1.2);
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    if (smoved < 12 && e.touches.length === 0 && S.started) {
      const now = performance.now();
      const t = e.changedTouches[0];
      handleTap(t.clientX, t.clientY);
      lastTap = now;
    }
    lookId = null; pinchD = 0;
  });
  function handleTap(x, y) {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [...planetObjs, ...asteroids, ...stations, ...pirates];
    const hit = ray.intersectObjects(targets, true)[0];
    let root = hit ? hit.object : null;
    while (root && root.parent && root.parent !== scene) root = root.parent;
    if (root && root.userData && root.userData.kind) select(root); else select(null);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
    shoot(ship.position.clone().add(dir.clone().multiplyScalar(10)), dir, true, 12);
  }
})();

// buttons
$('btn-start').onclick = () => { S.started = true; $('start-overlay').classList.add('hidden'); showTouchUI(); toast('Willkommen, Commander! Zerschieße Asteroiden für Metall ⛏'); beep(600, 0.3, 'sine'); checkMissions(); };
$('btn-help').onclick = () => $('help-overlay').classList.remove('hidden');
$('btn-help-close').onclick = () => $('help-overlay').classList.add('hidden');
$('btn-victory-close').onclick = () => $('victory').classList.add('hidden');
$('btn-sound').onclick = e => { audioOn = !audioOn; e.target.textContent = audioOn ? '🔊' : '🔇'; };
$('btn-cam').onclick = e => { S.camMode = (S.camMode + 1) % 3; e.target.textContent = 'Kamera: ' + CAMS[S.camMode]; };
$('btn-autopilot').onclick = e => { S.autopilot = null; e.target.textContent = 'Autopilot: AUS'; toast('Autopilot aus.'); };
$('btn-scan').onclick = () => scanPulse();
$('btn-save').onclick = () => { save(); toast('💾 Spielstand gespeichert!'); };
$('sel-close').onclick = () => select(null);
if (isTouch) { $('btn-cam').textContent = 'Kamera: Follow'; }
const _tMenu = document.getElementById('t-menu'); if (_tMenu) _tMenu.onclick = () => $('build-menu').classList.toggle('hidden-mobile');
if (isTouch) $('build-menu').classList.add('hidden-mobile');
const _tScan = document.getElementById('t-scan'); if (_tScan) _tScan.onclick = () => scanPulse();
const _tCam = document.getElementById('t-cam'); if (_tCam) _tCam.onclick = () => { S.camMode = (S.camMode + 1) % 3; $('btn-cam').textContent = 'Kamera: ' + CAMS[S.camMode]; };
// Mobile Bottom-Tabs
const _tabBuild = document.getElementById('tab-build');
if (_tabBuild) _tabBuild.onclick = () => {
  const m = $('build-menu'); m.classList.toggle('hidden-mobile');
  _tabBuild.classList.toggle('active', !m.classList.contains('hidden-mobile'));
  if (!m.classList.contains('hidden-mobile')) $('selection').classList.add('hidden');
};
const _tabScan = document.getElementById('tab-scan'); if (_tabScan) _tabScan.onclick = () => scanPulse();
const _tabCam = document.getElementById('tab-cam');
if (_tabCam) _tabCam.onclick = () => { S.camMode = (S.camMode + 1) % 3; $('btn-cam').textContent = 'Kamera: ' + CAMS[S.camMode]; toast('🎥 Kamera: ' + CAMS[S.camMode]); };
const _tabClose = document.getElementById('tab-close'); if (_tabClose) _tabClose.onclick = () => closeSheets();
// Autosave, wenn die App in den Hintergrund geht (Mobil-Tabwechsel)
document.addEventListener('visibilitychange', () => { if (document.hidden && S.started) save(); });
if (localStorage.getItem('stellar-empire-v1')) $('btn-continue').classList.remove('hidden');
$('btn-continue').onclick = () => { load(); S.started = true; $('start-overlay').classList.add('hidden'); showTouchUI(); toast('Spielstand geladen!'); };

function scanPulse() {
  beep(300, 0.4, 'sine', 0.15);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 1, 8, 64), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.9 }));
  ring.position.copy(ship.position); ring.rotation.x = Math.PI / 2; scene.add(ring);
  particles.push({ mesh: ring, vel: new THREE.Vector3(), life: 1.2, grow: 400 });
  let info = `Scan: ${stations.length} Stationen, ${S.colonies} Kolonien, ${pirates.length} Piraten in der Nähe.`;
  toast('📡 ' + info);
}

// ---------- save/load ----------
function save() {
  localStorage.setItem('stellar-empire-v1', JSON.stringify({
    S: { ...S, selected: null, autopilot: null }, colonies: planetObjs.map(p => ({ colonized: p.userData.colonized, level: p.userData.level })),
    stations: stations.map(s => ({ type: s.userData.type, pos: s.position.toArray(), hp: s.userData.hp }))
  }));
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('stellar-empire-v1'));
    Object.assign(S, d.S);
    d.colonies.forEach((c, i) => Object.assign(planetObjs[i].userData, c));
    d.stations.forEach(st => {
      const g = stationMesh(st.type); g.position.fromArray(st.pos); g.userData.hp = st.hp; g.userData.type = st.type; g.userData.kind = 'station';
      scene.add(g); stations.push(g);
    });
  } catch {}
}
setInterval(() => { if (S.started) save(); }, 30000);

// ---------- economy tick ----------
setInterval(() => {
  if (!S.started) return;
  S.time++;
  let metalRate = 0, energyRate = 0, creditRate = 0;
  stations.forEach(st => {
    if (st.userData.type === 'miner') {
      const near = asteroids.some(a => a.position.distanceTo(st.position) < 160);
      metalRate += near ? 2 : 0.5; creditRate += 0.4; energyRate -= 0.3;
    }
    if (st.userData.type === 'solar') { energyRate += 3; }
    if (st.userData.type === 'shipyard') { energyRate -= 0.5; if (S.hull < 100) S.hull = Math.min(100, S.hull + 1); }
  });
  planetObjs.forEach(p => {
    if (!p.userData.colonized) return;
    const l = p.userData.level;
    creditRate += l * (p.userData.bonus === 'credits' ? 2 : 1.2);
    metalRate += l * (p.userData.bonus === 'metal' ? 1 : 0.3);
    energyRate -= l * 0.2;
    S.pop += l * 1; S.sci += l * (p.userData.bonus === 'sci' ? 0.6 : 0.25);
  });
  // trade routes between colonies
  if (S.colonies >= 2) creditRate += S.colonies * 0.8;
  S.metal = Math.max(0, S.metal + metalRate);
  S.energy = clamp(S.energy + energyRate, 0, S.energyCap + stations.filter(s => s.userData.type === 'solar').length * 40);
  S.credits = Math.max(0, S.credits + creditRate);
  if (S.shield < 100) S.shield = Math.min(100, S.shield + 2);
  S.energyCap = 100 + stations.filter(s => s.userData.type === 'solar').length * 40;
  if (S.energy <= 0 && stations.length > 0) toast('⚠ Energie-Mangel! Baue Solar-Kraftwerke [2]');
  checkMissions();
}, 1000);

// ---------- HUD ----------
function hud() {
  $('r-credits').textContent = Math.floor(S.credits);
  $('r-metal').textContent = Math.floor(S.metal);
  $('r-energy').textContent = `${Math.floor(S.energy)}/${S.energyCap}`;
  $('r-pop').textContent = Math.floor(S.pop);
  $('r-sci').textContent = Math.floor(S.sci);
  $('r-empire').textContent = 'Rang ' + S.rank;
  $('r-colonies').textContent = `${S.colonies} Kolonien · ${stations.length} Stationen`;
  $('bar-hull').style.width = S.hull + '%';
  $('bar-shield').style.width = S.shield + '%';
  const sp = $('speed'); if (sp && typeof vel !== 'undefined') sp.textContent = Math.round(vel.length() * 3.6) + ' km/h';
}

// ---------- minimap ----------
const mm = $('minimap').getContext('2d');
function drawMap() {
  mm.clearRect(0, 0, 180, 180);
  mm.fillStyle = 'rgba(3,8,18,.9)'; mm.fillRect(0, 0, 180, 180);
  const w = p => 90 + p.x / 1500 * 90;
  const h = p => 90 + p.z / 1500 * 90;
  mm.fillStyle = '#ffd27a'; mm.beginPath(); mm.arc(90, 90, 5, 0, 7); mm.fill();
  planetObjs.forEach(p => { mm.fillStyle = p.userData.colonized ? '#5dff9d' : '#4dc3ff'; mm.beginPath(); mm.arc(w(p.position), h(p.position), 4, 0, 7); mm.fill(); });
  mm.fillStyle = '#ff9a3c'; stations.forEach(s => mm.fillRect(w(s.position) - 2, h(s.position) - 2, 4, 4));
  mm.fillStyle = '#ff5470'; pirates.forEach(p => { mm.beginPath(); mm.arc(w(p.position), h(p.position), 3, 0, 7); mm.fill(); });
  mm.fillStyle = '#fff'; mm.beginPath(); mm.arc(w(ship.position), h(ship.position), 3, 0, 7); mm.fill();
  mm.strokeStyle = 'rgba(56,225,255,.4)'; mm.strokeRect(1, 1, 178, 178);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
const vel = new THREE.Vector3();
let fireCd = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;

  // planets orbit
  planetObjs.forEach(p => {
    p.userData.angle += p.userData.speed * dt;
    p.position.set(Math.cos(p.userData.angle) * p.userData.dist, 0, Math.sin(p.userData.angle) * p.userData.dist);
    p.rotation.y += dt * 0.05;
  });
  asteroids.forEach(a => { a.rotation.x += a.userData.spin * dt; a.rotation.y += a.userData.spin * 0.7 * dt; });
  sun.rotation.y += dt * 0.02; sunGlow.material.opacity = 0.2 + Math.sin(S.time * 2) * 0.04;

  if (S.started) {
    // --- flight (Desktop + Touch) ---
    const boost = (keys['shift'] || touch.boost) ? 3 : 1;
    const thrust = 60 * boost, rot = 1.8 * dt;
    if (S.autopilot) {
      const d = S.autopilot.clone().sub(ship.position);
      if (d.length() < 25) { S.autopilot = null; $('btn-autopilot').textContent = 'Autopilot: AUS'; toast('🧭 Ziel erreicht.'); }
      else {
        const target = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().normalize());
        ship.quaternion.slerp(target, 2 * dt);
        vel.add(new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).multiplyScalar(thrust * dt));
      }
    } else {
      if (keys['w']) vel.add(new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).multiplyScalar(thrust * dt));
      if (keys['s']) vel.add(new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion).multiplyScalar(thrust * 0.6 * dt));
      if (keys['a']) ship.rotateY(rot); if (keys['d']) ship.rotateY(-rot);
      if (keys['q'] || keys['r']) vel.y += thrust * 0.9 * dt;
      if (keys['f']) vel.y -= thrust * 0.9 * dt;
      // Mobil: Joystick (hoch = Schub, seitlich = Drehen), ▲/▼ Höhe
      if (Math.abs(touch.thrust) > 0.12) vel.add(new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion).multiplyScalar(touch.thrust * thrust * dt));
      if (Math.abs(touch.turn) > 0.12) ship.rotateY(touch.turn * rot);
      if (touch.up !== 0) vel.y += touch.up * thrust * 0.9 * dt;
    }
    // Q hoch, F runter (E = Scan-Puls, kein Halten)
    vel.multiplyScalar(1 - 0.9 * dt);
    vel.clampLength(0, 40 * boost + 30);
    ship.position.add(vel.clone().multiplyScalar(dt));
    ship.position.y = clamp(ship.position.y, -200, 200);
    const distC = ship.position.length();
    if (distC > 2200) ship.position.multiplyScalar(2200 / distC);
    ship.getObjectByName('engine').scale.setScalar(1 + vel.length() / 60 + Math.random() * 0.15);

    fireCd -= dt;
    if ((keys[' '] || touch.fire || dragging && moved > 6) && fireCd <= 0) {
      fireCd = 0.16;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
      shoot(ship.position.clone().add(dir.clone().multiplyScalar(10)), dir, true, 12);
    }

    // --- lasers ---
    for (let i = lasers.length - 1; i >= 0; i--) {
      const L = lasers[i];
      L.mesh.position.add(L.vel.clone().multiplyScalar(dt));
      L.life -= dt;
      let dead = L.life <= 0;
      if (!dead) {
        if (L.friendly) {
          for (const a of asteroids) {
            if (L.mesh.position.distanceTo(a.position) < 6 + a.scale.x) {
              a.userData.hp -= L.power; dead = true;
              if (a.userData.hp <= 0) {
                explode(a.position, 0xff9a3c); scene.remove(a); asteroids.splice(asteroids.indexOf(a), 1);
                const gain = a.userData.metal;
                S.metal += gain; S.minedTotal += gain; S.credits += 4;
                toast(`⛏ +${gain} Metall`);
              }
              break;
            }
          }
          if (!dead) for (const p of pirates) {
            if (L.mesh.position.distanceTo(p.position) < 8) {
              p.userData.hp -= L.power; dead = true;
              if (p.userData.hp <= 0) {
                explode(p.position, 0xff5470, 24); scene.remove(p); pirates.splice(pirates.indexOf(p), 1);
                S.kills++; S.credits += 80; S.sci += 8;
                toast(`☠ Pirat zerstört! +80 Credits (${S.kills} Kills)`); checkMissions();
              }
              break;
            }
          }
        } else {
          if (L.mesh.position.distanceTo(ship.position) < 8) {
            dead = true;
            if (S.shield > 0) S.shield = Math.max(0, S.shield - L.power);
            else S.hull = Math.max(0, S.hull - L.power);
            if (S.hull <= 0) { explode(ship.position, 0x38e1ff, 30); S.hull = 100; S.shield = 50; S.credits = Math.max(0, S.credits - 100); ship.position.set(0, 40, 560); vel.set(0, 0, 0); toast('💥 Schiff zerstört — neu gespawnt (-100 Credits)'); }
          }
          for (const st of stations) {
            if (L.mesh.position.distanceTo(st.position) < 9) {
              st.userData.hp -= L.power; dead = true;
              if (st.userData.hp <= 0) { explode(st.position); scene.remove(st); stations.splice(stations.indexOf(st), 1); toast('🛰 Station zerstört!'); }
              break;
            }
          }
        }
      }
      if (dead) { scene.remove(L.mesh); lasers.splice(i, 1); }
    }

    // --- pirates AI ---
    pirates.forEach(p => {
      p.userData.cooldown -= dt;
      const target = stations.length ? stations.reduce((a, b) => a.position.distanceTo(p.position) < b.position.distanceTo(p.position) ? a : b).position : ship.position;
      const d = target.clone().sub(p.position);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().normalize());
      p.quaternion.slerp(q, 1.2 * dt);
      p.position.add(d.clone().normalize().multiplyScalar(dt * (22 + S.rank * 2)));
      if (d.length() < 130 && p.userData.cooldown <= 0) {
        p.userData.cooldown = 1.4;
        shoot(p.position.clone(), d.clone().normalize(), false, 8);
      }
    });
    // --- fighters AI ---
    fighters.forEach(f => {
      f.userData.cooldown -= dt;
      const foe = pirates.sort((a, b) => a.position.distanceTo(f.position) - b.position.distanceTo(f.position))[0];
      const dest = foe ? foe.position : ship.position.clone().add(new THREE.Vector3(20, 8, 20));
      const d = dest.clone().sub(f.position);
      if (d.length() > 12) {
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().normalize());
        f.quaternion.slerp(q, 2 * dt);
        f.position.add(d.clone().normalize().multiplyScalar(dt * 45));
      }
      if (foe && f.position.distanceTo(foe.position) < 120 && f.userData.cooldown <= 0) {
        f.userData.cooldown = 0.8;
        shoot(f.position.clone(), foe.position.clone().sub(f.position).normalize(), true, 8);
      }
    });

    // --- particles ---
    for (let i = particles.length - 1; i >= 0; i--) {
      const P = particles[i];
      P.mesh.position.add((P.vel || new THREE.Vector3()).clone().multiplyScalar(dt));
      if (P.grow) P.mesh.scale.multiplyScalar(1 + dt * 6);
      P.life -= dt;
      if (P.life <= 0) { scene.remove(P.mesh); particles.splice(i, 1); }
    }

    // stations idle rotation
    stations.forEach(s => s.rotation.y += dt * 0.4);

    hud();
    if (S.time % 0.25 < dt) drawMap();
  }

  // --- camera ---
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion);
  if (S.camMode === 0) {
    const off = new THREE.Vector3(0, 10, 1).applyQuaternion(new THREE.Euler(pitch * 0.4, yaw * 0.2, 0));
    const desired = ship.position.clone().add(back.clone().multiplyScalar(camDist)).add(new THREE.Vector3(0, camDist * 0.32, 0));
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.lookAt(ship.position.clone().add(new THREE.Vector3(0, 4, 0)));
  } else if (S.camMode === 1) {
    // frei: WASD fliegt Schiff, Kamera bleibt, Rechts-Drag dreht
    const e = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(e);
    camera.position.lerp(ship.position.clone().add(back.clone().multiplyScalar(camDist * 0.7)).add(new THREE.Vector3(0, 14, 0)), 0.04);
  } else {
    const t = S.time * 0.15;
    camera.position.lerp(new THREE.Vector3(ship.position.x + Math.cos(t) * camDist, ship.position.y + camDist * 0.5, ship.position.z + Math.sin(t) * camDist), 0.05);
    camera.lookAt(ship.position);
  }

  renderer.render(scene, camera);
}
loop();
checkMissions();
drawMap();
