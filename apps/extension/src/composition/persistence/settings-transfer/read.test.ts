import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { resolveStoredCalloutPresetCatalog } from '../callout-presets/migration';
import { resolveStoredStepBadgePresetCatalog } from '../step-badge-presets/migration';
import { createSurfaceStylePresetCatalog } from '../surface-style-presets/catalog';

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
    { id: 'quick-a', name: 'Quick', viewportPresetId: 'viewport-a' },
  ]);
  mocks.video.mockResolvedValue(structuredClone(DEFAULT_VIDEO_SETTINGS));
  mocks.popup.mockResolvedValue({ page: 'capture' });
  mocks.highlighter.mockResolvedValue({ borderPresets: [] });
  mocks.callouts.mockResolvedValue(resolveStoredCalloutPresetCatalog({}));
  mocks.stepBadges.mockResolvedValue(resolveStoredStepBadgePresetCatalog({}));
  mocks.tags.mockResolvedValue({ tags: [] });
  mocks.editor.mockResolvedValue({ step: { presets: [] }, sceneBackground: { presets: [] } });
  mocks.palette.mockResolvedValue({ colors: Array.from({ length: 10 }, () => '#000000') });
  mocks.gradients.mockResolvedValue({ presets: [] });
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
  mocks.templates.mockResolvedValue([{ id: 'prompt-a', name: 'Prompt', prompt: 'Private' }]);
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
      expect.objectContaining({ id: 'model-a' }),
      expect.objectContaining({ id: 'slot-0', collectionNodeId: 'styles.palettes.items' }),
    ])
  );
  expect(snapshot.dependencies['ai.models.default']).toEqual(['ai.models.items.model-a']);
});

it('collects dynamic annotation, editor, and default dependencies without dangling values', () => {
  const domains = {
    'capture.saving': {
      schemaVersion: 1,
      data: { defaultImagePresetId: 'folder-a', templates: [{ id: 'folder-a' }] },
    },
    'capture.viewport-presets': {
      schemaVersion: 1,
      data: { defaultId: 'viewport-a', items: [{ id: 'viewport-a' }] },
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
  };
  expect(collectSettingsTransferDependencies(domains)).toMatchObject({
    'capture.saving.defaults': ['capture.saving.templates.folder-a'],
    'capture.viewport-presets.default': ['capture.viewport-presets.items.viewport-a'],
  });
  expect(collectSettingsTransferDynamicItems(domains)).toEqual(
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
    ])
  );
});

function settingsFixture() {
  return {
    captureAction: 'download_default',
    contextMenu: { enabled: true },
    localStoragePolicy: { cleanupEnabled: true },
    viewportPresets: [{ id: 'viewport-a', name: 'Desktop' }],
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
