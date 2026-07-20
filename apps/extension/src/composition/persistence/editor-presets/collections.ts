import type {
  EditorPreset,
  EditorPresetFamily,
  EditorPresetSettingsMap,
  EditorPresetStorageState,
} from '../../../features/editor/document/presets';

type DefaultableEditorPreset = {
  enabled?: boolean;
  id: string;
};

export function resolveEditorPresetDefaultId<TPreset extends DefaultableEditorPreset>(
  presets: TPreset[],
  requestedId: string | undefined
): string {
  if (requestedId && presets.some((preset) => preset.id === requestedId && preset.enabled)) {
    return requestedId;
  }

  return presets.find((preset) => preset.enabled)?.id ?? presets[0]?.id ?? 'system-default';
}

export function replaceEditorPresetCollection<TKey extends EditorPresetFamily>(
  settings: EditorPresetStorageState,
  family: TKey,
  collection: EditorPresetStorageState[TKey]
): EditorPresetStorageState {
  return {
    ...settings,
    [family]: collection,
  } as EditorPresetStorageState;
}

export function replaceEditorPresetCollectionWithResolvedDefault<TKey extends EditorPresetFamily>(
  settings: EditorPresetStorageState,
  family: TKey,
  collection: EditorPresetStorageState[TKey],
  presets: EditorPresetStorageState[TKey]['presets']
): EditorPresetStorageState {
  const defaultablePresets = presets as DefaultableEditorPreset[];
  return replaceEditorPresetCollection(settings, family, {
    ...collection,
    defaultPresetId: resolveEditorPresetDefaultId(defaultablePresets, collection.defaultPresetId),
    presets,
  });
}

export function findEditableEditorPreset<TKey extends EditorPresetFamily>(
  collection: EditorPresetStorageState[TKey],
  presetId: string
): EditorPreset<EditorPresetSettingsMap[TKey]> | null {
  const preset = collection.presets.find((current) => current.id === presetId);
  return preset && !preset.isSystemDefault
    ? (preset as EditorPreset<EditorPresetSettingsMap[TKey]>)
    : null;
}

export function reorderEditorPresetList<TSettings>(
  presets: EditorPreset<TSettings>[],
  orderedIds: string[]
): EditorPreset<TSettings>[] {
  const presetMap = new Map(presets.map((preset) => [preset.id, preset]));
  const reordered: EditorPreset<TSettings>[] = [];

  orderedIds.forEach((id, index) => {
    const preset = presetMap.get(id);
    if (preset) {
      reordered.push({ ...preset, order: index });
    }
  });

  presets.forEach((preset) => {
    if (!orderedIds.includes(preset.id)) {
      reordered.push({ ...preset, order: reordered.length });
    }
  });

  return reordered;
}
