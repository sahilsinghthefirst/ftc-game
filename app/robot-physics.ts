type Body = { x: number; y: number; vx: number; vy: number; angle: number };
type Ball = { x: number; y: number; vx?: number; vy?: number; active: boolean };

export function driveVelocity(
  body: Body,
  x: number,
  y: number,
  speed: number,
  acceleration: number,
  load: number,
  dt: number,
) {
  const mass = 1 + load * 0.055;
  const dx = (x * speed) / mass - body.vx;
  const dy = (y * speed) / mass - body.vy;
  const change = Math.hypot(dx, dy);
  const limit = (acceleration / mass) * dt * (x === 0 && y === 0 ? 1.25 : 1);
  const factor = change > 0 ? Math.min(1, limit / change) : 0;
  body.vx += dx * factor;
  body.vy += dy * factor;
}

export function moveBody(body: Body, dt: number) {
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  if (body.x < 43 || body.x > 957) {
    body.x = Math.max(43, Math.min(957, body.x));
    body.vx = 0;
  }
  if (body.y < 43 || body.y > 607) {
    body.y = Math.max(43, Math.min(607, body.y));
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
      { x: 500, y: 326, r: 76 },
      { x: 95, y: 108, r: 45 },
      { x: 905, y: 108, r: 45 },
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
    if (ball.x < 16 || ball.x > 984) {
      ball.x = Math.max(16, Math.min(984, ball.x));
      ball.vx *= -0.35;
    }
    if (ball.y < 16 || ball.y > 634) {
      ball.y = Math.max(16, Math.min(634, ball.y));
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
