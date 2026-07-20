import type {
  EditorPaletteSettings,
  EditorPreset,
  EditorPresetFamily,
  EditorPresetSettingsMap,
  EditorPresetStorageState,
} from '../../../features/editor/document/presets';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  cloneEditorPaletteSettings,
  cloneEditorPresetStorageState,
  EDITOR_PRESETS_STORAGE_KEY,
} from './defaults';
import {
  findEditableEditorPreset,
  reorderEditorPresetList,
  replaceEditorPresetCollectionWithResolvedDefault,
} from './collections';
import { parseStoredEditorPresetState, resolveStoredEditorPresetState } from './guards';
import { warnAboutInvalidStoredState } from './warnings';

const logger = createLogger({ namespace: 'SharedEditorPresetStorage' });
let loadedEditorPresetStateSnapshot: EditorPresetStorageState | null = null;
let editorPresetWriteQueue: Promise<void> = Promise.resolve();

export {
  cloneEditorPaletteSettings,
  cloneEditorPreset,
  cloneEditorPresetCollection,
  cloneEditorPresetStorageState,
  createDefaultEditorPresetStorageState,
  EDITOR_PRESETS_STORAGE_KEY,
} from './defaults';

function cacheLoadedEditorPresetState(
  settings: EditorPresetStorageState
): EditorPresetStorageState {
  loadedEditorPresetStateSnapshot = cloneEditorPresetStorageState(settings);
  return loadedEditorPresetStateSnapshot;
}

async function writeEditorPresetState(settings: EditorPresetStorageState): Promise<void> {
  const persisted = cloneEditorPresetStorageState(settings);
  await browserStorage.local.set({ [EDITOR_PRESETS_STORAGE_KEY]: persisted });
  cacheLoadedEditorPresetState(persisted);
  logger.debug('Saved editor preset settings');
}

function enqueueEditorPresetWrite<T>(task: () => Promise<T>): Promise<T> {
  const operation = editorPresetWriteQueue.catch(() => undefined).then(task);
  editorPresetWriteQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function updateEditorPresetState(
  updater: (settings: EditorPresetStorageState) => EditorPresetStorageState | null
): Promise<boolean> {
  return enqueueEditorPresetWrite(async () => {
    const current = cloneEditorPresetStorageState(
      loadedEditorPresetStateSnapshot ?? (await loadEditorPresetState())
    );
    const next = updater(current);
    if (!next) {
      return false;
    }

    await writeEditorPresetState(next);
    return true;
  });
}

export async function loadEditorPresetState(): Promise<EditorPresetStorageState> {
  const result = await browserStorage.local.get([EDITOR_PRESETS_STORAGE_KEY]);
  const parsed = parseStoredEditorPresetState(result[EDITOR_PRESETS_STORAGE_KEY]);

  warnAboutInvalidStoredState({
    hasInvalidRoot: parsed.hasInvalidRoot,
    invalidFieldCount: parsed.invalidFieldCount,
    logger,
  });

  return cacheLoadedEditorPresetState(resolveStoredEditorPresetState(parsed.value));
}

export function subscribeToEditorPresetState(
  listener: (settings: EditorPresetStorageState) => void
): () => void {
  if (!browserStorage.canObserveChanges()) {
    return () => undefined;
  }

  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'local' || !(EDITOR_PRESETS_STORAGE_KEY in changes)) {
      return;
    }

    const parsed = parseStoredEditorPresetState(changes[EDITOR_PRESETS_STORAGE_KEY]?.newValue);
    listener(cacheLoadedEditorPresetState(resolveStoredEditorPresetState(parsed.value)));
  });
}

export function getLoadedEditorPresetStateSnapshot(): EditorPresetStorageState | null {
  return loadedEditorPresetStateSnapshot
    ? cloneEditorPresetStorageState(loadedEditorPresetStateSnapshot)
    : null;
}

export async function saveEditorPresetState(settings: EditorPresetStorageState): Promise<void> {
  await enqueueEditorPresetWrite(() => writeEditorPresetState(settings));
}

export async function addEditorPreset<TKey extends EditorPresetFamily>(
  family: TKey,
  preset: EditorPreset<EditorPresetSettingsMap[TKey]>
): Promise<void> {
  await updateEditorPresetState((settings) => ({
    ...settings,
    [family]: {
      ...settings[family],
      presets: [...settings[family].presets, preset],
    },
  }));
}

export async function updateEditorPreset<TKey extends EditorPresetFamily>(
  family: TKey,
  preset: EditorPreset<EditorPresetSettingsMap[TKey]>
): Promise<void> {
  await updateEditorPresetState((settings) => {
    const collection = settings[family];
    const index = collection.presets.findIndex((current) => current.id === preset.id);
    if (index < 0) {
      return null;
    }

    const nextPreset = collection.presets[index]?.isSystemDefault
      ? { ...preset, enabled: true, isSystemDefault: true }
      : preset;

    return {
      ...settings,
      [family]: {
        ...collection,
        presets: collection.presets.map((current, currentIndex) =>
          currentIndex === index ? nextPreset : current
        ),
      },
    };
  });
}

export async function deleteEditorPreset<TKey extends EditorPresetFamily>(
  family: TKey,
  presetId: string
): Promise<boolean> {
  return updateEditorPresetState((settings) => {
    const collection: EditorPresetStorageState[TKey] = settings[family];
    if (!findEditableEditorPreset(collection, presetId)) {
      return null;
    }

    const presets = collection.presets.filter(
      (current) => current.id !== presetId
    ) as EditorPresetStorageState[TKey]['presets'];
    if (presets.length === collection.presets.length) {
      return null;
    }

    return replaceEditorPresetCollectionWithResolvedDefault(settings, family, collection, presets);
  });
}

export async function setDefaultEditorPreset(
  family: EditorPresetFamily,
  presetId: string
): Promise<void> {
  await updateEditorPresetState((settings) => {
    const collection = settings[family];
    const preset = collection.presets.find((current) => current.id === presetId);
    if (!preset || !preset.enabled) {
      return null;
    }

    return {
      ...settings,
      [family]: {
        ...collection,
        defaultPresetId: presetId,
      },
    };
  });
}

export async function setEditorPresetEnabled<TKey extends EditorPresetFamily>(
  family: TKey,
  presetId: string,
  enabled: boolean
): Promise<void> {
  await updateEditorPresetState((settings) => {
    const collection: EditorPresetStorageState[TKey] = settings[family];
    if (!findEditableEditorPreset(collection, presetId)) {
      return null;
    }

    const presets = collection.presets.map((current) =>
      current.id === presetId ? { ...current, enabled } : current
    ) as EditorPresetStorageState[TKey]['presets'];
    const nextCollection: EditorPresetStorageState[TKey] = {
      ...collection,
      presets,
    };
    return replaceEditorPresetCollectionWithResolvedDefault(
      settings,
      family,
      nextCollection,
      presets
    );
  });
}

export async function updateEditorPresetOrder<TKey extends EditorPresetFamily>(
  family: TKey,
  orderedIds: string[]
): Promise<void> {
  await updateEditorPresetState((settings) => {
    const collection = settings[family];
    const reordered = reorderEditorPresetList<EditorPresetSettingsMap[TKey]>(
      collection.presets as EditorPreset<EditorPresetSettingsMap[TKey]>[],
      orderedIds
    );

    return {
      ...settings,
      [family]: {
        ...collection,
        presets: reordered,
      },
    };
  });
}

export async function saveEditorPaletteSettings(palette: EditorPaletteSettings): Promise<void> {
  await updateEditorPresetState((settings) => ({
    ...settings,
    palette: cloneEditorPaletteSettings(palette),
  }));
}
