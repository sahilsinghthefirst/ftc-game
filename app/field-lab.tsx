'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Flag,
  Gauge,
  Grip,
  Lightbulb,
  MoveUp,
  PackageOpen,
  Play,
  RotateCcw,
  ScanLine,
  Sparkles,
  Target,
  Trophy,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Difficulty, GameArena, MatchResult } from './game-arena';

type Category = 'drive' | 'collect' | 'carry' | 'reach' | 'score' | 'assist';
type Trait = 'speed' | 'control' | 'collect' | 'score';

type Module = {
  id: string;
  category: Category;
  name: string;
  code: string;
  blurb: string;
  strength: string;
  tradeoff: string;
  traits: Record<Trait, number>;
  weight: number;
  power: number;
  space: number;
};

const categories: { id: Category; label: string; icon: typeof Gauge }[] = [
  { id: 'drive', label: 'Move', icon: Gauge },
  { id: 'collect', label: 'Collect', icon: Grip },
  { id: 'carry', label: 'Carry', icon: PackageOpen },
  { id: 'reach', label: 'Reach', icon: MoveUp },
  { id: 'score', label: 'Score', icon: Target },
  { id: 'assist', label: 'Assist', icon: ScanLine },
];

const modules: Module[] = [
  {
    id: 'comet',
    category: 'drive',
    name: 'Comet Mecanum',
    code: 'DRV-01',
    blurb: 'Glides sideways to line up fast.',
    strength: 'Moves in every direction',
    tradeoff: 'Uses more power',
    traits: { speed: 4, control: 3, collect: 0, score: 0 },
    weight: 3,
    power: 4,
    space: 3,
  },
  {
    id: 'trailblazer',
    category: 'drive',
    name: 'Trailblazer 6WD',
    code: 'DRV-02',
    blurb: 'Pushes hard and tracks straight.',
    strength: 'Stable under contact',
    tradeoff: 'Wide turning circle',
    traits: { speed: 2, control: 4, collect: 0, score: 0 },
    weight: 4,
    power: 3,
    space: 4,
  },
  {
    id: 'orbit',
    category: 'drive',
    name: 'Orbit Omni',
    code: 'DRV-03',
    blurb: 'Light, quick, and easy to turn.',
    strength: 'Fast acceleration',
    tradeoff: 'Slides when stopping',
    traits: { speed: 4, control: 2, collect: 0, score: 0 },
    weight: 2,
    power: 3,
    space: 2,
  },
  {
    id: 'anchor',
    category: 'drive',
    name: 'Anchor Traction',
    code: 'DRV-04',
    blurb: 'A compact base with serious grip.',
    strength: 'Precise control',
    tradeoff: 'Lower top speed',
    traits: { speed: 1, control: 5, collect: 0, score: 0 },
    weight: 3,
    power: 2,
    space: 2,
  },
  {
    id: 'widewave',
    category: 'collect',
    name: 'WideWave Roller',
    code: 'INT-01',
    blurb: 'Sweeps up ARTIFACTS across the front.',
    strength: 'Large pickup zone',
    tradeoff: 'Adds front weight',
    traits: { speed: 0, control: 0, collect: 5, score: 0 },
    weight: 3,
    power: 3,
    space: 3,
  },
  {
    id: 'twinflex',
    category: 'collect',
    name: 'TwinFlex Intake',
    code: 'INT-02',
    blurb: 'Two soft rollers pull pieces in quickly.',
    strength: 'Fast collection',
    tradeoff: 'Can grab the wrong color',
    traits: { speed: 0, control: 0, collect: 4, score: 0 },
    weight: 2,
    power: 4,
    space: 3,
  },
  {
    id: 'pinpoint',
    category: 'collect',
    name: 'Pinpoint Claw',
    code: 'INT-03',
    blurb: 'Grabs one exact piece at a time.',
    strength: 'Very accurate',
    tradeoff: 'Small pickup zone',
    traits: { speed: 0, control: 1, collect: 2, score: 1 },
    weight: 2,
    power: 2,
    space: 2,
  },
  {
    id: 'sidesweep',
    category: 'collect',
    name: 'SideSweep Scoop',
    code: 'INT-04',
    blurb: 'Funnels loose pieces into the robot.',
    strength: 'Works while turning',
    tradeoff: 'Slower intake',
    traits: { speed: 0, control: 0, collect: 3, score: 0 },
    weight: 2,
    power: 1,
    space: 4,
  },
  {
    id: 'lowbin',
    category: 'carry',
    name: 'Low Rider Hopper',
    code: 'STR-01',
    blurb: 'Keeps three pieces low and steady.',
    strength: 'Easy to control',
    tradeoff: 'Small capacity',
    traits: { speed: 1, control: 2, collect: 0, score: 0 },
    weight: 2,
    power: 0,
    space: 3,
  },
  {
    id: 'stackpack',
    category: 'carry',
    name: 'StackPack Magazine',
    code: 'STR-02',
    blurb: 'Stores up to five ARTIFACTS.',
    strength: 'High capacity',
    tradeoff: 'Tall and heavy',
    traits: { speed: -1, control: -1, collect: 2, score: 1 },
    weight: 4,
    power: 1,
    space: 4,
  },
  {
    id: 'beltbridge',
    category: 'carry',
    name: 'BeltBridge',
    code: 'STR-03',
    blurb: 'Moves pieces straight to the scorer.',
    strength: 'Quick transfers',
    tradeoff: 'Constant power draw',
    traits: { speed: 0, control: 0, collect: 1, score: 2 },
    weight: 2,
    power: 3,
    space: 3,
  },
  {
    id: 'pocket',
    category: 'carry',
    name: 'Pocket Indexer',
    code: 'STR-04',
    blurb: 'Queues two pieces in the right order.',
    strength: 'Never jams',
    tradeoff: 'Only holds two',
    traits: { speed: 0, control: 1, collect: 0, score: 2 },
    weight: 1,
    power: 2,
    space: 2,
  },
  {
    id: 'cascade',
    category: 'reach',
    name: 'Cascade Slides',
    code: 'RCH-01',
    blurb: 'Extends high while staying compact.',
    strength: 'Longest reach',
    tradeoff: 'Heavy at full height',
    traits: { speed: 0, control: -1, collect: 0, score: 4 },
    weight: 4,
    power: 4,
    space: 3,
  },
  {
    id: 'swingarm',
    category: 'reach',
    name: 'Arc Pivot Arm',
    code: 'RCH-02',
    blurb: 'Sweeps smoothly from collect to score.',
    strength: 'Simple and reliable',
    tradeoff: 'Needs clear space',
    traits: { speed: 0, control: 1, collect: 1, score: 3 },
    weight: 3,
    power: 3,
    space: 4,
  },
  {
    id: 'elevator',
    category: 'reach',
    name: 'Compact Elevator',
    code: 'RCH-03',
    blurb: 'Raises the scorer straight upward.',
    strength: 'Easy to aim',
    tradeoff: 'Medium reach',
    traits: { speed: 0, control: 2, collect: 0, score: 3 },
    weight: 3,
    power: 3,
    space: 3,
  },
  {
    id: 'turret',
    category: 'reach',
    name: 'Orbit Turret',
    code: 'RCH-04',
    blurb: 'Turns the scorer without moving the base.',
    strength: 'Scores from any angle',
    tradeoff: 'Uses lots of space',
    traits: { speed: 0, control: 1, collect: 0, score: 4 },
    weight: 3,
    power: 3,
    space: 5,
  },
  {
    id: 'burst',
    category: 'score',
    name: 'Burst Feeder',
    code: 'SCR-01',
    blurb: 'Sends pieces through the GOAL quickly.',
    strength: 'Rapid scoring',
    tradeoff: 'Needs careful aim',
    traits: { speed: 0, control: 0, collect: 0, score: 5 },
    weight: 2,
    power: 4,
    space: 3,
  },
  {
    id: 'truegate',
    category: 'score',
    name: 'TrueGate Indexer',
    code: 'SCR-02',
    blurb: 'Releases exactly one piece on command.',
    strength: 'Highly accurate',
    tradeoff: 'Slower cycle',
    traits: { speed: 0, control: 2, collect: 0, score: 4 },
    weight: 2,
    power: 2,
    space: 2,
  },
  {
    id: 'tiptray',
    category: 'score',
    name: 'TipTray',
    code: 'SCR-03',
    blurb: 'Dumps a whole load in one motion.',
    strength: 'Big scoring bursts',
    tradeoff: 'Long reload',
    traits: { speed: 0, control: 0, collect: 1, score: 4 },
    weight: 2,
    power: 2,
    space: 4,
  },
  {
    id: 'flywheel',
    category: 'score',
    name: 'Vector Flywheel',
    code: 'SCR-04',
    blurb: 'Launches from farther away.',
    strength: 'Scores at range',
    tradeoff: 'High power draw',
    traits: { speed: 1, control: -1, collect: 0, score: 5 },
    weight: 3,
    power: 5,
    space: 3,
  },
  {
    id: 'coloreye',
    category: 'assist',
    name: 'Color Eye',
    code: 'SNS-01',
    blurb: 'Recognizes purple and green instantly.',
    strength: 'Pattern hint',
    tradeoff: 'No driving help',
    traits: { speed: 0, control: 0, collect: 1, score: 2 },
    weight: 1,
    power: 1,
    space: 1,
  },
  {
    id: 'range',
    category: 'assist',
    name: 'Range Finder',
    code: 'SNS-02',
    blurb: 'Shows the perfect scoring distance.',
    strength: 'Distance guide',
    tradeoff: 'Works only near GOAL',
    traits: { speed: 0, control: 1, collect: 0, score: 2 },
    weight: 1,
    power: 1,
    space: 1,
  },
  {
    id: 'align',
    category: 'assist',
    name: 'Auto Align',
    code: 'SNS-03',
    blurb: 'Helps rotate toward the target.',
    strength: 'Aim assistance',
    tradeoff: 'Small speed penalty',
    traits: { speed: -1, control: 3, collect: 0, score: 2 },
    weight: 1,
    power: 2,
    space: 1,
  },
  {
    id: 'pathfinder',
    category: 'assist',
    name: 'Pathfinder',
    code: 'SNS-04',
    blurb: 'Highlights an efficient route.',
    strength: 'Route guidance',
    tradeoff: 'No scoring bonus',
    traits: { speed: 1, control: 2, collect: 0, score: 0 },
    weight: 1,
    power: 2,
    space: 1,
  },
];

const starter: Record<Category, string> = {
  drive: 'comet',
  collect: 'widewave',
  carry: 'pocket',
  reach: 'elevator',
  score: 'truegate',
  assist: 'align',
};

const blueprints: {
  id: string;
  name: string;
  note: string;
  loadout: Record<Category, string>;
}[] = [
  {
    id: 'balanced',
    name: 'Balanced Rookie',
    note: 'Easy to drive and score',
    loadout: starter,
  },
  {
    id: 'speed',
    name: 'Speed Collector',
    note: 'Fast cycles, small margin',
    loadout: {
      drive: 'orbit',
      collect: 'twinflex',
      carry: 'beltbridge',
      reach: 'swingarm',
      score: 'burst',
      assist: 'pathfinder',
    },
  },
  {
    id: 'precision',
    name: 'Precision Scorer',
    note: 'Slower, but very accurate',
    loadout: {
      drive: 'anchor',
      collect: 'pinpoint',
      carry: 'pocket',
      reach: 'elevator',
      score: 'truegate',
      assist: 'range',
    },
  },
  {
    id: 'hauler',
    name: 'High-Capacity Hauler',
    note: 'Carries more per trip',
    loadout: {
      drive: 'trailblazer',
      collect: 'widewave',
      carry: 'stackpack',
      reach: 'cascade',
      score: 'tiptray',
      assist: 'coloreye',
    },
  },
];

const traitLabels: { id: Trait; label: string }[] = [
  { id: 'speed', label: 'Speed' },
  { id: 'control', label: 'Control' },
  { id: 'collect', label: 'Collect' },
  { id: 'score', label: 'Score' },
];

function RobotPreview({ selected }: { selected: Record<Category, string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(300, rect.width);
      const height = Math.max(310, rect.height);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height * 0.57;
      ctx.strokeStyle = 'rgba(125, 211, 252, .13)';
      ctx.lineWidth = 1;
      for (let x = -height; x < width + height; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x + height, 0);
        ctx.stroke();
      }
      for (let x = 0; x < width + height; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - height, height);
        ctx.stroke();
      }

      const shadow = ctx.createRadialGradient(
        cx,
        cy + 72,
        20,
        cx,
        cy + 72,
        170,
      );
      shadow.addColorStop(0, 'rgba(0,0,0,.5)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 72, 175, 54, 0, 0, Math.PI * 2);
      ctx.fill();

      const drive = selected.drive;
      const baseW =
        drive === 'trailblazer' ? 235 : drive === 'orbit' ? 188 : 214;
      const baseH = drive === 'anchor' ? 92 : 105;
      ctx.fillStyle = '#071522';
      ctx.strokeStyle = '#34566f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(cx - baseW / 2, cy - baseH / 2, baseW, baseH, 18);
      ctx.fill();
      ctx.stroke();

      const wheelColor =
        drive === 'comet'
          ? '#f97316'
          : drive === 'orbit'
            ? '#38bdf8'
            : '#b7f34a';
      const wheelXs =
        drive === 'trailblazer'
          ? [-baseW / 2 - 7, 0, baseW / 2 + 7]
          : [-baseW / 2 - 7, baseW / 2 + 7];
      wheelXs.forEach((offset) => {
        const ys =
          offset === 0
            ? [-baseH / 2 + 5, baseH / 2 - 5]
            : [-baseH / 2 + 14, baseH / 2 - 14];
        ys.forEach((yo) => {
          ctx.fillStyle = wheelColor;
          ctx.beginPath();
          ctx.roundRect(cx + offset - 11, cy + yo - 18, 22, 36, 7);
          ctx.fill();
          ctx.fillStyle = 'rgba(5,15,24,.5)';
          ctx.fillRect(cx + offset - 8, cy + yo - 3, 16, 6);
        });
      });

      ctx.strokeStyle = '#7894a8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - baseW / 2 + 20, cy - 26);
      ctx.lineTo(cx + baseW / 2 - 20, cy - 26);
      ctx.moveTo(cx - baseW / 2 + 20, cy + 26);
      ctx.lineTo(cx + baseW / 2 - 20, cy + 26);
      ctx.stroke();

      if (selected.collect === 'widewave' || selected.collect === 'twinflex') {
        ctx.strokeStyle =
          selected.collect === 'widewave' ? '#f97316' : '#b7f34a';
        ctx.lineWidth = selected.collect === 'widewave' ? 14 : 9;
        ctx.beginPath();
        ctx.moveTo(cx - 70, cy + baseH / 2 + 28);
        ctx.lineTo(cx + 70, cy + baseH / 2 + 28);
        ctx.stroke();
        if (selected.collect === 'twinflex') {
          ctx.beginPath();
          ctx.moveTo(cx - 64, cy + baseH / 2 + 43);
          ctx.lineTo(cx + 64, cy + baseH / 2 + 43);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = selected.collect === 'pinpoint' ? '#fbbf24' : '#f97316';
        ctx.beginPath();
        ctx.moveTo(cx - 54, cy + baseH / 2);
        ctx.lineTo(cx - 76, cy + baseH / 2 + 45);
        ctx.lineTo(cx, cy + baseH / 2 + 28);
        ctx.lineTo(cx + 76, cy + baseH / 2 + 45);
        ctx.lineTo(cx + 54, cy + baseH / 2);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = selected.carry === 'stackpack' ? '#253f53' : '#183047';
      const hopperH = selected.carry === 'stackpack' ? 96 : 55;
      ctx.beginPath();
      ctx.roundRect(cx - 54, cy - hopperH - 10, 108, hopperH, 10);
      ctx.fill();
      ctx.strokeStyle = '#4d7189';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 39, cy - hopperH + 6, 9, Math.max(18, hopperH - 32));

      const reachHeight =
        selected.reach === 'cascade'
          ? 138
          : selected.reach === 'elevator'
            ? 112
            : 88;
      ctx.strokeStyle = '#dbe7ef';
      ctx.lineWidth = selected.reach === 'swingarm' ? 10 : 7;
      ctx.beginPath();
      if (selected.reach === 'swingarm') {
        ctx.moveTo(cx + 42, cy - 36);
        ctx.lineTo(cx + 97, cy - reachHeight);
      } else {
        ctx.moveTo(cx + 54, cy - 18);
        ctx.lineTo(cx + 54, cy - reachHeight);
        ctx.moveTo(cx + 70, cy - 18);
        ctx.lineTo(cx + 70, cy - reachHeight);
      }
      ctx.stroke();
      if (selected.reach === 'turret') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx + 62, cy - 55, 31, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = selected.score === 'flywheel' ? '#f97316' : '#b7f34a';
      ctx.beginPath();
      ctx.roundRect(
        cx + 28,
        cy - reachHeight - 25,
        selected.score === 'tiptray' ? 92 : 68,
        38,
        9,
      );
      ctx.fill();
      if (selected.score === 'flywheel') {
        ctx.fillStyle = '#06121d';
        ctx.beginPath();
        ctx.arc(cx + 48, cy - reachHeight - 6, 12, 0, Math.PI * 2);
        ctx.arc(cx + 76, cy - reachHeight - 6, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = selected.assist === 'coloreye' ? '#c084fc' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx - 63, cy - 28, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 18;
      ctx.shadowColor = ctx.fillStyle;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#dce9f1';
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ATLAS // 01', cx, cy + 6);
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(parent);
    return () => resizeObserver.disconnect();
  }, [selected]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      aria-label="Preview of your assembled robot"
    />
  );
}

function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="outline" className="header-button" />}
      >
        <Wrench aria-hidden="true" /> <span>How it works</span>
      </DialogTrigger>
      <DialogContent className="how-dialog" showCloseButton>
        <DialogHeader>
          <p className="eyebrow">YOUR FIRST MATCH</p>
          <DialogTitle>Build it. Drive it. Improve it.</DialogTitle>
          <DialogDescription>
            FieldLab turns the engineering loop used by FTC teams into a quick
            single-player challenge.
          </DialogDescription>
        </DialogHeader>
        <div className="how-steps">
          <div>
            <span>01</span>
            <div>
              <strong>Choose six modules</strong>
              <p>
                Every module changes how your robot moves, collects, or scores.
              </p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <strong>Race Scout-7</strong>
              <p>
                Collect ARTIFACTS, match the color PATTERN, and return to BASE.
              </p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <strong>Make one smart change</strong>
              <p>
                Use your results like an engineer, then try the improved robot.
              </p>
            </div>
          </div>
        </div>
        <p className="unofficial-note">
          Unofficial educational prototype created for FTC team outreach.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Briefing({
  selected,
  difficulty,
  onDifficulty,
  onStart,
  onBack,
}: {
  selected: Record<Category, string>;
  difficulty: Difficulty;
  onDifficulty: (difficulty: Difficulty) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const selectedModules = categories.map((category) =>
    modules.find((module) => module.id === selected[category.id])!,
  );
  const difficulties: { id: Difficulty; name: string; note: string }[] = [
    {
      id: 'rookie',
      name: 'Rookie',
      note: 'Takes wide turns and pauses to think',
    },
    { id: 'rival', name: 'Rival', note: 'A fair match with a solid strategy' },
    { id: 'ace', name: 'Ace', note: 'Fast routes and very few mistakes' },
  ];

  return (
    <main className="briefing-screen">
      <header className="workshop-header">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Bot />
          </div>
          <div>
            <p className="brand-name">FIELDLAB</p>
            <p className="brand-kicker">ARTIFACT RUSH</p>
          </div>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          <span>GARAGE CUP</span>
          <strong>QUALIFIER</strong>
        </div>
        <Button variant="ghost" className="header-button" onClick={onBack}>
          <ArrowLeft /> Workshop
        </Button>
      </header>
      <div className="briefing-wrap">
        <section className="briefing-main">
          <p className="eyebrow">MATCH 01 / DRIVER BRIEFING</p>
          <h1>Collect. Match. Get home.</h1>
          <p className="briefing-lead">
            Your robot is ready. Score purple and green ARTIFACTS in the blue
            GOAL, follow the target PATTERN for bonus points, and reach BASE
            before the horn.
          </p>
          <div className="mission-strip">
            <div>
              <span>1</span>
              <strong>COLLECT</strong>
              <p>Hold action near a piece</p>
            </div>
            <ChevronRight />
            <div>
              <span>2</span>
              <strong>SCORE</strong>
              <p>Carry pieces to your GOAL</p>
            </div>
            <ChevronRight />
            <div>
              <span>3</span>
              <strong>RETURN</strong>
              <p>Get to BASE in the final 10</p>
            </div>
          </div>
          <div className="pattern-brief">
            <div>
              <p className="eyebrow">TARGET PATTERN</p>
              <strong>PURPLE · GREEN · PURPLE</strong>
            </div>
            <p>
              <b>8</b> points in pattern
              <br />
              <span>5 points otherwise</span>
            </p>
          </div>
        </section>
        <aside className="briefing-side">
          <div>
            <p className="eyebrow">CHOOSE YOUR RIVAL</p>
            <div className="difficulty-list">
              {difficulties.map((item) => (
                <button
                  key={item.id}
                  className={difficulty === item.id ? 'is-selected' : ''}
                  aria-pressed={difficulty === item.id}
                  onClick={() => onDifficulty(item.id)}
                >
                  <span className="difficulty-bot">
                    <Bot />
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.note}</small>
                  </span>
                  {difficulty === item.id && <CheckCircle2 />}
                </button>
              ))}
            </div>
          </div>
          <div className="briefing-loadout">
            <p className="eyebrow">ATLAS LOADOUT</p>
            <div>
              {selectedModules.map((module) => (
                <span key={module.id}>{module.code}</span>
              ))}
            </div>
          </div>
          <Button className="start-match-button" onClick={onStart}>
            START MATCH <Play />
          </Button>
          <p className="start-note">
            75 seconds · Pause anytime · WASD or arrows
          </p>
        </aside>
      </div>
    </main>
  );
}

function Results({
  result,
  selected,
  onWorkshop,
  onRematch,
}: {
  result: MatchResult;
  selected: Record<Category, string>;
  onWorkshop: () => void;
  onRematch: () => void;
}) {
  const won = result.playerScore > result.botScore;
  const tied = result.playerScore === result.botScore;
  const collector = modules.find((module) => module.id === selected.collect)!;
  const carrier = modules.find((module) => module.id === selected.carry)!;
  const verdict = tied
    ? 'Photo finish.'
    : won
      ? 'That build works.'
      : 'Good data. Back to the pit.';
  return (
    <main className="results-screen">
      <header className="workshop-header">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Bot />
          </div>
          <div>
            <p className="brand-name">FIELDLAB</p>
            <p className="brand-kicker">AN FTC TEAM OUTREACH PROJECT</p>
          </div>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          <span>GARAGE CUP</span>
          <strong>RESULTS</strong>
        </div>
        <HowItWorks />
      </header>
      <div className="results-wrap">
        <section className="result-hero">
          <div className={`result-emblem ${won ? 'won' : ''}`}>
            {won ? <Trophy /> : <Flag />}
          </div>
          <p className="eyebrow">QUALIFIER COMPLETE</p>
          <h1>{verdict}</h1>
          <div className="final-score">
            <div>
              <span>YOU</span>
              <strong>{result.playerScore}</strong>
            </div>
            <i>—</i>
            <div>
              <span>SCOUT-7</span>
              <strong>{result.botScore}</strong>
            </div>
          </div>
          <p className="result-sub">
            {won
              ? 'Your choices turned into a winning strategy.'
              : 'FTC teams rarely get the perfect robot on the first try. The next change is the interesting part.'}
          </p>
          <div className="result-actions">
            <Button variant="outline" onClick={onRematch}>
              <RotateCcw /> Rematch
            </Button>
            <Button onClick={onWorkshop}>
              Make one change <Wrench />
            </Button>
          </div>
        </section>
        <section className="result-data">
          <div className="metric-row">
            <div>
              <span>COLLECTED</span>
              <strong>{result.collected}</strong>
            </div>
            <div>
              <span>SCORED</span>
              <strong>{result.scored}</strong>
            </div>
            <div>
              <span>PATTERN HITS</span>
              <strong>{result.patternMatches}</strong>
            </div>
            <div>
              <span>BASE BONUS</span>
              <strong>{result.baseBonus ? '+15' : '—'}</strong>
            </div>
          </div>
          <div className="pit-analysis">
            <div className="analysis-heading">
              <Lightbulb />
              <div>
                <p className="eyebrow">PIT ANALYSIS</p>
                <h2>Your robot left clues.</h2>
              </div>
            </div>
            <div className="analysis-notes">
              <div>
                <span>WORKED</span>
                <p>
                  <strong>{collector.name}</strong> gave you{' '}
                  {collector.strength.toLowerCase()}.
                </p>
              </div>
              <div>
                <span>TRY NEXT</span>
                <p>
                  Your <strong>{carrier.name}</strong>{' '}
                  {carrier.tradeoff.toLowerCase()}. Test another Carry module
                  and compare.
                </p>
              </div>
            </div>
          </div>
          <div className="first-connection">
            <span className="first-loop">
              BUILD <i>→</i> TEST <i>→</i> IMPROVE
            </span>
            <div>
              <p className="eyebrow">THIS IS THE FTC LOOP</p>
              <h2>Real teams learn the same way.</h2>
              <p>
                Every match gives engineers evidence. They bring it back to the
                pit, change the robot, and try again—together.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function FieldLab() {
  const [category, setCategory] = useState<Category>('drive');
  const [selected, setSelected] = useState<Record<Category, string>>(starter);
  const [snapNote, setSnapNote] = useState('Balanced Rookie blueprint loaded');
  const [blueprint, setBlueprint] = useState('balanced');
  const [phase, setPhase] = useState<
    'workshop' | 'briefing' | 'match' | 'results'
  >('workshop');
  const [difficulty, setDifficulty] = useState<Difficulty>('rival');
  const [result, setResult] = useState<MatchResult | null>(null);
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const currentModules = modules.filter(
    (module) => module.category === category,
  );
  const selectedModules = useMemo(
    () =>
      Object.values(selected).map((id) =>
        modules.find((module) => module.id === id)!,
      ),
    [selected],
  );
  const traits = useMemo(
    () =>
      traitLabels.reduce(
        (all, trait) => ({
          ...all,
          [trait.id]: Math.max(
            1,
            Math.min(
              12,
              3 +
                selectedModules.reduce(
                  (sum, module) => sum + module.traits[trait.id],
                  0,
                ),
            ),
          ),
        }),
        {} as Record<Trait, number>,
      ),
    [selectedModules],
  );
  const resources = useMemo(
    () => ({
      weight: selectedModules.reduce((sum, module) => sum + module.weight, 0),
      power: selectedModules.reduce((sum, module) => sum + module.power, 0),
      space: selectedModules.reduce((sum, module) => sum + module.space, 0),
    }),
    [selectedModules],
  );

  const chooseModule = (module: Module) => {
    setSelected((current) => ({ ...current, [module.category]: module.id }));
    setBlueprint('custom');
    setSnapNote(`${module.name} snapped into place`);
  };

  const loadBlueprint = (id: string) => {
    const next = blueprints.find((item) => item.id === id);
    if (!next) return;
    setSelected(next.loadout);
    setBlueprint(id);
    setSnapNote(`${next.name} blueprint loaded`);
  };

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              title: string;
              description: string;
              inputSchema: object;
              annotations: {
                readOnlyHint: boolean;
                untrustedContentHint: boolean;
              };
              execute: (input: unknown) => unknown;
            },
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const registration = [
      context.registerTool(
        {
          name: 'configure_robot_module',
          title: 'Configure robot module',
          description:
            'Select one compatible module for a robot category and update the visible FieldLab build.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: categories.map((item) => item.id),
              },
              moduleId: {
                type: 'string',
                enum: modules.map((module) => module.id),
              },
            },
            required: ['category', 'moduleId'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const value = input as { category?: Category; moduleId?: string };
            const selectedModule = modules.find(
              (item) =>
                item.id === value.moduleId && item.category === value.category,
            );
            if (!selectedModule || !value.category)
              throw new Error(
                'Choose a module that belongs to the supplied category.',
              );
            const next = {
              ...selectedRef.current,
              [value.category]: selectedModule.id,
            };
            selectedRef.current = next;
            setSelected(next);
            setCategory(value.category);
            setBlueprint('custom');
            setSnapNote(`${selectedModule.name} snapped into place`);
            setPhase('workshop');
            return {
              category: value.category,
              moduleId: selectedModule.id,
              moduleName: selectedModule.name,
              status: 'installed',
            };
          },
        },
        { signal: lifecycle.signal },
      ),
      context.registerTool(
        {
          name: 'start_single_player_match',
          title: 'Start single-player match',
          description:
            'Start the Artifact Rush match with the current robot against Scout-7.',
          inputSchema: {
            type: 'object',
            properties: {
              difficulty: { type: 'string', enum: ['rookie', 'rival', 'ace'] },
            },
            required: ['difficulty'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const value = input as { difficulty?: Difficulty };
            if (
              !value.difficulty ||
              !['rookie', 'rival', 'ace'].includes(value.difficulty)
            )
              throw new Error('Difficulty must be rookie, rival, or ace.');
            setDifficulty(value.difficulty);
            setResult(null);
            setPhase('match');
            return {
              status: 'started',
              difficulty: value.difficulty,
              opponent: 'Scout-7',
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ];
    registration.forEach((request) => {
      void Promise.resolve(request).catch(() => undefined);
    });
    return () => lifecycle.abort();
  }, []);

  if (phase === 'briefing') {
    return (
      <Briefing
        selected={selected}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        onStart={() => {
          setResult(null);
          setPhase('match');
        }}
        onBack={() => setPhase('workshop')}
      />
    );
  }

  if (phase === 'match') {
    return (
      <GameArena
        selected={selected}
        difficulty={difficulty}
        onWorkshop={() => setPhase('workshop')}
        onFinish={(matchResult) => {
          setResult(matchResult);
          setPhase('results');
        }}
      />
    );
  }

  if (phase === 'results' && result) {
    return (
      <Results
        result={result}
        selected={selected}
        onWorkshop={() => setPhase('workshop')}
        onRematch={() => setPhase('briefing')}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="workshop-header">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Bot aria-hidden="true" />
          </div>
          <div>
            <p className="brand-name">FIELDLAB</p>
            <p className="brand-kicker">AN FTC TEAM OUTREACH PROJECT</p>
          </div>
        </div>
        <div className="header-status" aria-label="Current Garage Cup progress">
          <span className="status-dot" />
          <span>GARAGE CUP</span>
          <strong>WORKSHOP</strong>
        </div>
        <HowItWorks />
      </header>

      <div className="workshop-shell">
        <section className="robot-bay" aria-labelledby="robot-heading">
          <div className="bay-heading">
            <div>
              <p className="eyebrow">CURRENT BUILD / 01</p>
              <h1 id="robot-heading">ATLAS</h1>
            </div>
            <div className="build-ready">
              <span /> 6 MODULES ONLINE
            </div>
          </div>
          <div className="robot-stage">
            <div className="stage-corner stage-corner-tl" />
            <div className="stage-corner stage-corner-br" />
            <RobotPreview selected={selected} />
            <div className="snap-toast" aria-live="polite">
              <Sparkles aria-hidden="true" /> {snapNote}
            </div>
          </div>
          <div className="blueprint-row" aria-label="Starter robot blueprints">
            <span>BLUEPRINTS</span>
            {blueprints.map((item) => (
              <button
                key={item.id}
                className={blueprint === item.id ? 'is-active' : ''}
                onClick={() => loadBlueprint(item.id)}
              >
                <strong>{item.name}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
          <div className="bay-lower">
            <div className="trait-grid">
              {traitLabels.map((trait) => (
                <div className="trait" key={trait.id}>
                  <div className="trait-label">
                    <span>{trait.label}</span>
                    <strong>{traits[trait.id]}</strong>
                  </div>
                  <div
                    className="trait-pips"
                    aria-label={`${trait.label}: ${traits[trait.id]} out of 12`}
                  >
                    {Array.from({ length: 12 }).map((_, index) => (
                      <span
                        key={index}
                        className={index < traits[trait.id] ? 'active' : ''}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="resource-panel">
              {(['weight', 'power', 'space'] as const).map((resource) => (
                <div className="resource" key={resource}>
                  <div>
                    <span>{resource}</span>
                    <strong>{resources[resource]} / 22</strong>
                  </div>
                  <Progress
                    value={(resources[resource] / 22) * 100}
                    aria-label={`${resource}: ${resources[resource]} of 22`}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="parts-rack" aria-labelledby="rack-heading">
          <div className="rack-heading">
            <div>
              <p className="eyebrow">MODULE RACK</p>
              <h2 id="rack-heading">Choose how it works</h2>
            </div>
            <div className="part-count">
              <strong>24</strong>
              <span>PARTS</span>
            </div>
          </div>
          <p className="rack-help">
            Pick a module and it will snap onto the highlighted mount.
          </p>
          <Tabs
            value={category}
            onValueChange={(value) => setCategory(value as Category)}
            className="category-tabs"
          >
            <TabsList
              className="category-list"
              aria-label="Robot module categories"
            >
              {categories.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className="category-trigger"
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <div className="module-list">
            {currentModules.map((module) => {
              const isSelected = selected[module.category] === module.id;
              return (
                <button
                  className={`module-card ${isSelected ? 'is-selected' : ''}`}
                  key={module.id}
                  onClick={() => chooseModule(module)}
                  aria-pressed={isSelected}
                >
                  <span className="module-code">{module.code}</span>
                  <span className="module-copy">
                    <strong>{module.name}</strong>
                    <span>{module.blurb}</span>
                    <span className="module-trade">
                      <b>+</b> {module.strength} <i>−</i> {module.tradeoff}
                    </span>
                  </span>
                  <span className="module-action">
                    {isSelected ? 'ON ROBOT' : 'TRY IT'}
                    <ChevronRight aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="loadout-strip" aria-label="Selected robot modules">
            {categories.map((item) => {
              const picked = modules.find(
                (module) => module.id === selected[item.id],
              )!;
              const Icon = item.icon;
              return (
                <div key={item.id} title={`${item.label}: ${picked.name}`}>
                  <Icon aria-hidden="true" />
                  <span>{picked.code.replace(/-.*/, '')}</span>
                </div>
              );
            })}
          </div>
          <Button
            className="arena-button"
            size="lg"
            onClick={() => setPhase('briefing')}
            disabled={
              resources.power > 22 ||
              resources.weight > 22 ||
              resources.space > 22
            }
          >
            ENTER TEST ARENA <Crosshair aria-hidden="true" />
          </Button>
          <p className="arena-note">
            <span /> Next: learn the controls, then race Scout-7.
          </p>
        </aside>
      </div>
    </main>
  );
}
