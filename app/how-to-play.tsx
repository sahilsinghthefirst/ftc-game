'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BASE_POINTS,
  GOAL_TIP_AT,
  NECTAR_TIP_VALUE,
  TIP_POINTS,
  tipValue,
  artifactSpace,
} from './match-guidance';

// A short slideshow of how a match works, shown before the first match and
// any time after from the briefing. Each slide is one step of a match, with a
// small diagram of it.

const SEEN_KEY = 'fieldlab-how-to-play-seen-v2';

// Whether this browser has already been shown the slideshow. Storage can be
// blocked (private windows, school policies), in which case it simply shows.
export function howToPlaySeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Nothing to remember it in; it will show again next time.
  }
}

// Colours of the things on the field, as they look in the match.
const MAT = '#d9dfe0';
const SEAM = '#c3cbcd';
const ROBOT = '#27383f';
const TRIM = '#f0b429';
const BLUE = '#2f6fd6';
const RED = '#d2452f';
const POLLEN = '#f2c94c';
const INK = '#33454c';

function Mats() {
  return (
    <>
      <rect width="320" height="160" fill={MAT} />
      {[64, 128, 192, 256].map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="160" stroke={SEAM} />
      ))}
      {[53, 106].map((y) => (
        <line key={y} x1="0" y1={y} x2="320" y2={y} stroke={SEAM} />
      ))}
    </>
  );
}

// The player's robot from above, nose pointing along +x before `turn`.
function TopRobot({ x, y, turn = 0 }: { x: number; y: number; turn?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})`}>
      <circle r="27" fill="none" stroke={BLUE} strokeWidth="2.5" />
      <rect x="-16" y="-20" width="9" height="6" rx="1.5" fill={INK} />
      <rect x="7" y="-20" width="9" height="6" rx="1.5" fill={INK} />
      <rect x="-16" y="14" width="9" height="6" rx="1.5" fill={INK} />
      <rect x="7" y="14" width="9" height="6" rx="1.5" fill={INK} />
      <rect x="-17" y="-15" width="34" height="30" rx="3" fill={ROBOT} />
      <rect x="15" y="-13" width="5" height="26" rx="2" fill={TRIM} />
      <rect x="-9" y="-7" width="14" height="14" rx="2" fill="#4c626b" />
    </g>
  );
}

function Pollen({ x, y }: { x: number; y: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r="6"
      fill={POLLEN}
      stroke="#c99a1c"
      strokeWidth="1.5"
    />
  );
}

function Nectar({
  x,
  y,
  color = BLUE,
}: {
  x: number;
  y: number;
  color?: string;
}) {
  return (
    <circle cx={x} cy={y} r="8" fill={color} stroke={INK} strokeWidth="1.2" />
  );
}

function Key({
  x,
  y,
  label,
  width = 24,
}: {
  x: number;
  y: number;
  label: string;
  width?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={width} height="24" rx="4" fill="#fbf8f1" stroke="#9c9386" />
      <rect y="20" width={width} height="4" rx="2" fill="#c9c1b4" />
      <text
        x={width / 2}
        y="15"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill={INK}
      >
        {label}
      </text>
    </g>
  );
}

function Badge({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-24" y="-13" width="48" height="26" rx="4" fill="#d94d2b" />
      <text
        y="5"
        textAnchor="middle"
        fontSize="14"
        fontWeight="800"
        fill="#fff8e9"
      >
        {text}
      </text>
    </g>
  );
}

// The HIVE from the side: a post, and a seesaw of two CELLS whose open ends
// face outward. `tilt` > 0 raises the left CELL.
function SideHive({ tilt, balls }: { tilt: number; balls: ReactNode }) {
  return (
    <>
      <rect width="320" height="160" fill="#eef1f1" />
      <rect y="138" width="320" height="22" fill={MAT} />
      <path
        d="M146 138 L160 66 L174 138"
        fill="none"
        stroke="#6b7a80"
        strokeWidth="5"
      />
      <g transform={`rotate(${tilt} 160 66)`}>
        <path
          d="M84 48 H152 V84 H84"
          fill="rgba(47,111,214,0.12)"
          stroke={BLUE}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M236 48 H168 V84 H236"
          fill="rgba(47,111,214,0.12)"
          stroke={BLUE}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <rect x="150" y="62" width="20" height="8" fill="#6b7a80" />
        {balls}
      </g>
      <circle
        cx="160"
        cy="66"
        r="4"
        fill="#fbf8f1"
        stroke="#6b7a80"
        strokeWidth="2"
      />
    </>
  );
}

function SideRobot({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="116" width="46" height="18" rx="3" fill={ROBOT} />
      <circle cx="9" cy="135" r="5" fill={INK} />
      <circle cx="37" cy="135" r="5" fill={INK} />
      <rect x="30" y="86" width="6" height="32" fill={TRIM} />
    </g>
  );
}

function BallDemo() {
  const [balls, setBalls] = useState<('P' | 'G')[]>([]);
  const [wide, setWide] = useState(false);
  const load = balls.reduce((sum, ball) => sum + tipValue(ball), 0);
  const slots = balls.reduce(
    (sum, ball) => sum + artifactSpace(ball, wide ? 'lowbin' : 'pocket'),
    0,
  );
  const tipped = load >= GOAL_TIP_AT;
  return (
    <div className="ball-demo">
      <div className="ball-demo-key">
        <span>🟡 Yellow: +1 fill</span>
        <span>🔵 Blue: +{NECTAR_TIP_VALUE} fill</span>
      </div>
      <progress
        aria-label="Goal fill"
        max={GOAL_TIP_AT}
        value={Math.min(load, GOAL_TIP_AT)}
      />
      <p aria-live="polite">
        {tipped
          ? `It tipped! +${TIP_POINTS} points!`
          : `${load} / ${GOAL_TIP_AT} to tip the goal`}
      </p>
      <div className="ball-demo-actions">
        <Button
          variant="outline"
          disabled={tipped}
          onClick={() => setBalls([...balls, 'G'])}
        >
          Add yellow
        </Button>
        <Button
          variant="outline"
          disabled={tipped}
          onClick={() => setBalls([...balls, 'P'])}
        >
          Add blue
        </Button>
        <Button variant="ghost" onClick={() => setBalls([])}>
          Reset
        </Button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={wide}
          onChange={(event) => setWide(event.target.checked)}
        />{' '}
        Try the wide Low Rider bin
      </label>
      <p>
        This mix uses {slots} storage slots across your trips. Blue balls use{' '}
        {wide ? 'one slot' : 'two slots'} each with this bin.
      </p>
    </div>
  );
}

type Slide = { title: string; text: ReactNode; art: ReactNode; demo?: boolean };

const slides: Slide[] = [
  {
    title: 'Drive',
    text: (
      <>
        Drive with <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>, or the
        touch pad. Use arrow keys to turn and tilt your view. <kbd>Esc</kbd>{' '}
        pauses.
      </>
    ),
    art: (
      <>
        <Mats />
        <Key x={58} y={44} label="W" />
        <Key x={30} y={72} label="A" />
        <Key x={58} y={72} label="S" />
        <Key x={86} y={72} label="D" />
        <Key x={44} y={112} label="Esc" width={52} />
        <path
          d="M150 118 C 180 120, 200 60, 236 52"
          fill="none"
          stroke={BLUE}
          strokeWidth="3"
          strokeDasharray="7 6"
          strokeLinecap="round"
        />
        <TopRobot x={262} y={46} turn={-20} />
      </>
    ),
  },
  {
    title: 'Collect',
    text: (
      <>
        Drive up to a ball and hold <kbd>Space</kbd> (or ACTION) to pick it up.
        Pick up yellow and blue balls. Leave red balls for the other robot.
      </>
    ),
    art: (
      <>
        <Mats />
        <TopRobot x={70} y={80} />
        <Pollen x={112} y={80} />
        <Pollen x={160} y={52} />
        <Pollen x={176} y={104} />
        <Nectar x={226} y={70} />
        <Nectar x={274} y={112} color={RED} />
        <path
          d="M266 104 L282 120 M282 104 L266 120"
          stroke="#fbf8f1"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g transform="translate(208 18)">
          {[0, 1, 2, 3].map((slot) => (
            <rect
              key={slot}
              x={slot * 22}
              width="20"
              height="20"
              rx="3"
              fill="#fbf8f1"
              stroke="#9c9386"
            />
          ))}
          <circle cx="10" cy="10" r="6" fill={POLLEN} />
          <rect x="25" y="3" width="36" height="14" rx="7" fill={BLUE} />
        </g>
      </>
    ),
  },
  {
    title: 'Mix your balls!',
    text: (
      <>
        Blue balls fill the goal faster, but take more room. Try a mix below,
        then swap the bin to see what changes.
      </>
    ),
    art: (
      <>
        <Pollen x={80} y={80} />
        <Nectar x={160} y={80} />
        <Nectar x={240} y={80} color={RED} />
        <text x="240" y="125" textAnchor="middle" fill={INK} fontSize="14">
          Other team
        </text>
      </>
    ),
    demo: true,
  },
  {
    title: 'Shoot into the raised basket',
    text: (
      <>
        Find the blue shooting zone by the raised basket. Drive inside it, stop,
        and hold <kbd>Space</kbd> to shoot. Every shooter can miss!
      </>
    ),
    art: (
      <>
        <SideHive
          tilt={20}
          balls={
            <>
              <circle cx="143" cy="77" r="5" fill={POLLEN} />
              <circle cx="133" cy="77" r="5" fill={POLLEN} />
              <circle cx="141" cy="67" r="6" fill={BLUE} />
            </>
          }
        />
        <SideRobot x={18} />
        <path
          d="M52 86 Q 52 34, 82 30"
          fill="none"
          stroke={INK}
          strokeWidth="2.5"
          strokeDasharray="5 5"
          strokeLinecap="round"
        />
        <circle cx="60" cy="50" r="5" fill={POLLEN} />
        <text x="96" y="16" fontSize="11" fontWeight="800" fill={BLUE}>
          UP CELL
        </text>
      </>
    ),
  },
  {
    title: 'Tip the HIVE',
    text: (
      <>
        Fill the goal to {GOAL_TIP_AT} to tip it and earn {TIP_POINTS} points!
        Balls roll back out. Drive around to the other basket and try again.
      </>
    ),
    art: (
      <>
        <SideHive
          tilt={-20}
          balls={<circle cx="96" cy="72" r="5" fill={POLLEN} />}
        />
        <circle cx="66" cy="112" r="5" fill={POLLEN} />
        <circle cx="48" cy="132" r="5" fill={POLLEN} />
        <circle cx="28" cy="132" r="6" fill={BLUE} />
        <path
          d="M96 150 C 150 158, 230 158, 286 128"
          fill="none"
          stroke={BLUE}
          strokeWidth="3"
          strokeDasharray="7 6"
          strokeLinecap="round"
        />
        <path
          d="M280 120 L292 126 L282 136"
          fill="none"
          stroke={BLUE}
          strokeWidth="3"
        />
        <Badge x={272} y={30} text={`+${TIP_POINTS}`} />
      </>
    ),
  },
  {
    title: 'Get home',
    text: (
      <>
        In the last 10 seconds, park in your blue BASE for {BASE_POINTS} more
        points. Matches last 60 seconds: outscore Scout-7, the red robot, to
        win.
      </>
    ),
    art: (
      <>
        <Mats />
        <rect
          x="14"
          y="78"
          width="92"
          height="70"
          fill="rgba(47,111,214,0.18)"
          stroke={BLUE}
          strokeWidth="3"
        />
        <text
          x="60"
          y="140"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill={BLUE}
        >
          BASE
        </text>
        <path
          d="M230 50 C 190 52, 120 70, 82 100"
          fill="none"
          stroke={BLUE}
          strokeWidth="3"
          strokeDasharray="7 6"
          strokeLinecap="round"
        />
        <TopRobot x={256} y={44} turn={160} />
        <g transform="translate(166 112)">
          <rect x="-30" y="-15" width="60" height="30" rx="4" fill={ROBOT} />
          <text
            y="6"
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill={TRIM}
          >
            0:10
          </text>
        </g>
        <Badge x={270} y={126} text={`+${BASE_POINTS}`} />
      </>
    ),
  },
];

export function HowToPlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const last = index === slides.length - 1;

  const change = (next: boolean) => {
    if (!next) rememberSeen();
    onOpenChange(next);
  };
  const step = (by: number) =>
    setIndex((current) =>
      Math.max(0, Math.min(slides.length - 1, current + by)),
    );
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      // Start from the first slide next time, once it has finished closing.
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setIndex(0);
      }}
    >
      <DialogContent className="how-dialog how-to-play" onKeyDown={keys}>
        <p className="eyebrow">
          HOW TO PLAY · {index + 1} / {slides.length}
        </p>
        <div className="how-to-play-slide" key={index}>
          <svg
            className="how-to-play-art"
            viewBox="0 0 320 160"
            aria-hidden="true"
          >
            {slide.art}
          </svg>
          <DialogTitle>{slide.title}</DialogTitle>
          <DialogDescription>{slide.text}</DialogDescription>
          {slide.demo && <BallDemo />}
        </div>
        <div className="how-to-play-nav">
          <Button
            variant="outline"
            className="how-to-play-back"
            onClick={() => step(-1)}
            disabled={index === 0}
          >
            <ArrowLeft aria-hidden="true" /> Back
          </Button>
          <div className="how-to-play-dots">
            {slides.map((item, dot) => (
              <button
                key={item.title}
                type="button"
                className={dot === index ? 'is-current' : ''}
                aria-label={`Slide ${dot + 1}: ${item.title}`}
                aria-current={dot === index ? 'step' : undefined}
                onClick={() => setIndex(dot)}
              />
            ))}
          </div>
          {last ? (
            <Button className="how-to-play-next" onClick={() => change(false)}>
              Let&rsquo;s play <Play aria-hidden="true" />
            </Button>
          ) : (
            <Button className="how-to-play-next" onClick={() => step(1)}>
              Next <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
