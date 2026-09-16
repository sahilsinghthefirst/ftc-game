import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driveVelocity, moveBody, rollBalls } from '../app/robot-physics.ts';

const body = () => ({ x: 200, y: 200, vx: 0, vy: 0, angle: 0 });

test('acceleration is direction independent, and cargo adds weight', () => {
  const straight = body(),
    diagonal = body(),
    loaded = body();
  driveVelocity(straight, 1, 0, 220, 820, 0, 1 / 60);
  driveVelocity(diagonal, Math.SQRT1_2, Math.SQRT1_2, 220, 820, 0, 1 / 60);
  driveVelocity(loaded, 1, 0, 220, 820, 5, 1 / 60);
  assert.ok(
    Math.abs(straight.vx - Math.hypot(diagonal.vx, diagonal.vy)) < 1e-9,
  );
  assert.ok(loaded.vx < straight.vx);
  for (let i = 0; i < 60; i++)
    driveVelocity(straight, 0, 0, 220, 820, 0, 1 / 60);
  assert.equal(straight.vx, 0);
});

test('walls stop motion and heading changes are bounded', () => {
  const robot = { ...body(), x: 956, vx: 220, vy: 100, angle: Math.PI };
  moveBody(robot, 1 / 60);
  assert.equal(robot.x, 957);
  assert.equal(robot.vx, 0);
  assert.ok(Math.abs(robot.angle - Math.PI) <= 7 / 60 + 1e-9);
});

test('balls receive a bump, settle and stay finite at exact overlaps', () => {
  const robot = { ...body(), vx: 180 };
  const ball = { x: 220, y: 200, active: true };
  rollBalls([ball], [robot], 1 / 60);
  assert.ok(ball.vx > 0);
  assert.equal(ball.x, 242);
  for (let i = 0; i < 180; i++) rollBalls([ball], [], 1 / 60);
  assert.ok(Math.abs(ball.vx) < 0.01);
  const overlaps = [
    { x: 500, y: 326, active: true },
    { x: 500, y: 326, active: true },
  ];
  rollBalls(overlaps, [], 1 / 60);
  assert.ok(
    overlaps.every((b) => Number.isFinite(b.x) && Number.isFinite(b.vx)),
  );
});

test('ball collisions transfer momentum along the collision normal only', () => {
  const a = { x: 300, y: 200, vx: 0, vy: 100, active: true };
  const b = { x: 300, y: 225, vx: 0, vy: 0, active: true };
  rollBalls([a, b], [], 1 / 60);
  assert.ok(b.vy > 0);
  assert.equal(b.vx, 0);
  const collected = { x: 999, y: 999, vx: 200, vy: 0, active: false };
  rollBalls([collected], [], 1 / 60);
  assert.equal(collected.x, 999);
});
