'use client';

import { useSyncExternalStore } from 'react';
import {
  graphicsQuality,
  onGraphicsQuality,
  recommendedQuality,
  setGraphicsQuality,
} from './graphics-setting';
import { QUALITY_LABELS, QUALITY_ORDER } from './quality';

// Lowest to highest, left to right.
const TIERS = [...QUALITY_ORDER].reverse();

// The graphics quality setting, as a row of buttons. The tier this computer's
// specs recommend is marked, and a change applies to every 3D view at once.
export function GraphicsPicker({
  tone = 'light',
}: {
  tone?: 'light' | 'dark';
}) {
  const quality = useSyncExternalStore(
    onGraphicsQuality,
    graphicsQuality,
    () => 'medium' as const,
  );
  const recommended = useSyncExternalStore(
    onGraphicsQuality,
    recommendedQuality,
    () => null,
  );
  return (
    <fieldset className={`graphics-picker is-${tone}`}>
      <legend
        className={`graphics-picker-title ${tone === 'light' ? 'eyebrow' : ''}`}
      >
        Graphics
      </legend>
      <div>
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            aria-pressed={quality === tier}
            className={[
              quality === tier ? 'is-selected' : '',
              recommended === tier ? 'is-recommended' : '',
            ].join(' ')}
            onClick={() => setGraphicsQuality(tier)}
          >
            {QUALITY_LABELS[tier]}
          </button>
        ))}
      </div>
      {recommended && (
        <p className="graphics-picker-note">
          <i aria-hidden="true" /> Recommended for this computer:{' '}
          {QUALITY_LABELS[recommended]}
        </p>
      )}
    </fieldset>
  );
}
