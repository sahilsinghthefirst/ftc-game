// Scout-7's steering. Kept apart from the match loop so it can be simulated
// headlessly: the bot used to drive straight at whatever it wanted, which left
// it grinding against whatever stood in the way.
//
// The only solid things on the mats are the base bars of the HIVE frame, so
// every obstacle here is a bar: a line with some thickness either side.

import {
  barContact,
  FIELD_SIZE,
  FRAME_BARS,
  ROBOT_MARGIN,
  type Bar,
} from './field.ts';

// How far a robot's center stays off a solid object, matching the collision
// response in `resolveObstacle`.
export const ROBOT_CLEARANCE = 29;

// Solid things a robot has to drive around, with the clearance already
// folded into their thickness.
export const BOT_OBSTACLES: Bar[] = FRAME_BARS.map((bar) => ({
  ...bar,
  r: bar.r + ROBOT_CLEARANCE,
}));

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

const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// How close the run from p to q comes to a bar, not counting where it starts:
// a bot pulling away from a bar it is touching is not blocked by it.
function pathGap(p: Point, q: Point, bar: Bar) {
  // Sampled along the run, which is exact enough for steering and far simpler
  // than the closed form; the bar's two ends are checked exactly below.
  const start = barContact(bar, p.x, p.y).gap;
  let best = Infinity;
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    const contact = barContact(
      bar,
      p.x + (q.x - p.x) * t,
      p.y + (q.y - p.y) * t,
    );
    best = Math.min(best, contact.gap);
  }
  if (best >= start - 0.5) return Infinity;
  for (const end of [
    { x: bar.ax, y: bar.ay },
    { x: bar.bx, y: bar.by },
  ]) {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const span = dx * dx + dy * dy;
    const t =
      span > 0
        ? Math.max(
            0,
            Math.min(1, ((end.x - p.x) * dx + (end.y - p.y) * dy) / span),
          )
        : 0;
    best = Math.min(
      best,
      Math.hypot(end.x - (p.x + dx * t), end.y - (p.y + dy * t)) - bar.r,
    );
  }
  return best;
}

// The obstacle the bot would hit first on a straight run at its target, if any.
function blockingObstacle(bot: Driver, target: Point) {
  let closest = null as Bar | null;
  let closestRange = Infinity;
  for (const obstacle of BOT_OBSTACLES) {
    // A target inside an obstacle is reached by driving up against it, so
    // that obstacle is not something to steer round.
    if (barContact(obstacle, target.x, target.y).gap <= 4) continue;
    if (pathGap(bot, target, obstacle) > 12) continue;
    const contact = barContact(obstacle, bot.x, bot.y);
    if (contact.gap < closestRange) {
      closest = obstacle;
      closestRange = contact.gap;
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
  for (const obstacle of BOT_OBSTACLES)
    if (barContact(obstacle, lookX, lookY).gap < 10) score -= 1.4;
  return score;
}

// Steer wide of a bar by aiming just past the edge of its shadow: the bar as
// seen from the bot spans the views of its two rounded ends, so the edges are
// the outermost tangents to those.
function steerAround(bot: Driver, bar: Bar, side: number) {
  const middle = Math.atan2(
    (bar.ay + bar.by) / 2 - bot.y,
    (bar.ax + bar.bx) / 2 - bot.x,
  );
  let low = Infinity;
  let high = -Infinity;
  for (const end of [
    { x: bar.ax, y: bar.ay },
    { x: bar.bx, y: bar.by },
  ]) {
    const range = Math.max(Math.hypot(end.x - bot.x, end.y - bot.y), bar.r + 1);
    const half = Math.asin(Math.min(1, bar.r / range));
    const toward = turn(Math.atan2(end.y - bot.y, end.x - bot.x) - middle);
    low = Math.min(low, toward - half);
    high = Math.max(high, toward + half);
  }
  const angle = middle + (side > 0 ? high + 0.14 : low - 0.14);
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
  // A target inside something solid is reached as soon as the bot is up
  // against it. Pressing on would only read as being stuck and send it
  // reversing away from where it meant to be.
  const home = BOT_OBSTACLES.find(
    (obstacle) => barContact(obstacle, target.x, target.y).gap <= 4,
  );
  const docked = home !== undefined && barContact(home, bot.x, bot.y).gap <= 6;
  if (range <= 7 || docked) {
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
  const obstacle = blockingObstacle(bot, target);
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
  // against a bar or the perimeter still reads full speed while going nowhere,
  // which is exactly the case that used to strand it.
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
    let away = { x: 0, y: 0 };
    let nearestGap = Infinity;
    for (const candidate of BOT_OBSTACLES) {
      const contact = barContact(candidate, bot.x, bot.y);
      if (contact.gap < nearestGap) {
        nearestGap = contact.gap;
        away = normalize(bot.x - contact.x, bot.y - contact.y);
      }
    }
    // Nothing solid nearby: it is the perimeter, so head for open mats.
    if (nearestGap > 40)
      away = normalize(FIELD_SIZE / 2 - bot.x, FIELD_SIZE / 2 - bot.y);
    mind.recover = RECOVER_FOR;
    mind.recoverX = away.x;
    mind.recoverY = away.y;
    return away;
  }
  return heading;
}
