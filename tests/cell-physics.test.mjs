import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL_INSIDE,
  enteringBall,
  GRAVITY,
  restingBall,
  stepCell,
} from '../app/cell-physics.ts';

// A CELL rests tipped 30 degrees: facing up, its back wall is its low end;
// tipped down, its open end is.
const tilt = Math.PI / 6;
const upward = {
  x: 0,
  y: -GRAVITY * Math.cos(tilt),
  z: -GRAVITY * Math.sin(tilt),
};
const downward = { ...upward, z: GRAVITY * Math.sin(tilt) };

function lcg(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

// Inside every wall of the CELL, give or take a whisker.
function inside(ball) {
  const { half, eave, peak, depth } = CELL_INSIDE;
  const slack = 0.05;
  if (ball.y < ball.r - slack) return false;
  if (Math.abs(ball.x) > half - ball.r + slack) return false;
  if (ball.z < ball.r - slack || ball.z > depth - ball.r + slack) return false;
  // Under the roof: distance from either slope.
  const slope = Math.hypot(peak - eave, half);
  const under =
    ((peak - eave) * (half - Math.abs(ball.x)) - half * (ball.y - eave)) /
    slope;
  return under >= ball.r - slack;
}

function settle(balls, gravity, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) stepCell(balls, gravity, 1 / 60);
}

test('balls loaded into an upward CELL roll to the back and settle in a pile', () => {
  const random = lcg(3);
  const balls = [0, 1, 2].map((i) => restingBall(1.8, i));
  // Ten POLLEN launched in one after another, a third of a second apart.
  for (let i = 0; i < 10; i++) {
    balls.push(enteringBall(1.4, random));
    settle(balls, upward, 0.33);
  }
  settle(balls, upward, 3);
  for (const ball of balls) {
    assert.ok(inside(ball), `ball out of the CELL at ${JSON.stringify(ball)}`);
    // At rest.
    assert.ok(Math.hypot(ball.vx, ball.vy, ball.vz) < 3, 'still rolling');
  }
  // Piled toward the back wall, not spread evenly through the CELL.
  const meanZ = balls.reduce((sum, b) => sum + b.z, 0) / balls.length;
  assert.ok(meanZ < CELL_INSIDE.depth * 0.45, `average depth ${meanZ}`);
  // Not in a grid: some have climbed onto others.
  assert.ok(
    balls.some((b) => b.y > b.r * 2.2),
    'nobody stacked',
  );
  // And none sunk into another.
  for (let i = 0; i < balls.length; i++)
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - a.r - b.r;
      assert.ok(gap > -0.25, `balls ${i} and ${j} overlap by ${-gap}`);
    }
});

test('when the CELL tips down its balls slide to the open end', () => {
  const random = lcg(9);
  const balls = [];
  for (let i = 0; i < 6; i++) balls.push(enteringBall(1.4, random));
  settle(balls, upward, 2);
  settle(balls, downward, 1.5);
  for (const ball of balls) assert.ok(inside(ball));
  const meanZ = balls.reduce((sum, b) => sum + b.z, 0) / balls.length;
  assert.ok(meanZ > CELL_INSIDE.depth * 0.6, `average depth ${meanZ}`);
});

test('a ball launched in starts at the open end, heading in', () => {
  const ball = enteringBall(1.8, lcg(4));
  assert.ok(ball.z > CELL_INSIDE.depth / 2);
  assert.ok(ball.vz < 0);
  assert.ok(Math.abs(ball.x) <= CELL_INSIDE.half - ball.r);
});
