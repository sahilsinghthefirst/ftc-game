import {
  BALL_MARGIN,
  barContact,
  FIELD_SIZE,
  FRAME_BARS,
  INCH,
  ROBOT_MARGIN,
  type CellEnd,
} from './field.ts';
import { BOT_OBSTACLES } from './bot-driver.ts';

// A loose ARTIFACT sheds speed as exp(-drag * dt), so one launched at
// drag x distance coasts almost exactly that far before it settles.
// `rollDistance` and `rollSpeed` convert between the two.
export const BALL_DRAG = 3.8;
// ARTIFACTS spilling out of a tipped HIVE roll on a much gentler curve: they
// leave at under a quarter of the speed a normal nudge would need and glide a
// long way before stopping, so they spread across the mats without looking
// flung.
export const SPILL_DRAG = 0.75;
export const BALL_RADIUS = 14;

export function rollSpeed(distance: number, drag = BALL_DRAG) {
  return distance * drag;
}

export function rollDistance(speed: number, drag = BALL_DRAG) {
  return speed / drag;
}

// Seconds an ARTIFACT takes to drop to the mats from `inches` up. While it
// falls it carries on outward but touches nothing.
export function fallTime(inches: number) {
  return Math.sqrt((2 * inches * 0.0254) / 9.81);
}
// How high a downward CELL's open end hangs, and the upward one's.
export const SPILL_DROP = 37.5;
export const BOUNCE_DROP = 59;

// When a HIVE tips, the CELL that was up swings down and pours out of its
// open end, so everything it held comes out on that side of the HIVE only.
// Each ARTIFACT falls from somewhere across the mouth, then rolls off in its
// own direction inside a wide fan pointing straight out, as hard or soft as
// chance decides, and they spread away from each other across that half of
// the field instead of clumping. The order they come out in is shuffled too.
export const SPILL_FAR = 1050;
// Half the width of the fan, either side of straight out.
export const SPILL_SPREAD = 1.15;
// How far across the mouth an ARTIFACT can tumble out from its center.
export const SPILL_MOUTH_WIDTH = 8 * INCH;
// Nothing rolls out less than this far: it falls clear of the CELL first.
export const SPILL_MIN = 40;
const SPILL_LANES = 60;
// How hard an ARTIFACT is thrown, as a share of the clear run its way.
const SPILL_POWER = [0.2, 1] as const;
// Landing spots closer than this to one already taken are drawn again.
export const SPILL_APART = 100;
const SPILL_TRIES = 16;

export type SpillShot = {
  // Where the ARTIFACT drops from the mouth, and how fast it is going.
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Where it will settle.
  landX: number;
  landY: number;
  // Seconds after the tip before it falls out.
  delay: number;
};

type Point = { x: number; y: number };
const edge = BALL_MARGIN + 34;

// How far an ARTIFACT can roll straight out from `from` along `angle` before
// it would meet a wall or a frame bar.
function room(from: Point, angle: number, limit = SPILL_FAR) {
  let clear = 0;
  for (let reach = 0; reach <= limit; reach += 8) {
    const x = from.x + Math.cos(angle) * reach;
    const y = from.y + Math.sin(angle) * reach;
    if (x < edge || x > FIELD_SIZE - edge || y < edge || y > FIELD_SIZE - edge)
      break;
    if (FRAME_BARS.some((bar) => barContact(bar, x, y).gap < BALL_RADIUS + 6))
      break;
    clear = reach;
  }
  return clear;
}

// Plan the pour for every ARTIFACT a tipping CELL was holding. `mouth` is the
// middle of its open end and `end` the side of the HIVE it is on. The fan is
// split into one slice per ARTIFACT, so they cover the whole of it, and each
// takes a random direction inside its own slice at a random strength. No
// ARTIFACT is aimed past a wall or into the frame.
export function spillPlan(
  mouth: Point,
  end: CellEnd,
  count: number,
  random = Math.random,
): SpillShot[] {
  const facing = end > 0 ? Math.PI / 2 : -Math.PI / 2;
  // Open lanes, in order across the fan, so each slice below is one arc.
  const lanes: { angle: number; clear: number }[] = [];
  for (let lane = 0; lane < SPILL_LANES; lane += 1) {
    const angle =
      facing - SPILL_SPREAD + ((lane + 0.5) / SPILL_LANES) * SPILL_SPREAD * 2;
    const clear = room(mouth, angle);
    if (clear >= SPILL_MIN + 60) lanes.push({ angle, clear });
  }
  // Nowhere to go at all: drop them straight out rather than fail the tip.
  if (lanes.length === 0) lanes.push({ angle: facing, clear: SPILL_MIN });

  const width = (SPILL_SPREAD * 2) / SPILL_LANES;
  const [weakest, strongest] = SPILL_POWER;
  const landings: Point[] = [];
  // A random throw somewhere inside the given slice of lanes.
  const throwInto = (slice: number) => {
    const first = Math.floor((slice / count) * lanes.length);
    const last = Math.max(
      first + 1,
      Math.floor(((slice + 1) / count) * lanes.length),
    );
    const lane = lanes[first + Math.floor(random() * (last - first))];
    const angle = lane.angle + (random() - 0.5) * width;
    // Tumbling out somewhere across the mouth, not all from its middle -
    // unless that edge of the mouth is aimed straight at the frame.
    const across = (random() - 0.5) * SPILL_MOUTH_WIDTH;
    let start = { x: mouth.x + across, y: mouth.y };
    if (room(start, angle) < SPILL_MIN) start = { ...mouth };
    const clear = Math.min(lane.clear, room(start, angle));
    const share = weakest + random() * (strongest - weakest);
    const reach = Math.min(clear, Math.max(SPILL_MIN, clear * share));
    return {
      angle,
      reach,
      start,
      x: start.x + Math.cos(angle) * reach,
      y: start.y + Math.sin(angle) * reach,
    };
  };
  // How close a landing spot comes to any already taken.
  const crowding = (spot: Point) =>
    landings.reduce(
      (closest, other) =>
        Math.min(closest, Math.hypot(spot.x - other.x, spot.y - other.y)),
      Infinity,
    );

  // Shuffle which slice goes first, and let them out at uneven intervals.
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let delay = 0;
  return order.map((slice) => {
    // Draw again while the spot lands on top of another, keeping the roomiest.
    let best = throwInto(slice);
    for (let tries = 1; tries < SPILL_TRIES; tries += 1) {
      if (crowding(best) >= SPILL_APART) break;
      const next = throwInto(slice);
      if (crowding(next) > crowding(best)) best = next;
    }
    landings.push(best);
    const { angle, reach, start } = best;
    const launch = rollSpeed(reach, SPILL_DRAG);
    const shot = {
      x: start.x,
      y: start.y,
      vx: Math.cos(angle) * launch,
      vy: Math.sin(angle) * launch,
      landX: best.x,
      landY: best.y,
      delay,
    };
    delay += 0.05 + random() * 0.14;
    return shot;
  });
}

// A shot that bounces off the rim of an upward CELL: it drops back out of the
// mouth and rolls a short way out toward the robot that fired it.
export function bouncePlan(
  mouth: Point,
  end: CellEnd,
  random = Math.random,
): SpillShot {
  const angle = (end > 0 ? Math.PI / 2 : -Math.PI / 2) + (random() - 0.5) * 1.2;
  const reach = Math.min(room(mouth, angle), 60 + random() * 90);
  const launch = rollSpeed(reach, SPILL_DRAG);
  return {
    x: mouth.x,
    y: mouth.y,
    vx: Math.cos(angle) * launch,
    vy: Math.sin(angle) * launch,
    landX: mouth.x + Math.cos(angle) * reach,
    landY: mouth.y + Math.sin(angle) * reach,
    delay: 0,
  };
}

type Body = { x: number; y: number; vx: number; vy: number; angle: number };
type Ball = {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  active: boolean;
  radius?: number;
  spill?: boolean;
  // Seconds left falling to the mats; nothing touches it till it lands.
  air?: number;
};

// Handling is the workshop trait that decides how hard a drivetrain can change
// the robot's velocity: `acceleration` while the driver is pushing a direction
// and `braking` once they let go. Top speed is a separate trait on purpose, so
// a quick robot can still be slow to get going or slow to stop.
export function handlingProfile(handling: number) {
  const rating = Math.max(1, Math.min(12, handling));
  return { acceleration: 430 + rating * 75, braking: 300 + rating * 120 };
}

export function driveVelocity(
  body: Body,
  x: number,
  y: number,
  speed: number,
  acceleration: number,
  braking: number,
  load: number,
  dt: number,
  // How much of the drivetrain's push is available sideways. A mecanum base
  // strafes at full power (1); a six-wheeler has to point where it is going
  // and only scrubs sideways (near 0).
  strafe = 1,
) {
  const mass = 1 + load * 0.055;
  // Split the request into "along the nose" and "across the nose", then weaken
  // the across part by whatever the drivetrain can actually do.
  const hx = Math.cos(body.angle);
  const hy = Math.sin(body.angle);
  const along = x * hx + y * hy;
  const across = (x * hy - y * hx) * strafe;
  const wantX = hx * along + hy * across;
  const wantY = hy * along - hx * across;
  const dx = (wantX * speed) / mass - body.vx;
  const dy = (wantY * speed) / mass - body.vy;
  const change = Math.hypot(dx, dy);
  const coasting = x === 0 && y === 0;
  const limit = ((coasting ? braking : acceleration) / mass) * dt;
  const factor = change > 0 ? Math.min(1, limit / change) : 0;
  body.vx += dx * factor;
  body.vy += dy * factor;
}

// How fast a chassis can swing its nose round to face where it is going, in
// radians per second. The default suits a robot with no drivetrain of its own.
export const DEFAULT_TURN_RATE = 7;

export function moveBody(
  body: Body,
  dt: number,
  turnRate = DEFAULT_TURN_RATE,
  // The direction the driver is asking for. A chassis that cannot strafe has
  // to turn toward this before it can go anywhere, so steering has to follow
  // the request rather than the velocity it has not achieved yet.
  facing?: number,
) {
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  const far = FIELD_SIZE - ROBOT_MARGIN;
  if (body.x < ROBOT_MARGIN || body.x > far) {
    body.x = Math.max(ROBOT_MARGIN, Math.min(far, body.x));
    body.vx = 0;
  }
  if (body.y < ROBOT_MARGIN || body.y > far) {
    body.y = Math.max(ROBOT_MARGIN, Math.min(far, body.y));
    body.vy = 0;
  }
  const desired =
    facing !== undefined
      ? facing
      : Math.hypot(body.vx, body.vy) > 14
        ? Math.atan2(body.vy, body.vx)
        : undefined;
  if (desired !== undefined) {
    const error = Math.atan2(
      Math.sin(desired - body.angle),
      Math.cos(desired - body.angle),
    );
    body.angle += Math.max(-turnRate * dt, Math.min(turnRate * dt, error));
  }
}

export function rollBalls(balls: Ball[], robots: Body[], dt: number) {
  const active = balls.filter((ball) => ball.active);
  for (const ball of active) {
    const size = ball.radius ?? BALL_RADIUS;
    const drag = ball.spill ? SPILL_DRAG : BALL_DRAG;
    ball.vx = (ball.vx ?? 0) * Math.exp(-drag * dt);
    ball.vy = (ball.vy ?? 0) * Math.exp(-drag * dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    // Still falling out of a CELL: over the robots and the frame, so the
    // first thing it can meet is the mats.
    if (ball.air) {
      ball.air = Math.max(0, ball.air - dt);
      continue;
    }
    // Once a spilled ARTIFACT has settled it is an ordinary loose ball again.
    if (ball.spill && Math.hypot(ball.vx, ball.vy) < 14) ball.spill = false;
    for (const robot of robots) {
      const dx = ball.x - robot.x,
        dy = ball.y - robot.y;
      const d = Math.hypot(dx, dy);
      const contact = 28 + size;
      if (d >= contact) continue;
      const nx = d > 0.001 ? dx / d : Math.cos(robot.angle);
      const ny = d > 0.001 ? dy / d : Math.sin(robot.angle);
      ball.x = robot.x + nx * contact;
      ball.y = robot.y + ny * contact;
      const impulse = Math.max(
        0,
        (robot.vx - ball.vx) * nx + (robot.vy - ball.vy) * ny,
      );
      ball.vx += nx * impulse * 1.15;
      ball.vy += ny * impulse * 1.15;
    }
    for (const bar of FRAME_BARS) {
      const contact = barContact(bar, ball.x, ball.y);
      if (contact.gap >= size) continue;
      const dx = ball.x - contact.x,
        dy = ball.y - contact.y;
      const d = Math.hypot(dx, dy),
        radius = bar.r + size;
      const nx = d > 0.001 ? dx / d : 1,
        ny = d > 0.001 ? dy / d : 0;
      ball.x = contact.x + nx * radius;
      ball.y = contact.y + ny * radius;
      const impact = Math.min(0, ball.vx * nx + ball.vy * ny);
      ball.vx -= 1.35 * impact * nx;
      ball.vy -= 1.35 * impact * ny;
    }
    const near = BALL_MARGIN + size - BALL_RADIUS;
    const ballFar = FIELD_SIZE - near;
    if (ball.x < near || ball.x > ballFar) {
      ball.x = Math.max(near, Math.min(ballFar, ball.x));
      ball.vx *= -0.35;
    }
    if (ball.y < near || ball.y > ballFar) {
      ball.y = Math.max(near, Math.min(ballFar, ball.y));
      ball.vy *= -0.35;
    }
  }
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i],
        b = active[j];
      if (a.air || b.air) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        d = Math.hypot(dx, dy);
      const span = (a.radius ?? BALL_RADIUS) + (b.radius ?? BALL_RADIUS);
      if (d >= span) continue;
      const nx = d > 0.001 ? dx / d : 1,
        ny = d > 0.001 ? dy / d : 0;
      const push = (span - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const impulse =
        Math.max(
          0,
          ((a.vx ?? 0) - (b.vx ?? 0)) * nx + ((a.vy ?? 0) - (b.vy ?? 0)) * ny,
        ) * 0.65;
      a.vx = (a.vx ?? 0) - impulse * nx;
      a.vy = (a.vy ?? 0) - impulse * ny;
      b.vx = (b.vx ?? 0) + impulse * nx;
      b.vy = (b.vy ?? 0) + impulse * ny;
    }
}

// Push a robot out of the solid bars on the field and kill the part of its
// velocity that was driving into them.
export function resolveObstacle(robot: Body) {
  for (const obstacle of BOT_OBSTACLES) {
    const contact = barContact(obstacle, robot.x, robot.y);
    if (contact.gap >= 0) continue;
    const dx = robot.x - contact.x;
    const dy = robot.y - contact.y;
    const d = Math.hypot(dx, dy);
    // Dead on the bar's line: push out sideways, away from the field center.
    const side = robot.x < FIELD_SIZE / 2 ? -1 : 1;
    const nx = d > 0.001 ? dx / d : side;
    const ny = d > 0.001 ? dy / d : 0;
    robot.x = contact.x + nx * obstacle.r;
    robot.y = contact.y + ny * obstacle.r;
    const dot = robot.vx * nx + robot.vy * ny;
    if (dot < 0) {
      robot.vx -= dot * nx;
      robot.vy -= dot * ny;
    }
  }
}
