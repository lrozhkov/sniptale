import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import { SYSTEM_BORDER_PRESET_CATALOG_REVISION } from '../../../features/highlighter/presets/catalog';
import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredHighlighterSettings } from './guards';
import { cloneHighlighterSettings, createHighlighterWriteController } from './mutation-write';
import { resolveLoadedHighlighterSettings, warnAboutInvalidStoredSettings } from './resolved';
import {
  addUserBorderPreset,
  deleteUserBorderPreset,
  reorderPresets,
  resetSystemBorderPresetToCanonical,
  setPresetAsDefault,
  setPresetEnabled,
  updateExistingBorderPreset,
} from './preset-mutations';

export const HIGHLIGHTER_SETTINGS_KEY = 'sniptale_highlighter_settings';
const logger = createLogger({ namespace: 'SharedHighlighterStorage' });
let loadedHighlighterSettingsSnapshot: HighlighterSettings | null = null;

export type HighlighterMutationOutcome = 'applied' | 'rejected' | 'unchanged';

type HighlighterMutationDecision =
  | { outcome: 'applied'; settings: HighlighterSettings }
  | { outcome: 'rejected' | 'unchanged' };

export {
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
  DEFAULT_FOCUS_SETTINGS,
  DEFAULT_HIGHLIGHTER_SETTINGS,
} from '../../../features/highlighter/style/defaults';

function cacheLoadedHighlighterSettings(settings: HighlighterSettings): HighlighterSettings {
  loadedHighlighterSettingsSnapshot = cloneHighlighterSettings(settings);
  return cloneHighlighterSettings(loadedHighlighterSettingsSnapshot);
}

const { enqueueWrite: enqueueHighlighterWrite, writeSettings: writeHighlighterSettings } =
  createHighlighterWriteController({
    cacheSettings: (settings) => {
      loadedHighlighterSettingsSnapshot = cloneHighlighterSettings(settings);
    },
    logger,
    storageKey: HIGHLIGHTER_SETTINGS_KEY,
  });

/**
 * Загружает настройки режима выделения
 * Если настройки отсутствуют — возвращает дефолтные
 *
 * Миграция: преобразует старое поле format в blurType
 */
export async function loadHighlighterSettings(): Promise<HighlighterSettings> {
  const result = await browserStorage.sync.get([HIGHLIGHTER_SETTINGS_KEY]);
  const parsedSettings = parseStoredHighlighterSettings(result[HIGHLIGHTER_SETTINGS_KEY]);

  warnAboutInvalidStoredSettings({
    hasInvalidRoot: parsedSettings.hasInvalidRoot,
    invalidFieldCount: parsedSettings.invalidFieldCount,
    logger,
    migratedLegacyBlurFormat: parsedSettings.migratedLegacyBlurFormat,
  });

  return cacheLoadedHighlighterSettings(
    resolveLoadedHighlighterSettings(
      parsedSettings.value.borderPresets,
      parsedSettings.value.defaultBorderPresetId,
      parsedSettings.value
    )
  );
}

export function subscribeToHighlighterSettings(
  listener: (settings: HighlighterSettings) => void
): () => void {
  if (!browserStorage.canObserveChanges()) {
    return () => undefined;
  }

  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'sync' || !(HIGHLIGHTER_SETTINGS_KEY in changes)) {
      return;
    }

    const parsedSettings = parseStoredHighlighterSettings(
      changes[HIGHLIGHTER_SETTINGS_KEY]?.newValue
    );
    listener(
      cacheLoadedHighlighterSettings(
        resolveLoadedHighlighterSettings(
          parsedSettings.value.borderPresets,
          parsedSettings.value.defaultBorderPresetId,
          parsedSettings.value
        )
      )
    );
  });
}

export function getLoadedHighlighterSettingsSnapshot(): HighlighterSettings | null {
  return loadedHighlighterSettingsSnapshot
    ? cloneHighlighterSettings(loadedHighlighterSettingsSnapshot)
    : null;
}

async function readResolvedHighlighterSettings() {
  const result = await browserStorage.sync.get([HIGHLIGHTER_SETTINGS_KEY]);
  const parsed = parseStoredHighlighterSettings(result[HIGHLIGHTER_SETTINGS_KEY]);
  return {
    parsed,
    settings: resolveLoadedHighlighterSettings(
      parsed.value.borderPresets,
      parsed.value.defaultBorderPresetId,
      parsed.value
    ),
  };
}

function isStoredHighlighterSettingsUnsafeForWrite(
  parsed: ReturnType<typeof parseStoredHighlighterSettings>
): boolean {
  if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0) {
    warnAboutInvalidStoredSettings({
      hasInvalidRoot: parsed.hasInvalidRoot,
      invalidFieldCount: parsed.invalidFieldCount,
      logger,
      migratedLegacyBlurFormat: parsed.migratedLegacyBlurFormat,
    });
    return true;
  }

  const storedRevision = parsed.value.systemPresetCatalogRevision;
  if (storedRevision !== undefined && storedRevision > SYSTEM_BORDER_PRESET_CATALOG_REVISION) {
    logger.warn('Skipping highlighter settings write from a newer catalog revision', {
      storedRevision,
    });
    return true;
  }

  return false;
}

async function runHighlighterSettingsCommand(
  command: (settings: HighlighterSettings) => HighlighterMutationDecision
): Promise<HighlighterMutationOutcome> {
  return enqueueHighlighterWrite(() =>
    runWithPersistenceDomainMutationLock('highlighter-settings', async (permit) => {
      const loaded = await readResolvedHighlighterSettings();
      const settings = cloneHighlighterSettings(loaded.settings);
      if (isStoredHighlighterSettingsUnsafeForWrite(loaded.parsed)) {
        cacheLoadedHighlighterSettings(settings);
        return 'rejected';
      }
      const decision = command(settings);

      if (decision.outcome === 'applied') {
        await writeHighlighterSettings(decision.settings, permit);
      }
      return decision.outcome;
    })
  );
}

async function updateHighlighterSettings(
  updater: (settings: HighlighterSettings) => HighlighterSettings | null
): Promise<boolean> {
  const outcome = await runHighlighterSettingsCommand((settings) => {
    const nextSettings = updater(settings);
    return nextSettings ? { outcome: 'applied', settings: nextSettings } : { outcome: 'rejected' };
  });
  return outcome === 'applied';
}

export async function migrateHighlighterSystemPresetCatalog(): Promise<boolean> {
  return enqueueHighlighterWrite(() =>
    runWithPersistenceDomainMutationLock('highlighter-settings', async (permit) => {
      const result = await browserStorage.sync.get([HIGHLIGHTER_SETTINGS_KEY]);
      const stored = result[HIGHLIGHTER_SETTINGS_KEY];
      const parsed = parseStoredHighlighterSettings(stored);
      const migrated = resolveLoadedHighlighterSettings(
        parsed.value.borderPresets,
        parsed.value.defaultBorderPresetId,
        parsed.value
      );
      if (stored !== undefined && isStoredHighlighterSettingsUnsafeForWrite(parsed)) {
        cacheLoadedHighlighterSettings(migrated);
        return false;
      }
      if (stored !== undefined && JSON.stringify(stored) === JSON.stringify(migrated)) {
        cacheLoadedHighlighterSettings(migrated);
        return false;
      }
      await writeHighlighterSettings(migrated, permit);
      return true;
    })
  );
}

/**
 * Добавляет новый пресет рамки
 */
export async function addBorderPreset(preset: BorderPreset): Promise<boolean> {
  return (await addBorderPresetWithOutcome(preset)) === 'applied';
}

export async function addBorderPresetWithOutcome(
  preset: BorderPreset
): Promise<HighlighterMutationOutcome> {
  return runHighlighterSettingsCommand((settings) => {
    const nextSettings = addUserBorderPreset(settings, preset);
    return nextSettings ? { outcome: 'applied', settings: nextSettings } : { outcome: 'rejected' };
  });
}

/**
 * Обновляет существующий пресет рамки
 */
export async function updateBorderPreset(preset: BorderPreset): Promise<boolean> {
  return (await updateBorderPresetWithOutcome(preset)) === 'applied';
}

export async function updateBorderPresetWithOutcome(
  preset: BorderPreset
): Promise<HighlighterMutationOutcome> {
  return runHighlighterSettingsCommand((settings) => {
    const exists = settings.borderPresets.some((current) => current.id === preset.id);
    const nextSettings = updateExistingBorderPreset(settings, preset);
    if (nextSettings) return { outcome: 'applied', settings: nextSettings };
    return { outcome: exists ? 'unchanged' : 'rejected' };
  });
}

/**
 * Удаляет пресет рамки (кроме системного)
 */
export async function deleteBorderPreset(presetId: string): Promise<boolean> {
  return updateHighlighterSettings((settings) => deleteUserBorderPreset(settings, presetId));
}

/**
 * Устанавливает дефолтный пресет рамки
 */
export async function setDefaultBorderPreset(presetId: string): Promise<boolean> {
  return (await setDefaultBorderPresetWithOutcome(presetId)) === 'applied';
}

export async function setDefaultBorderPresetWithOutcome(
  presetId: string
): Promise<HighlighterMutationOutcome> {
  return runHighlighterSettingsCommand((settings) => {
    const target = settings.borderPresets.find((preset) => preset.id === presetId);
    if (!target || target.enabled === false) return { outcome: 'rejected' };
    if (settings.defaultBorderPresetId === presetId) return { outcome: 'unchanged' };
    const nextSettings = setPresetAsDefault(settings, presetId);
    return nextSettings ? { outcome: 'applied', settings: nextSettings } : { outcome: 'rejected' };
  });
}

export async function setBorderPresetEnabled(presetId: string, enabled: boolean): Promise<boolean> {
  return updateHighlighterSettings((settings) => setPresetEnabled(settings, presetId, enabled));
}

/**
 * Обновляет порядок пресетов (после Drag-n-Drop)
 */
export async function updateBorderPresetsOrder(orderedIds: string[]): Promise<boolean> {
  return updateHighlighterSettings((settings) => reorderPresets(settings, orderedIds));
}

export async function resetSystemBorderPreset(presetId: string): Promise<boolean> {
  return updateHighlighterSettings((settings) =>
    resetSystemBorderPresetToCanonical(settings, presetId)
  );
}

/**
 * Обновляет дефолтные настройки blur
 */
export async function saveDefaultBlurSettings(blurSettings: BlurSettings): Promise<void> {
  await updateHighlighterSettings((settings) => ({
    ...settings,
    defaultBlurSettings: blurSettings,
  }));
}

/**
 * Обновляет дефолтные настройки focus
 */
export async function saveDefaultFocusSettings(focusSettings: FocusSettings): Promise<void> {
  await updateHighlighterSettings((settings) => ({
    ...settings,
    defaultFocusSettings: focusSettings,
  }));
}
