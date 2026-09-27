// Explicit extension so `node --test` can load this module directly.
import { BLUE_BASE, BLUE_GOAL } from './field.ts';
import type { World } from './game-arena';

type GuidanceWorld = Pick<World, 'player' | 'pieces' | 'time'>;

export function carryCapacity(module: string) {
  if (module === 'stackpack') return 7;
  if (module === 'lowbin') return 4;
  if (module === 'beltbridge') return 3;
  return 2;
}

// How fast each drivetrain swings its nose round, in radians per second. The
// six-wheeler really does turn like a bus: its wheels have to scrub sideways
// to rotate, so it swings round roughly five times slower than the omni, which
// just spins its rollers.
export function turnRate(drive: string) {
  if (drive === 'orbit') return 10;
  if (drive === 'comet') return 9;
  if (drive === 'anchor') return 6.5;
  return 2;
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
};

export function collectProfile(module: string): CollectProfile {
  if (module === 'twinflex')
    return { radius: 58, cycle: 0.14, drag: 0.92, dragFor: 0.12, grab: 1 };
  // Two jaws that close on a pair at once - slow, but it fills storage in half
  // the trips when ARTIFACTS are lying together.
  if (module === 'dualjaw')
    return { radius: 66, cycle: 0.62, drag: 0.6, dragFor: 0.45, grab: 2 };
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
    };
  return { radius: 95, cycle: 0.85, drag: 0.3, dragFor: 0.7, grab: 1 };
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

// Storage that feeds the scorer directly cuts the pause between loads.
export function reloadFactor(carry: string) {
  return carry === 'beltbridge' ? 0.7 : 1;
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
  const colorEye = selected.assist === 'coloreye';
  // A big purple will not fit in the last free slot of most storage, and a
  // sorting collector will not touch the wrong colour at all, so only count
  // ARTIFACTS the robot could actually pick up.
  const reachable = candidates.filter(
    (piece) =>
      canCarry(carried, piece.color, selected.carry) &&
      collectorTakes(selected.collect, piece.color),
  );
  if (carried.length > 0 && (!colorEye || reachable.length === 0)) {
    return { kind: 'goal' as const, x: BLUE_GOAL.x, y: BLUE_GOAL.y };
  }

  // Color Eye no longer sorts by colour - there is no pattern to chase - but it
  // still keeps the robot collecting until its storage is full.
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
