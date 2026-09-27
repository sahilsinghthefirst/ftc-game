// Explicit extension so `node --test` can load this module directly.
import { isQuality, type Quality } from './quality.ts';

// The graphics quality the player is using. It starts at what this
// computer's specs recommend; choosing a tier in the briefing or pause menu
// replaces that and is remembered in this browser for next time. A tier in
// the URL (`?quality=low`) wins for that visit, for testing.

// Versioned: the tiers were renamed (and one added), so a choice saved under
// the old names must not be read as a different tier.
const STORAGE_KEY = 'fieldlab.graphics-quality.v2';

type Listener = () => void;
const listeners = new Set<Listener>();

function readStored(): Quality | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isQuality(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readUrl(): Quality | null {
  try {
    const requested = new URLSearchParams(window.location.search).get(
      'quality',
    );
    return isQuality(requested) ? requested : null;
  } catch {
    return null;
  }
}

let chosen: Quality | null = null;
let loaded = false;
let recommended: Quality | null = null;

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  chosen = readUrl() ?? readStored();
}

function notify() {
  listeners.forEach((listener) => listener());
}

// What the specs check suggested for this computer, once a 3D view has run it.
export function recommendedQuality() {
  return recommended;
}

// The first 3D view to start reports what the specs check recommends.
export function recommendQuality(quality: Quality) {
  if (recommended) return;
  recommended = quality;
  notify();
}

export function graphicsQuality(): Quality {
  load();
  return chosen ?? recommended ?? 'medium';
}

export function setGraphicsQuality(quality: Quality) {
  load();
  chosen = quality;
  try {
    window.localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    // Private windows may refuse storage; the choice still holds this visit.
  }
  notify();
}

export function onGraphicsQuality(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
