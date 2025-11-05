// game 변수들
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const FIELD_RADIUS = 380;
const CENTER_X = 400;
const CENTER_Y = 400;
const PLAYER_RADIUS = 20;
const BULLET_RADIUS = 5;
const COIN_RADIUS = 8;

let keys = {};
let bullets = [];
let coins = [];
let players = {}; // socketId: {x, y, hp, color, coins, ...}
let myPlayer = null;
let lastShot = 0;

document.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
document.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
document.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  myPlayer.mouseX = e.clientX - rect.left;
  myPlayer.mouseY = e.clientY - rect.top;
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && Date.now() - lastShot > 500) {
    shootBullet();
    lastShot = Date.now();
  }
});

function initGame(playerList) {
  // 초기화
  playerList.forEach((p, i) => {
    let spawn = [
      { x: CENTER_X, y: CENTER_Y - 250 },
      { x: CENTER_X - 200, y: CENTER_Y + 200 },
      { x: CENTER_X + 200, y: CENTER_Y + 200 },
    ][i];

    players[p.id] = {
      ...spawn,
      color: p.color,
      hp: 5,
      vx: 0,
      vy: 0,
      coins: 0,
      angle: 0,
    };

    if (socket.id === p.id) {
      myPlayer = players[p.id];
      myPlayer.mouseX = CENTER_X;
      myPlayer.mouseY = CENTER_Y;
    }
  });

  // 코인 생성
  for (let i = 0; i < 50; i++) {
    let angle = Math.random() * Math.PI * 2;
    let radius = Math.random() * (FIELD_RADIUS - 50);
    coins.push({
      x: CENTER_X + Math.cos(angle) * radius,
      y: CENTER_Y + Math.sin(angle) * radius,
    });
  }

  requestAnimationFrame(gameLoop);
}

function shootBullet() {
  const angle = Math.atan2(myPlayer.mouseY - myPlayer.y, myPlayer.mouseX - myPlayer.x);
  bullets.push({
    x: myPlayer.x,
    y: myPlayer.y,
    vx: Math.cos(angle) * 8,
    vy: Math.sin(angle) * 8,
    color: myPlayer.color,
  });
}

function gameLoop() {
  ctx.clearRect(0, 0, 800, 800);

  // 필드
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, FIELD_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // 코인
  coins.forEach((coin) => {
    ctx.beginPath();
    ctx.fillStyle = "gold";
    ctx.arc(coin.x, coin.y, COIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });

  // 총알
  bullets.forEach((b) => {
    b.x += b.vx;
    b.y += b.vy;
    ctx.beginPath();
    ctx.fillStyle = b.color;
    ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });

  // 이동
  if (myPlayer) {
    const accel = 0.3;
    if (keys["w"]) myPlayer.vy -= accel;
    if (keys["s"]) myPlayer.vy += accel;
    if (keys["a"]) myPlayer.vx -= accel;
    if (keys["d"]) myPlayer.vx += accel;

    // 마찰 & 속도 제한
    myPlayer.vx *= 0.9;
    myPlayer.vy *= 0.9;
    myPlayer.x += myPlayer.vx;
    myPlayer.y += myPlayer.vy;

    // 경계선 밖 즉사
    const distFromCenter = Math.hypot(myPlayer.x - CENTER_X, myPlayer.y - CENTER_Y);
    if (distFromCenter > FIELD_RADIUS) {
      myPlayer.hp = 0;
    }

    // 코인 충돌
    coins = coins.filter((coin) => {
      const d = Math.hypot(myPlayer.x - coin.x, myPlayer.y - coin.y);
      if (d < PLAYER_RADIUS + COIN_RADIUS) {
        myPlayer.coins += 1;
        return false;
      }
      return true;
    });
  }

  // 플레이어 그리기
  Object.values(players).forEach((p) => {
    ctx.beginPath();
    ctx.fillStyle = p.color;
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // HP 표시
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < p.hp ? "green" : "lightgray";
      ctx.fillRect(p.x - 25 + i * 10, p.y - 30, 8, 8);
    }
  });

  requestAnimationFrame(gameLoop);
}

// 서버로부터 게임 시작 명령 받으면 실행
socket.on("start-game", (players) => {
  document.getElementById("lobby-screen").style.display = "none";
  document.getElementById("game-screen").style.display = "block";
  initGame(players);
});
let deadTime = null;

function handleBulletCollisions() {
  bullets = bullets.filter((bullet) => {
    for (let id in players) {
      let p = players[id];
      if (p === myPlayer || p.hp <= 0) continue;
      const d = Math.hypot(bullet.x - p.x, bullet.y - p.y);
      if (d < PLAYER_RADIUS + BULLET_RADIUS) {
        p.hp -= 1;

        // 밀려나는 효과
        const angle = Math.atan2(bullet.y - p.y, bullet.x - p.x);
        p.vx -= Math.cos(angle) * 3;
        p.vy -= Math.sin(angle) * 3;

        return false; // 총알 제거
      }
    }
    return true;
  });
}

function handleDeathAndRespawn() {
  if (myPlayer.hp <= 0 && !deadTime) {
    // 사망 처리
    deadTime = Date.now();

    // 코인 절반 드롭
    let dropCount = Math.ceil(myPlayer.coins / 2);
    for (let i = 0; i < dropCount; i++) {
      let angle = Math.random() * Math.PI * 2;
      let radius = 30 + Math.random() * 30;
      coins.push({
        x: myPlayer.x + Math.cos(angle) * radius,
        y: myPlayer.y + Math.sin(angle) * radius,
      });
    }

    myPlayer.coins = 0;
  }

  if (deadTime) {
    let elapsed = (Date.now() - deadTime) / 1000;
    if (elapsed < 10) {
      // 카운트다운 표시
      ctx.fillStyle = 'black';
      ctx.font = '30px Arial';
      ctx.fillText(`${10 - Math.floor(elapsed)}`, 370, 400);
      return true; // 렌더링만 하고 skip
    } else {
      // 부활
      const spawn = myPlayer.color === 'red'
        ? { x: CENTER_X, y: CENTER_Y - 250 }
        : myPlayer.color === 'blue'
        ? { x: CENTER_X - 200, y: CENTER_Y + 200 }
        : { x: CENTER_X + 200, y: CENTER_Y + 200 };

      Object.assign(myPlayer, spawn, { hp: 5, vx: 0, vy: 0 });
      deadTime = null;
    }
  }
  return false;
}
let startTime = Date.now();

function checkGameEnd() {
  let elapsed = (Date.now() - startTime) / 1000;
  let remaining = 180 - elapsed;
  const min = Math.floor(remaining / 60);
  const sec = Math.floor(remaining % 60);

  document.getElementById('timer').textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

  if (remaining <= 0 || coins.length === 0) {
    endGame();
    return true;
  }
  return false;
}

function endGame() {
  gameScreen.style.display = 'none';
  resultScreen.style.display = 'block';

  const leaderboard = Object.entries(players)
    .sort(([, a], [, b]) => b.coins - a.coins)
    .map(([id, p]) => `<li style="color:${p.color}">${p.color} 플레이어 - ${p.coins} 코인</li>`)
    .join('');

  document.getElementById('leaderboard').innerHTML = leaderboard;
}

function gameLoop() {
  ctx.clearRect(0, 0, 800, 800);

  // 즉사 or 리스폰 처리
  if (handleDeathAndRespawn()) {
    requestAnimationFrame(gameLoop);
    return;
  }

  if (checkGameEnd()) return;

  // 기존 렌더링
  // ... 필드, 코인, 총알, 플레이어

  handleBulletCollisions();

  requestAnimationFrame(gameLoop);
}
document.getElementById("restart-button").onclick = () => {
  location.reload(); // 새로고침으로 초기화
};

// 기존 플레이어 정보 제거
let players = {};
let myPlayer = {};

// 서버에서 게임 시작 정보 수신
socket.on("start-game", (data) => {
  players = data.players;
  myPlayer = players[socket.id];
  coins = data.coins;
  requestAnimationFrame(gameLoop);
});

function sendMovement() {
  socket.emit('move', {
    x: myPlayer.x,
    y: myPlayer.y,
    vx: myPlayer.vx,
    vy: myPlayer.vy
  });
}

function shootBullet() {
  const angle = Math.atan2(myPlayer.mouseY - myPlayer.y, myPlayer.mouseX - myPlayer.x);
  const bullet = {
    x: myPlayer.x,
    y: myPlayer.y,
    vx: Math.cos(angle) * 8,
    vy: Math.sin(angle) * 8,
    color: myPlayer.color
  };
  bullets.push(bullet);
  socket.emit('shoot', bullet);
}

// 서버에서 모든 상태 수신
socket.on('game-state', (state) => {
  players = state.players;
  bullets = state.bullets;
  coins = state.coins;
});

// 이동 시 서버에 보냄
function updatePlayerMovement() {
  const accel = 0.3;
  if (keys["w"]) myPlayer.vy -= accel;
  if (keys["s"]) myPlayer.vy += accel;
  if (keys["a"]) myPlayer.vx -= accel;
  if (keys["d"]) myPlayer.vx += accel;
  myPlayer.vx *= 0.9;
  myPlayer.vy *= 0.9;
  myPlayer.x += myPlayer.vx;
  myPlayer.y += myPlayer.vy;

  sendMovement(); // 서버에 위치 전송
}

