import type { EffectDefinition } from './base.js';
import type { EffectV1Document } from './types.js';

export function normalizeEffectV1ToTemplate(effect: EffectV1Document): EffectDefinition {
  return {
    assets: effect.assets.map((asset) => asset.id),
    category: 'effect-v1',
    clips: structuredClone(effect.clips),
    controls: structuredClone(effect.controls),
    description: structuredClone(effect.description ?? {}),
    duration: effect.duration,
    effectId: effect.id,
    id: effect.id,
    kind:
      effect.kind === 'transition'
        ? 'transitionEffect'
        : effect.kind === 'targetEffect'
          ? 'layerEffect'
          : 'composition',
    label: structuredClone(effect.label),
    layers: structuredClone(effect.layers),
    moduleId: effect.id,
    presets: structuredClone(effect.presets ?? []),
    scenes: structuredClone(effect.scenes),
    target:
      effect.kind === 'transition'
        ? 'transitionBoundary'
        : effect.kind === 'targetEffect'
          ? 'selectedTarget'
          : 'scene',
    timeline: structuredClone(effect.timeline),
    effectV1: structuredClone(effect),
  };
}
