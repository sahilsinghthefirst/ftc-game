import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createRobotModel,
  disposeObject,
  defaultMountSlots,
} from './robot-model';
import { label, place, ring, setupScene, solid } from './scene-kit';
import type { World } from './game-arena';
import { playerTarget } from './match-guidance';

export type CameraMode = 'arena' | 'follow' | 'orbit';
const SCALE = 0.02;
const blue = 0x359be5,
  red = 0xe65856;
const position = (x: number, z: number, y = 0.08) =>
  new THREE.Vector3((x - 500) * SCALE, y, (z - 325) * SCALE);

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

function arenaRoom(scene: THREE.Scene) {
  place(scene, solid(70, 0.3, 60, 0x1c2c36), 0, -0.45, 0);
  place(scene, solid(21, 0.22, 14, 0x0f1c24, 0.6), 0, -0.12, 0);
  const foam = document.createElement('canvas');
  foam.width = foam.height = 128;
  const ctx = foam.getContext('2d')!;
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2200; i++) {
    const shade = 100 + ((i * 37) % 60);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(
      (i * 73) % 128,
      (Math.floor(i / 128) * 31 + i * 17) % 128,
      1,
      1,
    );
  }
  const foamTexture = new THREE.CanvasTexture(foam);
  foamTexture.wrapS = foamTexture.wrapT = THREE.RepeatWrapping;
  const tileGeometry = new THREE.BoxGeometry(0.996, 0.055, 0.996);
  const tiles = new THREE.InstancedMesh(
    tileGeometry,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      bumpMap: foamTexture,
      bumpScale: 0.015,
    }),
    260,
  );
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let x = 0; x < 20; x++)
    for (let z = 0; z < 13; z++) {
      matrix.makeTranslation(x - 9.5, 0.025, z - 6);
      tiles.setMatrixAt(index, matrix);
      tiles.setColorAt(
        index,
        new THREE.Color((x * 7 + z * 3) % 3 ? 0x62696b : 0x606769),
      );
      index++;
    }
  tiles.receiveShadow = true;
  scene.add(tiles);
  for (const x of [-10.1, 10.1]) {
    place(scene, solid(0.12, 0.1, 13.3, 0xb7c5cd, 0.8), x, 0.67, 0);
    place(scene, solid(0.15, 0.2, 13.3, 0x293d49, 0.6), x, 0.13, 0);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.6, 13.2),
      new THREE.MeshPhysicalMaterial({
        color: 0x9dbbca,
        transparent: true,
        opacity: 0.16,
        roughness: 0.1,
        depthWrite: false,
      }),
    );
    place(scene, wall, x, 0.36, 0);
    for (let z = -6.5; z <= 6.5; z += 1.3)
      place(scene, solid(0.13, 0.72, 0.13, 0x7e949f, 0.8), x, 0.36, z);
  }
  for (const z of [-6.6, 6.6]) {
    place(scene, solid(20.3, 0.1, 0.12, 0xc3cfd4, 0.8), 0, 0.66, z);
    place(scene, solid(20.3, 0.17, 0.16, 0x243844, 0.5), 0, 0.13, z);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(20.2, 0.55, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xa2c5d8,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    place(scene, wall, 0, 0.37, z);
    for (let x = -10; x <= 10; x += 2)
      place(scene, solid(0.12, 0.7, 0.14, 0x7e949f, 0.8), x, 0.35, z);
  }
  for (const [x, color] of [
    [-7.64, blue],
    [7.64, red],
  ]) {
    const tape = solid(3.05, 0.009, 2.16, color);
    place(scene, tape, x, 0.06, 4.54);
    place(scene, solid(2.85, 0.015, 1.96, 0x384e60), x, 0.066, 4.54);
    const base = label('BASE', 1.2, 0.4, '#384e60', '#cfdee8');
    base.rotation.x = -Math.PI / 2;
    place(scene, base, x, 0.085, 4.8);
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
  goal(scene, -8.1, -4.34, blue, 'BLUE GOAL');
  goal(scene, 8.1, -4.34, red, 'RED GOAL');
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
  const arenaDistance = () => Math.max(22, 25 / camera.aspect);
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
