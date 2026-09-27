import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { blockWall, concreteFloor, pegboard, workMat } from './textures';

// A rounded block. Anything asked to be fairly metallic is finished as
// brushed aluminum; everything else as satin paint or plastic.
export function solid(
  w: number,
  h: number,
  d: number,
  color: number,
  metalness = 0.2,
) {
  const metal = metalness >= 0.6;
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 1, Math.min(0.06, w / 10, h / 10, d / 10)),
    new THREE.MeshStandardMaterial({
      color,
      metalness: metal ? 0.9 : Math.min(metalness, 0.15),
      roughness: metal ? 0.32 : 0.55,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function place<T extends THREE.Object3D>(
  parent: THREE.Object3D,
  object: T,
  x: number,
  y: number,
  z: number,
) {
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

export function label(
  text: string,
  width: number,
  height: number,
  background = '#14212b',
  ink = '#edf3f4',
) {
  // Texture size follows the label's size in the scene: a 13-unit wall
  // banner gets the full 1024 pixels, a small score pop-up a quarter of that,
  // which is all it can show and a sixteenth of the upload.
  const pixels = Math.min(1024, Math.max(256, Math.round(width * 160)));
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = Math.max(
    Math.round(pixels / 8),
    Math.round((pixels * height) / width),
  );
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.min(canvas.height * 0.48, pixels / (text.length * 0.63))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pixels / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  return mesh;
}

// A flat marker ring on the mats. Its colour is pushed a little past white
// so it reads as lit and picks up a soft glow where the tier allows it.
export function ring(radius: number, color: number, thickness = 0.035) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, thickness, 8, 64),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.6),
      toneMapped: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// A competition hall reduced to what shows up in reflections: dark walls and
// floor, and rows of bright ceiling light strips. Pre-filtered once into an
// environment map, it gives every glossy surface - plastic balls, aluminum,
// polycarbonate - the long light-strip highlights of a real venue, for the
// cost of a single texture lookup.
function hallEnvironment(renderer: THREE.WebGLRenderer) {
  const hall = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(60, 18, 60),
    new THREE.MeshBasicMaterial({ color: 0x4d575e, side: THREE.BackSide }),
  );
  shell.position.y = 7;
  hall.add(shell);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: 0x6a7378 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  hall.add(floor);
  // Values above 1 are HDR: bright enough to read as light sources.
  const strip = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff6e8).multiplyScalar(7),
  });
  for (const x of [-14, -7, 0, 7, 14])
    for (const z of [-12, 0, 12]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.1), strip);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, 15.8, z);
      hall.add(panel);
    }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(hall, 0.035);
  pmrem.dispose();
  hall.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
  });
  strip.dispose();
  return environment;
}

export function setupScene(canvas: HTMLCanvasElement, background = 0x17232c) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  // PCF takes a softness radius (see the render pipeline's tiers).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, 38, 90);
  const environment = hallEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1;
  scene.add(new THREE.HemisphereLight(0xe4efff, 0x2a3036, 0.7));
  // Overhead key light: the venue's ceiling rig, nearly straight down so the
  // shadows sit under things the way they do under arena lighting.
  const key = new THREE.DirectionalLight(0xfff3e2, 3);
  key.position.set(-6, 24, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.normalBias = 0.04;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 3;
  scene.add(key);
  // Cool fill from the far end of the hall, no shadows.
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.1);
  rim.position.set(8, 9, -14);
  scene.add(rim);
  return { scene, renderer, environment, key };
}

// A textured flat surface: one box with its own material.
function surface(
  w: number,
  h: number,
  d: number,
  material: THREE.MeshStandardMaterialParameters,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial(material),
  );
  mesh.receiveShadow = true;
  return mesh;
}

// A team's pit: concrete floor, a painted block wall with a pegboard of
// hand tools, and the robot on a steel bench topped with an anti-static mat.
export function workshopRoom(scene: THREE.Object3D) {
  const concrete = concreteFloor(48 / 8);
  concrete.map.repeat.set(6, 5);
  concrete.roughnessMap.repeat.set(6, 5);
  place(
    scene,
    surface(48, 0.3, 40, {
      color: 0xc3c9cb,
      map: concrete.map,
      roughnessMap: concrete.roughnessMap,
      roughness: 0.75,
    }),
    0,
    -2.5,
    0,
  );
  const blocks = blockWall(36 / 3.2, 14 / 1.6);
  place(
    scene,
    surface(36, 14, 0.3, {
      map: blocks.map,
      bumpMap: blocks.bumpMap,
      bumpScale: 1.2,
      roughness: 0.88,
    }),
    0,
    3.3,
    -11,
  );
  // Pegboard with a few hand tools, between the drawer cabinet and the wall
  // signs so the view behind the robot stays calm.
  const boardX = -7.8;
  const board = pegboard(3.4 / 0.8, 2.8 / 0.8);
  place(
    scene,
    surface(3.4, 2.8, 0.06, {
      map: board.map,
      bumpMap: board.bumpMap,
      bumpScale: 1,
      roughness: 0.8,
    }),
    boardX,
    2.1,
    -10.8,
  );
  // Screwdrivers: a steel shaft with a coloured handle.
  for (const [i, color] of [0xd9502d, 0xe2ae35, 0x2f6f96].entries()) {
    const x = boardX - 1.2 + i * 0.42;
    place(scene, solid(0.1, 0.8, 0.05, 0xb9c4c9, 0.8), x, 2.75, -10.7);
    place(scene, solid(0.2, 0.42, 0.1, color), x, 2.2, -10.7);
  }
  // Open-end wrenches, largest first.
  for (const [i, length] of [1.1, 0.9, 0.72].entries())
    place(
      scene,
      solid(0.13, length, 0.05, 0xc3ccd1, 0.8),
      boardX + 0.3 + i * 0.4,
      2.65,
      -10.7,
    );
  // A coil of spare wire on a hook.
  const coil = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.06, 10, 32),
    new THREE.MeshStandardMaterial({ color: 0xd9503d, roughness: 0.5 }),
  );
  place(scene, coil, boardX + 0.7, 1.35, -10.65);

  // The robot sits on a real raised service table, with a cutaway front.
  place(scene, solid(12, 0.35, 10, 0x364852, 0.8), 0, -0.25, 0);
  const mat = workMat();
  place(
    scene,
    surface(11.7, 0.05, 9.7, { map: mat.map, roughness: 0.7 }),
    0,
    -0.045,
    0,
  );
  for (const x of [-5.2, 5.2])
    for (const z of [-4.3, 4.3]) {
      place(scene, solid(0.3, 2.2, 0.3, 0x0e1d27, 0.5), x, -1.5, z);
    }
  for (const x of [-5.9, 5.9])
    place(scene, solid(0.06, 0.04, 9.4, 0xe2ae35), x, 0, 0);
  // Wall signs, sized to read from the workbench camera. Stacked above the
  // pegboard so none of them overlap it.
  // Centred on the back wall.
  const signX = 0;
  place(scene, label('FIELD / LAB', 8.5, 1.6), signX, 6.1, -10.8);
  place(
    scene,
    label(
      'FIRST TECH CHALLENGE  /  TEAM WORKSHOP',
      12,
      0.8,
      '#24323b',
      '#a9bdc9',
    ),
    signX,
    4.85,
    -10.78,
  );
  place(
    scene,
    label('BUILD  /  TEST  /  IMPROVE', 9, 0.8, '#24323b', '#e6b13b'),
    signX,
    3.95,
    -10.78,
  );
  for (const x of [-12, 10]) {
    place(scene, solid(4, 4.2, 1.3, 0x253e4b, 0.5), x, 0, -8.4);
    for (let y = -1; y < 1.9; y += 0.65) {
      place(scene, solid(3.6, 0.52, 0.08, 0x38515c, 0.5), x, y, -7.7);
      place(scene, solid(1.6, 0.06, 0.12, 0xb6c3c7, 0.8), x, y + 0.08, -7.59);
    }
  }
  for (const x of [-10, -2, 6]) {
    place(scene, solid(5.2, 0.12, 0.28, 0xd6e7ee), x, 8, -6);
    const lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 0.2),
      new THREE.MeshBasicMaterial({
        color: 0xecf8ff,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    lamp.rotation.x = Math.PI / 2;
    place(scene, lamp, x, 7.92, -6);
  }
  // Spare hardware and a tool tray give the workbench a readable scale.
  place(scene, solid(1.5, 0.15, 2.2, 0x152029), -4.7, 0.08, -2.9);
  for (let i = 0; i < 4; i++)
    place(
      scene,
      solid(0.12, 0.12, 1.2, 0xa9bdc7, 0.8),
      -5.1 + i * 0.25,
      0.22,
      -2.9,
    );
  place(scene, solid(1.3, 0.3, 0.7, 0xda552b), 4.5, 0.15, -3.1);
}
