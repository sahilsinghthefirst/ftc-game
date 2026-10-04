'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  BatteryCharging,
  Bot,
  Box,
  CheckCircle2,
  Flag,
  Gauge,
  Grip,
  Lightbulb,
  MoveUp,
  PackageOpen,
  Scale,
  ScanLine,
  Target,
  Trophy,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GraphicsPicker } from './graphics-picker';
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
import { NECTAR_TIP_VALUE, TIP_POINTS, GOAL_TIP_AT } from './match-guidance';
import { Robot3DBay } from './robot-3d';

const tipAt = GOAL_TIP_AT;
const nectarValue = NECTAR_TIP_VALUE;
const tipPoints = TIP_POINTS;

const sceneFadeMs = 300;
const sceneHoldMs = 90;

type Category = AssemblyCategory;
type Trait = 'speed' | 'handling' | 'control' | 'collect' | 'score';

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
  }
> = {
  drive: {
    plainName: 'drivetrain',
    mount: 'Lower chassis rails',
    hardware: '4 motor plates · 8 shaft supports · M4 hardware',
    lesson:
      'Each wheel shaft is supported near both ends so it stays straight.',
  },
  collect: {
    plainName: 'collector',
    mount: 'Front cross rail',
    hardware: '2 angle brackets · 4 bolts · guarded motor wire',
    lesson:
      'The intake sits low and forward while its cable stays clear of the rollers.',
  },
  carry: {
    plainName: 'storage',
    mount: 'Center deck',
    hardware: '2 deck brackets · 4 bolts · clear polycarbonate shield',
    lesson:
      'Storage stays inside the frame so game pieces cannot fall into the electronics.',
  },
  reach: {
    plainName: 'lift',
    mount: 'Rear tower',
    hardware: '2 reinforced brackets · nested rails · motor service loop',
    lesson:
      'Tall mechanisms get braced on two sides and keep a loose loop of wire for motion.',
  },
  score: {
    plainName: 'scoring tool',
    mount: 'Patterned tool plate',
    hardware: '4-bolt pattern · servo link · removable end plate',
    lesson:
      'A patterned end plate lets teams swap scoring tools between tests.',
  },
  assist: {
    plainName: 'sensor',
    mount: 'Protected sensor bracket',
    hardware: '2-bolt bracket · signal cable · strain relief clip',
    lesson:
      'Sensors need a clear view, but they also need protection from robot contact.',
  },
};

const modules: Module[] = [
  {
    id: 'comet',
    category: 'drive',
    name: 'Comet Mecanum',
    code: 'DRV-01',
    blurb: 'Slides sideways to line up on the HIVE.',
    strength: 'Moves in every direction',
    tradeoff: 'Drinks battery',
    traits: { speed: 5, handling: 0, control: 2, collect: 0, score: 0 },
    weight: 3,
    power: 5,
    space: 3,
  },
  {
    id: 'trailblazer',
    category: 'drive',
    name: 'Trailblazer 6WD',
    code: 'DRV-02',
    blurb: 'Six wheels that pile on speed in a straight line.',
    strength: 'Fast in a straight line, wins every push',
    tradeoff: 'Turns like a bus',
    traits: { speed: 5, handling: 3, control: 2, collect: 0, score: 0 },
    weight: 5,
    power: 3,
    space: 4,
  },
  {
    id: 'orbit',
    category: 'drive',
    name: 'Orbit Omni',
    code: 'DRV-03',
    blurb: 'The fastest base on the mats.',
    strength: 'Huge top speed',
    tradeoff: 'Skids a long way past the HIVE',
    traits: { speed: 6, handling: -6, control: 0, collect: 0, score: 0 },
    weight: 1,
    power: 3,
    space: 2,
  },
  {
    id: 'anchor',
    category: 'drive',
    name: 'Anchor Traction',
    code: 'DRV-04',
    blurb: 'Grips hard, stops on a dime and spins in place.',
    strength: 'Stops and turns instantly',
    tradeoff: 'Slowest base here',
    traits: { speed: 0, handling: 5, control: 3, collect: 0, score: 0 },
    weight: 3,
    power: 2,
    space: 2,
  },
  {
    id: 'widewave',
    category: 'collect',
    name: 'WideWave Roller',
    code: 'INT-01',
    blurb: 'A light, wide sweeper that scoops from anywhere in front.',
    strength: 'Huge pickup zone, barely any weight',
    tradeoff: 'Crawls while it swallows each one',
    traits: { speed: 3, handling: 1, control: -1, collect: 1, score: 0 },
    weight: 1,
    power: 3,
    space: 3,
  },
  {
    id: 'twinflex',
    category: 'collect',
    name: 'TwinFlex Intake',
    code: 'INT-02',
    blurb: 'Heavy twin rollers that inhale an ARTIFACT on contact.',
    strength: 'Grabs one almost instantly',
    tradeoff: 'Heavy, and slows the whole robot',
    traits: { speed: -4, handling: -1, control: 0, collect: 5, score: 0 },
    weight: 6,
    power: 5,
    space: 3,
  },
  {
    id: 'dualjaw',
    category: 'collect',
    name: 'DualJaw Grabber',
    code: 'INT-03',
    blurb: 'Two jaws that close on a pair of ARTIFACTS at once.',
    strength: 'Takes two in one grab',
    tradeoff: 'Very slow clamp, wasted on a lone one',
    traits: { speed: -1, handling: -1, control: 1, collect: 2, score: 0 },
    weight: 4,
    power: 4,
    space: 3,
  },
  {
    id: 'sorter',
    category: 'collect',
    name: 'NectarSort Funnel',
    code: 'INT-04',
    blurb: 'A funnel shaped to swallow only your big blue NECTAR.',
    strength: 'Fills a CELL fastest at 1.5 a time',
    tradeoff: 'Drives straight past all POLLEN',
    traits: { speed: 1, handling: 0, control: 0, collect: 3, score: 2 },
    weight: 2,
    power: 2,
    space: 4,
  },
  {
    id: 'lowbin',
    category: 'carry',
    name: 'Low Rider Hopper',
    code: 'STR-01',
    blurb: 'An open bin that swallows a big NECTAR whole.',
    strength: 'NECTAR takes one slot, not two',
    tradeoff: 'Only four slots',
    traits: { speed: 1, handling: 2, control: 1, collect: 0, score: 0 },
    weight: 2,
    power: 0,
    space: 3,
  },
  {
    id: 'stackpack',
    category: 'carry',
    name: 'StackPack Magazine',
    code: 'STR-02',
    blurb: 'Six slots stacked high over the deck.',
    strength: 'Carries the most per trip',
    tradeoff: 'Tall, heavy and sluggish',
    traits: { speed: -2, handling: -3, control: -2, collect: 1, score: 0 },
    weight: 5,
    power: 1,
    space: 4,
  },
  {
    id: 'pocket',
    category: 'carry',
    name: 'Pocket Indexer',
    code: 'STR-04',
    blurb: 'The lightest way to carry four.',
    strength: 'Almost no weight at all',
    tradeoff: 'Four slots, but NECTAR takes two each',
    traits: { speed: 2, handling: 3, control: 0, collect: 0, score: 1 },
    weight: 1,
    power: 2,
    space: 2,
  },
  {
    id: 'swingarm',
    category: 'reach',
    name: 'Arc Pivot Arm',
    code: 'RCH-02',
    blurb: 'A light arm that swings up to the rim.',
    strength: 'Lightest lift, so the fastest robot',
    tradeoff: 'Must drive right up to the CELL',
    traits: { speed: 3, handling: 1, control: 0, collect: 0, score: 0 },
    weight: 2,
    power: 3,
    space: 4,
  },
  {
    id: 'elevator',
    category: 'reach',
    name: 'Compact Elevator',
    code: 'RCH-03',
    blurb: 'Lifts straight up, easy to line up.',
    strength: 'Fair reach with no speed cost',
    tradeoff: 'Has to get fairly close',
    traits: { speed: 0, handling: 0, control: 1, collect: 0, score: 1 },
    weight: 3,
    power: 3,
    space: 3,
  },
  {
    id: 'turret',
    category: 'reach',
    name: 'Orbit Turret',
    code: 'RCH-04',
    blurb: 'Swings the scorer up into the CELL.',
    strength: 'Loads from well out',
    tradeoff: 'Heavy turret slows the robot',
    traits: { speed: -2, handling: -2, control: 1, collect: 0, score: 2 },
    weight: 4,
    power: 3,
    space: 5,
  },
  {
    id: 'cascade',
    category: 'reach',
    name: 'Cascade Slides',
    code: 'RCH-01',
    blurb: 'Loads the HIVE from well back in the field.',
    strength: 'By far the longest reach',
    tradeoff: 'Tall and heavy: the slowest robot',
    traits: { speed: -4, handling: -3, control: -2, collect: 0, score: 3 },
    weight: 5,
    power: 4,
    space: 3,
  },
  {
    id: 'burst',
    category: 'score',
    name: 'Burst Feeder',
    code: 'SCR-01',
    blurb: 'Fires ARTIFACTS into the CELL back to back.',
    strength: 'Fills the CELL fastest',
    tradeoff: 'Only fires with the robot stopped',
    traits: { speed: 0, handling: 0, control: 0, collect: 0, score: 3 },
    weight: 2,
    power: 5,
    space: 3,
  },
  {
    id: 'truegate',
    category: 'score',
    name: 'TrueGate Indexer',
    code: 'SCR-02',
    blurb: 'Drops exactly one ARTIFACT per press.',
    strength: 'Loads on the move and never misses',
    tradeoff: 'Slow between shots',
    traits: { speed: 0, handling: 1, control: 1, collect: 0, score: 1 },
    weight: 2,
    power: 2,
    space: 2,
  },
  {
    id: 'tiptray',
    category: 'score',
    name: 'TipTray',
    code: 'SCR-03',
    blurb: 'Tips the whole load into the CELL at once.',
    strength: 'Empties your storage in one motion',
    tradeoff: 'Must stop, then a very long reload',
    traits: { speed: 0, handling: 1, control: 0, collect: 0, score: 2 },
    weight: 2,
    power: 2,
    space: 4,
  },
  {
    id: 'flywheel',
    category: 'score',
    name: 'Vector Flywheel',
    code: 'SCR-04',
    blurb: 'Launches ARTIFACTS into the CELL without slowing down.',
    strength: 'Quick shots on the move',
    tradeoff: 'One shot in four bounces out',
    traits: { speed: 1, handling: -2, control: -2, collect: 0, score: 2 },
    weight: 3,
    power: 6,
    space: 3,
  },
  {
    id: 'range',
    category: 'assist',
    name: 'Range Finder',
    code: 'SNS-02',
    blurb: 'Marks where you can load from, and lights up once you are there.',
    strength: 'Never wastes a trip',
    tradeoff: 'Only useful at the HIVE',
    traits: { speed: 0, handling: 0, control: 1, collect: 0, score: 1 },
    weight: 1,
    power: 1,
    space: 1,
  },
  {
    id: 'align',
    category: 'assist',
    name: 'Auto Align',
    code: 'SNS-03',
    blurb: 'Points the way to the upward CELL and widens your aim.',
    strength: 'Guides every trip to the HIVE',
    tradeoff: 'Costs real top speed',
    traits: { speed: -3, handling: 1, control: 3, collect: 0, score: 1 },
    weight: 1,
    power: 2,
    space: 1,
  },
  {
    id: 'pathfinder',
    category: 'assist',
    name: 'Pathfinder',
    code: 'SNS-04',
    blurb: 'Draws the route to the next ARTIFACT, and home to BASE at the end.',
    strength: 'Keeps your cycles short',
    tradeoff: 'No help at the HIVE',
    traits: { speed: 1, handling: 3, control: 1, collect: 0, score: 0 },
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
      carry: 'pocket',
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
      collect: 'twinflex',
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
      assist: 'pathfinder',
    },
  },
];

const traitLabels: { id: Trait; label: string; hint: string }[] = [
  { id: 'speed', label: 'Speed', hint: 'How fast the robot can go' },
  {
    id: 'handling',
    label: 'Handling',
    hint: 'How quickly it reaches that speed and how fast it stops',
  },
  { id: 'control', label: 'Control', hint: 'How steady it is while driving' },
  { id: 'collect', label: 'Collect', hint: 'How easily it picks ARTIFACTS up' },
  { id: 'score', label: 'Score', hint: 'How quickly it loads the HIVE' },
];

function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="outline" className="header-button" />}
        aria-label="How FieldLab works"
      >
        <Wrench aria-hidden="true" /> <span>Help</span>
      </DialogTrigger>
      <DialogContent className="how-dialog" showCloseButton>
        <DialogHeader>
          <DialogTitle>How to play</DialogTitle>
          <DialogDescription>
            Build a robot, then drive it against Scout-7.
          </DialogDescription>
        </DialogHeader>
        <div className="how-steps">
          <div>
            <span>01</span>
            <div>
              <strong>Build</strong>
              <p>
                Choose a category and drag a part onto the robot. You can also
                focus a part and press Enter to install it.
              </p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <strong>Compare</strong>
              <p>
                Read each part's strengths and tradeoffs. Open Robot details to
                see your build's ratings.
              </p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <strong>Play</strong>
              <p>
                Select Play, choose a difficulty, and start the match. Use WASD
                or arrows to drive and hold Space to collect or load balls.
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

// Plain-language read-out of what a Handling rating feels like to drive.
function handlingNote(handling: number) {
  if (handling <= 3) return 'slow off the line and slides past its target';
  if (handling <= 6) return 'takes a moment to start and stop';
  if (handling <= 9) return 'starts quickly and stops close to the mark';
  return 'snaps to speed and stops on a dime';
}

function Briefing({
  selected,
  handling,
  difficulty,
  onDifficulty,
  onStart,
  onBack,
}: {
  selected: Record<Category, string>;
  handling: number;
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
        <Button variant="ghost" className="header-button" onClick={onBack}>
          Workshop
        </Button>
      </header>
      <div className="briefing-wrap">
        <div className="briefing-title">
          <h1>Play a match</h1>
          <p>60 seconds · You vs. Scout-7</p>
        </div>
        <section className="briefing-main">
          <h2>How to score</h2>
          <p className="briefing-lead">
            Fill the raised cell of the blue HIVE to tip it for {tipPoints}{' '}
            points. When it tips, load the other side. Return to the blue base
            in the final 10 seconds.
          </p>
          <div className="mission-strip">
            <div>
              <span>1</span>
              <strong>Collect</strong>
              <p>Hold Space near a ball</p>
            </div>
            <div>
              <span>2</span>
              <strong>Load</strong>
              <p>Hold Space at the raised cell</p>
            </div>
            <div>
              <span>3</span>
              <strong>Return</strong>
              <p>Park at your base before time runs out</p>
            </div>
          </div>
          <div className="tip-brief">
            <div>
              <strong>Blue nectar: {nectarValue} · Yellow pollen: 1</strong>
            </div>
            <p>
              <b>{tipPoints}</b> points at {tipAt}
              <br />
              <span>
                Collect blue nectar and yellow pollen. Nectar uses two slots,
                except in the Low Rider Hopper.
              </span>
            </p>
          </div>
        </section>
        <aside className="briefing-side">
          <div>
            <h2 className="setup-heading">Difficulty</h2>
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
          <details className="setup-details">
            <summary>Robot & graphics settings</summary>
            <GraphicsPicker />
            <div className="briefing-loadout">
              <p className="eyebrow">Your robot</p>
              <div>
                {selectedModules.map((module) => (
                  <span key={module.id}>{module.name}</span>
                ))}
              </div>
              <p className="briefing-handling">
                <strong>Handling {handling}/12</strong> ·{' '}
                {handlingNote(handling)}
              </p>
            </div>
          </details>
          <Button className="start-match-button" onClick={onStart}>
            Start match
          </Button>
          <p className="start-note">
            60 seconds · Pause anytime · WASD or arrows
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
  const verdict = tied ? 'Draw' : won ? 'You won!' : 'Scout-7 won';
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
        <HowItWorks />
      </header>
      <div className="results-wrap">
        <section className="result-hero">
          <div className={`result-emblem ${won ? 'won' : ''}`}>
            {won ? <Trophy /> : <Flag />}
          </div>
          <p className="eyebrow">Match results</p>
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
          <div className="result-actions">
            <Button variant="outline" onClick={onRematch}>
              Play again
            </Button>
            <Button onClick={onWorkshop}>Workshop</Button>
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
              <span>HIVE TIPS</span>
              <strong>{result.tips}</strong>
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
                <h2>Build feedback</h2>
              </div>
            </div>
            <div className="analysis-notes">
              <div>
                <span>Collector</span>
                <p>
                  <strong>{collector.name}</strong>
                  <br />
                  {collector.strength}
                </p>
              </div>
              <div>
                <span>Carry</span>
                <p>
                  <strong>{carrier.name}</strong>
                  <br />
                  {carrier.tradeoff}. Try a different Carry part to compare.
                </p>
              </div>
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
  const [snapNote, setSnapNote] = useState('');
  const [blueprint, setBlueprint] = useState('balanced');
  const [dragging, setDragging] = useState<Module | null>(null);
  // Where the dragged part first appears. After that the ghost is moved
  // straight in the DOM, so a drag never re-renders the whole workshop on
  // every pointer move - which a school laptop would feel as lag.
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const ghostRef = useRef<HTMLDivElement>(null);
  const [dropHot, setDropHot] = useState(false);
  // The part most recently let go of somewhere other than the robot. `nonce`
  // changes on every miss so the warning animations replay each time.
  const [rejected, setRejected] = useState<{
    id: string;
    name: string;
    nonce: number;
  } | null>(null);
  const rejectTimer = useRef<number | null>(null);
  const rejectCount = useRef(0);
  const [snappingCategory, setSnappingCategory] = useState<Category | null>(
    null,
  );
  const [phase, setPhase] = useState<
    'workshop' | 'briefing' | 'match' | 'results'
  >('workshop');
  const [sceneFade, setSceneFade] = useState<'idle' | 'out' | 'in'>('idle');
  const fadeTimers = useRef<number[]>([]);
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
    if (phase === 'match') return;
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(
    () => () => {
      fadeTimers.current.forEach((id) => window.clearTimeout(id));
      if (rejectTimer.current) window.clearTimeout(rejectTimer.current);
    },
    [],
  );

  // A part let go of anywhere but the robot goes straight back to the tray.
  // Make that impossible to miss: the tile shakes and gets stamped, and the
  // robot itself flags that nothing was fitted.
  const flagNotInstalled = (module: Module) => {
    if (rejectTimer.current) window.clearTimeout(rejectTimer.current);
    rejectCount.current += 1;
    setRejected({
      id: module.id,
      name: module.name,
      nonce: rejectCount.current,
    });
    rejectTimer.current = window.setTimeout(() => setRejected(null), 4000);
  };

  const clearRejected = () => {
    if (rejectTimer.current) window.clearTimeout(rejectTimer.current);
    rejectTimer.current = null;
    setRejected(null);
  };

  const changeScene = (swap: () => void) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      swap();
      return;
    }
    fadeTimers.current.forEach((id) => window.clearTimeout(id));
    setSceneFade('out');
    fadeTimers.current = [
      window.setTimeout(swap, sceneFadeMs),
      window.setTimeout(() => setSceneFade('in'), sceneFadeMs + sceneHoldMs),
      window.setTimeout(
        () => setSceneFade('idle'),
        sceneFadeMs * 2 + sceneHoldMs,
      ),
    ];
  };

  const withSceneFade = (screen: ReactNode) => (
    <>
      {screen}
      <div
        className={`scene-fade ${sceneFade === 'idle' ? '' : `is-${sceneFade}`}`}
        aria-hidden="true"
      />
    </>
  );

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

  const chooseModule = (module: Module, mode: 'drag' | 'tap' = 'tap') => {
    clearRejected();
    setSelected((current) => ({ ...current, [module.category]: module.id }));
    setBlueprint('custom');
    setCategory(module.category);
    setSnappingCategory(module.category);
    setSnapNote(`${module.name} installed.`);
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
    clearRejected();
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
    // Read layout first, then write, so the browser lays out once.
    const over = pointIsOverStage(event.clientX, event.clientY);
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
    }
    // Only re-renders when the drop highlight actually switches.
    setDropHot(over);
  };

  const finishPartDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // Parts only go on by being carried to the mount. A tap that never leaves
    // the tray puts the part back rather than installing it.
    const overStage = pointIsOverStage(event.clientX, event.clientY);
    const { module } = current;
    const mount = buildInfo[module.category].mount.toLowerCase();
    if (overStage) chooseModule(module, 'drag');
    else if (selected[module.category] === module.id)
      setSnapNote(`${module.name} is already on Atlas. Nothing changed.`);
    else {
      flagNotInstalled(module);
      setSnapNote(
        current.moved
          ? `${module.name} was dropped off the robot and NOT installed. Let go of it over the pulsing ${mount}.`
          : `${module.name} was NOT installed - clicking only picks it up. Drag it onto the pulsing ${mount}.`,
      );
    }
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
    if (selected[current.module.category] !== current.module.id)
      flagNotInstalled(current.module);
    setSnapNote(
      `${current.module.name} went back to the tray and was NOT installed.`,
    );
  };

  const loadBlueprint = (id: string) => {
    const next = blueprints.find((item) => item.id === id);
    if (!next) return;
    setSelected(next.loadout);
    setBlueprint(id);
    setSnapNote(`${next.name} loaded.`);
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
    return withSceneFade(
      <Briefing
        selected={selected}
        handling={traits.handling}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        onStart={() =>
          changeScene(() => {
            setResult(null);
            setPhase('match');
          })
        }
        onBack={() => setPhase('workshop')}
      />,
    );
  }

  if (phase === 'match') {
    return withSceneFade(
      <GameArena
        selected={selected}
        handling={traits.handling}
        difficulty={difficulty}
        onWorkshop={() => setPhase('workshop')}
        onFinish={(matchResult) =>
          changeScene(() => {
            setResult(matchResult);
            setPhase('results');
          })
        }
      />,
    );
  }

  if (phase === 'results' && result) {
    return withSceneFade(
      <Results
        result={result}
        selected={selected}
        onWorkshop={() => setPhase('workshop')}
        onRematch={() => setPhase('briefing')}
      />,
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
        <HowItWorks />
      </header>

      <section className="pit-titlebar">
        <div>
          <h1>Workshop</h1>
        </div>
        <div className="workshop-actions">
          <label className="starter-picker">
            <span>Robot preset</span>
            <select
              value={blueprint}
              onChange={(event) => loadBlueprint(event.target.value)}
            >
              {blueprint === 'custom' && (
                <option value="custom">Custom build</option>
              )}
              {blueprints.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
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
            Play
          </Button>
        </div>
      </section>

      <div className="pit-workspace">
        <section className="assembly-panel" aria-labelledby="assembly-heading">
          <header className="assembly-panel-heading">
            <div>
              <h2 id="assembly-heading">Robot assembly</h2>
            </div>
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
              onSelectCategory={setCategory}
            />
            {dropHot && (
              <div className="stage-drop-label">
                Release to bolt on {dragging?.name}
              </div>
            )}
            {rejected && !dragging && (
              <div className="stage-reject-label" key={rejected.nonce}>
                <XCircle aria-hidden="true" />
                <span>
                  <strong>{rejected.name} not installed</strong>
                  Drag it onto the robot to fit it
                </span>
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
          </div>

          {snapNote && (
            <p
              className={`assembly-status ${rejected ? 'is-warning' : ''}`}
              aria-live="polite"
            >
              {snapNote}
            </p>
          )}
          <details className="robot-details">
            <summary>Robot details</summary>
            <div className="build-ticket">
              <div>
                <Wrench aria-hidden="true" />
                <span>
                  <b>What connects it</b>
                  {buildInfo[category].hardware}
                </span>
              </div>
            </div>

            <div className="trait-strip" aria-label="Robot performance traits">
              {traitLabels.map((trait) => (
                <div key={trait.id} title={`${trait.label}: ${trait.hint}`}>
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
          </details>
        </section>

        <aside className="parts-drawer" aria-labelledby="parts-heading">
          <header className="parts-heading">
            <div>
              <h2 id="parts-heading">Parts</h2>
            </div>
          </header>

          <nav className="subsystem-selector" aria-label="Robot subsystems">
            {categories.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={category === item.id ? 'is-current' : ''}
                  onClick={() => setCategory(item.id)}
                  aria-pressed={category === item.id}
                >
                  <Icon aria-hidden="true" />
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </nav>

          <div className="parts-tray-heading">
            <div>
              <strong>{buildInfo[category].plainName}</strong>
              <span>
                Drag a part onto the robot. Press Enter to install with the
                keyboard.
              </span>
            </div>
          </div>

          <div className="parts-tray">
            {currentModules.map((module) => {
              const isSelected = selected[module.category] === module.id;
              const isRejected = rejected?.id === module.id;
              return (
                <button
                  type="button"
                  className={`part-tile ${isSelected ? 'is-installed' : ''} ${isRejected ? `is-rejected reject-${rejected.nonce % 2}` : ''}`}
                  key={module.id}
                  aria-pressed={isSelected}
                  aria-label={`${module.name}. ${isSelected ? 'Installed.' : ''} Drag onto the robot to fit it, or press Enter.`}
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
                        <CheckCircle2 /> Installed
                      </span>
                    )}
                    {isRejected && (
                      <span className="rejected-sticker" key={rejected.nonce}>
                        Not installed
                      </span>
                    )}
                  </div>
                  <div className="part-tile-copy">
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
              <Lightbulb aria-hidden="true" /> About this part
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

          {(resources.power > 22 ||
            resources.weight > 22 ||
            resources.space > 22) && (
            <p className="build-limit-note" role="status">
              Your build is over a limit. Choose lighter, smaller, or
              lower-power parts to play.
            </p>
          )}
        </aside>
      </div>

      {dragging && (
        <div
          ref={ghostRef}
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
        <p>FIRST Tech Challenge team outreach · Unofficial game</p>
      </footer>
    </main>
  );
}
