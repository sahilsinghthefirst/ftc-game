// Scout-7's steering. Kept apart from the match loop so it can be simulated
// headlessly: the bot used to drive straight at whatever it wanted, which left
// it grinding against a GOAL, a wall or the center structure whenever one of
// them sat in the way.

import {
  BLUE_GOAL,
  CENTER_STRUCTURE,
  FIELD_SIZE,
  GOAL_RADIUS,
  RED_GOAL,
  ROBOT_MARGIN,
} from './field.ts';

// How far a robot's center stays off a solid object, matching the collision
// response in `resolveObstacle`.
export const ROBOT_CLEARANCE = 29;

// Solid round things a robot has to drive around, with the clearance already
// folded in.
export const BOT_OBSTACLES = [
  {
    x: CENTER_STRUCTURE.x,
    y: CENTER_STRUCTURE.y,
    r: CENTER_STRUCTURE.radius + ROBOT_CLEARANCE,
  },
  { x: BLUE_GOAL.x, y: BLUE_GOAL.y, r: GOAL_RADIUS + ROBOT_CLEARANCE },
  { x: RED_GOAL.x, y: RED_GOAL.y, r: GOAL_RADIUS + ROBOT_CLEARANCE },
];

export type BotMind = {
  // Which way round the obstacle it committed to, so it stops dithering.
  dodge: number;
  // Seconds spent trying to move without actually going anywhere.
  stuck: number;
  // Where it was last step, to tell driving from grinding.
  lastX: number;
  lastY: number;
  // Seconds left of a shove-off maneuver, and the way it is shoving.
  recover: number;
  recoverX: number;
  recoverY: number;
};

export function createBotMind(): BotMind {
  return {
    dodge: 0,
    stuck: 0,
    lastX: Infinity,
    lastY: Infinity,
    recover: 0,
    recoverX: 0,
    recoverY: 0,
  };
}

type Point = { x: number; y: number };
type Driver = { x: number; y: number; vx: number; vy: number };

const WALL_PAD = 64;
const STUCK_AFTER = 0.7;
const RECOVER_FOR = 0.55;

function normalize(x: number, y: number) {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length } : { x: 1, y: 0 };
}

// The obstacle the bot would hit first on a straight run at its target, if any.
function blockingObstacle(
  bot: Driver,
  target: Point,
  heading: Point,
  range: number,
) {
  let closest = null as (typeof BOT_OBSTACLES)[number] | null;
  let closestAhead = Infinity;
  for (const obstacle of BOT_OBSTACLES) {
    // Never dodge the thing we are driving to - the GOALS are obstacles, and
    // the bot's whole job is to get to one of them. Only the object the target
    // actually sits inside counts, or a target merely parked near a GOAL would
    // switch avoidance off and the bot would grind along its wall.
    const reach = Math.hypot(target.x - obstacle.x, target.y - obstacle.y);
    if (reach <= obstacle.r + 4) continue;
    const ox = obstacle.x - bot.x;
    const oy = obstacle.y - bot.y;
    const ahead = ox * heading.x + oy * heading.y;
    // Behind us, or further off than the target: not in the way.
    if (ahead <= 0 || ahead - obstacle.r > range) continue;
    const offset = Math.abs(ox * heading.y - oy * heading.x);
    if (offset > obstacle.r + 12) continue;
    if (ahead < closestAhead) {
      closest = obstacle;
      closestAhead = ahead;
    }
  }
  return closest;
}

// How usable a way round is: mostly "does it still point at the target", with
// a heavy penalty for steering into the perimeter or into another obstacle.
function sideScore(bot: Driver, direct: Point, heading: Point) {
  const lookX = bot.x + heading.x * 150;
  const lookY = bot.y + heading.y * 150;
  let score = heading.x * direct.x + heading.y * direct.y;
  const near = ROBOT_MARGIN + 10;
  if (lookX < near || lookX > FIELD_SIZE - near) score -= 1.4;
  if (lookY < near || lookY > FIELD_SIZE - near) score -= 1.4;
  for (const obstacle of BOT_OBSTACLES) {
    if (Math.hypot(lookX - obstacle.x, lookY - obstacle.y) < obstacle.r + 10)
      score -= 1.4;
  }
  return score;
}

// Steer wide of an obstacle by aiming at the edge of its shadow rather than
// straight through it.
function steerAround(
  bot: Driver,
  obstacle: Point & { r: number },
  side: number,
) {
  const ox = obstacle.x - bot.x;
  const oy = obstacle.y - bot.y;
  const range = Math.max(Math.hypot(ox, oy), obstacle.r + 1);
  const halfWidth = Math.asin(Math.min(1, obstacle.r / range));
  const angle = Math.atan2(oy, ox) + side * (halfWidth + 0.14);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

// Keep the bot from pressing itself flat against the perimeter, which used to
// pin it in corners: drop whatever part of the heading points into a near wall.
function slideAlongWalls(bot: Driver, heading: Point) {
  let { x, y } = heading;
  const near = ROBOT_MARGIN + WALL_PAD;
  const far = FIELD_SIZE - near;
  if (bot.x < near && x < 0) x *= 0.08;
  if (bot.x > far && x > 0) x *= 0.08;
  if (bot.y < near && y < 0) y *= 0.08;
  if (bot.y > far && y > 0) y *= 0.08;
  return normalize(x, y);
}

// The direction Scout-7 should drive this step. Returns a unit vector, or a
// zero vector when it has arrived and should coast.
export function botHeading(
  bot: Driver,
  target: Point,
  mind: BotMind,
  dt: number,
): Point {
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const range = Math.hypot(dx, dy);
  if (range <= 7) {
    mind.stuck = 0;
    mind.dodge = 0;
    return { x: 0, y: 0 };
  }

  // Mid shove-off: hold the escape direction until it expires.
  if (mind.recover > 0) {
    mind.recover -= dt;
    return { x: mind.recoverX, y: mind.recoverY };
  }

  const direct = normalize(dx, dy);
  const obstacle = blockingObstacle(bot, target, direct, range);
  let heading = direct;
  if (obstacle) {
    // Commit to one way round and keep it until the path is clear, so the bot
    // cannot flip sides every frame and stall in front of the obstacle. The
    // side is whichever keeps it off the perimeter and out of other obstacles.
    if (!mind.dodge) {
      const left = sideScore(bot, direct, steerAround(bot, obstacle, -1));
      const right = sideScore(bot, direct, steerAround(bot, obstacle, 1));
      mind.dodge = right >= left ? 1 : -1;
    }
    heading = steerAround(bot, obstacle, mind.dodge);
  } else {
    mind.dodge = 0;
  }
  heading = slideAlongWalls(bot, heading);

  // Progress is measured in ground covered, not in wheel speed: a robot wedged
  // between a GOAL and the perimeter still reads full speed while going
  // nowhere, which is exactly the case that used to strand it.
  const moved = Math.hypot(bot.x - mind.lastX, bot.y - mind.lastY);
  mind.lastX = bot.x;
  mind.lastY = bot.y;
  if (moved < 0.9) mind.stuck += dt;
  else mind.stuck = Math.max(0, mind.stuck - dt * 2);
  if (mind.stuck > STUCK_AFTER) {
    mind.stuck = 0;
    // Take the other way round next time, and reverse out of the pocket by
    // backing away from whatever is nearest.
    mind.dodge = mind.dodge === 0 ? 1 : -mind.dodge;
    let nearest = BOT_OBSTACLES[0];
    let nearestGap = Infinity;
    for (const candidate of BOT_OBSTACLES) {
      const gap =
        Math.hypot(bot.x - candidate.x, bot.y - candidate.y) - candidate.r;
      if (gap < nearestGap) {
        nearest = candidate;
        nearestGap = gap;
      }
    }
    const away = normalize(bot.x - nearest.x, bot.y - nearest.y);
    mind.recover = RECOVER_FOR;
    mind.recoverX = away.x;
    mind.recoverY = away.y;
    return away;
  }
  return heading;
}
