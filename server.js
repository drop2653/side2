import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public")); // public 폴더 정적 호스팅

// 게임 데이터
let rooms = []; // [{id: "abc", players: [{id,name,color,ready,hp,coins,x,y}], started: false}]

function getColor(idx) {
  return ["red", "blue", "green"][idx] || "gray";
}

function broadcast(roomId, data) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.roomId === roomId) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // 아이디 입력 후 방 입장
    if (data.type === "join") {
      let room = rooms.find((r) => !r.started && r.players.length < 3);
      if (!room) {
        if (rooms.length >= 5) {
          ws.send(JSON.stringify({ type: "error", msg: "빈 방 없음!" }));
          return;
        }
        room = { id: Math.random().toString(36).substr(2, 5), players: [], started: false };
        rooms.push(room);
      }

      const color = getColor(room.players.length);
      const player = {
        id: ws._socket.remoteAddress + Math.random(),
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
      if (room) {
        room.started = true;
        broadcast(room.id, { type: "gameStart", room });
      }
    }

    // 플레이어 상태 업데이트(이동/HP/코인)
    if (data.type === "update") {
      const room = rooms.find((r) => r.id === ws.roomId);
      if (!room) return;
      const p = room.players.find((pl) => pl.id === ws.playerId);
      if (p) {
        Object.assign(p, data.payload);
        broadcast(room.id, { type: "state", room });
      }
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
server.listen(PORT, () => console.log(`Server running on ${PORT}`));










