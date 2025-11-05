const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

let rooms = { main: { players: [], started: false } };

wss.on('connection', ws => {
  ws.on('message', msg => {
    const data = JSON.parse(msg);

    if (data.type === 'join') {
      const roomId = 'main';
      const room = rooms[roomId];

      if (room.players.length >= 3) {
        ws.send(JSON.stringify({ type: 'full' }));
        ws.close();
        return;
      }

      const colors = ['red', 'blue', 'green'];
      const player = {
        id: data.id,
        name: data.name,
        color: colors[room.players.length],
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        hp: 10,
        coins: 0,
        alive: true
      };

      room.players.push(player);
      ws.roomId = roomId;
      ws.player = player;

      broadcast(roomId, {
        type: 'lobby',
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          color: p.color
        }))
      });
    }

    if (data.type === 'start') {
      broadcast('main', { type: 'start' });
    }

    if (data.type === 'state') {
      ws.player = { ...ws.player, ...data.player };
      broadcast('main', {
        type: 'state',
        players: rooms.main.players,
        bullets: data.bullets,
        coins: data.coins
      });
    }
  });

  ws.on('close', () => {
    const room = rooms.main;
    if (!ws.player) return;
    room.players = room.players.filter(p => p.id !== ws.player.id);
    broadcast('main', {
      type: 'lobby',
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color
      }))
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

