const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const MAX_PLAYERS = 4;
const GAME_TIME = 180000; // 3분 (밀리초)
let rooms = [];

function createRoom() {
  const id = Math.random().toString(36).substr(2, 6);
  const room = {
    id,
    players: [],
    started: false,
    coins: [],
    timer: null
  };
  rooms.push(room);
  return room;
}

function randomPos() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 350;
  return {
    x: 400 + Math.cos(angle) * radius,
    y: 400 + Math.sin(angle) * radius
  };
}

function spawnCoins() {
  const coins = [];
  for (let i = 0; i < 50; i++) {
    coins.push({
      id: i,
      x: Math.random() * 800,
      y: Math.random() * 800,
      taken: false
    });
  }
  return coins;
}

function broadcast(roomId, data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // 플레이어 입장
    if (data.type === "join") {
      let room = rooms.find((r) => !r.started && r.players.length < MAX_PLAYERS);
      if (!room) room = createRoom();

      const player = {
        id: data.id,
        name: data.name,
        color: ["red", "blue", "green", "yellow"][room.players.length],
        ready: false,
        isHost: room.players.length === 0,
        hp: 10,
        coins: 0,
        alive: true,
        respawnTime: 0,
        pos: randomPos()
      };

      ws.roomId = room.id;
      ws.player = player;
      room.players.push(player);

      broadcast(room.id, {
        type: "lobbyUpdate",
        players: room.players,
        host: room.players.find((p) => p.isHost)?.id
      });
    }

    // 준비 토글
    if (data.type === "ready") {
      const room = rooms.find((r) => r.id === ws.roomId);
      const p = room.players.find((p) => p.id === ws.player.id);
      if (p) p.ready = !p.ready;
      broadcast(room.id, { type: "lobbyUpdate", players: room.players });
    }

    // 게임 시작
    if (data.type === "start") {
      const room = rooms.find((r) => r.id === ws.roomId);
      if (!room) return;
      const allReady = room.players.every((p) => p.ready || p.isHost);
      if (allReady) {
        room.started = true;
        room.coins = spawnCoins();
        broadcast(room.id, { type: "gameStart", players: room.players, coins: room.coins });

        // 3분 타이머
        room.timer = setTimeout(() => {
          const sorted = [...room.players].sort((a, b) => b.coins - a.coins);
          broadcast(room.id, { type: "gameOver", ranking: sorted });
          room.started = false;
        }, GAME_TIME);
      }
    }

    // 위치 동기화
    if (data.type === "pos") {
      const room = rooms.find((r) => r.id === ws.roomId);
      const p = room.players.find((p) => p.id === ws.player.id);
      if (!p) return;
      p.pos = data.pos;
      p.angle = data.angle;
    }

    // 발사체
    if (data.type === "shoot") {
      broadcast(ws.roomId, { type: "shoot", id: ws.player.id, dir: data.dir });
    }

    // 코인 획득
    if (data.type === "coin") {
      const room = rooms.find((r) => r.id === ws.roomId);
      const coin = room.coins.find((c) => c.id === data.coinId);
      const p = room.players.find((p) => p.id === ws.player.id);
      if (coin && !coin.taken) {
        coin.taken = true;
        p.coins++;
        broadcast(room.id, { type: "coinUpdate", coinId: coin.id, playerId: p.id });
      }
    }
  });

  ws.on("close", () => {
    const room = rooms.find((r) => r.id === ws.roomId);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== ws.player?.id);
    broadcast(room.id, { type: "lobbyUpdate", players: room.players });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ 서버 실행 중: ${PORT}`));






