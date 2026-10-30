import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIVALS, rivalLevels } from '../app/rivals.ts';

const levels = RIVALS.map((id) => ({ id, ...rivalLevels[id] }));

test('there are five rivals, easiest first, with the two in-between levels', () => {
  assert.deepEqual(RIVALS, ['rookie', 'contender', 'rival', 'veteran', 'ace']);
  assert.equal(new Set(levels.map((level) => level.name)).size, 5);
});

test('every step up is at least as tough on every count, and faster', () => {
  for (let i = 1; i < levels.length; i += 1) {
    const easier = levels[i - 1];
    const harder = levels[i];
    const step = `${easier.id} -> ${harder.id}`;
    assert.ok(harder.speed > easier.speed, `${step}: speed`);
    assert.ok(
      harder.acceleration > easier.acceleration,
      `${step}: acceleration`,
    );
    assert.ok(harder.coast < easier.coast, `${step}: stops sooner`);
    assert.ok(harder.weave <= easier.weave, `${step}: weave`);
    assert.ok(harder.think < easier.think, `${step}: thinks faster`);
    assert.ok(harder.capacity >= easier.capacity, `${step}: capacity`);
    assert.ok(harder.miss < easier.miss, `${step}: misses less`);
    assert.ok(harder.loadGap <= easier.loadGap, `${step}: load gap`);
    assert.ok(harder.pickupGap <= easier.pickupGap, `${step}: pickup gap`);
  }
});

test('the in-between levels sit halfway between their neighbours', () => {
  for (const [middle, below, above] of [
    ['contender', 'rookie', 'rival'],
    ['veteran', 'rival', 'ace'],
  ]) {
    const halfway = (rivalLevels[below].speed + rivalLevels[above].speed) / 2;
    assert.equal(rivalLevels[middle].speed, halfway, middle);
  }
});
