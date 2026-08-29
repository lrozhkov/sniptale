import type {
  CaptureActionType,
  ContentToolbarPreferences,
  ContextMenuSettings,
  LocalStoragePolicy,
  Settings,
  NormalizedSettings,
  SettingsPatch,
  ViewportPreset,
} from '../../../contracts/settings';
import type { VoiceInputPreferences } from '@sniptale/runtime-contracts/voice-input';
import {
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  parseFullPageQualityPolicy,
} from '../../../contracts/full-page-capture';
import { browserStorage } from '../infrastructure/browser-storage';
import { isCaptureActionTypeValue } from '@sniptale/runtime-contracts/capture/action';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredSettings } from './guards';
import {
  cloneViewportPreset,
  createSystemViewportPresetCatalog,
} from '../../../features/viewport-presets/catalog';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../library-lifecycle/policy';
import {
  DEFAULT_EXPORT_RESOURCE_LIMITS,
  parseExportResourceLimits,
  type ExportResourceLimits,
} from '@sniptale/runtime-contracts/export';
import {
  DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING,
  parsePagePackageCaptureTimingPolicy,
} from '@sniptale/runtime-contracts/page-package';

const STORAGE_KEY = 'sniptale_settings';
const logger = createLogger({ namespace: 'SharedSettingsStorage' });
let settingsMutationQueue = Promise.resolve<NormalizedSettings | null>(null);

const DEFAULT_VIEWPORT_PRESETS: ViewportPreset[] = createSystemViewportPresetCatalog();

const DEFAULT_CONTEXT_MENU_SETTINGS: ContextMenuSettings = {
  enabled: true,
  showScreenshots: true,
  showVideo: true,
  showExport: true,
  showImageEditor: true,
  showVideoEditor: true,
  showGallery: true,
  showPageLinkCopy: true,
  showWindowResize: true,
  showSettings: true,
};

const DEFAULT_CONTENT_TOOLBAR_SETTINGS: ContentToolbarPreferences = {
  displayMode: 'horizontal',
  compactMenus: false,
  position: null,
};

const DEFAULT_VOICE_INPUT_SETTINGS: VoiceInputPreferences = {
  language: 'ru-RU',
  microphoneDeviceId: null,
  mode: 'local-first',
};

export const DEFAULT_SETTINGS: NormalizedSettings = {
  captureAction: 'download_default',
  contentToolbar: DEFAULT_CONTENT_TOOLBAR_SETTINGS,
  contextMenu: DEFAULT_CONTEXT_MENU_SETTINGS,
  localStoragePolicy: DEFAULT_LOCAL_STORAGE_POLICY,
  saveCapturesToGallery: false,
  viewportPresets: DEFAULT_VIEWPORT_PRESETS,
  defaultViewportPresetId: null,
  presets: [],
  defaultImagePresetId: null,
  defaultVideoPresetId: null,
  defaultExportPresetId: null,
  imageFormat: 'png',
  imageQuality: 100,
  fullPageQuality: DEFAULT_FULL_PAGE_QUALITY_POLICY,
  authenticatedSnapshotAssetsEnabled: true,
  anonymousCrossOriginSnapshotAssetsEnabled: true,
  externalSnapshotAssetRedirectsEnabled: true,
  externalSnapshotLinksEnabled: false,
  exportResourceLimits: DEFAULT_EXPORT_RESOURCE_LIMITS,
  fullPageCapture: DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  pagePackageCaptureTiming: { ...DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING },
  voiceInput: DEFAULT_VOICE_INPUT_SETTINGS,
};

function cloneViewportPresets(presets: readonly ViewportPreset[]): ViewportPreset[] {
  return presets.map(cloneViewportPreset);
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

function cloneFullPageCapturePreferences(
  settings: NonNullable<Settings['fullPageCapture']>
): NonNullable<Settings['fullPageCapture']> {
  return { ...settings };
}

function cloneExportResourceLimits(settings: ExportResourceLimits): ExportResourceLimits {
  return { ...settings };
}

export function createDefaultSettings(): NormalizedSettings {
  return {
    ...DEFAULT_SETTINGS,
    contentToolbar: cloneContentToolbarSettings(DEFAULT_CONTENT_TOOLBAR_SETTINGS),
    contextMenu: cloneContextMenuSettings(DEFAULT_CONTEXT_MENU_SETTINGS),
    localStoragePolicy: { ...DEFAULT_LOCAL_STORAGE_POLICY },
    fullPageCapture: cloneFullPageCapturePreferences(DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES),
    exportResourceLimits: cloneExportResourceLimits(DEFAULT_EXPORT_RESOURCE_LIMITS),
    fullPageQuality: { ...DEFAULT_FULL_PAGE_QUALITY_POLICY },
    pagePackageCaptureTiming: { ...DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING },
    voiceInput: { ...DEFAULT_VOICE_INPUT_SETTINGS },
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
 * Settings storage authority lives in this owner. Transferable preferences are synchronized,
 * Callers that change one field should use patchSettings so queued read-modify-write merges
 * against the latest persisted payload.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  if (
    settings.exportResourceLimits !== undefined &&
    !parseExportResourceLimits(settings.exportResourceLimits)
  ) {
    throw new Error('Export resource limits are invalid');
  }
  if (
    settings.fullPageQuality !== undefined &&
    !parseFullPageQualityPolicy(settings.fullPageQuality)
  ) {
    throw new Error('Full-page screenshot quality settings are invalid');
  }
  if (
    settings.pagePackageCaptureTiming !== undefined &&
    !parsePagePackageCaptureTimingPolicy(settings.pagePackageCaptureTiming)
  ) {
    throw new Error('Page capture timing settings are invalid');
  }
  await browserStorage.sync.set({ [STORAGE_KEY]: settings });

  logger.debug('Saved settings payload');
}

function normalizeLoadedSettings(parsedValue: Partial<Settings>): NormalizedSettings {
  const defaultSettings = createDefaultSettings();
  const captureAction = resolveCaptureAction(
    parsedValue.captureAction ?? defaultSettings.captureAction
  );
  const localStoragePolicy = normalizeLocalStoragePolicy(parsedValue);

  return {
    ...defaultSettings,
    ...parsedValue,
    captureAction,
    localStoragePolicy,
    saveCapturesToGallery: localStoragePolicy.defaultDestination === 'library',
    contentToolbar: {
      ...DEFAULT_CONTENT_TOOLBAR_SETTINGS,
      ...parsedValue.contentToolbar,
    },
    contextMenu: {
      ...DEFAULT_CONTEXT_MENU_SETTINGS,
      ...parsedValue.contextMenu,
    },
    fullPageCapture: {
      ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
      ...parsedValue.fullPageCapture,
    },
    exportResourceLimits: {
      ...DEFAULT_EXPORT_RESOURCE_LIMITS,
      ...parsedValue.exportResourceLimits,
    },
    fullPageQuality: { ...(parsedValue.fullPageQuality ?? DEFAULT_FULL_PAGE_QUALITY_POLICY) },
    pagePackageCaptureTiming: {
      ...(parsedValue.pagePackageCaptureTiming ?? DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING),
    },
    voiceInput: {
      ...DEFAULT_VOICE_INPUT_SETTINGS,
      ...parsedValue.voiceInput,
    },
    presets: Array.isArray(parsedValue.presets) ? parsedValue.presets : [],
    viewportPresets: Array.isArray(parsedValue.viewportPresets)
      ? cloneViewportPresets(parsedValue.viewportPresets)
      : cloneViewportPresets(DEFAULT_VIEWPORT_PRESETS),
    defaultViewportPresetId:
      parsedValue.defaultViewportPresetId !== undefined &&
      parsedValue.viewportPresets?.some(
        (preset) => preset.id === parsedValue.defaultViewportPresetId && preset.enabled
      )
        ? parsedValue.defaultViewportPresetId
        : null,
    defaultImagePresetId: parsedValue.defaultImagePresetId ?? null,
    defaultVideoPresetId: parsedValue.defaultVideoPresetId ?? null,
    defaultExportPresetId: parsedValue.defaultExportPresetId ?? null,
  };
}

function normalizeLocalStoragePolicy(parsedValue: Partial<Settings>): LocalStoragePolicy {
  const legacyDestination = parsedValue.saveCapturesToGallery ? 'library' : 'temporary';
  return {
    ...DEFAULT_LOCAL_STORAGE_POLICY,
    defaultDestination: parsedValue.localStoragePolicy?.defaultDestination ?? legacyDestination,
    cleanupEnabled:
      parsedValue.localStoragePolicy?.cleanupEnabled ?? DEFAULT_LOCAL_STORAGE_POLICY.cleanupEnabled,
    draftRetentionDays:
      parsedValue.localStoragePolicy?.draftRetentionDays ??
      DEFAULT_LOCAL_STORAGE_POLICY.draftRetentionDays,
    videoDraftRetentionDays:
      parsedValue.localStoragePolicy?.videoDraftRetentionDays ??
      DEFAULT_LOCAL_STORAGE_POLICY.videoDraftRetentionDays,
  };
}

/**
 * Read path only: invalid stored fields are dropped from the returned value, but this function
 * never repairs or migrates storage. Explicit mutations and maintenance flows own writes.
 */
export async function loadSettings(): Promise<NormalizedSettings> {
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

function queueSettingsMutation(
  run: () => Promise<NormalizedSettings>
): Promise<NormalizedSettings> {
  const nextMutation = settingsMutationQueue.catch(() => null).then(run);
  settingsMutationQueue = nextMutation;
  return nextMutation;
}

function applySettingsPatch(
  currentSettings: NormalizedSettings,
  settingsPatch: SettingsPatch
): NormalizedSettings {
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
    fullPageCapture: {
      ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
      ...currentSettings.fullPageCapture,
      ...settingsPatch.fullPageCapture,
    },
    exportResourceLimits: {
      ...DEFAULT_EXPORT_RESOURCE_LIMITS,
      ...currentSettings.exportResourceLimits,
      ...settingsPatch.exportResourceLimits,
    },
    fullPageQuality: settingsPatch.fullPageQuality ?? currentSettings.fullPageQuality,
    pagePackageCaptureTiming:
      settingsPatch.pagePackageCaptureTiming ?? currentSettings.pagePackageCaptureTiming,
    localStoragePolicy: {
      ...currentSettings.localStoragePolicy,
      ...settingsPatch.localStoragePolicy,
    },
    voiceInput: {
      ...DEFAULT_VOICE_INPUT_SETTINGS,
      ...currentSettings.voiceInput,
      ...settingsPatch.voiceInput,
    },
  });
}

/**
 * Serializes settings mutations in-process and reloads storage for each queued patch.
 * Failed writes reject to the caller and the queue remains usable for later mutations.
 */
export async function patchSettings(settingsPatch: SettingsPatch): Promise<NormalizedSettings> {
  return queueSettingsMutation(async () => {
    const currentSettings = await loadSettings();
    const nextSettings = applySettingsPatch(currentSettings, settingsPatch);

    await saveSettings(nextSettings);
    return nextSettings;
  });
}

export async function resetSettingsToDefaults(): Promise<NormalizedSettings> {
  return queueSettingsMutation(async () => {
    const nextSettings = createDefaultSettings();
    await saveSettings(nextSettings);
    return nextSettings;
  });
}

/** Removes retired synchronized fields while preserving every current stored property. */
export async function removeRetiredSynchronizedSettings(): Promise<void> {
  await queueSettingsMutation(async () => {
    const stored = await browserStorage.sync.get([STORAGE_KEY]);
    const raw = stored[STORAGE_KEY];
    const retiredField = ['raw', 'Diagnostics', 'Enabled'].join('');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return loadSettings();
    }

    const nextRaw = { ...(raw as Record<string, unknown>) };
    const removedDiagnostics = retiredField in nextRaw;
    if (!removedDiagnostics) {
      return loadSettings();
    }

    delete nextRaw[retiredField];
    await browserStorage.sync.set({ [STORAGE_KEY]: nextRaw });
    return loadSettings();
  });
}
