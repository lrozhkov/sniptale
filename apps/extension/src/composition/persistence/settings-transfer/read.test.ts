import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { resolveStoredCalloutPresetCatalog } from '../callout-presets/migration';
import { resolveStoredStepBadgePresetCatalog } from '../step-badge-presets/migration';
import { createSurfaceStylePresetCatalog } from '../surface-style-presets/catalog';
import { parseSettingsTransferDomains } from '../../../workflows/settings-transfer';
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
  expect(Object.keys(snapshot.domains)).toHaveLength(24);
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

it('collects dynamic annotation, editor, and default dependencies without dangling values', () => {
  const domains = {
    'capture.video': {
      schemaVersion: 1,
      data: { profiles: [{ id: 'video-profile-a', name: 'Video profile' }] },
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
    authenticatedSnapshotAssetsEnabled: false,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    voiceInput: { language: 'ru-RU', mode: 'local-first', microphoneDeviceId: 'device-secret' },
  };
}
