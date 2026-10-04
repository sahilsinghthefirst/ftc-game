import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Manufactured hardware, in the same scene units as the chassis. These are
// purpose-built meshes, not decorative cubes. Fixed hardware is batched by
// robot-model; the pivots marked articulated stay independently animatable.
export const finish = {
  alloy: 0xc9ced1,
  steel: 0x828d94,
  anodized: 0x303b43,
  polymer: 0x182228,
  gold: 0xc99432,
  rubber: 0x24272a,
};

let grain: THREE.DataTexture | undefined;
function machiningGrain() {
  if (grain) return grain;
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      // Deterministic fine machining lines, not a downloaded material asset.
      const v =
        180 +
        Math.round(Math.sin(y * 19.71) * 22 + Math.sin(x * 3.3 + y * 12.8) * 8);
      const i = (y * 64 + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  grain = new THREE.DataTexture(pixels, 64, 64);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(2, 3);
  grain.needsUpdate = true;
  grain.userData.shared = true;
  return grain;
}

export function metal(color = finish.alloy, roughness = 0.34) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.88,
    roughness: roughness * 1.25,
    roughnessMap: machiningGrain(),
  });
}

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

export function rounded(
  w: number,
  h: number,
  d: number,
  color = finish.polymer,
) {
  return mesh(
    new RoundedBoxGeometry(w, h, d, 1, Math.min(0.025, w / 6, h / 6, d / 6)),
    new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.08 }),
  );
}

export function at<T extends THREE.Object3D>(
  parent: THREE.Object3D,
  part: T,
  x: number,
  y: number,
  z: number,
) {
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}

function circleHole(shape: THREE.Shape, x: number, y: number, r: number) {
  const hole = new THREE.Path();
  hole.absarc(x, y, r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

// A real through-bored plate. Avoid painted dots that disappear when orbited.
export function plate(
  w: number,
  h: number,
  thickness: number,
  holes: Array<[number, number, number]> = [],
  color = finish.alloy,
) {
  const shape = new THREE.Shape();
  const r = Math.min(0.06, w / 8, h / 8);
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  for (const [x, y, radius] of holes) circleHole(shape, x, y, radius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -thickness / 2);
  return mesh(geometry, metal(color));
}

export function machinedChannel(length: number, axis: 'x' | 'y' | 'z' = 'x') {
  const group = new THREE.Group();
  const holes: Array<[number, number, number]> = [];
  const count = Math.floor((length - 0.18) / 0.32);
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.32;
    holes.push([x, 0, 0.081]);
    if (i < count - 1)
      holes.push([x + 0.16, 0.105, 0.027], [x + 0.16, -0.105, 0.027]);
  }
  const base = plate(length, 0.5, 0.04, holes);
  base.rotation.x = -Math.PI / 2;
  group.add(base);
  for (const side of [-1, 1]) {
    const wall = plate(
      length,
      0.34,
      0.04,
      holes.filter(([, y]) => y === 0),
    );
    at(group, wall, 0, 0.17, side * 0.25);
  }
  if (axis === 'z') group.rotation.y = Math.PI / 2;
  if (axis === 'y') group.rotation.z = Math.PI / 2;
  return group;
}

// Washer + recessed hex socket + shaft. Flat 'bolt dots' don't read as hardware.
export function fastener(radius = 0.055) {
  const group = new THREE.Group();
  const washer = mesh(
    new THREE.TorusGeometry(radius * 1.15, radius * 0.2, 5, 12),
    metal(),
  );
  washer.rotation.x = Math.PI / 2;
  group.add(washer);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const socket = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = (-i * Math.PI) / 3;
    const x = Math.cos(a) * radius * 0.47,
      y = Math.sin(a) * radius * 0.47;
    if (i === 0) socket.moveTo(x, y);
    else socket.lineTo(x, y);
  }
  socket.closePath();
  shape.holes.push(socket);
  const head = mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: radius * 0.7,
      bevelEnabled: false,
      curveSegments: 6,
    }),
    metal(finish.steel, 0.25),
  );
  head.rotation.x = -Math.PI / 2;
  at(group, head, 0, 0.009, 0);
  at(group, rounded(radius * 0.65, 0.008, radius * 0.65), 0, 0.004, 0);
  return group;
}

export function bearing(radius = 0.18, width = 0.09) {
  const group = new THREE.Group();
  for (const [r, tube, color] of [
    [radius, 0.036, finish.alloy],
    [radius * 0.62, 0.035, finish.anodized],
    [radius * 0.4, 0.025, finish.steel],
  ]) {
    const ring = mesh(new THREE.TorusGeometry(r, tube, 6, 24), metal(color));
    ring.rotation.y = Math.PI / 2;
    group.add(ring);
  }
  const shaft = mesh(
    new THREE.CylinderGeometry(0.05, 0.05, width + 0.22, 8),
    metal(),
  );
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);
  return group;
}

export function pulley(radius: number, width = 0.12, teeth = 20) {
  const group = new THREE.Group();
  const drum = mesh(
    new THREE.CylinderGeometry(radius * 0.91, radius * 0.91, width, 24),
    metal(finish.anodized),
  );
  drum.rotation.z = Math.PI / 2;
  group.add(drum);
  for (const side of [-1, 1]) {
    const flange = mesh(
      new THREE.CylinderGeometry(radius, radius, 0.025, 32),
      metal(),
    );
    flange.rotation.z = Math.PI / 2;
    at(group, flange, (side * width) / 2, 0, 0);
  }
  for (let i = 0; i < teeth; i++) {
    const a = (i * Math.PI * 2) / teeth;
    const tooth = rounded(width, 0.025, 0.035, finish.anodized);
    tooth.rotation.x = a;
    at(
      group,
      tooth,
      0,
      Math.cos(a) * radius * 0.92,
      Math.sin(a) * radius * 0.92,
    );
  }
  at(group, bearing(radius * 0.36, width), 0, 0, 0);
  return group;
}

// A closed toothed timing belt between two equal pulleys (axles along X).
export function belt(
  x: number,
  y: number,
  zA: number,
  zB: number,
  radius: number,
) {
  const group = new THREE.Group();
  const lo = Math.min(zA, zB),
    hi = Math.max(zA, zB);
  const path = new THREE.CurvePath<THREE.Vector3>();
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i * Math.PI) / 20;
    points.push(
      new THREE.Vector3(x, y + Math.cos(a) * radius, hi + Math.sin(a) * radius),
    );
  }
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i * Math.PI) / 20;
    points.push(
      new THREE.Vector3(x, y + Math.cos(a) * radius, lo + Math.sin(a) * radius),
    );
  }
  for (let i = 0; i < points.length; i++)
    path.add(new THREE.LineCurve3(points[i], points[(i + 1) % points.length]));
  group.add(
    mesh(
      new THREE.TubeGeometry(path, 84, 0.035, 5, true),
      new THREE.MeshStandardMaterial({ color: finish.rubber, roughness: 0.96 }),
    ),
  );
  for (let z = lo; z <= hi; z += 0.11)
    for (const side of [-1, 1])
      at(group, rounded(0.12, 0.026, 0.05), x, y + side * (radius - 0.023), z);
  return group;
}

// A cylindrical can motor, encoder end-cap and stepped planetary gearbox.
export function gearMotor(scale = 1) {
  const group = new THREE.Group();
  for (const [x, radius, length, color] of [
    [-0.24, 0.24, 0.65, finish.steel],
    [0.19, 0.25, 0.22, finish.gold],
    [0.35, 0.21, 0.14, finish.alloy],
    [-0.6, 0.23, 0.12, finish.polymer],
    [0.5, 0.065, 0.26, finish.steel],
  ]) {
    const can = mesh(
      new THREE.CylinderGeometry(radius, radius, length, 28),
      metal(color, color === finish.polymer ? 0.7 : 0.32),
    );
    can.rotation.z = Math.PI / 2;
    at(group, can, x, 0, 0);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const vent = rounded(0.16, 0.008, 0.055);
    vent.rotation.x = a;
    at(group, vent, -0.4, Math.cos(a) * 0.241, Math.sin(a) * 0.241);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const screw = fastener(0.035);
    screw.rotation.z = -Math.PI / 2;
    at(group, screw, 0.43, Math.cos(a) * 0.15, Math.sin(a) * 0.15);
  }
  for (const z of [-0.085, 0.085])
    at(
      group,
      rounded(0.19, 0.09, 0.065, z < 0 ? 0xc84831 : 0x22282e),
      -0.72,
      0.05,
      z,
    );
  group.scale.setScalar(scale);
  return group;
}

export function servo() {
  const group = new THREE.Group();
  group.add(rounded(0.5, 0.4, 0.3));
  for (const x of [-0.3, 0.3]) {
    at(group, rounded(0.12, 0.06, 0.32), x, 0.08, 0);
    at(group, fastener(0.035), x, 0.12, 0);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16), metal());
  at(group, hub, 0.1, 0.25, 0);
  const horn = plate(0.48, 0.12, 0.04, [
    [-0.17, 0, 0.024],
    [0.17, 0, 0.024],
  ]);
  horn.rotation.x = Math.PI / 2;
  at(group, horn, 0.1, 0.31, 0);
  return group;
}

export function cable(
  points: Array<[number, number, number]>,
  color = 0x262b2e,
  radius = 0.023,
) {
  return mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      20,
      radius,
      6,
      false,
    ),
    new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0 }),
  );
}

// Physical printed labels, not UI overlays. Canvas is only used for type.
export function decal(text: string, w: number, h: number, dark = true) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = dark ? '#17252d' : '#dce1e2';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = dark ? '#dce5e8' : '#27343d';
  ctx.font = '600 44px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66, 482);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const label = mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map,
      roughness: 0.6,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  label.castShadow = false;
  return label;
}

export function ribbedPanel(w: number, h: number, d: number, color: number) {
  const group = new THREE.Group();
  group.add(rounded(w, h, d, color));
  for (let y = -h / 2 + 0.05; y < h / 2; y += 0.045)
    at(group, rounded(w - 0.035, 0.012, 0.008, color), 0, y, d / 2 + 0.002);
  return group;
}

export function compliantWheel(
  radius: number,
  thickness: number,
  color: number,
) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const a = (i * Math.PI * 2) / 96;
    const r = radius * (0.79 + 0.21 * Math.cos(a * 8));
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  circleHole(shape, 0, 0, radius * 0.2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -thickness / 2);
  const wheel = mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 }),
  );
  wheel.rotation.y = Math.PI / 2;
  return wheel;
}
