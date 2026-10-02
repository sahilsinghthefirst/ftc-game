'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GraphicsPicker } from './graphics-picker';
import { createArenaScene, type CameraMode } from './arena-scene';
import { botHeading, createBotMind } from './bot-driver';
import {
  BLUE_BASE,
  BLUE_BASE_ZONE,
  CELL_PRELOAD,
  cellMouth,
  FIELD_CENTER,
  HIVE_START_UP,
  RED_BASE,
  RED_BASE_ZONE,
  inZone,
  loadingSpot,
  spillMouth,
  type Alliance,
  type CellEnd,
  pieceLayout,
} from './field';
import {
  bouncePlan,
  BOUNCE_DROP,
  driveVelocity,
  fallTime,
  handlingProfile,
  moveBody,
  rollBalls,
  resolveObstacle,
  spillPlan,
  SPILL_DROP,
  BALL_RADIUS,
} from './robot-physics';
import {
  canCarry,
  carryCapacity,
  cellSide,
  mayCollect,
  collectProfile,
  collectorTakes,
  goalTips,
  GOAL_TIP_AT,
  inLoadingRange,
  NECTAR_TIP_VALUE,
  TIP_POINTS,
  tipValue,
  intakeTurnRate,
  scoreReach,
  scoreProfile,
  canFire,
  shoveResist,
  strafeFactor,
  topSpeed,
  usedSpace,
  playerTarget,
} from './match-guidance';

export type Difficulty = 'rookie' | 'rival' | 'ace';

export type MatchResult = {
  playerScore: number;
  botScore: number;
  collected: number;
  scored: number;
  tips: number;
  baseBonus: boolean;
};

type ArenaProps = {
  selected: Record<string, string>;
  handling: number;
  difficulty: Difficulty;
  onFinish: (result: MatchResult) => void;
  onWorkshop: () => void;
};

type PieceColor = 'P' | 'G';
// An ARTIFACT is in exactly one place: loose on the mats (`active`), held by a
// robot (inactive with a `collector`), or sitting in one of a HIVE's CELLS
// (`stored`, with the `cell` it is in). Only what is in a CELL pours out
// when that CELL tips down.
type Piece = {
  id: number;
  x: number;
  y: number;
  color: PieceColor;
  // Which alliance may pick up a NECTAR ('P'); POLLEN ('G') has none.
  alliance?: Alliance;
  active: boolean;
  vx?: number;
  vy?: number;
  collector?: 'player' | 'bot';
  stored?: 'player' | 'bot';
  cell?: CellEnd;
  radius: number;
  px: number;
  py: number;
  spill?: boolean;
  // Seconds before a freshly spilled ARTIFACT can be picked up.
  grace?: number;
  // Seconds left falling from a CELL to the mats, and the height in inches
  // it fell from, so the scene can draw the drop.
  air?: number;
  drop?: number;
  // Queued pour: an ARTIFACT waiting its turn to fall out of a CELL.
  release?: {
    delay: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    drop: number;
  };
};
// One alliance's HIVE: which CELL faces up, how much is loaded into it, and
// how many times it has tipped.
export type HiveState = { up: CellEnd; load: number; tips: number };
type Robot = {
  // Pose at the previous physics step, so the renderer can interpolate between
  // steps instead of showing the fixed-timestep lumps.
  px: number;
  py: number;
  pangle: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  carried: PieceColor[];
  // Seconds the intake is still hauling an ARTIFACT in, which drags top speed.
  intake: number;
  cooldown: number;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  text?: string;
};
export type World = {
  player: Robot;
  bot: Robot;
  pieces: Piece[];
  particles: Particle[];
  time: number;
  playerScore: number;
  botScore: number;
  collected: number;
  scored: number;
  hives: Record<Alliance, HiveState>;
  botThink: number;
  botTarget: { x: number; y: number };
  botIntent: string;
  finished: boolean;
};

type Hud = {
  time: number;
  playerScore: number;
  botScore: number;
  carried: number;
  capacity: number;
  prompt: string;
  botIntent: string;
  finalSeconds: boolean;
  goalLoad: number;
  cellUp: CellEnd;
};

const MATCH_TIME = 60;
// NECTAR counts 1.5 toward a tip and POLLEN 1, up to this bar.
const tipAt = GOAL_TIP_AT;
export const NECTAR_BALL_RADIUS = 18;

// Burst colour for an ARTIFACT: its alliance colour for NECTAR, yellow for
// POLLEN.
function ink(color: PieceColor, alliance?: Alliance) {
  if (color !== 'P') return '#f7d948';
  return alliance === 'red' ? '#ff6b61' : '#5aa9ff';
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function createWorld(): World {
  const player = {
    x: BLUE_BASE.x + 40,
    y: BLUE_BASE.y - 30,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    carried: [] as PieceColor[],
    intake: 0,
    cooldown: 0,
  };
  const bot = {
    x: RED_BASE.x - 40,
    y: RED_BASE.y - 30,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    carried: [] as PieceColor[],
    intake: 0,
    cooldown: 0,
  };
  const onMats: Piece[] = pieceLayout.map(([x, y, color, alliance], id) => ({
    id,
    x,
    y,
    px: x,
    py: y,
    color,
    alliance,
    active: true,
    radius: color === 'P' ? NECTAR_BALL_RADIUS : BALL_RADIUS,
  }));
  // Each HIVE's upward CELL starts holding three of its alliance's NECTAR.
  const preloads = (['blue', 'red'] as const).flatMap((alliance) =>
    Array.from({ length: CELL_PRELOAD }, (): Piece => {
      const mouth = cellMouth(alliance, HIVE_START_UP);
      return {
        id: 0,
        x: mouth.x,
        y: mouth.y,
        px: mouth.x,
        py: mouth.y,
        color: 'P',
        alliance,
        active: false,
        stored: alliance === 'blue' ? 'player' : 'bot',
        cell: HIVE_START_UP,
        radius: NECTAR_BALL_RADIUS,
      };
    }),
  );
  preloads.forEach((piece, index) => (piece.id = onMats.length + index));
  const hive = (): HiveState => ({
    up: HIVE_START_UP,
    load: CELL_PRELOAD * NECTAR_TIP_VALUE,
    tips: 0,
  });
  return {
    player: { ...player, px: player.x, py: player.y, pangle: player.angle },
    bot: { ...bot, px: bot.x, py: bot.y, pangle: bot.angle },
    pieces: [...onMats, ...preloads],
    particles: [],
    time: MATCH_TIME,
    playerScore: 0,
    botScore: 0,
    collected: 0,
    scored: 0,
    hives: { blue: hive(), red: hive() },
    botThink: 0,
    botTarget: { x: FIELD_CENTER, y: FIELD_CENTER },
    botIntent: 'Scanning the field',
    finished: false,
  };
}

function emitBurst(
  world: World,
  x: number,
  y: number,
  color: string,
  text?: string,
) {
  for (let i = 0; i < 13; i += 1) {
    const angle = (Math.PI * 2 * i) / 13 + Math.random() * 0.3;
    const speed = 34 + Math.random() * 88;
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.7,
      maxLife: 0.7,
      color,
      size: 3 + Math.random() * 4,
    });
  }
  if (text)
    world.particles.push({
      x,
      y: y - 12,
      vx: 0,
      vy: -36,
      life: 1,
      maxLife: 1,
      color: '#f8fdff',
      size: 15,
      text,
    });
}

const allianceOf = (side: 'player' | 'bot'): Alliance =>
  side === 'player' ? 'blue' : 'red';

// The ARTIFACT of a given colour a robot is holding, if any.
function heldPiece(world: World, side: 'player' | 'bot', color: PieceColor) {
  return world.pieces.find(
    (piece) =>
      !piece.active &&
      piece.collector === side &&
      !piece.stored &&
      !piece.release &&
      piece.color === color,
  );
}

// Move ARTIFACTS a robot was carrying into its HIVE's upward CELL. They stay
// off the mats, but they now belong to that CELL rather than to the robot.
function storeInCell(
  world: World,
  side: 'player' | 'bot',
  colors: PieceColor[],
) {
  const up = world.hives[allianceOf(side)].up;
  for (const color of colors) {
    const piece = heldPiece(world, side, color);
    if (!piece) continue;
    piece.stored = side;
    piece.cell = up;
  }
}

// A shot that bounces off the rim of the upward CELL: the ARTIFACT drops
// back out of the mouth, a moment after it was fired, and rolls a short way
// back out toward the robot instead of counting.
function bounceOut(world: World, side: 'player' | 'bot', color: PieceColor) {
  const piece = heldPiece(world, side, color);
  if (!piece) return;
  const alliance = allianceOf(side);
  const up = world.hives[alliance].up;
  const shot = bouncePlan(cellMouth(alliance, up), up);
  piece.release = {
    delay: 0.3,
    x: shot.x,
    y: shot.y,
    vx: shot.vx,
    vy: shot.vy,
    drop: BOUNCE_DROP,
  };
}

// How long a tipping CELL takes to swing down far enough to start pouring.
const TIP_SWING = 0.3;

// A HIVE tips over, as in BIOBUZZ: it scores once, and the full CELL swings
// down and pours everything it held out of its open end, on its own side of
// the HIVE, for both robots to chase again. The empty CELL at the other end
// swings up, so the next load goes in from the other side. ARTIFACTS still
// riding in a robot stay put.
function tipHive(world: World, side: 'player' | 'bot') {
  const alliance = allianceOf(side);
  const hive = world.hives[alliance];
  const end = hive.up;
  const spilled = world.pieces.filter(
    (piece) => piece.stored === side && piece.cell === end && !piece.release,
  );
  const shots = spillPlan(spillMouth(alliance, end), end, spilled.length);
  spilled.forEach((piece, index) => {
    // They fall out one at a time, in a shuffled order and at uneven
    // intervals, and roll out on the gentle spill curve until they settle.
    // Until then they ride the CELL down.
    const { x, y, vx, vy, delay } = shots[index];
    piece.release = {
      delay: TIP_SWING + delay,
      x,
      y,
      vx,
      vy,
      drop: SPILL_DROP,
    };
  });
  hive.up = end > 0 ? -1 : 1;
  hive.load = 0;
  hive.tips += 1;
  const mouth = cellMouth(alliance, end);
  emitBurst(world, mouth.x, mouth.y, '#ffd166', `+${TIP_POINTS}`);
  if (side === 'player') world.playerScore += TIP_POINTS;
  else world.botScore += TIP_POINTS;
}

// A robot waiting under a pouring CELL sits right where its ARTIFACTS land.
// Without a moment's grace it would swallow one the instant it appeared, which
// looks like a ball bouncing out and vanishing.
const SPILL_GRACE = 0.7;

// Whether an ARTIFACT is lying on the mats, free for either robot to take.
function pickable(piece: Piece) {
  return piece.active && !(piece.grace && piece.grace > 0);
}

// Let queued ARTIFACTS out of a tipped CELL as their turn comes round.
function releaseSpills(world: World, dt: number) {
  for (const piece of world.pieces) {
    if (piece.grace) piece.grace = Math.max(0, piece.grace - dt);
    const release = piece.release;
    if (!release) continue;
    release.delay -= dt;
    if (release.delay > 0) continue;
    piece.x = release.x;
    piece.px = release.x;
    piece.y = release.y;
    piece.py = release.y;
    piece.vx = release.vx;
    piece.vy = release.vy;
    piece.active = true;
    piece.spill = true;
    piece.grace = SPILL_GRACE;
    piece.air = fallTime(release.drop);
    piece.drop = release.drop;
    piece.collector = undefined;
    piece.stored = undefined;
    piece.cell = undefined;
    piece.release = undefined;
  }
}

export function GameArena({
  selected,
  handling,
  difficulty,
  onFinish,
  onWorkshop,
}: ArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef(new Set<string>());
  const touchRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
  });
  const worldRef = useRef<World>(createWorld());
  const botMindRef = useRef(createBotMind());
  const finishRef = useRef(onFinish);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const sceneRef = useRef<ReturnType<typeof createArenaScene> | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow');
  const [sceneFailed, setSceneFailed] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [hud, setHud] = useState<Hud>({
    time: MATCH_TIME,
    playerScore: 0,
    botScore: 0,
    carried: 0,
    capacity: carryCapacity(selected.carry),
    prompt: 'Drive to an ARTIFACT',
    botIntent: 'Scanning the field',
    finalSeconds: false,
    goalLoad: CELL_PRELOAD * NECTAR_TIP_VALUE,
    cellUp: HIVE_START_UP,
  });

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    sceneRef.current?.setCamera(cameraMode);
  }, [cameraMode]);

  const capacity = carryCapacity(selected.carry);
  const {
    radius: pickupRadius,
    cycle: collectCycle,
    drag: collectDrag,
    dragFor: collectDragFor,
    grab: collectGrab,
  } = collectProfile(selected.collect);
  const playerStrafe = strafeFactor(selected.drive);
  // How close the robot has to get to load a CELL: what the lift reaches,
  // plus whatever the scoring tool can throw.
  const scoreRadius = scoreReach(selected.reach);
  // How the scoring tool loads: its reload, batch size and miss chance.
  const {
    cycle: scoreCycle,
    batch: scoreBatch,
    miss: scoreMiss,
  } = scoreProfile(selected.score);
  // Drivetrain speed, slowed by a heavy collector or lift and by Auto Align.
  const speed = topSpeed(selected);
  // The Handling trait shown in the workshop is the number that drives here, so
  // a heavy build feels sluggish off the line and slides further when released.
  const { acceleration, braking } = handlingProfile(handling);
  const alignTolerance = selected.assist === 'align' ? 20 : 0;

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'button, input, select, textarea, a, [contenteditable="true"]',
        )
      )
        return;
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          ' ',
          'w',
          'a',
          's',
          'd',
          'W',
          'A',
          'S',
          'D',
        ].includes(event.key)
      )
        event.preventDefault();
      keysRef.current.add(event.key.toLowerCase());
      if (event.key === 'Escape' && !event.repeat) setPaused((value) => !value);
      if (
        event.key.toLowerCase() === 'c' &&
        !event.repeat &&
        !pausedRef.current
      )
        setCameraMode((value) => (value === 'arena' ? 'follow' : 'arena'));
    };
    const up = (event: KeyboardEvent) =>
      keysRef.current.delete(event.key.toLowerCase());
    const blur = () => {
      keysRef.current.clear();
      touchRef.current = {
        up: false,
        down: false,
        left: false,
        right: false,
        action: false,
      };
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let scene: ReturnType<typeof createArenaScene>;
    try {
      scene = createArenaScene(canvas, selected, worldRef.current);
    } catch {
      queueMicrotask(() => setSceneFailed(true));
      return;
    }
    sceneRef.current = scene;
    scene.setCamera('follow');
    canvas.focus({ preventScroll: true });
    let readyTime = 3;
    let displayedCount = 3;

    let previous = performance.now();
    let accumulator = 0;
    let hudClock = 0;
    let frame = 0;

    const update = (dt: number) => {
      const world = worldRef.current;
      if (world.finished) return;
      // Remember where everything was before this step so the renderer can
      // draw the in-between frames instead of snapping from step to step.
      for (const robot of [world.player, world.bot]) {
        robot.px = robot.x;
        robot.py = robot.y;
        robot.pangle = robot.angle;
      }
      for (const piece of world.pieces) {
        piece.px = piece.x;
        piece.py = piece.y;
      }
      world.time = Math.max(0, world.time - dt);
      world.player.cooldown = Math.max(0, world.player.cooldown - dt);
      world.player.intake = Math.max(0, world.player.intake - dt);
      world.bot.cooldown = Math.max(0, world.bot.cooldown - dt);

      const keys = keysRef.current;
      const touch = touchRef.current;
      let ix =
        (keys.has('d') || keys.has('arrowright') || touch.right ? 1 : 0) -
        (keys.has('a') || keys.has('arrowleft') || touch.left ? 1 : 0);
      let iy =
        (keys.has('s') || keys.has('arrowdown') || touch.down ? 1 : 0) -
        (keys.has('w') || keys.has('arrowup') || touch.up ? 1 : 0);
      const inputLength = Math.hypot(ix, iy);
      if (inputLength > 0) {
        ix /= inputLength;
        iy /= inputLength;
      }
      ({ x: ix, y: iy } = scene.movement(ix, iy));
      driveVelocity(
        world.player,
        ix,
        iy,
        world.player.intake > 0 ? speed * collectDrag : speed,
        acceleration,
        braking,
        world.player.carried.length,
        dt,
        playerStrafe,
      );
      // Steer toward what the driver asked for, not toward the velocity the
      // robot has managed so far - a chassis that cannot strafe would never
      // come round otherwise.
      moveBody(
        world.player,
        dt,
        // Swallowing an ARTIFACT makes the robot hard to turn.
        intakeTurnRate(selected.drive, world.player.intake > 0),
        inputLength > 0 ? Math.atan2(iy, ix) : undefined,
      );
      resolveObstacle(world.player);

      const action = keys.has(' ') || keys.has('space') || touch.action;
      const blueHive = world.hives.blue;
      const nearGoal = inLoadingRange(
        world.player,
        'blue',
        blueHive.up,
        scoreRadius + alignTolerance,
      );
      // Only ARTIFACTS this collector will touch, nearest first.
      const inReach = world.pieces
        .filter(
          (piece) =>
            pickable(piece) &&
            mayCollect(piece, 'blue') &&
            collectorTakes(selected.collect, piece.color) &&
            distance(world.player, piece) <= pickupRadius + alignTolerance,
        )
        .sort((a, b) => distance(world.player, a) - distance(world.player, b));
      if (action && world.player.cooldown <= 0) {
        if (nearGoal && world.player.carried.length > 0) {
          // A tool that needs a standstill simply does not fire on the move.
          const moving = Math.hypot(world.player.vx, world.player.vy);
          if (canFire(selected.score, moving)) {
            const loaded =
              scoreBatch === 'all'
                ? world.player.carried.splice(0)
                : [world.player.carried.shift()!];
            const made: PieceColor[] = [];
            const mouth = cellMouth('blue', blueHive.up);
            loaded.forEach((color, index) => {
              if (Math.random() < scoreMiss) {
                bounceOut(world, 'player', color);
                emitBurst(world, mouth.x, mouth.y, '#f6d68d', 'MISS');
                return;
              }
              made.push(color);
              world.scored += 1;
              blueHive.load += tipValue(color);
              emitBurst(
                world,
                mouth.x + 30,
                mouth.y + index * 22,
                ink(color, 'blue'),
                `${blueHive.load}/${tipAt}`,
              );
            });
            storeInCell(world, 'player', made);
            if (goalTips(blueHive.load)) tipHive(world, 'player');
            world.player.cooldown = scoreCycle;
          }
        } else if (inReach.length > 0) {
          // A grabber can close on more than one at a time, so long as they
          // are both in reach and there is storage for them.
          const taken = [];
          for (const piece of inReach) {
            if (taken.length >= collectGrab) break;
            if (!canCarry(world.player.carried, piece.color, selected.carry))
              continue;
            piece.active = false;
            piece.collector = 'player';
            world.player.carried.push(piece.color);
            world.collected += 1;
            taken.push(piece);
            emitBurst(
              world,
              piece.x,
              piece.y,
              ink(piece.color, piece.alliance),
            );
          }
          if (taken.length > 0) {
            world.player.cooldown = collectCycle;
            // The intake bogs the robot down while it swallows one. On the
            // wide sweeper that is most of a second at a crawl; the twin
            // rollers barely notice.
            world.player.intake = collectDragFor;
          }
        }
      }
      const bot = world.bot;
      const redHive = world.hives.red;
      world.botThink -= dt;
      const botCapacity = difficulty === 'rookie' ? 2 : 3;
      if (world.botThink <= 0) {
        const thinkRate =
          difficulty === 'rookie' ? 0.48 : difficulty === 'rival' ? 0.25 : 0.12;
        world.botThink = thinkRate;
        if (world.time <= 10) {
          world.botTarget = RED_BASE;
          world.botIntent = 'Returning to BASE';
        } else if (
          usedSpace(bot.carried, 'bot') >= botCapacity ||
          (world.botIntent.startsWith('Heading to') &&
            bot.carried.length > 0) ||
          !world.pieces.some(
            (piece) => pickable(piece) && mayCollect(piece, 'red'),
          )
        ) {
          // Round to whichever side of the HIVE its upward CELL faces.
          world.botTarget = loadingSpot('red', redHive.up);
          world.botIntent = `Heading to the ${cellSide(redHive.up)} CELL`;
        } else {
          const targetPiece = world.pieces
            .filter((piece) => pickable(piece) && mayCollect(piece, 'red'))
            .sort((a, b) => distance(bot, a) - distance(bot, b))[0];
          if (targetPiece) {
            world.botTarget = targetPiece;
            world.botIntent = `Collecting ${targetPiece.color === 'P' ? 'NECTAR' : 'POLLEN'}`;
          }
        }
      }
      const heading = botHeading(bot, world.botTarget, botMindRef.current, dt);
      const botSpeed =
        difficulty === 'rookie' ? 165 : difficulty === 'rival' ? 205 : 240;
      // Scout-7 gets a handling rating of its own, so a tougher rival also
      // corners and stops better instead of only driving faster.
      const botAccel =
        difficulty === 'rookie' ? 520 : difficulty === 'rival' ? 660 : 840;
      const botCoast =
        difficulty === 'rookie' ? 0.82 : difficulty === 'rival' ? 0.7 : 0.58;
      if (heading.x !== 0 || heading.y !== 0) {
        const wobble =
          difficulty === 'rookie'
            ? Math.sin(world.time * 2.1) * 0.16
            : difficulty === 'rival'
              ? Math.sin(world.time * 2.7) * 0.06
              : 0;
        const angle = Math.atan2(heading.y, heading.x) + wobble;
        bot.vx += clamp(
          Math.cos(angle) * botSpeed - bot.vx,
          -botAccel * dt,
          botAccel * dt,
        );
        bot.vy += clamp(
          Math.sin(angle) * botSpeed - bot.vy,
          -botAccel * dt,
          botAccel * dt,
        );
      } else {
        bot.vx *= botCoast;
        bot.vy *= botCoast;
      }
      moveBody(bot, dt);
      resolveObstacle(bot);

      if (bot.cooldown <= 0) {
        if (
          inLoadingRange(bot, 'red', redHive.up, 95) &&
          bot.carried.length > 0
        ) {
          const color = bot.carried.shift()!;
          redHive.load += tipValue(color);
          bot.cooldown = difficulty === 'rookie' ? 0.72 : 0.45;
          const mouth = cellMouth('red', redHive.up);
          emitBurst(
            world,
            mouth.x - 30,
            mouth.y,
            ink(color, 'red'),
            `${redHive.load}/${tipAt}`,
          );
          storeInCell(world, 'bot', [color]);
          if (goalTips(redHive.load)) tipHive(world, 'bot');
        } else if (usedSpace(bot.carried, 'bot') < botCapacity) {
          const piece = world.pieces
            .filter((item) => pickable(item) && mayCollect(item, 'red'))
            .sort((a, b) => distance(bot, a) - distance(bot, b))[0];
          if (piece && distance(bot, piece) < 43) {
            piece.active = false;
            piece.collector = 'bot';
            bot.carried.push(piece.color);
            bot.cooldown = difficulty === 'rookie' ? 0.62 : 0.33;
            emitBurst(
              world,
              piece.x,
              piece.y,
              ink(piece.color, piece.alliance),
            );
          }
        }
      }

      const between = distance(world.player, world.bot);
      if (between < 62) {
        const nx = (world.player.x - world.bot.x) / Math.max(between, 1);
        const ny = (world.player.y - world.bot.y) / Math.max(between, 1);
        // Whoever grips harder gives up less ground. Scout-7 has no drivetrain
        // of its own, so it pushes like a middling one.
        const push = (62 - between) * 0.5;
        const resist = shoveResist(selected.drive);
        const playerShare = (2 * push) / (resist + 1);
        const botShare = 2 * push - playerShare;
        world.player.x += nx * playerShare;
        world.player.y += ny * playerShare;
        world.bot.x -= nx * botShare;
        world.bot.y -= ny * botShare;
        const impact = Math.min(
          0,
          (world.player.vx - bot.vx) * nx + (world.player.vy - bot.vy) * ny,
        );
        world.player.vx -= impact * nx * 0.55;
        world.player.vy -= impact * ny * 0.55;
        bot.vx += impact * nx * 0.55;
        bot.vy += impact * ny * 0.55;
      }

      releaseSpills(world, dt);
      rollBalls(world.pieces, [world.player, bot], dt);

      world.particles.forEach((particle) => {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 45 * dt;
      });
      world.particles = world.particles.filter((particle) => particle.life > 0);

      if (world.time <= 0 && !world.finished) {
        world.finished = true;
        const baseBonus = inZone(world.player, BLUE_BASE_ZONE);
        const botBase = inZone(world.bot, RED_BASE_ZONE);
        if (baseBonus) world.playerScore += 15;
        if (botBase) world.botScore += 15;
        finishRef.current({
          playerScore: world.playerScore,
          botScore: world.botScore,
          collected: world.collected,
          scored: world.scored,
          tips: world.hives.blue.tips,
          baseBonus,
        });
      }
    };

    const loop = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const running =
        !pausedRef.current && document.visibilityState === 'visible';
      if (running && readyTime > 0) {
        readyTime = Math.max(0, readyTime - delta);
        if (Math.ceil(readyTime) !== displayedCount) {
          displayedCount = Math.ceil(readyTime);
          setCountdown(displayedCount);
        }
      } else if (running) {
        accumulator += delta;
        let steps = 0;
        while (accumulator >= 1 / 60 && steps < 5) {
          update(1 / 60);
          accumulator -= 1 / 60;
          steps += 1;
        }
      }
      hudClock += delta;
      const world = worldRef.current;
      if (hudClock > 0.1) {
        const nearest = world.pieces
          .filter((piece) => pickable(piece) && mayCollect(piece, 'blue'))
          .sort(
            (a, b) => distance(world.player, a) - distance(world.player, b),
          )[0];
        const up = world.hives.blue.up;
        const nearGoal = inLoadingRange(world.player, 'blue', up, scoreRadius);
        const target = playerTarget(world, selected);
        let prompt =
          target?.kind === 'goal'
            ? `Load the ${cellSide(up)} CELL of the blue HIVE`
            : target
              ? 'Drive to an ARTIFACT'
              : 'No ARTIFACTS left on the field';
        if (nearGoal && target?.kind === 'goal')
          prompt = canFire(
            selected.score,
            Math.hypot(world.player.vx, world.player.vy),
          )
            ? 'Hold ACTION to score'
            : 'Stop to score';
        else if (
          nearest &&
          distance(world.player, nearest) <= pickupRadius &&
          canCarry(world.player.carried, nearest.color, selected.carry)
        )
          prompt = 'Hold ACTION to collect';
        if (world.time <= 10) prompt = 'Return to the blue BASE!';
        setHud({
          time: world.time,
          playerScore: world.playerScore,
          botScore: world.botScore,
          carried: usedSpace(world.player.carried, selected.carry),
          capacity,
          prompt,
          botIntent: world.botIntent,
          finalSeconds: world.time <= 10,
          goalLoad: world.hives.blue.load,
          cellUp: up,
        });
        hudClock = 0;
      }
      if (document.visibilityState === 'visible')
        // Whatever time is left over in the accumulator is how far past the
        // last physics step this frame sits.
        scene.render(
          delta,
          world,
          !running || readyTime > 0,
          Math.min(1, accumulator * 60),
        );
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [
    acceleration,
    braking,
    capacity,
    collectCycle,
    collectDrag,
    collectDragFor,
    collectGrab,
    difficulty,
    alignTolerance,
    pickupRadius,
    scoreCycle,
    scoreBatch,
    scoreMiss,
    scoreRadius,
    selected,
    speed,
    playerStrafe,
  ]);

  const setTouch = (key: keyof typeof touchRef.current, pressed: boolean) => {
    touchRef.current[key] = pressed;
  };
  const resetRobot = () => {
    const robot = worldRef.current.player;
    robot.x = BLUE_BASE.x + 40;
    robot.px = robot.x;
    robot.y = BLUE_BASE.y - 30;
    robot.py = robot.y;
    robot.vx = 0;
    robot.vy = 0;
    worldRef.current.time = Math.max(0, worldRef.current.time - 3);
    canvasRef.current?.focus({ preventScroll: true });
  };

  return (
    <main className="match-screen immersive-match">
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {hud.prompt}. You have {hud.playerScore} points. Scout-7 has{' '}
        {hud.botScore}. Using {hud.carried} of {hud.capacity} storage slots.
        {` Your HIVE's ${cellSide(hud.cellUp)} CELL is up and holds ${hud.goalLoad} of ${tipAt}; it tips at ${tipAt} for ${TIP_POINTS} points.`}
      </output>
      <header className="match-header">
        <Button variant="ghost" className="match-back" onClick={onWorkshop}>
          <ArrowLeft /> Workshop
        </Button>
        <div className="qualifier-timer-group">
          <div className="scoreboard">
            <div className="score-team blue">
              <span>YOU</span>
              <strong>{hud.playerScore}</strong>
            </div>
            <div
              className={`match-clock ${hud.finalSeconds ? 'is-final' : ''}`}
            >
              <span>QUALIFIER</span>
              <strong>{Math.ceil(hud.time)}</strong>
            </div>
            <div className="score-team red">
              <span>SCOUT-7</span>
              <strong>{hud.botScore}</strong>
            </div>
          </div>
          <div
            className={`goal-meter ${hud.goalLoad >= tipAt - 1 ? 'is-close' : ''}`}
            title={`The HIVE tips at ${tipAt} of loaded value for ${TIP_POINTS} points, then its other CELL swings up`}
          >
            <span>HIVE</span>
            <strong>
              {hud.goalLoad}
              <small>/{tipAt}</small>
            </strong>
            <em className={hud.cellUp > 0 ? 'is-near' : 'is-far'}>
              {hud.cellUp > 0 ? '▼ Near' : '▲ Far'} CELL up
            </em>
            <i>
              <b style={{ width: `${(hud.goalLoad / tipAt) * 100}%` }} />
            </i>
          </div>
        </div>
        <Button
          variant="outline"
          className="pause-button"
          onClick={() => {
            setPaused((value) => !value);
            canvasRef.current?.focus({ preventScroll: true });
          }}
        >
          <Pause /> {paused ? 'Resume' : 'Pause'}
        </Button>
      </header>

      <div className="match-body">
        <section
          className="arena-stage"
          ref={stageRef}
          aria-label="Artifact Rush game field"
        >
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="3D competition field. Drive with WASD or arrows. Hold Space to collect and score. Press C to change camera, Escape to pause."
            onPointerDown={() =>
              canvasRef.current?.focus({ preventScroll: true })
            }
          />
          <div className="arena-camera-switch" aria-label="Field camera">
            {(['arena', 'follow'] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={cameraMode === mode}
                disabled={paused}
                onClick={() => {
                  setCameraMode(mode);
                  canvasRef.current?.focus({ preventScroll: true });
                }}
              >
                {mode === 'arena' ? 'Arena' : 'Follow robot'}
              </button>
            ))}
            <kbd>C</kbd>
          </div>
          <div className="arena-event-label">
            <b>FIELD / 01</b>
            <span>Artifact Rush &middot; FIRST-inspired challenge</span>
          </div>
          {countdown > 0 && !sceneFailed && (
            <output className="match-countdown">
              <span>Drivers, ready?</span>
              <strong>{countdown}</strong>
              <p>WASD to drive &middot; Space to collect & score</p>
            </output>
          )}
          {sceneFailed && (
            <div className="pause-overlay">
              <h2>The 3D field could not start</h2>
              <p>
                Enable hardware acceleration or try a browser with WebGL
                support.
              </p>
              <Button onClick={onWorkshop}>Back to workshop</Button>
            </div>
          )}
          <div className="bot-intent">
            <span>SCOUT-7</span>
            {hud.botIntent}
          </div>
          {paused && (
            <div className="pause-overlay">
              <Pause />
              <h2>Match paused</h2>
              <p>Take your time. The clock and camera are stopped.</p>
              <GraphicsPicker tone="dark" />
              <Button
                onClick={() => {
                  setPaused(false);
                  canvasRef.current?.focus({ preventScroll: true });
                }}
              >
                Keep playing
              </Button>
            </div>
          )}
        </section>

        <aside className="match-console">
          <div className="console-section">
            <p className="eyebrow">DRIVER STATION</p>
            <h1>{hud.prompt}</h1>
            <p className="carry-readout">
              STORAGE <strong>{hud.carried}</strong> / {hud.capacity}
            </p>
          </div>
          <div className="desktop-controls">
            <div className="key-grid" aria-label="Keyboard controls">
              <span />
              <kbd>W</kbd>
              <span />
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
            </div>
            <div className="key-copy">
              <strong>DRIVE</strong>
              <span>WASD or arrow keys</span>
            </div>
            <kbd className="space-key">SPACE</kbd>
            <div className="key-copy">
              <strong>ACTION</strong>
              <span>Collect or score</span>
            </div>
          </div>
          <div className="touch-controls" aria-label="Touch controls">
            <div className="touch-pad">
              <button
                type="button"
                aria-label="Drive up"
                onPointerDown={() => setTouch('up', true)}
                onPointerUp={() => setTouch('up', false)}
                onPointerCancel={() => setTouch('up', false)}
                onLostPointerCapture={() => setTouch('up', false)}
                onPointerLeave={() => setTouch('up', false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setTouch('up', true);
                  }
                }}
                onKeyUp={() => setTouch('up', false)}
                onBlur={() => setTouch('up', false)}
              >
                <ArrowUp />
              </button>
              <button
                type="button"
                aria-label="Drive left"
                onPointerDown={() => setTouch('left', true)}
                onPointerUp={() => setTouch('left', false)}
                onPointerCancel={() => setTouch('left', false)}
                onLostPointerCapture={() => setTouch('left', false)}
                onPointerLeave={() => setTouch('left', false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setTouch('left', true);
                  }
                }}
                onKeyUp={() => setTouch('left', false)}
                onBlur={() => setTouch('left', false)}
              >
                <ArrowLeft />
              </button>
              <button
                type="button"
                aria-label="Drive down"
                onPointerDown={() => setTouch('down', true)}
                onPointerUp={() => setTouch('down', false)}
                onPointerCancel={() => setTouch('down', false)}
                onLostPointerCapture={() => setTouch('down', false)}
                onPointerLeave={() => setTouch('down', false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setTouch('down', true);
                  }
                }}
                onKeyUp={() => setTouch('down', false)}
                onBlur={() => setTouch('down', false)}
              >
                <ArrowDown />
              </button>
              <button
                type="button"
                aria-label="Drive right"
                onPointerDown={() => setTouch('right', true)}
                onPointerUp={() => setTouch('right', false)}
                onPointerCancel={() => setTouch('right', false)}
                onLostPointerCapture={() => setTouch('right', false)}
                onPointerLeave={() => setTouch('right', false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setTouch('right', true);
                  }
                }}
                onKeyUp={() => setTouch('right', false)}
                onBlur={() => setTouch('right', false)}
              >
                <ArrowRight />
              </button>
            </div>
            <button
              type="button"
              className="action-pad"
              onPointerDown={() => setTouch('action', true)}
              onPointerUp={() => setTouch('action', false)}
              onPointerCancel={() => setTouch('action', false)}
              onLostPointerCapture={() => setTouch('action', false)}
              onPointerLeave={() => setTouch('action', false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setTouch('action', true);
                }
              }}
              onKeyUp={() => setTouch('action', false)}
              onBlur={() => setTouch('action', false)}
            >
              <Zap />
              ACTION
            </button>
          </div>
          <Button
            variant="ghost"
            className="unstuck-button"
            onClick={resetRobot}
          >
            <RotateCcw /> Reset robot <span>&minus;3 sec</span>
          </Button>
          <div className="match-tip">
            <strong>PIT TIP</strong>
            <p>
              ARTIFACTS score nothing alone. Load the HIVE&apos;s upward CELL to{' '}
              {tipAt} and it tips for {TIP_POINTS}, pouring them out on that
              side. Then its other CELL is up - go round and load it from the
              other side.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
