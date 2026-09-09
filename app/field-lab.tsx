'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowLeft,
  BatteryCharging,
  Bot,
  Box,
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
  PlayCircle,
  RotateCcw,
  Scale,
  ScanLine,
  ShieldCheck,
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
import { AssemblyCategory, PartIllustration } from './assembly-bay';
import { Difficulty, GameArena, MatchResult } from './game-arena';
import { Robot3DBay } from './robot-3d';

type Category = AssemblyCategory;
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

const buildInfo: Record<
  Category,
  {
    plainName: string;
    mount: string;
    hardware: string;
    lesson: string;
    slotLabels: [string, string, string];
  }
> = {
  drive: {
    plainName: 'drivetrain',
    mount: 'Lower chassis rails',
    hardware: '4 motor plates · 8 shaft supports · M4 hardware',
    lesson:
      'Each wheel shaft is supported near both ends so it stays straight.',
    slotLabels: ['Compact', 'Standard', 'Long'],
  },
  collect: {
    plainName: 'collector',
    mount: 'Front cross rail',
    hardware: '2 angle brackets · 4 bolts · guarded motor wire',
    lesson:
      'The intake sits low and forward while its cable stays clear of the rollers.',
    slotLabels: ['Low', 'Middle', 'Raised'],
  },
  carry: {
    plainName: 'storage',
    mount: 'Center deck',
    hardware: '2 deck brackets · 4 bolts · clear polycarbonate shield',
    lesson:
      'Storage stays inside the frame so game pieces cannot fall into the electronics.',
    slotLabels: ['Forward', 'Center', 'Rear'],
  },
  reach: {
    plainName: 'lift',
    mount: 'Rear tower',
    hardware: '2 reinforced brackets · nested rails · motor service loop',
    lesson:
      'Tall mechanisms get braced on two sides and keep a loose loop of wire for motion.',
    slotLabels: ['Inboard', 'Center', 'Outboard'],
  },
  score: {
    plainName: 'scoring tool',
    mount: 'Patterned tool plate',
    hardware: '4-bolt pattern · servo link · removable end plate',
    lesson:
      'A patterned end plate lets teams swap scoring tools between tests.',
    slotLabels: ['Left', 'Center', 'Right'],
  },
  assist: {
    plainName: 'sensor',
    mount: 'Protected sensor bracket',
    hardware: '2-bolt bracket · signal cable · strain relief clip',
    lesson:
      'Sensors need a clear view, but they also need protection from robot contact.',
    slotLabels: ['Front', 'Center', 'Rear'],
  },
};

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

function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="outline" className="header-button" />}
        aria-label="How FieldLab works"
      >
        <Wrench aria-hidden="true" /> <span>How it works</span>
      </DialogTrigger>
      <DialogContent className="how-dialog" showCloseButton>
        <DialogHeader>
          <p className="eyebrow">YOUR FIRST GARAGE CUP</p>
          <DialogTitle>Pick it up. Bolt it on. Test it.</DialogTitle>
          <DialogDescription>
            FieldLab turns the build-and-test loop used by FIRST Tech Challenge
            teams into a short, hands-on game.
          </DialogDescription>
        </DialogHeader>
        <div className="how-steps">
          <div>
            <span>01</span>
            <div>
              <strong>Pick up a real-looking subsystem</strong>
              <p>
                Drag it from the parts tray to the pulsing mount on the robot.
              </p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <strong>Run a bench test</strong>
              <p>
                Watch the collector, slides, and scoring tool move before the
                match.
              </p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <strong>Drive, learn, and rebuild</strong>
              <p>
                Race Scout-7, read the pit notes, then make one smart change.
              </p>
            </div>
          </div>
        </div>
        <p className="unofficial-note">
          Unofficial educational prototype for FTC team outreach. FIRST® and
          FIRST Tech Challenge® are trademarks of For Inspiration and
          Recognition of Science and Technology (FIRST).
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
  const [snapNote, setSnapNote] = useState(
    'Balanced Rookie is on the bench. Pick up any part to start.',
  );
  const [blueprint, setBlueprint] = useState('balanced');
  const [dragging, setDragging] = useState<Module | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dropHot, setDropHot] = useState(false);
  const [snappingCategory, setSnappingCategory] = useState<Category | null>(
    null,
  );
  const [mountSlots, setMountSlots] = useState<Record<Category, number>>({
    drive: 1,
    collect: 1,
    carry: 1,
    reach: 1,
    score: 1,
    assist: 0,
  });
  const [mechanismRunning, setMechanismRunning] = useState(false);
  const [phase, setPhase] = useState<
    'workshop' | 'briefing' | 'match' | 'results'
  >('workshop');
  const [difficulty, setDifficulty] = useState<Difficulty>('rival');
  const [result, setResult] = useState<MatchResult | null>(null);
  const selectedRef = useRef(selected);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    module: Module;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [phase]);

  const currentModules = modules.filter(
    (module) => module.category === category,
  );
  const activeSelected = modules.find(
    (module) => module.id === selected[category],
  )!;
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

  const chooseModule = (
    module: Module,
    mode: 'drag' | 'tap' | 'tool' = 'tap',
  ) => {
    setSelected((current) => ({ ...current, [module.category]: module.id }));
    setBlueprint('custom');
    setCategory(module.category);
    setSnappingCategory(module.category);
    setSnapNote(
      mode === 'drag'
        ? `${module.name} seated on the ${buildInfo[module.category].mount.toLowerCase()}. Brackets and bolts added.`
        : `${module.name} installed. Try dragging the next part onto its mount.`,
    );
    window.setTimeout(() => setSnappingCategory(null), 620);
  };

  const pointIsOverStage = (x: number, y: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return Boolean(
      rect &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom,
    );
  };

  const startPartDrag = (
    module: Module,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    dragRef.current = {
      module,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setCategory(module.category);
    setDragging(module);
    setDragPosition({ x: event.clientX, y: event.clientY });
    setDropHot(pointIsOverStage(event.clientX, event.clientY));
    setSnapNote(
      `Carry ${module.name} to the pulsing ${buildInfo[module.category].mount.toLowerCase()}.`,
    );
  };

  const movePartDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) > 7
    )
      current.moved = true;
    setDragPosition({ x: event.clientX, y: event.clientY });
    setDropHot(pointIsOverStage(event.clientX, event.clientY));
  };

  const finishPartDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const overStage = pointIsOverStage(event.clientX, event.clientY);
    if (overStage) chooseModule(current.module, 'drag');
    else if (!current.moved) chooseModule(current.module, 'tap');
    else
      setSnapNote(
        `${current.module.name} returned to the tray. Drop it on the pulsing mount to install it.`,
      );
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(null);
    setDropHot(false);
  };

  const cancelPartDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(null);
    setDropHot(false);
    setSnapNote('Part returned to the tray. Nothing changed.');
  };

  const runBenchTest = () => {
    if (mechanismRunning) return;
    setMechanismRunning(true);
    setSnapNote(
      `Bench test: ${activeSelected.name} is moving while the wire route stays clear.`,
    );
    window.setTimeout(() => {
      setMechanismRunning(false);
      setSnapNote('Bench test passed. The mechanism is ready for the arena.');
    }, 1500);
  };

  const loadBlueprint = (id: string) => {
    const next = blueprints.find((item) => item.id === id);
    if (!next) return;
    setSelected(next.loadout);
    setBlueprint(id);
    setSnapNote(`${next.name} is on the bench. Swap any subsystem you want.`);
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
        mountSlots={mountSlots}
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
    <main className="pit-app">
      <header className="pit-header">
        <div className="pit-brand" aria-label="FieldLab FTC outreach workshop">
          <span className="pit-brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="pit-wordmark">
            <strong>FIELD</strong>
            <b>/</b>LAB
            <small>FIRST Tech Challenge outreach</small>
          </span>
        </div>
        <div className="pit-progress" aria-label="Garage Cup progress">
          <span className="is-current" aria-current="step">
            <b>1</b> Build
          </span>
          <i />
          <span>
            <b>2</b> Shakedown
          </span>
          <i />
          <span>
            <b>3</b> Match
          </span>
        </div>
        <HowItWorks />
      </header>

      <section className="pit-titlebar">
        <div>
          <p className="team-label">FTC PIT WORKSHOP · ROBOT 01</p>
          <h1>Your robot. Your next move.</h1>
          <p>
            Explore the robot, swap a mechanism, then put your build to the
            test.
          </p>
        </div>
        <label className="starter-picker">
          <span>Start from a team blueprint</span>
          <select
            value={blueprint}
            onChange={(event) => loadBlueprint(event.target.value)}
          >
            {blueprint === 'custom' && (
              <option value="custom">Custom build</option>
            )}
            {blueprints.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.note}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="pit-workspace">
        <section className="assembly-panel" aria-labelledby="assembly-heading">
          <header className="assembly-panel-heading">
            <div>
              <span className="bench-label">ASSEMBLY BAY A</span>
              <h2 id="assembly-heading">Atlas · competition robot</h2>
            </div>
            <span className="fit-badge">
              <ShieldCheck aria-hidden="true" /> Fits FTC-size pattern channel
            </span>
          </header>

          <div
            ref={stageRef}
            className={`assembly-stage ${dropHot ? 'is-drop-hot' : ''}`}
          >
            <Robot3DBay
              selected={selected}
              activeCategory={category}
              draggingCategory={dragging?.category ?? null}
              snappingCategory={snappingCategory}
              mountSlots={mountSlots}
              mechanismRunning={mechanismRunning}
              onSelectCategory={setCategory}
            />
            {dropHot && (
              <div className="stage-drop-label">
                Release to bolt on {dragging?.name}
              </div>
            )}
          </div>

          <div className="assembly-console">
            <div className="installed-part">
              <PartIllustration
                category={activeSelected.category}
                id={activeSelected.id}
                compact
              />
              <div>
                <span>Installed {buildInfo[category].plainName}</span>
                <strong>{activeSelected.name}</strong>
                <small>{buildInfo[category].mount}</small>
              </div>
            </div>

            <div className="mount-adjuster">
              {category === 'drive' ? (
                <>
                  <span>Chassis geometry</span>
                  <strong>Four-point, bearing-supported base</strong>
                  <div className="fixed-rail" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="mount-position">
                    <span>Loosen · slide · tighten</span>
                    <strong>Mount position</strong>
                  </label>
                  <input
                    id="mount-position"
                    type="range"
                    min="0"
                    max="2"
                    step="1"
                    value={mountSlots[category]}
                    onChange={(event) =>
                      setMountSlots((current) => ({
                        ...current,
                        [category]: Number(event.target.value),
                      }))
                    }
                    aria-valuetext={
                      buildInfo[category].slotLabels[mountSlots[category]]
                    }
                  />
                  <div className="rail-labels" aria-hidden="true">
                    {buildInfo[category].slotLabels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              className={`bench-test-button ${mechanismRunning ? 'is-running' : ''}`}
              onClick={runBenchTest}
              disabled={mechanismRunning}
            >
              <PlayCircle aria-hidden="true" />
              <span>
                <strong>
                  {mechanismRunning ? 'Testing…' : 'Run bench test'}
                </strong>
                <small>Watch every mechanism move</small>
              </span>
            </button>
          </div>

          <div className="build-ticket">
            <div>
              <Wrench aria-hidden="true" />
              <span>
                <b>What connects it</b>
                {buildInfo[category].hardware}
              </span>
            </div>
            <p aria-live="polite">{snapNote}</p>
          </div>

          <div className="trait-strip" aria-label="Robot performance traits">
            {traitLabels.map((trait) => (
              <div key={trait.id}>
                <span>{trait.label}</span>
                <strong>
                  {traits[trait.id]}
                  <small>/12</small>
                </strong>
                <i>
                  <b style={{ width: `${(traits[trait.id] / 12) * 100}%` }} />
                </i>
              </div>
            ))}
          </div>
        </section>

        <aside className="parts-drawer" aria-labelledby="parts-heading">
          <header className="parts-heading">
            <div>
              <span className="drawer-handle" aria-hidden="true" />
              <p>Open parts drawer</p>
              <h2 id="parts-heading">
                Choose the {buildInfo[category].plainName}
              </h2>
            </div>
            <span className="part-total">
              <b>24</b> real choices
            </span>
          </header>

          <nav className="subsystem-selector" aria-label="Robot subsystems">
            {categories.map((item, index) => {
              const Icon = item.icon;
              const picked = modules.find(
                (module) => module.id === selected[item.id],
              )!;
              return (
                <button
                  key={item.id}
                  className={category === item.id ? 'is-current' : ''}
                  onClick={() => setCategory(item.id)}
                  aria-pressed={category === item.id}
                >
                  <span>{index + 1}</span>
                  <Icon aria-hidden="true" />
                  <strong>{item.label}</strong>
                  <small>
                    {picked.name.replace(
                      /(Comet|Trailblazer|Orbit|Anchor|WideWave|TwinFlex|Pinpoint|SideSweep|Low Rider|StackPack|BeltBridge|Pocket|Cascade|Arc|Compact|TrueGate|Burst|TipTray|Vector|Color|Range|Auto|Pathfinder)\s?/i,
                      '',
                    )}
                  </small>
                </button>
              );
            })}
          </nav>

          <div className="parts-tray-heading">
            <div>
              <strong>Pick up a part</strong>
              <span>
                Drag it onto the highlighted{' '}
                {buildInfo[category].mount.toLowerCase()}
              </span>
            </div>
            <span className="fit-key">
              <i /> Fits this robot
            </span>
          </div>

          <div className="parts-tray">
            {currentModules.map((module) => {
              const isSelected = selected[module.category] === module.id;
              return (
                <button
                  type="button"
                  className={`part-tile ${isSelected ? 'is-installed' : ''}`}
                  key={module.id}
                  aria-pressed={isSelected}
                  aria-label={`${module.name}. ${isSelected ? 'Installed.' : ''} Drag to the robot or press Enter to install.`}
                  onPointerDown={(event) => startPartDrag(module, event)}
                  onPointerMove={movePartDrag}
                  onPointerUp={finishPartDrag}
                  onPointerCancel={cancelPartDrag}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      chooseModule(module, 'tap');
                    }
                  }}
                >
                  <div className="part-tile-art">
                    <PartIllustration
                      category={module.category}
                      id={module.id}
                    />
                    <span className="part-grip" aria-hidden="true">
                      ••••
                    </span>
                    {isSelected && (
                      <span className="installed-sticker">
                        <CheckCircle2 /> On Atlas
                      </span>
                    )}
                  </div>
                  <div className="part-tile-copy">
                    <span className="part-code">{module.code}</span>
                    <strong>{module.name}</strong>
                    <p>{module.blurb}</p>
                    <div>
                      <b>{module.strength}</b>
                      <i>{module.tradeoff}</i>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <details className="pit-lesson">
            <summary>
              <Lightbulb aria-hidden="true" /> Why teams build it this way
            </summary>
            <p>{buildInfo[category].lesson}</p>
          </details>

          <div
            className="inspection-meters"
            aria-label="Robot inspection resources"
          >
            <div>
              <Scale aria-hidden="true" />
              <span>
                Weight<strong>{resources.weight} / 22</strong>
              </span>
            </div>
            <div>
              <BatteryCharging aria-hidden="true" />
              <span>
                Power<strong>{resources.power} / 22</strong>
              </span>
            </div>
            <div>
              <Box aria-hidden="true" />
              <span>
                Space<strong>{resources.space} / 22</strong>
              </span>
            </div>
          </div>

          <Button
            className="field-button"
            size="lg"
            onClick={() => setPhase('briefing')}
            disabled={
              resources.power > 22 ||
              resources.weight > 22 ||
              resources.space > 22
            }
          >
            <span>
              <strong>Take Atlas to the field</strong>
              <small>75 seconds · versus Scout-7</small>
            </span>
            <Crosshair aria-hidden="true" />
          </Button>
        </aside>
      </div>

      {dragging && (
        <div
          className={`part-drag-ghost ${dropHot ? 'is-over-stage' : ''}`}
          style={{ left: dragPosition.x, top: dragPosition.y }}
          aria-hidden="true"
        >
          <PartIllustration
            category={dragging.category}
            id={dragging.id}
            compact
          />
          <span>
            <strong>{dragging.name}</strong>
            {dropHot ? 'Release to install' : 'Carry to the robot'}
          </span>
        </div>
      )}

      <footer className="first-workshop-band">
        <div>
          <strong>THIS IS THE FTC ENGINEERING LOOP</strong>
          <span>Build</span>
          <i />
          <span>Test</span>
          <i />
          <span>Learn</span>
          <i />
          <span>Improve</span>
        </div>
        <p>
          Unofficial educational experience made for FIRST Tech Challenge team
          outreach.
        </p>
      </footer>
    </main>
  );
}
