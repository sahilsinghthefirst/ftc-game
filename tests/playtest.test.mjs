import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotStyle } from '../app/bot-style.ts';
import {
  shotMisses,
  scoreProfile,
  goalTips,
  tipValue,
} from '../app/match-guidance.ts';

function seeded(seed) {
  return () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

test('each launcher can land and miss, with its advertised relative accuracy', () => {
  for (const id of ['truegate', 'tiptray', 'burst', 'flywheel']) {
    const chance = scoreProfile(id).miss;
    assert.equal(
      shotMisses(chance, () => 0),
      true,
    );
    assert.equal(
      shotMisses(chance, () => chance),
      false,
    );
    assert.equal(
      shotMisses(chance, () => 0.999),
      false,
    );
    const random = seeded(42);
    const misses = Array.from({ length: 20000 }, () =>
      shotMisses(chance, random),
    ).filter(Boolean).length;
    assert.ok(Math.abs(misses / 20000 - chance) < 0.01, id);
  }
});

test('opponent styles vary within safe bounds, and remain reproducible with a seed', () => {
  const random = seeded(113);
  const styles = Array.from({ length: 100 }, () => createBotStyle(random));
  assert.equal(new Set(styles.map((style) => JSON.stringify(style))).size, 100);
  for (const style of styles) {
    assert.ok(style.speed >= 0.85 && style.speed <= 1.15);
    assert.ok(style.thinking >= 0.8 && style.thinking <= 1.3);
    assert.ok(style.nectar >= 0.65 && style.nectar <= 1.35);
    assert.ok(style.homeAt >= 7 && style.homeAt <= 11);
  }
  assert.deepEqual(createBotStyle(seeded(113)), styles[0]);
});

test('mixed balls tip the easier goal without changing their individual values', () => {
  const load = ['P', 'P', 'G', 'G', 'G'].reduce(
    (total, ball) => total + tipValue(ball),
    0,
  );
  assert.equal(load, 6);
  assert.equal(goalTips(load), true);
  assert.equal(goalTips(load - 1), false);
});
