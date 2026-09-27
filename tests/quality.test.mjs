import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_LABELS,
  QUALITY_ORDER,
  gpuTier,
  pickQuality,
} from '../app/quality.ts';
import {
  graphicsQuality,
  onGraphicsQuality,
  recommendQuality,
  recommendedQuality,
  setGraphicsQuality,
} from '../app/graphics-setting.ts';

test('the menus offer Lowest, Low, Medium, High and Ultra', () => {
  assert.deepEqual(
    [...QUALITY_ORDER].reverse().map((tier) => QUALITY_LABELS[tier]),
    ['Lowest', 'Low', 'Medium', 'High', 'Ultra'],
  );
});

test('typical school laptop and Chromebook chips start on medium', () => {
  for (const chip of [
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Mali-G52 MC2',
    'Adreno (TM) 618',
    'PowerVR Rogue GE8320',
  ])
    assert.equal(gpuTier(chip), 'medium', chip);
});

test('stronger chips start higher, software rendering lowest', () => {
  assert.equal(
    gpuTier('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)'),
    'high',
  );
  assert.equal(gpuTier('Apple M1'), 'high');
  assert.equal(
    gpuTier('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)'),
    'high',
  );
  assert.equal(
    gpuTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Laptop GPU Direct3D11)'),
    'ultra',
  );
  assert.equal(gpuTier('AMD Radeon RX 6600'), 'ultra');
  assert.equal(
    gpuTier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'),
    'lowest',
  );
  assert.equal(gpuTier('Microsoft Basic Render Driver'), 'lowest');
  // Browsers that hide the name tell us nothing.
  assert.equal(gpuTier(null), null);
  assert.equal(gpuTier('WebKit WebGL'), null);
});

test('the recommended tier follows the chip, then the machine', () => {
  const uhd = 'Intel(R) UHD Graphics 620';
  assert.equal(pickQuality({ gpu: uhd, cores: 8, memoryGB: 16 }), 'medium');
  // A gaming card in a small machine is held to high.
  assert.equal(pickQuality({ gpu: 'GeForce GTX 1650', cores: 4 }), 'high');
  assert.equal(
    pickQuality({ gpu: 'GeForce RTX 4060', cores: 16, memoryGB: 16 }),
    'ultra',
  );
  // No chip name: small or touch machines get medium, others high.
  assert.equal(pickQuality({ cores: 4, memoryGB: 8 }), 'medium');
  assert.equal(
    pickQuality({ cores: 8, memoryGB: 8, coarsePointer: true }),
    'medium',
  );
  assert.equal(pickQuality({ cores: 8, memoryGB: 16 }), 'high');
  assert.equal(pickQuality({}), 'medium');
  // A URL request always wins, and junk in it is ignored.
  for (const tier of QUALITY_ORDER)
    assert.equal(pickQuality({ requested: tier, gpu: uhd }), tier);
  assert.equal(
    pickQuality({ requested: 'max', gpu: 'GeForce RTX 4060', cores: 16 }),
    'ultra',
  );
});

test('the setting starts at the recommendation until the player chooses', () => {
  let changes = 0;
  const stop = onGraphicsQuality(() => (changes += 1));
  // Before any 3D view has checked the specs there is a safe fallback.
  assert.equal(recommendedQuality(), null);
  assert.equal(graphicsQuality(), 'medium');
  // The specs check recommends a tier; only the first report counts.
  recommendQuality('high');
  recommendQuality('ultra');
  assert.equal(recommendedQuality(), 'high');
  assert.equal(graphicsQuality(), 'high');
  // The player's choice replaces it, and every view is told.
  setGraphicsQuality('lowest');
  assert.equal(graphicsQuality(), 'lowest');
  assert.equal(recommendedQuality(), 'high');
  assert.equal(changes, 2);
  stop();
  setGraphicsQuality('ultra');
  assert.equal(changes, 2, 'a view that stopped listening is not told');
});
