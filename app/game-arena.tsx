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
import { createArenaScene, type CameraMode } from './arena-scene';
import type { AssemblyCategory } from './assembly-bay';
import { driveVelocity, moveBody, rollBalls } from './robot-physics';
import {
  carryCapacity,
  playerTarget,
  canSkipToEndgame,
  skipToEndgame,
} from './match-guidance';

export type Difficulty = 'rookie' | 'rival' | 'ace';

export type MatchResult = {
  playerScore: number;
  botScore: number;
  collected: number;
  scored: number;
  patternMatches: number;
  baseBonus: boolean;
};

type ArenaProps = {
  selected: Record<string, string>;
  mountSlots: Record<AssemblyCategory, number>;
  difficulty: Difficulty;
  onFinish: (result: MatchResult) => void;
  onWorkshop: () => void;
};

type PieceColor = 'P' | 'G';
type Piece = {
  id: number;
  x: number;
  y: number;
  color: PieceColor;
  active: boolean;
  vx?: number;
  vy?: number;
  collector?: 'player' | 'bot';
};
type Robot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  carried: PieceColor[];
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
  playerSequence: number;
  botSequence: number;
  collected: number;
  scored: number;
  patternMatches: number;
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
  canSkip: boolean;
};

const FIELD_W = 1000;
const FIELD_H = 650;
const MATCH_TIME = 75;
const BLUE_GOAL = { x: 95, y: 108 };
const RED_GOAL = { x: 905, y: 108 };
const BLUE_BASE = { x: 118, y: 552 };
const RED_BASE = { x: 882, y: 552 };
const PATTERN: PieceColor[] = ['P', 'G', 'P'];

const pieceLayout: [number, number, PieceColor][] = [
  [310, 128, 'P'],
  [390, 105, 'G'],
  [485, 128, 'P'],
  [590, 108, 'G'],
  [684, 132, 'P'],
  [264, 255, 'G'],
  [370, 242, 'P'],
  [458, 276, 'G'],
  [548, 245, 'P'],
  [650, 263, 'G'],
  [742, 238, 'P'],
  [292, 402, 'P'],
  [385, 438, 'G'],
  [485, 405, 'P'],
  [588, 439, 'G'],
  [698, 397, 'P'],
  [348, 544, 'G'],
  [500, 530, 'P'],
  [650, 548, 'G'],
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function createWorld(): World {
  return {
    player: {
      x: 155,
      y: 520,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      carried: [],
      cooldown: 0,
    },
    bot: {
      x: 845,
      y: 520,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      carried: [],
      cooldown: 0,
    },
    pieces: pieceLayout.map(([x, y, color], id) => {
      const dx = x - 500,
        dy = y - 326,
        radius = Math.hypot(dx, dy);
      return {
        id,
        x: radius < 105 ? 500 + (dx / radius) * 110 : x,
        y: radius < 105 ? 326 + (dy / radius) * 110 : y,
        color,
        active: true,
      };
    }),
    particles: [],
    time: MATCH_TIME,
    playerScore: 0,
    botScore: 0,
    playerSequence: 0,
    botSequence: 0,
    collected: 0,
    scored: 0,
    patternMatches: 0,
    botThink: 0,
    botTarget: { x: 500, y: 325 },
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

function resolveObstacle(robot: Robot) {
  for (const obstacle of [
    { x: 500, y: 326, radius: 76 },
    { ...BLUE_GOAL, radius: 45 },
    { ...RED_GOAL, radius: 45 },
  ]) {
    const ox = obstacle.x;
    const oy = obstacle.y;
    const radius = obstacle.radius;
    const dx = robot.x - ox;
    const dy = robot.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < radius + 29) {
      const nx = dx / Math.max(d, 1);
      const ny = dy / Math.max(d, 1);
      robot.x = ox + nx * (radius + 29);
      robot.y = oy + ny * (radius + 29);
      const dot = robot.vx * nx + robot.vy * ny;
      if (dot < 0) {
        robot.vx -= dot * nx;
        robot.vy -= dot * ny;
      }
    }
  }
}

export function GameArena({
  selected,
  mountSlots,
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
    capacity: 2,
    prompt: 'Drive to an ARTIFACT',
    botIntent: 'Scanning the field',
    finalSeconds: false,
    canSkip: false,
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
  const pickupRadius =
    selected.collect === 'widewave'
      ? 78
      : selected.collect === 'twinflex'
        ? 66
        : selected.collect === 'sidesweep'
          ? 59
          : 45;
  const scoreRadius =
    selected.reach === 'cascade'
      ? 150
      : selected.reach === 'turret'
        ? 138
        : selected.reach === 'elevator'
          ? 120
          : 108;
  const baseSpeed =
    selected.drive === 'comet'
      ? 275
      : selected.drive === 'orbit'
        ? 295
        : selected.drive === 'trailblazer'
          ? 220
          : 205;
  const speed = baseSpeed * (selected.assist === 'align' ? 0.94 : 1);
  const alignTolerance = selected.assist === 'align' ? 12 : 0;
  const scoreDelay =
    selected.score === 'burst'
      ? 0.22
      : selected.score === 'tiptray'
        ? 0.7
        : selected.score === 'flywheel'
          ? 0.3
          : 0.43;

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
      if (event.key.toLowerCase() === 'c' && !event.repeat)
        setCameraMode((value) =>
          value === 'arena' ? 'follow' : value === 'follow' ? 'orbit' : 'arena',
        );
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
      scene = createArenaScene(canvas, selected, worldRef.current, mountSlots);
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
      world.time = Math.max(0, world.time - dt);
      world.player.cooldown = Math.max(0, world.player.cooldown - dt);
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
      const accel = selected.drive === 'anchor' ? 1050 : 820;
      driveVelocity(
        world.player,
        ix,
        iy,
        speed,
        accel,
        world.player.carried.length,
        dt,
      );
      moveBody(world.player, dt);
      resolveObstacle(world.player);

      const action = keys.has(' ') || keys.has('space') || touch.action;
      const nearGoal =
        distance(world.player, BLUE_GOAL) <= scoreRadius + alignTolerance;
      const nearestPiece = world.pieces
        .filter((piece) => piece.active)
        .sort(
          (a, b) => distance(world.player, a) - distance(world.player, b),
        )[0];
      if (action && world.player.cooldown <= 0) {
        if (nearGoal && world.player.carried.length > 0) {
          const scoredColors =
            selected.score === 'tiptray'
              ? world.player.carried.splice(0)
              : [world.player.carried.shift()!];
          scoredColors.forEach((color, index) => {
            const expected = PATTERN[world.playerSequence % PATTERN.length];
            const match = color === expected;
            const points = match ? 8 : 5;
            world.playerScore += points;
            world.playerSequence += 1;
            world.scored += 1;
            if (match) world.patternMatches += 1;
            emitBurst(
              world,
              BLUE_GOAL.x + 30,
              BLUE_GOAL.y + index * 22,
              color === 'P' ? '#b977ff' : '#b9f54b',
              `+${points}`,
            );
          });
          world.player.cooldown = scoreDelay;
        } else if (
          nearestPiece &&
          distance(world.player, nearestPiece) <=
            pickupRadius + alignTolerance &&
          world.player.carried.length < capacity
        ) {
          nearestPiece.active = false;
          nearestPiece.collector = 'player';
          world.player.carried.push(nearestPiece.color);
          world.collected += 1;
          world.player.cooldown =
            selected.collect === 'twinflex'
              ? 0.16
              : selected.collect === 'pinpoint'
                ? 0.46
                : 0.28;
          emitBurst(
            world,
            nearestPiece.x,
            nearestPiece.y,
            nearestPiece.color === 'P' ? '#b977ff' : '#b9f54b',
          );
        }
      }

      const bot = world.bot;
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
          bot.carried.length >= botCapacity ||
          (world.botIntent === 'Heading to the GOAL' &&
            bot.carried.length > 0) ||
          !world.pieces.some((piece) => piece.active)
        ) {
          world.botTarget = RED_GOAL;
          world.botIntent = 'Heading to the GOAL';
        } else {
          const targetPiece = world.pieces
            .filter((piece) => piece.active)
            .sort((a, b) => distance(bot, a) - distance(bot, b))[0];
          if (targetPiece) {
            world.botTarget = targetPiece;
            world.botIntent = `Collecting ${targetPiece.color === 'P' ? 'purple' : 'green'}`;
          }
        }
      }
      let bdx = world.botTarget.x - bot.x;
      let bdy = world.botTarget.y - bot.y;
      const centerDistance = Math.hypot(bot.x - 500, bot.y - 326);
      const approachDot = bdx * (bot.x - 500) + bdy * (bot.y - 326);
      if (centerDistance < 165 && approachDot < 0) {
        const side = bdx * (bot.y - 326) - bdy * (bot.x - 500) > 0 ? 1 : -1;
        const nx = (bot.x - 500) / Math.max(centerDistance, 1);
        const ny = (bot.y - 326) / Math.max(centerDistance, 1);
        bdx = side * ny * 110 + nx * 28;
        bdy = -side * nx * 110 + ny * 28;
      }
      const bd = Math.hypot(bdx, bdy);
      const botSpeed =
        difficulty === 'rookie' ? 165 : difficulty === 'rival' ? 205 : 240;
      if (bd > 7) {
        const wobble =
          difficulty === 'rookie'
            ? Math.sin(world.time * 2.1) * 0.16
            : difficulty === 'rival'
              ? Math.sin(world.time * 2.7) * 0.06
              : 0;
        const angle = Math.atan2(bdy, bdx) + wobble;
        bot.vx += clamp(
          Math.cos(angle) * botSpeed - bot.vx,
          -660 * dt,
          660 * dt,
        );
        bot.vy += clamp(
          Math.sin(angle) * botSpeed - bot.vy,
          -660 * dt,
          660 * dt,
        );
      } else {
        bot.vx *= 0.7;
        bot.vy *= 0.7;
      }
      moveBody(bot, dt);
      resolveObstacle(bot);

      if (bot.cooldown <= 0) {
        if (distance(bot, RED_GOAL) < 95 && bot.carried.length > 0) {
          const color = bot.carried.shift()!;
          const expected = PATTERN[world.botSequence % PATTERN.length];
          const points = color === expected ? 8 : 5;
          world.botScore += points;
          world.botSequence += 1;
          bot.cooldown = difficulty === 'rookie' ? 0.72 : 0.45;
          emitBurst(
            world,
            RED_GOAL.x - 30,
            RED_GOAL.y,
            color === 'P' ? '#b977ff' : '#b9f54b',
            `+${points}`,
          );
        } else if (bot.carried.length < botCapacity) {
          const piece = world.pieces
            .filter((item) => item.active)
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
              piece.color === 'P' ? '#b977ff' : '#b9f54b',
            );
          }
        }
      }

      const between = distance(world.player, world.bot);
      if (between < 62) {
        const nx = (world.player.x - world.bot.x) / Math.max(between, 1);
        const ny = (world.player.y - world.bot.y) / Math.max(between, 1);
        const push = (62 - between) * 0.5;
        world.player.x += nx * push;
        world.player.y += ny * push;
        world.bot.x -= nx * push;
        world.bot.y -= ny * push;
        const impact = Math.min(
          0,
          (world.player.vx - bot.vx) * nx + (world.player.vy - bot.vy) * ny,
        );
        world.player.vx -= impact * nx * 0.55;
        world.player.vy -= impact * ny * 0.55;
        bot.vx += impact * nx * 0.55;
        bot.vy += impact * ny * 0.55;
      }

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
        const baseBonus = distance(world.player, BLUE_BASE) < 88;
        const botBase = distance(world.bot, RED_BASE) < 88;
        if (baseBonus) world.playerScore += 15;
        if (botBase) world.botScore += 15;
        finishRef.current({
          playerScore: world.playerScore,
          botScore: world.botScore,
          collected: world.collected,
          scored: world.scored,
          patternMatches: world.patternMatches,
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
          .filter((piece) => piece.active)
          .sort(
            (a, b) => distance(world.player, a) - distance(world.player, b),
          )[0];
        const nearGoal = distance(world.player, BLUE_GOAL) <= scoreRadius;
        const target = playerTarget(world, selected);
        let prompt =
          target?.kind === 'goal'
            ? 'Drive to the blue GOAL'
            : target?.kind === 'piece' && selected.assist === 'coloreye'
              ? `Collect a ${target.color === 'P' ? 'purple' : 'green'} ARTIFACT`
              : target
                ? 'Drive to an ARTIFACT'
                : 'No ARTIFACTS left on the field';
        if (nearGoal && target?.kind === 'goal')
          prompt = 'Hold ACTION to score';
        else if (
          nearest &&
          distance(world.player, nearest) <= pickupRadius &&
          world.player.carried.length < capacity
        )
          prompt = 'Hold ACTION to collect';
        if (world.time <= 10) prompt = 'Return to the blue BASE!';
        setHud({
          time: world.time,
          playerScore: world.playerScore,
          botScore: world.botScore,
          carried: world.player.carried.length,
          capacity,
          prompt,
          botIntent: world.botIntent,
          finalSeconds: world.time <= 10,
          canSkip: canSkipToEndgame(world),
        });
        hudClock = 0;
      }
      if (document.visibilityState === 'visible')
        scene.render(delta, world, !running || readyTime > 0);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [
    capacity,
    difficulty,
    alignTolerance,
    pickupRadius,
    scoreDelay,
    scoreRadius,
    selected,
    mountSlots,
    speed,
  ]);

  const setTouch = (key: keyof typeof touchRef.current, pressed: boolean) => {
    touchRef.current[key] = pressed;
  };
  const resetRobot = () => {
    const robot = worldRef.current.player;
    robot.x = 155;
    robot.y = 520;
    robot.vx = 0;
    robot.vy = 0;
    worldRef.current.time = Math.max(0, worldRef.current.time - 3);
    canvasRef.current?.focus({ preventScroll: true });
  };
  const skipQualifier = () => {
    if (!skipToEndgame(worldRef.current)) return;
    setHud((current) => ({
      ...current,
      time: 15,
      canSkip: false,
      finalSeconds: false,
    }));
    canvasRef.current?.focus({ preventScroll: true });
  };

  return (
    <main className="match-screen immersive-match">
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {hud.prompt}. You have {hud.playerScore} points. Scout-7 has{' '}
        {hud.botScore}. Carrying {hud.carried} of {hud.capacity} artifacts.
        {hud.canSkip && ' All balls collected. You can skip to 15 seconds.'}
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
          {hud.canSkip && (
            <Button
              className="skip-qualifier-button"
              onClick={skipQualifier}
              title="All balls collected — jump to the final 15 seconds"
            >
              Skip to 15s
            </Button>
          )}
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
            {(['arena', 'follow', 'orbit'] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={cameraMode === mode}
                onClick={() => {
                  setCameraMode(mode);
                  canvasRef.current?.focus({ preventScroll: true });
                }}
              >
                {mode === 'arena'
                  ? 'Arena'
                  : mode === 'follow'
                    ? 'Follow robot'
                    : 'Free orbit'}
              </button>
            ))}
            <kbd>C</kbd>
          </div>
          <div className="arena-event-label">
            <b>FIELD / 01</b>
            <span>Artifact Rush · FIRST-inspired challenge</span>
          </div>
          {countdown > 0 && !sceneFailed && (
            <output className="match-countdown">
              <span>Drivers, ready?</span>
              <strong>{countdown}</strong>
              <p>WASD to drive · Space to collect & score</p>
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
          <div
            className="pattern-card"
            aria-label="Target pattern: purple, green, purple"
          >
            <span> TARGET PATTERN</span>
            <div>
              <i className="purple">P</i>
              <i className="green">G</i>
              <i className="purple">P</i>
            </div>
          </div>
          <div className="bot-intent">
            <span>SCOUT-7</span>
            {hud.botIntent}
          </div>
          {paused && (
            <div className="pause-overlay">
              <Pause />
              <h2>Match paused</h2>
              <p>Take your time. The clock is stopped.</p>
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
              CARRYING <strong>{hud.carried}</strong> / {hud.capacity}
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
            <RotateCcw /> Reset robot <span>−3 sec</span>
          </Button>
          <div className="match-tip">
            <strong>PIT TIP</strong>
            <p>Correct pattern colors score 8. Other colors still score 5.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
