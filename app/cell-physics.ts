// The balls inside a HIVE's CELL, simulated in the CELL's own frame: a loaded
// ball comes in through the opening, rolls down to the back wall and settles
// into a pile with the others, and when the HIVE tips they slide forward to
// the open end to pour out - rather than snapping to a grid.
//
// Everything is in inches and seconds. x runs across the CELL from its
// middle, y up from its floor, and z out from its back wall to the open end.

// The inside of a CELL (BIOBUZZ manual, figure 9-11): a 20 in. floor, walls
// 7.61 in. high under a roof that peaks at 14 in., and 12.04 in. deep.
export const CELL_INSIDE = { half: 10, eave: 7.61, peak: 14, depth: 12.04 };

export type Vec = { x: number; y: number; z: number };
export type CellBall = Vec & { vx: number; vy: number; vz: number; r: number };

export const GRAVITY = 386;
// How much of its speed into a wall or another ball a ball keeps, bouncing.
const BOUNCE = 0.25;
// Sliding along a wall or another ball slows a ball this fast, per second.
const FRICTION = 3;
// Rolling slows it gently even on its own.
const ROLL_DRAG = 0.8;
// Steps per second: enough that a pile of balls sits still.
const RATE = 240;

// A wall of the CELL, facing inward: a point p is inside when n.p >= d.
type Wall = { nx: number; ny: number; nz: number; d: number };

const { half, eave, peak, depth } = CELL_INSIDE;
const slope = Math.hypot(peak - eave, half);
const WALLS: Wall[] = [
  // Floor, the two side walls and the back wall.
  { nx: 0, ny: 1, nz: 0, d: 0 },
  { nx: 1, ny: 0, nz: 0, d: -half },
  { nx: -1, ny: 0, nz: 0, d: -half },
  { nx: 0, ny: 0, nz: 1, d: 0 },
  // The two slopes of the roof.
  {
    nx: -(peak - eave) / slope,
    ny: -half / slope,
    nz: 0,
    d: (-half * peak) / slope,
  },
  {
    nx: (peak - eave) / slope,
    ny: -half / slope,
    nz: 0,
    d: (-half * peak) / slope,
  },
  // The open end. A ball only leaves the CELL when the match lets it out,
  // so until then this holds it in - the next in line to pour out.
  { nx: 0, ny: 0, nz: -1, d: -depth },
];

// Take the velocity off along n, bounce a little of it back, and drag the
// rest - the sliding part - down with friction.
function collide(
  ball: CellBall,
  nx: number,
  ny: number,
  nz: number,
  h: number,
) {
  const into = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  if (into >= 0) return;
  ball.vx -= (1 + BOUNCE) * into * nx;
  ball.vy -= (1 + BOUNCE) * into * ny;
  ball.vz -= (1 + BOUNCE) * into * nz;
  const along = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  const keep = Math.exp(-FRICTION * h);
  ball.vx = along * nx + (ball.vx - along * nx) * keep;
  ball.vy = along * ny + (ball.vy - along * ny) * keep;
  ball.vz = along * nz + (ball.vz - along * nz) * keep;
}

// Advance every ball in one CELL by dt seconds, with `gravity` already turned
// into the CELL's own frame (so tipping the HIVE tips the gravity).
export function stepCell(balls: CellBall[], gravity: Vec, dt: number) {
  const steps = Math.max(1, Math.ceil(dt * RATE));
  const h = dt / steps;
  const drag = Math.exp(-ROLL_DRAG * h);
  for (let step = 0; step < steps; step++) {
    for (const ball of balls) {
      ball.vx = (ball.vx + gravity.x * h) * drag;
      ball.vy = (ball.vy + gravity.y * h) * drag;
      ball.vz = (ball.vz + gravity.z * h) * drag;
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      ball.z += ball.vz * h;
      for (const wall of WALLS) {
        const gap =
          wall.nx * ball.x +
          wall.ny * ball.y +
          wall.nz * ball.z -
          wall.d -
          ball.r;
        if (gap >= 0) continue;
        ball.x -= wall.nx * gap;
        ball.y -= wall.ny * gap;
        ball.z -= wall.nz * gap;
        collide(ball, wall.nx, wall.ny, wall.nz, h);
      }
    }
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const distance = Math.hypot(dx, dy, dz);
        const touch = a.r + b.r;
        if (distance >= touch) continue;
        const nx = distance > 1e-6 ? dx / distance : 0;
        const ny = distance > 1e-6 ? dy / distance : 1;
        const nz = distance > 1e-6 ? dz / distance : 0;
        const push = (touch - distance) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.y += ny * push;
        b.z += nz * push;
        // Equal masses: swap the closing part of their speeds, less a little.
        const closing =
          (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
        if (closing <= 0) continue;
        const kick = ((1 + BOUNCE) / 2) * closing;
        a.vx -= kick * nx;
        a.vy -= kick * ny;
        a.vz -= kick * nz;
        b.vx += kick * nx;
        b.vy += kick * ny;
        b.vz += kick * nz;
      }
  }
}

// A ball just launched in through the open end, heading for the back.
export function enteringBall(r: number, random = Math.random): CellBall {
  return {
    x: (random() - 0.5) * (half - r) * 1.2,
    y: Math.min(eave, 5 + random() * 2),
    z: depth - r - 0.3,
    vx: (random() - 0.5) * 8,
    vy: -6,
    vz: -55,
    r,
  };
}

// A ball set down in the CELL before the match, near the back wall.
export function restingBall(r: number, index: number): CellBall {
  const across = [-6, 0, 6, -3, 3];
  return {
    x: across[index % across.length],
    y: r + Math.floor(index / across.length) * r * 2,
    z: r + 0.2,
    vx: 0,
    vy: 0,
    vz: 0,
    r,
  };
}
