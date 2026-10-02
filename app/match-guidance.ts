// Explicit extension so `node --test` can load this module directly.
import {
  BLUE_BASE,
  cellMouth,
  FIELD_CENTER,
  LOAD_FRONT,
  loadingSpot,
  type Alliance,
  type CellEnd,
} from './field.ts';
import type { World } from './game-arena';

type GuidanceWorld = Pick<World, 'player' | 'pieces' | 'time' | 'hives'>;

// Whether a robot can load an alliance's upward CELL from where it stands: out
// in front of the CELL's open end, and within reach of its mouth. The opening
// faces outward, so nothing goes in from underneath the HIVE or from behind.
export function inLoadingRange(
  robot: { x: number; y: number },
  alliance: Alliance,
  end: CellEnd,
  reach: number,
) {
  const mouth = cellMouth(alliance, end);
  return (
    (robot.y - FIELD_CENTER) * end >= LOAD_FRONT &&
    Math.hypot(robot.x - mouth.x, robot.y - mouth.y) <= reach
  );
}

// How the upward CELL is described to the player: the follow camera always
// looks up the field, so the near CELL is the one facing the camera.
export function cellSide(end: CellEnd) {
  return end > 0 ? 'near' : 'far';
}

// Slots in each storage module. POLLEN fills one; a big NECTAR fills two,
// except in the Low Rider Hopper (see `artifactSpace`).
export function carryCapacity(module: string) {
  if (module === 'stackpack') return 6;
  return 4;
}

// Top speed on the mats for each drivetrain, before anything else on the
// robot slows it down.
export function driveSpeed(drive: string) {
  if (drive === 'orbit') return 330;
  if (drive === 'trailblazer') return 315;
  if (drive === 'comet') return 290;
  return 185;
}

// How fast each drivetrain swings its nose round, in radians per second. The
// traction base pivots hardest of all on its grippy wheels; the six-wheeler
// really does turn like a bus: its wheels have to scrub sideways to rotate, so
// it swings round roughly five times slower than the omni.
export function turnRate(drive: string) {
  if (drive === 'anchor') return 12;
  if (drive === 'orbit') return 10;
  if (drive === 'comet') return 9;
  return 2;
}

// Turning while the intake is busy swallowing an ARTIFACT is hard: the robot
// swings round at this fraction of its usual rate until the intake is clear.
export const INTAKE_TURN_FACTOR = 0.3;

export function intakeTurnRate(drive: string, intaking: boolean) {
  return turnRate(drive) * (intaking ? INTAKE_TURN_FACTOR : 1);
}

// How much push a drivetrain has sideways, as a fraction of its forward push.
// Mecanum rollers drive it in any direction at full power; omni wheels nearly
// so; traction wheels fight it; the six-wheeler has to point where it is going
// first, which is what makes its slow turn actually cost something.
export function strafeFactor(drive: string) {
  if (drive === 'comet') return 1;
  if (drive === 'orbit') return 0.85;
  if (drive === 'anchor') return 0.3;
  return 0.12;
}

// The two collectors are opposites. WideWave is a light, wide sweeper that
// takes an age over each ARTIFACT and bogs the robot down while it swallows
// one; TwinFlex is a heavy pair of rollers that inhales on contact.
export type CollectProfile = {
  // How far from the robot's center an ARTIFACT can be grabbed.
  radius: number;
  // Seconds of intake cycle before the next one can be picked up.
  cycle: number;
  // Top speed multiplier while the intake is busy, and for how long.
  drag: number;
  dragFor: number;
  // How many ARTIFACTS one grab can take, if that many are in reach.
  grab: number;
  // A collector that only handles one colour leaves the rest on the mats.
  takes?: 'P' | 'G';
  // Top speed multiplier the collector costs all the time, from its weight.
  topSpeed: number;
};

export function collectProfile(module: string): CollectProfile {
  // Heavy twin rollers: the robot is slower everywhere for carrying them.
  if (module === 'twinflex')
    return {
      radius: 58,
      cycle: 0.14,
      drag: 0.92,
      dragFor: 0.12,
      grab: 1,
      topSpeed: 0.84,
    };
  // Two jaws that close on a pair at once. Every grab is a long, slow clamp
  // that bogs the robot down, so it only pays off when two ARTIFACTS are lying
  // together - closing it on a lone one wastes most of two seconds.
  if (module === 'dualjaw')
    return {
      radius: 66,
      cycle: 1.6,
      drag: 0.4,
      dragFor: 1,
      grab: 2,
      topSpeed: 1,
    };
  // A sorter that only swallows the big NECTAR. It is worth 1.5 each toward
  // a tip, so it fills a CELL fastest - as long as you ignore POLLEN.
  if (module === 'sorter')
    return {
      radius: 86,
      cycle: 0.3,
      drag: 0.8,
      dragFor: 0.25,
      grab: 1,
      takes: 'P',
      topSpeed: 1,
    };
  return {
    radius: 95,
    cycle: 0.72,
    drag: 0.3,
    dragFor: 0.7,
    grab: 1,
    topSpeed: 1,
  };
}

// How hard a drivetrain is to shove out of the way. Six wheels of grip win a
// contest of pushing; omni rollers just slide away from it.
export function shoveResist(drive: string) {
  if (drive === 'trailblazer') return 2;
  if (drive === 'anchor') return 1.6;
  if (drive === 'comet') return 1;
  return 0.6;
}

// The four lifts trade reach against speed. The taller and heavier the lift,
// the further out it can load the HIVE from - and the slower the whole robot
// drives for carrying it. Listed shortest reach, fastest robot first.
export const REACH_ORDER = ['swingarm', 'elevator', 'turret', 'cascade'];

export function reachProfile(reach: string) {
  if (reach === 'swingarm') return { radius: 85, topSpeed: 1.12 };
  if (reach === 'turret') return { radius: 170, topSpeed: 0.9 };
  if (reach === 'cascade') return { radius: 220, topSpeed: 0.8 };
  return { radius: 125, topSpeed: 1 };
}

// How close to an upward CELL's mouth a robot has to be to load it. Only the
// lift decides this. The match and the range ring on the field both read it,
// so what players see is what counts.
export function scoreReach(reach: string) {
  return reachProfile(reach).radius;
}

// The lift sets where a robot can load from; the scoring tool sets how it
// loads once it is there. The four tools trade loading speed against how many
// go in at once, whether the robot has to stop, and whether every shot lands.
export type ScoreProfile = {
  // Seconds before the tool can load again.
  cycle: number;
  // One ARTIFACT per load, or the whole of storage at once.
  batch: 'one' | 'all';
  // Only fires with the robot (nearly) stopped.
  needsStop: boolean;
  // Chance a load bounces off the rim and rolls back onto the mats.
  miss: number;
};

// Below this speed a robot counts as stopped.
export const STOPPED_SPEED = 40;

export function scoreProfile(score: string): ScoreProfile {
  // Fastest feed of all, but it only fires from a standstill.
  if (score === 'burst')
    return { cycle: 0.15, batch: 'one', needsStop: true, miss: 0 };
  // Shoots on the move, quickly - and one shot in four bounces out.
  if (score === 'flywheel')
    return { cycle: 0.25, batch: 'one', needsStop: false, miss: 0.25 };
  // The whole load at once, from a standstill, then a long reset.
  if (score === 'tiptray')
    return { cycle: 1.1, batch: 'all', needsStop: true, miss: 0 };
  // Steady and certain: one at a time, on the move, never misses.
  return { cycle: 0.45, batch: 'one', needsStop: false, miss: 0 };
}

// Whether the scoring tool will fire right now.
export function canFire(score: string, speed: number) {
  return !scoreProfile(score).needsStop || speed < STOPPED_SPEED;
}

// Guides on the field come only from assist parts, and each one helps in its
// own part of the match: Pathfinder routes to the next ARTIFACT (and home to
// BASE at the end), Auto Align points the way to the upward CELL, and Range
// Finder rings that CELL's loading range instead. With none of those, the
// field shows no guides at all.
export function assistGuides(assist: string, kind: 'piece' | 'goal' | 'base') {
  if (assist === 'pathfinder') return kind === 'piece' || kind === 'base';
  if (assist === 'align') return kind === 'goal';
  return false;
}

// Everything that sets how fast the robot drives on the mats: the drivetrain,
// the weight of the collector and lift, and Auto Align holding it back.
export function topSpeed(selected: Record<string, string>) {
  return (
    driveSpeed(selected.drive) *
    collectProfile(selected.collect).topSpeed *
    reachProfile(selected.reach).topSpeed *
    (selected.assist === 'align' ? 0.88 : 1)
  );
}

// Whether this collector will even touch a given ARTIFACT.
export function collectorTakes(module: string, color: string) {
  const takes = collectProfile(module).takes;
  return !takes || takes === color;
}

export function playerTarget(
  world: GuidanceWorld,
  selected: Record<string, string>,
) {
  if (world.time <= 10)
    return { kind: 'base' as const, x: BLUE_BASE.x, y: BLUE_BASE.y };

  // Only what this alliance may take: POLLEN, and blue NECTAR.
  const candidates = world.pieces
    .filter((piece) => piece.active && mayCollect(piece, 'blue'))
    .sort(
      (a, b) =>
        Math.hypot(a.x - world.player.x, a.y - world.player.y) -
        Math.hypot(b.x - world.player.x, b.y - world.player.y),
    );
  const carried = world.player.carried;
  // A big NECTAR will not fit in the last free slot of most storage, and a
  // sorting collector will not touch POLLEN at all, so only count ARTIFACTS
  // the robot could actually pick up.
  const reachable = candidates.filter(
    (piece) =>
      canCarry(carried, piece.color, selected.carry) &&
      collectorTakes(selected.collect, piece.color),
  );
  if (carried.length > 0) {
    // In front of whichever CELL is facing up right now.
    return {
      kind: 'goal' as const,
      ...loadingSpot('blue', world.hives.blue.up),
    };
  }

  const piece = reachable[0] ?? candidates[0];
  return piece ? { ...piece, kind: 'piece' as const } : undefined;
}

// An ARTIFACT in a CELL is worth nothing by itself. Load the upward CELL until
// it is heavy enough and the HIVE tips over, as in BIOBUZZ: that scores, the
// CELL swings down and pours everything it held out onto the mats on its side,
// and the other CELL swings up to be loaded next - from the other side.
export const TIP_POINTS = 20;

// NECTAR ('P') are the big ARTIFACTS. They tip a HIVE faster, but they eat
// two slots in most storage - only the Low Rider Hopper's open bin takes one
// whole, which is what makes that module worth its small capacity. POLLEN
// ('G') are the small yellow ones.
export const NECTAR_TIP_VALUE = 1.5;
export const BIG_ARTIFACT_STORAGE = 'lowbin';

export function tipValue(color: string) {
  return color === 'P' ? NECTAR_TIP_VALUE : 1;
}

// As in BIOBUZZ, NECTAR comes in alliance colours and a robot may only pick
// up its own alliance's; POLLEN is anyone's.
export function mayCollect(
  piece: { color: string; alliance?: Alliance },
  alliance: Alliance,
) {
  return piece.color !== 'P' || piece.alliance === alliance;
}

export function fieldTipValue(pieces: { color: string }[]) {
  return pieces.reduce((total, piece) => total + tipValue(piece.color), 0);
}

export function artifactSpace(color: string, carry: string) {
  return color === 'P' && carry !== BIG_ARTIFACT_STORAGE ? 2 : 1;
}

export function usedSpace(carried: string[], carry: string) {
  return carried.reduce(
    (total, color) => total + artifactSpace(color, carry),
    0,
  );
}

export function canCarry(carried: string[], color: string, carry: string) {
  return (
    usedSpace(carried, carry) + artifactSpace(color, carry) <=
    carryCapacity(carry)
  );
}

// What an upward CELL has to be loaded with before its HIVE tips. A flat
// number rather than a share of the field, so adding ARTIFACTS to the mats
// makes tipping easier rather than moving the bar with them. The NECTAR a
// CELL starts the match holding counts toward it too.
export const GOAL_TIP_AT = 10;

export function goalTips(load: number) {
  return load >= GOAL_TIP_AT;
}
