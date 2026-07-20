import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createEditorSessionAutosaveServiceMock,
  createImageEditorControllerMock,
  ensureEditorPageSessionIdMock,
  loadEditorPresetStateMock,
  loadEditorWorkspaceDefaultsMock,
  loadHighlighterSettingsMock,
  readEditorPageLocationStateMock,
  resolveEditorPageRestoreSourceMock,
  waitForEditorControllerCanvasMock,
} = vi.hoisted(() => ({
  createEditorSessionAutosaveServiceMock: vi.fn(),
  createImageEditorControllerMock: vi.fn(),
  ensureEditorPageSessionIdMock: vi.fn(),
  loadEditorPresetStateMock: vi.fn(),
  loadEditorWorkspaceDefaultsMock: vi.fn(),
  loadHighlighterSettingsMock: vi.fn(),
  readEditorPageLocationStateMock: vi.fn(),
  resolveEditorPageRestoreSourceMock: vi.fn(),
  waitForEditorControllerCanvasMock: vi.fn(),
}));

vi.mock('../../controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../controller')>()),
  createImageEditorController: createImageEditorControllerMock,
}));

vi.mock('../../controller/canvas-ready', () => ({
  waitForEditorControllerCanvas: waitForEditorControllerCanvasMock,
}));

vi.mock('../../document/session-autosave', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/session-autosave')>()),
  createEditorSessionAutosaveService: createEditorSessionAutosaveServiceMock,
}));

vi.mock('../../document/page-session', () => ({
  ensureEditorPageSessionId: ensureEditorPageSessionIdMock,
  readEditorPageLocationState: readEditorPageLocationStateMock,
  resolveEditorPageRestoreSource: resolveEditorPageRestoreSourceMock,
}));

vi.mock('../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/highlighter')>()),
  DEFAULT_BORDER_PRESET: { id: 'default-border' },
  loadHighlighterSettings: loadHighlighterSettingsMock,
}));

vi.mock('../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/editor-presets')>()),
  loadEditorPresetState: loadEditorPresetStateMock,
}));

vi.mock('../../persistence/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/workspace')>()),
  DEFAULT_EDITOR_WORKSPACE_DEFAULTS: { backgroundColor: '#f2f4f7' },
  loadEditorWorkspaceDefaults: loadEditorWorkspaceDefaultsMock,
}));

import {
  createEditorPageServices,
  flushEditorAutosaveIfNeeded,
  loadEditorPageDefaults,
  resolveEditorPageSessionSeed,
} from './runtime';

async function flushRuntimeDefaultsWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createController() {
  return {
    autosaveService: null,
    dispose: vi.fn(),
    exportDocument: vi.fn(() => ({ version: 1 })),
    loadDocument: vi.fn(async () => undefined),
    openImage: vi.fn(async () => undefined),
  };
}

function createAutosaveService() {
  return {
    activate: vi.fn(),
    dispose: vi.fn(),
    flushAutosave: vi.fn(async (produceDocument?: () => unknown) => {
      produceDocument?.();
    }),
    updateContext: vi.fn(),
  };
}

function useEditorPageRuntimeTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    readEditorPageLocationStateMock.mockReturnValue({ assetId: 'asset-1' });
    ensureEditorPageSessionIdMock.mockReturnValue('session-1');
    loadEditorPresetStateMock.mockResolvedValue({
      arrow: { defaultPresetId: 'arrow-default', presets: [] },
      ellipse: { defaultPresetId: 'ellipse-default', presets: [] },
      highlighter: { defaultPresetId: 'highlighter-default', presets: [] },
      palette: {
        sceneBackground: [],
        shapeFill: [],
        shapeStroke: [],
        textBackground: [],
        textColor: [],
      },
      pencil: { defaultPresetId: 'pencil-default', presets: [] },
      sceneBackground: {
        defaultPresetId: 'scene-default',
        presets: [
          {
            id: 'scene-default',
            settings: {
              backgroundColor: '#111111',
              backgroundGradientAngle: 145,
              backgroundGradientFrom: '#7c2d12',
              backgroundGradientTo: '#f59e0b',
              backgroundImageFit: 'cover',
              backgroundMode: 'gradient',
            },
          },
        ],
      },
      step: { defaultPresetId: 'step-default', presets: [] },
      text: { defaultPresetId: 'text-default', presets: [] },
    });
    loadEditorWorkspaceDefaultsMock.mockResolvedValue({ backgroundColor: '#f2f4f7' });
    waitForEditorControllerCanvasMock.mockResolvedValue(undefined);
  });
}

function verifiesServiceWiring() {
  const controller = createController();
  const autosaveService = createAutosaveService();
  createImageEditorControllerMock.mockReturnValue(controller);
  createEditorSessionAutosaveServiceMock.mockReturnValue(autosaveService);

  const services = createEditorPageServices();

  expect(services.controller).toBe(controller);
  expect(services.autosaveService).toBe(autosaveService);
  expect(services.bootstrapRevision).toBe(0);
  expect(controller.autosaveService).toBe(autosaveService);
}

function verifiesSessionSeed() {
  const seed = resolveEditorPageSessionSeed();

  expect(seed).toEqual({
    locationState: { assetId: 'asset-1' },
    sessionId: 'session-1',
  });
}

async function verifiesDefaultPresetLoading() {
  const hydrateDefaults = vi.fn();
  const hydrateWorkspaceDefaults = vi.fn();
  loadHighlighterSettingsMock.mockResolvedValueOnce({
    borderPresets: [{ id: 'preset-1' }, { id: 'preset-2' }],
    defaultBorderPresetId: 'preset-2',
  });
  loadEditorPresetStateMock.mockResolvedValueOnce({
    arrow: { defaultPresetId: 'arrow-default', presets: [] },
    ellipse: {
      defaultPresetId: 'ellipse-default',
      presets: [{ id: 'ellipse-default', settings: { strokeColor: '#00ff00' } }],
    },
    blur: { defaultPresetId: 'blur-default', presets: [] },
    highlighter: { defaultPresetId: 'highlighter-default', presets: [] },
    palette: {
      sceneBackground: [],
      shapeFill: [],
      shapeStroke: [],
      textBackground: [],
      textColor: [],
    },
    pencil: { defaultPresetId: 'pencil-default', presets: [] },
    sceneBackground: { defaultPresetId: 'scene-default', presets: [] },
    step: { defaultPresetId: 'step-default', presets: [] },
    text: { defaultPresetId: 'text-default', presets: [] },
  });
  loadEditorWorkspaceDefaultsMock.mockResolvedValueOnce({ backgroundColor: '#123456' });

  loadEditorPageDefaults(hydrateDefaults, hydrateWorkspaceDefaults);
  await flushRuntimeDefaultsWork();

  expect(hydrateDefaults).toHaveBeenCalledWith({
    borderPreset: { id: 'preset-2' },
    toolSettings: { ellipse: { strokeColor: '#00ff00' } },
  });
  expect(hydrateWorkspaceDefaults).toHaveBeenCalledWith({ backgroundColor: '#123456' });

  hydrateDefaults.mockClear();
  hydrateWorkspaceDefaults.mockClear();
  loadHighlighterSettingsMock.mockRejectedValueOnce(new Error('storage failed'));
  loadEditorPresetStateMock.mockRejectedValueOnce(new Error('preset storage failed'));
  loadEditorWorkspaceDefaultsMock.mockRejectedValueOnce(new Error('workspace storage failed'));

  loadEditorPageDefaults(hydrateDefaults, hydrateWorkspaceDefaults);
  await flushRuntimeDefaultsWork();

  expect(hydrateDefaults).toHaveBeenCalledWith({ borderPreset: { id: 'default-border' } });
  expect(hydrateWorkspaceDefaults).toHaveBeenCalledWith({ backgroundColor: '#f2f4f7' });
}

async function verifiesConditionalAutosaveFlush() {
  const controller = createController();
  const autosaveService = createAutosaveService();
  const hasImage = vi.fn(() => true);
  createImageEditorControllerMock.mockReturnValue(controller);
  createEditorSessionAutosaveServiceMock.mockReturnValue(autosaveService);
  const services = createEditorPageServices();

  flushEditorAutosaveIfNeeded(services, hasImage);
  await Promise.resolve();

  expect(autosaveService.flushAutosave).toHaveBeenCalledTimes(1);
  expect(controller.exportDocument).toHaveBeenCalledTimes(1);
  expect(hasImage).toHaveBeenCalledTimes(1);

  flushEditorAutosaveIfNeeded(services, () => false);

  expect(autosaveService.flushAutosave).toHaveBeenCalledTimes(1);
}

describe('editor-page.runtime', () => {
  useEditorPageRuntimeTestScope();

  it(
    'creates editor page services and wires autosave ownership into the controller',
    verifiesServiceWiring
  );
  it('resolves session seed from the location-state owner seam', verifiesSessionSeed);
  it(
    'loads editor defaults from the stored border preset and falls back on errors',
    verifiesDefaultPresetLoading
  );
  it(
    'flushes autosave only when the editor currently owns image data',
    verifiesConditionalAutosaveFlush
  );
});
