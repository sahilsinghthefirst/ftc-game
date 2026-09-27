import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TURN_RATE,
  driveVelocity,
  handlingProfile,
  moveBody,
  rollBalls,
  rollDistance,
  rollSpeed,
  spillPlan,
  SPILL_APART,
  SPILL_DRAG,
  SPILL_FAR,
} from '../app/robot-physics.ts';
import {
  intakeTurnRate,
  strafeFactor,
  turnRate,
} from '../app/match-guidance.ts';
import {
  BALL_MARGIN,
  BLUE_BASE,
  BLUE_BASE_ZONE,
  BLUE_GOAL,
  CENTER_STRUCTURE,
  FIELD_SIZE,
  GOAL_RADIUS,
  RED_BASE,
  RED_BASE_ZONE,
  RED_GOAL,
  ROBOT_MARGIN,
  TILE,
  TILES,
  inZone,
  pieceLayout,
} from '../app/field.ts';
import { ROBOT_CLEARANCE } from '../app/bot-driver.ts';

const body = () => ({ x: 200, y: 200, vx: 0, vy: 0, angle: 0 });
const step = 1 / 60;

test('acceleration is direction independent, and cargo adds weight', () => {
  const straight = body(),
    diagonal = body(),
    loaded = body();
  driveVelocity(straight, 1, 0, 220, 820, 1025, 0, step);
  driveVelocity(diagonal, Math.SQRT1_2, Math.SQRT1_2, 220, 820, 1025, 0, step);
  driveVelocity(loaded, 1, 0, 220, 820, 1025, 5, step);
  assert.ok(
    Math.abs(straight.vx - Math.hypot(diagonal.vx, diagonal.vy)) < 1e-9,
  );
  assert.ok(loaded.vx < straight.vx);
  for (let i = 0; i < 60; i++)
    driveVelocity(straight, 0, 0, 220, 820, 1025, 0, step);
  assert.equal(straight.vx, 0);
});

test('handling ratings stay in range and rise with the trait', () => {
  const low = handlingProfile(1),
    high = handlingProfile(12);
  assert.ok(high.acceleration > low.acceleration);
  assert.ok(high.braking > low.braking);
  assert.deepEqual(handlingProfile(-4), low);
  assert.deepEqual(handlingProfile(99), high);
  for (let rating = 2; rating <= 12; rating++) {
    const previous = handlingProfile(rating - 1);
    const current = handlingProfile(rating);
    assert.ok(current.acceleration > previous.acceleration);
    assert.ok(current.braking > previous.braking);
  }
});

test('handling changes how fast a robot starts and stops, not its top speed', () => {
  const speed = 220;
  const sluggish = handlingProfile(2);
  const crisp = handlingProfile(11);
  const slow = body(),
    quick = body();

  // Same throttle, same top speed: the crisp build just gets there sooner.
  for (let i = 0; i < 12; i++) {
    driveVelocity(
      slow,
      1,
      0,
      speed,
      sluggish.acceleration,
      sluggish.braking,
      0,
      step,
    );
    driveVelocity(
      quick,
      1,
      0,
      speed,
      crisp.acceleration,
      crisp.braking,
      0,
      step,
    );
  }
  assert.ok(quick.vx > slow.vx);

  for (let i = 0; i < 600; i++) {
    driveVelocity(
      slow,
      1,
      0,
      speed,
      sluggish.acceleration,
      sluggish.braking,
      0,
      step,
    );
    driveVelocity(
      quick,
      1,
      0,
      speed,
      crisp.acceleration,
      crisp.braking,
      0,
      step,
    );
  }
  assert.ok(Math.abs(slow.vx - speed) < 1e-9);
  assert.ok(Math.abs(quick.vx - speed) < 1e-9);

  // Release the stick: the sluggish build coasts further before stopping.
  let slowDistance = 0,
    quickDistance = 0;
  for (let i = 0; i < 120; i++) {
    driveVelocity(
      slow,
      0,
      0,
      speed,
      sluggish.acceleration,
      sluggish.braking,
      0,
      step,
    );
    driveVelocity(
      quick,
      0,
      0,
      speed,
      crisp.acceleration,
      crisp.braking,
      0,
      step,
    );
    slowDistance += slow.vx * step;
    quickDistance += quick.vx * step;
  }
  assert.ok(slowDistance > quickDistance);
  assert.equal(slow.vx, 0);
  assert.equal(quick.vx, 0);
});

test('walls stop motion and heading changes are bounded', () => {
  const far = FIELD_SIZE - ROBOT_MARGIN;
  const robot = { ...body(), x: far - 1, vx: 220, vy: 100, angle: Math.PI };
  moveBody(robot, step);
  assert.equal(robot.x, far);
  assert.equal(robot.vx, 0);
  assert.ok(Math.abs(robot.angle - Math.PI) <= 7 / 60 + 1e-9);

  const corner = { ...body(), x: ROBOT_MARGIN + 1, y: 1, vx: -400, vy: -400 };
  moveBody(corner, step);
  assert.equal(corner.x, ROBOT_MARGIN);
  assert.equal(corner.y, ROBOT_MARGIN);
});

test('traction pivots quickest and the six-wheeler far slower than the rest', () => {
  // Heading always chases the direction of travel; the drivetrain decides how
  // fast. Start facing north, drive due east, and count the steps each chassis
  // needs to bring its nose round.
  const stepsToComeRound = (drive, intaking = false) => {
    const robot = { x: 400, y: 400, vx: 200, vy: 0, angle: -Math.PI / 2 };
    for (let i = 1; i <= 400; i++) {
      moveBody(robot, step, intakeTurnRate(drive, intaking));
      if (Math.abs(robot.angle) < 0.02) return i;
    }
    return Infinity;
  };
  const sixWheel = stepsToComeRound('trailblazer');
  const omni = stepsToComeRound('orbit');
  const mecanum = stepsToComeRound('comet');
  const traction = stepsToComeRound('anchor');

  // More steps means a slower turn.
  assert.ok(traction < omni, 'traction should be the quickest to come round');
  assert.ok(omni < mecanum);
  assert.ok(mecanum < sixWheel);
  // Swallowing an ARTIFACT makes every base hard to turn.
  for (const drive of ['trailblazer', 'orbit', 'comet', 'anchor'])
    assert.ok(
      stepsToComeRound(drive, true) > stepsToComeRound(drive) * 2,
      `${drive} turns as easily while intaking`,
    );
  // The gap is meant to be obvious, not subtle.
  assert.ok(
    sixWheel > omni * 4,
    `omni came round in ${omni} steps, six-wheeler took ${sixWheel}`,
  );
  assert.equal(turnRate('trailblazer'), 2);
  // Anything without a drivetrain of its own keeps the neutral rate.
  assert.equal(DEFAULT_TURN_RATE, 7);
});

test('the field is a square of six by six mats', () => {
  assert.equal(TILES, 6);
  assert.equal(FIELD_SIZE, TILES * TILE);
  // Every ARTIFACT starts on the mats and clear of the center structure.
  for (const [x, y] of pieceLayout) {
    assert.ok(x > BALL_MARGIN && x < FIELD_SIZE - BALL_MARGIN, `x ${x}`);
    assert.ok(y > BALL_MARGIN && y < FIELD_SIZE - BALL_MARGIN, `y ${y}`);
    const gap = Math.hypot(x - CENTER_STRUCTURE.x, y - CENTER_STRUCTURE.y);
    assert.ok(
      gap > CENTER_STRUCTURE.radius + 14,
      `piece at ${x},${y} overlaps center`,
    );
    for (const goal of [BLUE_GOAL, RED_GOAL])
      assert.ok(
        Math.hypot(x - goal.x, y - goal.y) > GOAL_RADIUS + 40,
        `piece at ${x},${y} sits on a GOAL`,
      );
  }
});

test('each BASE is the whole mat in its bottom corner, flush with the walls', () => {
  // Blue: its left and bottom edges are the arena's left and bottom walls.
  assert.deepEqual(BLUE_BASE_ZONE, {
    left: 0,
    top: FIELD_SIZE - TILE,
    right: TILE,
    bottom: FIELD_SIZE,
  });
  // Red mirrors it into the bottom-right corner.
  assert.deepEqual(RED_BASE_ZONE, {
    left: FIELD_SIZE - TILE,
    top: FIELD_SIZE - TILE,
    right: FIELD_SIZE,
    bottom: FIELD_SIZE,
  });
  // Robots park by driving to the middle, which is inside.
  assert.ok(inZone(BLUE_BASE, BLUE_BASE_ZONE));
  assert.ok(inZone(RED_BASE, RED_BASE_ZONE));
  // The rectangle counts right into the corner a robot can reach, and not a
  // step past its edges.
  assert.ok(
    inZone({ x: ROBOT_MARGIN, y: FIELD_SIZE - ROBOT_MARGIN }, BLUE_BASE_ZONE),
  );
  assert.ok(inZone({ x: TILE - 1, y: FIELD_SIZE - TILE + 1 }, BLUE_BASE_ZONE));
  assert.ok(!inZone({ x: TILE + 1, y: FIELD_SIZE - 50 }, BLUE_BASE_ZONE));
  assert.ok(!inZone({ x: 50, y: FIELD_SIZE - TILE - 1 }, BLUE_BASE_ZONE));
  assert.ok(!inZone(BLUE_BASE, RED_BASE_ZONE));
});

test('the GOALS stand right against the center structure, blue left and red right', () => {
  for (const goal of [BLUE_GOAL, RED_GOAL])
    assert.equal(goal.y, CENTER_STRUCTURE.y);
  assert.ok(BLUE_GOAL.x < CENTER_STRUCTURE.x);
  assert.ok(RED_GOAL.x > CENTER_STRUCTURE.x);
  assert.equal(
    CENTER_STRUCTURE.x - BLUE_GOAL.x,
    RED_GOAL.x - CENTER_STRUCTURE.x,
  );
  // Touching the structure: no gap a robot or even an ARTIFACT could slip
  // through. Behind each GOAL there is still a wide lane to the wall.
  const robot = 2 * ROBOT_CLEARANCE + 20;
  for (const goal of [BLUE_GOAL, RED_GOAL]) {
    const toCenter =
      Math.abs(goal.x - CENTER_STRUCTURE.x) -
      GOAL_RADIUS -
      CENTER_STRUCTURE.radius;
    const toWall = Math.min(goal.x, FIELD_SIZE - goal.x) - GOAL_RADIUS;
    assert.ok(toCenter >= 0, 'GOAL overlaps the center structure');
    assert.ok(toCenter < 10, `${toCenter} between GOAL and center`);
    assert.ok(toWall > robot, `only ${toWall} behind the GOAL`);
  }
});

test('every spilled ARTIFACT lands on open mats, thrown just hard enough', () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const goal of [BLUE_GOAL, RED_GOAL]) {
    for (let tip = 0; tip < 120; tip += 1) {
      const shots = spillPlan(goal, 10, random);
      assert.equal(shots.length, 10);
      for (const shot of shots) {
        assert.ok(
          shot.landX > BALL_MARGIN && shot.landX < FIELD_SIZE - BALL_MARGIN,
        );
        assert.ok(
          shot.landY > BALL_MARGIN && shot.landY < FIELD_SIZE - BALL_MARGIN,
        );
        // Never thrown into the center structure the GOAL leans on, nor at
        // the other GOAL.
        assert.ok(
          Math.hypot(
            shot.landX - CENTER_STRUCTURE.x,
            shot.landY - CENTER_STRUCTURE.y,
          ) >
            CENTER_STRUCTURE.radius + 20,
          `landed in the center at ${shot.landX},${shot.landY}`,
        );
        const other = goal === BLUE_GOAL ? RED_GOAL : BLUE_GOAL;
        assert.ok(
          Math.hypot(shot.landX - other.x, shot.landY - other.y) >
            GOAL_RADIUS + 20,
        );
        // Launched at the speed that settles it on its spot.
        const reach = Math.hypot(shot.landX - goal.x, shot.landY - goal.y);
        const launch = Math.hypot(shot.vx, shot.vy);
        assert.ok(
          Math.abs(launch / SPILL_DRAG - (reach - GOAL_RADIUS - 22)) < 1,
        );
        assert.ok(reach <= SPILL_FAR);
      }
    }
  }
});

test('spilled ARTIFACTS scatter in random directions, away from each other', () => {
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tips = 200;
  let upField = 0;
  let downField = 0;
  const firstOut = new Set();
  let sweeps = 0;
  for (let tip = 0; tip < tips; tip += 1) {
    const shots = spillPlan(BLUE_GOAL, 10, random);
    // Never clumped: every landing spot keeps its distance from the rest.
    for (let i = 0; i < shots.length; i += 1)
      for (let j = i + 1; j < shots.length; j += 1)
        assert.ok(
          Math.hypot(
            shots[i].landX - shots[j].landX,
            shots[i].landY - shots[j].landY,
          ) >=
            SPILL_APART - 1,
          'two ARTIFACTS landed on top of each other',
        );
    // Fanned all round the GOAL: headings from one tip cover most of the
    // open directions, leaving no wide hole. Measured from straight away
    // from the center structure, which the open arc is centered on.
    const turn = shots.map((shot) => Math.atan2(-shot.vy, -shot.vx));
    const sorted = [...turn].sort((a, b) => a - b);
    assert.ok(sorted.at(-1) - sorted[0] > 3, 'the fan is too narrow');
    for (let i = 1; i < sorted.length; i += 1)
      assert.ok(sorted[i] - sorted[i - 1] < 1, 'a hole in the fan');
    // Strength is random per ARTIFACT, so throws in one tip differ widely.
    const reaches = shots.map((shot) =>
      Math.hypot(shot.landX - BLUE_GOAL.x, shot.landY - BLUE_GOAL.y),
    );
    assert.ok(Math.max(...reaches) > Math.min(...reaches) * 1.5);
    for (const shot of shots)
      if (shot.landY < BLUE_GOAL.y) upField += 1;
      else downField += 1;
    // Released one after another, at uneven intervals and in no set order.
    const gaps = shots.slice(1).map((shot, i) => shot.delay - shots[i].delay);
    assert.equal(shots[0].delay, 0);
    assert.ok(gaps.every((gap) => gap > 0.04 && gap < 0.2));
    firstOut.add(Math.round(turn[0] * 2));
    if (turn.every((angle, i) => i === 0 || angle >= turn[i - 1])) sweeps += 1;
  }
  // No favourite direction: up the field and down it are mirror images round
  // this GOAL, so they should come up about equally often.
  const upShare = upField / (upField + downField);
  assert.ok(upShare > 0.4 && upShare < 0.6, `${upField} up, ${downField} down`);
  assert.ok(firstOut.size >= 5, 'the first one out always goes the same way');
  assert.ok(sweeps < tips * 0.05, `${sweeps} of ${tips} tips swept in order`);
});

test('a spilled ARTIFACT rolls out to about where it was aimed', () => {
  // Clear lane across the mats: no goal, wall or center structure in the way.
  for (const target of [80, 200, 380]) {
    const ball = { x: 100, y: 200, vx: rollSpeed(target), vy: 0, active: true };
    let frames = 0;
    while (Math.hypot(ball.vx, ball.vy ?? 0) > 1 && frames < 600) {
      rollBalls([ball], [], step);
      frames += 1;
    }
    const travelled = ball.x - 100;
    assert.ok(
      Math.abs(travelled - target) < target * 0.12,
      `aimed ${target}, rolled ${travelled.toFixed(1)}`,
    );
    // Long enough to read as a roll, short enough not to stall the match.
    assert.ok(frames > 12 && frames < 200, `settled in ${frames} frames`);
  }
  assert.equal(Math.round(rollDistance(rollSpeed(250))), 250);
});

test('a spilled ARTIFACT glides much further for the same launch speed', () => {
  const coast = (spill) => {
    const ball = { x: 100, y: 200, vx: 360, vy: 0, active: true, spill };
    for (let frame = 0; frame < 600; frame += 1) rollBalls([ball], [], step);
    return ball.x - 100;
  };
  // Same push, so the spill is no faster - it just carries well out from the
  // GOAL instead of stopping beside it.
  assert.ok(coast(true) > coast(false) * 2.5);
  assert.ok(coast(true) > 260, `spill only reached ${coast(true).toFixed(0)}`);
});

test('balls receive a bump, settle and stay finite at exact overlaps', () => {
  const robot = { ...body(), vx: 180 };
  const ball = { x: 220, y: 200, active: true };
  rollBalls([ball], [robot], 1 / 60);
  assert.ok(ball.vx > 0);
  assert.equal(ball.x, 242);
  for (let i = 0; i < 180; i++) rollBalls([ball], [], 1 / 60);
  assert.ok(Math.abs(ball.vx) < 0.01);
  const overlaps = [
    { x: 500, y: 326, active: true },
    { x: 500, y: 326, active: true },
  ];
  rollBalls(overlaps, [], 1 / 60);
  assert.ok(
    overlaps.every((b) => Number.isFinite(b.x) && Number.isFinite(b.vx)),
  );
});

test('ball collisions transfer momentum along the collision normal only', () => {
  const a = { x: 300, y: 200, vx: 0, vy: 100, active: true };
  const b = { x: 300, y: 225, vx: 0, vy: 0, active: true };
  rollBalls([a, b], [], 1 / 60);
  assert.ok(b.vy > 0);
  assert.equal(b.vx, 0);
  const collected = { x: 999, y: 999, vx: 200, vy: 0, active: false };
  rollBalls([collected], [], 1 / 60);
  assert.equal(collected.x, 999);
});

test('a chassis that cannot strafe has to turn before it can go', () => {
  const speed = 300;
  const accel = 900;
  // Both robots face east and are asked to drive due north. Time how long each
  // takes to dodge 40 units that way - the quick sideways adjustment you make
  // when lining up on a GOAL.
  const stepsToTravel = (drive, distance) => {
    const robot = { x: 400, y: 400, vx: 0, vy: 0, angle: 0 };
    for (let i = 1; i <= 600; i++) {
      driveVelocity(
        robot,
        0,
        -1,
        speed,
        accel,
        accel,
        0,
        step,
        strafeFactor(drive),
      );
      moveBody(robot, step, turnRate(drive), -Math.PI / 2);
      if (400 - robot.y >= distance) return i;
    }
    return Infinity;
  };
  const mecanum = stepsToTravel('comet', 40);
  const sixWheel = stepsToTravel('trailblazer', 40);
  // The mecanum simply drives sideways; the six-wheeler has to come round
  // first, so it takes markedly longer to cover the same ground.
  assert.ok(
    sixWheel > mecanum * 1.35,
    `mecanum took ${mecanum} steps, six-wheeler ${sixWheel}`,
  );
  // A tiny fraction of sideways push means it creeps rather than stalls.
  assert.ok(Number.isFinite(sixWheel), 'it must still get there eventually');
});

test('steering follows the request, so a tank drive can still come round', () => {
  // Facing east, asked to go west: with no sideways power at all the only way
  // round is for the heading to lead.
  const robot = { x: 400, y: 400, vx: 0, vy: 0, angle: 0 };
  for (let i = 0; i < 120; i++) {
    driveVelocity(robot, -1, 0, 300, 900, 900, 0, step, 0.12);
    moveBody(robot, step, 2, Math.PI);
  }
  assert.ok(
    Math.abs(
      Math.atan2(
        Math.sin(robot.angle - Math.PI),
        Math.cos(robot.angle - Math.PI),
      ),
    ) < 0.05,
    'the robot should have come round to face west',
  );
  assert.ok(robot.x < 399, 'and then actually driven west');
});
