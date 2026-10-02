import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Welt-Zustand ----------
const WORLD = 220;
const players = new Map(); // id -> {id,name,x,z,y,rotY,hp,hunger,alive,kills,lastHit}
let zombies = [];
let loots = [];
let nextZombieId = 1;

const LOOT_TYPES = ['food', 'medkit', 'ammo', 'bat'];

function rand(a, b) { return a + Math.random() * (b - a); }
function spawnPos() { return { x: rand(-90, 90), z: rand(-90, 90) }; }

function spawnLoot(n = 40) {
  loots = [];
  for (let i = 0; i < n; i++) {
    const p = spawnPos();
    const type = LOOT_TYPES[Math.floor(Math.random() * LOOT_TYPES.length)];
    loots.push({ id: 'l' + i, type, x: +p.x.toFixed(1), z: +p.z.toFixed(1), taken: false });
  }
}
function spawnZombies(n = 14) {
  zombies = [];
  for (let i = 0; i < n; i++) {
    const p = spawnPos();
    zombies.push({ id: 'z' + (nextZombieId++), x: +p.x.toFixed(1), z: +p.z.toFixed(1), hp: 100, speed: rand(2.2, 4.2) });
  }
}
spawnLoot();
spawnZombies();

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const p = spawnPos();
  const player = {
    id, name: 'Survivor', x: p.x, z: p.z, y: 0, rotY: 0,
    hp: 100, hunger: 100, alive: true, kills: 0, safeUntil: Date.now() + 8000
  };
  players.set(id, player);
  ws._id = id;

  ws.send(JSON.stringify({ t: 'welcome', id, world: WORLD, loots, zombies }));
  broadcast({ t: 'players', players: [...players.values()] });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    const me = players.get(id);
    if (!me) return;
    if (m.t === 'join') {
      me.name = String(m.name || 'Survivor').slice(0, 14);
      broadcast({ t: 'players', players: [...players.values()] });
    } else if (m.t === 'move' && me.alive) {
      me.x = Math.max(-WORLD/2, Math.min(WORLD/2, +m.x || 0));
      me.z = Math.max(-WORLD/2, Math.min(WORLD/2, +m.z || 0));
      me.rotY = +m.rot || 0;
      if (typeof m.hp === 'number') me.hp = Math.max(0, Math.min(100, m.hp));
      if (typeof m.hunger === 'number') me.hunger = Math.max(0, Math.min(100, m.hunger));
      if (me.hp <= 0) me.alive = false;
    } else if (m.t === 'hitZombie') {
      const z = zombies.find(z => z.id === m.zid);
      if (z && me.alive) {
        const dx = z.x - me.x, dz = z.z - me.z;
        if (dx*dx + dz*dz < 36) {
          z.hp -= (m.dmg || 34);
          if (z.hp <= 0) {
            zombies = zombies.filter(v => v.id !== z.id);
            me.kills++;
            // Respawn Zombie woanders
            const p2 = spawnPos();
            const nz = { id: 'z' + (nextZombieId++), x: +p2.x.toFixed(1), z: +p2.z.toFixed(1), hp: 100, speed: rand(2.2, 4.5) };
            zombies.push(nz);
            broadcast({ t: 'kill', by: me.name });
          }
        }
      }
    } else if (m.t === 'hitPlayer') {
      const v = players.get(m.pid);
      if (v && v.alive && me.alive && m.pid !== id) {
        const dx = v.x - me.x, dz = v.z - me.z;
        if (dx*dx + dz*dz < 36) {
          v.hp -= (m.dmg || 25);
          if (v.hp <= 0) { v.hp = 0; v.alive = false; me.kills++; broadcast({ t: 'kill', by: me.name, victim: v.name }); }
        }
      }
    } else if (m.t === 'takeLoot') {
      const l = loots.find(l => l.id === m.lid && !l.taken);
      if (l) {
        const dx = l.x - me.x, dz = l.z - me.z;
        if (dx*dx + dz*dz < 25) { l.taken = true; ws.send(JSON.stringify({ t: 'lootGranted', loot: l })); }
      }
    } else if (m.t === 'respawn') {
      const p2 = spawnPos();
      me.x = p2.x; me.z = p2.z; me.hp = 100; me.hunger = 100; me.alive = true;
      me.safeUntil = Date.now() + 8000;
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ t: 'players', players: [...players.values()] });
  });
});

// Zombie-KI + Hunger-Tick (10 Hz)
setInterval(() => {
  const alive = [...players.values()].filter(p => p.alive);
  for (const z of zombies) {
    let best = null, bd = 1e9;
    for (const p of alive) {
      const dx = p.x - z.x, dz = p.z - z.z;
      const d = dx*dx + dz*dz;
      if (d < bd) { bd = d; best = p; }
    }
    if (best && bd < 30*30) {
      const dx = best.x - z.x, dz = best.z - z.z;
      const d = Math.hypot(dx, dz) || 1;
      z.x += (dx / d) * z.speed * 0.1;
      z.z += (dz / d) * z.speed * 0.1;
      // Zombie-Schaden bei Kontakt (mit Spawn-Schutz)
      if (d < 2.2 && Date.now() > (best.safeUntil || 0)) {
        best.hp -= 0.35;
        if (best.hp <= 0) { best.hp = 0; best.alive = false; broadcast({ t: 'kill', by: 'Zombie', victim: best.name }); }
      }
    } else {
      z.x += rand(-0.3, 0.3); z.z += rand(-0.3, 0.3);
    }
    z.x = Math.max(-WORLD/2, Math.min(WORLD/2, z.x));
    z.z = Math.max(-WORLD/2, Math.min(WORLD/2, z.z));
  }
  broadcast({ t: 'tick', players: [...players.values()], zombies: zombies.map(z => ({ id: z.id, x: +z.x.toFixed(1), z: +z.z.toFixed(1), hp: z.hp })), loots: loots.filter(l => !l.taken) });
}, 100);

// Hunger langsam senken (alle 5s)
setInterval(() => {
  for (const p of players.values()) {
    if (!p.alive) continue;
    p.hunger = Math.max(0, p.hunger - 1.2);
    if (p.hunger <= 0) p.hp = Math.max(0, p.hp - 2);
    if (p.hp <= 0) p.alive = false;
  }
}, 5000);

app.get('/health', (_, res) => res.json({ ok: true, players: players.size, zombies: zombies.length }));

server.listen(PORT, () => console.log(`DAYZ-MOBILE läuft auf :${PORT}`));
