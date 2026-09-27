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
// ARTIFACTS spilling out of a tipped GOAL roll on a gentler curve: they leave
// at well under half the speed a normal nudge would need and glide to a stop,
// which reads as a spill rather than an explosion.
export const SPILL_DRAG = 2.1;
export const BALL_RADIUS = 14;

export function rollSpeed(distance: number, drag = BALL_DRAG) {
  return distance * drag;
}

export function rollDistance(speed: number, drag = BALL_DRAG) {
  return speed / drag;
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
