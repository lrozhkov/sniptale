import { expect, it } from 'vitest';
import {
  parseAudioProcessingPresetJson,
  type AudioProcessing,
} from '@sniptale/runtime-contracts/audio-effects';
import { AUDIO_DSP_ASSETS, createAudioEffectInstance } from './catalog';
import {
  duplicateAudioProcessing,
  listBuiltInAudioPresets,
  materializeAudioProcessingPreset,
  serializeAudioProcessingPreset,
} from './presets';
const initialId = 'b1b80118-71a9-4e59-89d2-a95ba0139aa1';
function ids() {
  let next = 1;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}
function processing(): AudioProcessing {
  return {
    version: 1,
    bypassed: false,
    effects: [createAudioEffectInstance('eq', initialId)],
    denoise: { enabled: false, processor: { ...AUDIO_DSP_ASSETS.denoise.processor } },
    pitch: { enabled: true, semitones: 3, processor: { ...AUDIO_DSP_ASSETS.pitch.processor } },
  };
}
it('roundtrips only accepted DSP values and creates new independent identities on each application', () => {
  const authored = processing(),
    before = structuredClone(authored);
  const source = serializeAudioProcessingPreset(authored, 'My sound');
  expect(source).not.toBeNull();
  expect(source).not.toContain(initialId);
  const preset = parseAudioProcessingPresetJson(source)!;
  const createId = ids();
  const a = materializeAudioProcessingPreset(preset, createId)!,
    b = materializeAudioProcessingPreset(preset, createId)!;
  expect(a.effects[0]!.id).not.toBe(b.effects[0]!.id);
  expect(a.effects[0]!.parameters).toEqual(authored.effects[0]!.parameters);
  expect(a.pitch).toEqual(authored.pitch);
  expect(a.denoise).toEqual(authored.denoise);
  a.effects[0]!.wet = 0.2;
  a.pitch!.semitones = -2;
  expect(authored).toEqual(before);
  expect(b.effects[0]!.wet).toBe(1);
  expect(serializeAudioProcessingPreset(b, 'My sound')).toBe(source);
});
it('retains unavailable authored implementations while copying but refuses to apply them from a preset', () => {
  const authored = processing();
  authored.effects[0]!.processor.sha256 = '0'.repeat(64);
  authored.effects[0]!.enabled = false;
  authored.bypassed = true;
  const copy = duplicateAudioProcessing(authored, ids());
  expect(copy.effects[0]!.processor).toEqual(authored.effects[0]!.processor);
  expect(copy.effects[0]!.id).not.toBe(initialId);
  expect(copy.bypassed).toBe(true);
  const source = serializeAudioProcessingPreset(authored, 'Unavailable')!;
  expect(parseAudioProcessingPresetJson(source)).not.toBeNull();
  expect(
    materializeAudioProcessingPreset(parseAudioProcessingPresetJson(source), ids())
  ).toBeNull();
});
it.each(['pitch', 'denoise'] as const)(
  'checks inactive %s implementation identity before preset application',
  (stage) => {
    const authored = processing();
    authored[stage]!.enabled = false;
    authored[stage]!.processor.sha256 = '0'.repeat(64);
    const source = serializeAudioProcessingPreset(authored, 'Unknown stage')!;
    expect(
      materializeAudioProcessingPreset(parseAudioProcessingPresetJson(source), ids())
    ).toBeNull();
  }
);
it('does not admit executable keys, instance IDs or source bindings into portable values', () => {
  const preset = listBuiltInAudioPresets()[0]!.preset;
  for (const extra of [
    { code: 'alert(1)' },
    { assetId: 'media' },
    { wasm: 'data:application/wasm;' },
  ])
    expect(materializeAudioProcessingPreset({ ...preset, ...extra }, ids())).toBeNull();
  expect(
    materializeAudioProcessingPreset(
      {
        ...preset,
        processing: {
          ...preset.processing,
          effects: [{ ...preset.processing.effects[0], id: initialId }],
        },
      },
      ids()
    )
  ).toBeNull();
  expect(
    serializeAudioProcessingPreset({ ...processing(), code: 'invalid' }, 'Invalid')
  ).toBeNull();
  expect(serializeAudioProcessingPreset(processing(), ' invalid ')).toBeNull();
});
it('bounds failed allocators and never changes the source when IDs collide or are invalid', () => {
  const authored = processing(),
    before = structuredClone(authored);
  let attempts = 0;
  expect(() =>
    duplicateAudioProcessing(authored, () => {
      attempts++;
      return initialId;
    })
  ).toThrow('independent');
  expect(attempts).toBe(8);
  expect(() => duplicateAudioProcessing(authored, () => 'invalid')).toThrow('contract');
  const preset = listBuiltInAudioPresets()[0]!.preset;
  expect(materializeAudioProcessingPreset(preset, () => initialId)).toBeNull();
  expect(authored).toEqual(before);
});
it('fixed sound presets are independently admitted with exact bundled processors and no instance IDs', () => {
  const presets = listBuiltInAudioPresets();
  expect(presets.map((item) => item.id)).toEqual(['speech', 'telephone', 'echo', 'room']);
  const createId = ids();
  const identities = new Set<string>();
  for (const { preset } of presets) {
    const applied = materializeAudioProcessingPreset(preset, createId);
    expect(applied).not.toBeNull();
    for (const effect of applied!.effects) {
      expect(identities.has(effect.id)).toBe(false);
      identities.add(effect.id);
    }
    for (const effect of preset.processing.effects) expect(effect).not.toHaveProperty('id');
  }
  presets[0]!.preset.processing.effects[0]!.wet = 0;
  expect(listBuiltInAudioPresets()[0]!.preset.processing.effects[0]!.wet).toBe(1);
});
