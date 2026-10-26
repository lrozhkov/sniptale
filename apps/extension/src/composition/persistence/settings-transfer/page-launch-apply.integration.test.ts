import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { normalizePageLaunchPreferences } from '../../../contracts/page-launch';
import { parseSettingsTransferPackageText } from '../../../contracts/settings-transfer';
import { createDefaultEditorPresetStorageState } from '../editor-presets/defaults';
import { createDefaultGradientPresetCatalog } from '../gradient-presets/defaults';
import { resolveStoredCalloutPresetCatalog } from '../callout-presets/migration';
import { resolveStoredStepBadgePresetCatalog } from '../step-badge-presets/migration';
import { createSurfaceStylePresetCatalog } from '../surface-style-presets/catalog';
import {
  buildSettingsTransferPackage,
  buildSettingsTransferTree,
  parseSettingsTransferDomains,
} from '../../../workflows/settings-transfer';
import { emptySummary } from '../../../workflows/settings-transfer/planner';

const backend = vi.hoisted(() => {
  const sync: Record<string, unknown> = {};
  const local: Record<string, unknown> = {};
  return { sync, local, writes: new Array<string>(), failNextLocalWrite: false };
});
function storageArea(area: 'sync' | 'local') {
  return {
    get: async (keys: string | string[]) => {
      const selected = typeof keys === 'string' ? [keys] : keys;
      return structuredClone(
        Object.fromEntries(
          selected.filter((key) => key in backend[area]).map((key) => [key, backend[area][key]])
        )
      );
    },
    set: async (values: Record<string, unknown>) => {
      backend.writes.push(`${area}:set`);
      Object.assign(backend[area], structuredClone(values));
      if (area === 'local' && backend.failNextLocalWrite) {
        backend.failNextLocalWrite = false;
        throw new Error('local write partially applied');
      }
    },
    remove: async (keys: string[]) => {
      backend.writes.push(`${area}:remove`);
      for (const key of keys) delete backend[area][key];
    },
  };
}
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { sync: storageArea('sync'), local: storageArea('local') },
}));
vi.mock('../effect-bundles', async (original) => ({
  ...(await original<typeof import('../effect-bundles')>()),
  listImportedEffectBundles: async () => [],
}));
vi.mock('../capture-settings', async (original) => ({
  ...(await original<typeof import('../capture-settings')>()),
  loadVideoSettings: async () => structuredClone(DEFAULT_VIDEO_SETTINGS),
}));
vi.mock('../capture-settings/popup-startup', async (original) => ({
  ...(await original<typeof import('../capture-settings/popup-startup')>()),
  loadPopupStartupState: async () => ({ selection: 'remember-last' }),
}));
vi.mock('../ai-settings', async (original) => ({
  ...(await original<typeof import('../ai-settings')>()),
  loadAISettings: async () => ({
    providers: [],
    models: [],
    defaultModelId: null,
    chromeAiEnabled: false,
    globalSystemPrompt: '',
    scenarioEditorSystemPrompt: '',
  }),
}));
vi.mock('../highlighter', async (original) => ({
  ...(await original<typeof import('../highlighter')>()),
  loadHighlighterSettings: async () => ({ borderPresets: [] }),
}));
vi.mock('../callout-presets', async (original) => ({
  ...(await original<typeof import('../callout-presets')>()),
  loadCalloutPresetCatalog: async () => resolveStoredCalloutPresetCatalog({}),
}));
vi.mock('../step-badge-presets', async (original) => ({
  ...(await original<typeof import('../step-badge-presets')>()),
  loadStepBadgePresetCatalog: async () => resolveStoredStepBadgePresetCatalog({}),
}));
vi.mock('../annotation-template-tags', async (original) => ({
  ...(await original<typeof import('../annotation-template-tags')>()),
  loadAnnotationTemplateTagState: async () => ({
    activeFilterTagIds: [],
    schemaVersion: 1,
    tags: [],
  }),
}));
vi.mock('../editor-presets', async (original) => ({
  ...(await original<typeof import('../editor-presets')>()),
  loadEditorPresetState: async () => createDefaultEditorPresetStorageState(),
}));
vi.mock('../drawing-palette', async (original) => ({
  ...(await original<typeof import('../drawing-palette')>()),
  loadDrawingPaletteState: async () => ({ colors: Array.from({ length: 10 }, () => '#000000') }),
}));
vi.mock('../gradient-presets', async (original) => ({
  ...(await original<typeof import('../gradient-presets')>()),
  loadGradientPresetCatalog: async () => createDefaultGradientPresetCatalog(),
}));
vi.mock('../surface-style-presets', async (original) => ({
  ...(await original<typeof import('../surface-style-presets')>()),
  loadSurfaceStylePresetCatalog: async () => createSurfaceStylePresetCatalog(),
}));
vi.mock('../prompt-templates', async (original) => ({
  ...(await original<typeof import('../prompt-templates')>()),
  getPromptTemplates: async () => [],
  loadTemplateOrder: async () => [],
}));
vi.mock('../quick-actions', async (original) => ({
  ...(await original<typeof import('../quick-actions')>()),
  getQuickActions: async () => [],
}));

import { DEFAULT_SETTINGS, loadSettings } from '../settings';
import { readSettingsTransferSnapshot } from './read';
import { applySettingsTransferDomains } from './apply';
const initial = normalizePageLaunchPreferences(undefined);
const imported = {
  enabled: true,
  hoverOnly: true,
  corner: 'top-left' as const,
  quickActionsPopup: false,
  quickActionsCorner: true,
  quickActionsToolbar: true,
};
beforeEach(() => {
  backend.sync = {
    sniptale_settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      pageLaunch: initial,
      imageQuality: 37,
    },
    untouched: 'sync-private',
  };
  backend.local = { 'sniptale-theme-preference': 'dark', untouched: 'local-private' };
  backend.writes = [];
  backend.failNextLocalWrite = false;
});
function domains(pageLaunch = imported) {
  return parseSettingsTransferDomains({
    'interface.preferences': { schemaVersion: 1, data: { pageLaunch } },
  });
}
it('round trips selected page-launch preferences through JSON and actual storage apply', async () => {
  backend.sync['sniptale_settings'] = {
    ...structuredClone(DEFAULT_SETTINGS),
    pageLaunch: imported,
    imageQuality: 91,
  };
  const snapshot = await readSettingsTransferSnapshot();
  const built = buildSettingsTransferPackage({
    appVersion: '1.0.0',
    domains: snapshot.domains,
    tree: buildSettingsTransferTree(snapshot.dynamicItems, snapshot.dependencies),
    exportKind: 'selective',
    selectedNodeIds: ['interface.preferences.page-launch'],
  });
  const parsed = parseSettingsTransferDomains(
    parseSettingsTransferPackageText(built.fileText).domains
  );
  expect(parsed['interface.preferences']?.data).toEqual({ pageLaunch: imported });
  expect(backend.writes).toEqual([]);
  backend.sync['sniptale_settings'] = {
    ...structuredClone(DEFAULT_SETTINGS),
    pageLaunch: initial,
    imageQuality: 37,
  };
  await applySettingsTransferDomains({ domains: parsed, summary: emptySummary() });
  const restored = await readSettingsTransferSnapshot();
  expect(restored.domains['interface.preferences']?.data).toMatchObject({ pageLaunch: imported });
  expect((await loadSettings()).imageQuality).toBe(37);
  expect(backend.local['untouched']).toBe('local-private');
  expect(backend.local['sniptale-theme-preference']).toBe('dark');
});
it('preserves existing page-launch and unrelated fields when importing a legacy interface package', async () => {
  const legacy = parseSettingsTransferDomains({
    'interface.preferences': { schemaVersion: 1, data: { theme: 'light' } },
  });
  await applySettingsTransferDomains({ domains: legacy, summary: emptySummary() });
  expect((await loadSettings()).pageLaunch).toEqual(initial);
  expect((await loadSettings()).imageQuality).toBe(37);
  expect(backend.local['sniptale-theme-preference']).toBe('light');
});
it('restores page-launch settings and local fields after a partially applied import and permits retry', async () => {
  const payload = domains();
  payload['interface.preferences'] = {
    schemaVersion: 1,
    data: { pageLaunch: imported, theme: 'light' },
  };
  const before = structuredClone({ sync: backend.sync, local: backend.local });
  backend.failNextLocalWrite = true;
  await expect(
    applySettingsTransferDomains({ domains: payload, summary: emptySummary() })
  ).rejects.toThrow('local write partially applied');
  expect({ sync: backend.sync, local: backend.local }).toEqual(before);
  expect(backend.writes[0]).toBe('sync:set');
  expect(backend.writes[1]).toBe('local:set');
  expect(backend.writes.lastIndexOf('sync:set')).toBeGreaterThan(
    backend.writes.indexOf('local:set')
  );
  await applySettingsTransferDomains({ domains: payload, summary: emptySummary() });
  expect((await loadSettings()).pageLaunch).toEqual(imported);
  expect((await loadSettings()).imageQuality).toBe(37);
  expect(backend.local['sniptale-theme-preference']).toBe('light');
});
