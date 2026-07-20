import { expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_IMAGE_SETTINGS,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import type {
  EditorPreset,
  EditorPresetStorageState,
  EditorSceneBackgroundSettings,
} from '../../../features/editor/document/presets';
import {
  createFrameDraftSceneSignature,
  createSceneBackgroundSettingsSignature,
  mergeSceneBackgroundDraft,
  resolveDefaultSceneBackgroundSettings,
  syncAuthoritativeFrameMetadata,
} from './drafts-scene';

const BASE_SETTINGS: EditorSceneBackgroundSettings = {
  paddingTop: 12,
  paddingRight: 16,
  paddingBottom: 20,
  paddingLeft: 24,
  backgroundMode: 'color',
  backgroundColor: '#112233',
  backgroundGradientFrom: '#000000',
  backgroundGradientTo: '#ffffff',
  backgroundGradientStops: [],
  backgroundGradientColorStops: [
    { color: '#000000', offset: 0 },
    { color: '#ffffff', offset: 1 },
  ],
  backgroundGradientAngle: 90,
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  layoutMode: 'fit-image',
};

function createPreset(
  id: string,
  settings: EditorSceneBackgroundSettings,
  isSystemDefault = false
): EditorPreset<EditorSceneBackgroundSettings> {
  return {
    enabled: true,
    id,
    isSystemDefault,
    name: id,
    order: 0,
    settings,
  };
}

function createCollection(
  overrides: Partial<EditorPresetStorageState['sceneBackground']> = {}
): EditorPresetStorageState['sceneBackground'] {
  return {
    defaultPresetId: 'preferred',
    presets: [
      createPreset('system', { ...BASE_SETTINGS, backgroundColor: '#445566' }, true),
      createPreset('preferred', BASE_SETTINGS),
    ],
    ...overrides,
  };
}

it('resolves default scene background settings by priority', () => {
  expect(resolveDefaultSceneBackgroundSettings(createCollection())).toBe(BASE_SETTINGS);
  expect(
    resolveDefaultSceneBackgroundSettings(createCollection({ defaultPresetId: 'missing' }))
      ?.backgroundColor
  ).toBe('#445566');
  expect(
    resolveDefaultSceneBackgroundSettings(
      createCollection({
        defaultPresetId: 'missing',
        presets: [createPreset('first', BASE_SETTINGS)],
      })
    )
  ).toBe(BASE_SETTINGS);
  expect(resolveDefaultSceneBackgroundSettings(createCollection({ presets: [] }))).toBeNull();
});

it('merges scene drafts and keeps browser metadata authoritative', () => {
  const merged = mergeSceneBackgroundDraft(DEFAULT_EDITOR_FRAME_SETTINGS, BASE_SETTINGS);
  const synced = syncAuthoritativeFrameMetadata(
    {
      ...merged,
      browserMode: false,
      browserTitle: 'Draft',
      browserUrl: 'https://draft.example',
    },
    {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      browserMode: true,
      browserTitle: 'Authoritative',
      browserUrl: 'https://source.example',
    }
  );

  expect(mergeSceneBackgroundDraft(DEFAULT_EDITOR_FRAME_SETTINGS, null)).toBe(
    DEFAULT_EDITOR_FRAME_SETTINGS
  );
  expect(createSceneBackgroundSettingsSignature(BASE_SETTINGS)).toContain('#112233');
  expect(createSceneBackgroundSettingsSignature(BASE_SETTINGS)).toContain(
    'backgroundGradientColorStops'
  );
  expect(createSceneBackgroundSettingsSignature(BASE_SETTINGS)).toContain('"sourceImage"');
  expect(createSceneBackgroundSettingsSignature(null)).toBeNull();
  expect(createFrameDraftSceneSignature(merged)).toContain('#112233');
  expect(merged.sourceImage).toEqual(DEFAULT_EDITOR_IMAGE_SETTINGS);
  expect(
    mergeSceneBackgroundDraft(DEFAULT_EDITOR_FRAME_SETTINGS, {
      ...BASE_SETTINGS,
      sourceImage: { ...DEFAULT_EDITOR_IMAGE_SETTINGS, radius: 22 },
    }).sourceImage
  ).toEqual(expect.objectContaining({ radius: 22 }));
  expect(synced.browserTitle).toBe('Authoritative');
  expect(synced.browserUrl).toBe('https://source.example');
});
