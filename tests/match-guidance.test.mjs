import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BIG_ARTIFACT_STORAGE,
  artifactSpace,
  canCarry,
  carryCapacity,
  collectProfile,
  fieldTipValue,
  tipValue,
  usedSpace,
  goalTips,
  playerTarget,
  GOAL_TIP_AT,
  TIP_POINTS,
} from '../app/match-guidance.ts';
import { pieceLayout } from '../app/field.ts';

const loadout = { carry: 'lowbin', collect: 'widewave', assist: 'range' };
function world() {
  return {
    player: { x: 0, y: 0, carried: ['P'] },
    bot: { carried: ['G'] },
    pieces: [
      { id: 0, x: 10, y: 0, color: 'P', active: true },
      { id: 1, x: 30, y: 0, color: 'G', active: true },
    ],
    time: 42,
    playerScore: 16,
    botScore: 8,
    finished: false,
  };
}

test('An empty robot is guided to the nearest ARTIFACT it can take', () => {
  const state = world();
  state.player.carried = [];
  assert.equal(playerTarget(state, loadout).kind, 'piece');
  assert.equal(playerTarget(state, loadout).id, 0);
  state.pieces[0].active = false;
  assert.equal(playerTarget(state, loadout).id, 1);
});

test('A PurpleSort robot is guided past yellows to a purple', () => {
  const state = world();
  state.player.carried = [];
  // The yellow is nearer, but the sorter would drive straight over it.
  state.pieces[0].color = 'G';
  state.pieces[1].color = 'P';
  const target = playerTarget(state, { ...loadout, collect: 'sorter' });
  assert.equal(target.color, 'P');
});

test('Anything on board sends the robot to the GOAL, or nowhere once empty', () => {
  const state = world();
  assert.equal(playerTarget(state, loadout).kind, 'goal');
  state.pieces.forEach((piece) => (piece.active = false));
  assert.equal(playerTarget(state, loadout).kind, 'goal');
  state.player.carried = [];
  assert.equal(playerTarget(state, loadout), undefined);
});

test('Other assist modes retain their current goal guidance', () => {
  for (const assist of ['range', 'align', 'pathfinder']) {
    assert.equal(playerTarget(world(), { ...loadout, assist }).kind, 'goal');
  }
});

test('Returning to base still takes priority in the final ten seconds', () => {
  const state = world();
  state.time = 10;
  assert.equal(playerTarget(state, loadout).kind, 'base');
});

test('The goal tips at a flat ten, whatever is lying on the mats', () => {
  assert.equal(GOAL_TIP_AT, 10);
  // Reachable both ways: seven purples clear it, so do ten yellows.
  const purples = Array(7)
    .fill('P')
    .reduce((t, c) => t + tipValue(c), 0);
  const yellows = Array(10)
    .fill('G')
    .reduce((t, c) => t + tipValue(c), 0);
  assert.ok(purples >= GOAL_TIP_AT);
  assert.ok(yellows >= GOAL_TIP_AT);
  // And the field holds far more than one GOAL needs, so a tip is never the
  // last thing that can happen in a match.
  assert.ok(
    fieldTipValue(pieceLayout.map(([, , c]) => ({ color: c }))) >
      GOAL_TIP_AT * 2,
  );
});

test('Purple ARTIFACTS are worth more but eat more storage', () => {
  assert.equal(tipValue('P'), 1.5);
  assert.equal(tipValue('G'), 1);

  // Two slots in ordinary storage, one in the Low Rider Hopper.
  assert.equal(artifactSpace('P', 'stackpack'), 2);
  assert.equal(artifactSpace('P', BIG_ARTIFACT_STORAGE), 1);
  assert.equal(artifactSpace('G', 'stackpack'), 1);
  assert.equal(artifactSpace('G', BIG_ARTIFACT_STORAGE), 1);

  // The four-slot indexer takes two purples, or a purple and two yellows.
  assert.equal(carryCapacity('pocket'), 4);
  assert.equal(canCarry(['P'], 'P', 'pocket'), true);
  assert.equal(canCarry(['P', 'P'], 'G', 'pocket'), false);
  assert.equal(canCarry(['P', 'G'], 'G', 'pocket'), true);
  assert.equal(canCarry(['P', 'G'], 'P', 'pocket'), false);

  // The hopper's four slots take four purples - 6 toward a tip in one trip -
  // while the six-slot magazine only manages three purples, 4.5.
  assert.equal(carryCapacity(BIG_ARTIFACT_STORAGE), 4);
  assert.equal(usedSpace(['P', 'P', 'P', 'P'], BIG_ARTIFACT_STORAGE), 4);
  assert.equal(canCarry(['P', 'P', 'P'], 'P', BIG_ARTIFACT_STORAGE), true);
  assert.equal(
    canCarry(['P', 'P', 'P', 'P'], 'G', BIG_ARTIFACT_STORAGE),
    false,
  );

  assert.equal(carryCapacity('stackpack'), 6);
  assert.equal(usedSpace(['P', 'P', 'P'], 'stackpack'), 6);
  assert.equal(canCarry(['P', 'P', 'P'], 'G', 'stackpack'), false);

  const hopperTrip = ['P', 'P', 'P', 'P'].reduce((t, c) => t + tipValue(c), 0);
  const magazineTrip = ['P', 'P', 'P'].reduce((t, c) => t + tipValue(c), 0);
  assert.ok(hopperTrip > magazineTrip, 'the hopper should win on purples');
});

test('The two collectors trade reach against cycle time', () => {
  const wide = collectProfile('widewave');
  const twin = collectProfile('twinflex');
  // WideWave sweeps a much bigger area but takes far longer per ARTIFACT, and
  // bogs the robot down while it swallows one.
  assert.ok(wide.radius > twin.radius * 1.5);
  assert.ok(wide.cycle > twin.cycle * 4);
  assert.ok(wide.drag < 0.5 && wide.dragFor > 0.5);
  // TwinFlex barely slows down at all.
  assert.ok(twin.drag > 0.85 && twin.dragFor < 0.2);
  // Anything unknown falls back to the wide sweeper rather than crashing.
  assert.deepEqual(collectProfile('nope'), wide);
});

test('A goal only tips once it reaches the threshold', () => {
  for (let load = 0; load < GOAL_TIP_AT; load += 0.5)
    assert.equal(goalTips(load), false, `load ${load}`);
  assert.equal(goalTips(GOAL_TIP_AT), true);
  assert.equal(goalTips(GOAL_TIP_AT + 3), true);
});

test('Tipping is the only way to score, and it is worth twenty', () => {
  assert.equal(TIP_POINTS, 20);
});
