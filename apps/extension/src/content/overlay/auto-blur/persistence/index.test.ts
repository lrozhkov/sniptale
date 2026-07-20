import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoBlurSettings } from '../../../../features/highlighter/contracts/auto-blur';
import { AUTO_BLUR_CATEGORIES } from '../../../../features/highlighter/contracts/auto-blur';

const { loggerMock, syncGetMock, syncSetMock } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
  syncGetMock: vi.fn(),
  syncSetMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      sync: {
        get: syncGetMock,
        set: syncSetMock,
      },
    },
  })
);

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => loggerMock,
}));

async function loadStorage() {
  return import('./index');
}

function createSettings(): AutoBlurSettings {
  return {
    autoApplyEnabled: true,
    selectedCategories: [AUTO_BLUR_CATEGORIES.email, AUTO_BLUR_CATEGORIES.bankCard],
    blurSettings: {
      amount: 18,
      blurType: 'gaussian',
      borderPresetId: null,
      radius: 0,
      shadow: 0,
      showBorder: true,
      strokeColor: '#475569',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 2,
    },
  };
}

async function verifiesPrivacyOnlySave() {
  const module = await loadStorage();
  const unsafeSettings = {
    ...createSettings(),
    detectedValues: ['john@example.com'],
    matches: [{ value: '4111 1111 1111 1111' }],
  } as AutoBlurSettings;

  await module.saveAutoBlurSettings(unsafeSettings);

  expect(syncSetMock).toHaveBeenCalledWith({
    [module.AUTO_BLUR_SETTINGS_KEY]: createSettings(),
  });
  expect(JSON.stringify(syncSetMock.mock.calls[0]?.[0])).not.toContain('john@example.com');
  expect(JSON.stringify(syncSetMock.mock.calls[0]?.[0])).not.toContain('4111 1111');
  expect(syncSetMock).toHaveBeenCalledTimes(1);
}

async function verifiesPreferenceLoadSanitization() {
  const module = await loadStorage();
  syncGetMock.mockResolvedValue({
    [module.AUTO_BLUR_SETTINGS_KEY]: {
      autoApplyEnabled: true,
      selectedCategories: [
        'unknown',
        AUTO_BLUR_CATEGORIES.phone,
        'snils',
        AUTO_BLUR_CATEGORIES.email,
      ],
      blurSettings: {
        amount: 14,
        blurType: 'solid',
        showBorder: true,
        strokeStyle: 'long-dash',
        strokeWidth: 0,
        detectedValue: 'secret@example.com',
      },
    },
  });

  await expect(module.loadAutoBlurSettings()).resolves.toEqual({
    autoApplyEnabled: true,
    selectedCategories: [
      AUTO_BLUR_CATEGORIES.email,
      AUTO_BLUR_CATEGORIES.phone,
      AUTO_BLUR_CATEGORIES.documentNumber,
    ],
    blurSettings: {
      ...module.DEFAULT_AUTO_BLUR_SETTINGS.blurSettings,
      amount: 14,
      blurType: 'solid',
      showBorder: true,
      strokeStyle: 'long-dash',
      strokeWidth: 0,
    },
  });
}

async function verifiesMalformedDefaults() {
  const module = await loadStorage();
  syncGetMock.mockResolvedValue({
    [module.AUTO_BLUR_SETTINGS_KEY]: {
      blurSettings: {
        amount: 'wide',
        blurType: 'unknown',
        showBorder: 'yes',
      },
      selectedCategories: 'email',
    },
  });

  await expect(module.loadAutoBlurSettings()).resolves.toEqual(module.DEFAULT_AUTO_BLUR_SETTINGS);
}

async function verifiesPixelateBlurTypeLoad() {
  const module = await loadStorage();
  syncGetMock.mockResolvedValue({
    [module.AUTO_BLUR_SETTINGS_KEY]: {
      autoApplyEnabled: false,
      selectedCategories: [AUTO_BLUR_CATEGORIES.email],
      blurSettings: {
        amount: 11,
        blurType: 'pixelate',
        showBorder: false,
      },
    },
  });

  await expect(module.loadAutoBlurSettings()).resolves.toEqual({
    autoApplyEnabled: false,
    selectedCategories: [AUTO_BLUR_CATEGORIES.email],
    blurSettings: {
      ...module.DEFAULT_AUTO_BLUR_SETTINGS.blurSettings,
      amount: 11,
      blurType: 'pixelate',
      showBorder: false,
    },
  });
}

async function verifiesSnapshotClone() {
  const module = await loadStorage();
  syncGetMock.mockResolvedValue({
    [module.AUTO_BLUR_SETTINGS_KEY]: createSettings(),
  });

  const loadedSettings = await module.loadAutoBlurSettings();
  loadedSettings.selectedCategories.length = 0;
  loadedSettings.blurSettings.amount = 1;

  expect(module.getLoadedAutoBlurSettingsSnapshot()).toEqual(createSettings());
}

describe('auto-blur storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    syncGetMock.mockResolvedValue({});
    syncSetMock.mockResolvedValue(undefined);
  });

  it('persists only category defaults, blur settings, and auto flag', verifiesPrivacyOnlySave);
  it(
    'loads stored preferences with category ordering and sanitized blur defaults',
    verifiesPreferenceLoadSanitization
  );
  it('falls back to defaults for malformed stored values', verifiesMalformedDefaults);
  it(
    'accepts pixelate blur settings in stored auto-blur preferences',
    verifiesPixelateBlurTypeLoad
  );
  it('returns cloned cached snapshots after load', verifiesSnapshotClone);
});
