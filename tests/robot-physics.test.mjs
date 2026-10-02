import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bouncePlan,
  BOUNCE_DROP,
  DEFAULT_TURN_RATE,
  driveVelocity,
  fallTime,
  handlingProfile,
  moveBody,
  rollBalls,
  rollDistance,
  rollSpeed,
  spillPlan,
  SPILL_APART,
  SPILL_DRAG,
  SPILL_DROP,
  SPILL_FAR,
  SPILL_MOUTH_WIDTH,
  SPILL_SPREAD,
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
  barContact,
  CELL_MOUTH,
  cellMouth,
  FIELD_CENTER,
  FIELD_SIZE,
  FRAME_BARS,
  FRAME_HALF_DEPTH,
  FRAME_HALF_WIDTH,
  HIVE_X,
  INCH,
  LOAD_FRONT,
  RED_BASE,
  RED_BASE_ZONE,
  ROBOT_MARGIN,
  SPILL_MOUTH,
  spillMouth,
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
});

test('every ARTIFACT starts in a row against the wall, as in BIOBUZZ', () => {
  const radiusOf = (color) => (color === 'P' ? 18 : 14);
  for (const [x, y, color] of pieceLayout) {
    const radius = radiusOf(color);
    // Inside the walls, but touching distance from one of them.
    const near = BALL_MARGIN + radius - 14;
    assert.ok(x >= near && x <= FIELD_SIZE - near, `x ${x}`);
    assert.ok(y >= near && y <= FIELD_SIZE - near, `y ${y}`);
    const toWall = Math.min(x, y, FIELD_SIZE - x, FIELD_SIZE - y);
    assert.ok(toWall <= near + 2, `piece at ${x},${y} is out in the open`);
  }
  // No two balls start overlapping, so the rows sit still.
  for (let i = 0; i < pieceLayout.length; i++)
    for (let j = i + 1; j < pieceLayout.length; j++) {
      const [ax, ay, ac] = pieceLayout[i];
      const [bx, by, bc] = pieceLayout[j];
      assert.ok(
        Math.hypot(ax - bx, ay - by) >= radiusOf(ac) + radiusOf(bc),
        `${ax},${ay} overlaps ${bx},${by}`,
      );
    }
  // BIOBUZZ's 40 POLLEN all start on the mats; 10 of the 16 NECTAR do, and
  // the other six start inside the HIVES.
  assert.equal(pieceLayout.filter(([, , color]) => color === 'G').length, 40);
  assert.equal(pieceLayout.filter(([, , color]) => color === 'P').length, 10);
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

test('the HIVE structure is laid out like BIOBUZZ, blue left and red right', () => {
  // Built to the manual at 3.75 field units to the inch.
  assert.equal(INCH, 3.75);
  assert.ok(Math.abs(HIVE_X.red - HIVE_X.blue - 25.5 * INCH) < 1e-9);
  assert.ok(HIVE_X.blue < FIELD_CENTER && HIVE_X.red > FIELD_CENTER);
  assert.equal(FIELD_CENTER - HIVE_X.blue, HIVE_X.red - FIELD_CENTER);
  // A CELL at each end of each HIVE, mirrored across the crossbar.
  for (const alliance of ['blue', 'red'])
    for (const end of [1, -1]) {
      const mouth = cellMouth(alliance, end);
      assert.equal(mouth.x, HIVE_X[alliance]);
      assert.equal(mouth.y - FIELD_CENTER, end * CELL_MOUTH);
      // A CELL tipped down hangs further out than one tipped up.
      assert.ok(SPILL_MOUTH > CELL_MOUTH);
      // A robot loads from out in front of the frame, past the mouth.
      assert.ok(LOAD_FRONT > CELL_MOUTH && LOAD_FRONT > FRAME_HALF_DEPTH);
    }
  // The A-frames stand outside both HIVES with a robot-wide lane under the
  // middle and another between each A-frame and the wall.
  const robot = 2 * ROBOT_CLEARANCE + 20;
  for (const bar of FRAME_BARS) {
    const toCenter = Math.abs(bar.ax - FIELD_CENTER) - bar.r;
    const toWall = Math.min(bar.ax, FIELD_SIZE - bar.ax) - bar.r;
    assert.ok(
      Math.abs(Math.abs(bar.ax - FIELD_CENTER) - FRAME_HALF_WIDTH) < 1e-9,
    );
    assert.ok(toCenter * 2 > robot, 'no lane under the HIVES');
    assert.ok(toWall > robot, `only ${toWall} beside the frame`);
  }
});

// Seeded so a failure can be replayed.
function lcg(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

test('a tipped CELL pours out only on its own side, onto open mats', () => {
  const random = lcg(7);
  for (const alliance of ['blue', 'red'])
    for (const end of [1, -1]) {
      const mouth = spillMouth(alliance, end);
      for (let tip = 0; tip < 80; tip += 1) {
        const shots = spillPlan(mouth, end, 10, random);
        assert.equal(shots.length, 10);
        for (const shot of shots) {
          // Out of the open end, from somewhere across the mouth.
          assert.equal(shot.y, mouth.y);
          assert.ok(Math.abs(shot.x - mouth.x) <= SPILL_MOUTH_WIDTH / 2);
          // Heading out on that side, never back under the HIVE.
          assert.ok(shot.vy * end > 0, 'thrown back under the HIVE');
          assert.ok((shot.landY - FIELD_CENTER) * end > SPILL_MOUTH);
          assert.ok(
            shot.landX > BALL_MARGIN && shot.landX < FIELD_SIZE - BALL_MARGIN,
          );
          assert.ok(
            shot.landY > BALL_MARGIN && shot.landY < FIELD_SIZE - BALL_MARGIN,
          );
          for (const bar of FRAME_BARS)
            assert.ok(barContact(bar, shot.landX, shot.landY).gap > 14);
          // Launched at the speed that settles it on its spot.
          const reach = Math.hypot(shot.landX - shot.x, shot.landY - shot.y);
          const launch = Math.hypot(shot.vx, shot.vy);
          assert.ok(Math.abs(launch / SPILL_DRAG - reach) < 1);
          assert.ok(reach <= SPILL_FAR);
        }
      }
    }
});

test('a pour fans out across that side of the field, away from each other', () => {
  const random = lcg(11);
  const tips = 200;
  let left = 0;
  let right = 0;
  const firstOut = new Set();
  let sweeps = 0;
  const mouth = spillMouth('blue', 1);
  for (let tip = 0; tip < tips; tip += 1) {
    const shots = spillPlan(mouth, 1, 10, random);
    // Never clumped: half a field is less room than the old all-round
    // scatter had, but landing spots still keep well apart.
    for (let i = 0; i < shots.length; i += 1)
      for (let j = i + 1; j < shots.length; j += 1)
        assert.ok(
          Math.hypot(
            shots[i].landX - shots[j].landX,
            shots[i].landY - shots[j].landY,
          ) >=
            SPILL_APART * 0.75,
          'two ARTIFACTS landed on top of each other',
        );
    // Fanned across the whole open side: headings from one tip cover most of
    // the fan, leaving no wide hole.
    const turn = shots.map((shot) => Math.atan2(shot.vx, shot.vy));
    const sorted = [...turn].sort((a, b) => a - b);
    assert.ok(sorted.at(-1) - sorted[0] > SPILL_SPREAD * 1.4, 'too narrow');
    for (let i = 1; i < sorted.length; i += 1)
      assert.ok(sorted[i] - sorted[i - 1] < 0.7, 'a hole in the fan');
    // Strength is random per ARTIFACT, so throws in one tip differ widely.
    const reaches = shots.map((shot) =>
      Math.hypot(shot.landX - shot.x, shot.landY - shot.y),
    );
    assert.ok(Math.max(...reaches) > Math.min(...reaches) * 1.5);
    for (const shot of shots)
      if (shot.landX < mouth.x) left += 1;
      else right += 1;
    // Released one after another, at uneven intervals and in no set order.
    const gaps = shots.slice(1).map((shot, i) => shot.delay - shots[i].delay);
    assert.equal(shots[0].delay, 0);
    assert.ok(gaps.every((gap) => gap > 0.04 && gap < 0.2));
    firstOut.add(Math.round(turn[0] * 3));
    if (turn.every((angle, i) => i === 0 || angle >= turn[i - 1])) sweeps += 1;
  }
  // No favourite side within the fan.
  const leftShare = left / (left + right);
  assert.ok(leftShare > 0.4 && leftShare < 0.6, `${left} left, ${right} right`);
  assert.ok(firstOut.size >= 5, 'the first one out always goes the same way');
  assert.ok(sweeps < tips * 0.05, `${sweeps} of ${tips} tips swept in order`);
});

test('a shot that bounces off the rim drops out of the mouth, back toward the shooter', () => {
  const random = lcg(5);
  for (const end of [1, -1]) {
    const mouth = cellMouth('red', end);
    for (let i = 0; i < 50; i += 1) {
      const shot = bouncePlan(mouth, end, random);
      assert.equal(shot.x, mouth.x);
      assert.equal(shot.y, mouth.y);
      assert.ok(shot.vy * end > 0);
      const reach = Math.hypot(shot.landX - shot.x, shot.landY - shot.y);
      assert.ok(reach > 20 && reach <= 150, `bounced ${reach.toFixed(0)}`);
    }
  }
});

test('a falling ARTIFACT touches nothing until it lands', () => {
  // A dropped ball falls in about the time a real one would.
  assert.ok(Math.abs(fallTime(SPILL_DROP) - 0.44) < 0.02);
  assert.ok(fallTime(BOUNCE_DROP) > fallTime(SPILL_DROP));
  // Dropped straight onto a robot: it passes over it while still falling...
  const robot = { ...body(), x: 300, y: 300 };
  const ball = { x: 300, y: 300, vx: 0, vy: 0, active: true, air: 0.2 };
  rollBalls([ball], [robot], step);
  assert.equal(ball.x, 300);
  assert.equal(ball.y, 300);
  assert.ok(ball.air < 0.2);
  // ...and is bumped clear the moment it lands.
  ball.air = 0;
  rollBalls([ball], [robot], step);
  assert.ok(Math.hypot(ball.x - 300, ball.y - 300) >= 41);
});

test('the A-frame base bars stop loose ARTIFACTS', () => {
  const [bar] = FRAME_BARS;
  const ball = {
    x: bar.ax + 60,
    y: FIELD_CENTER,
    vx: -500,
    vy: 0,
    active: true,
  };
  for (let frame = 0; frame < 120; frame += 1) rollBalls([ball], [], step);
  assert.ok(ball.x >= bar.ax + bar.r + 14 - 1e-6, 'it went through the bar');
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
