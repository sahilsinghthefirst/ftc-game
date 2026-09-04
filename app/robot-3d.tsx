'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AssemblyCategory } from './assembly-bay';

type Robot3DBayProps = {
  selected: Record<AssemblyCategory, string>;
  activeCategory: AssemblyCategory;
  draggingCategory: AssemblyCategory | null;
  snappingCategory: AssemblyCategory | null;
  mountSlots: Record<AssemblyCategory, number>;
  mechanismRunning: boolean;
};

type MovingParts = {
  wheels: THREE.Group[];
  intake: THREE.Group | null;
  lift: THREE.Group | null;
  scorer: THREE.Group | null;
  mount: THREE.Group | null;
  snap: { group: THREE.Group; origin: THREE.Vector3; started: number } | null;
};

const categoryMounts: Record<
  AssemblyCategory,
  { label: string; detail: string; left: string; top: string }
> = {
  drive: {
    label: 'Lower chassis rails',
    detail: 'Motor plates + supported axles',
    left: '72%',
    top: '72%',
  },
  collect: {
    label: 'Front cross rail',
    detail: 'Two angle brackets · 16 mm pattern',
    left: '22%',
    top: '66%',
  },
  carry: {
    label: 'Center deck',
    detail: 'Four-bolt protected bay',
    left: '44%',
    top: '49%',
  },
  reach: {
    label: 'Rear tower',
    detail: 'Reinforced on both sides',
    left: '62%',
    top: '36%',
  },
  score: {
    label: 'Patterned tool plate',
    detail: 'Removable end effector',
    left: '66%',
    top: '19%',
  },
  assist: {
    label: 'Sensor bracket',
    detail: 'Clear view + strain relief',
    left: '30%',
    top: '47%',
  },
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
    new THREE.BoxGeometry(width, height, depth),
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
  if (rotation === 'top') mesh.rotation.x = Math.PI / 2;
  else mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function channel(length: number, axis: 'x' | 'z' | 'y' = 'x') {
  const group = new THREE.Group();
  const core = box(
    axis === 'x' ? length : 0.42,
    axis === 'y' ? length : 0.28,
    axis === 'z' ? length : 0.52,
    palette.aluminum,
    {
      roughness: 0.32,
      metalness: 0.72,
    },
  );
  group.add(core);

  const holeCount = Math.max(4, Math.floor(length / 0.42));
  const darkHoleMaterial = material(0x4d5b61, {
    roughness: 0.7,
    metalness: 0.3,
  });
  for (let index = 0; index < holeCount; index += 1) {
    const offset =
      -length / 2 +
      0.22 +
      index * ((length - 0.44) / Math.max(1, holeCount - 1));
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.018, 14),
      darkHoleMaterial,
    );
    if (axis === 'x') {
      disc.rotation.x = Math.PI / 2;
      disc.position.set(offset, 0.151, 0);
    } else if (axis === 'z') {
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0, 0.151, offset);
    } else {
      disc.rotation.z = Math.PI / 2;
      disc.position.set(0.221, offset, 0);
    }
    group.add(disc);
  }

  const lipA = box(
    axis === 'x' ? length : 0.08,
    axis === 'y' ? length : 0.18,
    axis === 'z' ? length : 0.08,
    palette.aluminumDark,
    {
      roughness: 0.34,
      metalness: 0.72,
    },
  );
  const lipB = lipA.clone();
  if (axis === 'x') {
    lipA.position.set(0, 0.22, -0.23);
    lipB.position.set(0, 0.22, 0.23);
  } else if (axis === 'z') {
    lipA.position.set(-0.18, 0.22, 0);
    lipB.position.set(0.18, 0.22, 0);
  } else {
    lipA.position.set(-0.18, 0, -0.23);
    lipB.position.set(-0.18, 0, 0.23);
  }
  group.add(lipA, lipB);
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
    rollerA.position.set(0, 0.52, 3.05);
    rollers.add(rollerA);
    if (id === 'twinflex') {
      const rollerB = cylinder(0.17, 3.2, palette.orange, 24);
      rollerB.rotation.z = Math.PI / 2;
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

function addMountMarker(root: THREE.Group, category: AssemblyCategory) {
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

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((entry) => entry.dispose());
  });
}

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function Robot3DBay({
  selected,
  activeCategory,
  draggingCategory,
  snappingCategory,
  mountSlots,
  mechanismRunning,
}: Robot3DBayProps) {
  const mount = categoryMounts[activeCategory];
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const robotRootRef = useRef<THREE.Group | null>(null);
  const movingRef = useRef<MovingParts>({
    wheels: [],
    intake: null,
    lift: null,
    scorer: null,
    mount: null,
    snap: null,
  });
  const runningRef = useRef(mechanismRunning);
  const draggingRef = useRef(draggingCategory);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    runningRef.current = mechanismRunning;
  }, [mechanismRunning]);

  useEffect(() => {
    draggingRef.current = draggingCategory;
  }, [draggingCategory]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      window.setTimeout(() => setFailed(true), 0);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = 'robot-webgl-canvas';
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D FTC-style robot. Use left and right arrows to rotate, and up and down arrows to zoom.',
    );
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.Fog(0xe8e3d7, 14, 24);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camera.position.set(8.7, 6.7, 9.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minDistance = 8.2;
    controls.maxDistance = 17;
    controls.minPolarAngle = 0.58;
    controls.maxPolarAngle = 1.35;
    controls.target.set(0, 1.55, 0.1);

    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    let reduceMotion = motionPreference.matches;
    const updateMotionPreference = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
    };
    motionPreference.addEventListener('change', updateMotionPreference);

    const handleCanvasKeyDown = (event: KeyboardEvent) => {
      const root = robotRootRef.current;
      if (!root) return;
      const handled = [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        '+',
        '=',
        '-',
      ].includes(event.key);
      if (!handled) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') root.rotation.y -= 0.16;
      if (event.key === 'ArrowRight') root.rotation.y += 0.16;
      if (['ArrowUp', '+', '='].includes(event.key)) {
        const offset = camera.position.clone().sub(controls.target);
        const distance = Math.max(controls.minDistance, offset.length() * 0.9);
        camera.position.copy(controls.target).add(offset.setLength(distance));
      }
      if (['ArrowDown', '-'].includes(event.key)) {
        const offset = camera.position.clone().sub(controls.target);
        const distance = Math.min(controls.maxDistance, offset.length() * 1.1);
        camera.position.copy(controls.target).add(offset.setLength(distance));
      }
      controls.update();
    };
    renderer.domElement.addEventListener('keydown', handleCanvasKeyDown);

    const ambient = new THREE.HemisphereLight(0xfffbef, 0x6e7b7e, 2.0);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff3d5, 4.1);
    key.position.set(6, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fc7e5, 1.8);
    fill.position.set(-7, 4, -6);
    scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 22),
      material(0xd7d0c1, { roughness: 0.96, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.03;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(20, 50, 0xa8a091, 0xc9c1b1);
    grid.position.y = 0.002;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    gridMaterials.forEach((entry) => {
      entry.transparent = true;
      entry.opacity = 0.42;
    });
    scene.add(grid);

    const benchTape = box(7.4, 0.015, 0.12, 0xd44a31, {
      roughness: 0.86,
      metalness: 0,
    });
    benchTape.position.set(0, 0.012, 4.05);
    scene.add(benchTape);
    const looseBoltA = bolt(-4.2, 0.06, 2.4);
    looseBoltA.rotation.z = 0.4;
    const looseBoltB = bolt(4.35, 0.06, -1.8);
    looseBoltB.rotation.z = -0.6;
    scene.add(looseBoltA, looseBoltB);

    const robotRoot = new THREE.Group();
    robotRoot.rotation.y = -0.08;
    robotRootRef.current = robotRoot;
    scene.add(robotRoot);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(380, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let frame = 0;
    const started = performance.now();
    const animate = (now: number) => {
      const seconds = (now - started) / 1000;
      const moving = movingRef.current;
      if (moving.mount) {
        const scale = reduceMotion
          ? 1
          : 1 + Math.sin(seconds * 4.5) * (draggingRef.current ? 0.15 : 0.08);
        moving.mount.scale.setScalar(scale);
        const ringMaterial = moving.mount.userData.ringMaterial as
          | THREE.MeshStandardMaterial
          | undefined;
        if (ringMaterial)
          ringMaterial.emissiveIntensity = draggingRef.current
            ? 2.1
            : reduceMotion
              ? 0.8
              : 0.8 + Math.sin(seconds * 4.5) * 0.3;
      }

      if (runningRef.current) {
        if (!reduceMotion) {
          moving.wheels.forEach((wheel, index) => {
            wheel.rotation.x += 0.045 * (index % 2 ? -1 : 1);
          });
          if (moving.intake) moving.intake.rotation.x += 0.09;
        }
        if (moving.lift) {
          const liftAmount = reduceMotion
            ? 0.12
            : (Math.sin(seconds * 4.4 - 1.2) + 1) * 0.22;
          const restY = Number(moving.lift.userData.restY ?? 0);
          moving.lift.position.y = restY + liftAmount;
        }
        if (moving.scorer && !reduceMotion)
          moving.scorer.rotation.z = Math.sin(seconds * 5.2) * 0.08;
      } else if (moving.lift) {
        const restY = Number(moving.lift.userData.restY ?? 0);
        moving.lift.position.y += (restY - moving.lift.position.y) * 0.16;
      }

      if (moving.snap) {
        const progress = smoothstep((now - moving.snap.started) / 560);
        moving.snap.group.position
          .copy(moving.snap.origin)
          .add(
            new THREE.Vector3(0, (1 - progress) * 1.2, (1 - progress) * 0.65),
          );
        moving.snap.group.scale.setScalar(0.8 + progress * 0.2);
        moving.snap.group.rotation.y = (1 - progress) * -0.18;
        if (progress >= 1) moving.snap = null;
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      motionPreference.removeEventListener('change', updateMotionPreference);
      renderer.domElement.removeEventListener('keydown', handleCanvasKeyDown);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      robotRootRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = robotRootRef.current;
    if (!root) return;
    while (root.children.length) {
      const child = root.children[0];
      root.remove(child);
      disposeObject(child);
    }
    const moving: MovingParts = {
      wheels: [],
      intake: null,
      lift: null,
      scorer: null,
      mount: null,
      snap: null,
    };
    const groups: Partial<Record<AssemblyCategory, THREE.Group>> = {};
    groups.drive = addDrivetrain(root, selected.drive, moving);
    addElectronics(root);
    groups.collect = addCollector(
      root,
      selected.collect,
      mountSlots.collect,
      moving,
    );
    groups.carry = addStorage(root, selected.carry, mountSlots.carry);
    groups.reach = addReach(root, selected.reach, mountSlots.reach, moving);
    groups.score = addScorer(root, selected.score, mountSlots.score, moving);
    groups.assist = addSensor(root, selected.assist, mountSlots.assist);
    moving.mount = addMountMarker(root, activeCategory);
    if (snappingCategory && groups[snappingCategory]) {
      const snapGroup = groups[snappingCategory]!;
      const origin = snapGroup.position.clone();
      moving.snap = { group: snapGroup, origin, started: performance.now() };
    }
    movingRef.current = moving;
  }, [selected, activeCategory, snappingCategory, mountSlots]);

  return (
    <div className={`robot-3d-shell ${draggingCategory ? 'is-dragging' : ''}`}>
      <div ref={containerRef} className="robot-3d-canvas-wrap">
        {failed && (
          <div className="three-fallback">
            <strong>3D view could not start.</strong>
            <span>
              Your robot is still saved; try a browser with WebGL enabled.
            </span>
          </div>
        )}
      </div>
      <div className="three-view-label">
        <span>
          <i /> Interactive 3D
        </span>
        <small>Drag or ← → to rotate · scroll or ↑ ↓ to zoom</small>
      </div>
      <div
        className={`three-mount-reticle ${draggingCategory ? 'is-ready' : ''}`}
        style={{ left: mount.left, top: mount.top }}
        aria-hidden="true"
      >
        <i />
        <i />
      </div>
      <div className={`three-mount-card ${draggingCategory ? 'is-ready' : ''}`}>
        <span>
          {draggingCategory
            ? 'Compatible mount found'
            : 'Selected mounting zone'}
        </span>
        <strong>{mount.label}</strong>
        <small>{mount.detail}</small>
      </div>
      <div className="three-detail-key" aria-hidden="true">
        <span>
          <i className="key-hole" /> patterned channel
        </span>
        <span>
          <i className="key-bracket" /> structural bracket
        </span>
        <span>
          <i className="key-wire" /> protected cable route
        </span>
      </div>
    </div>
  );
}
