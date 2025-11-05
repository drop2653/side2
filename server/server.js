const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));

let rooms = []; // 최대 하나의 방만 (최대 3인)

io.on('connection', (socket) => {
  console.log('새로운 사용자 연결됨:', socket.id);

  socket.on('join-lobby', (nickname) => {
    let room = rooms[0];

    if (!room || room.players.length >= 3 || room.started) {
      socket.emit('lobby-full');
      return;
    }

    // 방 없으면 새로 생성
    if (!room) {
      room = {
        id: 'main-room',
        players: [],
        started: false
      };
      rooms.push(room);
    }

    // 플레이어 추가
    const colors = ['red', 'blue', 'green'];
    const player = {
      id: socket.id,
      nickname,
      color: colors[room.players.length],
      ready: false,
      coins: 0,
      hp: 5
    };

    room.players.push(player);
    socket.join(room.id);
    socket.roomId = room.id;

    io.to(room.id).emit('update-lobby', room.players);
  });

  socket.on('ready', () => {
    const room = rooms.find(r => r.id === socket.roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.ready = true;

    io.to(room.id).emit('update-lobby', room.players);
  });

  socket.on('start-game', () => {
    const room = rooms.find(r => r.id === socket.roomId);
    if (!room) return;

    const allReady = room.players.every(p => p.ready || room.players.length === 1);
    if (allReady) {
      room.started = true;
      io.to(room.id).emit('start-game', room.players);
    }
  });

  socket.on('disconnect', () => {
    console.log('사용자 연결 종료:', socket.id);
    rooms.forEach((room) => {
      room.players = room.players.filter(p => p.id !== socket.id);
    });
    rooms = rooms.filter(r => r.players.length > 0);

    io.emit('update-lobby', rooms[0]?.players || []);
  });
});

server.listen(PORT, () => {
  console.log(`서버 실행 중... 포트: ${PORT}`);

});
let gameState = {
  players: {},  // socketId: {x, y, vx, vy, hp, color, coins}
  bullets: [],
  coins: [],    // {x, y}
  started: false,
};

function spawnCoins() {
  gameState.coins = [];
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const radius = Math.random() * 330;
    gameState.coins.push({
      x: 400 + Math.cos(angle) * radius,
      y: 400 + Math.sin(angle) * radius,
    });
  }
}

io.on('connection', (socket) => {
  console.log('플레이어 접속:', socket.id);

  socket.on('join-lobby', (nickname) => {
    if (Object.keys(gameState.players).length >= 3 || gameState.started) {
      socket.emit('lobby-full');
      return;
    }

    const color = ['red', 'blue', 'green'][Object.keys(gameState.players).length];
    gameState.players[socket.id] = {
      id: socket.id,
      nickname,
      color,
      x: color === 'red' ? 400 : color === 'blue' ? 200 : 600,
      y: color === 'red' ? 150 : 600,
      vx: 0,
      vy: 0,
      hp: 5,
      coins: 0,
      ready: false
    };

    io.emit('update-lobby', Object.values(gameState.players));
  });

  socket.on('ready', () => {
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].ready = true;
      io.emit('update-lobby', Object.values(gameState.players));
    }
  });

  socket.on('start-game', () => {
    const allReady = Object.values(gameState.players).every(p => p.ready || Object.values(gameState.players).length === 1);
    if (allReady) {
      gameState.started = true;
      spawnCoins();
      io.emit('start-game', {
        players: gameState.players,
        coins: gameState.coins
      });
    }
  });

  // 이동 동기화
  socket.on('move', (data) => {
    const player = gameState.players[socket.id];
    if (!player) return;
    player.x = data.x;
    player.y = data.y;
    player.vx = data.vx;
    player.vy = data.vy;
  });

  // 총알 동기화
  socket.on('shoot', (bullet) => {
    gameState.bullets.push(bullet);
  });

  socket.on('disconnect', () => {
    delete gameState.players[socket.id];
    io.emit('update-lobby', Object.values(gameState.players));
  });
});

// 주기적으로 전체 상태 전송
setInterval(() => {
  if (!gameState.started) return;
  io.emit('game-state', {
    players: gameState.players,
    bullets: gameState.bullets,
    coins: gameState.coins
  });
}, 1000 / 30); // 30 FPS 동기화
