import { browserStorage } from '../infrastructure/browser-storage';
import type { HighlighterSettings } from '../../../features/highlighter/contracts';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';

export function cloneHighlighterSettings(settings: HighlighterSettings): HighlighterSettings {
  return {
    ...settings,
    borderPresets: settings.borderPresets.map((preset) => ({
      ...preset,
      padding: { ...preset.padding },
    })),
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
    const persistedSettings = cloneHighlighterSettings(settings);
    await browserStorage.sync.set({ [args.storageKey]: persistedSettings }, permit);
    args.cacheSettings(persistedSettings);
    args.logger.debug('Saved highlighter settings');
  };

  return {
    enqueueWrite,
    writeSettings,
  };
}
