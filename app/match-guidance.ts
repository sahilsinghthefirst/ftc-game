// Explicit extension so `node --test` can load this module directly.
import { BLUE_BASE, BLUE_GOAL } from './field.ts';
import type { World } from './game-arena';

type GuidanceWorld = Pick<World, 'player' | 'pieces' | 'time'>;

// Slots in each storage module. A green fills one; a big purple fills two,
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
  // A sorter that only swallows the big purples. They are worth 1.5 each
  // toward a tip, so it fills a GOAL fastest - as long as you ignore green.
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

// Extra GOAL range a scoring tool adds on top of whatever the lift can reach.
// The flywheel launches, so it can load from well outside the lift's range.
export function scoreReachBonus(score: string) {
  return score === 'flywheel' ? 60 : 0;
}

// The four lifts trade reach against speed. The taller and heavier the lift,
// the further out it can load the GOAL from - and the slower the whole robot
// drives for carrying it. Listed shortest reach, fastest robot first.
export const REACH_ORDER = ['swingarm', 'elevator', 'turret', 'cascade'];

export function reachProfile(reach: string) {
  if (reach === 'swingarm') return { radius: 85, topSpeed: 1.12 };
  if (reach === 'turret') return { radius: 170, topSpeed: 0.9 };
  if (reach === 'cascade') return { radius: 220, topSpeed: 0.8 };
  return { radius: 125, topSpeed: 1 };
}

// How close to the GOAL a robot has to be to load it: whatever the lift can
// reach, plus anything the scoring tool adds. The match and the range ring on
// the field both read this, so what players see is what counts.
export function scoreReach(reach: string, score: string) {
  return reachProfile(reach).radius + scoreReachBonus(score);
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

  const candidates = world.pieces
    .filter((piece) => piece.active)
    .sort(
      (a, b) =>
        Math.hypot(a.x - world.player.x, a.y - world.player.y) -
        Math.hypot(b.x - world.player.x, b.y - world.player.y),
    );
  const carried = world.player.carried;
  // A big purple will not fit in the last free slot of most storage, and a
  // sorting collector will not touch the wrong colour at all, so only count
  // ARTIFACTS the robot could actually pick up.
  const reachable = candidates.filter(
    (piece) =>
      canCarry(carried, piece.color, selected.carry) &&
      collectorTakes(selected.collect, piece.color),
  );
  if (carried.length > 0) {
    return { kind: 'goal' as const, x: BLUE_GOAL.x, y: BLUE_GOAL.y };
  }

  const piece = reachable[0] ?? candidates[0];
  return piece ? { ...piece, kind: 'piece' as const } : undefined;
}

// An ARTIFACT in the GOAL is worth nothing by itself. Load the GOAL to just
// under half of everything the field holds and it tips over: that scores, and
// everything inside spills back onto the mats.
export const TIP_POINTS = 20;

// The purple ARTIFACTS are the big ones. They tip a GOAL faster, but they eat
// two slots in most storage - only the Low Rider Hopper's open bin takes one
// whole, which is what makes that module worth its small capacity.
export const PURPLE_TIP_VALUE = 1.5;
export const BIG_ARTIFACT_STORAGE = 'lowbin';

export function tipValue(color: string) {
  return color === 'P' ? PURPLE_TIP_VALUE : 1;
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

// What a GOAL has to be loaded with before it tips. A flat number rather than
// a share of the field, so adding ARTIFACTS to the mats makes tipping easier
// rather than moving the bar with them.
export const GOAL_TIP_AT = 10;

export function goalTips(load: number) {
  return load >= GOAL_TIP_AT;
}
