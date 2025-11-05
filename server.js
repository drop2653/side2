const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

let rooms = [];
let maxPlayers = 4;

function createRoom() {
  const id = Math.random().toString(36).substr(2, 6);
  const room = { id, players: [], started: false };
  rooms.push(room);
  return room;
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // ✅ 방 입장
    if (data.type === "join") {
      let room = rooms.find(r => !r.started && r.players.length < maxPlayers);
      if (!room) room = createRoom();

      const player = {
        id: data.id,
        name: data.name,
        color: ["red", "blue", "green", "purple"][room.players.length],
        ready: false,
        isHost: room.players.length === 0
      };
      ws.roomId = room.id;
      ws.player = player;
      room.players.push(player);

      broadcast(room.id, {
        type: "lobbyUpdate",
        players: room.players,
        host: room.players.find(p => p.isHost)?.id
      });
    }

    // ✅ 준비 토글
    if (data.type === "ready") {
      const room = rooms.find(r => r.id === ws.roomId);
      const p = room.players.find(p => p.id === ws.player.id);
      if (p) p.ready = !p.ready;
      broadcast(room.id, { type: "lobbyUpdate", players: room.players });
    }

    // ✅ 강퇴
    if (data.type === "kick") {
      const room = rooms.find(r => r.id === ws.roomId);
      room.players = room.players.filter(p => p.id !== data.targetId);
      broadcast(room.id, { type: "lobbyUpdate", players: room.players });
    }

    // ✅ 게임 시작
    if (data.type === "start") {
      const room = rooms.find(r => r.id === ws.roomId);
      if (!room) return;
      const allReady = room.players.every(p => p.ready || p.isHost);
      if (allReady) {
        room.started = true;
        broadcast(room.id, { type: "gameStart", players: room.players });
      }
    }
  });

  ws.on("close", () => {
    const room = rooms.find(r => r.id === ws.roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== ws.player?.id);
    broadcast(room.id, { type: "lobbyUpdate", players: room.players });
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





