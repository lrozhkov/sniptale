import { EFFECT_V1_SCHEMA, type EffectV1Document, validateEffectV1Document } from '../index';

export function createEffectV1TestDocument(): EffectV1Document {
  return {
    assets: [],
    clips: [],
    controls: [],
    description: { en: 'A test effect', ru: 'Тестовый эффект' },
    duration: 2,
    id: 'agent-card',
    kind: 'standalone',
    label: { en: 'Agent card', ru: 'Карточка агента' },
    layers: [],
    program: {
      commands: [{ color: '#101820', op: 'clear' }],
      kind: 'graph',
      version: 1,
    },
    scenes: [{ duration: 2, id: 'main', start: 0 }],
    schemaVersion: EFFECT_V1_SCHEMA,
    timeline: { phases: [], tracks: [] },
  };
}

export function validationCodes(effectDocument: unknown): string[] {
  return validateEffectV1Document(effectDocument).diagnostics.map(({ code }) => code);
}
