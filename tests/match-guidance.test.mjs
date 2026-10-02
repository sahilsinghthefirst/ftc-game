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
  inLoadingRange,
  mayCollect,
  playerTarget,
  GOAL_TIP_AT,
  TIP_POINTS,
} from '../app/match-guidance.ts';
import {
  CELL_PRELOAD,
  cellMouth,
  FIELD_CENTER,
  FIELD_SIZE,
  HIVE_START_UP,
  HIVE_X,
  LOAD_FRONT,
  loadingSpot,
  pieceLayout,
} from '../app/field.ts';

const loadout = { carry: 'lowbin', collect: 'widewave', assist: 'range' };
function world() {
  return {
    player: { x: 0, y: 0, carried: ['P'] },
    bot: { carried: ['G'] },
    pieces: [
      { id: 0, x: 10, y: 0, color: 'P', alliance: 'blue', active: true },
      { id: 1, x: 30, y: 0, color: 'G', active: true },
    ],
    hives: {
      blue: { up: 1, load: 0, tips: 0 },
      red: { up: 1, load: 0, tips: 0 },
    },
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

test('A NectarSort robot is guided past POLLEN to its NECTAR', () => {
  const state = world();
  state.player.carried = [];
  // The POLLEN is nearer, but the sorter would drive straight over it.
  state.pieces[0].color = 'G';
  delete state.pieces[0].alliance;
  state.pieces[1].color = 'P';
  state.pieces[1].alliance = 'blue';
  const target = playerTarget(state, { ...loadout, collect: 'sorter' });
  assert.equal(target.color, 'P');
});

test('Anything on board sends the robot to the HIVE, or nowhere once empty', () => {
  const state = world();
  assert.equal(playerTarget(state, loadout).kind, 'goal');
  state.pieces.forEach((piece) => (piece.active = false));
  assert.equal(playerTarget(state, loadout).kind, 'goal');
  state.player.carried = [];
  assert.equal(playerTarget(state, loadout), undefined);
});

test('The guide leads to whichever CELL is up, and switches sides when it tips', () => {
  const state = world();
  const near = playerTarget(state, loadout);
  assert.deepEqual({ x: near.x, y: near.y }, loadingSpot('blue', 1));
  assert.ok(
    near.y > FIELD_CENTER,
    'the near CELL is loaded from the near side',
  );
  state.hives.blue.up = -1;
  const far = playerTarget(state, loadout);
  assert.deepEqual({ x: far.x, y: far.y }, loadingSpot('blue', -1));
  assert.ok(far.y < FIELD_CENTER, 'the far CELL is loaded from the far side');
  // Lined up on its own HIVE, not the middle or the red one.
  assert.equal(far.x, HIVE_X.blue);
  // The loading spot itself is in range of even the shortest lift.
  for (const end of [1, -1])
    assert.ok(inLoadingRange(loadingSpot('blue', end), 'blue', end, 85));
});

test('An upward CELL only loads from out in front of its open end', () => {
  const mouth = cellMouth('blue', 1);
  const reach = 220;
  // Straight out in front: yes.
  assert.ok(inLoadingRange({ x: mouth.x, y: mouth.y + 60 }, 'blue', 1, reach));
  // Under the HIVE, right beneath the mouth: no.
  assert.ok(!inLoadingRange({ x: mouth.x, y: mouth.y }, 'blue', 1, reach));
  // From behind, on the far side of the HIVE: no, however long the reach.
  assert.ok(
    !inLoadingRange(
      { x: mouth.x, y: FIELD_CENTER - LOAD_FRONT - 20 },
      'blue',
      1,
      999,
    ),
  );
  // Out in front but beyond the lift's reach: no.
  assert.ok(
    !inLoadingRange({ x: mouth.x, y: mouth.y + reach + 30 }, 'blue', 1, reach),
  );
  // The front line is where it says.
  assert.ok(
    inLoadingRange(
      { x: mouth.x, y: FIELD_CENTER + LOAD_FRONT + 0.01 },
      'blue',
      1,
      reach,
    ),
  );
  assert.ok(
    !inLoadingRange(
      { x: mouth.x, y: FIELD_CENTER + LOAD_FRONT - 1 },
      'blue',
      1,
      reach,
    ),
  );
});

test('Each HIVE starts with its near CELL up, already holding three NECTAR', () => {
  assert.equal(HIVE_START_UP, 1);
  assert.equal(CELL_PRELOAD, 3);
  // Three NECTAR are worth 4.5 of the 10 a tip needs.
  assert.equal(CELL_PRELOAD * tipValue('P'), 4.5);
  assert.ok(!goalTips(CELL_PRELOAD * tipValue('P')));
});

test('Other assist modes retain their current HIVE guidance', () => {
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
  // Reachable both ways: seven NECTAR clear it, so do ten POLLEN.
  const nectar = Array(7)
    .fill('P')
    .reduce((t, c) => t + tipValue(c), 0);
  const yellows = Array(10)
    .fill('G')
    .reduce((t, c) => t + tipValue(c), 0);
  assert.ok(nectar >= GOAL_TIP_AT);
  assert.ok(yellows >= GOAL_TIP_AT);
  // And the field holds far more than one GOAL needs, so a tip is never the
  // last thing that can happen in a match.
  assert.ok(
    fieldTipValue(pieceLayout.map(([, , c]) => ({ color: c }))) >
      GOAL_TIP_AT * 2,
  );
});

test('NECTAR is worth more but eats more storage', () => {
  assert.equal(tipValue('P'), 1.5);
  assert.equal(tipValue('G'), 1);

  // Two slots in ordinary storage, one in the Low Rider Hopper.
  assert.equal(artifactSpace('P', 'stackpack'), 2);
  assert.equal(artifactSpace('P', BIG_ARTIFACT_STORAGE), 1);
  assert.equal(artifactSpace('G', 'stackpack'), 1);
  assert.equal(artifactSpace('G', BIG_ARTIFACT_STORAGE), 1);

  // The four-slot indexer takes two NECTAR, or one and two POLLEN.
  assert.equal(carryCapacity('pocket'), 4);
  assert.equal(canCarry(['P'], 'P', 'pocket'), true);
  assert.equal(canCarry(['P', 'P'], 'G', 'pocket'), false);
  assert.equal(canCarry(['P', 'G'], 'G', 'pocket'), true);
  assert.equal(canCarry(['P', 'G'], 'P', 'pocket'), false);

  // The hopper's four slots take four NECTAR - 6 toward a tip in one trip -
  // while the six-slot magazine only manages three, 4.5.
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
  assert.ok(hopperTrip > magazineTrip, 'the hopper should win on NECTAR');
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

test('each alliance may only take its own NECTAR, and anyone POLLEN', () => {
  const blue = { color: 'P', alliance: 'blue' };
  const red = { color: 'P', alliance: 'red' };
  const pollen = { color: 'G' };
  assert.equal(mayCollect(blue, 'blue'), true);
  assert.equal(mayCollect(red, 'blue'), false);
  assert.equal(mayCollect(red, 'red'), true);
  assert.equal(mayCollect(blue, 'red'), false);
  assert.equal(mayCollect(pollen, 'blue'), true);
  assert.equal(mayCollect(pollen, 'red'), true);
});

test('the blue robot is never guided to red NECTAR, however close', () => {
  const state = world();
  state.player.carried = [];
  state.pieces[0].alliance = 'red';
  // The red NECTAR is nearest; the guide skips it for the POLLEN.
  assert.equal(playerTarget(state, loadout).id, 1);
  // With only red NECTAR left there is nothing to guide to.
  state.pieces[1].active = false;
  assert.equal(playerTarget(state, loadout), undefined);
});

test('the field starts fair: mirrored NECTAR for each alliance, mirrored POLLEN', () => {
  const nectar = pieceLayout.filter(([, , color]) => color === 'P');
  const blue = nectar.filter(([, , , alliance]) => alliance === 'blue');
  const red = nectar.filter(([, , , alliance]) => alliance === 'red');
  assert.equal(blue.length, red.length);
  assert.equal(blue.length + red.length, nectar.length);
  // Every blue NECTAR has a red twin mirrored across the field.
  for (const [x, y] of blue)
    assert.ok(
      red.some(
        ([rx, ry]) => Math.abs(rx - (FIELD_SIZE - x)) < 1e-6 && ry === y,
      ),
      `no red twin for ${x},${y}`,
    );
  // POLLEN is mirrored too (the centre line mirrors onto itself).
  const pollen = pieceLayout.filter(([, , color]) => color === 'G');
  for (const [x, y] of pollen)
    assert.ok(
      pollen.some(
        ([px, py]) => Math.abs(px - (FIELD_SIZE - x)) < 1e-6 && py === y,
      ),
      `no mirrored POLLEN for ${x},${y}`,
    );
  // POLLEN belongs to nobody.
  assert.ok(pollen.every(([, , , alliance]) => alliance === undefined));
});
