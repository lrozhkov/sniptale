import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SYSTEM_BORDER_PRESET_CATALOG_REVISION } from '../../../features/highlighter/presets/catalog';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';
import { createPreset } from './test-helpers';

const storageState = vi.hoisted(() => ({ value: undefined as unknown }));
const { loggerMocks, syncGetMock, syncSetMock } = vi.hoisted(() => ({
  loggerMocks: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  syncGetMock: vi.fn(async () =>
    storageState.value === undefined ? {} : { sniptale_highlighter_settings: storageState.value }
  ),
  syncSetMock: vi.fn(async (payload: Record<string, unknown>) => {
    storageState.value = payload['sniptale_highlighter_settings'];
  }),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    sync: { get: syncGetMock, set: syncSetMock },
  },
}));

async function loadHighlighterStorage() {
  return import('./index');
}

describe('highlighter system catalog persistence migration', () => {
  beforeEach(() => {
    storageState.value = undefined;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('persists an older catalog revision once and then becomes a no-op', async () => {
    const previousCatalog = createDefaultHighlighterSettings().borderPresets.map((preset) => ({
      ...preset,
      basedOnRevision: 0,
    }));
    storageState.value = {
      ...createDefaultHighlighterSettings(),
      borderPresets: previousCatalog,
      systemPresetCatalogRevision: 0,
    };
    const module = await loadHighlighterStorage();

    await expect(module.migrateHighlighterSystemPresetCatalog()).resolves.toBe(true);
    await expect(module.migrateHighlighterSystemPresetCatalog()).resolves.toBe(false);

    expect(syncSetMock).toHaveBeenCalledOnce();
    if (typeof storageState.value !== 'object' || storageState.value === null) {
      throw new Error('Expected migrated highlighter settings object');
    }
    expect(Reflect.get(storageState.value, 'borderPresets')).toHaveLength(8);
  });

  it.each([
    {
      expectedWarning: 'Ignoring invalid highlighter settings payload root from storage',
      label: 'invalid root',
      rawValue: 'malformed-highlighter-settings',
    },
    {
      expectedWarning: 'Ignoring invalid highlighter settings payload root from storage',
      label: 'array root',
      rawValue: [],
    },
    {
      expectedWarning: 'Dropped invalid highlighter settings fields from storage',
      label: 'array blur settings',
      rawValue: {
        ...createDefaultHighlighterSettings(),
        defaultBlurSettings: [],
      },
    },
    {
      expectedWarning: 'Dropped invalid highlighter settings fields from storage',
      label: 'array focus settings',
      rawValue: {
        ...createDefaultHighlighterSettings(),
        defaultFocusSettings: [],
      },
    },
    {
      expectedWarning: 'Dropped invalid highlighter settings fields from storage',
      label: 'invalid preset entry',
      rawValue: (() => {
        const { padding: _padding, ...malformedUserPreset } = createPreset('malformed-user');
        return {
          ...createDefaultHighlighterSettings(),
          borderPresets: [createPreset('valid-user'), malformedUserPreset],
        };
      })(),
    },
  ])('does not rewrite stored data with an $label', async ({ expectedWarning, rawValue }) => {
    storageState.value = rawValue;
    const module = await loadHighlighterStorage();

    await expect(module.migrateHighlighterSystemPresetCatalog()).resolves.toBe(false);

    expect(syncSetMock).not.toHaveBeenCalled();
    expect(storageState.value).toBe(rawValue);
    expect(loggerMocks.warn.mock.calls.some(([message]) => message === expectedWarning)).toBe(true);
  });

  it('does not downgrade or rewrite a catalog created by a newer extension version', async () => {
    const rawValue = {
      ...createDefaultHighlighterSettings(),
      futureOnlyCatalogMetadata: { introducedBy: 'future-version' },
      systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION + 1,
    };
    storageState.value = rawValue;
    const module = await loadHighlighterStorage();

    await expect(module.migrateHighlighterSystemPresetCatalog()).resolves.toBe(false);

    expect(syncSetMock).not.toHaveBeenCalled();
    expect(storageState.value).toBe(rawValue);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      'Skipping highlighter settings write from a newer catalog revision',
      { storedRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION + 1 }
    );
  });

  it.each([
    {
      label: 'future catalog revision',
      rawValue: {
        ...createDefaultHighlighterSettings(),
        futureOnlyCatalogMetadata: { introducedBy: 'future-version' },
        systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION + 1,
      },
    },
    {
      label: 'array root',
      rawValue: [],
    },
    {
      label: 'array blur settings',
      rawValue: {
        ...createDefaultHighlighterSettings(),
        defaultBlurSettings: [],
      },
    },
    {
      label: 'array focus settings',
      rawValue: {
        ...createDefaultHighlighterSettings(),
        defaultFocusSettings: [],
      },
    },
    {
      label: 'malformed preset entry',
      rawValue: (() => {
        const { padding: _padding, ...malformedUserPreset } = createPreset('malformed-user');
        return {
          ...createDefaultHighlighterSettings(),
          borderPresets: [...createDefaultHighlighterSettings().borderPresets, malformedUserPreset],
        };
      })(),
    },
  ])('rejects an applying command without rewriting a $label', async ({ rawValue }) => {
    storageState.value = rawValue;
    const module = await loadHighlighterStorage();

    await expect(module.setDefaultBorderPresetWithOutcome('system-soft-highlight')).resolves.toBe(
      'rejected'
    );

    expect(syncSetMock).not.toHaveBeenCalled();
    expect(storageState.value).toBe(rawValue);
  });
});
