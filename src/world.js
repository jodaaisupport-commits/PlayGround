import * as THREE from 'three';

export function makeShip(color = '#33ccff') {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.7, roughness: 0.3, emissive: new THREE.Color(color), emissiveIntensity: 0.18 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2338, metalness: 0.8, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.6, 8), mat);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshStandardMaterial({ color: 0x99eeff, metalness: 0.2, roughness: 0.1, emissive: 0x66ccff, emissiveIntensity: 0.7 }));
  cockpit.position.set(0, 0.55, 0.4);
  cockpit.scale.set(1, 0.7, 1.4);
  g.add(cockpit);

  const wingGeo = new THREE.BoxGeometry(3.6, 0.12, 1.2);
  const wing = new THREE.Mesh(wingGeo, dark);
  wing.position.set(0, -0.15, -0.9);
  g.add(wing);
  const tipGeo = new THREE.BoxGeometry(0.28, 0.28, 1.5);
  [-1.75, 1.75].forEach(x => {
    const tip = new THREE.Mesh(tipGeo, mat);
    tip.position.set(x, 0, -0.9);
    g.add(tip);
  });

  const engineGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.9 })
  );
  engineGlow.position.set(0, 0, -1.9);
  engineGlow.scale.set(1, 1, 1.4);
  engineGlow.name = 'engine';
  g.add(engineGlow);

  const light = new THREE.PointLight(new THREE.Color(color), 8, 18);
  light.position.set(0, 1, 0);
  g.add(light);

  // Namensschild
  const label = makeLabel('YOU');
  label.position.set(0, 2.2, 0);
  g.add(label);

  g.userData.engine = engineGlow;
  g.userData.label = label;
  return g;
}

export function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 36px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'white';
  ctx.shadowColor = '#33ccff'; ctx.shadowBlur = 12;
  ctx.fillText(String(text).slice(0, 12), 128, 44);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(m);
  sp.scale.set(7, 1.75, 1);
  sp.userData.setText = (t) => {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillText(String(t).slice(0, 12), 128, 44);
    tex.needsUpdate = true;
  };
  return sp;
}

export function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x05070f, 0.00045);
  scene.background = new THREE.Color(0x04060d);

  const sunLight = new THREE.PointLight(0xfff2cc, 3.2, 0, 0.0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x334466, 1.2));

  // Sonne
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcc55 })
  );
  scene.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('#ffaa33'), transparent: true, opacity: 0.85, depthWrite: false
  }));
  sunGlow.scale.set(320, 320, 1);
  scene.add(sunGlow);

  // Sterne
  scene.add(starPoints(2200, 9000));

  // Nebel-Sprites
  const nebColors = ['#4422ff', '#ff3388', '#22ccff'];
  nebColors.forEach((col, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(col), transparent: true, opacity: 0.16, depthWrite: false }));
    const a = (i / 3) * Math.PI * 2;
    sp.position.set(Math.cos(a) * 4500, (i - 1) * 900, Math.sin(a) * 4500);
    sp.scale.set(3800, 3800, 1);
    scene.add(sp);
  });

  // Planeten
  const planetDefs = [
    { name: 'Pyro', color: 0xff6b4a, r: 22, orbit: 320, speed: 0.055, size: 1 },
    { name: 'Terra', color: 0x44dd77, r: 30, orbit: 620, speed: 0.035, size: 1 },
    { name: 'Azure', color: 0x4499ff, r: 26, orbit: 950, speed: 0.024, size: 1 },
    { name: 'Violetta', color: 0xaa66ff, r: 40, orbit: 1350, speed: 0.016, size: 1 },
    { name: 'Frost', color: 0xaaddff, r: 34, orbit: 1750, speed: 0.011, size: 1 },
  ];
  const planets = planetDefs.map(d => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(d.r, 24, 18),
      new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.85, metalness: 0.1 })
    );
    // Orbit-Ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(d.orbit - 1.5, d.orbit + 1.5, 128),
      new THREE.MeshBasicMaterial({ color: 0x33ccff, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
    );
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    scene.add(mesh);
    const label = makeLabel(d.name);
    label.position.y = d.r + 8;
    mesh.add(label);
    return { ...d, mesh, angle: Math.random() * Math.PI * 2 };
  });

  // Asteroiden-Gürtel (Instanced)
  const AST_N = 220;
  const astGeo = new THREE.DodecahedronGeometry(3, 0);
  const astMat = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.95 });
  const asteroids = new THREE.InstancedMesh(astGeo, astMat, AST_N);
  const astData = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < AST_N; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = 1080 + Math.random() * 260;
    const y = (Math.random() - 0.5) * 130;
    const s = 0.6 + Math.random() * 2.6;
    astData.push({ a, rad, y, s, spin: Math.random() * 2, rot: Math.random() * 6 });
    dummy.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    asteroids.setMatrixAt(i, dummy.matrix);
  }
  scene.add(asteroids);

  // Staubpartikel um Spieler-Start
  const dust = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
      Array.from({ length: 900 }, () => (Math.random() - 0.5) * 1200), 3
    )),
    new THREE.PointsMaterial({ color: 0x88bbff, size: 1.6, transparent: true, opacity: 0.7 })
  );
  scene.add(dust);

  function glowTexture(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color + '88');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function starPoints(n, spread) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(spread * (0.5 + Math.random() * 0.5));
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 7, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
  }

  const tmpV = new THREE.Vector3();
  function update(dt, timeScale) {
    const t = dt * timeScale;
    sun.rotation.y += t * 0.02;
    sunGlow.material.rotation += t * 0.01;
    planets.forEach(p => {
      p.angle += p.speed * t;
      p.mesh.position.set(Math.cos(p.angle) * p.orbit, 0, Math.sin(p.angle) * p.orbit);
      p.mesh.rotation.y += t * 0.15;
    });
    for (let i = 0; i < AST_N; i++) {
      const a = astData[i];
      a.a += t * (8 / a.rad);
      a.rot += t * a.spin * 0.4;
      dummy.position.set(Math.cos(a.a) * a.rad, a.y, Math.sin(a.a) * a.rad);
      dummy.rotation.set(a.rot, a.rot * 0.7, 0);
      dummy.scale.setScalar(a.s);
      dummy.updateMatrix();
      asteroids.setMatrixAt(i, dummy.matrix);
    }
    asteroids.instanceMatrix.needsUpdate = true;
    dust.rotation.y += t * 0.004;
  }

  function planetPositions(out = []) {
    out.length = 0;
    planets.forEach(p => out.push({ name: p.name, pos: p.mesh.position, r: p.r }));
    return out;
  }

  return { sun, planets, asteroids, astData, update, planetPositions, tmpV };
}
