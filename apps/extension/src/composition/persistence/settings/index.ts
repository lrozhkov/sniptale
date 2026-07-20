import type {
  CaptureActionType,
  ContentToolbarPreferences,
  ContextMenuSettings,
  Settings,
  SettingsPatch,
  ViewportPreset,
} from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import { isCaptureActionTypeValue } from '@sniptale/runtime-contracts/capture/action';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredSettings } from './guards';

const STORAGE_KEY = 'sniptale_settings';
const logger = createLogger({ namespace: 'SharedSettingsStorage' });
let settingsMutationQueue = Promise.resolve<Settings | null>(null);

// Built-in viewport presets used when storage has no saved settings yet.
const DEFAULT_VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: 'fhd', width: 1920, height: 1080, label: 'Full HD' },
  { id: 'hd', width: 1280, height: 720, label: 'HD' },
];

const DEFAULT_CONTEXT_MENU_SETTINGS: ContextMenuSettings = {
  enabled: true,
  showScreenshots: true,
  showVideo: true,
  showExport: true,
  showImageEditor: true,
  showVideoEditor: true,
  showGallery: true,
  showPageLinkCopy: true,
  showSettings: true,
};

const DEFAULT_CONTENT_TOOLBAR_SETTINGS: ContentToolbarPreferences = {
  displayMode: 'horizontal',
  compactMenus: false,
  position: null,
};

export const DEFAULT_SETTINGS: Settings = {
  captureAction: 'download_default',
  contentToolbar: DEFAULT_CONTENT_TOOLBAR_SETTINGS,
  contextMenu: DEFAULT_CONTEXT_MENU_SETTINGS,
  saveCapturesToGallery: false,
  viewportPresets: DEFAULT_VIEWPORT_PRESETS,
  defaultViewportId: 'native',
  presets: [],
  defaultImagePresetId: null,
  defaultVideoPresetId: null,
  defaultExportPresetId: null,
  imageFormat: 'png',
  imageQuality: 100,
  authenticatedSnapshotAssetsEnabled: false,
  anonymousCrossOriginSnapshotAssetsEnabled: false,
  skipWebSnapshotSaveDisclosure: false,
  rawDiagnosticsEnabled: false,
};

function cloneViewportPresets(presets: readonly ViewportPreset[]): ViewportPreset[] {
  return presets.map((preset) => ({ ...preset }));
}

function cloneContextMenuSettings(settings: ContextMenuSettings): ContextMenuSettings {
  return { ...settings };
}

function cloneContentToolbarSettings(
  settings: ContentToolbarPreferences
): ContentToolbarPreferences {
  return {
    ...settings,
    position: settings.position ? { ...settings.position } : null,
  };
}

export function createDefaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    contentToolbar: cloneContentToolbarSettings(DEFAULT_CONTENT_TOOLBAR_SETTINGS),
    contextMenu: cloneContextMenuSettings(DEFAULT_CONTEXT_MENU_SETTINGS),
    presets: [],
    viewportPresets: cloneViewportPresets(DEFAULT_VIEWPORT_PRESETS),
  };
}

/** Normalize the legacy captureAction value `download` to `download_default`. */
function resolveCaptureAction(value: unknown): CaptureActionType {
  if (value === 'download') return 'download_default';
  if (isCaptureActionTypeValue(value)) {
    return value;
  }
  return 'download_default';
}

/**
 * Settings storage authority lives in this owner and persists the whole normalized record.
 * Callers that change one field should use patchSettings so queued read-modify-write merges
 * against the latest persisted payload.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await browserStorage.sync.set({ [STORAGE_KEY]: settings });
  logger.debug('Saved settings payload');
}

function normalizeLoadedSettings(parsedValue: Partial<Settings>): Settings {
  const defaultSettings = createDefaultSettings();
  const captureAction = resolveCaptureAction(
    parsedValue.captureAction ?? defaultSettings.captureAction
  );

  return {
    ...defaultSettings,
    ...parsedValue,
    captureAction,
    contentToolbar: {
      ...DEFAULT_CONTENT_TOOLBAR_SETTINGS,
      ...parsedValue.contentToolbar,
    },
    contextMenu: {
      ...DEFAULT_CONTEXT_MENU_SETTINGS,
      ...parsedValue.contextMenu,
    },
    presets: Array.isArray(parsedValue.presets) ? parsedValue.presets : [],
    defaultImagePresetId: parsedValue.defaultImagePresetId ?? null,
    defaultVideoPresetId: parsedValue.defaultVideoPresetId ?? null,
    defaultExportPresetId: parsedValue.defaultExportPresetId ?? null,
  };
}

/**
 * Read path only: invalid stored fields are dropped from the returned value, but this function
 * never repairs or migrates storage. Explicit mutations and maintenance flows own writes.
 */
export async function loadSettings(): Promise<Settings> {
  const getSyncStorageValue = browserStorage.sync.get.bind(browserStorage.sync);
  const result = await getSyncStorageValue([STORAGE_KEY]);
  const parsedSettings = parseStoredSettings(result[STORAGE_KEY]);

  if (parsedSettings.hasInvalidRoot) {
    logger.warn('Ignoring invalid settings payload root from storage');
  }

  if (parsedSettings.invalidFieldCount > 0) {
    logger.warn('Dropped invalid settings fields from storage', {
      invalidFieldCount: parsedSettings.invalidFieldCount,
    });
  }

  return normalizeLoadedSettings(parsedSettings.value);
}

export async function clearSettings(): Promise<void> {
  await browserStorage.sync.remove([STORAGE_KEY]);
  logger.debug('Cleared settings payload');
}

function queueSettingsMutation(run: () => Promise<Settings>): Promise<Settings> {
  const nextMutation = settingsMutationQueue.catch(() => null).then(run);
  settingsMutationQueue = nextMutation;
  return nextMutation;
}

function applySettingsPatch(currentSettings: Settings, settingsPatch: SettingsPatch): Settings {
  return normalizeLoadedSettings({
    ...currentSettings,
    ...settingsPatch,
    contentToolbar: {
      ...DEFAULT_CONTENT_TOOLBAR_SETTINGS,
      ...currentSettings.contentToolbar,
      ...settingsPatch.contentToolbar,
    },
    contextMenu: {
      ...currentSettings.contextMenu,
      ...settingsPatch.contextMenu,
    },
  });
}

/**
 * Serializes settings mutations in-process and reloads storage for each queued patch.
 * Failed writes reject to the caller and the queue remains usable for later mutations.
 */
export async function patchSettings(settingsPatch: SettingsPatch): Promise<Settings> {
  return queueSettingsMutation(async () => {
    const currentSettings = await loadSettings();
    const nextSettings = applySettingsPatch(currentSettings, settingsPatch);

    await saveSettings(nextSettings);
    return nextSettings;
  });
}

export async function resetSettingsToDefaults(): Promise<Settings> {
  return queueSettingsMutation(async () => {
    const nextSettings = createDefaultSettings();
    await saveSettings(nextSettings);
    return nextSettings;
  });
}
