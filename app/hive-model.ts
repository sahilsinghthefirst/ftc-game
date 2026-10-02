import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeStaticMeshes } from './merge-static';
import { place, solid } from './scene-kit';
import { INCH, type Alliance, type CellEnd } from './field';

// The BIOBUZZ HIVE structure, modelled on the manual's drawings (section 9.6):
// two A-frames joined by a crossbar that carries the BIOBUZZ banner, and two
// HIVES that each seesaw on a pivot above it. A HIVE is two five-sided CELLS
// - an alliance-coloured rim at each end, frosted polycarbonate walls and
// roof, a white floor with its AprilTag sticker underneath - on one arm, and
// rests tipped 30 degrees one way or the other.
//
// Everything is in real inches times IN: field.ts sets how many field units
// an inch is, and the scene draws fifty field units to the unit.
export const IN = INCH / 50;
export const PIVOT_HEIGHT = 43.95 * IN;
export const HIVE_TILT = Math.PI / 6;
const CELL_BACK = 9.42 * IN;
const CELL_DEPTH = 12.04 * IN;
const CELL_HALF = 10 * IN;
const CELL_EAVE = 7.61 * IN;
const CELL_PEAK = 14 * IN;
// The CELL floor sits a little below the pivot line.
const CELL_FLOOR = -1.4 * IN;
const RIM = 1.1 * IN;
const RIM_THICK = 0.6 * IN;
const FRAME_X = 24.73 * IN;
const FRAME_Z = 19.48 * IN;
// The crossbar, under the pivots so the arms swing clear over it.
const CROSSBAR = PIVOT_HEIGHT - 6 * IN;
const TUBE = 1.5 * IN;

// Rim colours sampled from the manual's renders: a strong signal red and a
// royal blue, both powder-coat satin.
const RIM_COLOR: Record<Alliance, number> = { blue: 0x2147b8, red: 0xcf2430 };

const pentagon = (grow = 0): [number, number][] => [
  [-CELL_HALF - grow, -grow],
  [CELL_HALF + grow, -grow],
  [CELL_HALF + grow, CELL_EAVE + grow * 0.3],
  [0, CELL_PEAK + grow * 1.19],
  [-CELL_HALF - grow, CELL_EAVE + grow * 0.3],
];

// A flat polygon made of explicit triangles (a fan from the first corner),
// with normals, so it merges with everything else.
function fan(points: [number, number][], z: number) {
  const positions: number[] = [];
  for (let i = 1; i < points.length - 1; i++)
    for (const [x, y] of [points[0], points[i], points[i + 1]])
      positions.push(x, y, z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

// One flat side of a CELL: the strip between two corners of its outline,
// running the CELL's depth.
function strip(p: [number, number], q: [number, number], depth: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    // Two triangles.
    new THREE.Float32BufferAttribute(
      [
        p[0],
        p[1],
        0,
        q[0],
        q[1],
        0,
        q[0],
        q[1],
        depth,
        p[0],
        p[1],
        0,
        q[0],
        q[1],
        depth,
        p[0],
        p[1],
        depth,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

// The rim: a thick five-sided frame with the mounting tab under its floor,
// where the arm bolts on.
function rimGeometry() {
  const outer = new THREE.Shape();
  const [first, ...rest] = pentagon(RIM);
  outer.moveTo(first[0], first[1]);
  // Along the floor edge, out and round the tab.
  outer.lineTo(-3 * IN, -RIM);
  outer.lineTo(-2 * IN, -RIM - 1.3 * IN);
  outer.lineTo(2 * IN, -RIM - 1.3 * IN);
  outer.lineTo(3 * IN, -RIM);
  for (const [x, y] of rest) outer.lineTo(x, y);
  outer.closePath();
  const hole = new THREE.Path();
  const inner = pentagon().reverse();
  hole.moveTo(inner[0][0], inner[0][1]);
  for (const [x, y] of inner.slice(1)) hole.lineTo(x, y);
  hole.closePath();
  outer.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth: RIM_THICK,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.deleteAttribute('uv');
  return geometry;
}

// The white bolt holes that run all the way round each rim.
function rimHoles(parent: THREE.Object3D, z: number, material: THREE.Material) {
  const middle = pentagon(RIM / 2);
  const dot = new THREE.CircleGeometry(0.28 * IN, 8);
  dot.deleteAttribute('uv');
  for (let i = 0; i < middle.length; i++) {
    const [ax, ay] = middle[i];
    const [bx, by] = middle[(i + 1) % middle.length];
    const length = Math.hypot(bx - ax, by - ay);
    const count = Math.max(1, Math.round(length / (2.4 * IN)));
    for (let k = 1; k < count; k++) {
      const t = k / count;
      for (const face of [-1, 1]) {
        const hole = new THREE.Mesh(dot, material);
        hole.position.set(
          ax + (bx - ax) * t,
          ay + (by - ay) * t,
          z + (face > 0 ? RIM_THICK + 0.004 : -0.004),
        );
        if (face < 0) hole.rotation.y = Math.PI;
        parent.add(hole);
      }
    }
  }
}

// Seeded so every load of the field draws the same tags.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// The AprilTag Cluster sticker under each CELL (manual figures 9-15 and
// 9-16): four 36h11-style tags, a pair either side of the arm, on white,
// with an alliance-coloured strip naming the CELL and each tag's ID.
function tagSticker(alliance: Alliance, name: string, firstId: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 140;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 140);
  const size = 96;
  const lefts = [24, 136, 280, 392];
  lefts.forEach((left, index) => {
    const random = seeded(firstId + index + 11);
    const cell = size / 8;
    ctx.fillStyle = '#111111';
    ctx.fillRect(left, 10, size, size);
    ctx.fillStyle = '#ffffff';
    for (let row = 0; row < 6; row++)
      for (let column = 0; column < 6; column++)
        if (random() > 0.5)
          ctx.fillRect(
            left + (column + 1) * cell,
            10 + (row + 1) * cell,
            cell,
            cell,
          );
  });
  ctx.fillStyle = alliance === 'red' ? '#c4202b' : '#1f45b5';
  ctx.fillRect(0, 114, 512, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lefts.forEach((left, index) =>
    ctx.fillText(`ID ${firstId + index}`, left + size / 2, 127),
  );
  ctx.font = '700 10px Arial';
  ctx.fillText(name, 256, 120);
  ctx.fillText('Tag family: 36h11', 256, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// The yellow BIOBUZZ panel on the frame: a honeycomb band with the game's
// name in heavy black type, as on the real field's frame graphic.
function bannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 144;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5c518';
  ctx.fillRect(0, 0, 1024, 144);
  // Honeycomb, densest at the two ends and fading toward the lettering.
  const hex = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    ctx.closePath();
  };
  const r = 18;
  for (let row = -1; row < 6; row++)
    for (let column = 0; column < 34; column++) {
      const cx = column * r * 1.732 + (row % 2 ? r * 0.866 : 0);
      const cy = row * r * 1.5 + 8;
      const fromMiddle = Math.abs(cx - 512) / 512;
      if (fromMiddle < 0.42) continue;
      hex(cx, cy, r - 1.5);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(25, 20, 8, ${(fromMiddle - 0.4) * 1.1})`;
      ctx.stroke();
      if ((row * 7 + column * 3) % 5 === 0) {
        ctx.fillStyle = `rgba(222, 150, 0, ${fromMiddle})`;
        ctx.fill();
      }
    }
  // Black bands top and bottom frame the panel.
  ctx.fillStyle = '#16140f';
  ctx.fillRect(0, 0, 1024, 7);
  ctx.fillRect(0, 137, 1024, 7);
  ctx.fillStyle = '#16140f';
  ctx.font = '900 92px "Arial Black", Impact, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BIOBUZZ', 512, 76);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A square tube between two points.
function tube(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: number,
  size = TUBE,
) {
  const length = from.distanceTo(to);
  const mesh = solid(size, length, size, color, 0.8);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.clone().sub(from).normalize(),
  );
  parent.add(mesh);
  return mesh;
}

// The fixed part: two A-frames, the crossbar, the pivot brackets for both
// HIVES, and the banner on either face. `floor` is the top of the mats.
export function hiveFrame(
  parent: THREE.Object3D,
  floor: number,
  hiveX: Record<Alliance, number>,
) {
  const frame = new THREE.Group();
  frame.position.y = floor;
  parent.add(frame);
  const aluminum = 0xa3adb4;
  const steel = 0x5b656c;
  for (const side of [-1, 1]) {
    const x = side * FRAME_X;
    // Base bar on the mats, with a foot plate at each end.
    place(frame, solid(TUBE, TUBE, FRAME_Z * 2, steel, 0.7), x, TUBE / 2, 0);
    for (const z of [-FRAME_Z, FRAME_Z])
      place(frame, solid(3 * IN, 0.3 * IN, 3 * IN, 0x2f363b), x, 0.15 * IN, z);
    // The two legs climb to the apex, where the crossbar is bolted on.
    const apex = new THREE.Vector3(x, CROSSBAR, 0);
    for (const z of [-FRAME_Z, FRAME_Z])
      tube(frame, new THREE.Vector3(x, TUBE, z * 0.97), apex, aluminum);
    place(frame, solid(2.4 * IN, 4 * IN, 4 * IN, steel, 0.7), x, CROSSBAR, 0);
  }
  place(
    frame,
    solid(FRAME_X * 2 + 2 * IN, 3 * IN, 2 * IN, aluminum, 0.8),
    0,
    CROSSBAR,
    0,
  );
  // A pair of uprights either side of each HIVE's arm carries its axle.
  for (const alliance of ['blue', 'red'] as const) {
    const x = hiveX[alliance];
    for (const side of [-1, 1])
      place(
        frame,
        solid(
          0.5 * IN,
          PIVOT_HEIGHT - CROSSBAR + 1.5 * IN,
          2.4 * IN,
          steel,
          0.7,
        ),
        x + side * 1.6 * IN,
        (PIVOT_HEIGHT + CROSSBAR) / 2 + 0.3 * IN,
        0,
      );
  }
  // The BIOBUZZ banner hangs off the crossbar on both faces.
  const banner = new THREE.MeshStandardMaterial({
    map: bannerTexture(),
    roughness: 0.6,
    metalness: 0,
  });
  for (const face of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(40 * IN, 5.6 * IN),
      banner,
    );
    panel.rotation.y = face > 0 ? 0 : Math.PI;
    panel.castShadow = true;
    place(frame, panel, 0, CROSSBAR - 1.3 * IN, face * 1.06 * IN);
  }
  return frame;
}

export type HiveModel = {
  // The pivot: rotate it about x to tip the HIVE.
  root: THREE.Group;
  cells: Record<
    CellEnd,
    {
      // Where ARTIFACTS sit, in the CELL's own frame: y up from its floor, z
      // out from its back wall toward the open end.
      inside: THREE.Object3D;
      // Just inside the mouth, where a scored ARTIFACT flies to.
      mouth: THREE.Object3D;
    }
  >;
};

// Spots for ARTIFACTS inside a CELL as [across, layer, out from the back
// wall], in inches: three across the floor in two rows, four nested on top
// of those and two more under the ridge. An upward CELL's back wall is its
// low end, so that is where everything settles.
const SLOTS: [number, number, number][] = [
  [-6.2, 0, 3.2],
  [0, 0, 3.2],
  [6.2, 0, 3.2],
  [-6.2, 0, 8.8],
  [0, 0, 8.8],
  [6.2, 0, 8.8],
  [-3.1, 1, 3.2],
  [3.1, 1, 3.2],
  [-3.1, 1, 8.8],
  [3.1, 1, 8.8],
  [0, 2, 3.2],
  [0, 2, 8.8],
];
// How big an ARTIFACT is drawn inside a CELL, against its size on the mats.
// The mats' balls are drawn big so they read from the follow camera; in a
// CELL they come down toward the real ball-to-CELL size, so a full one still
// reads as a pile rather than a jam.
export const CELL_BALL_SCALE = 0.7;

export function cellSlot(index: number, radius: number, target: THREE.Vector3) {
  const [x, layer, z] = SLOTS[index % SLOTS.length];
  // A TipTray can overfill a CELL past the dozen spots; the extras pile on.
  const extra = Math.floor(index / SLOTS.length) * 1.2;
  return target.set(
    (x + extra) * IN,
    radius + (layer * 4.4 + extra) * IN,
    z * IN,
  );
}

// One alliance's HIVE, built level with its pivot at the origin and the near
// CELL (end 1) toward +z.
export function createHive(alliance: Alliance): HiveModel {
  const root = new THREE.Group();
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: RIM_COLOR[alliance],
    roughness: 0.42,
    metalness: 0.1,
  });
  const holeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f1ec,
    roughness: 0.6,
    metalness: 0,
  });
  // Frosted polycarbonate: you see the ARTIFACTS through it, softly.
  const panelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe3eaee,
    transparent: true,
    opacity: 0.34,
    roughness: 0.32,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9ecec,
    roughness: 0.55,
    metalness: 0,
  });
  const rim = rimGeometry();
  // Walls, roof and back wall of one CELL as a single shell.
  const outline = pentagon();
  const shell = mergeGeometries(
    [
      ...[1, 2, 3, 4].map((i) =>
        strip(outline[i], outline[(i + 1) % 5], CELL_DEPTH),
      ),
      fan(outline, 0),
    ],
    false,
  );

  // The arm runs under both CELLS; a hub plate climbs from it to the axle,
  // with a rubber damper either side that lands on the frame at each stop.
  const armY = CELL_FLOOR - 1.05 * IN;
  const reach = CELL_BACK + CELL_DEPTH;
  place(root, solid(TUBE, TUBE, reach * 2, 0x9aa5ac, 0.8), 0, armY, 0);
  for (const side of [-1, 1]) {
    const hub = new THREE.Mesh(
      fan(
        [
          [-5 * IN, armY],
          [5 * IN, armY],
          [1 * IN, 0.8 * IN],
          [-1 * IN, 0.8 * IN],
        ],
        0,
      ),
      new THREE.MeshStandardMaterial({
        color: 0x7f8b93,
        roughness: 0.4,
        metalness: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    hub.rotation.y = Math.PI / 2;
    place(root, hub, side * 0.85 * IN, 0, 0);
    const damper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 * IN, 0.5 * IN, 1.2 * IN, 10),
      new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.9 }),
    );
    damper.rotation.x = side * 0.5;
    place(root, damper, 0, armY - 1 * IN, side * 3.2 * IN);
  }
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45 * IN, 0.45 * IN, 4.2 * IN, 12),
    new THREE.MeshStandardMaterial({
      color: 0xc9d0d4,
      roughness: 0.3,
      metalness: 0.9,
    }),
  );
  axle.rotation.z = Math.PI / 2;
  root.add(axle);

  const tagIds: Record<Alliance, Record<CellEnd, number>> = {
    red: { 1: 34, [-1]: 30 },
    blue: { 1: 38, [-1]: 42 },
  };
  const containers: THREE.Object3D[] = [];
  const cells = {} as HiveModel['cells'];
  for (const end of [1, -1] as const) {
    const cell = new THREE.Group();
    cell.position.set(0, CELL_FLOOR, end * CELL_BACK);
    // Built facing +z; the far CELL is the same CELL turned round.
    if (end < 0) cell.rotation.y = Math.PI;
    root.add(cell);
    for (const z of [0, CELL_DEPTH - RIM_THICK]) {
      const frame = new THREE.Mesh(rim, rimMaterial);
      frame.castShadow = true;
      place(cell, frame, 0, 0, z);
      rimHoles(cell, z, holeMaterial);
    }
    const walls = new THREE.Mesh(shell, panelMaterial);
    cell.add(walls);
    // Standoffs along the corners hold the rims apart.
    for (const [x, y] of [
      [-CELL_HALF, 0.3 * IN],
      [CELL_HALF, 0.3 * IN],
      [-CELL_HALF, CELL_EAVE - 0.2 * IN],
      [CELL_HALF, CELL_EAVE - 0.2 * IN],
      [0, CELL_PEAK - 0.4 * IN],
    ]) {
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28 * IN, 0.28 * IN, CELL_DEPTH, 8),
        new THREE.MeshStandardMaterial({
          color: 0xb8c1c7,
          roughness: 0.35,
          metalness: 0.85,
        }),
      );
      rod.rotation.x = Math.PI / 2;
      place(cell, rod, x, y, CELL_DEPTH / 2);
    }
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_HALF * 2, 0.3 * IN, CELL_DEPTH),
      floorMaterial,
    );
    floor.castShadow = true;
    floor.receiveShadow = true;
    place(cell, floor, 0, -0.15 * IN, CELL_DEPTH / 2);
    // The AprilTag sticker faces the mats, its strip toward the field center.
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(17 * IN, 4.65 * IN),
      new THREE.MeshStandardMaterial({
        map: tagSticker(
          alliance,
          `${alliance.toUpperCase()} ${end > 0 ? 'AUDIENCE' : 'SCORING'}`,
          tagIds[alliance][end],
        ),
        roughness: 0.5,
        metalness: 0,
      }),
    );
    sticker.rotation.x = Math.PI / 2;
    place(cell, sticker, 0, -0.32 * IN, CELL_DEPTH / 2);

    const inside = new THREE.Object3D();
    cell.add(inside);
    const mouth = new THREE.Object3D();
    mouth.position.set(0, 5 * IN, CELL_DEPTH * 0.55);
    cell.add(mouth);
    containers.push(inside, mouth);
    cells[end] = { inside, mouth };
  }
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.material !== panelMaterial) mesh.castShadow = true;
  });
  mergeStaticMeshes(root, containers);
  return { root, cells };
}
