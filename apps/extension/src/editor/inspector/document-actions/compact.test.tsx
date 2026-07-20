import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import type { SavePreset } from '../../../contracts/settings';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InspectorCommandParams } from '../compact/inspector/command-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  const runtimeInfo = {
    getContexts: vi.fn(),
    getLastError: vi.fn(),
    getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
    getPlatformInfo: vi.fn(),
    getURL: vi.fn(),
  };

  return {
    ...original,
    browserRuntime: {
      ...runtimeInfo,
      subscribeToMessages: vi.fn(),
    },
    runtimeInfo,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createSavePresets(): SavePreset[] {
  return [
    { enabled: true, id: 'preset-default', name: 'Команда', order: 0, path: 'team' },
    { enabled: true, id: 'preset-archive', name: 'Архив', order: 1, path: 'archive' },
  ];
}

function createCompactDimensionState() {
  return {
    arrowHeadOptions: [],
    arrowModeOptions: [],
    backgroundModeLabel: '',
    backgroundPreviewStyle: {},
    backgroundSummary: '',
    borderPresetOptions: [],
    borderPresets: [],
    browserCanvasModeOptions: [],
    browserContentModeOptions: [],
    browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE },
    canDeleteSelection: false,
    canvasAspectRatio: null,
    canvasSizeDraft: { height: 100, width: 100 },
    canvasSizeLocked: false,
    canvasSizeText: '100 x 100',
    clampGridSize: (value: number) => value,
    cropReady: false,
    defaultImagePresetId: 'preset-default',
    fontOptions: [],
    frameBackgroundImageFitOptions: [],
    frameBackgroundModeOptions: [],
    frameBackgroundPalette: [],
    frameDraft: { ...DEFAULT_EDITOR_FRAME_SETTINGS },
    frameGradientPresets: [],
    frameLayoutModeOptions: [],
    framePaddingSummary: '0 / 0 / 0 / 0',
    gridColorPalette: [],
    gridSizeMax: 64,
    gridSizeMin: 4,
    imageAspectRatio: null,
    imageSizeDraft: { height: 100, width: 100 },
    imageSizeLocked: false,
    imageSizeText: '100 x 100',
    layerAspectRatio: null,
    layerSizeDraft: { height: 100, width: 100 },
    layerSizeLocked: false,
    layerSizeText: '100 x 100',
  };
}

function createCompactInspectorState() {
  return {
    hasImage: true,
    highlightedTool: 'select',
    inspector: 'file',
    inspectorToolSettings: {
      arrow: {},
      highlighter: {},
      pencil: {},
      rectangle: {},
      ellipse: {},
      step: {},
      text: {},
    } as InspectorCommandParams['inspectorToolSettings'],
    isResizableLayerSelection: false,
    layoutModeLabel: '',
  };
}

function createCompactUiState() {
  return {
    recentColors: [],
    savePresets: createSavePresets(),
    selection: { hasSelection: false },
    showDocumentActions: true,
    stepAlphabetOptions: [],
    stepTypeOptions: [],
    textCalloutFormatOptions: [],
    workspace: {
      backgroundColor: '#ffffff',
      gridColor: '#cccccc',
      gridEnabled: false,
      gridSize: 16,
      gridSnapEnabled: false,
      magnetEnabled: false,
    },
    workspaceBackgroundPalette: [],
    workspaceColorError: null,
    workspaceColorMatchesDefault: false,
    workspaceDefaultSavePending: false,
  };
}

function createCompactActionParams() {
  return {
    DimensionInput: () => null,
    applyArrowPatch: () => undefined,
    applyBrushPatch: () => undefined,
    applyGradientPreset: () => undefined,
    applyPreset: () => undefined,
    applyShapePatch: () => undefined,
    applyStepPatch: () => undefined,
    applyTextPatch: () => undefined,
    applyTextStyle: () => undefined,
    applyWorkspaceColor: () => undefined,
    clearBackgroundImage: () => undefined,
    onApplyFrame: () => undefined,
    onCloseDocument: () => undefined,
    onCopyRenderedImage: () => undefined,
    onExportSession: () => undefined,
    onImportSession: () => undefined,
    onOpenImage: () => undefined,
    onPickBackgroundImage: () => undefined,
    onResizeCanvas: () => undefined,
    onResizeImage: () => undefined,
    onResizeLayer: () => undefined,
    onSaveImage: () => undefined,
    onSaveImageAs: () => undefined,
    previewColor: () => undefined,
    renderSavePresetOptions: () => <div>preset options</div>,
    setCanvasSizeDraft: () => undefined,
    setCanvasSizeLocked: () => undefined,
    setFrameDraft: () => undefined,
    setImageSizeDraft: () => undefined,
    setImageSizeLocked: () => undefined,
    setLayerSizeDraft: () => undefined,
    setLayerSizeLocked: () => undefined,
    saveWorkspaceColorAsDefault: () => undefined,
    setUniformPadding: () => undefined,
    syncBrowserFrame: () => undefined,
    toNumber: (value: string, fallback = 0) => Number(value) || fallback,
    updateColor: () => undefined,
    updateLockedDraft: (
      current: { width: number; height: number },
      field: 'width' | 'height',
      nextValue: number
    ) => ({
      ...current,
      [field]: nextValue,
    }),
    updateWorkspace: () => undefined,
  };
}

function createCompactParams(): InspectorCommandParams {
  return {
    ...createCompactDimensionState(),
    ...createCompactInspectorState(),
    ...createCompactUiState(),
    ...createCompactActionParams(),
  } as unknown as InspectorCommandParams;
}

describe('buildFileCompactCommands', () => {
  it('keeps compact file commands in the same order and makes close neutral', async () => {
    const { buildFileCompactCommands } = await import('../compact/inspector/document-sections');
    const commands = buildFileCompactCommands(createCompactParams());

    expect(commands.map((command) => command.id)).toEqual([
      'save-image',
      'save-image-as',
      'copy-png',
      'save-to-folder',
      'image-format',
      'export-session',
      'import-session',
      'open-image',
      'close-file',
    ]);
    expect(commands.at(-1)?.danger).toBe(false);
  }, 10000);

  it('keeps save-to-folder compact content calm by omitting the default preset value', async () => {
    const { buildFileCompactCommands } = await import('../compact/inspector/document-sections');
    const commands = buildFileCompactCommands(createCompactParams());
    const saveToFolderCommand = commands.find((command) => command.id === 'save-to-folder');
    const markup = renderToStaticMarkup(<>{saveToFolderCommand?.content}</>);

    expect(saveToFolderCommand?.value).toBeUndefined();
    expect(markup).toContain('Сохранить в папку');
    expect(markup).not.toContain('Команда');
  });
});
