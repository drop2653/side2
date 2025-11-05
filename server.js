import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- 데이터 구조 ---
let lobby = {
  players: [], // {id, nickname, color, ws, ready, coins, hp, x, y}
  isHost: false,
  gameStarted: false,
  coins: [],
  timeLeft: 180,
};

// --- 유틸 ---
function broadcast(data) {
  const msg = JSON.stringify(data);
  lobby.players.forEach(p => p.ws.send(msg));
}
function randomPos() {
  const angle = Math.random() * Math.PI * 2;
  const r = 200 + Math.random() * 80;
  return {
    x: 450 + Math.cos(angle) * r,
    y: 350 + Math.sin(angle) * r,
  };
}
function initCoins() {
  const arr = [];
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 250 * Math.random();
    arr.push({
      x: 450 + Math.cos(angle) * r,
      y: 350 + Math.sin(angle) * r,
    });
  }
  return arr;
}

// --- 연결 시 ---
wss.on("connection", (ws) => {
  const id = Math.random().toString(36).substr(2, 9);

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    switch (data.type) {
      case "joinLobby": {
        if (lobby.gameStarted || lobby.players.length >= 4) {
          ws.send(JSON.stringify({
            type: "loginResult",
            success: false,
            message: "빈 방 없음!",
          }));
          return;
        }

        const colors = ["red", "blue", "green", "yellow"];
        const color = colors[lobby.players.length];
        const newPlayer = {
          id,
          nickname: data.nickname,
          color,
          ws,
          ready: false,
          coins: 0,
          hp: 5,
          ...randomPos(),
        };

        lobby.players.push(newPlayer);
        lobby.isHost = lobby.players[0].id === id;

        ws.send(JSON.stringify({
          type: "loginResult",
          success: true,
          id,
          nickname: data.nickname,
          room: { players: lobby.players, isHost: lobby.isHost },
        }));
        broadcast({ type: "lobbyUpdate", room: { players: lobby.players, isHost: lobby.isHost } });
        break;
      }

      case "toggleReady": {
        const p = lobby.players.find(p => p.id === id);
        if (p) p.ready = !p.ready;
        broadcast({ type: "lobbyUpdate", room: { players: lobby.players, isHost: lobby.players[0]?.id === id } });
        break;
      }

      case "startGame": {
        const host = lobby.players[0];
        if (!host || host.id !== id) return;
        if (!lobby.players.every(p => p.ready)) return;

        lobby.gameStarted = true;
        lobby.coins = initCoins();
        lobby.timeLeft = 180;

        broadcast({
          type: "startGame",
          players: lobby.players.map(p => ({ id: p.id, color: p.color, x: p.x, y: p.y, hp: p.hp })),
          coins: lobby.coins,
        });

        startGameLoop();
        break;
      }
    }
  });

  ws.on("close", () => {
    lobby.players = lobby.players.filter(p => p.id !== id);
    broadcast({ type: "lobbyUpdate", room: { players: lobby.players, isHost: lobby.players[0]?.id === id } });
  });
});

// --- 게임 루프 ---
let gameInterval = null;
function startGameLoop() {
  clearInterval(gameInterval);
  gameInterval = setInterval(() => {
    if (!lobby.gameStarted) return;
    lobby.timeLeft--;

    if (lobby.timeLeft <= 0) {
      endGame();
    }

    broadcast({
      type: "gameState",
      players: lobby.players.map(p => ({
        id: p.id, x: p.x, y: p.y, color: p.color, hp: p.hp, coins: p.coins
      })),
      coins: lobby.coins,
      time: lobby.timeLeft,
    });
  }, 1000);
}

function endGame() {
  clearInterval(gameInterval);
  lobby.gameStarted = false;
  const result = lobby.players
    .map(p => ({ nickname: p.nickname, coins: p.coins }))
    .sort((a, b) => b.coins - a.coins);
  broadcast({ type: "gameOver", result });
  lobby.players.forEach(p => { p.ready = false; p.coins = 0; p.hp = 5; });
}

// --- 서버 실행 ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ 서버 실행 중: ${PORT}`));







