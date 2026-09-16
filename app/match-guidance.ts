import type { World } from './game-arena';

type GuidanceWorld = Pick<
  World,
  'player' | 'pieces' | 'playerSequence' | 'time'
>;
type TimerWorld = Pick<World, 'time' | 'pieces' | 'finished'>;

export function carryCapacity(module: string) {
  return module === 'stackpack' ? 5 : module === 'lowbin' ? 3 : 2;
}

export function playerTarget(
  world: GuidanceWorld,
  selected: Record<string, string>,
) {
  if (world.time <= 10) return { kind: 'base' as const, x: 118, y: 552 };

  const candidates = world.pieces
    .filter((piece) => piece.active)
    .sort(
      (a, b) =>
        Math.hypot(a.x - world.player.x, a.y - world.player.y) -
        Math.hypot(b.x - world.player.x, b.y - world.player.y),
    );
  const carried = world.player.carried.length;
  const colorEye = selected.assist === 'coloreye';
  if (
    carried > 0 &&
    (!colorEye ||
      carried >= carryCapacity(selected.carry) ||
      candidates.length === 0)
  ) {
    return { kind: 'goal' as const, x: 95, y: 108 };
  }

  const expected = ['P', 'G', 'P'][(world.playerSequence + carried) % 3];
  const piece = colorEye
    ? (candidates.find((candidate) => candidate.color === expected) ??
      candidates[0])
    : candidates[0];
  return piece ? { ...piece, kind: 'piece' as const } : undefined;
}

export function canSkipToEndgame(world: TimerWorld) {
  return (
    !world.finished &&
    world.time > 15 &&
    world.pieces.every((piece) => !piece.active)
  );
}

export function skipToEndgame(world: TimerWorld) {
  if (!canSkipToEndgame(world)) return false;
  world.time = 15;
  return true;
}
