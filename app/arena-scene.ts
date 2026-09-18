import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createRobotModel,
  disposeObject,
  defaultMountSlots,
} from './robot-model';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { label, place, ring, setupScene, solid } from './scene-kit';
import {
  BLUE_BASE,
  BLUE_GOAL,
  FIELD_CENTER,
  FIELD_SIZE,
  RED_BASE,
  RED_GOAL,
  TILE,
  TILES,
} from './field';
import type { World } from './game-arena';
import { playerTarget } from './match-guidance';

export type CameraMode = 'arena' | 'follow' | 'orbit';
const SCALE = 0.02;
const blue = 0x359be5,
  red = 0xe65856;
const position = (x: number, z: number, y = 0.08) =>
  new THREE.Vector3((x - FIELD_CENTER) * SCALE, y, (z - FIELD_CENTER) * SCALE);

function artifact(color: string, radius = 0.28) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 14),
    new THREE.MeshStandardMaterial({
      color: color === 'P' ? 0x9156d9 : 0xa4c845,
      roughness: 0.78,
      metalness: 0,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.994, 0.015, 6, 32),
    new THREE.MeshStandardMaterial({
      color: color === 'P' ? 0x5b328c : 0x5a7b24,
      roughness: 0.8,
    }),
  );
  group.add(seam);
  const second = seam.clone();
  second.rotation.y = Math.PI / 2;
  group.add(second);
  return group;
}

function goal(
  scene: THREE.Scene,
  x: number,
  z: number,
  color: number,
  title: string,
) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  scene.add(root);
  place(root, solid(2.1, 0.2, 1.9, 0x273943, 0.5), 0, 0.14, 0);
  for (const a of [-0.74, 0.74]) {
    place(root, solid(0.1, 1.65, 0.1, 0xa4b5bf, 0.8), a, 0.94, -0.45);
    const brace = solid(0.09, 1.8, 0.09, 0x566c79, 0.7);
    brace.rotation.z = a < 0 ? -0.35 : 0.35;
    place(root, brace, a, 0.9, 0.3);
  }
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 0.44, 0.67, 8, 1, true),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.3,
      roughness: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  funnel.castShadow = true;
  place(root, funnel, 0, 1.45, 0);
  const lip = ring(0.88, color, 0.075);
  place(root, lip, 0, 1.8, 0);
  const inside = solid(0.75, 0.08, 0.75, 0x101c26);
  place(root, inside, 0, 1.07, 0);
  place(
    root,
    label(title, 1.5, 0.35, '#15232e', color === blue ? '#6ec7ff' : '#ff9290'),
    0,
    0.9,
    0.57,
  );
  place(root, label('SCORE HERE', 1.2, 0.22, '#15232e'), 0, 0.58, 0.57);
  return root;
}

// Soft EVA foam grain, used as a bump map so the mats catch the field lights
// the way real FTC tiles do.
function foamTexture() {
  const foam = document.createElement('canvas');
  foam.width = foam.height = 128;
  const ctx = foam.getContext('2d')!;
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const shade = 96 + ((i * 37) % 68);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(
      (i * 73) % 128,
      (Math.floor(i / 128) * 31 + i * 17) % 128,
      1,
      1,
    );
  }
  const texture = new THREE.CanvasTexture(foam);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

// One interlocking foam mat: a square with two puzzle tabs per edge. `edges`
// runs [back, right, front, left]; 1 pushes tabs outward, -1 cuts them inward,
// and 0 leaves the edge straight for the outside of the field.
function matShape(size: number, tab: number, edges: number[]) {
  const half = size / 2;
  const corners: [number, number][] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(corners[0][0], corners[0][1]);
  for (let edge = 0; edge < 4; edge++) {
    const [fromX, fromY] = corners[edge];
    const [toX, toY] = corners[(edge + 1) % 4];
    const direction = edges[edge];
    if (!direction) {
      shape.lineTo(toX, toY);
      continue;
    }
    // Unit vector along the edge. The corners wind counter-clockwise, so a
    // counter-clockwise half circle bulges out of the tile and a clockwise one
    // bites into it.
    const ux = Math.sign(toX - fromX);
    const uy = Math.sign(toY - fromY);
    const start = Math.atan2(-uy, -ux);
    for (const along of [0.28, 0.72]) {
      const cx = fromX + (toX - fromX) * along;
      const cy = fromY + (toY - fromY) * along;
      shape.lineTo(cx - ux * tab, cy - uy * tab);
      shape.absarc(cx, cy, tab, start, start + Math.PI, direction < 0);
    }
    shape.lineTo(toX, toY);
  }
  return shape;
}

function foamFloor(scene: THREE.Scene) {
  const bump = foamTexture();
  const material = new THREE.MeshStandardMaterial({
    color: 0x6a7174,
    roughness: 0.99,
    metalness: 0,
    bumpMap: bump,
    bumpScale: 0.02,
  });
  const size = TILE * SCALE;
  // Mats are cut a hair smaller than their grid cell so the seam between them
  // reads as a dark line, the way it does on a real field.
  const seam = 0.07;
  const tab = size * 0.105;
  const geometries: THREE.BufferGeometry[] = [];
  // A tab on one mat has to be a notch on its neighbour, so the seam direction
  // is decided once per seam and read from both sides.
  const vertical = (column: number, row: number) =>
    (column + row) % 2 === 0 ? 1 : -1;
  const horizontal = (column: number, row: number) =>
    (column + row) % 2 === 0 ? -1 : 1;
  for (let column = 0; column < TILES; column++)
    for (let row = 0; row < TILES; row++) {
      const edges = [
        row === 0 ? 0 : -horizontal(column, row - 1),
        column === TILES - 1 ? 0 : vertical(column, row),
        row === TILES - 1 ? 0 : horizontal(column, row),
        column === 0 ? 0 : -vertical(column - 1, row),
      ];
      const geometry = new THREE.ExtrudeGeometry(
        matShape(size - seam, tab, edges),
        {
          depth: 0.07,
          bevelEnabled: true,
          bevelThickness: 0.012,
          bevelSize: 0.012,
          bevelSegments: 1,
          curveSegments: 6,
        },
      );
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(
        (column + 0.5) * size - (TILES * size) / 2,
        0.07,
        (row + 0.5) * size - (TILES * size) / 2,
      );
      geometries.push(geometry);
    }
  const floor = new THREE.Mesh(mergeGeometries(geometries, false), material);
  geometries.forEach((geometry) => geometry.dispose());
  floor.receiveShadow = true;
  scene.add(floor);

  // Backing under the mats so the seams read as shaded grooves rather than
  // slots cut through to the floor below.
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(TILES * size, 0.06, TILES * size),
    new THREE.MeshStandardMaterial({ color: 0x4c5356, roughness: 1 }),
  );
  backing.position.y = 0.03;
  backing.receiveShadow = true;
  scene.add(backing);
}

function arenaRoom(scene: THREE.Scene) {
  const half = (FIELD_SIZE * SCALE) / 2;
  const rail = half * 2 + 0.3;
  place(scene, solid(70, 0.3, 60, 0x1c2c36), 0, -0.45, 0);
  place(scene, solid(rail + 0.8, 0.22, rail + 0.8, 0x0f1c24, 0.6), 0, -0.12, 0);
  foamFloor(scene);
  for (const x of [-half - 0.1, half + 0.1]) {
    place(scene, solid(0.12, 0.1, rail, 0xb7c5cd, 0.8), x, 0.67, 0);
    place(scene, solid(0.15, 0.2, rail, 0x293d49, 0.6), x, 0.13, 0);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.6, rail - 0.1),
      new THREE.MeshPhysicalMaterial({
        color: 0x9dbbca,
        transparent: true,
        opacity: 0.16,
        roughness: 0.1,
        depthWrite: false,
      }),
    );
    place(scene, wall, x, 0.36, 0);
    for (let z = -half; z <= half; z += TILE * SCALE)
      place(scene, solid(0.13, 0.72, 0.13, 0x7e949f, 0.8), x, 0.36, z);
  }
  for (const z of [-half - 0.1, half + 0.1]) {
    place(scene, solid(rail, 0.1, 0.12, 0xc3cfd4, 0.8), 0, 0.66, z);
    place(scene, solid(rail, 0.17, 0.16, 0x243844, 0.5), 0, 0.13, z);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(rail - 0.1, 0.55, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xa2c5d8,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    place(scene, wall, 0, 0.37, z);
    for (let x = -half; x <= half; x += TILE * SCALE)
      place(scene, solid(0.12, 0.7, 0.14, 0x7e949f, 0.8), x, 0.35, z);
  }
  for (const [base, color] of [
    [BLUE_BASE, blue],
    [RED_BASE, red],
  ] as const) {
    const spot = position(base.x, base.y);
    const tape = solid(2.5, 0.009, 2.1, color);
    place(scene, tape, spot.x, 0.06, spot.z);
    place(scene, solid(2.3, 0.015, 1.9, 0x384e60), spot.x, 0.066, spot.z);
    const marker = label('BASE', 1.2, 0.4, '#384e60', '#cfdee8');
    marker.rotation.x = -Math.PI / 2;
    place(scene, marker, spot.x, 0.085, spot.z + 0.26);
  }
  const center = new THREE.Mesh(
    new THREE.CylinderGeometry(1.36, 1.45, 0.65, 6),
    new THREE.MeshStandardMaterial({
      color: 0x586f7c,
      metalness: 0.65,
      roughness: 0.4,
    }),
  );
  center.castShadow = true;
  place(scene, center, 0, 0.35, 0.02);
  const obelisk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.88, 1.5, 3),
    new THREE.MeshStandardMaterial({
      color: 0xd7c79c,
      metalness: 0.4,
      roughness: 0.45,
    }),
  );
  obelisk.castShadow = true;
  place(scene, obelisk, 0, 1.38, 0.02);
  const pLabel = label('P  G  P', 1.25, 0.35, '#253947', '#e9c767');
  place(scene, pLabel, 0, 1.12, 0.8);
  const blueSpot = position(BLUE_GOAL.x, BLUE_GOAL.y);
  const redSpot = position(RED_GOAL.x, RED_GOAL.y);
  goal(scene, blueSpot.x, blueSpot.z, blue, 'BLUE GOAL');
  goal(scene, redSpot.x, redSpot.z, red, 'RED GOAL');
  for (let z = -5; z <= 5; z += 1)
    place(scene, solid(0.045, 0.008, 0.43, 0xd6bc74), 0, 0.07, z);
  // Open competition hall with trusses, real benches, and readable wayfinding.
  place(scene, solid(52, 14, 0.3, 0x1b2e3b), 0, 4, -17);
  place(scene, label('FIELD / LAB', 13, 2, '#1b2e3b'), 0, 5.7, -16.8);
  place(
    scene,
    label(
      'GARAGE CUP  /  FIRST TECH CHALLENGE OUTREACH',
      15,
      0.62,
      '#1b2e3b',
      '#a7bfce',
    ),
    0,
    3.9,
    -16.75,
  );
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      place(
        scene,
        solid(5.5, 0.35, 18, 0x354d5e),
        side * (16 + row * 1.6),
        row * 0.55 - 0.1,
        -1,
      );
      for (let z = -8; z < 8; z += 1.15) {
        place(
          scene,
          solid(0.75, 0.16, 0.75, side < 0 ? 0x315f7a : 0x74484b),
          side * (14.4 + row * 1.6),
          row * 0.55 + 0.17,
          z,
        );
      }
    }
    place(
      scene,
      label(
        side < 0 ? 'BLUE ALLIANCE' : 'RED ALLIANCE',
        7,
        0.8,
        '#132530',
        side < 0 ? '#62b6ed' : '#e7807d',
      ),
      side * 10,
      2.5,
      -13,
    );
  }
  for (const x of [-13, 13]) {
    place(scene, solid(0.22, 11, 0.22, 0x7d919c, 0.8), x, 5, -12);
    place(scene, solid(0.22, 11, 0.22, 0x7d919c, 0.8), x, 5, 9);
  }
  for (const z of [-12]) {
    place(scene, solid(26, 0.15, 0.2, 0x80939f, 0.8), 0, 10.5, z);
    place(scene, solid(26, 0.15, 0.2, 0x80939f, 0.8), 0, 9.8, z);
    for (let x = -12; x <= 12; x += 1.5) {
      const strut = solid(1.65, 0.08, 0.08, 0x80939f, 0.8);
      strut.rotation.z = 0.45;
      place(scene, strut, x, 10.15, z);
    }
  }
}

type Flight = {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  elapsed: number;
  duration: number;
  scored: boolean;
  collector?: number;
};

export function createArenaScene(
  canvas: HTMLCanvasElement,
  selected: Record<string, string>,
  world: World,
  mountSlots = defaultMountSlots,
) {
  const { scene, renderer, environment } = setupScene(canvas, 0x182936);
  arenaRoom(scene);
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 42;
  controls.maxPolarAngle = 1.35;
  let mode: CameraMode = 'arena';
  let width = 1,
    height = 1;
  const lookAt = new THREE.Vector3(0, 0, 0);
  const desiredPosition = new THREE.Vector3();
  const player = createRobotModel(selected, mountSlots);
  const bot = createRobotModel({
    drive: 'trailblazer',
    collect: 'twinflex',
    carry: 'lowbin',
    reach: 'swingarm',
    score: 'tiptray',
    assist: 'range',
  });
  for (const [model, color, name] of [
    [player, blue, 'ATLAS'],
    [bot, red, 'SCOUT-7'],
  ] as const) {
    model.root.scale.setScalar(0.235);
    scene.add(model.root);
    for (const side of [-1, 1]) {
      const plate = label(
        name,
        2.1,
        0.55,
        color === blue ? '#216c9f' : '#a84042',
      );
      plate.rotation.y = (side * Math.PI) / 2;
      place(model.root, plate, side * 2.55, 1.15, 0);
    }
  }
  const playerRing = ring(0.78, blue, 0.035);
  scene.add(playerRing);
  const botRing = ring(0.78, red, 0.025);
  scene.add(botRing);
  const aimRing = ring(0.42, 0xf0c35b, 0.027);
  scene.add(aimRing);
  const scoreRadius =
    (selected.reach === 'cascade'
      ? 150
      : selected.reach === 'turret'
        ? 138
        : selected.reach === 'elevator'
          ? 120
          : 108) * SCALE;
  const rangeRing = ring(scoreRadius, blue, 0.018);
  rangeRing.position.copy(position(95, 108));
  rangeRing.visible = selected.assist === 'range';
  scene.add(rangeRing);
  const pieces = new Map<number, THREE.Group>();
  world.pieces.forEach((piece) => {
    const mesh = artifact(piece.color);
    mesh.position.copy(position(piece.x, piece.y, 0.34));
    mesh.rotation.y = piece.id * 1.9;
    scene.add(mesh);
    pieces.set(piece.id, mesh);
  });
  const cargo = [new THREE.Group(), new THREE.Group()];
  player.root.add(cargo[0]);
  bot.root.add(cargo[1]);
  const cargoSignature = ['', ''];
  const flights: Flight[] = [];
  const scoreLabels = new Map<
    World['particles'][number],
    ReturnType<typeof label>
  >();
  const previousScores = [world.playerScore, world.botScore];
  const previousCarried = [[] as string[], [] as string[]];
  const previousVelocity = [new THREE.Vector2(), new THREE.Vector2()];
  const targetLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xefc456,
      dashSize: 0.16,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.8,
    }),
  );
  scene.add(targetLine);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  targetLine.frustumCulled = false;
  const resize = () => {
    const rect = canvas.parentElement!.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (mode === 'arena') resetArenaCamera();
  };
  // Framed off the mats so the whole square field fills the view.
  const fieldSpan = FIELD_SIZE * SCALE;
  const arenaDistance = () =>
    Math.max(fieldSpan * 1.15, (fieldSpan * 1.3) / camera.aspect);
  const resetArenaCamera = () => {
    const distance = arenaDistance();
    camera.position.set(0, distance * 0.76, distance * 0.78);
    controls.target.set(0, 0, -0.2);
    camera.lookAt(controls.target);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement!);
  resize();
  resetArenaCamera();
  let disposed = false;
  const render = (dt: number, state: World, paused: boolean) => {
    if (disposed) return;
    for (const particle of state.particles) {
      if (!particle.text || scoreLabels.has(particle)) continue;
      const text = label(particle.text, 1.05, 0.56, '#203542', '#f6d68d');
      text.material.transparent = true;
      text.material.depthTest = false;
      text.renderOrder = 5;
      scene.add(text);
      scoreLabels.set(particle, text);
    }
    for (const [particle, text] of scoreLabels) {
      if (particle.life <= 0) {
        scene.remove(text);
        disposeObject(text);
        scoreLabels.delete(particle);
        continue;
      }
      text.position.copy(
        position(particle.x, particle.y, 2.5 + (1 - particle.life) * 0.8),
      );
      text.quaternion.copy(camera.quaternion);
      text.material.opacity = Math.min(1, particle.life * 3);
    }
    const actors = [state.player, state.bot];
    const models = [player, bot];
    models.forEach((model, index) => {
      const actor = actors[index];
      model.root.position.copy(position(actor.x, actor.y, 0.07));
      const angle = Math.PI / 2 - actor.angle;
      const error = Math.atan2(
        Math.sin(angle - model.root.rotation.y),
        Math.cos(angle - model.root.rotation.y),
      );
      model.root.rotation.y += error * Math.min(1, dt * 14);
      const speed = Math.hypot(actor.vx, actor.vy);
      if (!paused) {
        const forward =
          actor.vx * Math.cos(actor.angle) + actor.vy * Math.sin(actor.angle);
        const turn = (error * Math.min(1, dt * 14)) / Math.max(dt, 0.001);
        model.moving.wheels.forEach((w) => {
          const travel = forward * SCALE + turn * w.position.x * 0.235;
          w.rotateX(
            ((travel * dt) / (0.55 * 0.235)) * (w.position.x < 0 ? -1 : 1),
          );
        });
        const acceleration = new THREE.Vector2(actor.vx, actor.vy).sub(
          previousVelocity[index],
        );
        const lean = motion.matches
          ? 0
          : THREE.MathUtils.clamp(
              (acceleration.dot(
                new THREE.Vector2(Math.cos(actor.angle), Math.sin(actor.angle)),
              ) /
                Math.max(dt, 0.001)) *
                0.000025,
              -0.025,
              0.025,
            );
        model.root.rotation.x = THREE.MathUtils.damp(
          model.root.rotation.x,
          lean,
          9,
          dt,
        );
        previousVelocity[index].set(actor.vx, actor.vy);
        const collecting = flights.some(
          (f) => !f.scored && f.collector === index,
        );
        model.moving.intake?.traverse((child) => {
          if (child.userData.roller)
            child.rotateY((collecting ? 24 : speed > 10 ? 5 : 0) * dt);
        });
      }
      const signature = actor.carried.join('');
      if (signature !== cargoSignature[index]) {
        disposeObject(cargo[index]);
        cargo[index].clear();
        actor.carried.forEach((color, i) => {
          const ball = artifact(color, 0.9);
          ball.userData.arrival = i >= previousCarried[index].length ? 0.42 : 0;
          place(
            cargo[index],
            ball,
            (i % 2) * 1.8 - 0.9,
            2.05 + Math.floor(i / 2) * 1.25,
            0.65,
          );
        });
        cargoSignature[index] = signature;
      }
      cargo[index].children.forEach((ball) => {
        if (!paused)
          ball.userData.arrival = Math.max(
            0,
            Number(ball.userData.arrival ?? 0) - dt,
          );
        ball.visible = ball.userData.arrival <= 0;
      });
      const score = index === 0 ? state.playerScore : state.botScore;
      if (score > previousScores[index] && state.time > 0) {
        const colors = previousCarried[index].slice(
          0,
          Math.max(1, previousCarried[index].length - actor.carried.length),
        );
        colors.forEach((color, i) => {
          const mesh = artifact(color);
          scene.add(mesh);
          flights.push({
            mesh,
            from: model.groups.score.localToWorld(
              new THREE.Vector3(0, 0.3, 0.35),
            ),
            to: position(index === 0 ? 95 : 905, 108, 1.8),
            elapsed: -i * 0.09,
            duration: 0.58,
            scored: true,
          });
        });
      }
      previousScores[index] = score;
      previousCarried[index] = [...actor.carried];
      const scoring = flights.some(
        (f) => f.scored && f.from.distanceTo(model.root.position) < 2.8,
      );
      const lift = model.moving.lift;
      if (lift)
        lift.position.y = THREE.MathUtils.damp(
          lift.position.y,
          Number(lift.userData.restY ?? 0) + (scoring ? 0.75 : 0),
          12,
          dt,
        );
      model.groups.score.position.y = THREE.MathUtils.damp(
        model.groups.score.position.y,
        (model.groups.score.userData.home as THREE.Vector3).y +
          (scoring ? 0.75 : 0),
        12,
        dt,
      );
    });
    state.pieces.forEach((piece) => {
      const mesh = pieces.get(piece.id)!;
      if (piece.active) {
        mesh.position.copy(position(piece.x, piece.y, 0.34));
        if (!paused) {
          mesh.rotation.x += ((piece.vy ?? 0) * SCALE * dt) / 0.28;
          mesh.rotation.z -= ((piece.vx ?? 0) * SCALE * dt) / 0.28;
        }
      }
      if (!piece.active && mesh.parent === scene) {
        const collectorIndex = piece.collector === 'bot' ? 1 : 0;
        scene.remove(mesh);
        const pickup = artifact(piece.color);
        scene.add(pickup);
        flights.push({
          mesh: pickup,
          from: position(piece.x, piece.y, 0.34),
          to: models[collectorIndex].root.localToWorld(
            new THREE.Vector3(0, 2, 0.65),
          ),
          elapsed: 0,
          duration: 0.42,
          scored: false,
          collector: collectorIndex,
        });
      }
    });
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (!paused) f.elapsed += dt;
      const t = THREE.MathUtils.clamp(f.elapsed / f.duration, 0, 1);
      f.mesh.visible = f.elapsed >= 0;
      if (f.collector !== undefined) {
        const root = models[f.collector].root;
        const mouth = root.localToWorld(new THREE.Vector3(0, 0.9, 3.1));
        f.to.copy(root.localToWorld(new THREE.Vector3(0, 2.05, 0.65)));
        if (t < 0.55) f.mesh.position.lerpVectors(f.from, mouth, t / 0.55);
        else f.mesh.position.lerpVectors(mouth, f.to, (t - 0.55) / 0.45);
      } else {
        f.mesh.position.lerpVectors(f.from, f.to, t);
        f.mesh.position.y += 4 * t * (1 - t) * 1.35;
      }
      if (!paused) f.mesh.rotation.z += dt * 6;
      if (t >= 1) {
        scene.remove(f.mesh);
        disposeObject(f.mesh);
        flights.splice(i, 1);
      }
    }
    playerRing.position.copy(position(state.player.x, state.player.y));
    botRing.position.copy(position(state.bot.x, state.bot.y));
    const target = playerTarget(state, selected);
    if (target) {
      aimRing.visible = true;
      aimRing.position.copy(position(target.x, target.y, 0.095));
      aimRing.scale.setScalar(target.kind === 'piece' ? 1 : 2.5);
      const attr = targetLine.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const start = position(state.player.x, state.player.y, 0.1),
        end = position(target.x, target.y, 0.1);
      attr.setXYZ(0, start.x, start.y, start.z);
      attr.setXYZ(1, end.x, end.y, end.z);
      attr.needsUpdate = true;
      targetLine.computeLineDistances();
      targetLine.visible =
        selected.assist === 'pathfinder' ||
        mode === 'follow' ||
        state.time <= 10;
    } else {
      aimRing.visible = false;
      targetLine.visible = false;
    }
    controls.enabled = mode === 'orbit';
    if (mode === 'follow') {
      const p = player.root.position;
      desiredPosition.set(p.x, 6, p.z + 8);
      const smoothing = motion.matches ? 1 : 1 - Math.exp(-6 * dt);
      camera.position.lerp(desiredPosition, smoothing);
      lookAt.lerp(new THREE.Vector3(p.x, 0.1, p.z - 2), smoothing);
      camera.lookAt(lookAt);
      controls.target.copy(lookAt);
    } else if (mode === 'orbit') controls.update();
    renderer.render(scene, camera);
  };
  return {
    render,
    setCamera(next: CameraMode) {
      mode = next;
      controls.enabled = next === 'orbit';
      if (next === 'arena') resetArenaCamera();
      if (next === 'follow') {
        const p = position(world.player.x, world.player.y);
        lookAt.set(p.x, 0.1, p.z - 2);
        camera.position.set(p.x, 6, p.z + 8);
        controls.target.copy(lookAt);
        camera.lookAt(lookAt);
      }
      if (next === 'orbit') controls.update();
    },
    movement(x: number, y: number) {
      const delta = camera.position.clone().sub(controls.target);
      const angle = Math.atan2(delta.x, delta.z);
      return {
        x: x * Math.cos(angle) + y * Math.sin(angle),
        y: -x * Math.sin(angle) + y * Math.cos(angle),
      };
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      disposeObject(scene);
      pieces.forEach((mesh) => {
        if (!mesh.parent) disposeObject(mesh);
      });
      environment.dispose();
      renderer.dispose();
    },
  };
}
