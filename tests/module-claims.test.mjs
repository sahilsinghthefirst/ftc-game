// Every part card makes a promise. These tests hold the gameplay numbers to
// those promises, so a card can never quietly drift away from what the module
// actually does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BIG_ARTIFACT_STORAGE,
  artifactSpace,
  carryCapacity,
  collectProfile,
  collectorTakes,
  reloadFactor,
  scoreReachBonus,
  shoveResist,
  strafeFactor,
  turnRate,
} from '../app/match-guidance.ts';

// Pull the part list straight out of the workshop so the copy under test is
// the copy players read.
const source = readFileSync('app/field-lab.tsx', 'utf8');
const pattern =
  /id: '([a-z0-9]+)',\s*\n\s*category: '(\w+)',\s*\n\s*name: '([^']+)',\s*\n\s*code: '[^']+',\s*\n\s*blurb: '([^']*)',\s*\n\s*strength: '([^']*)',\s*\n\s*tradeoff: '([^']*)',\s*\n\s*traits: \{ ([^}]*) \},\s*\n\s*weight: (\d+),/g;
const modules = [];
let match;
while ((match = pattern.exec(source))) {
  modules.push({
    id: match[1],
    category: match[2],
    name: match[3],
    blurb: match[4],
    strength: match[5],
    tradeoff: match[6],
    traits: Object.fromEntries(
      match[7].split(',').map((part) => {
        const [key, value] = part.split(':').map((s) => s.trim());
        return [key, Number(value)];
      }),
    ),
    weight: Number(match[8]),
  });
}
const byId = Object.fromEntries(modules.map((m) => [m.id, m]));
const inCategory = (category) => modules.filter((m) => m.category === category);

// These mirror the tables the match loop reads. If a number moves there it has
// to move here, and the claim checks below will catch a card left behind.
const driveSpeed = { orbit: 330, trailblazer: 315, comet: 290, anchor: 165 };
const reachRadius = { cascade: 200, turret: 165, elevator: 120, swingarm: 90 };
const scoreCycle = { burst: 0.15, flywheel: 0.28, truegate: 0.5, tiptray: 1.1 };

test('every part in the workshop is one the match loop knows about', () => {
  assert.equal(modules.length, 24, 'unexpected number of parts');
  for (const id of Object.keys(driveSpeed))
    assert.ok(byId[id], `${id} missing`);
  for (const id of Object.keys(reachRadius))
    assert.ok(byId[id], `${id} missing`);
  for (const id of Object.keys(scoreCycle))
    assert.ok(byId[id], `${id} missing`);
  assert.equal(inCategory('collect').length, 4);
  assert.equal(inCategory('drive').length, 4);
});

test('drivetrain cards match their speed, turn and strafe numbers', () => {
  // Orbit Omni: "Huge top speed" / "Skates straight past the GOAL".
  assert.equal(Math.max(...Object.values(driveSpeed)), driveSpeed.orbit);
  assert.ok(byId.orbit.traits.handling < 0, 'the skater must handle badly');

  // Anchor Traction: "Starts and stops instantly" / "Slowest base here".
  assert.equal(Math.min(...Object.values(driveSpeed)), driveSpeed.anchor);
  assert.equal(
    Math.max(...modules.map((m) => m.traits.handling)),
    byId.anchor.traits.handling,
  );

  // Trailblazer 6WD: "Turns like a bus" - slowest turn and least strafe.
  assert.equal(
    Math.min(...Object.keys(driveSpeed).map(turnRate)),
    turnRate('trailblazer'),
  );
  assert.equal(
    Math.min(...Object.keys(driveSpeed).map(strafeFactor)),
    strafeFactor('trailblazer'),
  );

  // Comet Mecanum: "Moves in every direction" - full sideways power.
  assert.equal(strafeFactor('comet'), 1);
  assert.equal(
    Math.max(...Object.keys(driveSpeed).map(strafeFactor)),
    strafeFactor('comet'),
  );
});

test('collector cards match their reach, cycle and appetite', () => {
  const wide = collectProfile('widewave');
  const twin = collectProfile('twinflex');
  const jaws = collectProfile('dualjaw');
  const sorter = collectProfile('sorter');

  // WideWave: "Huge pickup zone, barely any weight" / "Crawls while it
  // swallows each one".
  assert.equal(
    Math.max(wide.radius, twin.radius, jaws.radius, sorter.radius),
    wide.radius,
  );
  assert.equal(
    Math.min(...inCategory('collect').map((m) => m.weight)),
    byId.widewave.weight,
  );
  assert.equal(
    Math.max(wide.cycle, twin.cycle, jaws.cycle, sorter.cycle),
    wide.cycle,
  );
  assert.equal(
    Math.min(wide.drag, twin.drag, jaws.drag, sorter.drag),
    wide.drag,
  );

  // TwinFlex: "Grabs one almost instantly" / "Heavy, and slows the robot".
  assert.equal(
    Math.min(wide.cycle, twin.cycle, jaws.cycle, sorter.cycle),
    twin.cycle,
  );
  assert.equal(
    Math.max(...inCategory('collect').map((m) => m.weight)),
    byId.twinflex.weight,
  );
  assert.ok(byId.twinflex.traits.speed < 0, 'the heavy intake must cost speed');
  assert.ok(byId.widewave.traits.speed > 0, 'the light sweeper must add speed');

  // DualJaw: "Takes two in one grab".
  assert.equal(jaws.grab, 2);
  assert.ok(
    [wide, twin, sorter].every((p) => p.grab === 1),
    'only the grabber takes two',
  );

  // PurpleSort: "Drives straight past every green".
  assert.equal(sorter.takes, 'P');
  assert.equal(collectorTakes('sorter', 'P'), true);
  assert.equal(collectorTakes('sorter', 'G'), false);
  assert.equal(collectorTakes('widewave', 'G'), true);
});

test('storage cards match their capacity and purple handling', () => {
  // StackPack: "Carries the most per trip" / "Tall, heavy and sluggish".
  const capacities = inCategory('carry').map((m) => carryCapacity(m.id));
  assert.equal(Math.max(...capacities), carryCapacity('stackpack'));
  assert.ok(byId.stackpack.traits.handling < 0);
  assert.equal(
    Math.max(...inCategory('carry').map((m) => m.weight)),
    byId.stackpack.weight,
  );

  // Low Rider Hopper: "Purples take one slot, not two".
  assert.equal(BIG_ARTIFACT_STORAGE, 'lowbin');
  assert.equal(artifactSpace('P', 'lowbin'), 1);
  for (const module of inCategory('carry'))
    if (module.id !== 'lowbin') assert.equal(artifactSpace('P', module.id), 2);

  // Pocket Indexer: "Almost no weight at all" / two slots.
  assert.equal(
    Math.min(...inCategory('carry').map((m) => m.weight)),
    byId.pocket.weight,
  );
  assert.equal(carryCapacity('pocket'), 2);
});

test('cards that promise a mechanic actually have one behind them', () => {
  // Trailblazer 6WD: "Wins every push" - it must shove hardest of the four.
  const resists = Object.keys(driveSpeed).map(shoveResist);
  assert.equal(Math.max(...resists), shoveResist('trailblazer'));
  // Orbit Omni gives the most ground, which is what "skates" means in contact.
  assert.equal(Math.min(...resists), shoveResist('orbit'));

  // Vector Flywheel: "Loads the GOAL at range" - it is the only scoring tool
  // that adds reach of its own.
  assert.ok(scoreReachBonus('flywheel') > 0);
  for (const id of ['burst', 'truegate', 'tiptray'])
    assert.equal(scoreReachBonus(id), 0);

  // BeltBridge: "Loads the GOAL without pausing" - it shortens the reload.
  assert.ok(reloadFactor('beltbridge') < 1);
  for (const id of ['lowbin', 'stackpack', 'pocket'])
    assert.equal(reloadFactor(id), 1);
});

test('reach and scoring cards match their range and cycle times', () => {
  // Cascade Slides: "By far the longest reach".
  assert.equal(Math.max(...Object.values(reachRadius)), reachRadius.cascade);
  // Arc Pivot Arm: "Must drive right up to the GOAL".
  assert.equal(Math.min(...Object.values(reachRadius)), reachRadius.swingarm);
  // Burst Feeder: "Fills the GOAL fastest".
  assert.equal(Math.min(...Object.values(scoreCycle)), scoreCycle.burst);
  // TipTray: "Very long reload".
  assert.equal(Math.max(...Object.values(scoreCycle)), scoreCycle.tiptray);
});

test('no card still describes the old ruleset', () => {
  const stale = /pattern|8 points|5 points|five ARTIFACTS|wrong color|skip/i;
  for (const module of modules) {
    const copy = `${module.blurb} ${module.strength} ${module.tradeoff}`;
    assert.ok(!stale.test(copy), `${module.name} still says: ${copy}`);
  }
});
