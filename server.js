// NEON BLOCKS ONLINE — relay WebSocket con salas
// Empareja a 2 jugadores por código y reenvía sus mensajes. Sin PC: se aloja en la nube.
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// Servidor HTTP mínimo para el health-check de la plataforma (Render/Railway/Glitch)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('NEON BLOCKS relay OK');
});

const wss = new WebSocketServer({ server });

// sala = { id: 'ABCD', players: [ws1, ws2] }
const rooms = new Map();

// Sin letras confusas (0/O, 1/I)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function otherIn(room, ws) {
  return room.players.find((p) => p !== ws);
}

function leaveRoom(ws) {
  if (!ws.roomId) return;
  const room = rooms.get(ws.roomId);
  if (room) {
    const other = otherIn(room, ws);
    if (other) {
      send(other, { type: 'opponent_left' });
      other.roomId = null;
    }
    rooms.delete(room.id);
  }
  ws.roomId = null;
}

wss.on('connection', (ws) => {
  ws.roomId = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'create') {
      leaveRoom(ws);
      const code = genCode();
      rooms.set(code, { id: code, players: [ws] });
      ws.roomId = code;
      send(ws, { type: 'room', code });
      send(ws, { type: 'waiting' });
      return;
    }

    if (msg.type === 'join') {
      leaveRoom(ws);
      const code = String(msg.room || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'error', message: 'Sala no encontrada' });
      if (room.players.length >= 2) return send(ws, { type: 'error', message: 'Sala llena' });
      room.players.push(ws);
      ws.roomId = code;
      send(room.players[0], { type: 'matched', role: 1 });
      send(room.players[1], { type: 'matched', role: 2 });
      return;
    }

    // En partida: reenviar al rival
    const room = ws.roomId ? rooms.get(ws.roomId) : null;
    if (!room) return;
    const other = otherIn(room, ws);
    if (!other) return;
    if (msg.type === 'state' || msg.type === 'garbage' || msg.type === 'gameover') {
      send(other, msg);
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => {});
});

// Mantener vivas las conexiones (evita timeouts de las plataformas gratis)
setInterval(() => {
  for (const c of wss.clients) { try { c.ping(); } catch {} }
}, 30000);

server.listen(PORT, () => {
  console.log(`NEON BLOCKS relay escuchando en el puerto ${PORT}`);
});
