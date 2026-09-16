import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AssemblyCategory } from './assembly-bay';
export type MovingParts = {
  wheels: THREE.Group[];
  intake: THREE.Group | null;
  lift: THREE.Group | null;
  scorer: THREE.Group | null;
  mount: THREE.Group | null;
  snap: { group: THREE.Group; origin: THREE.Vector3; started: number } | null;
};

const palette = {
  aluminum: 0xcbd1d3,
  aluminumDark: 0x758187,
  edge: 0x334148,
  rubber: 0x1d2529,
  orange: 0xe96c2b,
  yellow: 0xe5ad26,
  blue: 0x387fa4,
  dark: 0x252f34,
  wireRed: 0xd9503d,
  wireBlue: 0x3888b6,
  wireBlack: 0x262b2e,
};

function material(
  color: number,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.2,
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
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments),
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
  const mesh = cylinder(0.075, 0.045, 0xd7dcde, 16);
  mesh.position.set(x, y, z);
  if (rotation === 'side') mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function channel(length: number, axis: 'x' | 'z' | 'y' = 'x') {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, -0.25);
  shape.lineTo(length / 2, -0.25);
  shape.lineTo(length / 2, 0.25);
  shape.lineTo(-length / 2, 0.25);
  shape.closePath();
  const count = Math.floor((length - 0.24) / 0.32);
  for (let i = 0; i < count; i++) {
    const hole = new THREE.Path();
    hole.absarc((i - (count - 1) / 2) * 0.32, 0, 0.075, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const web = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.065,
      bevelEnabled: false,
      curveSegments: 10,
    }),
    material(palette.aluminum, { metalness: 0.78, roughness: 0.3 }),
  );
  web.rotation.x = -Math.PI / 2;
  web.castShadow = true;
  web.receiveShadow = true;
  group.add(web);
  for (const side of [-1, 1]) {
    const lip = box(length, 0.28, 0.065, palette.aluminum, {
      metalness: 0.78,
      roughness: 0.3,
    });
    lip.position.set(0, 0.14, side * 0.25);
    group.add(lip);
  }
  if (axis === 'z') group.rotation.y = Math.PI / 2;
  if (axis === 'y') group.rotation.z = Math.PI / 2;
  return group;
}

function bracket(x: number, y: number, z: number, rotationY = 0) {
  const group = new THREE.Group();
  const bottom = box(0.52, 0.1, 0.55, palette.yellow, { metalness: 0.55 });
  const upright = box(0.52, 0.48, 0.1, palette.yellow, { metalness: 0.55 });
  upright.position.set(0, 0.22, -0.22);
  group.add(bottom, upright, bolt(-0.15, 0.07, 0), bolt(0.15, 0.07, 0));
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  return group;
}

function makeWheel(kind: string) {
  const group = new THREE.Group();
  const wide = kind === 'anchor' || kind === 'trailblazer';
  const tire = cylinder(
    wide ? 0.57 : 0.53,
    wide ? 0.38 : 0.32,
    palette.rubber,
    32,
  );
  tire.rotation.z = Math.PI / 2;
  group.add(tire);
  const hub = cylinder(0.2, wide ? 0.405 : 0.345, palette.aluminum, 20);
  hub.rotation.z = Math.PI / 2;
  group.add(hub);
  const shaft = cylinder(0.07, wide ? 0.48 : 0.43, palette.aluminumDark, 12);
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);

  if (kind === 'comet') {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const roller = cylinder(0.065, 0.36, palette.orange, 10);
      roller.rotation.z = Math.PI / 2;
      roller.rotation.y = Math.PI / 4;
      roller.position.set(0.19, Math.sin(angle) * 0.43, Math.cos(angle) * 0.43);
      group.add(roller);
    }
  } else if (kind === 'orbit') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.085, 10, 28),
      material(palette.blue, { roughness: 0.65 }),
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.x = 0.18;
    group.add(ring);
  } else {
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      const tread = box(0.42, 0.08, 0.12, 0x4b585e, { roughness: 0.9 });
      tread.position.set(0.2, Math.sin(angle) * 0.5, Math.cos(angle) * 0.5);
      tread.rotation.x = -angle;
      group.add(tread);
    }
  }
  return group;
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
      const wheel = makeWheel(id);
      wheel.position.set(side * 2.72, 0.55, z);
      if (side < 0) wheel.rotation.y = Math.PI;
      group.add(wheel);
      moving.wheels.push(wheel);

      const bearing = cylinder(0.19, 0.13, palette.yellow, 22);
      bearing.rotation.z = Math.PI / 2;
      bearing.position.set(side * 2.43, 0.55, z);
      group.add(bearing);
    }
  }

  for (const x of [-1.55, 1.55]) {
    const motor = box(0.82, 0.58, 0.72, palette.dark, { roughness: 0.62 });
    motor.position.set(x, 0.71, -1.3);
    group.add(motor);
    const motorFace = cylinder(0.25, 0.08, palette.yellow, 24);
    motorFace.rotation.z = Math.PI / 2;
    motorFace.position.set(x + (x < 0 ? -0.45 : 0.45), 0.71, -1.3);
    group.add(motorFace);
  }

  group.add(
    bracket(-2.2, 0.84, 1.95),
    bracket(2.2, 0.84, 1.95, Math.PI),
    bracket(-2.2, 0.84, -1.95),
    bracket(2.2, 0.84, -1.95, Math.PI),
  );
  group.userData.category = 'drive';
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

  if (id === 'pinpoint') {
    const pivot = new THREE.Group();
    const clawLeft = box(0.16, 0.18, 1.05, palette.yellow);
    clawLeft.position.set(-0.43, 0.55, 3.05);
    clawLeft.rotation.y = -0.55;
    const clawRight = clawLeft.clone();
    clawRight.position.x = 0.43;
    clawRight.rotation.y = 0.55;
    pivot.add(clawLeft, clawRight);
    group.add(pivot);
    moving.intake = pivot;
  } else if (id === 'sidesweep') {
    const leftWing = box(1.0, 0.1, 1.12, palette.orange, { roughness: 0.52 });
    leftWing.position.set(-1.3, 0.45, 3.0);
    leftWing.rotation.y = -0.4;
    const rightWing = leftWing.clone();
    rightWing.position.x = 1.3;
    rightWing.rotation.y = 0.4;
    group.add(leftWing, rightWing);
    moving.intake = group;
  } else {
    const rollers = new THREE.Group();
    const rollerA = cylinder(
      0.2,
      3.55,
      id === 'twinflex' ? palette.yellow : palette.orange,
      24,
    );
    rollerA.rotation.z = Math.PI / 2;
    rollerA.userData.roller = true;
    for (let i = 0; i < 8; i++) {
      const fin = box(0.08, 3.45, 0.11, palette.rubber, { roughness: 1 });
      const angle = (i * Math.PI) / 4;
      fin.position.set(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2);
      fin.rotation.y = -angle;
      rollerA.add(fin);
    }
    rollerA.position.set(0, 0.52, 3.05);
    rollers.add(rollerA);
    if (id === 'twinflex') {
      const rollerB = cylinder(0.17, 3.2, palette.orange, 24);
      rollerB.rotation.z = Math.PI / 2;
      rollerB.userData.roller = true;
      rollerB.position.set(0, 0.86, 2.9);
      rollers.add(rollerB);
    }
    for (let i = -7; i <= 7; i += 1) {
      const tine = box(0.05, 0.48, 0.08, 0xffd28a, { roughness: 0.9 });
      tine.position.set(i * 0.22, 0.46, 3.06);
      tine.rotation.x = 0.35;
      rollers.add(tine);
    }
    group.add(rollers);
    moving.intake = rollers;
  }
  group.userData.category = 'collect';
  root.add(group);
  return group;
}

function addStorage(root: THREE.Group, id: string, slot: number) {
  const group = new THREE.Group();
  group.position.z = (slot - 1) * 0.28;
  group.add(bracket(-1.15, 1.1, 0.75), bracket(1.15, 1.1, 0.75, Math.PI));
  if (id === 'beltbridge') {
    const conveyor = box(2.35, 0.28, 0.85, 0x303a3f);
    conveyor.position.set(0, 1.63, 0.62);
    conveyor.rotation.x = -0.22;
    group.add(conveyor);
    for (let i = -4; i <= 4; i += 1) {
      const cleat = box(0.08, 0.08, 0.91, palette.yellow);
      cleat.position.set(i * 0.24, 1.79 + i * 0.012, 0.58);
      group.add(cleat);
    }
  } else {
    const tall = id === 'stackpack';
    const height = tall ? 2.05 : id === 'pocket' ? 0.78 : 1.22;
    const panelMaterial = material(0x4d8aa4, {
      transparent: true,
      opacity: 0.5,
      roughness: 0.2,
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
    if (id === 'pocket') {
      const divider = box(0.08, 0.66, 1.0, palette.aluminumDark);
      divider.position.set(0, 1.55, 0.5);
      group.add(divider);
    }
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
    const arm = channel(3.3, 'y');
    arm.position.y = 1.4;
    arm.rotation.z = -0.46;
    pivot.add(arm);
    const joint = cylinder(0.34, 0.5, palette.yellow, 28);
    joint.rotation.z = Math.PI / 2;
    pivot.add(joint);
    group.add(pivot);
    moving.lift = pivot;
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
    group.add(turret);
    turret.userData.restY = turret.position.y;
    moving.lift = turret;
  } else {
    const slides = new THREE.Group();
    const stageCount = id === 'cascade' ? 3 : 2;
    for (let i = 0; i < stageCount; i += 1) {
      const railA = box(0.22, 2.65, 0.34, i % 2 ? 0xe1e4e4 : palette.aluminum, {
        metalness: 0.65,
      });
      railA.position.set(1.28 + i * 0.31, 2.7 + i * 0.2, -1.15);
      const railB = railA.clone();
      railB.position.x = 1.82 + i * 0.31;
      slides.add(railA, railB);
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
    moving.lift = slides;
  }
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
      const wheel = cylinder(
        0.42,
        0.2,
        x < 0 ? palette.orange : palette.yellow,
        28,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.45, 0);
      group.add(wheel);
    }
  } else if (id === 'tiptray') {
    const tray = box(1.75, 0.12, 1.42, palette.yellow, { roughness: 0.46 });
    tray.position.set(0, 0.42, 0.2);
    tray.rotation.x = -0.1;
    group.add(tray);
  } else {
    const housing = box(
      1.42,
      0.64,
      0.82,
      id === 'truegate' ? palette.yellow : palette.orange,
    );
    housing.position.y = 0.39;
    group.add(housing);
    const gate = box(0.12, 0.74, 0.88, 0xf2f1eb);
    gate.position.set(id === 'truegate' ? 0 : -0.42, 0.4, 0);
    group.add(gate);
  }
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
  const lensColor =
    id === 'coloreye' ? 0x9b57ce : id === 'range' ? 0x3c99c4 : 0x62b3da;
  for (const x of [-0.2, 0.2]) {
    const lens = cylinder(0.12, 0.06, lensColor, 20);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, 0, 0.24);
    group.add(lens);
  }
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
  geometries.forEach((item) => item.dispose());
  textures.forEach((item) => item.dispose());
  materialSet.forEach((item) => item.dispose());
}

export const defaultMountSlots: Record<AssemblyCategory, number> = {
  drive: 1,
  collect: 1,
  carry: 1,
  reach: 1,
  score: 1,
  assist: 0,
};
export function createRobotModel(
  selected: Record<string, string>,
  slots = defaultMountSlots,
) {
  const root = new THREE.Group();
  const moving: MovingParts = {
    wheels: [],
    intake: null,
    lift: null,
    scorer: null,
    mount: null,
    snap: null,
  };
  const groups = {
    drive: addDrivetrain(root, selected.drive, moving),
    collect: addCollector(root, selected.collect, slots.collect, moving),
    carry: addStorage(root, selected.carry, slots.carry),
    reach: addReach(root, selected.reach, slots.reach, moving),
    score: addScorer(root, selected.score, slots.score, moving),
    assist: addSensor(root, selected.assist, slots.assist),
  };
  addElectronics(root);
  if (selected.reach === 'swingarm') groups.score.position.set(2.8, 4.16, -1.2);
  if (selected.reach === 'turret') groups.score.position.y = 4.05;
  for (const group of Object.values(groups)) {
    group.userData.home = group.position.clone();
    group.traverse((child) => {
      child.userData.category = group.userData.category;
    });
  }
  return { root, groups, moving };
}
export type RobotModel = ReturnType<typeof createRobotModel>;
