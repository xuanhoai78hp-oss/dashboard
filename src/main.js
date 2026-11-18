import * as THREE from "three";

const viewport = document.querySelector("#viewport");
const scoreLabel = document.querySelector("#score");
const killsLabel = document.querySelector("#kills");
const levelProgressLabel = document.querySelector("#level-progress");
const gateFill = document.querySelector("#gate-fill");
const statusLabel = document.querySelector("#status");
const enemyCountLabel = document.querySelector("#enemy-count");
const overlay = document.querySelector("#overlay");
const gameOverOverlay = document.querySelector("#game-over");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const bowlingLink = document.querySelector("#bowling-link");
const gyroButton = document.querySelector("#gyro-button");
const recenterButton = document.querySelector("#recenter-button");
const fireButton = document.querySelector("#fire-button");
const aimZoom = document.querySelector("#aim-zoom");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#9cc9ce");
scene.fog = new THREE.Fog("#9cc9ce", 25, 95);

const camera = new THREE.PerspectiveCamera(67, 1, 0.1, 100);
camera.position.set(0, 8.4, -18.5);
camera.rotation.order = "YXZ";
const zoomCamera = new THREE.PerspectiveCamera(12, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
viewport.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const enemies = [];
const flameJets = [];
const paratroopers = [];
const particles = [];
const decorations = [];
const startingYaw = Math.PI;
const startingPitch = -0.16;
const maxActiveEnemies = 4;
const aim = {
  yaw: startingYaw,
  pitch: startingPitch,
  targetYaw: startingYaw,
  targetPitch: startingPitch,
};
const maxGateHealth = 8;
const maxFireCooldown = 0.1;
const aircraftColors = ["#566c68", "#8a5948"];
const aircraftAltitude = 20;
const barrels = [];
let machineGun = null;
let gunRecoil = 0;
const shared = {
  sphere: new THREE.SphereGeometry(1, 12, 9),
  flameOuter: new THREE.ConeGeometry(0.3, 5.2, 8),
  flameInner: new THREE.ConeGeometry(0.15, 3.8, 8),
  flameOuterMaterial: new THREE.MeshBasicMaterial({
    color: "#ff762e",
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  flameInnerMaterial: new THREE.MeshBasicMaterial({
    color: "#fff1a1",
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
};

let gameState = "ready";
let score = 0;
let kills = 0;
let level = 1;
let fireRatePercent = 50;
let gateHealth = maxGateHealth;
let wave = 1;
let spawnTimer = 2.8;
let fireCooldown = 0;
let fireHeld = false;
let audioContext = null;
let gyroEnabled = false;
let gyroOrigin = null;
let dragging = false;
let lastPointer = null;

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...options });

function addBox(width, height, depth, position, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color, options));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addCylinder(radiusTop, radiusBottom, height, position, color, segments = 10) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createScenery() {
  scene.add(new THREE.HemisphereLight("#e3f3e7", "#30412e", 2.05));
  const sun = new THREE.DirectionalLight("#fff1d2", 3.1);
  sun.position.set(-8, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), material("#527849"));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  const path = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 37), material("#a79365"));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.005, -8.5);
  path.receiveShadow = true;
  scene.add(path);

  const pathEdgeMaterial = material("#c8b787");
  for (const x of [-2.85, 2.85]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 37), pathEdgeMaterial);
    edge.position.set(x, 0.035, -8.5);
    edge.receiveShadow = true;
    scene.add(edge);
  }

  for (let i = 0; i < 21; i += 1) {
    const z = 9 - i * 1.45;
    if (z < -18) break;
    for (const side of [-1, 1]) {
      const x = side * (4.4 + (i % 3) * 1.3);
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.65 + (i % 2) * 0.25, 1.1 + (i % 4) * 0.22, 5),
        material(i % 2 ? "#365f43" : "#47734a"),
      );
      tuft.position.set(x, 0.55, z);
      tuft.rotation.y = side * 0.25;
      tuft.castShadow = true;
      scene.add(tuft);
      decorations.push(tuft);
    }
  }

  createAncientTree();
  createCastleGate();
}

function createAncientTree() {
  const treeX = -6.2;
  const treeZ = -5.8;
  addCylinder(0.38, 0.83, 7.3, [treeX, 3.55, treeZ], "#62472f", 12);

  const branchMaterial = material("#6b4c32");
  const addBranch = (from, to, radius) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.58, radius, direction.length(), 8),
      branchMaterial,
    );
    branch.position.copy(start.add(end).multiplyScalar(0.5));
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    branch.castShadow = true;
    scene.add(branch);
  };
  addBranch([treeX, 4.7, treeZ], [-8.7, 7.1, treeZ - 0.5], 0.34);
  addBranch([treeX, 5.3, treeZ], [-3.6, 7.5, treeZ + 0.4], 0.32);
  addBranch([treeX, 5.1, treeZ], [treeX - 0.1, 8.6, treeZ], 0.37);
  addBranch([treeX, 4.4, treeZ], [-7.3, 5.9, treeZ + 1.4], 0.26);
  addBranch([treeX, 4.9, treeZ], [-4.7, 6.1, treeZ - 1.2], 0.25);

  const leafColors = ["#315e42", "#3d714b", "#4b7e4c", "#547d48"];
  const crowns = [
    [-7.8, 7.7, treeZ - 0.2, 2.7],
    [-5.7, 8.6, treeZ, 3.15],
    [-3.7, 7.8, treeZ + 0.4, 2.7],
    [-6.9, 6.6, treeZ + 1.1, 2.2],
    [-4.9, 6.7, treeZ - 1, 2.2],
  ];
  crowns.forEach(([x, y, z, size], index) => {
    const crown = new THREE.Mesh(shared.sphere, material(leafColors[index % leafColors.length], { roughness: 1 }));
    crown.position.set(x, y, z);
    crown.scale.set(size, size * 0.78, size * 0.88);
    crown.castShadow = true;
    crown.receiveShadow = true;
    scene.add(crown);
  });
}

function createCastleGate() {
  const wallColor = "#b9a783";
  addBox(11.5, 4.2, 1.05, [-7.15, 2.1, -20], wallColor);
  addBox(11.5, 4.2, 1.05, [7.15, 2.1, -20], wallColor);
  addBox(5.5, 1.2, 1.05, [0, 5.35, -20], "#a9936c");
  addBox(4.5, 3.4, 0.36, [0, 1.7, -19.38], "#463e31");

  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(2.28, 0.32, 8, 28, Math.PI),
    material("#e1cc9c"),
  );
  arch.position.set(0, 3.15, -19.42);
  arch.castShadow = true;
  scene.add(arch);

  for (const x of [-12.5, 12.5]) {
    addBox(2.15, 8, 2, [x, 4, -20], "#9c8966");
    addBox(2.4, 0.42, 2.25, [x, 8.2, -20], "#776849");
    for (let i = -1; i <= 1; i += 1) {
      addBox(0.42, 0.7, 0.45, [x + i * 0.66, 8.7, -20], "#776849");
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      addBox(0.42, 0.58, 0.42, [side * (4.5 + i * 1.4), 4.55, -20], "#9d8966");
    }
  }
}

function createMachineGun() {
  machineGun = new THREE.Group();
  const gun = machineGun;
  const gunMetal = material("#343b39", { metalness: 0.7, roughness: 0.32 });
  const gripMaterial = material("#5c4635");
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.55), gunMetal);
  receiver.position.set(0, 0, 0.05);
  gun.add(receiver);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), gunMetal);
  sight.position.set(0, 0.13, -0.12);
  gun.add(sight);
  for (const side of [-1, 1]) {
    const barrel = new THREE.Group();
    barrel.position.set(side * 0.2, 0.045, -0.08);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.82, 10), gunMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = -0.38;
    barrel.add(tube);

    const muzzle = new THREE.Group();
    muzzle.position.z = -0.8;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.052, 0.012, 6, 12),
      material("#a5aaa1", { metalness: 0.8, roughness: 0.25 }),
    );
    muzzle.add(rim);

    const flash = new THREE.Group();
    const outerFlare = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.4, 8),
      new THREE.MeshBasicMaterial({ color: "#ff762e", transparent: true, opacity: 0.9 }),
    );
    outerFlare.rotation.x = -Math.PI / 2;
    outerFlare.position.z = -0.17;
    flash.add(outerFlare);
    const innerFlare = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.28, 8),
      new THREE.MeshBasicMaterial({ color: "#fff1a1", transparent: true, opacity: 0.95 }),
    );
    innerFlare.rotation.x = -Math.PI / 2;
    innerFlare.position.z = -0.12;
    flash.add(innerFlare);
    flash.visible = false;
    muzzle.add(flash);
    const light = new THREE.PointLight("#ff9a42", 0, 2.8);
    light.position.z = -0.1;
    muzzle.add(light);
    barrel.add(muzzle);
    gun.add(barrel);
    barrels.push({ group: barrel, muzzle, flash, light, kick: 0, flashTime: 0 });

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.23, 0.14), gripMaterial);
    grip.position.set(side * 0.2, -0.19, 0.16);
    grip.rotation.x = -0.18;
    gun.add(grip);
  }
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.28), gunMetal);
  stock.position.z = 0.42;
  gun.add(stock);
  gun.position.set(0.28, -0.48, -1.05);
  camera.add(gun);
  scene.add(camera);
}

function updateMachineGun(delta) {
  if (!machineGun) return;
  gunRecoil *= Math.exp(-delta * 20);
  machineGun.position.z = -1.05 + gunRecoil;
  machineGun.rotation.x = -gunRecoil * 0.35;
  for (const barrel of barrels) {
    barrel.kick *= Math.exp(-delta * 26);
    barrel.group.position.z = -0.08 + barrel.kick;
    barrel.flashTime = Math.max(0, barrel.flashTime - delta);
    const intensity = barrel.flashTime / 0.075;
    barrel.flash.visible = intensity > 0;
    barrel.flash.scale.setScalar(0.72 + intensity * 0.45);
    barrel.light.intensity = intensity * 2.8;
  }
}

function createAircraft(type) {
  const group = new THREE.Group();
  const bodyColor = aircraftColors[type];
  const bodyMaterial = material(bodyColor, { metalness: 0.35, roughness: 0.55 });
  const wingMaterial = material(type === 0 ? "#9aa28e" : "#776b60", { metalness: 0.25 });
  const cockpitMaterial = material("#83c5cb", { metalness: 0.55, roughness: 0.2 });
  const addPart = (geometry, partMaterial, position, rotation = [0, 0, 0]) => {
    const part = new THREE.Mesh(geometry, partMaterial);
    part.position.set(...position);
    part.rotation.set(...rotation);
    part.castShadow = true;
    part.receiveShadow = true;
    group.add(part);
    return part;
  };
  addPart(new THREE.CylinderGeometry(0.12, type === 0 ? 0.24 : 0.3, 2.05, 8), bodyMaterial, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  addPart(new THREE.ConeGeometry(0.2, 0.62, 8), bodyMaterial, [0, 0, -1.27], [-Math.PI / 2, 0, 0]);
  addPart(new THREE.BoxGeometry(type === 0 ? 2.6 : 3.1, 0.1, 0.64), wingMaterial, [0, -0.02, 0.08], [0, 0, type === 0 ? -0.06 : 0.04]);
  addPart(new THREE.BoxGeometry(type === 0 ? 0.98 : 1.3, 0.08, 0.38), bodyMaterial, [0, 0.03, 0.82]);
  addPart(new THREE.BoxGeometry(0.1, 0.48, 0.42), bodyMaterial, [0, 0.23, 0.82]);
  const cockpit = addPart(new THREE.SphereGeometry(0.19, 10, 7), cockpitMaterial, [0, 0.2, -0.35]);
  cockpit.scale.set(0.8, 0.75, 1.3);

  if (type === 0) {
    addPart(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), bodyMaterial, [0, 0, -1.83], [0, 0, Math.PI / 2]);
  } else {
    for (const side of [-1, 1]) {
      const engine = addPart(new THREE.CylinderGeometry(0.13, 0.16, 0.55, 8), bodyMaterial, [side * 0.83, -0.08, 0.02], [-Math.PI / 2, 0, 0]);
      engine.scale.set(1, 1, 0.75);
    }
  }
  group.scale.setScalar(type === 0 ? 1 : 1.14);
  return group;
}

function spawnAircraft(type, x, z, path) {
  const group = createAircraft(type);
  group.position.set(x, aircraftAltitude, z);
  scene.add(group);
  const enemy = {
    group,
    type,
    color: aircraftColors[type],
    alive: true,
    hp: type === 0 ? 2 : 3,
    scoreValue: type === 0 ? 250 : 350,
    age: 0,
    speed: type === 0 ? 5.4 : 4.5,
    startX: x,
    path,
    seed: Math.random() * Math.PI * 2,
    startZ: z,
    dropTimer: 1.4 + Math.random() * 1.8,
  };
  enemies.push(enemy);
  return enemy;
}

function addCrawlerSegment(parent, start, end, radius, color) {
  const startPoint = new THREE.Vector3(...start);
  const endPoint = new THREE.Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const segment = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 6),
    material(color),
  );
  segment.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
  segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  segment.castShadow = true;
  parent.add(segment);
  return segment;
}

function createCrawler(type) {
  const group = new THREE.Group();
  const legs = [];
  const wheels = [];
  const addPart = (geometry, color, position, scale = [1, 1, 1], options = {}) => {
    const part = new THREE.Mesh(geometry, material(color, options));
    part.position.set(...position);
    part.scale.set(...scale);
    part.castShadow = true;
    part.receiveShadow = true;
    group.add(part);
    return part;
  };

  if (type === 0) {
    addPart(new THREE.SphereGeometry(0.38, 10, 8), "#536c32", [0, 0.3, 0.15], [1, 0.78, 1.2]);
    addPart(new THREE.SphereGeometry(0.25, 10, 8), "#698747", [0, 0.32, -0.23]);
    addPart(new THREE.SphereGeometry(0.19, 8, 6), "#4b5c2c", [0, 0.3, -0.48]);
    for (const side of [-1, 1]) {
      addPart(new THREE.SphereGeometry(0.055, 6, 5), "#f6d472", [side * 0.11, 0.37, -0.57]);
      for (const z of [-0.27, 0, 0.27]) {
        legs.push(addCrawlerSegment(group, [side * 0.17, 0.2, z], [side * 0.48, -0.08, z + 0.08], 0.04, "#354324"));
      }
    }
  } else if (type === 1) {
    addPart(new THREE.SphereGeometry(0.48, 10, 8), "#8f5a3b", [0, 0.3, 0.08], [0.62, 0.55, 1.55]);
    addPart(new THREE.SphereGeometry(0.25, 10, 8), "#a76b43", [0, 0.29, -0.55], [0.9, 0.78, 1.25]);
    const tail = addPart(new THREE.ConeGeometry(0.17, 0.65, 7), "#70452f", [0, 0.28, 0.78]);
    tail.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      for (const z of [-0.35, 0.42]) {
        legs.push(addCrawlerSegment(group, [side * 0.15, 0.18, z], [side * 0.36, -0.08, z + 0.06], 0.055, "#593c2d"));
      }
    }
  } else {
    addPart(new THREE.BoxGeometry(0.88, 0.32, 0.92), "#596552", [0, 0.31, 0.06], [1, 1, 1], { metalness: 0.45 });
    addPart(new THREE.CylinderGeometry(0.25, 0.3, 0.24, 8), "#768064", [0, 0.57, -0.05], [1, 1, 1], { metalness: 0.4 });
    const cannon = addPart(new THREE.CylinderGeometry(0.065, 0.08, 0.75, 8), "#333b35", [0, 0.59, -0.53], [1, 1, 1], { metalness: 0.65 });
    cannon.rotation.x = -Math.PI / 2;
    for (const side of [-1, 1]) {
      for (const z of [-0.29, 0.34]) {
        const wheel = addPart(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 8), "#292e2a", [side * 0.46, 0.2, z]);
        wheel.rotation.z = Math.PI / 2;
        wheels.push(wheel);
      }
    }
  }
  return { group, legs, wheels };
}

function spawnParatrooper(aircraft) {
  const type = Math.floor(Math.random() * 3);
  const config = [
    { color: "#536c32", hp: 2, speed: 4.1, gateDamage: 1, score: 100, canopy: "#b65c45" },
    { color: "#8f5a3b", hp: 2.5, speed: 3.7, gateDamage: 1, score: 125, canopy: "#b88a4e" },
    { color: "#596552", hp: 3, speed: 3.1, gateDamage: 2, score: 175, canopy: "#657d91" },
  ][type];
  const group = new THREE.Group();
  const crawler = createCrawler(type);
  crawler.group.position.y = 0.1;
  group.add(crawler.group);

  const parachute = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    material(config.canopy, { side: THREE.DoubleSide, roughness: 0.95 }),
  );
  canopy.scale.y = 0.58;
  canopy.position.y = 2.05;
  canopy.castShadow = true;
  parachute.add(canopy);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    addCrawlerSegment(
      parachute,
      [Math.cos(angle) * 0.72, 1.98, Math.sin(angle) * 0.72],
      [0, 0.55, 0],
      0.012,
      "#e6dec4",
    );
  }
  group.add(parachute);

  group.position.copy(aircraft.group.position);
  group.position.y -= 0.6;
  scene.add(group);
  paratroopers.push({
    group,
    parachute,
    legs: crawler.legs,
    wheels: crawler.wheels,
    type,
    isParatrooper: true,
    color: config.color,
    hp: config.hp,
    speed: config.speed,
    gateDamage: config.gateDamage,
    scoreValue: config.score,
    alive: true,
    state: "parachuting",
    age: 0,
    walkPhase: Math.random() * Math.PI * 2,
  });
}

function startGame() {
  clearGameObjects();
  score = 0;
  kills = 0;
  level = 1;
  fireRatePercent = 50;
  gateHealth = maxGateHealth;
  wave = 1;
  spawnTimer = 2.8;
  fireCooldown = 0;
  fireHeld = false;
  aim.yaw = startingYaw;
  aim.targetYaw = startingYaw;
  aim.pitch = startingPitch;
  aim.targetPitch = startingPitch;
  gameState = "playing";
  overlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  bowlingLink.classList.add("hidden");
  statusLabel.textContent = "THỦ THÀNH";
  updateHud();
  spawnAircraft(Math.floor(Math.random() * 2), -3.6, 48, 0);
  spawnAircraft(Math.floor(Math.random() * 2), 3.6, 57, 2);
  unlockAudio();
}

function clearGameObjects() {
  for (const paratrooper of paratroopers) {
    if (paratrooper.alive) disposeObject3D(paratrooper.group);
  }
  for (const collection of [enemies, flameJets, paratroopers, particles]) {
    for (const item of collection) scene.remove(item.group ?? item.mesh);
    collection.length = 0;
  }
}

function endGame(won = false) {
  gameState = "over";
  document.querySelector("#final-score").textContent = String(score).padStart(4, "0");
  if (won) {
    document.querySelector("#result-title").innerHTML = "Cổng thành<br /><em>đã an toàn!</em>";
    document.querySelector("#result-copy").textContent =
      "Bạn đã đạt tốc độ bắn 100%! Phần thưởng của bạn là một kỳ nghỉ xứng đáng.";
    bowlingLink.classList.remove("hidden");
    statusLabel.textContent = "ĐÃ QUA CỬA";
  } else {
    document.querySelector("#result-title").innerHTML = "Cổng thành<br /><em>đã thất thủ.</em>";
    document.querySelector("#result-copy").textContent = "Kẻ địch đã áp sát và gây hư hại cổng thành.";
    bowlingLink.classList.add("hidden");
    statusLabel.textContent = "KẾT THÚC";
  }
  gameOverOverlay.classList.remove("hidden");
}

function updateHud() {
  scoreLabel.textContent = String(score).padStart(4, "0");
  killsLabel.textContent = String(kills);
  levelProgressLabel.textContent = `CẤP ${level} · ${fireRatePercent}%`;
  gateFill.style.width = `${Math.max(0, (gateHealth / maxGateHealth) * 100)}%`;
  const activeTargets =
    enemies.filter((enemy) => enemy.alive).length + paratroopers.filter((paratrooper) => paratrooper.alive).length;
  enemyCountLabel.textContent = `${activeTargets} MỤC TIÊU`;
}

function removeParatrooper(paratrooper) {
  if (!paratrooper.alive) return;
  paratrooper.alive = false;
  scene.remove(paratrooper.group);
  disposeObject3D(paratrooper.group);
}

function disposeObject3D(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) {
      object.material.forEach((item) => item.dispose());
    } else {
      object.material?.dispose();
    }
  });
}

function recordParatrooperKill(paratrooper) {
  kills += 1;
  score += paratrooper.scoreValue;
  const nextLevel = Math.floor(kills / 10) + 1;
  if (nextLevel > level) {
    level = nextLevel;
    fireRatePercent = Math.min(100, 50 + (level - 1) * 5);
    if (fireRatePercent === 100) endGame(true);
  }
}

function ensureAudio() {
  if (audioContext) return audioContext;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return null;
  audioContext = new AudioContextType();
  return audioContext;
}

function unlockAudio() {
  const context = ensureAudio();
  if (context?.state === "suspended") void context.resume();
}

function playTone({ frequency, endFrequency, duration, type, volume, delay = 0 }) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playShootSound() {
  playTone({ frequency: 210, endFrequency: 72, duration: 0.075, type: "square", volume: 0.07 });
  playTone({ frequency: 860, endFrequency: 280, duration: 0.045, type: "triangle", volume: 0.025, delay: 0.008 });
}

function playHitSound() {
  playTone({ frequency: 210, endFrequency: 58, duration: 0.19, type: "sawtooth", volume: 0.17 });
  playTone({ frequency: 740, endFrequency: 180, duration: 0.12, type: "square", volume: 0.045 });
}

function shoot() {
  if (gameState !== "playing" || fireCooldown > 0) return;
  fireCooldown = maxFireCooldown * (100 / fireRatePercent);
  playShootSound();
  gunRecoil = 0.065;
  camera.updateMatrixWorld(true);
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  for (const barrel of barrels) {
    barrel.kick = 0.11;
    barrel.flashTime = 0.075;
    const position = barrel.muzzle.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 0.08);
    const flame = new THREE.Group();
    const outerFlame = new THREE.Mesh(shared.flameOuter, shared.flameOuterMaterial);
    outerFlame.position.y = 2.6;
    const innerFlame = new THREE.Mesh(shared.flameInner, shared.flameInnerMaterial);
    innerFlame.position.y = 1.9;
    flame.add(outerFlame, innerFlame);
    flame.position.copy(position);
    flame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    scene.add(flame);
    flameJets.push({
      group: flame,
      velocity: direction.clone().multiplyScalar(45),
      age: 0,
      previous: position.clone(),
      flicker: Math.random() * Math.PI * 2,
    });
  }
}

function pointSegmentDistance(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared === 0) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1);
  return point.distanceTo(start.addScaledVector(segment, t));
}

function removeFlameJet(index) {
  const [flameJet] = flameJets.splice(index, 1);
  scene.remove(flameJet.group);
}

function removeEnemy(enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  scene.remove(enemy.group);
}

function createBurst(position, color) {
  const palette = [color, "#ffe68a", "#ffae6c", "#a7f4ff", "#fff4d5"];
  for (let i = 0; i < 30; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 + Math.random() * 0.045, 5, 5),
      new THREE.MeshBasicMaterial({
        color: palette[i % palette.length],
        transparent: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.position.copy(position);
    scene.add(mesh);
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 1.7,
      Math.random() * 2 - 1,
    ).normalize();
    particles.push({
      mesh,
      velocity: direction.multiplyScalar(2 + Math.random() * 5),
      age: 0,
      life: 0.65 + Math.random() * 0.5,
    });
  }
  const flash = new THREE.PointLight("#ffe08a", 5, 5);
  flash.position.copy(position);
  scene.add(flash);
  particles.push({ mesh: flash, velocity: new THREE.Vector3(), age: 0, life: 0.18 });
}

function updateFlameJets(delta) {
  const targets = [
    ...enemies.map((enemy) => ({ enemy, radius: enemy.type === 0 ? 1.15 : 1.35 })),
    ...paratroopers.map((paratrooper) => ({
      enemy: paratrooper,
      radius: paratrooper.state === "parachuting" ? 1.45 : 1.1,
    })),
  ];
  for (let i = flameJets.length - 1; i >= 0; i -= 1) {
    const flameJet = flameJets[i];
    flameJet.age += delta;
    flameJet.previous.copy(flameJet.group.position);
    flameJet.group.position.addScaledVector(flameJet.velocity, delta);
    flameJet.group.scale.setScalar(0.88 + Math.sin(flameJet.age * 42 + flameJet.flicker) * 0.12);
    let hit = false;
    for (const { enemy, radius } of targets) {
      if (!enemy.alive || pointSegmentDistance(enemy.group.position, flameJet.previous, flameJet.group.position) >= radius) {
        continue;
      }
      enemy.hp -= 0.5;
      playHitSound();
      createBurst(flameJet.group.position, enemy.color);
      if (enemy.hp <= 0) {
        if (enemy.isParatrooper) {
          recordParatrooperKill(enemy);
          removeParatrooper(enemy);
        } else {
          score += enemy.scoreValue;
          removeEnemy(enemy);
        }
      }
      hit = true;
      break;
    }

    if (hit || flameJet.age > 1.8) removeFlameJet(i);
    if (gameState !== "playing") break;
  }
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.age += delta;
    enemy.group.position.z -= enemy.speed * delta;
    const progress = THREE.MathUtils.clamp((enemy.startZ - enemy.group.position.z) / (enemy.startZ + 20), 0, 1);
    if (enemy.path === 0) {
      enemy.group.position.x = enemy.startX;
    } else if (enemy.path === 1) {
      enemy.group.position.x = THREE.MathUtils.lerp(enemy.startX, -enemy.startX, progress);
    } else if (enemy.path === 2) {
      enemy.group.position.x = enemy.startX + Math.sin(progress * Math.PI * 2 + enemy.seed) * 3;
    } else {
      enemy.group.position.x = enemy.startX + Math.sin(progress * Math.PI * 4 + enemy.seed) * 1.6;
    }
    enemy.group.position.y = aircraftAltitude + Math.sin(enemy.age * 1.6 + enemy.seed) * 0.3;
    enemy.group.rotation.z = enemy.path === 1 ? Math.sign(-enemy.startX) * 0.08 : Math.sin(enemy.age * 1.5) * 0.035;
    enemy.dropTimer -= delta;
    if (enemy.dropTimer <= 0) {
      spawnParatrooper(enemy);
      enemy.dropTimer = 2.4 + Math.random() * 1.8;
    }
    if (enemy.group.position.z < -22) {
      removeEnemy(enemy);
    }
  }
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    if (enemies.filter((enemy) => enemy.alive).length < maxActiveEnemies) {
      wave += 1;
      const x = (Math.random() * 2 - 1) * 4.8;
      spawnAircraft(Math.floor(Math.random() * 2), x, 48 + Math.random() * 12, Math.floor(Math.random() * 4));
    }
    spawnTimer = Math.max(1.6, 3.8 - wave * 0.12);
  }
}

function updateParatroopers(delta) {
  for (let index = paratroopers.length - 1; index >= 0; index -= 1) {
    const paratrooper = paratroopers[index];
    if (!paratrooper.alive) {
      paratroopers.splice(index, 1);
      continue;
    }

    paratrooper.age += delta;
    if (paratrooper.state === "parachuting") {
      paratrooper.group.position.y -= 2.4 * delta;
      paratrooper.group.rotation.z = Math.sin(paratrooper.age * 2.5) * 0.045;
      if (paratrooper.group.position.y <= 0.2) {
        paratrooper.group.position.y = 0.2;
        paratrooper.group.rotation.z = 0;
        paratrooper.group.remove(paratrooper.parachute);
        disposeObject3D(paratrooper.parachute);
        paratrooper.parachute = null;
        paratrooper.state = "ground";
      }
      continue;
    }

    paratrooper.group.position.x += (0 - paratrooper.group.position.x) * Math.min(1, delta * 0.22);
    paratrooper.group.position.z -= paratrooper.speed * delta;
    for (let leg = 0; leg < paratrooper.legs.length; leg += 1) {
      paratrooper.legs[leg].rotation.z =
        Math.sin(paratrooper.age * 12 + paratrooper.walkPhase + leg * Math.PI) * 0.18;
    }
    for (const wheel of paratrooper.wheels) {
      wheel.rotation.x += delta * paratrooper.speed * 3;
    }

    if (paratrooper.group.position.z <= -18.3) {
      gateHealth = Math.max(0, gateHealth - paratrooper.gateDamage);
      const impact = paratrooper.group.position.clone();
      impact.y = 0.2;
      createBurst(impact, paratrooper.color);
      playHitSound();
      removeParatrooper(paratrooper);
      paratroopers.splice(index, 1);
    }
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.age += delta;
    if (particle.age >= particle.life) {
      scene.remove(particle.mesh);
      particle.mesh.geometry?.dispose();
      if (particle.mesh.material?.dispose) particle.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.velocity.y -= 5.2 * delta;
    const fade = 1 - particle.age / particle.life;
    if (particle.mesh.material?.opacity !== undefined) particle.mesh.material.opacity = fade;
    if (particle.mesh.isPointLight) particle.mesh.intensity = fade * 5;
    particle.mesh.scale.setScalar(Math.max(0.05, fade));
  }
}

function updateAim(delta) {
  const blend = 1 - Math.exp(-delta * 12);
  aim.yaw += (aim.targetYaw - aim.yaw) * blend;
  aim.pitch += (aim.targetPitch - aim.pitch) * blend;
  camera.rotation.y = aim.yaw;
  camera.rotation.x = THREE.MathUtils.clamp(aim.pitch, -0.85, 0.7);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  updateAim(delta);
  updateMachineGun(delta);
  if (gameState === "playing") {
    fireCooldown = Math.max(0, fireCooldown - delta);
    if (fireHeld && fireCooldown <= 0) shoot();
    updateEnemies(delta);
    updateParatroopers(delta);
    updateFlameJets(delta);
    updateParticles(delta);
    updateHud();
    if (gateHealth <= 0 && gameState === "playing") endGame();
  } else {
    updateParticles(delta);
  }
  renderScene();
}

function renderScene() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  renderer.render(scene, camera);

  const zoomBounds = aimZoom.getBoundingClientRect();
  const viewportBounds = viewport.getBoundingClientRect();
  const inset = 2;
  const zoomWidth = Math.max(1, zoomBounds.width - inset * 2);
  const zoomHeight = Math.max(1, zoomBounds.height - inset * 2);
  const zoomLeft = zoomBounds.left - viewportBounds.left + inset;
  const zoomBottom = viewportBounds.bottom - zoomBounds.bottom + inset;

  zoomCamera.aspect = zoomWidth / zoomHeight;
  zoomCamera.position.copy(camera.position);
  zoomCamera.quaternion.copy(camera.quaternion);
  zoomCamera.updateProjectionMatrix();

  renderer.setViewport(zoomLeft, zoomBottom, zoomWidth, zoomHeight);
  renderer.setScissor(zoomLeft, zoomBottom, zoomWidth, zoomHeight);
  renderer.setScissorTest(true);
  renderer.render(scene, zoomCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
  if (event.target.closest("button")) return;
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!dragging || gyroEnabled || !lastPointer) return;
  const deltaX = event.clientX - lastPointer.x;
  const deltaY = event.clientY - lastPointer.y;
  lastPointer = { x: event.clientX, y: event.clientY };
  aim.targetYaw -= deltaX * 0.004;
  aim.targetPitch = THREE.MathUtils.clamp(aim.targetPitch - deltaY * 0.0035, -0.82, 0.65);
}

function onPointerUp() {
  dragging = false;
  lastPointer = null;
}

function angleDifference(value, origin) {
  return ((value - origin + 540) % 360) - 180;
}

function onDeviceOrientation(event) {
  if (!gyroEnabled || event.alpha === null || event.beta === null) return;
  if (!gyroOrigin) {
    gyroOrigin = { alpha: event.alpha, beta: event.beta, yaw: aim.targetYaw, pitch: aim.targetPitch };
    return;
  }
  aim.targetYaw = gyroOrigin.yaw + (angleDifference(event.alpha, gyroOrigin.alpha) * Math.PI) / 180;
  aim.targetPitch = THREE.MathUtils.clamp(
    gyroOrigin.pitch + ((event.beta - gyroOrigin.beta) * Math.PI) / 180,
    -0.82,
    0.65,
  );
}

async function enableGyro() {
  if (!("DeviceOrientationEvent" in window)) {
    statusLabel.textContent = "THIẾT BỊ KHÔNG CÓ GYRO";
    return;
  }
  const orientationEvent = window.DeviceOrientationEvent;
  if (typeof orientationEvent.requestPermission === "function") {
    const permission = await orientationEvent.requestPermission();
    if (permission !== "granted") {
      statusLabel.textContent = "GYRO CHƯA ĐƯỢC CẤP QUYỀN";
      return;
    }
  }
  gyroEnabled = true;
  gyroOrigin = null;
  window.addEventListener("deviceorientation", onDeviceOrientation);
  gyroButton.textContent = "GYRO ĐANG BẬT";
  recenterButton.disabled = false;
  statusLabel.textContent = "NGẮM BẰNG GYRO";
}

function recenterGyro() {
  gyroOrigin = null;
  statusLabel.textContent = "ĐÃ ĐẶT LẠI TÂM";
}

// Bắt sự kiện chạm/click nút vào trận tối ưu cho điện thoại
const handleStartGame = (event) => {
  event.preventDefault();
  event.stopPropagation();
  startGame();
};

startButton.addEventListener("pointerdown", handleStartGame);
startButton.addEventListener("click", handleStartGame);

restartButton.addEventListener("pointerdown", handleStartGame);
restartButton.addEventListener("click", handleStartGame);

fireButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  fireButton.setPointerCapture(event.pointerId);
  fireHeld = true;
  shoot();
});
fireButton.addEventListener("pointerup", () => {
  fireHeld = false;
});
fireButton.addEventListener("pointercancel", () => {
  fireHeld = false;
});
gyroButton.addEventListener("click", () => {
  enableGyro().catch((error) => {
    statusLabel.textContent = "KHÔNG THỂ BẬT GYRO";
    console.error("Could not enable device orientation controls.", error);
  });
});
recenterButton.addEventListener("click", recenterGyro);
window.addEventListener("resize", resize);
renderer.domElement.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (event.repeat) return;
    fireHeld = true;
    shoot();
  }
  if (event.code === "ArrowLeft" || event.code === "KeyA") aim.targetYaw += 0.045;
  if (event.code === "ArrowRight" || event.code === "KeyD") aim.targetYaw -= 0.045;
  if (event.code === "ArrowUp" || event.code === "KeyW") aim.targetPitch = Math.min(0.65, aim.targetPitch + 0.035);
  if (event.code === "ArrowDown" || event.code === "KeyS") aim.targetPitch = Math.max(-0.82, aim.targetPitch - 0.035);
});
window.addEventListener("keyup", (event) => {
  if (event.code === "Space") fireHeld = false;
});
window.addEventListener("blur", () => {
  fireHeld = false;
});

createScenery();
createMachineGun();
resize();
animate();