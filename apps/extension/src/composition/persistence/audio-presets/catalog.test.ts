import { expect, it } from 'vitest';
import {
  listBuiltInAudioPresets,
  materializeAudioProcessingPreset,
} from '../../../features/video/audio/effects/presets';
import {
  parseAudioPresetCatalog,
  parseAudioPresetTransfer,
  projectAudioPresetTransfer,
  restoreAudioPresetCatalog,
} from './catalog';
const stamp = '00000000-0000-4000-8000-000000000001';
const preset = listBuiltInAudioPresets()[0]!.preset;
function catalog() {
  return {
    version: 1,
    generation: stamp,
    presets: [
      {
        id: 'user-1',
        incarnation: stamp,
        revision: 1,
        createdAt: 10,
        updatedAt: 10,
        preset: structuredClone(preset),
      },
    ],
    preferences: { defaultId: null, disabledIds: [] },
  };
}
it('reads only absent storage as empty and refuses malformed, future and duplicate storage', () => {
  expect(parseAudioPresetCatalog(undefined)).toEqual({
    version: 1,
    generation: null,
    presets: [],
    preferences: { defaultId: null, disabledIds: [] },
  });
  for (const invalid of [
    null,
    {},
    { ...catalog(), version: 2 },
    { ...catalog(), generation: null },
    { ...catalog(), code: 'invalid' },
  ])
    expect(parseAudioPresetCatalog(invalid)).toBeNull();
  const duplicate = catalog();
  duplicate.presets.push(structuredClone(duplicate.presets[0]!));
  expect(parseAudioPresetCatalog(duplicate)).toBeNull();
  const oversized = catalog();
  oversized.presets = Array.from({ length: 101 }, (_, index) => ({
    ...oversized.presets[0]!,
    id: `item-${index}`,
  }));
  expect(parseAudioPresetCatalog(oversized)).toBeNull();
});
it('retains strict unavailable source data without enabling an unknown implementation', () => {
  const input = catalog();
  input.presets[0]!.preset.processing.effects[0]!.processor.sha256 = '0'.repeat(64);
  const accepted = parseAudioPresetCatalog(input)!;
  expect(accepted.presets[0]!.preset).toEqual(input.presets[0]!.preset);
  expect(materializeAudioProcessingPreset(accepted.presets[0]!.preset)).toBeNull();
  const unsafe = {
    ...input,
    presets: [{ ...input.presets[0], preset: { ...preset, media: 'private-source' } }],
  };
  expect(parseAudioPresetCatalog(unsafe)).toBeNull();
});
it('requires known, enabled default references and unique availability preferences', () => {
  for (const preferences of [
    { defaultId: 'missing', disabledIds: [] },
    { defaultId: 'user-1', disabledIds: ['user-1'] },
    { defaultId: null, disabledIds: ['user-1', 'user-1'] },
    { defaultId: null, disabledIds: ['missing'] },
  ])
    expect(parseAudioPresetCatalog({ ...catalog(), preferences })).toBeNull();
  expect(
    parseAudioPresetCatalog({
      ...catalog(),
      preferences: { defaultId: 'builtin:speech', disabledIds: ['builtin:room'] },
    })
  ).not.toBeNull();
});
it('projects source data separately from preferences and local mutation tokens', () => {
  const accepted = parseAudioPresetCatalog(catalog())!;
  const transferred = projectAudioPresetTransfer(accepted);
  expect(transferred.presets).toEqual([{ id: 'user-1', name: preset.name, preset }]);
  expect(JSON.stringify(transferred)).not.toContain(stamp);
  expect(parseAudioPresetTransfer(transferred)).toEqual(transferred);
  expect(parseAudioPresetTransfer({ ...transferred, generation: stamp })).toBeNull();
  expect(
    parseAudioPresetTransfer({ presets: [{ ...transferred.presets![0], name: 'Different name' }] })
  ).toBeNull();
});
it('restores selected fields with fresh fencing tokens and retains unselected sources or preferences', () => {
  const accepted = parseAudioPresetCatalog(catalog())!;
  let sequence = 2;
  const createId = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  const preferences = restoreAudioPresetCatalog(
    accepted,
    { preferences: { defaultId: 'user-1', disabledIds: [] } },
    createId,
    20
  )!;
  expect(preferences.presets).toEqual(accepted.presets);
  expect(preferences.generation).not.toBe(accepted.generation);
  const sources = restoreAudioPresetCatalog(
    preferences,
    { presets: projectAudioPresetTransfer(accepted).presets },
    createId,
    20
  )!;
  expect(sources.preferences).toEqual(preferences.preferences);
  expect(sources.presets[0]!.id).toBe('user-1');
  expect(sources.presets[0]!.preset).toEqual(preset);
  expect(sources.presets[0]!.incarnation).not.toBe(accepted.presets[0]!.incarnation);
  expect(restoreAudioPresetCatalog(preferences, { presets: [] }, createId, 20)).toBeNull();
  expect(preferences.presets).toEqual(accepted.presets);
});
