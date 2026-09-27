// How much rendering work a device can take. The game is built for the
// integrated graphics in a typical school laptop, so those start on `medium`,
// which keeps the realistic materials, reflections and soft shadows. Stronger
// machines add polish on top; weaker ones drop the shadows and draw fewer
// pixels.
//
//   ultra:   ambient occlusion + glow + 4x MSAA, pixel ratio up to 1.5
//   high:    glow + 4x MSAA, pixel ratio up to 1.25
//   medium:  no post-processing, built-in antialiasing, pixel ratio 1
//   low:     as medium, without shadows, drawn at 80% size and scaled up
//   lowest:  as low, drawn at 60% size - for the very weakest machines
export type Quality = 'ultra' | 'high' | 'medium' | 'low' | 'lowest';

export const QUALITY_ORDER: Quality[] = [
  'ultra',
  'high',
  'medium',
  'low',
  'lowest',
];

// What the tiers are called in the menus.
export const QUALITY_LABELS: Record<Quality, string> = {
  ultra: 'Ultra',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  lowest: 'Lowest',
};

export type DeviceHints = {
  // `?quality=low` and friends, for testing a tier on purpose.
  requested?: string | null;
  // The graphics chip's name, as the browser reports it.
  gpu?: string | null;
  coarsePointer?: boolean;
  cores?: number;
  memoryGB?: number;
};

// Sort a graphics chip into a starting tier by name. Returns null when the
// name says nothing useful (browsers may hide it).
export function gpuTier(gpu: string | null | undefined): Quality | null {
  if (!gpu) return null;
  const name = gpu.toLowerCase();
  // No graphics chip at all: the CPU is drawing everything.
  if (/swiftshader|llvmpipe|softpipe|basic render|software/.test(name))
    return 'lowest';
  // Dedicated gaming and workstation cards.
  if (/geforce|rtx|gtx|quadro|radeon (rx|pro)|arc(\(tm\))? a\d/.test(name))
    return 'ultra';
  // Capable modern integrated graphics.
  if (
    /iris|apple m\d|apple gpu|radeon(\(tm\))? (graphics|vega)|radeon \d{3}m/.test(
      name,
    )
  )
    return 'high';
  // The usual school laptop and Chromebook chips.
  if (
    /intel|uhd|hd graphics|mali|adreno|powervr|videocore|radeon r[2-7]/.test(
      name,
    )
  )
    return 'medium';
  return null;
}

export function isQuality(value: unknown): value is Quality {
  return QUALITY_ORDER.includes(value as Quality);
}

// The recommended tier for this computer, from its specs: the graphics chip
// decides when the browser names it; otherwise touch devices and small
// machines get medium. Players can change it in the briefing or pause menu.
export function pickQuality(hints: DeviceHints): Quality {
  if (isQuality(hints.requested)) return hints.requested;
  const cores = hints.cores ?? 4;
  const memory = hints.memoryGB ?? 8;
  const small = hints.coarsePointer || cores <= 4 || memory <= 4;
  const byChip = gpuTier(hints.gpu);
  // A strong chip in a small machine still starts no higher than high.
  if (byChip) return small && byChip === 'ultra' ? 'high' : byChip;
  if (small) return 'medium';
  return 'high';
}
