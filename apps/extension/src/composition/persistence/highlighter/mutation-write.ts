import { browserStorage } from '../infrastructure/browser-storage';
import type { HighlighterSettings } from '../../../features/highlighter/contracts';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { cloneBorderPreset } from '../../../features/highlighter/presets/catalog';

export function serializeHighlighterSettings(settings: HighlighterSettings): unknown {
  return {
    ...settings,
    borderPresets: settings.borderPresets.map((preset) =>
      preset.origin === 'system' && preset.customized !== true
        ? {
            basedOnRevision: preset.basedOnRevision,
            customized: false,
            enabled: preset.enabled !== false,
            id: preset.id,
            order: preset.order,
            origin: 'system',
            systemPresetKey: preset.systemPresetKey,
            tagIds: [...preset.tagIds],
          }
        : cloneBorderPreset(preset)
    ),
  };
}

export function cloneHighlighterSettings(settings: HighlighterSettings): HighlighterSettings {
  return {
    ...settings,
    borderPresets: settings.borderPresets.map(cloneBorderPreset),
    defaultBlurSettings: { ...settings.defaultBlurSettings },
    defaultFocusSettings: { ...settings.defaultFocusSettings },
  };
}

export function createHighlighterWriteController(args: {
  cacheSettings: (settings: HighlighterSettings) => void;
  logger: { debug: (message: string) => void };
  storageKey: string;
}) {
  let writeQueue: Promise<void> = Promise.resolve();

  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const operation = writeQueue.catch(() => undefined).then(task);
    writeQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };

  const writeSettings = async (
    settings: HighlighterSettings,
    permit: PersistenceMutationPermit
  ): Promise<void> => {
    const persistedSettings = serializeHighlighterSettings(settings);
    await browserStorage.sync.set({ [args.storageKey]: persistedSettings }, permit);
    args.cacheSettings(cloneHighlighterSettings(settings));
    args.logger.debug('Saved highlighter settings');
  };

  return {
    enqueueWrite,
    writeSettings,
  };
}
