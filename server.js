import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));

let rooms = [];

function getColor(i) {
  return ["red", "blue", "green"][i] || "gray";
}

function broadcast(roomId, data) {
  wss.clients.forEach((c) => {
    if (c.readyState === 1 && c.roomId === roomId) {
      c.send(JSON.stringify(data));
    }
  });
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // 플레이어 입장
    if (data.type === "join") {
      let room = rooms.find((r) => !r.started && r.players.length < 3);
      if (!room) {
        room = { id: Math.random().toString(36).substr(2, 5), players: [], started: false };
        rooms.push(room);
      }

      const color = getColor(room.players.length);
      const player = {
        id: Date.now() + Math.random(),
        name: data.name,
        color,
        ready: false,
        hp: 5,
        coins: 0,
        x: 0,
        y: 0,
      };
      room.players.push(player);

      ws.roomId = room.id;
      ws.playerId = player.id;

      broadcast(room.id, { type: "roomUpdate", room });
    }

    // 준비
    if (data.type === "ready") {
      const room = rooms.find((r) => r.id === ws.roomId);
      const p = room?.players.find((pl) => pl.id === ws.playerId);
      if (p) p.ready = true;
      broadcast(room.id, { type: "roomUpdate", room });
    }

    // 시작
    if (data.type === "start") {
      const room = rooms.find((r) => r.id === ws.roomId);
      if (!room) return;
      room.started = true;
      broadcast(room.id, { type: "gameStart", room });
    }

    // 이동 업데이트
    if (data.type === "update") {
      const room = rooms.find((r) => r.id === ws.roomId);
      if (!room) return;
      const p = room.players.find((pl) => pl.id === ws.playerId);
      if (p) Object.assign(p, data.payload);
      broadcast(room.id, { type: "state", room });
    }
  });

  ws.on("close", () => {
    const room = rooms.find((r) => r.id === ws.roomId);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== ws.playerId);
    if (room.players.length === 0) {
      rooms = rooms.filter((r) => r.id !== room.id);
    } else {
      broadcast(room.id, { type: "roomUpdate", room });
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("✅ Server on port", PORT));











