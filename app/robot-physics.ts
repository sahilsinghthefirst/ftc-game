import {
  BALL_MARGIN,
  BLUE_GOAL,
  CENTER_STRUCTURE,
  FIELD_SIZE,
  GOAL_RADIUS,
  RED_GOAL,
  ROBOT_MARGIN,
} from './field.ts';

type Body = { x: number; y: number; vx: number; vy: number; angle: number };
type Ball = { x: number; y: number; vx?: number; vy?: number; active: boolean };

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
) {
  const mass = 1 + load * 0.055;
  const dx = (x * speed) / mass - body.vx;
  const dy = (y * speed) / mass - body.vy;
  const change = Math.hypot(dx, dy);
  const coasting = x === 0 && y === 0;
  const limit = ((coasting ? braking : acceleration) / mass) * dt;
  const factor = change > 0 ? Math.min(1, limit / change) : 0;
  body.vx += dx * factor;
  body.vy += dy * factor;
}

export function moveBody(body: Body, dt: number) {
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
  if (Math.hypot(body.vx, body.vy) > 14) {
    const desired = Math.atan2(body.vy, body.vx);
    const error = Math.atan2(
      Math.sin(desired - body.angle),
      Math.cos(desired - body.angle),
    );
    body.angle += Math.max(-7 * dt, Math.min(7 * dt, error));
  }
}

export function rollBalls(balls: Ball[], robots: Body[], dt: number) {
  const active = balls.filter((ball) => ball.active);
  for (const ball of active) {
    ball.vx = (ball.vx ?? 0) * Math.exp(-3.8 * dt);
    ball.vy = (ball.vy ?? 0) * Math.exp(-3.8 * dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    for (const robot of robots) {
      const dx = ball.x - robot.x,
        dy = ball.y - robot.y;
      const d = Math.hypot(dx, dy);
      if (d >= 42) continue;
      const nx = d > 0.001 ? dx / d : Math.cos(robot.angle);
      const ny = d > 0.001 ? dy / d : Math.sin(robot.angle);
      ball.x = robot.x + nx * 42;
      ball.y = robot.y + ny * 42;
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
        radius = obstacle.r + 14;
      if (d >= radius) continue;
      const nx = d > 0.001 ? dx / d : 1,
        ny = d > 0.001 ? dy / d : 0;
      ball.x = obstacle.x + nx * radius;
      ball.y = obstacle.y + ny * radius;
      const impact = Math.min(0, ball.vx * nx + ball.vy * ny);
      ball.vx -= 1.35 * impact * nx;
      ball.vy -= 1.35 * impact * ny;
    }
    const ballFar = FIELD_SIZE - BALL_MARGIN;
    if (ball.x < BALL_MARGIN || ball.x > ballFar) {
      ball.x = Math.max(BALL_MARGIN, Math.min(ballFar, ball.x));
      ball.vx *= -0.35;
    }
    if (ball.y < BALL_MARGIN || ball.y > ballFar) {
      ball.y = Math.max(BALL_MARGIN, Math.min(ballFar, ball.y));
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
      if (d >= 28) continue;
      const nx = d > 0.001 ? dx / d : 1,
        ny = d > 0.001 ? dy / d : 0;
      const push = (28 - d) / 2;
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
