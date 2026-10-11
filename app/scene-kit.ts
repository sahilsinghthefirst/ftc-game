import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { blockWall, concreteFloor, pegboard, workMat } from './textures';
import { ROBOT_MODEL_WIDTH } from './robot-model';

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

// A team's pit, at true scale to the robot on the bench: a concrete floor, a
// painted block wall with a pegboard of hand tools, rolling tool chests, and
// the robot on a 36 in. steel bench topped with an anti-static mat. The robot
// model is ROBOT_MODEL_WIDTH units across for its 18 in., so IN is one inch.
const IN = ROBOT_MODEL_WIDTH / 18;

export function workshopRoom(scene: THREE.Object3D) {
  // The bench top is at 0, where the robot sits; the floor is a bench height
  // below it.
  const floorY = -36 * IN;
  const concrete = concreteFloor(80 / 8);
  concrete.map.repeat.set(10, 9);
  concrete.roughnessMap.repeat.set(10, 9);
  place(
    scene,
    surface(80, 0.3, 70, {
      color: 0xc3c9cb,
      map: concrete.map,
      roughnessMap: concrete.roughnessMap,
      roughness: 0.75,
    }),
    0,
    floorY - 0.15,
    0,
  );
  // A ten-foot block wall behind the bench.
  const wallHeight = 120 * IN;
  const wallWide = 60;
  const blocks = blockWall(wallWide / (16 * IN), wallHeight / (8 * IN));
  place(
    scene,
    surface(wallWide, wallHeight, 0.3, {
      map: blocks.map,
      bumpMap: blocks.bumpMap,
      bumpScale: 1.2,
      roughness: 0.88,
    }),
    0,
    floorY + wallHeight / 2,
    -11,
  );
  // A 36 x 24 in. pegboard of hand tools, at working height to the left of
  // the wall signs so the view behind the robot stays calm.
  const boardX = -12.4;
  const boardY = 6 * IN + 12 * IN;
  const board = pegboard((36 * IN) / 0.8, (24 * IN) / 0.8);
  place(
    scene,
    surface(36 * IN, 24 * IN, 0.06, {
      map: board.map,
      bumpMap: board.bumpMap,
      bumpScale: 1,
      roughness: 0.8,
    }),
    boardX,
    boardY,
    -10.8,
  );
  // Screwdrivers, 8 in. long: a steel shaft with a coloured handle.
  for (const [i, color] of [0xd9502d, 0xe2ae35, 0x2f6f96].entries()) {
    const x = boardX - 4 + i * 1.3;
    place(
      scene,
      solid(0.1, 4.5 * IN, 0.06, 0xb9c4c9, 0.8),
      x,
      boardY + 2.4,
      -10.7,
    );
    place(scene, solid(0.35, 3.5 * IN, 0.3, color), x, boardY + 0.5, -10.7);
  }
  // Open-end wrenches, 12, 10 and 8 in.
  for (const [i, inches] of [12, 10, 8].entries())
    place(
      scene,
      solid(0.32, inches * IN, 0.08, 0xc3ccd1, 0.8),
      boardX + 0.6 + i * 1.1,
      boardY + 1,
      -10.7,
    );
  // A coil of spare wire on a hook.
  const coil = new THREE.Mesh(
    new THREE.TorusGeometry(3 * IN, 0.4 * IN, 10, 32),
    new THREE.MeshStandardMaterial({ color: 0xd9503d, roughness: 0.5 }),
  );
  place(scene, coil, boardX + 4.4, boardY - 1.6, -10.65);

  // The robot sits on a real steel service bench: a top with an anti-static
  // mat, four legs to the floor and a shelf low down.
  place(scene, solid(12, 0.35, 10, 0x364852, 0.8), 0, -0.25, 0);
  const mat = workMat();
  place(
    scene,
    surface(11.7, 0.05, 9.7, { map: mat.map, roughness: 0.7 }),
    0,
    -0.045,
    0,
  );
  const legLength = -0.42 - floorY;
  for (const x of [-5.4, 5.4])
    for (const z of [-4.5, 4.5])
      place(
        scene,
        solid(2 * IN, legLength, 2 * IN, 0x0e1d27, 0.5),
        x,
        floorY + legLength / 2,
        z,
      );
  place(scene, solid(11.4, 0.2, 9.4, 0x2b3a44, 0.6), 0, floorY + 6 * IN, 0);
  for (const x of [-5.9, 5.9])
    place(scene, solid(0.06, 0.04, 9.4, 0xe2ae35), x, 0, 0);
  // Wall signs, sized to read from the workbench camera, above the bench
  // and centred on the back wall.
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
  // Rolling tool chests, 26 in. wide and as tall as the bench, back to the
  // wall either side of it.
  const chestHigh = 36 * IN;
  const chestDeep = 18 * IN;
  for (const x of [-16.5, 13.5]) {
    const z = -11 + 0.15 + chestDeep / 2;
    place(
      scene,
      solid(26 * IN, chestHigh, chestDeep, 0x253e4b, 0.5),
      x,
      floorY + chestHigh / 2,
      z,
    );
    for (let drawer = 0; drawer < 6; drawer++) {
      const y = floorY + 3 * IN + drawer * 5.4 * IN + 2.4 * IN;
      place(
        scene,
        solid(24 * IN, 4.6 * IN, 0.08, 0x38515c, 0.5),
        x,
        y,
        z + chestDeep / 2 + 0.03,
      );
      place(
        scene,
        solid(10 * IN, 0.5 * IN, 0.12, 0xb6c3c7, 0.8),
        x,
        y + 1.2 * IN,
        z + chestDeep / 2 + 0.1,
      );
    }
  }
  // Strip lights hung from the ceiling, nine feet up.
  for (const x of [-14, -2, 10]) {
    const y = floorY + 108 * IN;
    place(scene, solid(48 * IN, 0.12, 0.28, 0xd6e7ee), x, y, -6);
    const lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(47 * IN, 0.2),
      new THREE.MeshBasicMaterial({
        color: 0xecf8ff,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    lamp.rotation.x = Math.PI / 2;
    place(scene, lamp, x, y - 0.08, -6);
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
