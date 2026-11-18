import * as THREE from "three";

const viewport = document.querySelector("#viewport");
const scoreLabel = document.querySelector("#score");
const killsLabel = document.querySelector("#kills");
const gateFill = document.querySelector("#gate-fill");
const overlay = document.querySelector("#overlay");
const gameOverOverlay = document.querySelector("#game-over");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const fireButton = document.querySelector("#fire-button");
const gyroButton = document.querySelector("#gyro-button");
const recenterButton = document.querySelector("#recenter-button");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#9cc9ce");
scene.fog = new THREE.Fog("#9cc9ce", 20, 80);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 6, -15);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
viewport.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const enemies = [];
const bullets = [];
const particles = [];

let gameState = "ready";
let score = 0;
let kills = 0;
let gateHealth = 8;
let maxGateHealth = 8;
let fireHeld = false;
let fireCooldown = 0;
let gyroEnabled = false;
let gyroOrigin = null;
let dragging = false;
let lastPointer = null;

const aim = { yaw: Math.PI, pitch: -0.1, targetYaw: Math.PI, targetPitch: -0.1 };

// Tạo môi trường sân chơi đơn giản
function createScenery() {
  scene.add(new THREE.HemisphereLight("#e3f3e7", "#30412e", 1.8));
  const sun = new THREE.DirectionalLight("#fff1d2", 2.5);
  sun.position.set(-5, 12, 5);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: "#527849", roughness: 0.8 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Cổng thành
  const gateWall = new THREE.Mesh(
    new THREE.BoxGeometry(10, 4, 1),
    new THREE.MeshStandardMaterial({ color: "#8c7853" })
  );
  gateWall.position.set(0, 2, -18);
  scene.add(gateWall);
}

// Tạo kẻ địch (máy bay / côn trùng)
function spawnEnemy() {
  if (gameState !== "playing") return;
  const isInsect = Math.random() > 0.5;
  const geometry = isInsect ? new THREE.BoxGeometry(1.2, 0.8, 1.2) : new THREE.ConeGeometry(0.8, 2, 8);
  const color = isInsect ? "#8f5a3b" : "#566c68";
  
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
  const startX = (Math.random() - 0.5) * 10;
  const startZ = 40;
  mesh.position.set(startX, isInsect ? 1 : 15, startZ);
  scene.add(mesh);

  enemies.push({
    mesh,
    isInsect,
    hp: isInsect ? 2 : 1,
    speed: isInsect ? 4 : 6,
    scoreValue: isInsect ? 150 : 100
  });
}

// Bắn đạn
function shoot() {
  if (gameState !== "playing" || fireCooldown > 0) return;
  fireCooldown = 0.12;

  camera.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const bulletGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const bulletMat = new THREE.MeshBasicMaterial({ color: "#ffea75" });
  const bullet = new THREE.Mesh(bulletGeo, bulletMat);
  
  bullet.position.copy(camera.position).addScaledVector(dir, 1);
  scene.add(bullet);

  bullets.push({
    mesh: bullet,
    velocity: dir.multiplyScalar(50),
    age: 0
  });
}

// Khởi động / Chơi lại game (Chống kẹt cảm ứng 100%)
const handleStartGame = (event) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  score = 0;
  kills = 0;
  gateHealth = maxGateHealth;
  enemies.forEach(e => scene.remove(e.mesh));
  bullets.forEach(b => scene.remove(b.mesh));
  enemies.length = 0;
  bullets.length = 0;

  scoreLabel.textContent = "0000";
  killsLabel.textContent = "0";
  gateFill.style.width = "100%";

  overlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  gameState = "playing";
};

// Đăng ký sự kiện nút bấm siêu nhạy cho Mobile & PC
[startButton, restartButton].forEach(btn => {
  if (btn) {
    btn.addEventListener("pointerdown", handleStartGame, { passive: false });
    btn.addEventListener("click", handleStartGame);
  }
});

fireButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  fireHeld = true;
  shoot();
});
window.addEventListener("pointerup", () => { fireHeld = false; });

// Điều khiển góc nhìn bằng cảm ứng vuốt màn hình
viewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
});

window.addEventListener("pointermove", (event) => {
  if (!dragging || gyroEnabled || !lastPointer) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  lastPointer = { x: event.clientX, y: event.clientY };

  aim.targetYaw -= dx * 0.004;
  aim.targetPitch = Math.max(-0.6, Math.min(0.6, aim.targetPitch - dy * 0.004));
});

window.addEventListener("pointerup", () => {
  dragging = false;
  lastPointer = null;
});

// Vòng lặp game chính (Animation Loop)
let spawnTimer = 2;
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  // Mượt hóa góc nhìn camera
  aim.yaw += (aim.targetYaw - aim.yaw) * 15 * delta;
  aim.pitch += (aim.targetPitch - aim.pitch) * 15 * delta;
  camera.rotation.y = aim.yaw;
  camera.rotation.x = aim.pitch;

  if (gameState === "playing") {
    fireCooldown = Math.max(0, fireCooldown - delta);
    if (fireHeld && fireCooldown <= 0) shoot();

    // Sinh kẻ địch định kỳ
    spawnTimer -= delta;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = Math.max(1, 2.5 - kills * 0.05);
    }

    // Cập nhật đạn
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.age += delta;
      b.mesh.position.addScaledVector(b.velocity, delta);
      if (b.age > 2) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        continue;
      }

      // Va chạm đạn với địch
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (b.mesh.position.distanceTo(e.mesh.position) < 1.2) {
          e.hp -= 1;
          scene.remove(b.mesh);
          bullets.splice(i, 1);

          if (e.hp <= 0) {
            scene.remove(e.mesh);
            enemies.splice(j, 1);
            kills += 1;
            score += e.scoreValue;
            scoreLabel.textContent = String(score).padStart(4, "0");
            killsLabel.textContent = String(kills);
          }
          break;
        }
      }
    }

    // Cập nhật địch di chuyển
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const targetPos = new THREE.Vector3(0, 1, -18);
      e.mesh.position.lerp(targetPos, e.speed * delta * 0.08);

      // Địch tới cổng thành gây sát thương
      if (e.mesh.position.distanceTo(targetPos) < 2.5) {
        scene.remove(e.mesh);
        enemies.splice(i, 1);
        gateHealth -= 1;
        gateFill.style.width = `${(gateHealth / maxGateHealth) * 100}%`;

        if (gateHealth <= 0) {
          gameState = "over";
          document.querySelector("#final-score").textContent = String(score).padStart(4, "0");
          gameOverOverlay.classList.remove("hidden");
        }
      }
    }
  }

  renderer.render(scene, camera);
}

createScenery();
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});