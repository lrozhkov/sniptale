import { expect, it } from 'vitest';
import {
  parseAudioProcessing,
  type AudioEffectSettings,
} from '@sniptale/runtime-contracts/audio-effects';
import {
  AUDIO_DSP_ASSETS,
  createAudioEffectInstance,
  getAudioEffectDefinition,
  unavailableAudioProcessor,
} from './catalog';

const id = 'b1b80118-71a9-4e59-89d2-a95ba0139aa1';
const kinds: AudioEffectSettings['kind'][] = [
  'eq',
  'highpass',
  'lowpass',
  'compressor',
  'limiter',
  'delay',
  'reverb',
  'saturation',
];

it.each(kinds)('admits real compiled defaults and fixed identity for %s', (kind) => {
  const effect = createAudioEffectInstance(kind, id);
  const value = { version: 1, bypassed: false, effects: [effect] };
  const accepted = parseAudioProcessing(value);
  expect(accepted).toEqual(value);
  expect(unavailableAudioProcessor(accepted!)).toBeNull();
  const definition = getAudioEffectDefinition(kind);
  expect(definition.parameters.length).toBeGreaterThan(0);
  for (const parameter of definition.parameters)
    expect(parameter.address).toBe(`/sniptale_${kind}/${parameter.key}`);
});

it('returns independent accepted stage values for two placements', () => {
  const first = createAudioEffectInstance('eq', id);
  const second = createAudioEffectInstance('eq', 'a7b3b310-1256-455b-80ee-f506e5144797');
  if (first.kind !== 'eq' || second.kind !== 'eq') throw new Error('Fixture operation differs.');
  first.parameters.gain = 12;
  expect(second.parameters.gain).toBe(0);
});

it('reports an unavailable implementation until the user explicitly bypasses it', () => {
  const effect = createAudioEffectInstance('eq', id);
  effect.processor = { ...effect.processor, sha256: '0'.repeat(64) };
  const processing = parseAudioProcessing({ version: 1, bypassed: false, effects: [effect] })!;
  expect(unavailableAudioProcessor(processing)).toEqual(effect.processor);
  expect(unavailableAudioProcessor({ ...processing, bypassed: true })).toBeNull();
  expect(
    unavailableAudioProcessor({ ...processing, effects: [{ ...effect, enabled: false }] })
  ).toBeNull();
});

it('uses the same explicit rule for pitch and the actual RNNoise model', () => {
  const value = parseAudioProcessing({
    version: 1,
    bypassed: false,
    effects: [],
    pitch: { enabled: true, semitones: 7, processor: AUDIO_DSP_ASSETS.pitch.processor },
    denoise: { enabled: true, processor: AUDIO_DSP_ASSETS.denoise.processor },
  })!;
  expect(unavailableAudioProcessor(value)).toBeNull();
  const wrong = { ...AUDIO_DSP_ASSETS.denoise.processor, sha256: '0'.repeat(64) };
  expect(
    unavailableAudioProcessor({ ...value, denoise: { enabled: true, processor: wrong } })
  ).toEqual(wrong);
});
