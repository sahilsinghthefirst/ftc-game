// The playing field, laid out like a real FTC field: a square of 6 x 6 foam
// mats. Every coordinate in the game is in field units, with (0, 0) at the
// back-left corner of the mats and `FIELD_SIZE` at the front-right corner.
//
// Everything that needs to know where something is - physics walls, the bot's
// navigation, the 3D scene - reads from here, so the field can be resized
// without numbers drifting apart between modules.

export const TILES = 6;
export const TILE = 135;
export const FIELD_SIZE = TILES * TILE;
export const FIELD_CENTER = FIELD_SIZE / 2;

// How close a robot's center or a loose ARTIFACT can get to the perimeter wall.
export const ROBOT_MARGIN = 43;
export const BALL_MARGIN = 16;

export const BLUE_GOAL = { x: 105, y: 115 };
export const RED_GOAL = { x: FIELD_SIZE - 105, y: 115 };
export const BLUE_BASE = { x: 115, y: FIELD_SIZE - 120 };
export const RED_BASE = { x: FIELD_SIZE - 115, y: FIELD_SIZE - 120 };

export const GOAL_RADIUS = 45;
export const CENTER_STRUCTURE = {
  x: FIELD_CENTER,
  y: FIELD_CENTER,
  radius: 76,
};

// ARTIFACT starting positions, spread over the mats and clear of the goals,
// the bases, and the center structure.
export const pieceLayout: [number, number, 'P' | 'G'][] = [
  [250, 105, 'P'],
  [405, 88, 'G'],
  [560, 105, 'P'],
  [700, 250, 'G'],
  [110, 250, 'P'],
  [250, 235, 'G'],
  [405, 232, 'P'],
  [560, 235, 'G'],
  [180, 380, 'P'],
  [630, 380, 'G'],
  [95, 470, 'P'],
  [715, 470, 'G'],
  [300, 470, 'P'],
  [250, 545, 'P'],
  [405, 560, 'G'],
  [560, 545, 'P'],
  [200, 640, 'G'],
  [405, 700, 'P'],
  [610, 640, 'G'],
];
