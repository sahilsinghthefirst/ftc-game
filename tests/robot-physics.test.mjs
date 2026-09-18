import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  driveVelocity,
  handlingProfile,
  moveBody,
  rollBalls,
} from '../app/robot-physics.ts';
import {
  BALL_MARGIN,
  CENTER_STRUCTURE,
  FIELD_SIZE,
  ROBOT_MARGIN,
  TILE,
  TILES,
  pieceLayout,
} from '../app/field.ts';

const body = () => ({ x: 200, y: 200, vx: 0, vy: 0, angle: 0 });
const step = 1 / 60;

test('acceleration is direction independent, and cargo adds weight', () => {
  const straight = body(),
    diagonal = body(),
    loaded = body();
  driveVelocity(straight, 1, 0, 220, 820, 1025, 0, step);
  driveVelocity(diagonal, Math.SQRT1_2, Math.SQRT1_2, 220, 820, 1025, 0, step);
  driveVelocity(loaded, 1, 0, 220, 820, 1025, 5, step);
  assert.ok(
    Math.abs(straight.vx - Math.hypot(diagonal.vx, diagonal.vy)) < 1e-9,
  );
  assert.ok(loaded.vx < straight.vx);
  for (let i = 0; i < 60; i++)
    driveVelocity(straight, 0, 0, 220, 820, 1025, 0, step);
  assert.equal(straight.vx, 0);
});

test('handling ratings stay in range and rise with the trait', () => {
  const low = handlingProfile(1),
    high = handlingProfile(12);
  assert.ok(high.acceleration > low.acceleration);
  assert.ok(high.braking > low.braking);
  assert.deepEqual(handlingProfile(-4), low);
  assert.deepEqual(handlingProfile(99), high);
  for (let rating = 2; rating <= 12; rating++) {
    const previous = handlingProfile(rating - 1);
    const current = handlingProfile(rating);
    assert.ok(current.acceleration > previous.acceleration);
    assert.ok(current.braking > previous.braking);
  }
});

test('handling changes how fast a robot starts and stops, not its top speed', () => {
  const speed = 220;
  const sluggish = handlingProfile(2);
  const crisp = handlingProfile(11);
  const slow = body(),
    quick = body();

  // Same throttle, same top speed: the crisp build just gets there sooner.
  for (let i = 0; i < 12; i++) {
    driveVelocity(slow, 1, 0, speed, sluggish.acceleration, sluggish.braking, 0, step);
    driveVelocity(quick, 1, 0, speed, crisp.acceleration, crisp.braking, 0, step);
  }
  assert.ok(quick.vx > slow.vx);

  for (let i = 0; i < 600; i++) {
    driveVelocity(slow, 1, 0, speed, sluggish.acceleration, sluggish.braking, 0, step);
    driveVelocity(quick, 1, 0, speed, crisp.acceleration, crisp.braking, 0, step);
  }
  assert.ok(Math.abs(slow.vx - speed) < 1e-9);
  assert.ok(Math.abs(quick.vx - speed) < 1e-9);

  // Release the stick: the sluggish build coasts further before stopping.
  let slowDistance = 0,
    quickDistance = 0;
  for (let i = 0; i < 120; i++) {
    driveVelocity(slow, 0, 0, speed, sluggish.acceleration, sluggish.braking, 0, step);
    driveVelocity(quick, 0, 0, speed, crisp.acceleration, crisp.braking, 0, step);
    slowDistance += slow.vx * step;
    quickDistance += quick.vx * step;
  }
  assert.ok(slowDistance > quickDistance);
  assert.equal(slow.vx, 0);
  assert.equal(quick.vx, 0);
});

test('walls stop motion and heading changes are bounded', () => {
  const far = FIELD_SIZE - ROBOT_MARGIN;
  const robot = { ...body(), x: far - 1, vx: 220, vy: 100, angle: Math.PI };
  moveBody(robot, step);
  assert.equal(robot.x, far);
  assert.equal(robot.vx, 0);
  assert.ok(Math.abs(robot.angle - Math.PI) <= 7 / 60 + 1e-9);

  const corner = { ...body(), x: ROBOT_MARGIN + 1, y: 1, vx: -400, vy: -400 };
  moveBody(corner, step);
  assert.equal(corner.x, ROBOT_MARGIN);
  assert.equal(corner.y, ROBOT_MARGIN);
});

test('the field is a square of six by six mats', () => {
  assert.equal(TILES, 6);
  assert.equal(FIELD_SIZE, TILES * TILE);
  // Every ARTIFACT starts on the mats and clear of the center structure.
  for (const [x, y] of pieceLayout) {
    assert.ok(x > BALL_MARGIN && x < FIELD_SIZE - BALL_MARGIN, `x ${x}`);
    assert.ok(y > BALL_MARGIN && y < FIELD_SIZE - BALL_MARGIN, `y ${y}`);
    const gap = Math.hypot(x - CENTER_STRUCTURE.x, y - CENTER_STRUCTURE.y);
    assert.ok(gap > CENTER_STRUCTURE.radius + 14, `piece at ${x},${y} overlaps center`);
  }
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
