import {
  BALL_MARGIN,
  BLUE_GOAL,
  CENTER_STRUCTURE,
  FIELD_SIZE,
  GOAL_RADIUS,
  RED_GOAL,
  ROBOT_MARGIN,
} from './field.ts';
import { BOT_OBSTACLES } from './bot-driver.ts';

// A loose ARTIFACT sheds speed as exp(-drag * dt), so one launched at
// drag x distance coasts almost exactly that far before it settles.
// `rollDistance` and `rollSpeed` convert between the two.
export const BALL_DRAG = 3.8;
// ARTIFACTS spilling out of a tipped GOAL roll on a much gentler curve: they
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

// A tipped GOAL scatters its ARTIFACTS: each one rolls off in its own random
// direction, as hard or soft as chance decides, and they spread away from each
// other across the mats instead of clumping in one spot. Every open direction
// is equally likely, and the order they come out in is shuffled too.
export const SPILL_FAR = 1050;
export const SPILL_RIM = GOAL_RADIUS + 22;
const SPILL_LANES = 120;
// How hard an ARTIFACT is thrown, as a share of the clear run its way.
const SPILL_POWER = [0.2, 1] as const;
// Landing spots closer than this to one already taken are drawn again.
export const SPILL_APART = 110;
const SPILL_TRIES = 16;

export type SpillShot = {
  // Where the ARTIFACT leaves the rim, and how fast.
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Where it will settle.
  landX: number;
  landY: number;
  // Seconds after the tip before it rolls out.
  delay: number;
};

// Plan the roll-out for every ARTIFACT a GOAL was holding. The open directions
// are split into one slice per ARTIFACT, so they fan out all round the GOAL,
// and each takes a random direction inside its own slice at a random strength.
// No ARTIFACT is aimed past a wall, the center structure or the other GOAL.
export function spillPlan(
  goal: { x: number; y: number },
  count: number,
  random = Math.random,
): SpillShot[] {
  const edge = BALL_MARGIN + 34;
  const blocked = [
    {
      x: CENTER_STRUCTURE.x,
      y: CENTER_STRUCTURE.y,
      r: CENTER_STRUCTURE.radius + 40,
    },
    ...[BLUE_GOAL, RED_GOAL]
      .filter((other) => other.x !== goal.x || other.y !== goal.y)
      .map((other) => ({ x: other.x, y: other.y, r: GOAL_RADIUS + 60 })),
  ];
  // How far an ARTIFACT can roll straight out along `angle` before it would
  // meet a wall or something solid.
  const room = (angle: number) => {
    let clear = SPILL_RIM;
    for (let reach = SPILL_RIM; reach <= SPILL_FAR; reach += 8) {
      const x = goal.x + Math.cos(angle) * reach;
      const y = goal.y + Math.sin(angle) * reach;
      if (
        x < edge ||
        x > FIELD_SIZE - edge ||
        y < edge ||
        y > FIELD_SIZE - edge
      )
        break;
      if (blocked.some((spot) => Math.hypot(x - spot.x, y - spot.y) < spot.r))
        break;
      clear = reach;
    }
    return clear;
  };
  const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  // Open lanes, in order round the GOAL starting from the side facing away
  // from the center structure, so each slice below is one unbroken arc.
  const away = Math.atan2(
    goal.y - CENTER_STRUCTURE.y,
    goal.x - CENTER_STRUCTURE.x,
  );
  const lanes: { angle: number; clear: number }[] = [];
  for (let lane = 0; lane < SPILL_LANES; lane += 1) {
    const angle = turn(away + Math.PI + (lane / SPILL_LANES) * Math.PI * 2);
    const clear = room(angle);
    if (clear >= SPILL_RIM + 80) lanes.push({ angle, clear });
  }
  // Nowhere to go at all: set them down on the rim rather than fail the tip.
  if (lanes.length === 0) lanes.push({ angle: Math.PI / 2, clear: SPILL_RIM });

  const width = (Math.PI * 2) / SPILL_LANES;
  const [weakest, strongest] = SPILL_POWER;
  const landings: { x: number; y: number }[] = [];
  // A random throw somewhere inside the given slice of lanes.
  const throwInto = (slice: number) => {
    const first = Math.floor((slice / count) * lanes.length);
    const last = Math.max(
      first + 1,
      Math.floor(((slice + 1) / count) * lanes.length),
    );
    const lane = lanes[first + Math.floor(random() * (last - first))];
    const angle = lane.angle + (random() - 0.5) * width;
    const clear = Math.min(lane.clear, room(angle));
    const share = weakest + random() * (strongest - weakest);
    const reach = Math.max(SPILL_RIM, clear * share);
    return {
      angle,
      reach,
      x: goal.x + Math.cos(angle) * reach,
      y: goal.y + Math.sin(angle) * reach,
    };
  };
  // How close a landing spot comes to any already taken.
  const crowding = (spot: { x: number; y: number }) =>
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
    const { angle, reach } = best;
    const launch = rollSpeed(reach - SPILL_RIM, SPILL_DRAG);
    const shot = {
      x: goal.x + Math.cos(angle) * SPILL_RIM,
      y: goal.y + Math.sin(angle) * SPILL_RIM,
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

type Body = { x: number; y: number; vx: number; vy: number; angle: number };
type Ball = {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  active: boolean;
  radius?: number;
  spill?: boolean;
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
    for (const obstacle of [
      {
        x: CENTER_STRUCTURE.x,
        y: CENTER_STRUCTURE.y,
        r: CENTER_STRUCTURE.radius,
      },
      { x: BLUE_GOAL.x, y: BLUE_GOAL.y, r: GOAL_RADIUS },
      { x: RED_GOAL.x, y: RED_GOAL.y, r: GOAL_RADIUS },
    ]) {
      const dx = ball.x - obstacle.x,
        dy = ball.y - obstacle.y;
      const d = Math.hypot(dx, dy),
        radius = obstacle.r + size;
      if (d >= radius) continue;
      const nx = d > 0.001 ? dx / d : 1,
        ny = d > 0.001 ? dy / d : 0;
      ball.x = obstacle.x + nx * radius;
      ball.y = obstacle.y + ny * radius;
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

// Push a robot out of the solid round objects on the field and kill the part of
// its velocity that was driving into them.
export function resolveObstacle(robot: Body) {
  for (const obstacle of BOT_OBSTACLES) {
    const dx = robot.x - obstacle.x;
    const dy = robot.y - obstacle.y;
    const d = Math.hypot(dx, dy);
    if (d >= obstacle.r) continue;
    const nx = dx / Math.max(d, 1);
    const ny = dy / Math.max(d, 1);
    robot.x = obstacle.x + nx * obstacle.r;
    robot.y = obstacle.y + ny * obstacle.r;
    const dot = robot.vx * nx + robot.vy * ny;
    if (dot < 0) {
      robot.vx -= dot * nx;
      robot.vy -= dot * ny;
    }
  }
}
