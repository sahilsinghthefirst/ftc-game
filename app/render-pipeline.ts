import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  graphicsQuality,
  onGraphicsQuality,
  recommendQuality,
} from './graphics-setting';
import { pickQuality, type Quality } from './quality';

// Per-tier settings. Shadow softness costs nothing extra (the sampler takes
// the same taps at any radius), so even the low tier gets soft shadows.
const TIERS: Record<
  Quality,
  {
    pixelRatio: number;
    shadowMap: number;
    shadowRadius: number;
    shadows: boolean;
  }
> = {
  ultra: { pixelRatio: 1.5, shadowMap: 2048, shadowRadius: 4, shadows: true },
  high: { pixelRatio: 1.25, shadowMap: 2048, shadowRadius: 3, shadows: true },
  medium: { pixelRatio: 1, shadowMap: 1024, shadowRadius: 2, shadows: true },
  // Drawn at 80% size and scaled up by the browser; no shadow pass at all.
  low: { pixelRatio: 0.8, shadowMap: 512, shadowRadius: 1, shadows: false },
  // For the very weakest machines: 60% size, which roughly halves the pixels
  // drawn again compared with low.
  lowest: { pixelRatio: 0.6, shadowMap: 512, shadowRadius: 1, shadows: false },
};

// The graphics chip's name, where the browser is willing to share it.
function gpuName(renderer: THREE.WebGLRenderer) {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  } catch {
    return null;
  }
}

function deviceHints(renderer: THREE.WebGLRenderer) {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu: gpuName(renderer),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    cores: nav.hardwareConcurrency,
    memoryGB: nav.deviceMemory,
  };
}

export type RenderPipeline = ReturnType<typeof createRenderPipeline>;

// Draws a scene through the post-processing chain its quality tier allows.
// The tier is the player's graphics setting; until they choose one it is what
// a check of this computer's specs recommends. `onChange` asks the view for a
// fresh frame when the setting changes (views that only draw on change would
// otherwise keep showing the old tier).
export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  onChange: () => void = () => {},
) {
  recommendQuality(pickQuality(deviceHints(renderer)));
  let quality = graphicsQuality();
  let width = 1;
  let height = 1;
  let composer: EffectComposer | null = null;

  const applyShadows = () => {
    const tier = TIERS[quality];
    scene.traverse((object) => {
      const light = object as THREE.DirectionalLight;
      if (!light.isLight || !light.shadow) return;
      // Remember which lights were meant to cast, then switch them per tier.
      light.userData.castsShadow ??= light.castShadow;
      if (!light.userData.castsShadow) return;
      light.castShadow = tier.shadows;
      light.shadow.radius = tier.shadowRadius;
      if (light.shadow.mapSize.x !== tier.shadowMap) {
        light.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
    });
  };

  const build = () => {
    composer?.dispose();
    composer = null;
    const tier = TIERS[quality];
    const pixelRatio = Math.min(window.devicePixelRatio || 1, tier.pixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    applyShadows();
    document.documentElement.dataset.renderQuality = quality;
    // Post-processing only from high up.
    if (quality !== 'high' && quality !== 'ultra') return;

    // Half-float so bright lights keep their energy for the glow pass, and
    // multisampled so edges stay clean without a separate AA pass.
    const target = new THREE.WebGLRenderTarget(
      width * pixelRatio,
      height * pixelRatio,
      { type: THREE.HalfFloatType, samples: 4 },
    );
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    if (quality === 'ultra') {
      // Contact shading where parts meet and where robots and balls sit on
      // the mats.
      // Soft occlusion needs no fine detail, so it runs at half resolution
      // (a quarter of the pixels) with modest sample counts - at full size it
      // cost more than the rest of the frame put together.
      const ao = new GTAOPass(scene, camera, width / 2, height / 2);
      const fullSize = ao.setSize.bind(ao);
      ao.setSize = (w: number, h: number) =>
        fullSize(
          Math.max(1, Math.floor(w / 2)),
          Math.max(1, Math.floor(h / 2)),
        );
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({
        radius: 0.45,
        distanceExponent: 1.4,
        thickness: 1,
        scale: 1,
        samples: 8,
      });
      ao.updatePdMaterial({ samples: 8, rings: 2, radius: 4 });
      composer.addPass(ao);
    }
    // Only the genuinely bright things - light panels, glowing markers - pass
    // the threshold, so the glow reads as light rather than haze.
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(width, height), 0.32, 0.55, 0.9),
    );
    composer.addPass(new OutputPass());
  };

  build();

  const stopListening = onGraphicsQuality(() => {
    const next = graphicsQuality();
    if (next === quality) return;
    quality = next;
    build();
    onChange();
  });

  return {
    get quality() {
      return quality;
    },
    setSize(nextWidth: number, nextHeight: number) {
      width = Math.max(1, Math.floor(nextWidth));
      height = Math.max(1, Math.floor(nextHeight));
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    dispose() {
      stopListening();
      composer?.dispose();
      composer = null;
    },
  };
}
