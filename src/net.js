// P2P Multiplayer via Trystero (kein eigener Server nötig – läuft auf statischem Hosting,
// ideal für Phone/Tablet). Fallback: Solo-Modus mit Bots wenn offline.
export async function createNet(roomId, hooks) {
  const net = {
    ok: false, id: 'solo-' + Math.random().toString(36).slice(2, 7),
    peers: new Map(), roomId,
    sendPos: () => {}, sendPew: () => {}, sendSpawn: () => {}, sendHit: () => {},
  };
  try {
    const { joinRoom } = await import('trystero/torrent');
    const room = joinRoom({ appId: 'stellar-sandbox-3d-v1' }, roomId);
    net.room = room;
    net.id = room.getSelfId();
    net.ok = true;

    const [sendPos, onPos] = room.makeAction('pos');
    const [sendPew, onPew] = room.makeAction('pew');
    const [sendSpawn, onSpawn] = room.makeAction('spawn');
    const [sendHit, onHit] = room.makeAction('hit');
    net.sendPos = (d) => { try { sendPos(d); } catch {} };
    net.sendPew = (d) => { try { sendPew(d); } catch {} };
    net.sendSpawn = (d) => { try { sendSpawn(d); } catch {} };
    net.sendHit = (d) => { try { sendHit(d); } catch {} };

    onPos((d, peerId) => hooks.onPos?.(peerId, d));
    onPew((d, peerId) => hooks.onPew?.(peerId, d));
    onSpawn((d, peerId) => hooks.onSpawn?.(peerId, d));
    onHit((d, peerId) => hooks.onHit?.(peerId, d));

    room.onPeerJoin((peerId) => hooks.onJoin?.(peerId));
    room.onPeerLeave((peerId) => hooks.onLeave?.(peerId));

    // Anwesenheit pingen damit Spielerliste aktuell bleibt
    const [sendHello, onHello] = room.makeAction('hello');
    net.sendHello = (d) => { try { sendHello(d); } catch {} };
    onHello((d, peerId) => hooks.onHello?.(peerId, d));
    hooks.ready?.(net);
  } catch (err) {
    console.warn('[net] P2P nicht verfügbar, Solo-Modus:', err?.message);
    hooks.ready?.(net);
  }
  return net;
}
