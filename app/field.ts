// The playing field, laid out like a real FTC field: a square of 6 x 6 foam
// mats. Every coordinate in the game is in field units, with (0, 0) at the
// back-left corner of the mats and `FIELD_SIZE` at the front-right corner.
//
// Everything that needs to know where something is - physics walls, the bot's
// navigation, the 3D scene - reads from here, so the field can be resized
// without numbers drifting apart between modules.

export const TILES = 6;
// The mats are scaled up half again from the robots' true proportions,
// giving a bigger field to drive, spread out and race across.
export const TILE = 202.5;
export const FIELD_SIZE = TILES * TILE;
export const FIELD_CENTER = FIELD_SIZE / 2;

// How close a robot's center or a loose ARTIFACT can get to the perimeter wall.
export const ROBOT_MARGIN = 43;
export const BALL_MARGIN = 16;

export const GOAL_RADIUS = 45;
export const CENTER_STRUCTURE = {
  x: FIELD_CENTER,
  y: FIELD_CENTER,
  radius: 76,
};

// The GOALS stand right up against the center structure, level with it: blue
// on its left, red on its right. The small gap is where the 3D models meet -
// far too narrow for a robot or an ARTIFACT to slip through.
export const GOAL_OFFSET = CENTER_STRUCTURE.radius + GOAL_RADIUS + 4;
export const BLUE_GOAL = { x: FIELD_CENTER - GOAL_OFFSET, y: FIELD_CENTER };
export const RED_GOAL = { x: FIELD_CENTER + GOAL_OFFSET, y: FIELD_CENTER };
// Each alliance's BASE is the whole mat in its bottom corner, flush with both
// walls: blue bottom-left, red bottom-right. A robot is parked when its center
// is on that mat.
export type Zone = { left: number; top: number; right: number; bottom: number };
export const BLUE_BASE_ZONE: Zone = {
  left: 0,
  top: FIELD_SIZE - TILE,
  right: TILE,
  bottom: FIELD_SIZE,
};
export const RED_BASE_ZONE: Zone = {
  left: FIELD_SIZE - TILE,
  top: FIELD_SIZE - TILE,
  right: FIELD_SIZE,
  bottom: FIELD_SIZE,
};
export function zoneCenter(zone: Zone) {
  return { x: (zone.left + zone.right) / 2, y: (zone.top + zone.bottom) / 2 };
}
export function inZone(point: { x: number; y: number }, zone: Zone) {
  return (
    point.x >= zone.left &&
    point.x <= zone.right &&
    point.y >= zone.top &&
    point.y <= zone.bottom
  );
}
// Where robots head to park: the middle of their BASE mat.
export const BLUE_BASE = zoneCenter(BLUE_BASE_ZONE);
export const RED_BASE = zoneCenter(RED_BASE_ZONE);

export type Alliance = 'blue' | 'red';

// Starting positions, as in BIOBUZZ: big NECTAR ('P') in alliance colours,
// which only that alliance may pick up, and small yellow POLLEN ('G') that
// anyone may. Every blue NECTAR has a red twin mirrored across the field, and
// the POLLEN is mirrored too, so neither alliance starts with an advantage.
// All of it is clear of the goals, the bases, and the center structure.
const blueNectar: [number, number][] = [
  [375, 158],
  [160, 375],
  [300, 560],
  [143, 705],
  [450, 818],
  [330, 1020],
];
const sidePollen: [number, number][] = [
  [260, 290],
  [470, 300],
  [110, 560],
  [220, 880],
  [500, 960],
];
const centerPollen: [number, number][] = [
  [FIELD_CENTER, 140],
  [FIELD_CENTER, 440],
  [FIELD_CENTER, 1060],
];
const mirror = ([x, y]: [number, number]): [number, number] => [
  FIELD_SIZE - x,
  y,
];

export const pieceLayout: [number, number, 'P' | 'G', Alliance?][] = [
  ...blueNectar.map(([x, y]): [number, number, 'P', Alliance] => [
    x,
    y,
    'P',
    'blue',
  ]),
  ...blueNectar
    .map(mirror)
    .map(([x, y]): [number, number, 'P', Alliance] => [x, y, 'P', 'red']),
  ...[...sidePollen, ...sidePollen.map(mirror), ...centerPollen].map(
    ([x, y]): [number, number, 'G'] => [x, y, 'G'],
  ),
];
