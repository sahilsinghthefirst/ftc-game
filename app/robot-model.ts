import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssemblyCategory } from './assembly-bay';
import { mergeStaticMeshes } from './merge-static';
import * as hardware from './robot-hardware';
export type MovingParts = {
  wheels: THREE.Group[];
  intake: THREE.Group | null;
  lift: THREE.Group | null;
  scorer: THREE.Group | null;
  mount: THREE.Group | null;
  snap: { group: THREE.Group; origin: THREE.Vector3; started: number } | null;
  articulated: THREE.Object3D[];
};

const palette = {
  aluminum: 0xcbd1d3,
  aluminumDark: 0x758187,
  edge: 0x334148,
  rubber: 0x1d2529,
  orange: 0xe96c2b,
  pink: 0xe8539b,
  slate: 0x46525a,
  slateDark: 0x333e45,
  yellow: 0xe5ad26,
  blue: 0x387fa4,
  dark: 0x252f34,
  wireRed: 0xd9503d,
  wireBlue: 0x3888b6,
  wireBlack: 0x262b2e,
};

// Colours that are bare metal on a real robot: extrusion, plates and bolts.
const METAL_COLORS = new Set([
  palette.aluminum,
  palette.aluminumDark,
  0xd7dcde,
]);

// Surface finish follows what the part is made of: brushed aluminum, rubber
// tread, or moulded plastic for everything else. A part that asks for a
// specific finish still gets it.
function material(
  color: number,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  const metal = METAL_COLORS.has(color);
  const rubber = color === palette.rubber;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: metal ? 0.3 : rubber ? 0.9 : 0.42,
    metalness: metal ? 0.9 : 0.04,
    ...options,
  });
}

function box(
  width: number,
  height: number,
  depth: number,
  color: number,
  options?: Partial<THREE.MeshStandardMaterialParameters>,
) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(
      width,
      height,
      depth,
      1,
      Math.min(0.045, width / 8, height / 8, depth / 8),
    ),
    material(color, options),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(
  radius: number,
  length: number,
  color: number,
  radialSegments = 24,
) {
  // Small parts read as round with far fewer sides than big ones; any more
  // only costs vertices on a school laptop's graphics chip.
  const sides = Math.max(
    12,
    Math.min(radialSegments, Math.round(radius * 100)),
  );
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, sides),
    material(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function bolt(
  x: number,
  y: number,
  z: number,
  rotation: 'top' | 'side' = 'top',
) {
  const mesh = hardware.fastener(0.06);
  mesh.position.set(x, y, z);
  if (rotation === 'side') mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function channel(length: number, axis: 'x' | 'z' | 'y' = 'x') {
  return hardware.machinedChannel(length, axis);
}

function bracket(x: number, y: number, z: number, rotationY = 0) {
  const group = new THREE.Group();
  const bottom = hardware.plate(
    0.52,
    0.55,
    0.045,
    [
      [-0.15, 0, 0.05],
      [0.15, 0, 0.05],
    ],
    palette.aluminum,
  );
  bottom.rotation.x = -Math.PI / 2;
  const upright = hardware.plate(
    0.52,
    0.48,
    0.045,
    [
      [-0.15, 0.05, 0.05],
      [0.15, 0.05, 0.05],
    ],
    palette.aluminum,
  );
  upright.position.set(0, 0.22, -0.22);
  group.add(bottom, upright, bolt(-0.15, 0.07, 0), bolt(0.15, 0.07, 0));
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  return group;
}

const barrelCache = new Map<string, THREE.LatheGeometry>();

function barrelGeometry(length: number, radius: number) {
  const key = `${length}:${radius}`;
  const cached = barrelCache.get(key);
  if (cached) return cached;
  const profile: [number, number][] = [
    [0.3, -0.5],
    [0.62, -0.45],
    [0.85, -0.33],
    [0.97, -0.16],
    [1, 0],
    [0.97, 0.16],
    [0.85, 0.33],
    [0.62, 0.45],
    [0.3, 0.5],
  ];
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r * radius, y * length)),
    20,
  );
  barrelCache.set(key, geometry);
  return geometry;
}

type RollerBank = {
  count: number;
  radius: number;
  length: number;
  thickness: number;
  tilt: number;
  color: number;
  offset?: number;
  phase?: number;
  yoke?: boolean;
};

function addRollerBank(group: THREE.Group, bank: RollerBank) {
  const { count, radius, length, thickness, tilt, color } = bank;
  const offset = bank.offset ?? 0;
  const axis = new THREE.Vector3(Math.sin(tilt), 0, Math.cos(tilt));
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis,
  );
  for (let i = 0; i < count; i += 1) {
    const pivot = new THREE.Group();
    pivot.rotation.x = ((i + (bank.phase ?? 0)) / count) * Math.PI * 2;

    const roller = new THREE.Mesh(
      barrelGeometry(length, thickness),
      material(color, { roughness: 0.52, metalness: 0.04 }),
    );
    roller.position.set(offset, radius, 0);
    roller.quaternion.copy(orientation);
    roller.castShadow = true;
    roller.receiveShadow = true;
    pivot.add(roller);

    const pin = cylinder(thickness * 0.3, length + 0.1, palette.aluminum, 8);
    pin.position.set(offset, radius, 0);
    pin.quaternion.copy(orientation);
    pivot.add(pin);

    if (bank.yoke !== false) {
      for (const end of [-1, 1]) {
        const seat = axis.clone().multiplyScalar((end * (length + 0.08)) / 2);
        const reach = Math.hypot(radius, seat.z);
        const lean = Math.atan2(seat.z, radius);
        const tine = box(0.05, 0.27, 0.1, palette.slate, {
          roughness: 0.55,
          metalness: 0.18,
        });
        tine.position.set(
          offset + seat.x,
          Math.cos(lean) * (reach - 0.12),
          Math.sin(lean) * (reach - 0.12),
        );
        tine.rotation.x = lean;
        pivot.add(tine);
        const collar = cylinder(thickness * 0.44, 0.055, palette.aluminum, 12);
        collar.position.set(offset + seat.x * 0.88, radius, seat.z * 0.88);
        collar.quaternion.copy(orientation);
        pivot.add(collar);
      }
    }
    group.add(pivot);
  }
}

function addWheelHub(group: THREE.Group, radius: number, width: number) {
  const disc = cylinder(radius, width, palette.slate, 28);
  disc.rotation.z = Math.PI / 2;
  group.add(disc);

  const rim = cylinder(radius * 0.78, width + 0.05, palette.slateDark, 26);
  rim.rotation.z = Math.PI / 2;
  group.add(rim);

  for (const side of [-1, 1]) {
    const holes: Array<[number, number, number]> = [[0, 0, radius * 0.16]];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      holes.push([
        Math.cos(a) * radius * 0.48,
        Math.sin(a) * radius * 0.48,
        radius * 0.105,
      ]);
    }
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius * 0.8, 0, Math.PI * 2, false);
    for (const [x, y, r] of holes) {
      const hole = new THREE.Path();
      hole.absarc(x, y, r, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const face = hardware.mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.025,
        bevelEnabled: false,
        curveSegments: 8,
      }),
      hardware.metal(),
    );
    face.rotation.y = Math.PI / 2;
    face.position.x = side * (width / 2 + 0.02);
    group.add(face);

    const boss = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, 0.12, 6),
      material(palette.slateDark, { roughness: 0.5, metalness: 0.3 }),
    );
    boss.rotation.z = Math.PI / 2;
    boss.position.x = side * (width / 2 + 0.07);
    boss.castShadow = true;
    group.add(boss);

    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const screw = hardware.fastener(0.035);
      screw.rotation.z = (-side * Math.PI) / 2;
      screw.position.set(
        side * (width / 2 + 0.05),
        Math.sin(angle) * radius * 0.42,
        Math.cos(angle) * radius * 0.42,
      );
      group.add(screw);
    }
  }
}

function mergeWheelParts(source: THREE.Group) {
  const buckets = new Map<
    string,
    { material: THREE.Material; geometries: THREE.BufferGeometry[] }
  >();
  source.updateMatrixWorld(true);
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = (
      Array.isArray(child.material) ? child.material[0] : child.material
    ) as THREE.MeshStandardMaterial;
    const key = `${mat.color.getHex()}:${mat.roughness}:${mat.metalness}:${mat.roughnessMap?.uuid ?? ''}`;
    const geometry = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    const bucket = buckets.get(key) ?? { material: mat, geometries: [] };
    bucket.geometries.push(geometry);
    buckets.set(key, bucket);
  });
  const merged = new THREE.Group();
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach((item) => item.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    merged.add(mesh);
  }
  return merged;
}

function makeWheel(kind: string, handedness = 1) {
  const group = new THREE.Group();
  const wide = kind === 'anchor' || kind === 'trailblazer';

  if (kind === 'comet') {
    addWheelHub(group, 0.29, 0.3);
    addRollerBank(group, {
      count: 12,
      radius: 0.425,
      length: 0.42,
      thickness: 0.1,
      tilt: (handedness * Math.PI) / 4,
      color: 0xb78542,
    });
  } else if (kind === 'orbit') {
    addWheelHub(group, 0.27, 0.26);
    for (const side of [-1, 1]) {
      addRollerBank(group, {
        count: 8,
        radius: 0.44,
        length: 0.27,
        thickness: 0.09,
        tilt: 0,
        color: 0x4b6370,
        offset: side * 0.085,
        phase: side < 0 ? 0 : 0.5,
      });
    }
  } else {
    const tire = cylinder(
      wide ? 0.57 : 0.53,
      wide ? 0.38 : 0.32,
      palette.rubber,
      32,
    );
    tire.rotation.z = Math.PI / 2;
    group.add(tire);
    addWheelHub(group, wide ? 0.31 : 0.28, wide ? 0.42 : 0.36);
    for (let i = 0; i < 32; i += 1) {
      const angle = (i / 32) * Math.PI * 2;
      const tread = box(wide ? 0.44 : 0.38, 0.09, 0.14, 0x39454b, {
        roughness: 0.92,
        metalness: 0.02,
      });
      tread.position.set(
        0,
        Math.sin(angle) * (wide ? 0.54 : 0.5),
        Math.cos(angle) * (wide ? 0.54 : 0.5),
      );
      tread.rotation.x = -angle;
      group.add(tread);
    }
  }

  const shaft = cylinder(0.07, wide ? 0.62 : 0.56, palette.aluminumDark, 12);
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);
  return mergeWheelParts(group);
}

function tube(points: THREE.Vector3[], color: number, radius = 0.035) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 28, radius, 7, false),
    material(color, { roughness: 0.85, metalness: 0 }),
  );
  mesh.castShadow = true;
  return mesh;
}

function addDrivetrain(root: THREE.Group, id: string, moving: MovingParts) {
  const group = new THREE.Group();
  const railLeft = channel(4.7, 'z');
  railLeft.position.set(-2.35, 0.65, 0);
  const railRight = channel(4.7, 'z');
  railRight.position.set(2.35, 0.65, 0);
  const crossFront = channel(5.05, 'x');
  crossFront.position.set(0, 0.65, 2.12);
  const crossRear = channel(5.05, 'x');
  crossRear.position.set(0, 0.65, -2.12);
  group.add(railLeft, railRight, crossFront, crossRear);

  const zPositions = id === 'trailblazer' ? [-1.7, 0, 1.7] : [-1.7, 1.7];
  for (const side of [-1, 1]) {
    for (const z of zPositions) {
      const wheel = makeWheel(id, z < 0 ? -1 : 1);
      wheel.position.set(side * 2.72, 0.55, z);
      if (side < 0) wheel.rotation.y = Math.PI;
      group.add(wheel);
      moving.wheels.push(wheel);

      const bearing = hardware.bearing();
      bearing.position.set(side * 2.43, 0.55, z);
      group.add(bearing);
    }
  }

  for (const side of [-1, 1]) {
    for (const z of [-1.7, 1.7]) {
      const motor = hardware.gearMotor();
      motor.rotation.y = side < 0 ? Math.PI : 0;
      hardware.at(group, motor, side * 1.77, 0.64, z);
      const mount = hardware.plate(
        0.46,
        0.55,
        0.065,
        [[0, 0, 0.19]],
        palette.aluminumDark,
      );
      mount.rotation.y = Math.PI / 2;
      hardware.at(group, mount, side * 2.18, 0.63, z);
      for (const dz of [-0.15, 0.15]) group.add(bolt(side * 2.2, 0.94, z + dz));
      group.add(
        hardware.cable(
          [
            [side * 1.05, 0.75, z],
            [side * 0.92, 0.96, z * 0.65],
            [side * 1.2, 1.08, -0.4],
          ],
          0xb74a35,
        ),
      );
    }
    if (id === 'trailblazer' || id === 'anchor') {
      for (const z of zPositions)
        hardware.at(group, hardware.pulley(0.22), side * 2.05, 0.55, z);
      group.add(hardware.belt(side * 2.05, 0.55, -1.7, 1.7, 0.22));
    }
    const bumper = hardware.ribbedPanel(0.09, 0.4, 2.5, palette.dark);
    hardware.at(group, bumper, side * 2.63, 0.9, 0);
  }

  for (const x of [-1.25, 1.25]) {
    const cross = channel(3.6, 'z');
    hardware.at(group, cross, x, 0.72, 0);
  }
  const label = hardware.decal('FIELDLAB / FTC', 1.65, 0.23);
  hardware.at(group, label, 0, 0.91, 2.405);

  group.add(
    bracket(-2.2, 0.84, 1.95),
    bracket(2.2, 0.84, 1.95, Math.PI),
    bracket(-2.2, 0.84, -1.95),
    bracket(2.2, 0.84, -1.95, Math.PI),
  );
  group.userData.category = 'drive';
  addElectronics(group);
  root.add(group);
  return group;
}

function addElectronics(root: THREE.Group) {
  const deck = new THREE.Group();
  const plate = box(2.8, 0.09, 2.25, 0x5c7885, {
    transparent: true,
    opacity: 0.42,
    metalness: 0.05,
    roughness: 0.25,
  });
  plate.position.set(0, 1.03, -0.2);
  deck.add(plate);
  const hub = box(1.55, 0.45, 1.05, 0x252e33, { roughness: 0.7 });
  hub.position.set(-0.45, 1.32, -0.35);
  deck.add(hub);
  for (let i = 0; i < 6; i += 1) {
    const port = box(0.12, 0.09, 0.17, i < 2 ? palette.orange : palette.yellow);
    port.position.set(-0.95 + i * 0.21, 1.56, -0.4);
    deck.add(port);
  }
  const battery = box(1.72, 0.48, 0.65, 0x363e42, { roughness: 0.8 });
  battery.position.set(0.45, 1.33, 0.68);
  deck.add(battery);
  for (const x of [-0.12, 1.02]) {
    const strap = box(0.16, 0.52, 0.7, 0x171c20, {
      roughness: 1,
      metalness: 0,
    });
    strap.position.set(x, 1.34, 0.68);
    deck.add(strap);
    deck.add(bolt(x, 1.62, 0.68));
  }
  for (let i = 0; i < 7; i++) {
    const vent = box(0.07, 0.012, 0.35, 0x11181c, { roughness: 0.9 });
    vent.position.set(-0.92 + i * 0.14, 1.551, -0.05);
    deck.add(vent);
  }
  const led = box(0.09, 0.025, 0.09, 0x8bbd57, {
    emissive: 0x548b24,
    emissiveIntensity: 1,
  });
  led.position.set(0.1, 1.56, -0.7);
  deck.add(led);
  const switchBody = box(0.42, 0.25, 0.28, 0x171d20);
  switchBody.position.set(1.3, 1.29, -0.68);
  deck.add(switchBody);
  const switchToggle = box(0.15, 0.1, 0.18, 0xd33e2f);
  switchToggle.position.set(1.3, 1.47, -0.68);
  deck.add(switchToggle);
  deck.add(
    tube(
      [
        new THREE.Vector3(0.45, 1.55, 0.65),
        new THREE.Vector3(0.2, 1.68, 0.3),
        new THREE.Vector3(-0.6, 1.61, 0.1),
      ],
      palette.wireRed,
      0.045,
    ),
    tube(
      [
        new THREE.Vector3(-0.95, 1.55, -0.35),
        new THREE.Vector3(-1.3, 1.75, 0.3),
        new THREE.Vector3(-1.85, 1.02, 1.85),
      ],
      palette.wireBlue,
      0.035,
    ),
    tube(
      [
        new THREE.Vector3(-0.7, 1.53, -0.5),
        new THREE.Vector3(0.1, 1.82, -0.9),
        new THREE.Vector3(1.15, 2.02, -0.7),
      ],
      palette.wireBlack,
      0.04,
    ),
  );
  root.add(deck);
  // Stand-offs, cable routing, labelled I/O and moulded connector housings.
  for (const x of [-1.22, 1.22])
    for (const z of [-1.1, 0.65]) {
      hardware.at(deck, cylinder(0.07, 0.3, palette.aluminumDark), x, 0.89, z);
      deck.add(bolt(x, 1.1, z));
    }
  for (const z of [-0.86, 0.16])
    for (let i = 0; i < 4; i++) {
      const x = -0.92 + i * 0.3;
      hardware.at(
        deck,
        hardware.rounded(0.22, 0.12, 0.11, 0xddd9ca),
        x,
        1.47,
        z,
      );
      for (const offset of [-0.055, 0.055])
        hardware.at(
          deck,
          hardware.rounded(0.035, 0.04, 0.018),
          x + offset,
          1.49,
          z + 0.06,
        );
    }
  const hubLabel = hardware.decal('CONTROL HUB', 1.15, 0.22);
  hubLabel.rotation.x = -Math.PI / 2;
  hardware.at(deck, hubLabel, -0.45, 1.562, -0.42);
  const batteryLabel = hardware.decal('12V / NiMH', 0.74, 0.25, false);
  batteryLabel.rotation.x = -Math.PI / 2;
  hardware.at(deck, batteryLabel, 0.45, 1.579, 0.68);
  for (const x of [-0.08, 1.05])
    hardware.at(
      deck,
      hardware.rounded(0.19, 0.05, 0.12, 0x88979d),
      x,
      1.62,
      0.68,
    );
  for (let i = 0; i < 5; i++) {
    const z = -0.8 + i * 0.32;
    deck.add(
      hardware.cable(
        [
          [-0.9, 1.42, z],
          [-1.6, 1.02, z],
          [-1.94, 0.94, z + 0.45],
        ],
        i % 2 ? 0x24292d : 0xc75338,
        0.018,
      ),
    );
    hardware.at(
      deck,
      hardware.rounded(0.1, 0.06, 0.24, 0xd9d9ce),
      -1.55,
      1.04,
      z,
    );
  }
}

function addCollector(
  root: THREE.Group,
  id: string,
  slot: number,
  moving: MovingParts,
) {
  const group = new THREE.Group();
  group.position.set((slot - 1) * 0.22, 0, 0);
  group.add(bracket(-1.72, 0.9, 2.2), bracket(1.72, 0.9, 2.2, Math.PI));
  const armLeft = box(0.18, 0.24, 1.1, palette.aluminumDark, {
    metalness: 0.62,
  });
  armLeft.position.set(-1.7, 0.82, 2.63);
  armLeft.rotation.x = -0.14;
  const armRight = armLeft.clone();
  armRight.position.x = 1.7;
  group.add(armLeft, armRight);

  if (id === 'dualjaw') {
    // Two jaws that close on a pair at once.
    const jaws = new THREE.Group();
    for (const side of [-1, 1]) {
      const jaw = box(0.22, 0.5, 1.5, palette.yellow, { metalness: 0.5 });
      jaw.position.set(side * 0.85, 0.52, 3.15);
      jaw.rotation.y = side * 0.32;
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.92, 0.52, 2.55);
      jaw.position.set(0, 0, 0.6);
      jaw.rotation.y = 0;
      pivot.add(jaw);
      const pad = box(0.1, 0.42, 1.3, palette.rubber, { roughness: 1 });
      pad.position.set(side * 0.7, 0.52, 3.15);
      pad.rotation.y = side * 0.32;
      pad.position.set(-side * 0.12, 0, 0.6);
      pad.rotation.y = 0;
      pivot.add(pad);
      pivot.userData.motion = 'jaw';
      pivot.userData.side = side;
      moving.articulated.push(pivot);
      jaws.add(pivot);
      const servo = hardware.servo();
      hardware.at(group, servo, side * 0.92, 0.57, 2.45);
      hardware.at(group, hardware.bearing(0.15), side * 0.92, 0.76, 2.55);
    }
    group.add(jaws);
    moving.intake = jaws;
  } else if (id === 'sorter') {
    // A funnel narrow enough that only the big NECTAR wedge into it.
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 0.5, 0.95, 48, 1, true),
      material(0x435560, {
        roughness: 0.36,
        side: THREE.DoubleSide,
        metalness: 0.4,
      }),
    );
    funnel.rotation.x = Math.PI / 2.2;
    funnel.position.set(0, 0.72, 3.1);
    funnel.castShadow = true;
    group.add(funnel);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.07, 8, 20),
      material(palette.aluminum, { metalness: 0.6 }),
    );
    lip.rotation.x = Math.PI / 2.2;
    lip.position.set(0, 0.95, 3.45);
    group.add(lip);
    for (const side of [-1, 1]) {
      hardware.at(group, hardware.gearMotor(0.7), side * 1.35, 0.7, 2.65);
      hardware.at(group, hardware.bearing(0.14), side * 1.1, 0.6, 2.8);
    }
    const rotor = new THREE.Group();
    rotor.position.set(0, 0.72, 2.72);
    for (let i = 0; i < 6; i++) {
      const vane = hardware.rounded(0.06, 0.16, 0.75, palette.orange);
      vane.rotation.y = (i * Math.PI) / 3;
      rotor.add(vane);
    }
    rotor.userData.motion = 'spinner';
    rotor.userData.axis = 'z';
    moving.articulated.push(rotor);
    group.add(rotor);
    moving.intake = group;
  } else {
    const rollers = new THREE.Group();
    for (let row = 0; row < (id === 'twinflex' ? 2 : 1); row++) {
      const rotor = new THREE.Group();
      rotor.position.set(0, row ? 0.93 : 0.5, row ? 2.8 : 3.15);
      const axle = cylinder(0.065, 3.7, palette.aluminum, 16);
      axle.rotation.z = Math.PI / 2;
      rotor.add(axle);
      for (let i = 0; i < 12; i++) {
        const x = (i - 5.5) * 0.255;
        // Rounded silicone lobes, rather than a row of rectangular paddles.
        const core = cylinder(0.13, 0.12, palette.dark, 24);
        core.rotation.z = Math.PI / 2;
        hardware.at(rotor, core, x, 0, 0);
        const flex = hardware.compliantWheel(
          0.32,
          0.11,
          row ? palette.orange : 0xc99b49,
        );
        flex.rotation.x = i * 0.12;
        hardware.at(rotor, flex, x, 0, 0);
        const spacer = cylinder(0.09, 0.1, palette.aluminumDark);
        spacer.rotation.z = Math.PI / 2;
        hardware.at(rotor, spacer, x + 0.13, 0, 0);
      }
      rotor.userData.motion = 'spinner';
      rotor.userData.axis = 'x';
      rotor.userData.direction = row ? -1 : 1;
      moving.articulated.push(rotor);
      rollers.add(rotor);
      for (const side of [-1, 1]) {
        hardware.at(
          group,
          hardware.bearing(0.16),
          side * 1.82,
          rotor.position.y,
          rotor.position.z,
        );
        hardware.at(
          group,
          hardware.pulley(0.16, 0.1, 16),
          side * 1.97,
          rotor.position.y,
          rotor.position.z,
        );
      }
    }
    const guide = hardware.plate(
      3.35,
      0.85,
      0.035,
      Array.from(
        { length: 8 },
        (_, i) => [(i - 3.5) * 0.36, 0, 0.055] as [number, number, number],
      ),
    );
    guide.rotation.x = -Math.PI / 2 + 0.15;
    hardware.at(group, guide, 0, 0.3, 2.56);
    hardware.at(group, hardware.gearMotor(0.7), -1.45, 1.14, 2.64);
    group.add(hardware.belt(-1.98, 0.5, 2.65, 3.15, 0.16));
    for (const side of [-1, 1]) {
      const cheek = hardware.plate(
        1.2,
        0.75,
        0.065,
        [
          [-0.3, 0, 0.16],
          [0.2, 0, 0.12],
        ],
        palette.aluminumDark,
      );
      cheek.rotation.y = Math.PI / 2;
      hardware.at(group, cheek, side * 1.8, 0.64, 2.95);
      for (const z of [2.5, 3.35]) group.add(bolt(side * 1.82, 1.06, z));
    }
    group.add(rollers);
    moving.intake = rollers;
  }
  group.userData.category = 'collect';
  group.add(
    hardware.cable(
      [
        [-1.45, 1.13, 2.64],
        [-1.72, 1.14, 2.2],
        [-1.35, 1.1, 1.7],
      ],
      0xc54f38,
    ),
  );
  root.add(group);
  return group;
}

function addStorage(root: THREE.Group, id: string, slot: number) {
  const group = new THREE.Group();
  group.position.z = (slot - 1) * 0.28;
  group.add(bracket(-1.15, 1.1, 0.75), bracket(1.15, 1.1, 0.75, Math.PI));
  const tall = id === 'stackpack';
  const height = tall ? 2.05 : id === 'pocket' ? 0.78 : 1.22;
  const panelMaterial = material(0x4d8aa4, {
    transparent: true,
    opacity: 0.22,
    roughness: 0.17,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, height, 0.08),
    panelMaterial,
  );
  back.position.set(0, 1.18 + height / 2, -0.05);
  const left = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, height, 1.15),
    panelMaterial,
  );
  left.position.set(-1.16, 1.18 + height / 2, 0.5);
  const right = left.clone();
  right.position.x = 1.16;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 0.08, 1.15),
    panelMaterial,
  );
  floor.position.set(0, 1.2, 0.5);
  group.add(back, left, right, floor);
  for (const x of [-1.19, 1.19]) {
    const edge = channel(height, 'y');
    hardware.at(group, edge, x, 1.18 + height / 2, -0.05);
    edge.scale.set(0.4, 1, 0.5);
    for (const y of [1.28, 1.12 + height]) {
      for (const z of [0.05, 0.93]) {
        const screw = bolt(x, y, z, 'side');
        group.add(screw);
      }
    }
  }
  const front = hardware.plate(
    2.35,
    0.25,
    0.045,
    [
      [-0.8, 0, 0.05],
      [0.8, 0, 0.05],
    ],
    palette.aluminumDark,
  );
  hardware.at(group, front, 0, 1.3, 1.08);
  for (const x of [-0.8, 0.8]) {
    const screw = hardware.fastener();
    screw.rotation.x = Math.PI / 2;
    hardware.at(group, screw, x, 1.3, 1.12);
  }
  // Conveyor rollers run under the transparent tray, with a retaining gate.
  for (let z = 0.1; z < 1.05; z += 0.23) {
    const roller = cylinder(0.055, 2.2, palette.dark, 16);
    roller.rotation.z = Math.PI / 2;
    hardware.at(group, roller, 0, 1.25, z);
  }
  // The indexer is split into four bays, one per slot.
  if (id === 'pocket')
    for (const x of [-0.58, 0, 0.58]) {
      const divider = box(0.08, 0.66, 1.0, palette.aluminumDark);
      divider.position.set(x, 1.55, 0.5);
      group.add(divider);
    }
  group.userData.category = 'carry';
  root.add(group);
  return group;
}

function addReach(
  root: THREE.Group,
  id: string,
  slot: number,
  moving: MovingParts,
) {
  const group = new THREE.Group();
  group.position.x = (slot - 1) * 0.28;
  group.add(bracket(1.1, 1.12, -1.25), bracket(2.0, 1.12, -1.25, Math.PI));
  if (id === 'swingarm') {
    const pivot = new THREE.Group();
    pivot.position.set(1.55, 1.45, -1.2);
    pivot.userData.restY = pivot.position.y;
    const arm = channel(3, 'y');
    arm.position.set(Math.sin(0.46) * 1.5, Math.cos(0.46) * 1.5, 0);
    arm.rotation.z -= 0.46;
    pivot.add(arm);
    const joint = cylinder(0.34, 0.5, palette.yellow, 28);
    joint.rotation.z = Math.PI / 2;
    pivot.add(joint);
    hardware.at(pivot, hardware.pulley(0.35, 0.14, 32), -0.3, 0, 0);
    hardware.at(group, hardware.gearMotor(0.85), 1.26, 1.26, -1.2);
    pivot.add(
      hardware.cable(
        [
          [0, 0.12, 0],
          [0.43, 1.4, -0.2],
          [1.08, 2.88, -0.1],
        ],
        0x343a3d,
      ),
    );
    for (const y of [0.3, 1.3, 2.3]) {
      const brace = hardware.plate(0.46, 0.28, 0.04, [[0, 0, 0.06]]);
      hardware.at(pivot, brace, Math.sin(0.46) * y, y, 0.12);
    }
    group.add(pivot);
    pivot.userData.motion = 'arm';
    moving.articulated.push(pivot);
    moving.lift = null;
  } else if (id === 'turret') {
    const turret = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.13, 12, 36),
      material(palette.yellow, { metalness: 0.55 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(1.55, 1.35, -1.15);
    turret.add(ring);
    const mast = channel(2.7, 'y');
    mast.position.set(1.55, 2.65, -1.15);
    turret.add(mast);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      turret.add(
        bolt(1.55 + Math.cos(a) * 0.5, 1.42, -1.15 + Math.sin(a) * 0.5),
      );
    }
    hardware.at(group, hardware.gearMotor(0.75), 1.1, 1.23, -1.5);
    hardware.at(
      turret,
      hardware.pulley(0.46, 0.15, 36),
      1.55,
      1.33,
      -1.15,
    ).rotation.z = Math.PI / 2;
    turret.add(
      hardware.cable(
        [
          [1.55, 1.44, -1.15],
          [1.31, 2.6, -1.42],
          [1.45, 3.9, -1.13],
        ],
        0x242b30,
      ),
    );
    group.add(turret);
    for (const child of turret.children) {
      child.position.x -= 1.55;
      child.position.z += 1.15;
    }
    turret.position.set(1.55, 0, -1.15);
    turret.userData.motion = 'turret';
    moving.articulated.push(turret);
    moving.lift = null;
  } else {
    const slides = new THREE.Group();
    const stageCount = id === 'cascade' ? 3 : 2;
    for (let i = 0; i < stageCount; i += 1) {
      const stage = new THREE.Group();
      const height = 2.7 - i * 0.2;
      for (const x of [1.17 + i * 0.08, 1.94 - i * 0.08]) {
        const rail = hardware.plate(
          0.18,
          height,
          0.08,
          Array.from(
            { length: 9 },
            (_, n) => [0, (n - 4) * 0.27, 0.03] as [number, number, number],
          ),
        );
        hardware.at(stage, rail, x, 2.65 + i * 0.17, -1.32 + i * 0.13);
        const track = box(0.045, height - 0.1, 0.07, palette.aluminumDark);
        hardware.at(stage, track, x + 0.09, 2.65 + i * 0.17, -1.28 + i * 0.13);
        for (const y of [1.52 + i * 0.28, 3.83]) {
          const roller = hardware.bearing(0.07, 0.03);
          roller.rotation.y = Math.PI / 2;
          hardware.at(stage, roller, x, y, -1.19 + i * 0.13);
        }
      }
      const bridge = hardware.plate(0.85 - i * 0.14, 0.2, 0.06, [
        [-0.2, 0, 0.045],
        [0.2, 0, 0.045],
      ]);
      hardware.at(stage, bridge, 1.55, 3.94 + i * 0.08, -1.29 + i * 0.13);
      for (const y of [1.55, 3.88]) {
        const sheave = hardware.pulley(0.09, 0.06, 12);
        sheave.rotation.y = Math.PI / 2;
        hardware.at(stage, sheave, 1.55, y, -1.19 + i * 0.13);
      }
      stage.add(
        hardware.cable(
          [
            [1.48, 1.55, -1.14 + i * 0.13],
            [1.48, 3.88, -1.14 + i * 0.13],
            [1.62, 3.88, -1.14 + i * 0.13],
            [1.62, 1.8, -1.14 + i * 0.13],
          ],
          0xc5c3a7,
          0.013,
        ),
      );
      if (i > 0) {
        stage.userData.motion = 'slide';
        stage.userData.factor = i / (stageCount - 1);
        moving.articulated.push(stage);
      }
      slides.add(stage);
    }
    const spool = cylinder(0.28, 0.72, palette.dark, 24);
    spool.rotation.z = Math.PI / 2;
    spool.position.set(1.55, 1.55, -1.15);
    slides.add(spool);
    slides.add(
      tube(
        [
          new THREE.Vector3(1.55, 1.62, -1.15),
          new THREE.Vector3(1.7, 2.7, -1.12),
          new THREE.Vector3(2.15, 4.05, -1.1),
        ],
        palette.yellow,
        0.025,
      ),
    );
    group.add(slides);
    slides.userData.restY = slides.position.y;
    // Only the nested stages travel; the bolted outer rail stays on the chassis.
    moving.lift = null;
    hardware.at(group, hardware.gearMotor(0.8), 1.55, 1.26, -1.28);
    for (const x of [1.16, 1.94]) {
      const brace = channel(1.18, 'y');
      brace.rotation.z -= 0.5;
      hardware.at(group, brace, x, 1.54, -1.63);
      brace.scale.setScalar(0.55);
    }
    const energyChain = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const y = 1.36 + i * 0.118;
      hardware.at(
        energyChain,
        hardware.rounded(0.22, 0.105, 0.16),
        2.1,
        y,
        -1.31,
      );
      hardware.at(
        energyChain,
        hardware.rounded(0.14, 0.056, 0.02, 0x58626a),
        2.1,
        y,
        -1.22,
      );
    }
    group.add(energyChain);
  }
  const pivotHardware = hardware.servo();
  hardware.at(group, pivotHardware, 1.95, 1.45, -1.3);
  group.userData.category = 'reach';
  root.add(group);
  return group;
}

function addScorer(
  root: THREE.Group,
  id: string,
  slot: number,
  moving: MovingParts,
) {
  const group = new THREE.Group();
  group.position.set(1.55 + (slot - 1) * 0.28, 4.28, -1.1);
  const plate = box(1.65, 0.12, 1.08, palette.aluminumDark, {
    metalness: 0.67,
  });
  group.add(plate);
  group.add(
    bolt(-0.55, 0.09, -0.32),
    bolt(0.55, 0.09, -0.32),
    bolt(-0.55, 0.09, 0.32),
    bolt(0.55, 0.09, 0.32),
  );
  if (id === 'flywheel') {
    for (const x of [-0.45, 0.45]) {
      const wheel = new THREE.Group();
      const tire = cylinder(0.42, 0.2, palette.rubber, 40);
      tire.rotation.z = Math.PI / 2;
      wheel.add(tire);
      const hub = hardware.pulley(0.24, 0.23);
      wheel.add(hub);
      wheel.position.set(x, 0.45, 0);
      wheel.userData.motion = 'flywheel';
      wheel.userData.direction = x < 0 ? 1 : -1;
      moving.articulated.push(wheel);
      group.add(wheel);
      hardware.at(
        group,
        hardware.gearMotor(0.6),
        x + (x < 0 ? -0.38 : 0.38),
        0.45,
        -0.45,
      );
    }
    const hood = hardware.plate(1.6, 0.8, 0.035, [], palette.aluminumDark);
    hood.rotation.x = -0.55;
    hardware.at(group, hood, 0, 0.43, -0.4);
  } else if (id === 'tiptray') {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.42, -0.42);
    const tray = hardware.plate(
      1.75,
      1.42,
      0.05,
      [
        [-0.6, -0.48, 0.045],
        [0.6, -0.48, 0.045],
      ],
      palette.aluminum,
    );
    tray.rotation.x = -Math.PI / 2;
    hardware.at(pivot, tray, 0, 0, 0.65);
    for (const x of [-0.85, 0.85]) {
      hardware.at(
        pivot,
        hardware.ribbedPanel(0.055, 0.3, 1.42, palette.orange),
        x,
        0.13,
        0.65,
      );
    }
    pivot.userData.motion = 'tray';
    moving.articulated.push(pivot);
    group.add(pivot);
    hardware.at(group, hardware.servo(), -0.78, 0.2, -0.42);
  } else {
    for (const x of [-0.7, 0.7])
      hardware.at(
        group,
        hardware.ribbedPanel(0.09, 0.62, 1.08, palette.orange),
        x,
        0.37,
        0,
      );
    const floor = hardware.plate(1.4, 1.05, 0.035);
    floor.rotation.x = -Math.PI / 2;
    hardware.at(group, floor, 0, 0.16, 0);
    const back = hardware.plate(1.42, 0.62, 0.035, [
      [-0.4, 0, 0.12],
      [0.4, 0, 0.12],
    ]);
    hardware.at(group, back, 0, 0.43, -0.51);
    const gate = new THREE.Group();
    gate.position.set(0, 0.15, 0.5);
    hardware.at(
      gate,
      hardware.plate(1.24, 0.5, 0.04, [], palette.aluminumDark),
      0,
      0.25,
      0,
    );
    gate.userData.motion = 'gate';
    moving.articulated.push(gate);
    group.add(gate);
    hardware.at(group, hardware.servo(), -0.8, 0.32, 0.38);
    hardware.at(group, hardware.bearing(0.1), 0.8, 0.17, 0.5);
  }
  for (const x of [-0.7, 0.7])
    hardware.at(group, hardware.bearing(0.12), x, 0.18, -0.38);
  group.add(
    hardware.cable(
      [
        [-0.8, 0.2, -0.42],
        [-0.85, -0.05, -0.5],
        [-0.1, -0.16, -0.6],
      ],
      0x282d31,
    ),
  );
  group.userData.category = 'score';
  root.add(group);
  moving.scorer = group;
  return group;
}

function addSensor(root: THREE.Group, id: string, slot: number) {
  const group = new THREE.Group();
  group.position.set(-1.55 + (slot - 1) * 0.3, 1.72, 1.55);
  const stem = box(0.16, 0.68, 0.18, palette.aluminumDark, { metalness: 0.68 });
  stem.position.y = -0.25;
  group.add(stem);
  const body = box(0.78, 0.5, 0.42, palette.dark, { roughness: 0.68 });
  group.add(body);
  const lensColor = id === 'range' ? 0x3c99c4 : 0x62b3da;
  for (const x of [-0.2, 0.2]) {
    const lens = cylinder(0.12, 0.06, lensColor, 20);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, 0, 0.24);
    group.add(lens);
    const bezel = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.025, 8, 24),
      hardware.metal(),
    );
    hardware.at(group, bezel, x, 0, 0.255);
    const pupil = cylinder(0.065, 0.01, 0x111b27, 24);
    pupil.rotation.x = Math.PI / 2;
    hardware.at(group, pupil, x, 0, 0.28);
  }
  const pcb = hardware.plate(
    0.86,
    0.56,
    0.035,
    [
      [-0.35, -0.2, 0.03],
      [0.35, -0.2, 0.03],
    ],
    0x245047,
  );
  hardware.at(group, pcb, 0, 0, -0.24);
  for (const x of [-0.33, 0.33]) {
    const screw = hardware.fastener(0.033);
    screw.rotation.x = Math.PI / 2;
    hardware.at(group, screw, x, -0.18, 0.235);
  }
  hardware.at(
    group,
    hardware.rounded(0.24, 0.1, 0.12, 0xddd8c5),
    0,
    -0.22,
    -0.29,
  );
  group.add(
    hardware.cable(
      [
        [0, -0.2, -0.3],
        [0.1, -0.5, -0.43],
        [0.3, -0.7, -0.8],
      ],
      0x333b43,
      0.025,
    ),
  );
  group.userData.category = 'assist';
  root.add(group);
  return group;
}

export function addMountMarker(root: THREE.Group, category: AssemblyCategory) {
  const positions: Record<AssemblyCategory, THREE.Vector3> = {
    drive: new THREE.Vector3(2.45, 0.72, 1.72),
    collect: new THREE.Vector3(0, 0.74, 2.62),
    carry: new THREE.Vector3(0, 1.35, 0.45),
    reach: new THREE.Vector3(1.55, 1.42, -1.2),
    score: new THREE.Vector3(1.55, 4.35, -1.1),
    assist: new THREE.Vector3(-1.55, 1.72, 1.55),
  };
  const marker = new THREE.Group();
  const ringMaterial = material(0xe34f28, {
    emissive: 0x9b220c,
    emissiveIntensity: 0.8,
    roughness: 0.35,
    metalness: 0.2,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.43, 0.055, 10, 40),
    ringMaterial,
  );
  ring.rotation.x = Math.PI / 2;
  marker.add(ring);
  const pin = cylinder(0.07, 0.8, 0xe34f28, 14);
  pin.position.y = 0.34;
  marker.add(pin);
  marker.position.copy(positions[category]);
  marker.userData.ringMaterial = ringMaterial;
  root.add(marker);
  return marker;
}

export function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materialSet = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    if (
      !(
        child instanceof THREE.Mesh ||
        child instanceof THREE.Line ||
        child instanceof THREE.Sprite
      )
    )
      return;
    if ('geometry' in child) geometries.add(child.geometry);
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((entry) => {
      materialSet.add(entry);
      for (const value of Object.values(entry))
        if (value instanceof THREE.Texture) textures.add(value);
    });
  });
  // Resources marked shared (the ARTIFACT meshes) outlive any one object.
  const owned = (item: { userData: Record<string, unknown> }) =>
    !item.userData.shared;
  geometries.forEach((item) => owned(item) && item.dispose());
  textures.forEach((item) => owned(item) && item.dispose());
  materialSet.forEach((item) => owned(item) && item.dispose());
}

// Where each part sits on its mount rail. Every robot uses the standard
// position: centered, with the sensor at the front.
const MOUNT_SLOTS: Record<AssemblyCategory, number> = {
  drive: 1,
  collect: 1,
  carry: 1,
  reach: 1,
  score: 1,
  assist: 0,
};
export function createRobotModel(
  selected: Record<string, string>,
  detail: 'workshop' | 'field' = 'workshop',
) {
  const slots = MOUNT_SLOTS;
  const root = new THREE.Group();
  const moving: MovingParts = {
    wheels: [],
    intake: null,
    lift: null,
    scorer: null,
    mount: null,
    snap: null,
    articulated: [],
  };
  const groups = {
    drive: addDrivetrain(root, selected.drive, moving),
    collect: addCollector(root, selected.collect, slots.collect, moving),
    carry: addStorage(root, selected.carry, slots.carry),
    reach: addReach(root, selected.reach, slots.reach, moving),
    score: addScorer(root, selected.score, slots.score, moving),
    assist: addSensor(root, selected.assist, slots.assist),
  };
  if (selected.reach === 'swingarm') groups.score.position.set(2.8, 4.16, -1.2);
  if (selected.reach === 'turret') groups.score.position.y = 4.05;
  for (const group of Object.values(groups)) {
    group.userData.home = group.position.clone();
    group.traverse((child) => {
      child.userData.category = group.userData.category;
    });
  }
  // Fuse the hundreds of fixed parts into a few meshes per moving piece. The
  // part groups, wheels, spinning rollers, intake, lift and scorer all keep
  // moving as before.
  const rollers: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.userData.roller) rollers.push(child);
    // Sub-pixel machining grain is only useful in the inspection camera.
    // Same mechanical geometry in the field, with vertex-batched finishes.
    if (detail === 'field' && child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const mat of materials)
        if (mat instanceof THREE.MeshStandardMaterial) mat.roughnessMap = null;
    }
  });
  mergeStaticMeshes(root, [
    ...Object.values(groups),
    ...moving.wheels,
    ...moving.articulated,
    ...rollers,
    ...[moving.intake, moving.lift, moving.scorer].filter(
      (part): part is THREE.Group => part !== null,
    ),
  ]);
  return {
    root,
    groups,
    moving,
    selected: { ...selected },
    elevation: 0,
    activity: 0,
  };
}
export type RobotModel = ReturnType<typeof createRobotModel>;

function isWithin(part: THREE.Object3D, root: THREE.Object3D) {
  let node: THREE.Object3D | null = part;
  while (node) {
    if (node === root) return true;
    node = node.parent;
  }
  return false;
}

// Keep unaffected mechanisms alive during assembly. Rebuilding every wheel,
// cable and controller when installing a sensor caused a visible hitch.
export function updateRobotModel(
  model: RobotModel,
  selected: Record<string, string>,
) {
  const changed: AssemblyCategory[] = [];
  for (const category of Object.keys(model.groups) as AssemblyCategory[]) {
    if (selected[category] === model.selected[category]) continue;
    const old = model.groups[category];
    model.moving.articulated = model.moving.articulated.filter(
      (part) => !isWithin(part, old),
    );
    old.removeFromParent();
    disposeObject(old);
    let group: THREE.Group;
    switch (category) {
      case 'drive':
        model.moving.wheels = [];
        group = addDrivetrain(model.root, selected.drive, model.moving);
        break;
      case 'collect':
        group = addCollector(
          model.root,
          selected.collect,
          MOUNT_SLOTS.collect,
          model.moving,
        );
        break;
      case 'carry':
        group = addStorage(model.root, selected.carry, MOUNT_SLOTS.carry);
        break;
      case 'reach':
        group = addReach(
          model.root,
          selected.reach,
          MOUNT_SLOTS.reach,
          model.moving,
        );
        break;
      case 'score':
        group = addScorer(
          model.root,
          selected.score,
          MOUNT_SLOTS.score,
          model.moving,
        );
        break;
      case 'assist':
        group = addSensor(model.root, selected.assist, MOUNT_SLOTS.assist);
        break;
    }
    group.userData.home = group.position.clone();
    group.traverse((child) => {
      child.userData.category = category;
    });
    mergeStaticMeshes(group, [
      ...model.moving.wheels,
      ...model.moving.articulated,
      ...[model.moving.intake, model.moving.lift, model.moving.scorer].filter(
        (part): part is THREE.Group => part !== null,
      ),
    ]);
    model.groups[category] = group;
    changed.push(category);
  }
  if (changed.includes('reach') || changed.includes('score')) {
    model.groups.score.position.set(
      selected.reach === 'swingarm' ? 2.8 : 1.55,
      selected.reach === 'turret'
        ? 4.05
        : selected.reach === 'swingarm'
          ? 4.16
          : 4.28,
      -1.1,
    );
    model.groups.score.userData.home = model.groups.score.position.clone();
  }
  model.selected = { ...selected };
  return changed;
}

// All robot renderers share this rig. Animation only follows simulation state;
// it never changes scoring, collision, capacity or the player's control input.
export function animateRobotMechanisms(
  model: RobotModel,
  dt: number,
  activity: number,
  elevation: number,
) {
  model.activity = THREE.MathUtils.damp(model.activity, activity, 9, dt);
  model.elevation = THREE.MathUtils.damp(model.elevation, elevation, 6, dt);
  for (const part of model.moving.articulated) {
    switch (part.userData.motion) {
      case 'spinner': {
        const axis = part.userData.axis === 'z' ? 'z' : 'x';
        part.rotation[axis] +=
          model.activity * dt * 10 * Number(part.userData.direction ?? 1);
        break;
      }
      case 'flywheel':
        part.rotation.x +=
          model.activity * dt * 22 * Number(part.userData.direction ?? 1);
        break;
      case 'slide':
        part.position.y = model.elevation * 0.75 * Number(part.userData.factor);
        break;
      case 'arm':
        part.rotation.z = model.elevation * 0.16;
        break;
      case 'turret':
        part.rotation.y = model.elevation * 0.3;
        break;
      case 'jaw':
        part.rotation.y =
          Number(part.userData.side) * (0.25 - model.activity * 0.22);
        break;
      case 'tray':
        part.rotation.x = -model.elevation * 0.7;
        break;
      case 'gate':
        part.rotation.x = -model.elevation * 1.05;
        break;
    }
  }
  if (model.moving.lift)
    model.moving.lift.position.y =
      Number(model.moving.lift.userData.restY ?? 0) + model.elevation * 0.75;
  model.groups.score.rotation.y =
    model.selected.reach === 'turret' ? model.elevation * 0.3 : 0;
}

export function robotScorerPosition(model: RobotModel, target: THREE.Vector3) {
  target.copy(model.groups.score.userData.home as THREE.Vector3);
  if (model.selected.reach === 'swingarm') {
    const a = model.elevation * 0.16;
    const x = Math.sin(0.46) * 3,
      y = Math.cos(0.46) * 3;
    target.x += Math.cos(a) * x - Math.sin(a) * y - x;
    target.y += Math.sin(a) * x + Math.cos(a) * y - y;
  } else if (model.selected.reach !== 'turret')
    target.y += model.elevation * 0.75;
  return target;
}
