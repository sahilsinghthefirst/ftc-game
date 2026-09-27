import * as THREE from 'three';
import { createRobotModel, disposeObject } from './robot-model';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { insetOutline, tileEdges, tileOutline } from './field-tiles';
import { mergeStaticMeshes } from './merge-static';
import { createRenderPipeline } from './render-pipeline';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { label, place, ring, setupScene, solid } from './scene-kit';
import {
  blockWall,
  concreteFloor,
  eventCarpet,
  ribbedPlank,
  treadPlate,
} from './textures';
import {
  BLUE_BASE_ZONE,
  BLUE_GOAL,
  FIELD_CENTER,
  FIELD_SIZE,
  RED_BASE_ZONE,
  RED_GOAL,
  TILE,
  TILES,
  zoneCenter,
} from './field';
import type { World } from './game-arena';
import { assistGuides, playerTarget, scoreReach } from './match-guidance';

export type CameraMode = 'arena' | 'follow';
const SCALE = 0.02;
const blue = 0x359be5,
  red = 0xe65856;
// Top surface of the foam mats (their 0.07 depth plus bevel, on top of the
// backing). Tape, rings and guide lines have to sit above this or the mats
// hide them, showing only in the seams.
const MAT_TOP = 0.155;
const position = (x: number, z: number, y = 0.08) =>
  new THREE.Vector3((x - FIELD_CENTER) * SCALE, y, (z - FIELD_CENTER) * SCALE);
// The same, written into a vector that already exists: the render loop runs
// every frame, and on a school laptop the garbage from dozens of throwaway
// vectors a frame turns into visible stutter.
const toScene = (target: THREE.Vector3, x: number, z: number, y = 0.08) =>
  target.set((x - FIELD_CENTER) * SCALE, y, (z - FIELD_CENTER) * SCALE);

// Where the follow camera sits relative to the robot, and where it looks.
const FOLLOW_HEIGHT = 7.4;
const FOLLOW_BACK = 9.6;
const FOLLOW_AHEAD = 2.4;

// Clear polycarbonate perimeter panels: close to invisible head-on, but they
// pick up the hall's light strips as sharp reflections, the way real field
// walls do.
function polycarbonate() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xdbe9f0,
    transparent: true,
    opacity: 0.14,
    roughness: 0.04,
    metalness: 0,
    ior: 1.58,
    specularIntensity: 1,
    envMapIntensity: 1.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// NECTAR are the big ARTIFACTS - the same 1.28x the physics uses for
// their footprint, so what you see matches what you bump into.
export const NECTAR_SCALE = 1.28;

// How an ARTIFACT looks: blue or red NECTAR, or yellow POLLEN.
type BallLook = 'B' | 'R' | 'G';
const lookOf = (color: string, alliance?: string): BallLook =>
  color !== 'P' ? 'G' : alliance === 'red' ? 'R' : 'B';

const ARTIFACT_RADIUS = 0.28;
// Height of an ARTIFACT's center when it sits on the mats.
const restingHeight = (color: string) =>
  MAT_TOP + (color === 'P' ? ARTIFACT_RADIUS * NECTAR_SCALE : ARTIFACT_RADIUS);

// Every ARTIFACT shares one sphere, one fused pair of seams and one material
// per colour - built once, sized per ball by scaling. Marked shared so
// clearing a robot's cargo or finishing a flight never deletes what the rest
// of the field is still drawing with.
type BallParts = {
  sphere: THREE.SphereGeometry;
  seam: THREE.BufferGeometry;
  body: Record<string, THREE.Material>;
  seamColor: Record<string, THREE.Material>;
  // Lets shadows fall through the holes too.
  shadow: THREE.MeshDepthMaterial;
};
let ballParts: BallParts | null = null;

function share<T extends { userData: Record<string, unknown> }>(item: T) {
  item.userData.shared = true;
  return item;
}

// Angular radius of each hole, and of the darker rim that reads as the
// thickness of the shell round it.
const HOLE = 0.18;
const HOLE_RIM = 0.07;

// The perforated shell of a real ARTIFACT, as two small textures wrapped on a
// plain sphere: one cuts the holes out, the other darkens each hole's rim.
// Through a hole you see the inside of the far wall, then the floor, just as
// with the real ball - and it stays one cheap sphere per ball.
function perforatedShell() {
  // Holes in rings, north to south, kept clear of the seam round the middle.
  const centres: THREE.Vector3[] = [];
  const ring = (latitude: number, count: number, turn: number) => {
    for (let i = 0; i < count; i++) {
      const longitude = turn + (i / count) * Math.PI * 2;
      const lat = (latitude * Math.PI) / 180;
      centres.push(
        new THREE.Vector3(
          -Math.cos(longitude) * Math.cos(lat),
          Math.sin(lat),
          Math.sin(longitude) * Math.cos(lat),
        ),
      );
    }
  };
  ring(90, 1, 0);
  ring(55, 6, 0);
  ring(22, 8, Math.PI / 8);
  ring(-22, 8, 0);
  ring(-55, 6, Math.PI / 6);
  ring(-90, 1, 0);

  const width = 512;
  const height = 256;
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    return { canvas, ctx, image: ctx.createImageData(width, height) };
  };
  const cut = make();
  const shade = make();
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y++) {
    // Same mapping as THREE.SphereGeometry's UVs (top row = north pole).
    const theta = ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width) * Math.PI * 2;
      direction.set(
        -Math.cos(phi) * Math.sin(theta),
        Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
      );
      let nearest = -1;
      for (const centre of centres)
        nearest = Math.max(nearest, direction.dot(centre));
      const angle = Math.acos(Math.min(1, nearest));
      const i = (y * width + x) * 4;
      const solid = angle > HOLE ? 255 : 0;
      cut.image.data[i] = cut.image.data[i + 1] = cut.image.data[i + 2] = solid;
      cut.image.data[i + 3] = 255;
      const rim = Math.min(1, Math.max(0, (angle - HOLE) / HOLE_RIM));
      const tone = Math.round(255 * (0.68 + 0.32 * rim));
      shade.image.data[i] =
        shade.image.data[i + 1] =
        shade.image.data[i + 2] =
          tone;
      shade.image.data[i + 3] = 255;
    }
  }
  cut.ctx.putImageData(cut.image, 0, 0);
  shade.ctx.putImageData(shade.image, 0, 0);
  const holes = new THREE.CanvasTexture(cut.canvas);
  const rims = new THREE.CanvasTexture(shade.canvas);
  rims.colorSpace = THREE.SRGBColorSpace;
  holes.anisotropy = rims.anisotropy = 4;
  return { holes: share(holes), rims: share(rims) };
}

function getBallParts(): BallParts {
  if (ballParts) return ballParts;
  const { holes, rims } = perforatedShell();
  // Satin moulded plastic, like the real ball: a soft sheen rather than a
  // hard shine. Both faces are drawn so the inside shows through the holes.
  const body = (color: number) =>
    share(
      new THREE.MeshPhysicalMaterial({
        color,
        map: rims,
        alphaMap: holes,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.2,
        clearcoatRoughness: 0.5,
      }),
    );
  const seam = (color: number) =>
    share(new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  ballParts = {
    sphere: share(new THREE.SphereGeometry(1, 24, 16)),
    // The single seam where the two moulded halves meet.
    seam: share(
      new THREE.TorusGeometry(0.996, 0.028, 5, 48).rotateX(Math.PI / 2),
    ),
    // BIOBUZZ colours: NECTAR in the two alliance colours, POLLEN yellow.
    body: { B: body(0x2463d6), R: body(0xd63a33), G: body(0xf2cf2e) },
    seamColor: { B: seam(0x17459e), R: seam(0x9e2621), G: seam(0xb8961a) },
    shadow: share(
      new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        alphaMap: holes,
        alphaTest: 0.5,
      }),
    ),
  };
  return ballParts;
}

function artifact(look: BallLook, base = ARTIFACT_RADIUS) {
  const radius = look !== 'G' ? base * NECTAR_SCALE : base;
  const parts = getBallParts();
  const key = look;
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(parts.sphere, parts.body[key]);
  mesh.customDepthMaterial = parts.shadow;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.add(new THREE.Mesh(parts.seam, parts.seamColor[key]));
  group.scale.setScalar(radius);
  return group;
}

function goal(
  scene: THREE.Object3D,
  x: number,
  z: number,
  color: number,
  title: string,
) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  scene.add(root);
  // Diamond tread-plate base.
  const tread = treadPlate(3);
  const plate = new THREE.Mesh(
    new RoundedBoxGeometry(2.1, 0.2, 1.9, 1, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x55616a,
      metalness: 0.85,
      roughness: 0.42,
      bumpMap: tread.bumpMap,
      bumpScale: 1.5,
    }),
  );
  plate.castShadow = true;
  plate.receiveShadow = true;
  place(root, plate, 0, MAT_TOP + 0.1, 0);
  for (const a of [-0.74, 0.74]) {
    place(root, solid(0.1, 1.65, 0.1, 0xa4b5bf, 0.8), a, 0.94, -0.45);
    const brace = solid(0.09, 1.8, 0.09, 0x566c79, 0.7);
    brace.rotation.z = a < 0 ? -0.35 : 0.35;
    place(root, brace, a, 0.9, 0.3);
  }
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 0.44, 0.67, 32, 1, true),
    new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18,
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

// Seeded so every load of the field looks the same.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// EVA foam surface: a fine pebbled grain over a gentle larger-scale wave,
// turned into a normal map so the mats catch the hall lights the way real FTC
// tiles do. Built once on a small canvas and tiled.
function foamNormalMap() {
  const size = 256;
  const random = seeded(7);
  // Height field: FTC soft tiles go down smooth side up, so the top is plain
  // EVA foam - just its faint orange-peel grain and a gentle unevenness.
  const height = new Float32Array(size * size);
  for (const [cells, weight] of [
    [64, 0.35],
    [16, 0.2],
  ] as const) {
    const grid = Array.from({ length: cells * cells }, random);
    const step = size / cells;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const gy = y / step;
        const x0 = Math.floor(gx) % cells;
        const y0 = Math.floor(gy) % cells;
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % cells;
        const fx = gx - Math.floor(gx);
        const fy = gy - Math.floor(gy);
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const top =
          grid[y0 * cells + x0] * (1 - sx) + grid[y0 * cells + x1] * sx;
        const bottom =
          grid[y1 * cells + x0] * (1 - sx) + grid[y1 * cells + x1] * sx;
        height[y * size + x] += (top * (1 - sy) + bottom * sy) * weight;
      }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.2, 1.2);
  texture.anisotropy = 4;
  return texture;
}

function foamFloor(scene: THREE.Object3D) {
  // Real mats never match perfectly: each one gets its own slight shade,
  // carried as a vertex colour so the whole floor is still one draw call.
  const material = new THREE.MeshStandardMaterial({
    color: 0x7c8387,
    roughness: 0.9,
    metalness: 0,
    normalMap: foamNormalMap(),
    normalScale: new THREE.Vector2(0.3, 0.3),
    vertexColors: true,
  });
  const shade = seeded(19);
  const size = TILE * SCALE;
  // The thin seam left all the way round every mat, teeth included, so it
  // reads as a dark line the way it does on a real field.
  const seam = 0.035;
  // Tabs about an inch deep on a 24-inch tile, as on the real ones.
  const tooth = size * 0.042;
  const geometries: THREE.BufferGeometry[] = [];
  for (let column = 0; column < TILES; column++)
    for (let row = 0; row < TILES; row++) {
      const outline = insetOutline(
        tileOutline(size, tooth, tileEdges(column, row, TILES)),
        seam / 2,
      );
      const geometry = new THREE.ExtrudeGeometry(
        new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))),
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
      const tint = 0.93 + shade() * 0.12;
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      colors.fill(tint);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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

// Scenery outside the field walls never throws a shadow anyone sees on the
// mats, so it stays out of the shadow pass: each part left out is one less
// thing drawn twice every frame.
function quietFarShadows(venue: THREE.Object3D) {
  const reach = (FIELD_SIZE * SCALE) / 2 + 1;
  const bounds = new THREE.Box3();
  venue.updateMatrixWorld(true);
  venue.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow) return;
    bounds.setFromObject(mesh);
    const outside =
      bounds.min.x > reach ||
      bounds.max.x < -reach ||
      bounds.min.z > reach ||
      bounds.max.z < -reach;
    if (outside) mesh.castShadow = false;
  });
}

// Width of the alliance-colored tape round each BASE, in scene units.
const BASE_BORDER = 0.32;

// The hall around the field was laid out for a field 8.1 units from center to
// wall. Everything beside the field moves out by however much further the
// wall now is, so the benches and trusses always clear it.
const HALL_LAYOUT_HALF = 8.1;

function arenaRoom(scene: THREE.Object3D) {
  const half = (FIELD_SIZE * SCALE) / 2;
  const grow = half - HALL_LAYOUT_HALF;
  const rail = half * 2 + 0.3;
  // Polished concrete hall floor, in slabs about the size of four mats.
  const hallWide = 70 + grow * 4;
  const hallDeep = 60 + grow * 4;
  const concrete = concreteFloor(1);
  concrete.map.repeat.set(hallWide / 8, hallDeep / 8);
  concrete.roughnessMap.repeat.copy(concrete.map.repeat);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(hallWide, 0.3, hallDeep),
    new THREE.MeshStandardMaterial({
      color: 0xc9cfd1,
      map: concrete.map,
      roughnessMap: concrete.roughnessMap,
      roughness: 0.75,
      metalness: 0,
    }),
  );
  floor.receiveShadow = true;
  place(scene, floor, 0, -0.45, 0);
  // A band of dark event carpet round the field, as at a real venue, so the
  // field reads as the stage and the hall floor as the room.
  const carpetSize = rail + 7;
  const carpet = eventCarpet(carpetSize / 3);
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(carpetSize, carpetSize),
    new THREE.MeshStandardMaterial({
      map: carpet.map,
      bumpMap: carpet.bumpMap,
      bumpScale: 0.6,
      roughness: 1,
      metalness: 0,
    }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  place(scene, rug, 0, -0.295, 0);
  place(scene, solid(rail + 0.8, 0.22, rail + 0.8, 0x0f1c24, 0.6), 0, -0.12, 0);
  foamFloor(scene);
  for (const x of [-half - 0.1, half + 0.1]) {
    place(scene, solid(0.12, 0.1, rail, 0xb7c5cd, 0.8), x, 0.67, 0);
    place(scene, solid(0.15, 0.2, rail, 0x293d49, 0.6), x, 0.13, 0);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.6, rail - 0.1),
      polycarbonate(),
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
      polycarbonate(),
    );
    place(scene, wall, 0, 0.37, z);
    for (let x = -half; x <= half; x += TILE * SCALE)
      place(scene, solid(0.12, 0.7, 0.14, 0x7e949f, 0.8), x, 0.35, z);
  }
  // Each BASE fills its corner mat exactly, so what players see is the area
  // that counts: alliance-colored tape round the edge, dark inside.
  for (const [zone, color] of [
    [BLUE_BASE_ZONE, blue],
    [RED_BASE_ZONE, red],
  ] as const) {
    const middle = zoneCenter(zone);
    const spot = position(middle.x, middle.y);
    const wide = (zone.right - zone.left) * SCALE;
    const deep = (zone.bottom - zone.top) * SCALE;
    const tape = solid(wide, 0.009, deep, color);
    place(scene, tape, spot.x, MAT_TOP, spot.z);
    place(
      scene,
      solid(wide - BASE_BORDER * 2, 0.015, deep - BASE_BORDER * 2, 0x384e60),
      spot.x,
      MAT_TOP + 0.006,
      spot.z,
    );
    const marker = label('BASE', 1.2, 0.4, '#384e60', '#cfdee8');
    marker.rotation.x = -Math.PI / 2;
    place(scene, marker, spot.x, MAT_TOP + 0.02, spot.z + 0.26);
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
  const blueSpot = position(BLUE_GOAL.x, BLUE_GOAL.y);
  const redSpot = position(RED_GOAL.x, RED_GOAL.y);
  goal(scene, blueSpot.x, blueSpot.z, blue, 'BLUE GOAL');
  goal(scene, redSpot.x, redSpot.z, red, 'RED GOAL');
  const midline = Math.floor(half * 0.62);
  for (let z = -midline; z <= midline; z += 1)
    place(scene, solid(0.045, 0.008, 0.43, 0xd6bc74), 0, MAT_TOP, z);
  // Open competition hall: a painted block wall carrying the event banners,
  // aluminum bleachers down both sides, and a lighting truss overhead.
  const wallWide = 52 + grow * 2;
  const blocks = blockWall(wallWide / 3.2, 14 / 1.6);
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallWide, 14, 0.3),
    new THREE.MeshStandardMaterial({
      map: blocks.map,
      bumpMap: blocks.bumpMap,
      bumpScale: 1.2,
      roughness: 0.88,
      metalness: 0,
    }),
  );
  backWall.receiveShadow = true;
  place(scene, backWall, 0, 4, -17 - grow);
  place(scene, label('FIELD / LAB', 13, 2, '#1b2e3b'), 0, 5.7, -16.8 - grow);
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
    -16.75 - grow,
  );
  const benchLength = 18 + grow * 2;
  const plank = ribbedPlank(benchLength / 1.2);
  const plankMaterial = new THREE.MeshStandardMaterial({
    color: 0xb4bec4,
    metalness: 0.85,
    roughness: 0.38,
    bumpMap: plank.bumpMap,
    bumpScale: 0.5,
  });
  // Three stands of three tiers: one down each side and one behind the far
  // end of the field, where both cameras can see it. Every seat is an
  // instance of one mesh, and so is every spectator, so the whole crowd
  // costs three draws.
  type Seat = { x: number; y: number; z: number; color: number };
  const seatSpots: Seat[] = [];
  const rows = 3;
  const tier = (
    along: 'x' | 'z',
    // Seat line of the front row, and which way the stand climbs.
    front: number,
    outward: number,
    center: number,
    length: number,
    seatColor: number,
  ) => {
    for (let row = 0; row < rows; row++) {
      const line = front + outward * row * 1.6;
      const riser = solid(
        along === 'z' ? 5.5 : length,
        0.35,
        along === 'z' ? length : 5.5,
        0x2c3a44,
      );
      const riserLine = line + outward * 1.6;
      if (along === 'z')
        place(scene, riser, riserLine, row * 0.55 - 0.1, center);
      else place(scene, riser, center, row * 0.55 - 0.1, riserLine);
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(
          along === 'z' ? 1.5 : length,
          0.04,
          along === 'z' ? length : 1.5,
        ),
        plankMaterial,
      );
      deck.receiveShadow = true;
      if (along === 'z') place(scene, deck, line, row * 0.55 + 0.09, center);
      else place(scene, deck, center, row * 0.55 + 0.09, line);
      const count = Math.floor((length - 2) / 1.15);
      for (let i = 0; i < count; i++) {
        const offset = center - ((count - 1) * 1.15) / 2 + i * 1.15;
        seatSpots.push({
          x: along === 'z' ? line : offset,
          y: row * 0.55 + 0.19,
          z: along === 'z' ? offset : line,
          color: seatColor,
        });
      }
    }
    // One handrail along the top tier keeps the stands readable.
    const railLine = front + outward * ((rows - 1) * 1.6 + 0.9);
    const rail = solid(
      along === 'z' ? 0.07 : length,
      0.07,
      along === 'z' ? length : 0.07,
      0xc3ccd1,
      0.8,
    );
    if (along === 'z') place(scene, rail, railLine, 2.05, center);
    else place(scene, rail, center, 2.05, railLine);
    for (let t = -length / 2 + 0.5; t < length / 2 - 0.4; t += 3.5) {
      const post = solid(0.07, 0.95, 0.07, 0xc3ccd1, 0.8);
      if (along === 'z') place(scene, post, railLine, 1.6, center + t);
      else place(scene, post, center + t, 1.6, railLine);
    }
  };
  for (const side of [-1, 1])
    tier(
      'z',
      side * (14.4 + grow),
      side,
      -1,
      benchLength,
      side < 0 ? 0x2f6f96 : 0x8c3f42,
    );
  tier('x', -(half + 4.2), -1, 0, half * 2 + 3, 0x59636b);

  const seats = new THREE.InstancedMesh(
    new RoundedBoxGeometry(0.75, 0.16, 0.75, 1, 0.05),
    new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }),
    seatSpots.length,
  );
  const pose = new THREE.Matrix4();
  const tint = new THREE.Color();
  seatSpots.forEach((spot, i) => {
    seats.setMatrixAt(i, pose.makeTranslation(spot.x, spot.y, spot.z));
    seats.setColorAt(i, tint.setHex(spot.color));
  });
  seats.receiveShadow = true;
  scene.add(seats);

  // The crowd: a seated body and a head on about two seats in three. Shirts
  // lean toward the alliance colour of the stand they sit in.
  const pick = seeded(53);
  const shirts = [
    0x2f6f96, 0x8c3f42, 0xe2ae35, 0x3f7f55, 0xe7e9ea, 0x2a2f36, 0x7a5aa6,
    0xd9502d,
  ];
  const skins = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a21, 0xffdbac];
  const crowd = seatSpots.filter(() => pick() < 0.66);
  const bodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.21, 0.36, 3, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }),
    crowd.length,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 }),
    crowd.length,
  );
  crowd.forEach((spot, i) => {
    const lean = (pick() - 0.5) * 0.12;
    const alliance =
      spot.color === 0x2f6f96 || spot.color === 0x8c3f42 ? spot.color : null;
    const shirt =
      alliance !== null && pick() < 0.45
        ? alliance
        : shirts[Math.floor(pick() * shirts.length)];
    bodies.setMatrixAt(
      i,
      pose.makeTranslation(spot.x + lean, spot.y + 0.47, spot.z),
    );
    bodies.setColorAt(i, tint.setHex(shirt));
    heads.setMatrixAt(
      i,
      pose.makeTranslation(spot.x + lean * 1.4, spot.y + 0.98, spot.z),
    );
    heads.setColorAt(i, tint.setHex(skins[Math.floor(pick() * skins.length)]));
  });
  scene.add(bodies, heads);

  // Alliance signs hang on the back wall, above the far stand.
  for (const side of [-1, 1])
    place(
      scene,
      label(
        side < 0 ? 'BLUE ALLIANCE' : 'RED ALLIANCE',
        7,
        0.8,
        '#132530',
        side < 0 ? '#62b6ed' : '#e7807d',
      ),
      side * (10 + grow),
      3,
      -16.8 - grow,
    );
  for (const x of [-13 - grow, 13 + grow]) {
    place(scene, solid(0.22, 11, 0.22, 0x7d919c, 0.8), x, 5, -12 - grow);
    place(scene, solid(0.22, 11, 0.22, 0x7d919c, 0.8), x, 5, 9 + grow);
  }
  for (const z of [-12 - grow]) {
    place(scene, solid(26 + grow * 2, 0.15, 0.2, 0x80939f, 0.8), 0, 10.5, z);
    place(scene, solid(26 + grow * 2, 0.15, 0.2, 0x80939f, 0.8), 0, 9.8, z);
    for (let x = -12 - grow; x <= 12 + grow; x += 1.5) {
      const strut = solid(1.65, 0.08, 0.08, 0x80939f, 0.8);
      strut.rotation.z = 0.45;
      place(scene, strut, x, 10.15, z);
    }
    // Stage lights clamped under the truss, aimed at the field. Their lenses
    // are bright enough to glow where the quality tier allows it.
    const lens = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfff2dc).multiplyScalar(4),
    });
    for (let i = -2; i <= 2; i++) {
      const x = i * ((12 + grow) / 2.4);
      const housing = solid(0.9, 0.55, 0.7, 0x1f272c, 0.3);
      housing.rotation.x = -0.5;
      place(scene, housing, x, 9.35, z + 0.45);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), lens);
      // Tipped to face down and out toward the field.
      face.rotation.x = Math.PI / 2 - 0.5;
      place(scene, face, x, 9.12, z + 0.6);
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
) {
  const { scene, renderer, environment } = setupScene(canvas, 0x182936);
  // Everything that never moves - field, goals, hall, stands - is built into
  // one group and fused into a handful of meshes.
  const venue = new THREE.Group();
  arenaRoom(venue);
  quietFarShadows(venue);
  mergeStaticMeshes(venue, []);
  scene.add(venue);
  // Fog and draw distance were tuned for the original field; stretch them with
  // the field so a bigger one is never lost in the haze.
  const roomy = (FIELD_SIZE * SCALE) / (HALL_LAYOUT_HALF * 2);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near *= roomy;
    scene.fog.far *= roomy;
  }
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 120 * roomy);
  const pipeline = createRenderPipeline(renderer, scene, camera, () => {
    stillFrameDrawn = false;
  });
  // Where the camera is looking. Driving input is turned to match it, so
  // "up" on the stick always drives away from the camera.
  const cameraTarget = new THREE.Vector3();
  let mode: CameraMode = 'arena';
  let width = 1,
    height = 1;
  const lookAt = new THREE.Vector3(0, 0, 0);
  const desiredPosition = new THREE.Vector3();
  const followLook = new THREE.Vector3();
  const lineStart = new THREE.Vector3();
  const lineEnd = new THREE.Vector3();
  const mouth = new THREE.Vector3();
  const scratchVelocity = new THREE.Vector2();
  const scratchHeading = new THREE.Vector2();
  // A paused match is a still image: draw it once, then leave the graphics
  // chip alone until something changes.
  let stillFrameDrawn = false;
  const player = createRobotModel(selected);
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
  // Gold for ARTIFACTS and the GOAL; alliance blue when it points at the BASE.
  const aimGold = 0xf0c35b;
  const aimRing = ring(0.42, aimGold, 0.027);
  scene.add(aimRing);
  // Range Finder's ring: the loading range round the GOAL, dim until the robot
  // is inside it, then bright.
  const loadRange = scoreReach(selected.reach);
  const rangeRing = ring(loadRange * SCALE, blue, 0.018);
  rangeRing.position.copy(position(BLUE_GOAL.x, BLUE_GOAL.y, MAT_TOP + 0.01));
  rangeRing.visible = selected.assist === 'range';
  scene.add(rangeRing);
  const rangeColor = new THREE.Color(blue);
  // The ARTIFACTS on the mats are drawn as instances: one body and one set
  // of seams per colour, however many balls are out. Only a ball in flight
  // (into a robot or a GOAL) gets a mesh of its own.
  const parts = getBallParts();
  const makeField = (look: BallLook) => {
    const capacity = Math.max(
      1,
      world.pieces.filter(
        (piece) => lookOf(piece.color, piece.alliance) === look,
      ).length,
    );
    const body = new THREE.InstancedMesh(
      parts.sphere,
      parts.body[look],
      capacity,
    );
    body.customDepthMaterial = parts.shadow;
    body.castShadow = true;
    body.receiveShadow = true;
    const seams = new THREE.InstancedMesh(
      parts.seam,
      parts.seamColor[look],
      capacity,
    );
    // The balls move every frame, so the precomputed bounds would be stale.
    body.frustumCulled = seams.frustumCulled = false;
    scene.add(body, seams);
    return { body, seams };
  };
  const fieldBalls = {
    B: makeField('B'),
    R: makeField('R'),
    G: makeField('G'),
  };
  // Each ball's accumulated roll, and whether it was on the mats last frame.
  const rolls = new Map<number, THREE.Euler>();
  const onMats = new Map<number, boolean>();
  world.pieces.forEach((piece) => {
    rolls.set(piece.id, new THREE.Euler(0, piece.id * 1.9, 0));
    onMats.set(piece.id, piece.active);
  });
  const ballPose = new THREE.Matrix4();
  const ballSpot = new THREE.Vector3();
  const ballTurn = new THREE.Quaternion();
  const ballSize = new THREE.Vector3();
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
      color: 0xf0c35b,
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
    pipeline.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (mode === 'arena') resetArenaCamera();
    stillFrameDrawn = false;
  };
  // Framed off the mats so the whole square field fills the view.
  const fieldSpan = FIELD_SIZE * SCALE;
  const arenaDistance = () =>
    Math.max(fieldSpan * 1.15, (fieldSpan * 1.3) / camera.aspect);
  const resetArenaCamera = () => {
    const distance = arenaDistance();
    camera.position.set(0, distance * 0.76, distance * 0.78);
    cameraTarget.set(0, 0, -0.2);
    camera.lookAt(cameraTarget);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement!);
  resize();
  resetArenaCamera();
  let disposed = false;
  const render = (dt: number, state: World, paused: boolean, alpha = 1) => {
    const tween = (from: number, to: number) => from + (to - from) * alpha;
    if (disposed) return;
    if (!paused) stillFrameDrawn = false;
    else if (stillFrameDrawn) return;
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
      toScene(
        text.position,
        particle.x,
        particle.y,
        2.5 + (1 - particle.life) * 0.8,
      );
      text.quaternion.copy(camera.quaternion);
      text.material.opacity = Math.min(1, particle.life * 3);
    }
    const actors = [state.player, state.bot];
    const models = [player, bot];
    models.forEach((model, index) => {
      const actor = actors[index];
      toScene(
        model.root.position,
        tween(actor.px, actor.x),
        tween(actor.py, actor.y),
        MAT_TOP,
      );
      const angle = Math.PI / 2 - actor.angle;
      const error = Math.atan2(
        Math.sin(angle - model.root.rotation.y),
        Math.cos(angle - model.root.rotation.y),
      );
      // Paused means frozen: not even the last of a turn plays out.
      if (!paused) model.root.rotation.y += error * Math.min(1, dt * 14);
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
        const acceleration = scratchVelocity
          .set(actor.vx, actor.vy)
          .sub(previousVelocity[index]);
        const lean = motion.matches
          ? 0
          : THREE.MathUtils.clamp(
              (acceleration.dot(
                scratchHeading.set(
                  Math.cos(actor.angle),
                  Math.sin(actor.angle),
                ),
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
          const ball = artifact(
            lookOf(color, index === 0 ? 'blue' : 'red'),
            0.9,
          );
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
          const mesh = artifact(lookOf(color, index === 0 ? 'blue' : 'red'));
          scene.add(mesh);
          flights.push({
            mesh,
            from: model.groups.score.localToWorld(
              new THREE.Vector3(0, 0.3, 0.35),
            ),
            // Into the top of the funnel of the GOAL it was loaded into.
            to: position(
              index === 0 ? BLUE_GOAL.x : RED_GOAL.x,
              index === 0 ? BLUE_GOAL.y : RED_GOAL.y,
              1.8,
            ),
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
    const drawn = { B: 0, R: 0, G: 0 };
    state.pieces.forEach((piece) => {
      const key = lookOf(piece.color, piece.alliance);
      const roll = rolls.get(piece.id)!;
      if (piece.active) {
        // A tipped GOAL puts ARTIFACTS back on the mats: they simply join the
        // instances again.
        onMats.set(piece.id, true);
        if (!paused) {
          // True rolling speed turns a fast ARTIFACT into a blur, so the spin
          // is capped: it still reads as rolling, just without the strobing.
          const spin =
            260 / Math.max(260, Math.hypot(piece.vx ?? 0, piece.vy ?? 0));
          roll.x += ((piece.vy ?? 0) * spin * SCALE * dt) / 0.28;
          roll.z -= ((piece.vx ?? 0) * spin * SCALE * dt) / 0.28;
        }
        toScene(
          ballSpot,
          tween(piece.px, piece.x),
          tween(piece.py, piece.y),
          restingHeight(piece.color),
        );
        const radius =
          piece.color === 'P'
            ? ARTIFACT_RADIUS * NECTAR_SCALE
            : ARTIFACT_RADIUS;
        ballPose.compose(
          ballSpot,
          ballTurn.setFromEuler(roll),
          ballSize.setScalar(radius),
        );
        const slot = drawn[key]++;
        fieldBalls[key].body.setMatrixAt(slot, ballPose);
        fieldBalls[key].seams.setMatrixAt(slot, ballPose);
      } else if (onMats.get(piece.id)) {
        // Just picked up: a copy flies from the mats into the robot.
        onMats.set(piece.id, false);
        const collectorIndex = piece.collector === 'bot' ? 1 : 0;
        const pickup = artifact(lookOf(piece.color, piece.alliance));
        scene.add(pickup);
        flights.push({
          mesh: pickup,
          from: position(piece.x, piece.y, restingHeight(piece.color)),
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
    for (const key of ['B', 'R', 'G'] as const) {
      const { body, seams } = fieldBalls[key];
      body.count = seams.count = drawn[key];
      body.instanceMatrix.needsUpdate = true;
      seams.instanceMatrix.needsUpdate = true;
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (!paused) f.elapsed += dt;
      const t = THREE.MathUtils.clamp(f.elapsed / f.duration, 0, 1);
      f.mesh.visible = f.elapsed >= 0;
      if (f.collector !== undefined) {
        const root = models[f.collector].root;
        root.localToWorld(mouth.set(0, 0.9, 3.1));
        root.localToWorld(f.to.set(0, 2.05, 0.65));
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
    toScene(
      playerRing.position,
      state.player.x,
      state.player.y,
      MAT_TOP + 0.01,
    );
    toScene(botRing.position, state.bot.x, state.bot.y, MAT_TOP + 0.01);
    if (rangeRing.visible) {
      const inRange =
        Math.hypot(
          state.player.x - BLUE_GOAL.x,
          state.player.y - BLUE_GOAL.y,
        ) <= loadRange;
      (rangeRing.material as THREE.MeshBasicMaterial).color
        .copy(rangeColor)
        .multiplyScalar(inRange ? 2.6 : 0.7);
    }
    // Guides are the assist parts' job alone; each draws only in its own
    // part of the match (see `assistGuides`).
    const target = playerTarget(state, selected);
    if (target && assistGuides(selected.assist, target.kind)) {
      aimRing.visible = true;
      toScene(aimRing.position, target.x, target.y, MAT_TOP + 0.02);
      aimRing.scale.setScalar(target.kind === 'piece' ? 1 : 2.5);
      const aimColor = target.kind === 'base' ? blue : aimGold;
      (aimRing.material as THREE.MeshBasicMaterial).color
        .setHex(aimColor)
        .multiplyScalar(1.6);
      (targetLine.material as THREE.LineDashedMaterial).color.setHex(aimColor);
      const attr = targetLine.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const start = toScene(
          lineStart,
          state.player.x,
          state.player.y,
          MAT_TOP + 0.03,
        ),
        end = toScene(lineEnd, target.x, target.y, MAT_TOP + 0.03);
      attr.setXYZ(0, start.x, start.y, start.z);
      attr.setXYZ(1, end.x, end.y, end.z);
      attr.needsUpdate = true;
      targetLine.computeLineDistances();
      targetLine.visible = true;
    } else {
      aimRing.visible = false;
      targetLine.visible = false;
    }
    // The camera holds exactly where it is while paused, so the whole field
    // visibly stops rather than the view still drifting after the robot.
    if (mode === 'follow' && !paused) {
      const p = player.root.position;
      desiredPosition.set(p.x, FOLLOW_HEIGHT, p.z + FOLLOW_BACK);
      const smoothing = motion.matches ? 1 : 1 - Math.exp(-6 * dt);
      camera.position.lerp(desiredPosition, smoothing);
      lookAt.lerp(followLook.set(p.x, 0.1, p.z - FOLLOW_AHEAD), smoothing);
      camera.lookAt(lookAt);
      cameraTarget.copy(lookAt);
    }
    pipeline.render();
    if (paused) stillFrameDrawn = true;
  };
  return {
    render,
    setCamera(next: CameraMode) {
      mode = next;
      stillFrameDrawn = false;
      if (next === 'arena') resetArenaCamera();
      if (next === 'follow') {
        const p = position(world.player.x, world.player.y);
        lookAt.set(p.x, 0.1, p.z - FOLLOW_AHEAD);
        camera.position.set(p.x, FOLLOW_HEIGHT, p.z + FOLLOW_BACK);
        cameraTarget.copy(lookAt);
        camera.lookAt(lookAt);
      }
    },
    movement(x: number, y: number) {
      const delta = camera.position.clone().sub(cameraTarget);
      const angle = Math.atan2(delta.x, delta.z);
      return {
        x: x * Math.cos(angle) + y * Math.sin(angle),
        y: -x * Math.sin(angle) + y * Math.cos(angle),
      };
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      disposeObject(scene);
      for (const { body, seams } of Object.values(fieldBalls)) {
        body.dispose();
        seams.dispose();
      }
      environment.dispose();
      pipeline.dispose();
      renderer.dispose();
    },
  };
}
