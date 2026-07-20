import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredHighlighterSettings } from './guards';
import { cloneHighlighterSettings, createHighlighterWriteController } from './mutation-write';
import {
  reorderBorderPresets,
  resolveDefaultBorderPresetId,
  resolveLoadedHighlighterSettings,
  warnAboutInvalidStoredSettings,
} from './resolved';

export const HIGHLIGHTER_SETTINGS_KEY = 'sniptale_highlighter_settings';
const logger = createLogger({ namespace: 'SharedHighlighterStorage' });
let loadedHighlighterSettingsSnapshot: HighlighterSettings | null = null;

export {
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
  DEFAULT_FOCUS_SETTINGS,
  DEFAULT_HIGHLIGHTER_SETTINGS,
} from '../../../features/highlighter/style/defaults';

function cacheLoadedHighlighterSettings(settings: HighlighterSettings): HighlighterSettings {
  loadedHighlighterSettingsSnapshot = cloneHighlighterSettings(settings);
  return loadedHighlighterSettingsSnapshot;
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

/**
 * Сохраняет настройки режима выделения
 */
export async function saveHighlighterSettings(settings: HighlighterSettings): Promise<void> {
  await enqueueHighlighterWrite(() => writeHighlighterSettings(settings));
}

async function updateHighlighterSettings(
  updater: (settings: HighlighterSettings) => HighlighterSettings | null
): Promise<boolean> {
  return enqueueHighlighterWrite(async () => {
    const settings = cloneHighlighterSettings(
      loadedHighlighterSettingsSnapshot ?? (await loadHighlighterSettings())
    );
    const nextSettings = updater(settings);

    if (!nextSettings) {
      return false;
    }

    await writeHighlighterSettings(nextSettings);
    return true;
  });
}

/**
 * Добавляет новый пресет рамки
 */
export async function addBorderPreset(preset: BorderPreset): Promise<void> {
  await updateHighlighterSettings((settings) => ({
    ...settings,
    borderPresets: [...settings.borderPresets, preset],
  }));
}

/**
 * Обновляет существующий пресет рамки
 */
export async function updateBorderPreset(preset: BorderPreset): Promise<void> {
  await updateHighlighterSettings((settings) => {
    const index = settings.borderPresets.findIndex((current) => current.id === preset.id);
    if (index < 0) {
      return null;
    }

    const nextPreset = settings.borderPresets[index]?.isSystemDefault
      ? { ...preset, enabled: true, isSystemDefault: true }
      : preset;

    return {
      ...settings,
      borderPresets: settings.borderPresets.map((item, itemIndex) =>
        itemIndex === index ? nextPreset : item
      ),
    };
  });
}

/**
 * Удаляет пресет рамки (кроме системного)
 */
export async function deleteBorderPreset(presetId: string): Promise<boolean> {
  return updateHighlighterSettings((settings) => {
    const preset = settings.borderPresets.find((current) => current.id === presetId);

    if (preset?.isSystemDefault) {
      return null;
    }

    const filtered = settings.borderPresets.filter((current) => current.id !== presetId);
    if (filtered.length === 0 || filtered.length === settings.borderPresets.length) {
      return null;
    }

    return {
      ...settings,
      borderPresets: filtered,
      defaultBorderPresetId: resolveDefaultBorderPresetId(filtered, settings.defaultBorderPresetId),
    };
  });
}

/**
 * Устанавливает дефолтный пресет рамки
 */
export async function setDefaultBorderPreset(presetId: string): Promise<void> {
  await updateHighlighterSettings((settings) => {
    const preset = settings.borderPresets.find((current) => current.id === presetId);
    if (!preset || preset.enabled === false) {
      return null;
    }

    return {
      ...settings,
      defaultBorderPresetId: presetId,
    };
  });
}

export async function setBorderPresetEnabled(presetId: string, enabled: boolean): Promise<void> {
  await updateHighlighterSettings((settings) => {
    const preset = settings.borderPresets.find((current) => current.id === presetId);
    if (!preset || preset.isSystemDefault) {
      return null;
    }

    const borderPresets = settings.borderPresets.map((current) =>
      current.id === presetId ? { ...current, enabled } : current
    );

    return {
      ...settings,
      borderPresets,
      defaultBorderPresetId: resolveDefaultBorderPresetId(
        borderPresets,
        settings.defaultBorderPresetId
      ),
    };
  });
}

/**
 * Обновляет порядок пресетов (после Drag-n-Drop)
 */
export async function updateBorderPresetsOrder(orderedIds: string[]): Promise<void> {
  await updateHighlighterSettings((settings) => {
    return {
      ...settings,
      borderPresets: reorderBorderPresets(settings.borderPresets, orderedIds),
    };
  });
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
