import { z } from 'zod';
import {
  parseAudioProcessing,
  type AudioEffectInstance,
  type AudioEffectSettings,
  type AudioProcessing,
  type AudioProcessorIdentity,
} from '@sniptale/runtime-contracts/audio-effects';
import generated from './catalog.generated.json' with { type: 'json' };

const identity = z.strictObject({
  engine: z.enum(['faust', 'rnnoise', 'signalsmith']),
  version: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const kind = z.enum([
  'eq',
  'highpass',
  'lowpass',
  'compressor',
  'limiter',
  'delay',
  'reverb',
  'saturation',
]);
const catalog = z
  .object({
    version: z.literal(1),
    sampleRate: z.literal(48000),
    quantum: z.literal(128),
    modules: z
      .array(
        z.object({
          kind,
          processor: identity.extend({ engine: z.literal('faust') }),
          latencyFrames: z.number().int().nonnegative(),
          metadata: z
            .object({
              inputs: z.literal(2),
              outputs: z.literal(2),
              size: z.number().int().nonnegative(),
              ui: z.array(z.unknown()),
            })
            .passthrough(),
        })
      )
      .length(8),
    denoise: z.object({
      processor: identity.extend({ engine: z.literal('rnnoise') }),
      frameSize: z.literal(480),
      latencyFrames: z.literal(960),
    }),
    pitch: z.object({
      processor: identity.extend({ engine: z.literal('signalsmith') }),
      inputLatencyFrames: z.number().int().nonnegative(),
      outputLatencyFrames: z.number().int().nonnegative(),
    }),
    assets: z.array(
      z.strictObject({
        path: z.string(),
        byteLength: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
    ),
  })
  .parse(generated);
if (new Set(catalog.modules.map((module) => module.kind)).size !== 8)
  throw new Error('Fixed audio catalog contains duplicate operations.');
const control = z.object({
  type: z.enum(['hslider', 'vslider', 'nentry']),
  label: z.string(),
  address: z.string(),
  init: z.number().finite(),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().finite().positive(),
});
const group = z.object({
  type: z.enum(['hgroup', 'vgroup', 'tgroup']),
  items: z.array(z.unknown()),
});

export interface AudioEffectParameter {
  key: string;
  address: string;
  initial: number;
  min: number;
  max: number;
  step: number;
}

/** Uses compiled control addresses and defaults. Product labels remain in the inspector. */
export function getAudioEffectDefinition(operation: AudioEffectSettings['kind']) {
  const module = catalog.modules.find((item) => item.kind === operation);
  if (!module) throw new Error('Fixed audio operation is unavailable.');
  const pending = [...module.metadata.ui],
    parameters: AudioEffectParameter[] = [];
  let visited = 0;
  while (pending.length) {
    if (++visited > 128) throw new Error('Fixed audio control budget exceeded.');
    const item = pending.pop();
    const parsed = control.safeParse(item);
    if (parsed.success) {
      const value = parsed.data;
      const key = value.address.split('/').at(-1);
      if (
        !key ||
        !/^[a-z][A-Za-z0-9]*$/u.test(key) ||
        value.min > value.init ||
        value.max < value.init ||
        parameters.some((parameter) => parameter.key === key)
      )
        throw new Error('Fixed audio control metadata differs.');
      parameters.push({
        key,
        address: value.address,
        initial: value.init,
        min: value.min,
        max: value.max,
        step: value.step,
      });
    } else {
      const children = group.safeParse(item);
      if (!children.success) throw new Error('Fixed audio control type is unsupported.');
      pending.push(...children.data.items);
    }
  }
  return {
    kind: module.kind,
    processor: { ...module.processor },
    latencyFrames: module.latencyFrames,
    parameters: parameters.reverse(),
  };
}

/** A new stage receives a caller-owned identity. Presets cannot supply that identity. */
export function createAudioEffectInstance(
  operation: AudioEffectSettings['kind'],
  id: string
): AudioEffectInstance {
  const definition = getAudioEffectDefinition(operation);
  const effect = {
    id,
    kind: operation,
    processor: definition.processor,
    enabled: true,
    wet: operation === 'reverb' ? 0.15 : operation === 'delay' ? 0.25 : 1,
    parameters: Object.fromEntries(
      definition.parameters.map((parameter) => [parameter.key, parameter.initial])
    ),
  };
  const parsed = parseAudioProcessing({ version: 1, bypassed: false, effects: [effect] });
  const accepted = parsed?.effects[0];
  if (!accepted) throw new Error('Fixed audio defaults violate the processing contract.');
  return accepted;
}

function sameProcessor(a: AudioProcessorIdentity, b: AudioProcessorIdentity): boolean {
  return a.engine === b.engine && a.version === b.version && a.sha256 === b.sha256;
}

/** An unavailable implementation never selects a different model or an untreated export. */
export function unavailableAudioProcessor(
  processing: AudioProcessing
): AudioProcessorIdentity | null {
  if (processing.bypassed) return null;
  if (
    processing.denoise?.enabled &&
    !sameProcessor(processing.denoise.processor, catalog.denoise.processor)
  )
    return processing.denoise.processor;
  if (
    processing.pitch?.enabled &&
    processing.pitch.semitones !== 0 &&
    !sameProcessor(processing.pitch.processor, catalog.pitch.processor)
  )
    return processing.pitch.processor;
  for (const effect of processing.effects) {
    if (!effect.enabled || effect.wet === 0) continue;
    const expected = catalog.modules.find((module) => module.kind === effect.kind)?.processor;
    if (!expected || !sameProcessor(effect.processor, expected)) return effect.processor;
  }
  return null;
}

/** Selects only a fixed compiled operation, never a path from a project. */
export function getFaustModule(operation: AudioEffectSettings['kind']) {
  const module = catalog.modules.find((item) => item.kind === operation);
  if (!module) throw new Error('Fixed audio operation is unavailable.');
  return { path: `audio-effects/faust/${operation}.wasm`, json: JSON.stringify(module.metadata) };
}

/** Fixed descriptors contain no code URLs from project or preset data. */
export const AUDIO_DSP_ASSETS = {
  sampleRate: catalog.sampleRate,
  quantum: catalog.quantum,
  denoise: Object.freeze({
    ...catalog.denoise,
    processor: Object.freeze({ ...catalog.denoise.processor }),
  }),
  pitch: Object.freeze({
    ...catalog.pitch,
    processor: Object.freeze({ ...catalog.pitch.processor }),
  }),
  files: Object.freeze(catalog.assets.map((asset) => Object.freeze({ ...asset }))),
} as const;
