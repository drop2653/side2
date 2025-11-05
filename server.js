const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.static('public'));

let rooms = {}; // { roomId: { players: [], started: false } }

wss.on('connection', ws => {
  const id = Math.random().toString(36).substr(2, 9);
  const roomId = 'main'; // 단일 방
  if (!rooms[roomId]) rooms[roomId] = { players: [], started: false };

  const playerCount = rooms[roomId].players.length;

  if (playerCount >= 3) {
    ws.send(JSON.stringify({ type: 'full' }));
    ws.close();
    return;
  }

  const colors = ['red', 'blue', 'green'];
  const player = {
    id,
    color: colors[playerCount],
    x: Math.random() * 2000,
    y: Math.random() * 2000,
    hp: 10,
    coins: 0,
    alive: true
  };

  rooms[roomId].players.push(player);

  ws.roomId = roomId;
  ws.player = player;

  // 연결 알림
  broadcast(roomId, {
    type: 'lobby',
    players: rooms[roomId].players.map(p => ({ id: p.id, color: p.color })),
  });

  ws.on('message', msg => {
    const data = JSON.parse(msg);

    if (data.type === 'state') {
      ws.player = { ...ws.player, ...data.player };
      broadcast(roomId, {
        type: 'state',
        players: rooms[roomId].players.map(p => p),
        bullets: data.bullets,
        coins: data.coins
      });
    }

    if (data.type === 'start') {
      rooms[roomId].started = true;
      broadcast(roomId, { type: 'start' });
    }
  });

  ws.on('close', () => {
    rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== id);
    broadcast(roomId, {
      type: 'lobby',
      players: rooms[roomId].players.map(p => ({ id: p.id, color: p.color }))
    });
  });
});

function broadcast(roomId, data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(JSON.stringify(data));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ 서버 실행 중: ${PORT}`));
