import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_OBSTACLES, botHeading, createBotMind } from '../app/bot-driver.ts';
import { moveBody, resolveObstacle } from '../app/robot-physics.ts';
import { inLoadingRange } from '../app/match-guidance.ts';
import {
  barContact,
  FIELD_CENTER,
  FIELD_SIZE,
  FRAME_HALF_DEPTH,
  FRAME_HALF_WIDTH,
  loadingSpot,
  ROBOT_MARGIN,
} from '../app/field.ts';

const STEP = 1 / 60;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// One step of Scout-7 exactly the way the match loop drives it.
function stepToward(bot, target, mind) {
  const heading = botHeading(bot, target, mind, STEP);
  if (heading.x === 0 && heading.y === 0) {
    // Arrived: coast.
    bot.vx *= 0.7;
    bot.vy *= 0.7;
  } else {
    const angle = Math.atan2(heading.y, heading.x);
    bot.vx += clamp(Math.cos(angle) * 205 - bot.vx, -660 * STEP, 660 * STEP);
    bot.vy += clamp(Math.sin(angle) * 205 - bot.vy, -660 * STEP, 660 * STEP);
  }
  moveBody(bot, STEP);
  resolveObstacle(bot);
  return heading;
}

// Drive Scout-7 at a target and report how long it took to arrive, if it did.
function driveTo(start, target, limit = 12) {
  const bot = { x: start.x, y: start.y, vx: 0, vy: 0, angle: 0 };
  const mind = createBotMind();
  for (let t = 0; t < limit; t += STEP) {
    const heading = stepToward(bot, target, mind);
    if (heading.x === 0 && heading.y === 0) return t;
    if (Math.hypot(target.x - bot.x, target.y - bot.y) <= 7) return t;
  }
  return null;
}

const clearOfObstacles = (point) =>
  BOT_OBSTACLES.every((bar) => barContact(bar, point.x, point.y).gap > 10);

test('the only obstacles are the two A-frame base bars', () => {
  assert.equal(BOT_OBSTACLES.length, 2);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  for (const bar of BOT_OBSTACLES) {
    assert.ok(near(Math.abs(bar.ax - FIELD_CENTER), FRAME_HALF_WIDTH));
    assert.equal(bar.ax, bar.bx);
    assert.ok(near(bar.by - bar.ay, FRAME_HALF_DEPTH * 2));
  }
});

test('Scout-7 drives round the A-frames instead of grinding on them', () => {
  for (const bar of BOT_OBSTACLES) {
    // Straight across each bar, at heights all along it, both ways.
    for (const along of [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2]) {
      const y = FIELD_CENTER + along * FRAME_HALF_DEPTH;
      for (const side of [-1, 1]) {
        const start = { x: bar.ax + side * 160, y };
        const target = { x: bar.ax - side * 160, y };
        if (!clearOfObstacles(start) || !clearOfObstacles(target)) continue;
        assert.ok(
          driveTo(start, target) !== null,
          `stuck going (${start.x.toFixed(0)},${start.y.toFixed(0)}) -> (${target.x.toFixed(0)},${target.y.toFixed(0)})`,
        );
      }
    }
  }
});

test('Scout-7 can drive straight under the HIVES, between the A-frames', () => {
  const start = { x: FIELD_CENTER, y: FIELD_CENTER + 300 };
  const target = { x: FIELD_CENTER, y: FIELD_CENTER - 300 };
  const time = driveTo(start, target);
  assert.ok(time !== null, 'it never got through');
  // 600 units at 205 a second: no detour round the frame.
  assert.ok(time < 3.6, `took ${time.toFixed(1)}s, so it went round`);
});

test('Scout-7 gets out of the corners and along the walls', () => {
  const edge = ROBOT_MARGIN + 6;
  const far = FIELD_SIZE - edge;
  const runs = [
    [edge, edge, far, edge],
    [edge, edge, edge, far],
    [far, far, edge, far],
    [edge, far, far, edge],
    [edge, edge, far, far],
  ];
  for (const [sx, sy, tx, ty] of runs) {
    assert.ok(
      driveTo({ x: sx, y: sy }, { x: tx, y: ty }) !== null,
      `stuck on wall run (${sx},${sy}) -> (${tx},${ty})`,
    );
  }
});

test('Scout-7 reaches either CELL of its HIVE from anywhere and can load it', () => {
  const far = FIELD_SIZE - 60;
  const mid = FIELD_SIZE / 2;
  const starts = [
    { x: mid, y: far },
    { x: mid, y: 80 },
    { x: 150, y: 150 },
    { x: far, y: far },
    { x: far, y: mid },
    { x: 80, y: mid },
  ];
  for (const end of [1, -1]) {
    const target = loadingSpot('red', end);
    for (const start of starts) {
      const bot = { x: start.x, y: start.y, vx: 0, vy: 0, angle: 0 };
      const mind = createBotMind();
      let loading = 0;
      for (let t = 0; t < 10; t += STEP) {
        stepToward(bot, target, mind);
        if (inLoadingRange(bot, 'red', end, 95)) loading += STEP;
      }
      // Into loading range within a few seconds, and still there at the end.
      assert.ok(
        inLoadingRange(bot, 'red', end, 95),
        `from ${start.x},${start.y} to the ${end > 0 ? 'near' : 'far'} CELL it ended at ${bot.x.toFixed(0)},${bot.y.toFixed(0)}`,
      );
      assert.ok(
        loading > 4,
        `from ${start.x},${start.y} it was in range for ${loading.toFixed(1)}s`,
      );
    }
  }
});
