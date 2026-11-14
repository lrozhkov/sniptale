import { z } from 'zod';
import {
  AUDIO_PRESET_MAX_BYTES,
  AUDIO_PROCESSING_MAX_EFFECTS,
  type AudioProcessing,
  type AudioProcessingPreset,
} from './types.js';

const finite = () => z.number().finite();
const frequency = () => finite().min(20).max(20_000);
const release = () => finite().min(0.01).max(2);
const identity = z.strictObject({
  engine: z.enum(['faust', 'rnnoise', 'signalsmith']),
  version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const stage = {
  processor: identity.extend({ engine: z.literal('faust') }),
  enabled: z.boolean(),
  wet: finite().min(0).max(1),
};
const parameters = {
  eq: z.strictObject({
    frequency: frequency(),
    gain: finite().min(-24).max(24),
    q: finite().min(0.1).max(12),
  }),
  highpass: z.strictObject({ frequency: frequency() }),
  lowpass: z.strictObject({ frequency: frequency() }),
  compressor: z.strictObject({
    threshold: finite().min(-60).max(0),
    ratio: finite().min(1).max(20),
    attack: finite().min(0.001).max(0.1),
    release: release(),
  }),
  limiter: z.strictObject({ ceiling: finite().min(-24).max(0), release: release() }),
  delay: z.strictObject({
    duration: finite().min(0.01).max(1),
    feedback: finite().min(0).max(0.85),
  }),
  reverb: z.strictObject({ feedback: finite().min(0).max(0.95), damping: finite().min(0).max(1) }),
  saturation: z.strictObject({ drive: finite().min(0).max(1) }),
};
function effectSchema<T extends z.ZodRawShape>(extra: T) {
  return z.discriminatedUnion('kind', [
    z.strictObject({ ...stage, ...extra, kind: z.literal('eq'), parameters: parameters.eq }),
    z.strictObject({
      ...stage,
      ...extra,
      kind: z.literal('highpass'),
      parameters: parameters.highpass,
    }),
    z.strictObject({
      ...stage,
      ...extra,
      kind: z.literal('lowpass'),
      parameters: parameters.lowpass,
    }),
    z.strictObject({
      ...stage,
      ...extra,
      kind: z.literal('compressor'),
      parameters: parameters.compressor,
    }),
    z.strictObject({
      ...stage,
      ...extra,
      kind: z.literal('limiter'),
      parameters: parameters.limiter,
    }),
    z.strictObject({ ...stage, ...extra, kind: z.literal('delay'), parameters: parameters.delay }),
    z.strictObject({
      ...stage,
      ...extra,
      kind: z.literal('reverb'),
      parameters: parameters.reverb,
    }),
    z.strictObject({
      ...stage,
      ...extra,
      kind: z.literal('saturation'),
      parameters: parameters.saturation,
    }),
  ]);
}
const settings = effectSchema({});
const instances = effectSchema({ id: z.uuid() });
const processing = {
  version: z.literal(1),
  bypassed: z.boolean(),
  denoise: z
    .strictObject({
      enabled: z.boolean(),
      processor: identity.extend({ engine: z.literal('rnnoise') }),
    })
    .optional(),
  pitch: z
    .strictObject({
      enabled: z.boolean(),
      semitones: finite().min(-12).max(12),
      processor: identity.extend({ engine: z.literal('signalsmith') }),
    })
    .optional(),
};
const project = z
  .strictObject({ ...processing, effects: z.array(instances).max(AUDIO_PROCESSING_MAX_EFFECTS) })
  .refine((value) => new Set(value.effects.map((item) => item.id)).size === value.effects.length);
const preset = z.strictObject({
  format: z.literal('sniptale-audio-preset'),
  version: z.literal(1),
  name: z
    .string()
    .min(1)
    .max(120)
    .refine(
      (value) =>
        value.trim() === value &&
        [...value].every((character) => {
          const code = character.charCodeAt(0);
          return code >= 32 && code !== 127;
        })
    ),
  processing: z.strictObject({
    ...processing,
    effects: z.array(settings).max(AUDIO_PROCESSING_MAX_EFFECTS),
  }),
});

/** Validates data only. The app separately admits an exact bundled implementation identity. */
export function parseAudioProcessing(value: unknown): AudioProcessing | null {
  const result = project.safeParse(value);
  return result.success ? result.data : null;
}

/** Portable source data cannot introduce executable modules, media bindings or instance IDs. */
export function parseAudioProcessingPreset(value: unknown): AudioProcessingPreset | null {
  const result = preset.safeParse(value);
  return result.success ? result.data : null;
}

/** Applies the byte budget before JSON parsing. Invalid input never changes a saved project. */
export function parseAudioProcessingPresetJson(source: unknown): AudioProcessingPreset | null {
  if (
    typeof source !== 'string' ||
    source.length > AUDIO_PRESET_MAX_BYTES ||
    new TextEncoder().encode(source).byteLength > AUDIO_PRESET_MAX_BYTES
  )
    return null;
  try {
    const value: unknown = JSON.parse(source);
    return parseAudioProcessingPreset(value);
  } catch {
    return null;
  }
}
