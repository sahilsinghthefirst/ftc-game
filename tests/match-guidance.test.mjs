import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSkipToEndgame,
  carryCapacity,
  playerTarget,
  skipToEndgame,
} from '../app/match-guidance.ts';

const loadout = { carry: 'lowbin', assist: 'coloreye' };
function world() {
  return {
    player: { x: 0, y: 0, carried: ['P'] },
    bot: { carried: ['G'] },
    pieces: [
      { id: 0, x: 10, y: 0, color: 'P', active: true },
      { id: 1, x: 30, y: 0, color: 'G', active: true },
    ],
    time: 42,
    playerSequence: 0,
    playerScore: 16,
    botScore: 8,
    finished: false,
  };
}

test('Color Eye keeps collecting after one ball and accounts for queued colors', () => {
  const state = world();
  assert.equal(playerTarget(state, loadout).kind, 'piece');
  assert.equal(playerTarget(state, loadout).color, 'G');
  state.player.carried.push('G');
  assert.equal(playerTarget(state, loadout).color, 'P');
  state.playerSequence = 1;
  state.player.carried = ['G'];
  assert.equal(playerTarget(state, loadout).color, 'P');
});

test('Color Eye sends a full robot to goal for every storage capacity', () => {
  for (const carry of ['pocket', 'beltbridge', 'lowbin', 'stackpack']) {
    const state = world();
    state.player.carried = Array(carryCapacity(carry) - 1).fill('P');
    assert.equal(playerTarget(state, { ...loadout, carry }).kind, 'piece');
    state.player.carried.push('P');
    assert.equal(playerTarget(state, { ...loadout, carry }).kind, 'goal');
  }
});

test('Color Eye falls back to available colors, then scores when the field is empty', () => {
  const state = world();
  state.pieces[1].active = false;
  assert.equal(playerTarget(state, loadout).color, 'P');
  state.pieces[0].active = false;
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

test('Skip only becomes available after every field ball is collected', () => {
  const state = world();
  assert.equal(canSkipToEndgame(state), false);
  state.pieces[0].active = false;
  assert.equal(canSkipToEndgame(state), false);
  state.pieces[1].active = false;
  assert.equal(canSkipToEndgame(state), true);
});

test('Skip immediately sets ten seconds without changing scores or carried balls', () => {
  const state = world();
  state.pieces.forEach((piece) => {
    piece.active = false;
  });
  const before = structuredClone(state);
  assert.equal(skipToEndgame(state), true);
  assert.deepEqual(state, { ...before, time: 10 });
  assert.equal(canSkipToEndgame(state), false);
  assert.equal(skipToEndgame(state), false);
});

test('Skip cannot run early, extend time, or alter a finished match', () => {
  const active = world();
  assert.equal(skipToEndgame(active), false);
  assert.equal(active.time, 42);
  for (const time of [10, 9.9, 0]) {
    const state = { ...world(), time, pieces: [] };
    assert.equal(skipToEndgame(state), false);
    assert.equal(state.time, time);
  }
  const finished = { ...world(), pieces: [], finished: true };
  assert.equal(skipToEndgame(finished), false);
  assert.equal(finished.time, 42);
});
