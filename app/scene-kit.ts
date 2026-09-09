import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function solid(
  w: number,
  h: number,
  d: number,
  color: number,
  metalness = 0.2,
) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 1, Math.min(0.06, w / 10, h / 10, d / 10)),
    new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.48 }),
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
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.max(128, Math.round((1024 * height) / width));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.min(canvas.height * 0.48, 1024 / (text.length * 0.63))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, canvas.height / 2);
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

export function ring(radius: number, color: number, thickness = 0.035) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, thickness, 8, 64),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function setupScene(canvas: HTMLCanvasElement, background = 0x17232c) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, 38, 90);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdceeff, 0x283644, 1.05));
  const key = new THREE.DirectionalLight(0xfff4de, 3.2);
  key.position.set(-8, 20, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.normalBias = 0.045;
  key.shadow.bias = -0.00015;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8acbff, 1.6);
  rim.position.set(8, 8, -12);
  scene.add(rim);
  return { scene, renderer, environment };
}

export function workshopRoom(scene: THREE.Scene) {
  place(scene, solid(48, 0.3, 40, 0x26333d), 0, -2.5, 0);
  place(scene, solid(36, 14, 0.3, 0x24323b), 0, 3.3, -11);
  // The robot sits on a real raised service table, with a cutaway front.
  place(scene, solid(12, 0.35, 10, 0x364852, 0.5), 0, -0.25, 0);
  place(scene, solid(11.7, 0.05, 9.7, 0x1f303b, 0.1), 0, -0.045, 0);
  for (const x of [-5.2, 5.2])
    for (const z of [-4.3, 4.3]) {
      place(scene, solid(0.3, 2.2, 0.3, 0x0e1d27, 0.5), x, -1.5, z);
    }
  const grid = new THREE.GridHelper(10, 20, 0x59747e, 0x334b55);
  grid.position.y = -0.01;
  scene.add(grid);
  for (const x of [-5.9, 5.9])
    place(scene, solid(0.06, 0.04, 9.4, 0xe2ae35), x, 0, 0);
  place(scene, label('FIELD / LAB', 7, 1.3), -2, 5.4, -10.8);
  place(
    scene,
    label(
      'FIRST TECH CHALLENGE  /  TEAM WORKSHOP',
      9,
      0.48,
      '#24323b',
      '#91a7b4',
    ),
    -2,
    4.3,
    -10.78,
  );
  place(
    scene,
    label('BUILD  /  TEST  /  IMPROVE', 7, 0.5, '#24323b', '#e6b13b'),
    -2,
    3.5,
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
