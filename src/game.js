import * as THREE from 'three';
import { buildWorld, makeShip, makeLabel } from './world.js';

export function createGame(canvas, input, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 30000);
  camera.position.set(0, 8, -18);

  const world = buildWorld(scene);

  const me = {
    name: opts.name, color: opts.color,
    pos: new THREE.Vector3(60, 90, 780),
    vel: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    yaw: Math.PI * 0.15, pitch: -0.05, roll: 0,
    mesh: makeShip(opts.color),
    score: 0, hp: 100, alive: true, lastFire: 0,
  };
  me.mesh.userData.label.userData.setText(opts.name);
  scene.add(me.mesh);

  const remotes = new Map(); // peerId -> {mesh,name,color,pos,target,qTarget,score,lastSeen}
  const lasers = [];   // {mesh,vel,life,mine}
  const rockets = [];
  const spawns = [];    // sandbox objects {mesh,vel,spin,life?}
  const particles = []; // {mesh(small sprite),vel,life}

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // --- Laser-Pool ---
  const laserGeo = new THREE.CapsuleGeometry(0.22, 3.2, 3, 6);
  function fireLaser(origin, dir, mine, color) {
    const mat = new THREE.MeshBasicMaterial({ color: color || 0xff4455 });
    const m = new THREE.Mesh(laserGeo, mat);
    m.position.copy(origin);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    scene.add(m);
    lasers.push({ mesh: m, vel: dir.clone().normalize().multiplyScalar(420).add(me.vel), life: 1.6, mine });
    if (lasers.length > 60) { const old = lasers.shift(); scene.remove(old.mesh); }
  }

  function explode(p, color = 0xffaa33, n = 18, speed = 40) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.7 + Math.random(), 6, 5),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      s.position.copy(p);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.4 + Math.random()));
      scene.add(s);
      particles.push({ mesh: s, vel: v, life: 0.9 + Math.random() * 0.6 });
    }
  }

  function spawnSandbox(type, atPeer, data) {
    let mesh;
    const pos = data?.p ? new THREE.Vector3(...data.p) : me.pos.clone().add(forward().multiplyScalar(30));
    if (type === 'asteroid') {
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + Math.random() * 3), new THREE.MeshStandardMaterial({ color: 0x9a8a76, roughness: 1 }));
    } else if (type === 'crystal') {
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(3), new THREE.MeshStandardMaterial({ color: 0x66ffee, emissive: 0x22ffcc, emissiveIntensity: 0.9, roughness: 0.2 }));
    } else if (type === 'station') {
      mesh = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 10), new THREE.MeshStandardMaterial({ color: 0xccd6ee, metalness: 0.8, roughness: 0.3 }));
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(6, 0.7, 8, 24), new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x33ccff, emissiveIntensity: 0.5 }));
      ringM.rotation.x = Math.PI / 2;
      mesh.add(hub, ringM);
    } else { // ring
      mesh = new THREE.Mesh(new THREE.TorusGeometry(9, 1.4, 10, 32), new THREE.MeshStandardMaterial({ color: 0xaa66ff, emissive: 0x6633ff, emissiveIntensity: 0.4 }));
    }
    mesh.position.copy(pos);
    scene.add(mesh);
    spawns.push({ mesh, vel: new THREE.Vector3().randomDirection().multiplyScalar(4), spin: Math.random() * 1.5 + 0.3, type });
    if (spawns.length > 40) { const o = spawns.shift(); scene.remove(o.mesh); }
    if (!atPeer) opts.net?.sendSpawn({ t: type, p: pos.toArray() });
    return mesh;
  }

  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
  function forward(out = _f) {
    out.set(0, 0, 1).applyQuaternion(me.quat);
    return out;
  }

  const clock = new THREE.Clock();
  let timeScale = 1, gravityOn = true;
  let fps = 60, fpsAcc = 0, fpsN = 0, fpsT = 0;
  let netTimer = 0;
  const radar = document.getElementById('radar');

  function setTimeScale(v) { timeScale = v; }
  function setGravity(v) { gravityOn = v > 0.5; }

  function respawn() {
    me.pos.set(60, 90, 780);
    me.vel.set(0, 0, 0);
    me.hp = 100; me.alive = true;
    toast('Respawn ✓');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1800);
  }
  function killfeed(msg) {
    const kf = document.getElementById('killfeed');
    const d = document.createElement('div');
    d.textContent = msg;
    kf.prepend(d);
    while (kf.children.length > 4) kf.lastChild.remove();
    setTimeout(() => d.remove(), 5000);
  }

  // --- Remote-Spieler ---
  function upsertRemote(peerId, d) {
    let r = remotes.get(peerId);
    if (!r) {
      const mesh = makeShip(d.color || '#ff5470');
      mesh.userData.label.userData.setText(d.name || peerId.slice(0, 5));
      scene.add(mesh);
      r = { mesh, name: d.name || 'Gast', color: d.color || '#ff5470', pos: new THREE.Vector3(), target: new THREE.Vector3(), q: new THREE.Quaternion(), qTarget: new THREE.Quaternion(), score: 0, lastSeen: performance.now() };
      remotes.set(peerId, r);
      killfeed(`🛸 ${r.name} ist da`);
      refreshPlayerList();
    }
    if (d.p) r.target.fromArray(d.p);
    if (d.q) r.qTarget.fromArray(d.q);
    if (d.name) { r.name = d.name; }
    if (typeof d.score === 'number') r.score = d.score;
    r.lastSeen = performance.now();
    return r;
  }
  function refreshPlayerList() {
    const ul = document.getElementById('player-list');
    if (!ul) return;
    ul.innerHTML = '';
    const li0 = document.createElement('li');
    li0.innerHTML = `<span style="color:${me.color}">●</span> ${escapeHtml(me.name)} <b>· ${me.score} pts (du)</b>`;
    ul.appendChild(li0);
    remotes.forEach((r, id) => {
      const li = document.createElement('li');
      li.innerHTML = `<span style="color:${r.color}">●</span> ${escapeHtml(r.name)} · ${r.score} pts`;
      ul.appendChild(li);
    });
    document.getElementById('pill-players').textContent = `${remotes.size + 1} online`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Bots falls Solo (damit Sandbox lebendig wirkt)
  const bots = [];
  if (location.search.includes('bots') || true) {
    // 2 einfache KI-Drohnen, lokal simuliert
    for (let i = 0; i < 2; i++) {
      const mesh = makeShip(i ? '#ffaa33' : '#bb66ff');
      mesh.userData.label.userData.setText(i ? 'BOT-Ratts' : 'BOT-Vega');
      scene.add(mesh);
      bots.push({ mesh, a: Math.random() * 6, r: 500 + i * 300, speed: 0.05 + i * 0.02, y: 60 + i * 80 });
    }
  }

  function update(dt) {
    // --- Schiff-Physik ---
    const boostMul = input.boost ? 2.6 : 1;
    me.yaw += -input.turn * 1.6 * dt;
    me.pitch += -input.lift * 1.3 * dt;
    me.roll += -input.roll * 1.8 * dt;
    me.pitch = THREE.MathUtils.clamp(me.pitch, -1.2, 1.2);
    const e = new THREE.Euler(me.pitch, me.yaw, me.roll, 'YXZ');
    me.quat.setFromEuler(e);

    const ACCEL = 90 * boostMul;
    const fwd = forward(new THREE.Vector3());
    me.vel.addScaledVector(fwd, input.thrust * ACCEL * dt);
    // Gravitation: Sonne + größte Planeten
    if (gravityOn) {
      _u.copy(me.pos).multiplyScalar(-1);
      const d2 = Math.max(_u.lengthSq(), 2500);
      me.vel.addScaledVector(_u.normalize(), (90000 / d2) * dt * 3);
      world.planets.forEach(p => {
        _u.copy(p.mesh.position).sub(me.pos);
        const dd = Math.max(_u.lengthSq(), 900);
        if (dd < 120 * 120) me.vel.addScaledVector(_u.normalize(), (p.r * 60 / dd) * dt * 3);
      });
    }
    if (input.brake) me.vel.multiplyScalar(Math.max(0, 1 - 3 * dt));
    else me.vel.multiplyScalar(Math.max(0, 1 - 0.25 * dt));
    const maxV = 160 * boostMul;
    if (me.vel.length() > maxV) me.vel.setLength(maxV);
    me.pos.addScaledVector(me.vel, dt);

    // Welt-Grenze (weiche Kugel)
    if (me.pos.length() > 4200) {
      me.vel.addScaledVector(me.pos.clone().normalize(), -120 * dt);
      toast('⚠️ Umkehren – Rand des Systems');
    }

    me.mesh.position.copy(me.pos);
    me.mesh.quaternion.copy(me.quat);
    me.mesh.userData.engine.scale.set(1, 1, 1 + Math.abs(input.thrust) * (input.boost ? 2.4 : 1.2) + Math.random() * 0.15);

    // Kollision Planeten/Sonne
    if (world.sun && me.pos.length() < 80) { explode(me.pos, 0xff6633, 30, 60); killfeed('☀️ ' + me.name + ' ist in der Sonne verglüht'); respawn(); }
    world.planets.forEach(p => {
      if (me.pos.distanceTo(p.mesh.position) < p.r + 2) {
        // abprallen
        const n = me.pos.clone().sub(p.mesh.position).normalize();
        me.pos.copy(p.mesh.position).addScaledVector(n, p.r + 3);
        me.vel.reflect(n).multiplyScalar(0.45);
        explode(me.pos, 0xffcc66, 10, 25);
        toast('💥 Kollision mit ' + p.name);
      }
    });

    // Schießen
    const now = performance.now() / 1000;
    if (input.fire && now - me.lastFire > 0.16) {
      me.lastFire = now;
      const nose = me.pos.clone().addScaledVector(fwd, 4);
      fireLaser(nose, fwd, true, me.color);
      opts.net?.sendPew({ p: nose.toArray(), d: fwd.toArray(), c: me.color });
    }

    // Laser updaten + Treffer
    for (let i = lasers.length - 1; i >= 0; i--) {
      const L = lasers[i];
      L.life -= dt;
      L.mesh.position.addScaledVector(L.vel, dt);
      let dead = L.life <= 0;
      // Treffer Remote-Spieler
      if (L.mine) {
        remotes.forEach((r, pid) => {
          if (!dead && L.mesh.position.distanceToSquared(r.mesh.position) < 25) {
            dead = true;
            me.score += 1;
            explode(r.mesh.position, 0xff5470, 22, 45);
            killfeed(`🎯 ${me.name} trifft ${r.name}`);
            opts.net?.sendHit({ from: me.name, to: r.name, score: me.score });
            toast('+1 Treffer!');
            refreshPlayerList();
          }
        });
      }
      if (dead) { scene.remove(L.mesh); lasers.splice(i, 1); }
    }

    // Partikel
    for (let i = particles.length - 1; i >= 0; i--) {
      const P = particles[i];
      P.life -= dt;
      P.mesh.position.addScaledVector(P.vel, dt);
      P.mesh.material.opacity = Math.max(0, P.life);
      P.mesh.scale.multiplyScalar(1 - dt * 0.6);
      if (P.life <= 0) { scene.remove(P.mesh); particles.splice(i, 1); }
    }
    // Sandbox-Objekte driften
    spawns.forEach(o => {
      o.mesh.position.addScaledVector(o.vel, dt * timeScale);
      o.mesh.rotation.x += dt * o.spin * 0.3;
      o.mesh.rotation.y += dt * o.spin * 0.5;
    });

    // Welt
    world.update(dt, timeScale);

    // Bots kreisen
    bots.forEach(b => {
      b.a += dt * b.speed * timeScale;
      b.mesh.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(b.a * 2) * 30, Math.sin(b.a) * b.r);
      b.mesh.rotation.y = -b.a;
    });

    // Remote-Spieler interpolieren
    remotes.forEach((r, pid) => {
      r.mesh.position.lerp(r.target, 1 - Math.pow(0.001, dt));
      r.mesh.quaternion.slerp(r.qTarget, 1 - Math.pow(0.0005, dt));
      if (performance.now() - r.lastSeen > 15000) {
        scene.remove(r.mesh); remotes.delete(pid);
        killfeed(`👋 ${r.name} weg`);
        refreshPlayerList();
      }
    });

    // Kamera (Chase + Orbit-Offset)
    const back = fwd.clone().multiplyScalar(-15);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(me.quat);
    back.addScaledVector(up, 5.5);
    // Orbit-Offset durch Maus-Drag
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(me.quat);
    back.addScaledVector(side, input.camDX * 10);
    back.addScaledVector(up, -input.camDY * 8);
    const desired = me.pos.clone().add(back);
    camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
    camera.up.copy(up);
    camera.lookAt(me.pos.clone().addScaledVector(fwd, 24));

    // Netz senden (12 Hz)
    netTimer += dt;
    if (netTimer > 0.085) {
      netTimer = 0;
      opts.net?.sendPos({ p: me.pos.toArray(), q: me.quat.toArray(), name: me.name, color: me.color, score: me.score });
      document.getElementById('dot-net').classList.toggle('on', !!opts.net?.ok);
    }

    // HUD
    fpsAcc += dt; fpsN++;
    if ((fpsT += dt) > 0.5) {
      fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; fpsT = 0;
      document.getElementById('pill-fps').textContent = fps + ' FPS';
      // adaptive Qualität für Phones
      const targetPR = fps < 30 ? 1 : Math.min(devicePixelRatio, 2);
      if (Math.abs(renderer.getPixelRatio() - targetPR) > 0.01) renderer.setPixelRatio(targetPR);
    }
    document.getElementById('pill-speed').textContent = Math.round(me.vel.length() * 3.6) + ' m/s';

    drawRadar();
  }

  function drawRadar() {
    const ctx = radar.getContext('2d');
    const W = radar.width, H = radar.height, C = W / 2;
    ctx.clearRect(0, 0, W, H);
    const range = 2000, k = (W / 2 - 6) / range;
    const dot = (x, z, color, size = 3) => {
      let dx = (x - me.pos.x) * k, dz = (z - me.pos.z) * k;
      const m = Math.hypot(dx, dz), max = W / 2 - 6;
      if (m > max) { dx *= max / m; dz *= max / m; }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(C + dx, C + dz, size, 0, 7); ctx.fill();
    };
    // relativ zum Spieler rotieren? einfach Nord-fixiert
    dot(0, 0, '#ffcc55', 6);
    world.planets.forEach(p => dot(p.mesh.position.x, p.mesh.position.z, '#33ccff', 3));
    spawns.forEach(o => dot(o.mesh.position.x, o.mesh.position.z, '#aa66ff', 2));
    remotes.forEach(r => dot(r.mesh.position.x, r.mesh.position.z, '#ff5470', 4));
    bots.forEach(b => dot(b.mesh.position.x, b.mesh.position.z, '#ffaa33', 3));
    // Spieler-Mitte + Blickrichtung
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(C, C, 3.5, 0, 7); ctx.fill();
    const _hd = new THREE.Vector3(0, 0, 1).applyQuaternion(me.quat);
    const hd = Math.atan2(_hd.x, _hd.z);
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(C + Math.sin(hd) * 12, C + Math.cos(hd) * 12); ctx.stroke();
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    renderer.render(scene, camera);
  }

  refreshPlayerList();
  return {
    start: loop, me, remotes, upsertRemote, spawnSandbox, explode, fireLaser,
    setTimeScale, setGravity, respawn, toast, killfeed, refreshPlayerList,
    removeRemote(pid) { const r = remotes.get(pid); if (r) { scene.remove(r.mesh); remotes.delete(pid); refreshPlayerList(); } },
    renderer, scene, camera, world
  };
}
