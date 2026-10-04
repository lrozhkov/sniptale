import { parseSettingsTransferPackageText } from '../../../contracts/settings-transfer';
vi.mock('../effect-bundles', async (original) => ({
  ...(await original<typeof import('../effect-bundles')>()),
  listImportedEffectBundles: vi.fn(async () => []),
}));
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { resolveStoredCalloutPresetCatalog } from '../callout-presets/migration';
import { resolveStoredStepBadgePresetCatalog } from '../step-badge-presets/migration';
import { createSurfaceStylePresetCatalog } from '../surface-style-presets/catalog';
import {
  buildSettingsTransferPackage,
  buildSettingsTransferTree,
  parseSettingsTransferDomains,
} from '../../../workflows/settings-transfer';
import { SETTINGS_TRANSFER_DOMAIN_IDS } from '../../../workflows/settings-transfer/registry';
import { createSystemViewportPresetCatalog } from '../../../features/viewport-presets/catalog';
import { createDefaultEditorPresetStorageState } from '../editor-presets/defaults';
import { createDefaultGradientPresetCatalog } from '../gradient-presets/defaults';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  callouts: vi.fn(),
  editor: vi.fn(),
  gradients: vi.fn(),
  highlighter: vi.fn(),
  localGet: vi.fn(),
  palette: vi.fn(),
  popup: vi.fn(),
  quickActions: vi.fn(),
  settings: vi.fn(),
  stepBadges: vi.fn(),
  surfaces: vi.fn(),
  tags: vi.fn(),
  templateOrder: vi.fn(),
  templates: vi.fn(),
  video: vi.fn(),
}));

vi.mock('../ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai-settings')>()),
  loadAISettings: mocks.ai,
}));
vi.mock('../callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../callout-presets')>()),
  loadCalloutPresetCatalog: mocks.callouts,
}));
vi.mock('../capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-settings')>()),
  loadVideoSettings: mocks.video,
}));
vi.mock('../capture-settings/popup-startup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-settings/popup-startup')>()),
  loadPopupStartupState: mocks.popup,
}));
vi.mock('../editor-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor-presets')>()),
  loadEditorPresetState: mocks.editor,
}));
vi.mock('../gradient-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../gradient-presets')>()),
  loadGradientPresetCatalog: mocks.gradients,
}));
vi.mock('../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../highlighter')>()),
  loadHighlighterSettings: mocks.highlighter,
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: mocks.localGet } },
}));
vi.mock('../drawing-palette', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../drawing-palette')>()),
  loadDrawingPaletteState: mocks.palette,
}));
vi.mock('../prompt-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../prompt-templates')>()),
  getPromptTemplates: mocks.templates,
  loadTemplateOrder: mocks.templateOrder,
}));
vi.mock('../quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quick-actions')>()),
  getQuickActions: mocks.quickActions,
}));
vi.mock('../settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../settings')>()),
  loadSettings: mocks.settings,
}));
vi.mock('../step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../step-badge-presets')>()),
  loadStepBadgePresetCatalog: mocks.stepBadges,
}));
vi.mock('../surface-style-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surface-style-presets')>()),
  loadSurfaceStylePresetCatalog: mocks.surfaces,
}));
vi.mock('../annotation-template-tags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../annotation-template-tags')>()),
  loadAnnotationTemplateTagState: mocks.tags,
}));

import {
  collectSettingsTransferDependencies,
  collectSettingsTransferDynamicItems,
  readSettingsTransferSnapshot,
} from './read';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue(settingsFixture());
  mocks.quickActions.mockResolvedValue([
    {
      id: 'quick-a',
      status: true,
      name: 'Quick',
      icon: 'Camera',
      screenshotMode: 'visible',
      exitAfterCapture: true,
      viewportPresetId: 'viewport-a',
    },
  ]);
  mocks.video.mockResolvedValue(structuredClone(DEFAULT_VIDEO_SETTINGS));
  mocks.popup.mockResolvedValue({ selection: 'remember-last', lastPage: 'menu' });
  mocks.highlighter.mockResolvedValue({ borderPresets: [] });
  mocks.callouts.mockResolvedValue(resolveStoredCalloutPresetCatalog({}));
  mocks.stepBadges.mockResolvedValue(resolveStoredStepBadgePresetCatalog({}));
  mocks.tags.mockResolvedValue({ activeFilterTagIds: [], schemaVersion: 1, tags: [] });
  mocks.editor.mockResolvedValue(createDefaultEditorPresetStorageState());
  mocks.palette.mockResolvedValue({ colors: Array.from({ length: 10 }, () => '#000000') });
  mocks.gradients.mockResolvedValue(createDefaultGradientPresetCatalog());
  mocks.surfaces.mockResolvedValue(createSurfaceStylePresetCatalog());
  mocks.ai.mockResolvedValue({
    providers: [
      {
        id: 'provider-a',
        name: 'Provider',
        connectionType: 'openai-compatible',
        baseUrl: 'https://private.example',
        hasStoredApiKey: true,
        createdAt: 1,
        authorization: 'canary-secret',
      },
    ],
    models: [
      {
        id: 'model-a',
        providerId: 'provider-a',
        modelCode: 'model-code',
        displayName: 'Model',
        authorization: 'canary-secret',
      },
    ],
    defaultModelId: 'model-a',
    chromeAiEnabled: true,
    globalSystemPrompt: 'Global',
    scenarioEditorSystemPrompt: 'Scenario',
  });
  mocks.templates.mockResolvedValue([{ id: 'prompt-a', name: 'Prompt', content: 'Private' }]);
  mocks.templateOrder.mockResolvedValue(['prompt-a']);
  mocks.localGet.mockResolvedValue({
    'sniptale-theme-preference': 'dark',
    'sniptale-locale-preference': 'en',
  });
});

it('reads every visible domain while removing secret and device-bound state', async () => {
  const snapshot = await readSettingsTransferSnapshot();
  expect(Object.keys(snapshot.domains)).toHaveLength(25);
  expect(snapshot.domains['ai.providers']?.data).toEqual({
    items: [
      {
        id: 'provider-a',
        name: 'Provider',
        connectionType: 'openai-compatible',
        baseUrl: 'https://private.example',
        createdAt: 1,
      },
    ],
  });
  expect(snapshot.domains['system.voice']?.data).not.toHaveProperty('microphoneDeviceId');
  expect(snapshot.domains['capture.image']?.data).toMatchObject({
    fullPageQuality: {
      maxFileSizeMiB: 64,
      maxMegapixels: 64,
      minScalePercent: 50,
      profile: 'safe',
    },
  });
  expect(snapshot.domains['capture.pages']?.data).toEqual({
    resourceLimits: { maxFileCount: 30, maxFileSizeMiB: 30, maxTotalSizeMiB: 150 },
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
  });
  expect(snapshot.domains).not.toHaveProperty('access.capture-assets');
  expect(JSON.stringify(snapshot.domains['ai.models']?.data)).not.toContain('authorization');
  expect(snapshot.dynamicItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'quick-a' }),
      expect.objectContaining({ id: 'provider-a' }),
      expect.objectContaining({ id: 'model-a', label: 'Model' }),
      expect.objectContaining({ id: 'slot-0', collectionNodeId: 'styles.palettes.items' }),
    ])
  );
  expect(snapshot.dependencies['ai.models.default']).toEqual(['ai.models.items.model-a']);
});

it('uses the current Settings locale for system item display names', async () => {
  mocks.localGet.mockResolvedValue({
    'sniptale-theme-preference': 'dark',
    'sniptale-locale-preference': 'ru',
  });

  const snapshot = await readSettingsTransferSnapshot();

  expect(snapshot.locale).toBe('ru');
  expect(snapshot.dynamicItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'system-surface-plain', label: 'Чистый белый' }),
    ])
  );
});

it('produces a complete snapshot that remains valid during commit revalidation', async () => {
  const snapshot = await readSettingsTransferSnapshot();
  const inspected = parseSettingsTransferDomains(snapshot.domains);

  expect(parseSettingsTransferDomains(inspected)).toEqual(inspected);
});

it('round-trips the full backup and each of the 25 selectable domain roots', async () => {
  const snapshot = await readSettingsTransferSnapshot();
  const tree = buildSettingsTransferTree(snapshot.dynamicItems, snapshot.dependencies);
  const allNodeIds = tree.flatMap((root) => [
    root.id,
    ...root.children.flatMap((field) => [field.id, ...field.children.map((item) => item.id)]),
  ]);
  const complete = buildSettingsTransferPackage({
    appVersion: '1.0.0',
    domains: snapshot.domains,
    exportKind: 'backup',
    selectedNodeIds: allNodeIds,
    tree,
  });
  const parsedComplete = parseSettingsTransferPackageText(complete.fileText);
  expect(Object.keys(parseSettingsTransferDomains(parsedComplete.domains)).sort()).toEqual(
    [...SETTINGS_TRANSFER_DOMAIN_IDS].sort()
  );
  expect(complete.fileText).not.toContain('canary-secret');
  expect(complete.fileText).not.toContain('microphoneDeviceId');

  for (const domainId of SETTINGS_TRANSFER_DOMAIN_IDS) {
    const root = tree.find((node) => node.id === domainId)!;
    const selectedNodeIds = [
      root.id,
      ...root.children.flatMap((field) => [field.id, ...field.children.map((item) => item.id)]),
    ];
    const selective = buildSettingsTransferPackage({
      appVersion: '1.0.0',
      domains: snapshot.domains,
      exportKind: 'selective',
      selectedNodeIds,
      tree,
    });
    const parsed = parseSettingsTransferPackageText(selective.fileText);
    expect(Object.keys(parsed.domains), domainId).toContain(domainId);
    expect(parseSettingsTransferDomains(parsed.domains)[domainId], domainId).toEqual(
      parseSettingsTransferDomains({ [domainId]: snapshot.domains[domainId]! })[domainId]
    );
  }
});

it('builds parseable selective packages for each available collection item', async () => {
  const snapshot = await readSettingsTransferSnapshot();
  const tree = buildSettingsTransferTree(snapshot.dynamicItems, snapshot.dependencies);
  const failures: string[] = [];
  for (const item of snapshot.dynamicItems) {
    const id = `${item.collectionNodeId}.${item.id}`;
    try {
      const selected = buildSettingsTransferPackage({
        appVersion: '1.0.0',
        domains: snapshot.domains,
        exportKind: 'selective',
        selectedNodeIds: [id],
        tree,
      });
      parseSettingsTransferDomains(parseSettingsTransferPackageText(selected.fileText).domains);
    } catch {
      failures.push(id);
    }
  }
  expect(failures).toEqual([]);
});

it('builds parseable selective packages for each selectable field', async () => {
  const snapshot = await readSettingsTransferSnapshot();
  const tree = buildSettingsTransferTree(snapshot.dynamicItems, snapshot.dependencies);
  const failures: string[] = [];
  for (const root of tree) {
    for (const field of root.children) {
      try {
        const selected = buildSettingsTransferPackage({
          appVersion: '1.0.0',
          domains: snapshot.domains,
          exportKind: 'selective',
          selectedNodeIds: [field.id],
          tree,
        });
        parseSettingsTransferDomains(parseSettingsTransferPackageText(selected.fileText).domains);
      } catch (error) {
        failures.push(`${field.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

it('collects dynamic annotation, editor, and default dependencies without dangling values', () => {
  const domains = {
    'capture.video': {
      schemaVersion: 1,
      data: {
        profiles: [{ id: 'video-profile-a', name: 'Video profile' }],
        qualityProfileId: 'video-profile-a',
      },
    },
    'interface.preferences': {
      schemaVersion: 1,
      data: {
        contextMenu: {
          layout: {
            version: 2,
            nodes: [
              {
                type: 'command',
                command: 'sniptale.screenshots.quick-action.quick-a',
                enabled: true,
              },
            ],
          },
        },
      },
    },
    'capture.quick-actions': {
      schemaVersion: 1,
      data: { items: [{ id: 'quick-a', viewportPresetId: 'viewport-a' }] },
    },
    'capture.saving': {
      schemaVersion: 1,
      data: { defaultImagePresetId: 'folder-a', templates: [{ id: 'folder-a' }] },
    },
    'capture.viewport-presets': {
      schemaVersion: 1,
      data: {
        defaultId: 'viewport-a',
        items: [
          { id: 'viewport-a' },
          { id: 'system-window-hd', kind: 'system', systemKey: 'windowHd' },
        ],
      },
    },
    'styles.borders': {
      schemaVersion: 1,
      data: {
        borderPresets: [
          {
            id: 'border-a',
            name: 'Border',
            tagIds: ['tag-a', 1],
            linkedTemplates: { calloutPresetId: 'callout-a', stepBadgePresetId: 'number-a' },
          },
          {
            id: 'system-default',
            name: 'system-default',
            origin: 'system',
            systemPresetKey: 'system-default',
            customized: false,
          },
          null,
        ],
      },
    },
    'styles.tool-presets': {
      schemaVersion: 1,
      data: {
        step: { presets: [{ id: 'step-a', name: 'Step' }, {}] },
        sceneBackground: { presets: [{ id: 'scene-a' }] },
      },
    },
    'styles.callouts': {
      schemaVersion: 1,
      data: {
        presets: [
          {
            id: 'system-callout-bubble',
            name: 'system-callout-bubble',
            origin: 'system',
            systemPresetKey: 'system-callout-bubble',
            customized: false,
          },
        ],
      },
    },
    'styles.numbering': {
      schemaVersion: 1,
      data: {
        presets: [
          {
            id: 'system-classic',
            name: 'system-classic',
            origin: 'system',
            systemPresetKey: 'system-classic',
            customized: false,
          },
        ],
      },
    },
    'styles.surfaces': {
      schemaVersion: 1,
      data: {
        presets: [
          {
            id: 'system-surface-plain',
            name: 'surfaceStyle.system.plain',
            origin: 'system',
          },
        ],
      },
    },
    'styles.gradients': {
      schemaVersion: 1,
      data: {
        presets: [{ id: 'system-sunset', name: 'system-sunset', origin: 'system' }],
      },
    },
    'ai.models': {
      schemaVersion: 1,
      data: { items: [{ id: 'model-a', displayName: 'Readable model' }] },
    },
  };
  expect(collectSettingsTransferDependencies(domains)).toMatchObject({
    'capture.video.selection': ['capture.video.profiles.video-profile-a'],
    'interface.preferences.context-menu': ['capture.quick-actions.items.quick-a'],
    'capture.saving.defaults': ['capture.saving.templates.folder-a'],
    'capture.viewport-presets.default': ['capture.viewport-presets.items.viewport-a'],
  });
  expect(collectSettingsTransferDynamicItems(domains, 'en')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'border-a',
        dependencies: [
          'styles.tags.items.tag-a',
          'styles.callouts.items.callout-a',
          'styles.numbering.items.number-a',
        ],
      }),
      expect.objectContaining({ id: 'step:step-a' }),
      expect.objectContaining({ id: 'sceneBackground:scene-a' }),
      expect.objectContaining({ id: 'model-a', label: 'Readable model' }),
      expect.objectContaining({
        id: 'video-profile-a',
        collectionNodeId: 'capture.video.profiles',
      }),
      expect.objectContaining({ id: 'system-default', label: 'Sniptale Orange' }),
      expect.objectContaining({ id: 'system-surface-plain', label: 'Plain' }),
      expect.objectContaining({ id: 'system-sunset', label: 'Sunset' }),
      expect.objectContaining({ id: 'system-window-hd', label: 'HD window' }),
      expect.objectContaining({ id: 'system-callout-bubble', label: 'Sniptale Orange' }),
      expect.objectContaining({ id: 'system-classic', label: 'Sniptale Orange' }),
    ])
  );
});

it('includes only referenced menu actions, viewports, and the selected video profile', () => {
  const domains = {
    'interface.preferences': {
      schemaVersion: 1,
      data: {
        contextMenu: {
          layout: {
            version: 2,
            nodes: [
              {
                type: 'command',
                command: 'sniptale.screenshots.quick-action.quick-a',
                enabled: true,
              },
              {
                type: 'command',
                command: 'sniptale.window-resize.preset.viewport-a',
                enabled: true,
              },
              {
                type: 'command',
                command: 'sniptale.screenshots.quick-action.missing',
                enabled: false,
              },
            ],
          },
        },
      },
    },
    'capture.quick-actions': {
      schemaVersion: 1,
      data: {
        items: [
          { id: 'quick-a', viewportPresetId: 'viewport-a' },
          { id: 'quick-b', viewportPresetId: 'viewport-b' },
        ],
      },
    },
    'capture.viewport-presets': {
      schemaVersion: 1,
      data: {
        items: [{ id: 'viewport-a' }, { id: 'viewport-b' }],
      },
    },
    'capture.video': {
      schemaVersion: 1,
      data: {
        profiles: [{ id: 'video-a' }, { id: 'video-b' }],
        qualityProfileId: 'video-a',
      },
    },
  };
  const tree = buildSettingsTransferTree(
    collectSettingsTransferDynamicItems(domains),
    collectSettingsTransferDependencies(domains)
  );
  const menuPackage = buildSettingsTransferPackage({
    appVersion: '1.0.0',
    domains,
    exportKind: 'selective',
    selectedNodeIds: ['interface.preferences.context-menu'],
    tree,
  });
  expect(menuPackage.package.domains['capture.quick-actions']?.data).toEqual({
    items: [{ id: 'quick-a', viewportPresetId: 'viewport-a' }],
  });
  expect(menuPackage.package.domains['capture.viewport-presets']?.data).toEqual({
    items: [{ id: 'viewport-a' }],
  });
  expect(menuPackage.package.domains['capture.video']).toBeUndefined();

  const videoPackage = buildSettingsTransferPackage({
    appVersion: '1.0.0',
    domains,
    exportKind: 'selective',
    selectedNodeIds: ['capture.video.selection'],
    tree,
  });
  expect(videoPackage.package.domains['capture.video']?.data).toEqual({
    profiles: [{ id: 'video-a' }],
    qualityProfileId: 'video-a',
  });
});

it('includes available tag and style references without implicitly exporting effect assets', () => {
  const domains = {
    'styles.tags': {
      schemaVersion: 1,
      data: {
        schemaVersion: 2,
        tags: [{ id: 'tag-a', label: 'Tag A', origin: 'user' }],
        activeFilterTagIds: ['tag-a'],
      },
    },
    'styles.surfaces': {
      schemaVersion: 1,
      data: {
        presets: [{ id: 'surface-a' }],
        defaultPresetIdBySurface: { 'highlighter-callout': 'surface-a' },
        favoriteIdsBySurface: { 'highlighter-callout': ['surface-a'] },
      },
    },
    'styles.gradients': {
      schemaVersion: 1,
      data: {
        presets: [{ id: 'gradient-a' }],
        defaultPresetIdBySurface: { 'highlighter-frame-fill': 'gradient-a' },
        favoriteIdsBySurface: { 'highlighter-frame-fill': ['gradient-a'] },
      },
    },
    'styles.video-effects': {
      schemaVersion: 1,
      data: { items: [{ id: 'effect-a' }], preferences: [{ packId: 'effect-a' }] },
    },
  };
  expect(collectSettingsTransferDependencies(domains)).toMatchObject({
    'styles.tags.active-filter': ['styles.tags.items.tag-a'],
    'styles.surfaces.defaults': ['styles.surfaces.items.surface-a'],
    'styles.gradients.defaults': ['styles.gradients.items.gradient-a'],
  });
  expect(collectSettingsTransferDependencies(domains)).not.toHaveProperty(
    'styles.video-effects.preferences'
  );
});

it('does not export effect documents when only preferences are selected', () => {
  const domains = {
    'styles.video-effects': {
      schemaVersion: 1,
      data: {
        items: [{ id: 'private-effect', documents: { secret: 'asset' } }],
        preferences: [{ packId: 'private-effect', enabled: true }],
      },
    },
  };
  const tree = buildSettingsTransferTree(
    [{ collectionNodeId: 'styles.video-effects.items', id: 'private-effect', label: 'Effect' }],
    collectSettingsTransferDependencies(domains)
  );
  const built = buildSettingsTransferPackage({
    appVersion: '1.0.0',
    domains,
    exportKind: 'selective',
    selectedNodeIds: ['styles.video-effects.preferences'],
    tree,
  });
  expect(built.package.domains['styles.video-effects']?.data).toEqual({
    preferences: [{ packId: 'private-effect', enabled: true }],
  });
  expect(built.fileText).not.toContain('secret');
});

function settingsFixture() {
  return {
    captureAction: 'download_default',
    contextMenu: { enabled: true },
    localStoragePolicy: { cleanupEnabled: true },
    viewportPresets: [
      ...createSystemViewportPresetCatalog(),
      {
        kind: 'user',
        id: 'viewport-a',
        name: 'Desktop',
        target: 'window',
        width: 1280,
        height: 720,
        enabled: true,
        order: 4,
      },
    ],
    defaultViewportPresetId: 'viewport-a',
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
    fullPageQuality: {
      maxFileSizeMiB: 64,
      maxMegapixels: 64,
      minScalePercent: 50,
      profile: 'safe',
    },
    authenticatedSnapshotAssetsEnabled: false,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    exportResourceLimits: { maxFileCount: 30, maxFileSizeMiB: 30, maxTotalSizeMiB: 150 },
    pagePackageCaptureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
    voiceInput: { language: 'ru-RU', mode: 'local-first', microphoneDeviceId: 'device-secret' },
  };
}

it('exports the complete menu layout in interface preferences and preserves it on revalidation', async () => {
  const layout = {
    version: 2 as const,
    nodes: [
      {
        type: 'section' as const,
        id: 'custom',
        title: 'Custom',
        enabled: true,
        children: [
          {
            type: 'section' as const,
            id: 'nested',
            title: 'Nested',
            enabled: true,
            children: [{ type: 'command' as const, command: 'sniptale.gallery', enabled: true }],
          },
        ],
      },
    ],
  };
  mocks.settings.mockResolvedValue({
    ...settingsFixture(),
    contextMenu: { enabled: true, layout },
  });
  const snapshot = await readSettingsTransferSnapshot();
  const parsed = parseSettingsTransferDomains(JSON.parse(JSON.stringify(snapshot.domains)));
  expect(parsed['interface.preferences']?.data).toMatchObject({
    contextMenu: { enabled: true, layout },
  });
});
