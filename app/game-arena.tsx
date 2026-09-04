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
type World = {
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
    pieces: pieceLayout.map(([x, y, color], id) => ({
      id,
      x,
      y,
      color,
      active: true,
    })),
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
  const ox = 500;
  const oy = 326;
  const radius = 76;
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

function drawRobot(
  ctx: CanvasRenderingContext2D,
  robot: Robot,
  alliance: 'blue' | 'red',
  selected?: Record<string, string>,
) {
  ctx.save();
  ctx.translate(robot.x, robot.y);
  ctx.rotate(robot.angle + Math.PI / 2);
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = alliance === 'blue' ? '#208de3' : '#f45159';
  ctx.beginPath();
  ctx.roundRect(-27, -33, 54, 66, 10);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#091722';
  ctx.fillRect(-23, -17, 46, 33);
  ctx.fillStyle = '#dceaf2';
  ctx.fillRect(-18, -12, 36, 4);
  ctx.fillStyle = alliance === 'blue' ? '#8bd0ff' : '#ff9da2';
  ctx.beginPath();
  ctx.moveTo(0, -43);
  ctx.lineTo(-12, -28);
  ctx.lineTo(12, -28);
  ctx.closePath();
  ctx.fill();

  const wheelColor = selected?.drive === 'comet' ? '#ff8a31' : '#c9fa4f';
  ctx.fillStyle = wheelColor;
  [-24, 24].forEach((x) =>
    [-20, 20].forEach((y) => {
      ctx.beginPath();
      ctx.roundRect(x - 6, y - 10, 12, 20, 4);
      ctx.fill();
    }),
  );
  ctx.strokeStyle = selected?.collect === 'pinpoint' ? '#facc15' : '#ff8a31';
  ctx.lineWidth = selected?.collect === 'twinflex' ? 6 : 9;
  ctx.beginPath();
  ctx.moveTo(-22, -39);
  ctx.lineTo(22, -39);
  ctx.stroke();
  if (selected?.collect === 'twinflex') {
    ctx.beginPath();
    ctx.moveTo(-19, -47);
    ctx.lineTo(19, -47);
    ctx.stroke();
  }

  robot.carried.forEach((color, index) => {
    ctx.fillStyle = color === 'P' ? '#b977ff' : '#b9f54b';
    ctx.beginPath();
    ctx.arc(-11 + index * 11, 4, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawField(
  ctx: CanvasRenderingContext2D,
  world: World,
  selected: Record<string, string>,
  width: number,
  height: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / FIELD_W, height / FIELD_H);
  const offsetX = (width - FIELD_W * scale) / 2;
  const offsetY = (height - FIELD_H * scale) / 2;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#0b202c';
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.strokeStyle = 'rgba(151,190,210,.09)';
  ctx.lineWidth = 1;
  for (let x = 20; x < FIELD_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
    ctx.stroke();
  }
  for (let y = 10; y < FIELD_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
    ctx.stroke();
  }

  ctx.lineWidth = 7;
  ctx.strokeStyle = '#2a5064';
  ctx.strokeRect(10, 10, FIELD_W - 20, FIELD_H - 20);
  ctx.strokeStyle = 'rgba(237,247,251,.18)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(FIELD_W / 2, 18);
  ctx.lineTo(FIELD_W / 2, FIELD_H - 18);
  ctx.stroke();
  ctx.setLineDash([]);

  const finalPulse =
    world.time <= 10 ? 0.7 + Math.sin(world.time * 8) * 0.2 : 0.32;
  [
    [BLUE_BASE, '#2499ed'],
    [RED_BASE, '#f4525a'],
  ].forEach(([base, color]) => {
    const point = base as { x: number; y: number };
    ctx.globalAlpha = finalPulse;
    ctx.fillStyle = color as string;
    ctx.beginPath();
    ctx.roundRect(point.x - 76, point.y - 54, 152, 108, 15);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color as string;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '700 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BASE', point.x, point.y + 4);
  });

  [
    [BLUE_GOAL, '#2499ed', 'BLUE GOAL'],
    [RED_GOAL, '#f4525a', 'RED GOAL'],
  ].forEach(([goal, color, label]) => {
    const point = goal as { x: number; y: number };
    ctx.fillStyle = 'rgba(4,12,18,.7)';
    ctx.strokeStyle = color as string;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color as string;
    ctx.font = '700 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label as string, point.x, point.y + 4);
  });

  ctx.save();
  ctx.translate(500, 326);
  ctx.fillStyle = '#132f40';
  ctx.strokeStyle = '#577a8e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = Math.cos(angle) * 73;
    const y = Math.sin(angle) * 73;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#89aabd';
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('OBELISK', 0, 4);
  ctx.restore();

  if (selected.assist === 'pathfinder') {
    const activePiece = world.pieces
      .filter((piece) => piece.active)
      .sort((a, b) => distance(world.player, a) - distance(world.player, b))[0];
    if (activePiece) {
      ctx.strokeStyle = 'rgba(201,250,79,.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(world.player.x, world.player.y);
      ctx.lineTo(activePiece.x, activePiece.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  world.pieces.forEach((piece) => {
    if (!piece.active) return;
    ctx.shadowColor = piece.color === 'P' ? '#a855f7' : '#9be63f';
    ctx.shadowBlur = 13;
    ctx.fillStyle = piece.color === 'P' ? '#a966ef' : '#b6ed4e';
    ctx.beginPath();
    ctx.arc(piece.x, piece.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = piece.color === 'P' ? '#f0dcff' : '#173008';
    ctx.font = '800 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(piece.color, piece.x, piece.y + 3.5);
  });

  world.particles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    if (particle.text) {
      ctx.font = '800 16px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(particle.text, particle.x, particle.y);
    } else {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;

  drawRobot(ctx, world.player, 'blue', selected);
  drawRobot(ctx, world.bot, 'red');
  ctx.restore();
}

export function GameArena({
  selected,
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
  const [hud, setHud] = useState<Hud>({
    time: MATCH_TIME,
    playerScore: 0,
    botScore: 0,
    carried: 0,
    capacity: 2,
    prompt: 'Drive to an ARTIFACT',
    botIntent: 'Scanning the field',
    finalSeconds: false,
  });

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const capacity =
    selected.carry === 'stackpack' ? 5 : selected.carry === 'lowbin' ? 3 : 2;
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
  const speed =
    selected.drive === 'comet'
      ? 275
      : selected.drive === 'orbit'
        ? 295
        : selected.drive === 'trailblazer'
          ? 220
          : 205;
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
      if (event.key === 'Escape') setPaused((value) => !value);
    };
    const up = (event: KeyboardEvent) =>
      keysRef.current.delete(event.key.toLowerCase());
    const blur = () => keysRef.current.clear();
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let dpr = 1;
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      width = Math.max(300, rect.width);
      height = Math.max(300, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);

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
      const accel = selected.drive === 'anchor' ? 1050 : 820;
      const targetVx = ix * speed;
      const targetVy = iy * speed;
      world.player.vx += clamp(
        targetVx - world.player.vx,
        -accel * dt,
        accel * dt,
      );
      world.player.vy += clamp(
        targetVy - world.player.vy,
        -accel * dt,
        accel * dt,
      );
      if (inputLength === 0) {
        world.player.vx *= Math.pow(0.04, dt);
        world.player.vy *= Math.pow(0.04, dt);
      }
      world.player.x = clamp(
        world.player.x + world.player.vx * dt,
        43,
        FIELD_W - 43,
      );
      world.player.y = clamp(
        world.player.y + world.player.vy * dt,
        43,
        FIELD_H - 43,
      );
      if (Math.hypot(world.player.vx, world.player.vy) > 14)
        world.player.angle = Math.atan2(world.player.vy, world.player.vx);
      resolveObstacle(world.player);

      const action = keys.has(' ') || keys.has('space') || touch.action;
      const nearGoal = distance(world.player, BLUE_GOAL) <= scoreRadius;
      const nearestPiece = world.pieces
        .filter((piece) => piece.active)
        .sort(
          (a, b) => distance(world.player, a) - distance(world.player, b),
        )[0];
      if (action && world.player.cooldown <= 0) {
        if (nearGoal && world.player.carried.length > 0) {
          const color = world.player.carried.shift()!;
          const expected = PATTERN[world.playerSequence % PATTERN.length];
          const match = color === expected;
          const points = match ? 8 : 5;
          world.playerScore += points;
          world.playerSequence += 1;
          world.scored += 1;
          if (match) world.patternMatches += 1;
          world.player.cooldown =
            selected.score === 'tiptray' ? 0.18 : scoreDelay;
          emitBurst(
            world,
            BLUE_GOAL.x + 30,
            BLUE_GOAL.y,
            color === 'P' ? '#b977ff' : '#b9f54b',
            `+${points}`,
          );
        } else if (
          nearestPiece &&
          distance(world.player, nearestPiece) <= pickupRadius &&
          world.player.carried.length < capacity
        ) {
          nearestPiece.active = false;
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
      const bdx = world.botTarget.x - bot.x;
      const bdy = world.botTarget.y - bot.y;
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
      bot.x = clamp(bot.x + bot.vx * dt, 43, FIELD_W - 43);
      bot.y = clamp(bot.y + bot.vy * dt, 43, FIELD_H - 43);
      if (Math.hypot(bot.vx, bot.vy) > 10)
        bot.angle = Math.atan2(bot.vy, bot.vx);
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
      }

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
      if (!pausedRef.current && document.visibilityState === 'visible') {
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
        let prompt =
          world.player.carried.length >= capacity
            ? 'Drive to the blue GOAL'
            : 'Drive to an ARTIFACT';
        if (nearGoal && world.player.carried.length > 0)
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
        });
        hudClock = 0;
      }
      drawField(ctx, world, selected, width, height, dpr);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    capacity,
    difficulty,
    pickupRadius,
    scoreDelay,
    scoreRadius,
    selected,
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
  };

  return (
    <main className="match-screen">
      <header className="match-header">
        <Button variant="ghost" className="match-back" onClick={onWorkshop}>
          <ArrowLeft /> Workshop
        </Button>
        <div className="scoreboard">
          <div className="score-team blue">
            <span>YOU</span>
            <strong>{hud.playerScore}</strong>
          </div>
          <div className={`match-clock ${hud.finalSeconds ? 'is-final' : ''}`}>
            <span>QUALIFIER</span>
            <strong>{Math.ceil(hud.time)}</strong>
          </div>
          <div className="score-team red">
            <span>SCOUT-7</span>
            <strong>{hud.botScore}</strong>
          </div>
        </div>
        <Button
          variant="outline"
          className="pause-button"
          onClick={() => setPaused((value) => !value)}
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
          <canvas ref={canvasRef} />
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
              <Button onClick={() => setPaused(false)}>Keep playing</Button>
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
                aria-label="Drive up"
                onPointerDown={() => setTouch('up', true)}
                onPointerUp={() => setTouch('up', false)}
                onPointerLeave={() => setTouch('up', false)}
              >
                <ArrowUp />
              </button>
              <button
                aria-label="Drive left"
                onPointerDown={() => setTouch('left', true)}
                onPointerUp={() => setTouch('left', false)}
                onPointerLeave={() => setTouch('left', false)}
              >
                <ArrowLeft />
              </button>
              <button
                aria-label="Drive down"
                onPointerDown={() => setTouch('down', true)}
                onPointerUp={() => setTouch('down', false)}
                onPointerLeave={() => setTouch('down', false)}
              >
                <ArrowDown />
              </button>
              <button
                aria-label="Drive right"
                onPointerDown={() => setTouch('right', true)}
                onPointerUp={() => setTouch('right', false)}
                onPointerLeave={() => setTouch('right', false)}
              >
                <ArrowRight />
              </button>
            </div>
            <button
              className="action-pad"
              onPointerDown={() => setTouch('action', true)}
              onPointerUp={() => setTouch('action', false)}
              onPointerLeave={() => setTouch('action', false)}
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
