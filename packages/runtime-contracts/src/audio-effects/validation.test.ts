import { describe, expect, it } from 'vitest';
import {
  AUDIO_PRESET_MAX_BYTES,
  parseAudioProcessing,
  parseAudioProcessingPreset,
  parseAudioProcessingPresetJson,
} from './index.js';

const processor = { engine: 'faust', version: '2.90.19', sha256: 'a'.repeat(64) };
const effect = {
  kind: 'eq',
  processor,
  enabled: true,
  wet: 1,
  parameters: { frequency: 1000, gain: 6, q: 1 },
};
const instance = { ...effect, id: 'b1b80118-71a9-4e59-89d2-a95ba0139aa1' };
const project = () => ({ version: 1, bypassed: false, effects: [structuredClone(instance)] });
const preset = () => ({
  format: 'sniptale-audio-preset',
  version: 1,
  name: 'Speech',
  processing: { version: 1, bypassed: false, effects: [structuredClone(effect)] },
});

describe('closed audio processing data', () => {
  it('retains exact accepted values without clamping or resolving a user preset', () => {
    const value = project();
    expect(parseAudioProcessing(value)).toEqual(value);
    expect(parseAudioProcessingPresetJson(JSON.stringify(preset()))).toEqual(preset());
    expect(value).toEqual(project());
  });

  it.each([
    { kind: 'highpass', parameters: { frequency: 80 } },
    { kind: 'lowpass', parameters: { frequency: 16000 } },
    { kind: 'compressor', parameters: { threshold: -18, ratio: 4, attack: 0.01, release: 0.2 } },
    { kind: 'limiter', parameters: { ceiling: -1, release: 0.2 } },
    { kind: 'delay', parameters: { duration: 0.25, feedback: 0.3 } },
    { kind: 'reverb', parameters: { feedback: 0.7, damping: 0.3 } },
    { kind: 'saturation', parameters: { drive: 0.2 } },
  ])('admits the closed parameters of $kind', (configuration) => {
    const value = project();
    const next = { ...value, effects: [{ ...instance, ...configuration }] };
    expect(parseAudioProcessing(next)).toEqual(next);
  });

  it('retains a well-formed unavailable implementation for explicit app admission', () => {
    const value = project();
    value.effects[0]!.processor.version = 'future-9.0';
    value.effects[0]!.processor.sha256 = 'f'.repeat(64);
    expect(parseAudioProcessing(value)).toEqual(value);
  });

  it.each([NaN, Infinity, -Infinity, 19, 20_001])('refuses invalid frequency %s', (frequency) => {
    const value = project();
    value.effects[0]!.parameters.frequency = frequency;
    expect(parseAudioProcessing(value)).toBeNull();
  });

  it.each([
    { sourceAssetId: 'private-media' },
    { projectId: 'private-project' },
    { wasm: 'AGFzbQ==' },
    { code: 'process=_' },
    { runtime: 'https://example.invalid/processor.js' },
  ])('rejects extra project and executable preset fields %j', (extra) => {
    expect(parseAudioProcessingPreset({ ...preset(), ...extra })).toBeNull();
    const value = preset();
    expect(
      parseAudioProcessingPreset({ ...value, processing: { ...value.processing, ...extra } })
    ).toBeNull();
    expect(
      parseAudioProcessingPreset({
        ...value,
        processing: { ...value.processing, effects: [{ ...effect, ...extra }] },
      })
    ).toBeNull();
  });

  it('rejects instance identities in a portable preset and duplicates in a project', () => {
    const value = preset();
    expect(
      parseAudioProcessingPreset({
        ...value,
        processing: { ...value.processing, effects: [instance] },
      })
    ).toBeNull();
    expect(parseAudioProcessing({ ...project(), effects: [instance, instance] })).toBeNull();
  });

  it.each([
    { ...effect, wet: -0.1 },
    { ...effect, wet: 1.1 },
    { ...effect, parameters: { ...effect.parameters, sourceOffset: 3 } },
    { ...effect, parameters: { ...effect.parameters, gain: 25 } },
    { ...effect, kind: 'external-wasm' },
    { ...effect, processor: { ...processor, engine: 'signalsmith' } },
    { ...effect, processor: { ...processor, sha256: '../module.wasm' } },
  ])('rejects an invalid module configuration %j', (invalid) => {
    const value = preset();
    expect(
      parseAudioProcessingPreset({
        ...value,
        processing: { ...value.processing, effects: [invalid] },
      })
    ).toBeNull();
  });

  it('rejects unknown versions and excessive chains before runtime preparation', () => {
    expect(parseAudioProcessing({ ...project(), version: 2 })).toBeNull();
    expect(parseAudioProcessingPreset({ ...preset(), version: 2 })).toBeNull();
    const value = preset();
    expect(
      parseAudioProcessingPreset({
        ...value,
        processing: { ...value.processing, effects: Array.from({ length: 9 }, () => effect) },
      })
    ).toBeNull();
  });

  it('rejects oversized, malformed and non-string preset sources', () => {
    expect(parseAudioProcessingPresetJson(' '.repeat(AUDIO_PRESET_MAX_BYTES + 1))).toBeNull();
    expect(parseAudioProcessingPresetJson('{')).toBeNull();
    expect(parseAudioProcessingPresetJson(preset())).toBeNull();
  });

  it('keeps pitch and denoising explicit and rejects incompatible engine identities', () => {
    const value = {
      ...project(),
      pitch: { enabled: true, semitones: 7, processor: { ...processor, engine: 'signalsmith' } },
      denoise: { enabled: true, processor: { ...processor, engine: 'rnnoise' } },
    };
    expect(parseAudioProcessing(value)).toEqual(value);
    expect(parseAudioProcessing({ ...value, pitch: { ...value.pitch, semitones: 13 } })).toBeNull();
    expect(parseAudioProcessing({ ...value, denoise: { ...value.denoise, processor } })).toBeNull();
  });
});
