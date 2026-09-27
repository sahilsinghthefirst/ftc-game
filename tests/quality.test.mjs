import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameGovernor,
  QUALITY_ORDER,
  gpuTier,
  lowerQuality,
  pickQuality,
} from '../app/quality.ts';

test('typical school laptop and Chromebook chips start on low', () => {
  for (const chip of [
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Mali-G52 MC2',
    'Adreno (TM) 618',
    'PowerVR Rogue GE8320',
  ])
    assert.equal(gpuTier(chip), 'low', chip);
});

test('stronger chips start higher, software rendering lowest', () => {
  assert.equal(
    gpuTier('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)'),
    'medium',
  );
  assert.equal(gpuTier('Apple M1'), 'medium');
  assert.equal(
    gpuTier('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)'),
    'medium',
  );
  assert.equal(
    gpuTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Laptop GPU Direct3D11)'),
    'high',
  );
  assert.equal(gpuTier('AMD Radeon RX 6600'), 'high');
  assert.equal(
    gpuTier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'),
    'minimal',
  );
  assert.equal(gpuTier('Microsoft Basic Render Driver'), 'minimal');
  // Browsers that hide the name tell us nothing.
  assert.equal(gpuTier(null), null);
  assert.equal(gpuTier('WebKit WebGL'), null);
});

test('the starting tier follows the chip, then the machine', () => {
  const uhd = 'Intel(R) UHD Graphics 620';
  assert.equal(pickQuality({ gpu: uhd, cores: 8, memoryGB: 16 }), 'low');
  // A gaming card in a small machine is held to medium.
  assert.equal(pickQuality({ gpu: 'GeForce GTX 1650', cores: 4 }), 'medium');
  assert.equal(
    pickQuality({ gpu: 'GeForce RTX 4060', cores: 16, memoryGB: 16 }),
    'high',
  );
  // No chip name: small or touch machines start low, others medium.
  assert.equal(pickQuality({ cores: 4, memoryGB: 8 }), 'low');
  assert.equal(
    pickQuality({ cores: 8, memoryGB: 8, coarsePointer: true }),
    'low',
  );
  assert.equal(pickQuality({ cores: 8, memoryGB: 16 }), 'medium');
  assert.equal(pickQuality({}), 'low');
  // A URL request always wins, and junk in it is ignored.
  for (const tier of QUALITY_ORDER)
    assert.equal(pickQuality({ requested: tier, gpu: uhd }), tier);
  assert.equal(
    pickQuality({ requested: 'ultra', gpu: 'GeForce RTX 4060', cores: 16 }),
    'high',
  );
});

test('tiers only ever step down, and stop at minimal', () => {
  assert.equal(lowerQuality('high'), 'medium');
  assert.equal(lowerQuality('medium'), 'low');
  assert.equal(lowerQuality('low'), 'minimal');
  assert.equal(lowerQuality('minimal'), 'minimal');
});

const feed = (governor, seconds, frames) => {
  let dropped = 0;
  for (let i = 0; i < frames; i += 1)
    if (governor.sample(seconds)) dropped += 1;
  return dropped;
};

test('a device holding 60 fps is never downgraded', () => {
  const governor = new FrameGovernor();
  assert.equal(feed(governor, 1 / 60, 5000), 0);
});

test('a device stuck near 25 fps is stepped down, once per window', () => {
  const governor = new FrameGovernor();
  const window = FrameGovernor.WARM_UP + FrameGovernor.WINDOW;
  assert.equal(feed(governor, 1 / 25, window - 1), 0);
  assert.equal(feed(governor, 1 / 25, 1), 1);
  // After stepping down it waits a full warm-up and window again.
  assert.equal(feed(governor, 1 / 25, window - 1), 0);
  assert.equal(feed(governor, 1 / 25, 1), 1);
});

test('shader warm-up hitches and paused-tab gaps never count', () => {
  const governor = new FrameGovernor();
  // A burst of long frames while shaders compile, then smooth running.
  assert.equal(feed(governor, 0.12, FrameGovernor.WARM_UP), 0);
  assert.equal(feed(governor, 1 / 60, 1000), 0);
  // A background tab delivering one frame a second is not a slow GPU.
  const idle = new FrameGovernor();
  assert.equal(feed(idle, 1, 1000), 0);
  assert.equal(feed(idle, 0, 10), 0);
});
