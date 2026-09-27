// Every part card makes a promise. These tests hold the gameplay numbers to
// those promises, so a card can never quietly drift away from what the part
// actually does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BIG_ARTIFACT_STORAGE,
  REACH_ORDER,
  artifactSpace,
  carryCapacity,
  collectProfile,
  collectorTakes,
  driveSpeed,
  intakeTurnRate,
  reachProfile,
  STOPPED_SPEED,
  assistGuides,
  canFire,
  scoreProfile,
  scoreReach,
  shoveResist,
  strafeFactor,
  topSpeed,
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

const drives = ['comet', 'trailblazer', 'orbit', 'anchor'];
const scorers = ['burst', 'truegate', 'tiptray', 'flywheel'];
const assists = ['range', 'align', 'pathfinder'];
// A plain build to change one part at a time against.
const base = {
  drive: 'comet',
  collect: 'widewave',
  carry: 'pocket',
  reach: 'elevator',
  score: 'truegate',
  assist: 'range',
};

test('every part in the workshop is one the match loop knows about', () => {
  assert.equal(modules.length, 22, 'unexpected number of parts');
  for (const id of [...drives, ...REACH_ORDER, ...scorers, ...assists])
    assert.ok(byId[id], `${id} missing`);
  assert.equal(inCategory('drive').length, 4);
  assert.equal(inCategory('collect').length, 4);
  assert.equal(inCategory('carry').length, 3);
  assert.equal(inCategory('reach').length, 4);
  assert.equal(inCategory('assist').length, 3);
  // Retired parts stay retired.
  assert.equal(byId.beltbridge, undefined);
  assert.equal(byId.coloreye, undefined);
});

test('drivetrain cards match their speed, turn and strafe numbers', () => {
  const speeds = drives.map(driveSpeed);
  // Orbit Omni: "Huge top speed" / "Skids a long way past the GOAL" - the
  // fastest base, with the worst handling of any part in the workshop.
  assert.equal(Math.max(...speeds), driveSpeed('orbit'));
  assert.equal(
    Math.min(...modules.map((m) => m.traits.handling)),
    byId.orbit.traits.handling,
  );
  assert.ok(byId.orbit.traits.handling <= -6);

  // Anchor Traction: "Stops and turns instantly" / "Slowest base here".
  assert.equal(Math.min(...speeds), driveSpeed('anchor'));
  assert.equal(driveSpeed('anchor'), 185);
  assert.equal(
    Math.max(...modules.map((m) => m.traits.handling)),
    byId.anchor.traits.handling,
  );
  assert.equal(Math.max(...drives.map(turnRate)), turnRate('anchor'));

  // Trailblazer 6WD: "Turns like a bus" - slowest turn and least strafe.
  assert.equal(Math.min(...drives.map(turnRate)), turnRate('trailblazer'));
  assert.equal(
    Math.min(...drives.map(strafeFactor)),
    strafeFactor('trailblazer'),
  );

  // Comet Mecanum: "Moves in every direction" - full sideways power.
  assert.equal(strafeFactor('comet'), 1);
  assert.equal(Math.max(...drives.map(strafeFactor)), strafeFactor('comet'));
});

test('every robot turns sluggishly while it swallows an ARTIFACT', () => {
  for (const drive of drives) {
    assert.ok(intakeTurnRate(drive, true) < turnRate(drive) * 0.5);
    assert.equal(intakeTurnRate(drive, false), turnRate(drive));
  }
});

test('collector cards match their reach, cycle, weight and appetite', () => {
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
  // Slowest of the one-at-a-time collectors, and the heaviest bog-down.
  assert.equal(Math.max(wide.cycle, twin.cycle, sorter.cycle), wide.cycle);
  assert.equal(
    Math.min(wide.drag, twin.drag, jaws.drag, sorter.drag),
    wide.drag,
  );
  assert.ok(byId.widewave.traits.speed > 0, 'the light sweeper must add speed');

  // TwinFlex: "Grabs one almost instantly" / "Heavy, and slows the whole
  // robot" - the heaviest part of its kind, and it really does cut top speed.
  assert.equal(
    Math.min(wide.cycle, twin.cycle, jaws.cycle, sorter.cycle),
    twin.cycle,
  );
  assert.equal(
    Math.max(...inCategory('collect').map((m) => m.weight)),
    byId.twinflex.weight,
  );
  assert.equal(byId.twinflex.weight, 6);
  assert.ok(byId.twinflex.traits.speed <= -4);
  assert.ok(twin.topSpeed < 0.9);
  assert.ok(
    topSpeed({ ...base, collect: 'twinflex' }) < topSpeed(base) * 0.9,
    'TwinFlex must slow the robot on the mats',
  );
  for (const light of [wide, jaws, sorter]) assert.equal(light.topSpeed, 1);

  // DualJaw: "Takes two in one grab" / "Very slow clamp, wasted on a lone
  // one" - the slowest clamp of all, bogging the robot down the longest.
  assert.equal(jaws.grab, 2);
  assert.ok(
    [wide, twin, sorter].every((p) => p.grab === 1),
    'only the grabber takes two',
  );
  assert.equal(
    Math.max(wide.cycle, twin.cycle, jaws.cycle, sorter.cycle),
    jaws.cycle,
  );
  assert.ok(jaws.cycle > wide.cycle * 1.5, 'a lone grab must really hurt');
  assert.equal(
    Math.max(wide.dragFor, twin.dragFor, jaws.dragFor, sorter.dragFor),
    jaws.dragFor,
  );

  // PurpleSort: "Drives straight past every yellow".
  assert.equal(sorter.takes, 'P');
  assert.equal(collectorTakes('sorter', 'P'), true);
  assert.equal(collectorTakes('sorter', 'G'), false);
  assert.equal(collectorTakes('widewave', 'G'), true);
});

test('storage cards match their slot counts and purple handling', () => {
  // The numbers each card states.
  assert.equal(carryCapacity('pocket'), 4);
  assert.equal(carryCapacity('lowbin'), 4);
  assert.equal(carryCapacity('stackpack'), 6);
  assert.match(byId.pocket.blurb, /four/i);
  assert.match(byId.pocket.tradeoff, /four/i);
  assert.match(byId.lowbin.tradeoff, /four/i);
  assert.match(byId.stackpack.blurb, /six/i);

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
  for (const part of inCategory('carry'))
    if (part.id !== 'lowbin') assert.equal(artifactSpace('P', part.id), 2);

  // Pocket Indexer: "Almost no weight at all".
  assert.equal(
    Math.min(...inCategory('carry').map((m) => m.weight)),
    byId.pocket.weight,
  );
});

test('the reach parts trade reach for speed, in order on the tray', () => {
  // The tray lists them shortest reach, fastest robot first.
  assert.deepEqual(
    inCategory('reach').map((m) => m.id),
    REACH_ORDER,
  );
  for (let i = 1; i < REACH_ORDER.length; i += 1) {
    const shorter = REACH_ORDER[i - 1];
    const longer = REACH_ORDER[i];
    // Every step up in reach costs real speed on the mats, and the cards'
    // Speed and Score traits say so.
    assert.ok(reachProfile(longer).radius > reachProfile(shorter).radius);
    assert.ok(reachProfile(longer).topSpeed < reachProfile(shorter).topSpeed);
    assert.ok(
      topSpeed({ ...base, reach: longer }) <
        topSpeed({ ...base, reach: shorter }),
    );
    assert.ok(byId[longer].traits.speed < byId[shorter].traits.speed);
    assert.ok(byId[longer].traits.score >= byId[shorter].traits.score);
  }
  // Arc Pivot Arm: "Lightest lift, so the fastest robot" / "Must drive right
  // up to the GOAL". Compact Elevator: "Fair reach with no speed cost".
  // Cascade Slides: "By far the longest reach" / "the slowest robot".
  assert.equal(REACH_ORDER[0], 'swingarm');
  assert.ok(reachProfile('swingarm').topSpeed > 1);
  assert.equal(reachProfile('elevator').topSpeed, 1);
  assert.equal(REACH_ORDER.at(-1), 'cascade');
  assert.equal(
    Math.min(...inCategory('reach').map((m) => m.weight)),
    byId.swingarm.weight,
  );
  assert.equal(
    Math.max(...inCategory('reach').map((m) => m.weight)),
    byId.cascade.weight,
  );
});

test('cards that promise a mechanic actually have one behind them', () => {
  // Trailblazer 6WD: "Wins every push" - it must shove hardest of the four.
  const resists = drives.map(shoveResist);
  assert.equal(Math.max(...resists), shoveResist('trailblazer'));
  // Orbit Omni gives the most ground, which is what "skates" means in contact.
  assert.equal(Math.min(...resists), shoveResist('orbit'));

  // Auto Align: "Costs real top speed".
  assert.ok(topSpeed({ ...base, assist: 'align' }) < topSpeed(base));
});

test('reach decides where you load from, scoring decides how', () => {
  // Loading range comes from the lift alone - no scoring tool changes it.
  assert.equal(scoreReach.length, 1);
  for (const id of REACH_ORDER)
    assert.equal(scoreReach(id), reachProfile(id).radius);

  const burst = scoreProfile('burst');
  const gate = scoreProfile('truegate');
  const tray = scoreProfile('tiptray');
  const fly = scoreProfile('flywheel');
  const cycles = scorers.map((id) => scoreProfile(id).cycle);

  // Burst Feeder: "Fills the GOAL fastest" / "Only fires with the robot
  // stopped".
  assert.equal(Math.min(...cycles), burst.cycle);
  assert.equal(burst.needsStop, true);
  assert.equal(canFire('burst', 0), true);
  assert.equal(canFire('burst', STOPPED_SPEED + 1), false);

  // TrueGate Indexer: "Loads on the move and never misses" / "Slow between
  // shots".
  assert.equal(gate.needsStop, false);
  assert.equal(gate.miss, 0);
  assert.equal(canFire('truegate', 300), true);
  assert.ok(gate.cycle > fly.cycle && gate.cycle > burst.cycle);

  // TipTray: "Empties your storage in one motion" / "Must stop, then a very
  // long reload".
  assert.equal(tray.batch, 'all');
  assert.equal(tray.needsStop, true);
  assert.equal(Math.max(...cycles), tray.cycle);

  // Vector Flywheel: "Quick shots on the move" / "One shot in four bounces
  // out".
  assert.equal(fly.needsStop, false);
  assert.equal(fly.miss, 0.25);
  assert.ok(fly.cycle < gate.cycle);

  // Only the flywheel ever misses, and only the tray loads more than one.
  for (const id of scorers) {
    if (id !== 'flywheel') assert.equal(scoreProfile(id).miss, 0);
    if (id !== 'tiptray') assert.equal(scoreProfile(id).batch, 'one');
  }
  assert.match(byId.burst.tradeoff, /stopped/i);
  assert.match(byId.tiptray.tradeoff, /stop/i);
  assert.match(byId.flywheel.tradeoff, /one shot in four/i);
});

test('each assist guides a different part of the match, none all of it', () => {
  const kinds = ['piece', 'goal', 'base'];
  // Pathfinder: "Draws the route to the next ARTIFACT, and home to BASE at
  // the end" / "No help at the GOAL".
  assert.deepEqual(
    kinds.filter((kind) => assistGuides('pathfinder', kind)),
    ['piece', 'base'],
  );
  // Auto Align: "Points the way to the GOAL".
  assert.deepEqual(
    kinds.filter((kind) => assistGuides('align', kind)),
    ['goal'],
  );
  // Range Finder rings the GOAL instead of drawing a route.
  assert.deepEqual(
    kinds.filter((kind) => assistGuides('range', kind)),
    [],
  );
  // Without a guiding assist, nothing on the field points anywhere.
  for (const kind of kinds) assert.equal(assistGuides('none', kind), false);
});

test('no card still describes the old ruleset', () => {
  const stale =
    /pattern|8 points|5 points|five ARTIFACTS|wrong color|skip|seven|carry two/i;
  for (const part of modules) {
    const copy = `${part.blurb} ${part.strength} ${part.tradeoff}`;
    assert.ok(!stale.test(copy), `${part.name} still says: ${copy}`);
  }
});
