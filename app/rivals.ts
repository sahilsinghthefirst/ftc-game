// Scout-7's five levels, easiest first, and everything that changes between
// them. Each in-between level sits halfway between its neighbours, so every
// step up is a real but gentle step.

export const RIVALS = [
  'rookie',
  'contender',
  'rival',
  'veteran',
  'ace',
] as const;
export type Difficulty = (typeof RIVALS)[number];

export type RivalLevel = {
  name: string;
  // How it steers, in a few words for the rival cards.
  steering: string;
  // Top speed in inches a second, before the small per-match variation
  // (see bot-style).
  speed: number;
  // How hard it speeds up and slows down, in field units a second squared.
  acceleration: number;
  // The share of its speed it keeps each step once it has nowhere to go:
  // lower stops sooner.
  coast: number;
  // How far it weaves off its line, in radians, and how fast.
  weave: number;
  weaveRate: number;
  // Seconds between changes of plan.
  think: number;
  // Storage slots: POLLEN fills one, NECTAR two.
  capacity: number;
  // Chance a load bounces out of the CELL.
  miss: number;
  // Seconds between loads, and between pickups.
  loadGap: number;
  pickupGap: number;
};

export const rivalLevels: Record<Difficulty, RivalLevel> = {
  rookie: {
    name: 'Rookie',
    steering: 'weaves as it drives',
    speed: 31,
    acceleration: 830,
    coast: 0.82,
    weave: 0.16,
    weaveRate: 2.1,
    think: 0.48,
    capacity: 2,
    miss: 0.22,
    loadGap: 0.72,
    pickupGap: 0.62,
  },
  contender: {
    name: 'Contender',
    steering: 'weaves a little',
    speed: 34.5,
    acceleration: 945,
    coast: 0.76,
    weave: 0.11,
    weaveRate: 2.4,
    think: 0.36,
    capacity: 2,
    miss: 0.18,
    loadGap: 0.58,
    pickupGap: 0.48,
  },
  rival: {
    name: 'Rival',
    steering: 'steadier steering',
    speed: 38,
    acceleration: 1060,
    coast: 0.7,
    weave: 0.06,
    weaveRate: 2.7,
    think: 0.25,
    capacity: 3,
    miss: 0.14,
    loadGap: 0.45,
    pickupGap: 0.33,
  },
  veteran: {
    name: 'Veteran',
    steering: 'almost straight',
    speed: 41.5,
    acceleration: 1200,
    coast: 0.64,
    weave: 0.03,
    weaveRate: 2.7,
    think: 0.18,
    capacity: 3,
    miss: 0.11,
    loadGap: 0.45,
    pickupGap: 0.33,
  },
  ace: {
    name: 'Ace',
    steering: 'drives straight',
    speed: 45,
    acceleration: 1340,
    coast: 0.58,
    weave: 0,
    weaveRate: 0,
    think: 0.12,
    capacity: 3,
    miss: 0.08,
    loadGap: 0.45,
    pickupGap: 0.33,
  },
};
