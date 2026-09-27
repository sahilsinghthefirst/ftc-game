'use client';

import { Cable, CircleCheck, GripVertical, Wrench } from 'lucide-react';

export type AssemblyCategory =
  | 'drive'
  | 'collect'
  | 'carry'
  | 'reach'
  | 'score'
  | 'assist';

type AssemblyBayProps = {
  selected: Record<AssemblyCategory, string>;
  activeCategory: AssemblyCategory;
  draggingCategory: AssemblyCategory | null;
  snappingCategory: AssemblyCategory | null;
  mountSlot: number;
  mechanismRunning: boolean;
};

type PartIllustrationProps = {
  category: AssemblyCategory;
  id: string;
  compact?: boolean;
};

const holes = Array.from({ length: 12 });

function Channel({
  x,
  y,
  width,
  transform,
}: {
  x: number;
  y: number;
  width: number;
  transform?: string;
}) {
  const count = Math.max(3, Math.floor(width / 30));
  return (
    <g transform={transform}>
      <rect
        x={x}
        y={y}
        width={width}
        height="28"
        rx="3"
        fill="url(#channelFace)"
        stroke="#33424a"
        strokeWidth="2"
      />
      <path
        d={`M ${x + 2} ${y + 6} H ${x + width - 2}`}
        stroke="#fff"
        strokeOpacity=".72"
      />
      {Array.from({ length: count }).map((_, index) => (
        <g key={index}>
          <circle
            cx={x + 17 + index * ((width - 34) / Math.max(1, count - 1))}
            cy={y + 14}
            r="6.3"
            fill="#edf0ef"
            stroke="#65727a"
            strokeWidth="1.5"
          />
          <circle
            cx={x + 17 + index * ((width - 34) / Math.max(1, count - 1))}
            cy={y + 14}
            r="2"
            fill="#aab3b7"
          />
        </g>
      ))}
    </g>
  );
}

function Bolt({ x, y }: { x: number; y: number }) {
  return (
    <g className="assembly-bolt" transform={`translate(${x} ${y})`}>
      <circle r="6" fill="#d5dadc" stroke="#435159" strokeWidth="1.5" />
      <path d="M-3 0H3M0-3V3" stroke="#67757c" strokeWidth="1.2" />
    </g>
  );
}

function Wheel({
  x,
  y,
  kind,
  rear = false,
}: {
  x: number;
  y: number;
  kind: string;
  rear?: boolean;
}) {
  const mecanum = kind === 'comet';
  const omni = kind === 'orbit';
  const traction = kind === 'anchor' || kind === 'trailblazer';
  const clipId = `wheel-clip-${kind}-${x}-${y}`;
  return (
    <g
      className={`wheel ${mecanum ? 'mecanum' : omni ? 'omni' : 'traction'}`}
      transform={`translate(${x} ${y}) ${rear ? 'scale(.92)' : ''}`}
    >
      <clipPath id={clipId}>
        <ellipse
          cx="0"
          cy="0"
          rx={traction ? 27 : 25}
          ry={traction ? 39 : 36}
        />
      </clipPath>
      <ellipse
        cx="0"
        cy="0"
        rx={traction ? 29 : 27}
        ry={traction ? 41 : 38}
        fill={mecanum ? '#3b464d' : '#1f292f'}
        stroke="#11181c"
        strokeWidth="4"
      />
      {mecanum && (
        <g clipPath={`url(#${clipId})`}>
          {[-45, -34, -23, -12, -1, 10, 21, 32, 43].map((offset) => (
            <g key={offset}>
              <path
                d={`M-27 ${offset - 13} L27 ${offset + 13}`}
                stroke="#222b30"
                strokeWidth="13"
                strokeLinecap="round"
              />
              <path
                d={`M-27 ${offset - 13} L27 ${offset + 13}`}
                stroke="#e8539b"
                strokeWidth="9.5"
                strokeLinecap="round"
              />
              <path
                d={`M-19 ${offset - 10} L19 ${offset + 8}`}
                stroke="#f48fc2"
                strokeWidth="2.6"
                strokeLinecap="round"
                opacity="0.55"
              />
            </g>
          ))}
        </g>
      )}
      {omni &&
        [-22, -9, 9, 22].map((offset) => (
          <rect
            key={offset}
            x={offset - 4}
            y="-30"
            width="8"
            height="60"
            rx="4"
            fill="#3b82a8"
            transform={`rotate(${offset * 1.8})`}
          />
        ))}
      {traction &&
        [-24, -12, 0, 12, 24].map((offset) => (
          <path
            key={offset}
            d={`M-22 ${offset} H22`}
            stroke="#536169"
            strokeWidth="4"
          />
        ))}
      <ellipse
        cx="0"
        cy="0"
        rx="12"
        ry="17"
        fill={mecanum ? '#55626a' : '#cfd6d8'}
      />
      {mecanum && <ellipse cx="0" cy="0" rx="8" ry="12" fill="#cfd6d8" />}
      <circle cx="0" cy="0" r="5" fill="#627078" />
      {mecanum &&
        [-1, 1].map((side) => (
          <circle key={side} cx="0" cy={side * 8} r="1.9" fill="#8c989f" />
        ))}
    </g>
  );
}

function PartMount({
  category,
  activeCategory,
  draggingCategory,
  x,
  y,
  label,
}: {
  category: AssemblyCategory;
  activeCategory: AssemblyCategory;
  draggingCategory: AssemblyCategory | null;
  x: number;
  y: number;
  label: string;
}) {
  const active = category === activeCategory;
  const dragging = category === draggingCategory;
  return (
    <g
      className={`mount-marker ${active ? 'is-active' : ''} ${dragging ? 'is-drop-ready' : ''}`}
      transform={`translate(${x} ${y})`}
    >
      <circle r="30" fill="none" strokeWidth="2" />
      <circle r="5" />
      <path d="M-19 0H19M0-19V19" />
      <text x="38" y="-4">
        {label}
      </text>
      <text className="mount-hint" x="38" y="13">
        {dragging ? 'DROP HERE' : 'CURRENT MOUNT'}
      </text>
    </g>
  );
}

function Intake({ id }: { id: string }) {
  const twin = id === 'twinflex';
  if (id === 'dualjaw')
    return (
      <g className="intake-rollers">
        <path
          d="M139 345L92 352M139 395L92 392"
          stroke="#4b5b63"
          strokeWidth="7"
        />
        <path
          d="M96 330L44 356L96 372Z"
          fill="#f1b930"
          stroke="#6c371f"
          strokeWidth="3"
        />
        <path
          d="M96 412L44 386L96 370Z"
          fill="#f1b930"
          stroke="#6c371f"
          strokeWidth="3"
        />
        <circle cx="96" cy="371" r="8" fill="#6c371f" />
      </g>
    );
  if (id === 'sorter')
    return (
      <g className="intake-rollers">
        <path
          d="M139 345L104 356M139 395L104 388"
          stroke="#4b5b63"
          strokeWidth="7"
        />
        <path
          d="M104 330L40 352L40 392L104 414Z"
          fill="#9156d9"
          stroke="#4b2a72"
          strokeWidth="3"
        />
        <path d="M104 352L62 364L62 380L104 392Z" fill="#2b1b45" />
        <circle
          cx="52"
          cy="372"
          r="11"
          fill="#b77bff"
          stroke="#4b2a72"
          strokeWidth="3"
        />
      </g>
    );
  return (
    <g className="intake-rollers">
      <path
        d="M139 345L80 365M139 395L80 405"
        stroke="#4b5b63"
        strokeWidth="7"
      />
      <rect
        x="45"
        y="358"
        width="128"
        height="25"
        rx="12"
        fill={twin ? '#f1b930' : '#e86b2b'}
        stroke="#6c371f"
        strokeWidth="3"
      />
      {[58, 78, 98, 118, 138, 158].map((x) => (
        <path
          key={x}
          d={`M${x} 361V380`}
          stroke="#fff2d0"
          strokeOpacity=".7"
          strokeWidth="4"
        />
      ))}
      {twin && (
        <rect
          x="52"
          y="391"
          width="116"
          height="19"
          rx="9"
          fill="#df7e27"
          stroke="#6c371f"
          strokeWidth="3"
        />
      )}
    </g>
  );
}

function Storage({ id }: { id: string }) {
  if (id === 'beltbridge') {
    return (
      <g>
        <path
          d="M274 304L420 253L439 292L289 348Z"
          fill="#2b3439"
          stroke="#101719"
          strokeWidth="3"
        />
        <path
          d="M292 319L424 273"
          stroke="#e9b82e"
          strokeWidth="12"
          strokeDasharray="7 8"
        />
        <circle
          cx="293"
          cy="319"
          r="14"
          fill="#d7dcdd"
          stroke="#4b585f"
          strokeWidth="3"
        />
        <circle
          cx="423"
          cy="274"
          r="14"
          fill="#d7dcdd"
          stroke="#4b585f"
          strokeWidth="3"
        />
      </g>
    );
  }
  if (id === 'pocket') {
    return (
      <g>
        <path
          d="M288 286H406L392 347H304Z"
          fill="#304d5c"
          stroke="#172832"
          strokeWidth="3"
        />
        <path d="M319 296V338M354 296V338" stroke="#bfd3dc" strokeWidth="5" />
        <circle cx="334" cy="314" r="12" fill="#9c5ad1" />
        <circle cx="370" cy="318" r="12" fill="#9bc53d" />
      </g>
    );
  }
  const tall = id === 'stackpack';
  return (
    <g>
      <path
        d={tall ? 'M286 205H411L397 345H300Z' : 'M287 269H411L397 345H300Z'}
        fill="rgba(51,103,129,.78)"
        stroke="#173545"
        strokeWidth="4"
      />
      <path
        d={tall ? 'M302 219H395' : 'M301 282H396'}
        stroke="#dbe9ee"
        strokeOpacity=".8"
        strokeWidth="4"
      />
      <path d="M315 337V292M381 337V292" stroke="#88a7b4" strokeWidth="3" />
    </g>
  );
}

function Reach({ id }: { id: string }) {
  if (id === 'swingarm') {
    return (
      <g className="pivot-arm">
        <circle
          cx="457"
          cy="337"
          r="25"
          fill="#d4dadc"
          stroke="#37464e"
          strokeWidth="4"
        />
        <path
          d="M458 334L535 155"
          stroke="#c9d0d2"
          strokeWidth="18"
          strokeLinecap="round"
        />
        {holes.slice(0, 6).map((_, i) => (
          <circle
            key={i}
            cx={469 + i * 12}
            cy={309 - i * 28}
            r="3.5"
            fill="#7f8b90"
          />
        ))}
      </g>
    );
  }
  if (id === 'turret') {
    return (
      <g className="turret-arm">
        <ellipse
          cx="465"
          cy="330"
          rx="52"
          ry="20"
          fill="#d8ddde"
          stroke="#3d4b52"
          strokeWidth="4"
        />
        <circle cx="465" cy="329" r="26" fill="#2f424c" />
        <path d="M465 312V172" stroke="#c7ced1" strokeWidth="22" />
        <path
          d="M465 312V172"
          stroke="#6f7c82"
          strokeWidth="2"
          strokeDasharray="5 11"
        />
      </g>
    );
  }
  const cascade = id === 'cascade';
  return (
    <g className="linear-slides">
      <rect
        x="429"
        y={cascade ? 119 : 157}
        width="24"
        height={cascade ? 226 : 188}
        rx="4"
        fill="#d7dcde"
        stroke="#3d4a51"
        strokeWidth="3"
      />
      <rect
        x="462"
        y={cascade ? 91 : 139}
        width="24"
        height={cascade ? 254 : 206}
        rx="4"
        fill="#eef0f0"
        stroke="#3d4a51"
        strokeWidth="3"
      />
      {cascade && (
        <rect
          x="495"
          y="65"
          width="24"
          height="280"
          rx="4"
          fill="#c9d0d3"
          stroke="#3d4a51"
          strokeWidth="3"
        />
      )}
      <path
        d={cascade ? 'M440 329L507 83' : 'M440 329L474 155'}
        stroke="#e7a626"
        strokeWidth="3"
        strokeDasharray="5 5"
      />
      {[442, 475].map((x) => (
        <circle
          key={x}
          cx={x}
          cy="327"
          r="12"
          fill="#2a383f"
          stroke="#c08e26"
          strokeWidth="3"
        />
      ))}
    </g>
  );
}

function Scorer({ id }: { id: string }) {
  if (id === 'flywheel') {
    return (
      <g className="scorer-head flywheel-head">
        <path
          d="M483 81H604L624 135H489Z"
          fill="#e66b2b"
          stroke="#6f321c"
          strokeWidth="4"
        />
        <circle
          cx="528"
          cy="109"
          r="24"
          fill="#232e33"
          stroke="#f0b12c"
          strokeWidth="6"
        />
        <circle
          cx="581"
          cy="109"
          r="24"
          fill="#232e33"
          stroke="#f0b12c"
          strokeWidth="6"
        />
      </g>
    );
  }
  if (id === 'tiptray') {
    return (
      <g className="scorer-head tip-tray">
        <path
          d="M472 92L615 77L602 137L482 145Z"
          fill="#e9b42d"
          stroke="#70571a"
          strokeWidth="4"
        />
        <path d="M491 109H595" stroke="#fff3bb" strokeWidth="5" />
      </g>
    );
  }
  const gate = id === 'truegate';
  return (
    <g className="scorer-head">
      <rect
        x="478"
        y="91"
        width="118"
        height="61"
        rx="8"
        fill={gate ? '#efbd35' : '#e87030'}
        stroke="#5b4520"
        strokeWidth="4"
      />
      <path d="M492 108H578V135H492Z" fill="#27353b" />
      {gate ? (
        <path d="M541 105V140" stroke="#f1f3f2" strokeWidth="6" />
      ) : (
        <path
          d="M500 121H573"
          stroke="#f7d2be"
          strokeWidth="5"
          strokeDasharray="8 6"
        />
      )}
    </g>
  );
}

function Sensor({ id }: { id: string }) {
  const isColor = id === 'coloreye';
  const isRange = id === 'range';
  return (
    <g className="sensor-head">
      <path d="M176 281L147 307" stroke="#44535b" strokeWidth="6" />
      <rect
        x="142"
        y="263"
        width="55"
        height="36"
        rx="6"
        fill="#222e34"
        stroke="#d4dadd"
        strokeWidth="3"
      />
      {isColor ? (
        <>
          <circle cx="160" cy="281" r="8" fill="#9154ce" />
          <circle cx="179" cy="281" r="8" fill="#98c53d" />
        </>
      ) : isRange ? (
        <>
          <circle cx="158" cy="281" r="8" fill="#59a6cc" />
          <circle cx="180" cy="281" r="8" fill="#59a6cc" />
        </>
      ) : (
        <path d="M153 282L171 272L188 283L171 291Z" fill="#58a9cf" />
      )}
    </g>
  );
}

export function PartIllustration({
  category,
  id,
  compact,
}: PartIllustrationProps) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      className={`part-illustration ${compact ? 'is-compact' : ''}`}
      viewBox="0 0 120 84"
      aria-hidden="true"
    >
      <rect x="9" y="11" width="102" height="62" rx="7" fill="#f4f1e8" />
      <path
        d="M19 66H101"
        stroke="#c8c2b4"
        strokeWidth="2"
        strokeDasharray="2 7"
      />
      {category === 'drive' && (
        <g {...common}>
          <rect x="29" y="29" width="62" height="27" rx="3" fill="#d9dedf" />
          {[27, 93].map((x) => (
            <g key={x}>
              <circle
                cx={x}
                cy="32"
                r={id === 'trailblazer' ? 11 : 9}
                fill="#263036"
              />
              <circle
                cx={x}
                cy="55"
                r={id === 'trailblazer' ? 11 : 9}
                fill="#263036"
              />
            </g>
          ))}
          {id === 'trailblazer' && (
            <>
              <circle cx="60" cy="32" r="10" fill="#263036" />
              <circle cx="60" cy="55" r="10" fill="#263036" />
            </>
          )}
          <path
            d="M37 36H83M37 48H83"
            stroke="#758289"
            strokeWidth="4"
            strokeDasharray="2 8"
          />
        </g>
      )}
      {category === 'collect' && (
        <g {...common}>
          <path d="M44 29L29 60M77 29L92 60" />
          {id === 'dualjaw' ? (
            <>
              <path d="M26 38L60 52L26 60Z" fill="#e6b336" />
              <path d="M94 38L60 52L94 60Z" fill="#e6b336" />
              <circle cx="60" cy="56" r="5" fill="#8a5a1d" />
            </>
          ) : id === 'sorter' ? (
            <>
              <path d="M26 36L94 36L70 72L50 72Z" fill="#9156d9" />
              <circle cx="60" cy="52" r="9" fill="#2b1b45" />
            </>
          ) : (
            <>
              <rect
                x="28"
                y="44"
                width="64"
                height="15"
                rx="7"
                fill="#e77736"
              />
              {id === 'twinflex' && (
                <rect
                  x="32"
                  y="63"
                  width="56"
                  height="10"
                  rx="5"
                  fill="#e6b336"
                />
              )}
            </>
          )}
        </g>
      )}
      {category === 'carry' && (
        <g {...common}>
          {id === 'beltbridge' ? (
            <>
              <path d="M26 56L88 26L99 45L36 68Z" fill="#39464c" />
              <path
                d="M36 58L91 34"
                stroke="#e8b52d"
                strokeWidth="7"
                strokeDasharray="5 6"
              />
            </>
          ) : (
            <path
              d={
                id === 'stackpack'
                  ? 'M34 17H86L82 68H38Z'
                  : 'M29 32H91L83 68H37Z'
              }
              fill="#4f8097"
            />
          )}
        </g>
      )}
      {category === 'reach' && (
        <g {...common}>
          {id === 'swingarm' ? (
            <>
              <circle cx="35" cy="62" r="11" fill="#d9dedf" />
              <path d="M39 56L82 18" strokeWidth="11" />
            </>
          ) : id === 'turret' ? (
            <>
              <ellipse cx="58" cy="63" rx="27" ry="9" fill="#d9dedf" />
              <path d="M58 58V19" strokeWidth="12" />
            </>
          ) : (
            <>
              <rect
                x="42"
                y={id === 'cascade' ? 12 : 22}
                width="12"
                height={id === 'cascade' ? 57 : 47}
                fill="#d9dedf"
              />
              <rect x="62" y="7" width="12" height="62" fill="#eef0f0" />
            </>
          )}
        </g>
      )}
      {category === 'score' && (
        <g {...common}>
          <path
            d="M31 32H89L96 62H26Z"
            fill={id === 'flywheel' ? '#e66b2b' : '#e9b42d'}
          />
          {id === 'flywheel' ? (
            <>
              <circle cx="49" cy="47" r="12" fill="#283238" />
              <circle cx="75" cy="47" r="12" fill="#283238" />
            </>
          ) : id === 'truegate' ? (
            <path d="M60 34V63" stroke="#fff" strokeWidth="6" />
          ) : (
            <path d="M39 46H82" stroke="#fff4c7" strokeWidth="5" />
          )}
        </g>
      )}
      {category === 'assist' && (
        <g {...common}>
          <rect x="34" y="26" width="52" height="35" rx="6" fill="#2b373d" />
          {id === 'coloreye' ? (
            <>
              <circle cx="51" cy="43" r="8" fill="#8f58c6" />
              <circle cx="70" cy="43" r="8" fill="#9ac440" />
            </>
          ) : (
            <>
              <circle cx="50" cy="43" r="8" fill="#5ba9cf" />
              <circle cx="71" cy="43" r="8" fill="#5ba9cf" />
            </>
          )}
          <path d="M60 61V70" />
        </g>
      )}
    </svg>
  );
}

export function AssemblyBay({
  selected,
  activeCategory,
  draggingCategory,
  snappingCategory,
  mountSlot,
  mechanismRunning,
}: AssemblyBayProps) {
  const horizontalOffset = (mountSlot - 1) * 22;
  return (
    <div
      className={`assembly-viewport ${draggingCategory ? 'is-dragging' : ''}`}
    >
      <svg
        className="assembly-diagram"
        viewBox="0 0 720 500"
        aria-labelledby="robot-assembly-title robot-assembly-description"
      >
        <title id="robot-assembly-title">Assembled FTC-style robot</title>
        <desc id="robot-assembly-description">
          A robot assembled from patterned aluminum channel, brackets, supported
          shafts, motors, a collector, storage, slides, a scorer, sensors, and
          routed wiring.
        </desc>
        <defs>
          <linearGradient id="channelFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f5f6f4" />
            <stop offset=".5" stopColor="#cbd1d3" />
            <stop offset="1" stopColor="#aeb8bb" />
          </linearGradient>
          <linearGradient id="polyShield" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b9dce8" stopOpacity=".58" />
            <stop offset="1" stopColor="#5c9bb3" stopOpacity=".18" />
          </linearGradient>
          <filter id="robotShadow" x="-20%" y="-30%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <ellipse
          cx="354"
          cy="435"
          rx="270"
          ry="31"
          fill="#17252c"
          opacity=".15"
          filter="url(#robotShadow)"
        />
        <path className="datum-line" d="M72 452H650" />
        <text className="datum-label" x="72" y="472">
          18 in inspection footprint
        </text>

        <g
          className={`part-group drive-group ${activeCategory === 'drive' ? 'is-active' : ''} ${snappingCategory === 'drive' ? 'is-snapping' : ''}`}
        >
          <Wheel x={190} y={394} kind={selected.drive} />
          <Wheel x={537} y={394} kind={selected.drive} />
          {selected.drive === 'trailblazer' && (
            <>
              <Wheel x={360} y={407} kind={selected.drive} rear />
              <Wheel x={275} y={398} kind={selected.drive} rear />
            </>
          )}
          <Wheel x={211} y={335} kind={selected.drive} rear />
          <Wheel x={557} y={335} kind={selected.drive} rear />
          <Channel x={165} y={333} width={410} />
          <Channel x={165} y={395} width={410} />
          <Channel x={193} y={338} width={85} transform="rotate(90 193 338)" />
          <Channel x={548} y={338} width={85} transform="rotate(90 548 338)" />
          <rect
            x="250"
            y="353"
            width="62"
            height="38"
            rx="6"
            fill="#2f383c"
            stroke="#0f1517"
            strokeWidth="3"
          />
          <rect
            x="469"
            y="353"
            width="62"
            height="38"
            rx="6"
            fill="#2f383c"
            stroke="#0f1517"
            strokeWidth="3"
          />
          <path d="M251 372H223M531 372H553" stroke="#d4d9da" strokeWidth="8" />
          <g className="corner-brackets">
            <path
              d="M170 338H201V368"
              fill="none"
              stroke="#e6b32e"
              strokeWidth="7"
            />
            <path
              d="M570 338H539V368"
              fill="none"
              stroke="#e6b32e"
              strokeWidth="7"
            />
            <Bolt x={187} y={347} />
            <Bolt x={548} y={347} />
          </g>
        </g>

        <g className="electronics-deck">
          <rect
            x="300"
            y="352"
            width="145"
            height="48"
            rx="7"
            fill="#303a3f"
            stroke="#141b1f"
            strokeWidth="3"
          />
          <rect
            x="315"
            y="360"
            width="79"
            height="32"
            rx="4"
            fill="#20282c"
            stroke="#869298"
            strokeWidth="2"
          />
          <text
            x="354"
            y="378"
            textAnchor="middle"
            fill="#e5e8e8"
            fontSize="9"
            fontWeight="700"
          >
            CONTROL HUB
          </text>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={402 + i * 8}
              y="365"
              width="5"
              height="11"
              rx="1"
              fill="#d99031"
            />
          ))}
          <rect
            x="322"
            y="405"
            width="100"
            height="22"
            rx="4"
            fill="#1f292e"
            stroke="#4b5a62"
            strokeWidth="2"
          />
          <text x="372" y="419" textAnchor="middle" fill="#c9d0d2" fontSize="8">
            12V BATTERY
          </text>
          <path
            className="wire power-wire"
            d="M420 410C461 419 491 393 506 377"
          />
          <path
            className="wire signal-wire"
            d="M400 367C354 323 273 326 185 283"
          />
          <path
            className="wire encoder-wire"
            d="M406 379C450 323 476 275 474 218"
          />
        </g>

        <g
          transform={`translate(${horizontalOffset * 0.35} 0)`}
          className={`part-group collect-group ${mechanismRunning ? 'is-running' : ''} ${activeCategory === 'collect' ? 'is-active' : ''} ${snappingCategory === 'collect' ? 'is-snapping' : ''}`}
        >
          <path
            d="M148 350H177V397H148"
            fill="#d9dedf"
            stroke="#48565e"
            strokeWidth="4"
          />
          <Bolt x={160} y={363} />
          <Bolt x={160} y={386} />
          <Intake id={selected.collect} />
        </g>

        <g
          transform={`translate(${horizontalOffset * 0.55} 0)`}
          className={`part-group carry-group ${activeCategory === 'carry' ? 'is-active' : ''} ${snappingCategory === 'carry' ? 'is-snapping' : ''}`}
        >
          <path
            d="M282 333H312V361H282"
            fill="#d9dedf"
            stroke="#48565e"
            strokeWidth="4"
          />
          <Bolt x={296} y={344} />
          <Bolt x={296} y={356} />
          <Storage id={selected.carry} />
        </g>

        <g
          transform={`translate(${horizontalOffset} 0)`}
          className={`part-group reach-group ${mechanismRunning ? 'is-running' : ''} ${activeCategory === 'reach' ? 'is-active' : ''} ${snappingCategory === 'reach' ? 'is-snapping' : ''}`}
        >
          <path
            d="M421 322H458V356H421"
            fill="#d9dedf"
            stroke="#48565e"
            strokeWidth="4"
          />
          <Bolt x={437} y={335} />
          <Bolt x={448} y={349} />
          <Reach id={selected.reach} />
        </g>

        <g
          transform={`translate(${horizontalOffset} 0)`}
          className={`part-group score-group ${mechanismRunning ? 'is-running' : ''} ${activeCategory === 'score' ? 'is-active' : ''} ${snappingCategory === 'score' ? 'is-snapping' : ''}`}
        >
          <Scorer id={selected.score} />
        </g>

        <g
          transform={`translate(${horizontalOffset * 0.2} 0)`}
          className={`part-group assist-group ${activeCategory === 'assist' ? 'is-active' : ''} ${snappingCategory === 'assist' ? 'is-snapping' : ''}`}
        >
          <Sensor id={selected.assist} />
        </g>

        <path
          d="M282 344L279 302L298 289"
          fill="none"
          stroke="#e6b32e"
          strokeWidth="6"
        />
        <path
          d="M426 344L421 302L438 289"
          fill="none"
          stroke="#e6b32e"
          strokeWidth="6"
        />
        <rect
          x="283"
          y="318"
          width="263"
          height="75"
          rx="11"
          fill="url(#polyShield)"
          stroke="#5b8393"
          strokeWidth="2"
          strokeDasharray="7 5"
        />

        <PartMount
          category="drive"
          activeCategory={activeCategory}
          draggingCategory={draggingCategory}
          x={601}
          y={403}
          label="DRIVE RAIL"
        />
        <PartMount
          category="collect"
          activeCategory={activeCategory}
          draggingCategory={draggingCategory}
          x={117}
          y={345}
          label="FRONT CROSS RAIL"
        />
        <PartMount
          category="carry"
          activeCategory={activeCategory}
          draggingCategory={draggingCategory}
          x={346}
          y={278}
          label="CENTER DECK"
        />
        <PartMount
          category="reach"
          activeCategory={activeCategory}
          draggingCategory={draggingCategory}
          x={463}
          y={221}
          label="REAR TOWER"
        />
        <PartMount
          category="score"
          activeCategory={activeCategory}
          draggingCategory={draggingCategory}
          x={560}
          y={117}
          label="TOOL PLATE"
        />
        <PartMount
          category="assist"
          activeCategory={activeCategory}
          draggingCategory={draggingCategory}
          x={167}
          y={278}
          label="SENSOR BRACKET"
        />
      </svg>

      <div className="assembly-legend" aria-hidden="true">
        <span>
          <i className="legend-hole" /> 16 mm mount holes
        </span>
        <span>
          <i className="legend-bracket" /> Auto-fit brackets
        </span>
        <span>
          <i className="legend-wire" /> Protected wire route
        </span>
      </div>

      <div className="drop-instruction" aria-live="polite">
        {draggingCategory ? (
          <>
            <GripVertical /> Release on the pulsing mount
          </>
        ) : (
          <>
            <Wrench /> Pick up a part from the tray
          </>
        )}
      </div>

      <div className="pit-check-badge">
        <CircleCheck />
        <span>
          <strong>Pit check</strong> supported shafts · guarded wires
        </span>
        <Cable />
      </div>
    </div>
  );
}
