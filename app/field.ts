// The playing field, laid out like a real FTC field: a square of 6 x 6 foam
// mats. Every coordinate in the game is in field units, with (0, 0) at the
// back-left corner of the mats and `FIELD_SIZE` at the front-right corner.
// "Near" is the bottom edge, where the BASES and the audience are; "far" is
// the top edge.
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

export type Alliance = 'blue' | 'red';

// The HIVE structure in the middle of the field, built from the BIOBUZZ
// manual's dimensions (section 9.6) at 3.75 field units to the inch: big
// enough to be the centrepiece, small enough that the follow camera, parked
// at a CELL to load it, still has the top of that CELL in view. A frame of
// two A-frames and a crossbar holds a blue HIVE on the left and a red HIVE on
// the right. Each HIVE is a seesaw with a CELL at either end, and one CELL
// always faces up.
export const INCH = 3.75;
export const HIVE_X: Record<Alliance, number> = {
  blue: FIELD_CENTER - 12.75 * INCH,
  red: FIELD_CENTER + 12.75 * INCH,
};

// Which end of a HIVE a CELL is on: 1 at the near end, -1 at the far end.
export type CellEnd = 1 | -1;
// Both HIVES start with their near CELL tipped up, holding three of their
// alliance's NECTAR, as BIOBUZZ stages them.
export const HIVE_START_UP: CellEnd = 1;
export const CELL_PRELOAD = 3;

// The A-frames stand at either end of the crossbar. Their base bars on the
// mats are all a robot can bump into: the HIVES hang high enough for robots
// and ARTIFACTS to pass underneath, between the A-frames.
export const FRAME_HALF_WIDTH = 24.73 * INCH;
export const FRAME_HALF_DEPTH = 19.48 * INCH;
// A solid bar on the mats, `r` thick either side of the line from a to b.
export type Bar = { ax: number; ay: number; bx: number; by: number; r: number };
export const FRAME_BARS: Bar[] = [-1, 1].map((side) => ({
  ax: FIELD_CENTER + side * FRAME_HALF_WIDTH,
  ay: FIELD_CENTER - FRAME_HALF_DEPTH,
  bx: FIELD_CENTER + side * FRAME_HALF_WIDTH,
  by: FIELD_CENTER + FRAME_HALF_DEPTH,
  r: 1.5 * INCH,
}));

// The point on a bar nearest to (x, y), and how far (x, y) is from its surface.
export function barContact(bar: Bar, x: number, y: number) {
  const dx = bar.bx - bar.ax;
  const dy = bar.by - bar.ay;
  const span = dx * dx + dy * dy;
  const t =
    span > 0
      ? Math.max(0, Math.min(1, ((x - bar.ax) * dx + (y - bar.ay) * dy) / span))
      : 0;
  const px = bar.ax + dx * t;
  const py = bar.ay + dy * t;
  return { x: px, y: py, gap: Math.hypot(x - px, y - py) - bar.r };
}

// An upward CELL opens outward and upward, so it can only be loaded from in
// front: a robot has to be at least LOAD_FRONT out from the crossbar on that
// CELL's side, and within its reach of the mouth, which hangs CELL_MOUTH out.
export const CELL_MOUTH = 16 * INCH;
export const LOAD_FRONT = FRAME_HALF_DEPTH + 4;
// A downward CELL's open end hangs further out, and lower; it pours from here.
export const SPILL_MOUTH = 21.5 * INCH;

export function cellMouth(alliance: Alliance, end: CellEnd) {
  return { x: HIVE_X[alliance], y: FIELD_CENTER + end * CELL_MOUTH };
}

export function spillMouth(alliance: Alliance, end: CellEnd) {
  return { x: HIVE_X[alliance], y: FIELD_CENTER + end * SPILL_MOUTH };
}

// Where a robot drives to load a CELL: just in front of it, straight out.
export function loadingSpot(alliance: Alliance, end: CellEnd) {
  return { x: HIVE_X[alliance], y: FIELD_CENTER + end * (LOAD_FRONT + 26) };
}

// Each alliance's BASE is the whole mat in its near corner, flush with both
// walls: blue near-left, red near-right. A robot is parked when its center is
// on that mat.
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

// Where the ARTIFACTS start, staged the way BIOBUZZ stages them: in rows
// against the perimeter wall. Big NECTAR ('P') comes in alliance colours and
// only that alliance may pick it up; small yellow POLLEN ('G') is anyone's.
// The blue side is laid out as BIOBUZZ lays out the alliance on the left, and
// red mirrors it across the field, so neither starts with an advantage.
//
// Along each alliance's own wall, top to bottom:
//   - the eight POLLEN its robots would carry in as pre-loads, in the second
//     mat (the LOADING ZONE),
//   - its five NECTAR, at the middle of the wall where its human player
//     would feed them in,
//   - four POLLEN where that wall's FLOWER will stand.
// Along the far wall, four POLLEN at each of the other two FLOWER spots, and
// along the near wall, four POLLEN in each GARDEN, from the corner out.
// That is all 40 POLLEN and 10 of the 16 NECTAR; the other six start inside
// the HIVES (see CELL_PRELOAD).
type Spot = [number, number, 'P' | 'G', Alliance?];

const POLLEN_RADIUS = 14;
const NECTAR_RADIUS = 18;
// Centers just off the wall, and a hair apart so the rows sit still.
const POLLEN_WALL = BALL_MARGIN + 1;
const NECTAR_WALL = BALL_MARGIN + NECTAR_RADIUS - POLLEN_RADIUS + 1;
const POLLEN_GAP = POLLEN_RADIUS * 2 + 2;
const NECTAR_GAP = NECTAR_RADIUS * 2 + 3;

// `count` balls in a line through (x, y), running down the field when
// `downField`, across it otherwise, centred unless told to start there.
function row(
  count: number,
  gap: number,
  x: number,
  y: number,
  downField: boolean,
  from: 'center' | 'start' = 'center',
): [number, number][] {
  const offset = from === 'center' ? -((count - 1) * gap) / 2 : 0;
  return Array.from({ length: count }, (_, i) =>
    downField ? [x, y + offset + i * gap] : [x + offset + i * gap, y],
  );
}

const bluePollen = [
  ...row(8, POLLEN_GAP, POLLEN_WALL, TILE * 1.5, true),
  ...row(4, POLLEN_GAP, POLLEN_WALL, TILE * 4, true),
  ...row(4, POLLEN_GAP, TILE * 2, POLLEN_WALL, false),
  ...row(4, POLLEN_GAP, POLLEN_WALL, FIELD_SIZE - POLLEN_WALL, false, 'start'),
];
const blueNectar = row(5, NECTAR_GAP, NECTAR_WALL, TILE * 3, true);

const mirror = ([x, y]: [number, number]): [number, number] => [
  FIELD_SIZE - x,
  y,
];

export const pieceLayout: Spot[] = [
  ...blueNectar.map(([x, y]): Spot => [x, y, 'P', 'blue']),
  ...blueNectar.map(mirror).map(([x, y]): Spot => [x, y, 'P', 'red']),
  ...[...bluePollen, ...bluePollen.map(mirror)].map(
    ([x, y]): Spot => [x, y, 'G'],
  ),
];
