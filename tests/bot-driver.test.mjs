import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_OBSTACLES, botHeading, createBotMind } from '../app/bot-driver.ts';
import { moveBody, resolveObstacle } from '../app/robot-physics.ts';
import { FIELD_SIZE, RED_GOAL, ROBOT_MARGIN } from '../app/field.ts';

const STEP = 1 / 60;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Drive Scout-7 at a target exactly the way the match loop does, and report
// whether it ever arrives.
function driveTo(start, target, limit = 12) {
  const bot = { x: start.x, y: start.y, vx: 0, vy: 0, angle: 0 };
  const mind = createBotMind();
  for (let t = 0; t < limit; t += STEP) {
    const heading = botHeading(bot, target, mind, STEP);
    if (heading.x === 0 && heading.y === 0) return t;
    const angle = Math.atan2(heading.y, heading.x);
    bot.vx += clamp(Math.cos(angle) * 205 - bot.vx, -660 * STEP, 660 * STEP);
    bot.vy += clamp(Math.sin(angle) * 205 - bot.vy, -660 * STEP, 660 * STEP);
    moveBody(bot, STEP);
    resolveObstacle(bot);
    if (Math.hypot(target.x - bot.x, target.y - bot.y) <= 7) return t;
  }
  return null;
}

const clearOfObstacles = (point) =>
  BOT_OBSTACLES.every(
    (o) => Math.hypot(point.x - o.x, point.y - o.y) > o.r + 10,
  );

test('Scout-7 drives around every obstacle instead of grinding on it', () => {
  for (const obstacle of BOT_OBSTACLES) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const reach = obstacle.r + 120;
      const edge = ROBOT_MARGIN + 6;
      const far = FIELD_SIZE - edge;
      const start = {
        x: clamp(obstacle.x + Math.cos(angle) * reach, edge, far),
        y: clamp(obstacle.y + Math.sin(angle) * reach, edge, far),
      };
      const target = {
        x: clamp(obstacle.x - Math.cos(angle) * reach, edge, far),
        y: clamp(obstacle.y - Math.sin(angle) * reach, edge, far),
      };
      // Skip geometry no robot could reach: inside a solid object.
      if (!clearOfObstacles(start) || !clearOfObstacles(target)) continue;
      assert.ok(
        driveTo(start, target) !== null,
        `stuck going (${start.x.toFixed(0)},${start.y.toFixed(0)}) -> (${target.x.toFixed(0)},${target.y.toFixed(0)})`,
      );
    }
  }
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

test('Scout-7 still drives straight into its own GOAL to score', () => {
  // The GOALS are obstacles, so the bot must not treat the one it is aiming
  // for as something to steer around. Start clear of the center structure.
  const start = { x: RED_GOAL.x - 250, y: RED_GOAL.y + 120 };
  assert.ok(clearOfObstacles(start), 'test start must be on open mats');
  // It cannot reach the GOAL's center - the structure stops it - but it has to
  // close to within scoring range of 95.
  const bot = { x: start.x, y: start.y, vx: 0, vy: 0, angle: 0 };
  const mind = createBotMind();
  for (let t = 0; t < 6; t += STEP) {
    const heading = botHeading(bot, RED_GOAL, mind, STEP);
    const angle = Math.atan2(heading.y, heading.x);
    bot.vx += clamp(Math.cos(angle) * 205 - bot.vx, -660 * STEP, 660 * STEP);
    bot.vy += clamp(Math.sin(angle) * 205 - bot.vy, -660 * STEP, 660 * STEP);
    moveBody(bot, STEP);
    resolveObstacle(bot);
  }
  const gap = Math.hypot(RED_GOAL.x - bot.x, RED_GOAL.y - bot.y);
  assert.ok(
    gap < 95,
    `ended ${gap.toFixed(0)} from the GOAL, too far to score`,
  );
});
