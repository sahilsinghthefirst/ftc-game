// How much rendering work a device can take. The game is built for the
// integrated graphics in a typical school laptop, so those start on `low`,
// which keeps the realistic materials, reflections and soft shadows. Stronger
// machines add polish on top; the weakest drop the shadows.
//
//   high:    ambient occlusion + glow + 4x MSAA, pixel ratio up to 1.5
//   medium:  glow + 4x MSAA, pixel ratio up to 1.25
//   low:     no post-processing, built-in antialiasing, pixel ratio 1
//   minimal: as low, without shadows, drawn at 80% size and scaled up
export type Quality = 'high' | 'medium' | 'low' | 'minimal';

export const QUALITY_ORDER: Quality[] = ['high', 'medium', 'low', 'minimal'];

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
    return 'minimal';
  // Dedicated gaming and workstation cards.
  if (/geforce|rtx|gtx|quadro|radeon (rx|pro)|arc(\(tm\))? a\d/.test(name))
    return 'high';
  // Capable modern integrated graphics.
  if (
    /iris|apple m\d|apple gpu|radeon(\(tm\))? (graphics|vega)|radeon \d{3}m/.test(
      name,
    )
  )
    return 'medium';
  // The usual school laptop and Chromebook chips.
  if (
    /intel|uhd|hd graphics|mali|adreno|powervr|videocore|radeon r[2-7]/.test(
      name,
    )
  )
    return 'low';
  return null;
}

export function isQuality(value: unknown): value is Quality {
  return QUALITY_ORDER.includes(value as Quality);
}

// Where to start. The graphics chip decides when the browser names it;
// otherwise touch devices and small machines begin low. The frame governor
// steps any of them down further if the game still cannot keep up.
export function pickQuality(hints: DeviceHints): Quality {
  if (isQuality(hints.requested)) return hints.requested;
  const cores = hints.cores ?? 4;
  const memory = hints.memoryGB ?? 8;
  const small = hints.coarsePointer || cores <= 4 || memory <= 4;
  const byChip = gpuTier(hints.gpu);
  // A strong chip in a small machine still starts no higher than medium.
  if (byChip) return small && byChip === 'high' ? 'medium' : byChip;
  if (small) return 'low';
  return 'medium';
}

export function lowerQuality(quality: Quality): Quality {
  const index = QUALITY_ORDER.indexOf(quality);
  return QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, index + 1)];
}

// Watches real frame times and asks for a cheaper tier when the game cannot
// hold its target rate. It only ever steps down, so it never flickers between
// tiers. It ignores the long gaps a hidden or throttled tab produces, and the
// first moments after a tier starts, when shaders are still compiling.
export class FrameGovernor {
  // Averaging slower than this is a GPU that cannot keep up (40 fps).
  static readonly TARGET = 1 / 40;
  // Any single frame longer than this is a paused or background tab.
  static readonly IGNORE_OVER = 0.25;
  // Frames skipped after a (re)start while shaders compile and caches warm.
  static readonly WARM_UP = 120;
  // How many real frames to average before judging.
  static readonly WINDOW = 150;

  private average = 0;
  private counted = 0;
  private skipped = 0;

  // Feed one frame's duration in seconds. Returns true when the tier should
  // drop.
  sample(seconds: number): boolean {
    if (!(seconds > 0) || seconds > FrameGovernor.IGNORE_OVER) return false;
    if (this.skipped < FrameGovernor.WARM_UP) {
      this.skipped += 1;
      return false;
    }
    this.counted += 1;
    this.average =
      this.counted === 1 ? seconds : this.average * 0.94 + seconds * 0.06;
    if (this.counted < FrameGovernor.WINDOW) return false;
    if (this.average <= FrameGovernor.TARGET) return false;
    this.reset();
    return true;
  }

  reset() {
    this.average = 0;
    this.counted = 0;
    this.skipped = 0;
  }
}
