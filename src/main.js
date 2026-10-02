import * as THREE from 'three';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { createNet } from './net.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

$('inp-name').value = localStorage.getItem('stellar-name') || ('Pilot-' + Math.floor(Math.random() * 999));
$('inp-room').value = params.get('room') || localStorage.getItem('stellar-room') || 'galaxy-1';
if (params.get('room')) $('share-hint').innerHTML = `Raum <b style="color:#33ccff">${params.get('room')}</b> aus Link übernommen ✓`;

$('btn-random-room').onclick = () => {
  $('inp-room').value = 'galaxy-' + Math.floor(Math.random() * 900 + 100);
};

let game = null, net = null, input = createInput();

$('btn-start').onclick = async () => {
  const name = ($('inp-name').value.trim() || 'Nova').slice(0, 12);
  const color = $('inp-color').value || '#33ccff';
  let room = ($('inp-room').value.trim() || 'galaxy-1').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16) || 'galaxy-1';
  localStorage.setItem('stellar-name', name);
  localStorage.setItem('stellar-room', room);
  history.replaceState(null, '', `?room=${encodeURIComponent(room)}`);

  $('start-overlay').classList.add('gone');
  $('room-label').textContent = 'raum: ' + room;

  const optsObj = { name, color, net: null };
  game = createGame($('scene'), input, optsObj);
  // net erst nach game (hooks brauchen game)
  net = await createNet(room, {
    onPos: (peerId, d) => game.upsertRemote(peerId, d),
    onPew: (peerId, d) => {
      game.upsertRemote(peerId, { name: peerId.slice(0, 5) });
      const o = new THREE.Vector3().fromArray(d.p);
      const dir = new THREE.Vector3().fromArray(d.d);
      game.fireLaser(o, dir, false, d.c || '#ff5470');
    },
    onSpawn: (peerId, d) => game.spawnSandbox(d.t, true, d),
    onHit: (peerId, d) => game.killfeed(`🎯 ${d.from} trifft ${d.to}`),
    onJoin: (peerId) => { net.sendHello?.({ name, color }); },
    onLeave: (peerId) => game.removeRemote(peerId),
    onHello: (peerId, d) => game.upsertRemote(peerId, d),
    ready: (n) => {
      game.toast(n.ok ? `🌐 Multiplayer aktiv – Raum "${room}"` : '📴 Offline – Solo + Bots');
      // Hallo sagen + regelmäßig
      const hello = () => n.sendHello?.({ name, color, p: game.me.pos.toArray(), q: game.me.quat.toArray() });
      hello();
      setInterval(hello, 4000);
    }
  });
  // game net-Referenz nachträglich setzen (optsObj ist per Referenz im Game-Closure)
  optsObj.net = net;

  if (input.isTouch) $('touch-ui').classList.remove('hidden');

  $('pill-players').textContent = '1 online';
  game.start();
  game.toast(`Willkommen, ${name}! 🚀`);
};

// --- Menü ---
$('btn-menu').onclick = () => $('side-menu').classList.remove('hidden');
$('btn-close-menu').onclick = () => $('side-menu').classList.add('hidden');

document.querySelectorAll('[data-spawn]').forEach(b => {
  b.onclick = () => {
    game?.spawnSandbox(b.dataset.spawn, false);
    game?.toast(`Spawn: ${b.textContent.trim()}`);
  };
});
$('rng-time').oninput = e => {
  const v = parseFloat(e.target.value);
  $('val-time').textContent = v.toFixed(1) + '×';
  game?.setTimeScale(v);
};
$('rng-grav').oninput = e => {
  const v = parseFloat(e.target.value);
  $('val-grav').textContent = v > 0.5 ? 'an' : 'aus';
  game?.setGravity(v);
};
$('btn-clear').onclick = () => { location.reload(); };
$('btn-reset').onclick = () => game?.respawn();
$('btn-copy').onclick = async () => {
  const url = location.origin + location.pathname + '?room=' + encodeURIComponent($('room-label').textContent.replace('raum: ', ''));
  try { await navigator.clipboard.writeText(url); game?.toast('📋 Link kopiert!'); }
  catch { prompt('Link kopieren:', url); }
};
