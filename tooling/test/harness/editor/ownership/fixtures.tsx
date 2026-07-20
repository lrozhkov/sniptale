import { vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_TOOL_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../../../apps/extension/src/features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../../apps/extension/src/composition/persistence/highlighter';
import { DEFAULT_EDITOR_LAYER_EFFECTS_STATE } from '../../../../../apps/extension/src/editor/inspector/layer-effects/shared';
import * as fixtureOptions from './options';
import { createFixtureLayer } from './fixtures.shared';
import { createInspectorCommandSurfaceActionMocks } from './fixtures.actions';

function createInspectorCommandActionMocks() {
  return {
    applyArrowPatch: vi.fn(),
    applyLinePatch: vi.fn(),
    applyBrushPatch: vi.fn(),
    applyBlurPatch: vi.fn(),
    applyPreset: vi.fn(),
    applyShapePatch: vi.fn(),
    applyRichShapePatch: vi.fn(),
    applyStepPatch: vi.fn(),
    setPencilShapeCorrection: vi.fn(),
    applyTextPatch: vi.fn(),
    applyTextStyle: vi.fn(),
    insertOrUpdateBrowserFrame: vi.fn(async () => undefined),
    commitPendingBrowserFrame: vi.fn(async () => undefined),
    commitPendingSelectionSettings: vi.fn(),
    previewArrowPatch: vi.fn(),
    previewLinePatch: vi.fn(),
    previewBrushPatch: vi.fn(),
    previewBrowserFrame: vi.fn(async () => undefined),
    previewShapePatch: vi.fn(),
    previewBlurPatch: vi.fn(),
    previewStepPatch: vi.fn(),
    previewTextPatch: vi.fn(),
    ...createInspectorCommandSurfaceActionMocks(),
  };
}

function createInspectorCommandDisplayState() {
  return {
    DimensionInput: () => null,
    backgroundModeLabel: 'Solid',
    backgroundPreviewStyle: {},
    backgroundSummary: 'Solid',
    canDeleteSelection: true,
    canvasAspectRatio: 16 / 9,
    canvasSize: { height: 720, width: 1280 },
    canvasSizeDraft: { height: 720, width: 1280 },
    canvasSizeLocked: false,
    canvasSizeText: '1280 x 720',
    cropReady: true,
    cropSelection: null,
    defaultImagePresetId: 'preset-default',
    hasImage: true,
    highlightedTool: 'crop',
    imageAspectRatio: 16 / 9,
    imageSizeDraft: { height: 720, width: 1280 },
    imageSizeLocked: true,
    imageSizeText: '1280 x 720',
    inspector: 'tool',
    isResizableLayerSelection: false,
    layerEffectsState: DEFAULT_EDITOR_LAYER_EFFECTS_STATE,
    layerAspectRatio: 1,
    layerSizeDraft: { height: 120, width: 160 },
    layerSizeLocked: false,
    layerSizeText: '160 x 120',
    layers: [createFixtureLayer()],
    layoutModeLabel: 'Solid',
    recentColors: ['#111111'],
    scenePresetHeader: null,
    showDocumentActions: false,
    toolPresetHeader: null,
    workspaceColorError: null,
    workspaceColorMatchesDefault: false,
    workspaceDefaultSavePending: false,
  };
}

function createInspectorCommandOptions() {
  return {
    arrowVariantOptions: [...fixtureOptions.ARROW_VARIANT_OPTIONS],
    arrowHeadOptions: [
      { label: 'None', value: 'none' as const },
      { label: 'Triangle', value: 'triangle' as const },
      { label: 'Open', value: 'open' as const },
      { label: 'Block', value: 'block' as const },
    ],
    arrowModeOptions: [...fixtureOptions.ARROW_MODE_OPTIONS],
    arrowTypeOptions: [...fixtureOptions.ARROW_TYPE_OPTIONS],
    lineStyleOptions: [...fixtureOptions.LINE_STYLE_OPTIONS],
    lineCornerOptions: [...fixtureOptions.LINE_CORNER_OPTIONS],
    lineFillModeOptions: [...fixtureOptions.LINE_FILL_MODE_OPTIONS],
    lineRoughFillStyleOptions: [...fixtureOptions.LINE_ROUGH_FILL_STYLE_OPTIONS],
    borderPresetOptions: [{ label: 'Default', value: DEFAULT_BORDER_PRESET.id }],
    borderPresets: [DEFAULT_BORDER_PRESET],
    blurTypeOptions: [{ label: 'Gaussian', value: 'gaussian' as const }],
    browserAppearanceOptions: [{ label: 'Window', value: 'window' as const }],
    browserCanvasModeOptions: [{ label: 'Resize', value: 'resize' as const }],
    browserContentModeOptions: [{ label: 'Fit', value: 'fit-content' as const }],
    fontOptions: [{ label: 'Sans', value: 'sans' as const }],
    frameBackgroundImageFitOptions: [{ label: 'Cover', value: 'cover' as const }],
    frameBackgroundModeOptions: [{ label: 'Color', value: 'color' as const }],
    frameBackgroundPalette: ['#ffffff'],
    frameGradientPresets: [
      { id: 'test-gradient', label: 'Test gradient', angle: 90, from: '#111111', to: '#ffffff' },
    ],
    frameLayoutModeOptions: [{ label: 'Expand', value: 'expand-canvas' as const }],
    gridColorPalette: ['#d1d5db'],
    gridPalette: ['#d1d5db'],
    savePresets: [{ enabled: true, id: 'preset-default', name: 'Team', order: 0, path: 'team' }],
    stepAlphabetOptions: [{ label: 'Latin', value: 'latin' as const }],
    stepTypeOptions: [{ label: 'Number', value: 'number' as const }],
    shapeFillPalette: ['#00000000'],
    shapeStrokePalette: ['#ffffff'],
    textCalloutFormatOptions: [{ label: 'Bubble', value: 'bubble' as const }],
    textBackgroundPalette: ['#111111'],
    textColorPalette: ['#ffffff'],
    workspaceBackgroundPalette: ['#ffffff'],
  };
}

function createInspectorCommandRuntimeHelpers() {
  return {
    clampGridSize: (value: number) => value,
    previewColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
    renderSavePresetOptions: vi.fn(() => <div>Preset options</div>),
    toNumber: (v: string, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f),
    updateColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
    updateLockedDraft: vi.fn((state: { width: number; height: number }) => state),
  };
}

export function createInspectorCommandParams() {
  return {
    ...createInspectorCommandActionMocks(),
    ...createInspectorCommandDisplayState(),
    ...createInspectorCommandOptions(),
    ...createInspectorCommandRuntimeHelpers(),
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
    framePaddingSummary: '12 / 12 / 12 / 12',
    gridSizeMax: 64,
    gridSizeMin: 4,
    inspectorToolSettings: DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET),
    selection: {
      hasSelection: true,
      selectedObjectHeight: 120,
      selectedObjectCount: 1,
      selectedObjectId: 'layer-1',
      selectedObjectIds: ['layer-1'],
      selectedObjectType: 'rectangle',
      selectedObjectWidth: 160,
    },
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
  };
}

export function createToolsPanelProps(overrides: Record<string, unknown> = {}) {
  const params = createInspectorCommandParams();
  return {
    ...createToolsPanelActionProps(params),
    ...createToolsPanelViewProps(params),
    ...overrides,
  };
}

function createToolsPanelActionProps(params: ReturnType<typeof createInspectorCommandParams>) {
  return {
    applyPreset: params.applyPreset,
    setPencilShapeCorrection: vi.fn(),
    saveShapeAsHighlighterPreset: params.saveShapeAsHighlighterPreset,
    applyArrowPatch: params.applyArrowPatch,
    applyLinePatch: params.applyLinePatch,
    applyBrushPatch: params.applyBrushPatch,
    applyShapePatch: params.applyShapePatch,
    applyRichShapePatch: params.applyRichShapePatch,
    applyBlurPatch: params.applyBlurPatch,
    applyStepPatch: params.applyStepPatch,
    applyTextPatch: params.applyTextPatch,
    applyTextStyle: params.applyTextStyle,
    previewBrushPatch: params.previewBrushPatch,
    previewShapePatch: params.previewShapePatch,
    previewBlurPatch: params.previewBlurPatch,
    previewArrowPatch: params.previewArrowPatch,
    previewLinePatch: params.previewLinePatch,
    previewTextPatch: params.previewTextPatch,
    previewStepPatch: params.previewStepPatch,
    commitPendingSelectionSettings: params.commitPendingSelectionSettings,
    arrangeSelection: params.arrangeSelection,
    setLayerSizeDraft: vi.fn(),
    setLayerSizeLocked: vi.fn(),
    toNumber: params.toNumber,
    previewColor: params.previewColor,
    updateColor: params.updateColor,
  };
}

function createToolsPanelViewProps(params: ReturnType<typeof createInspectorCommandParams>) {
  return {
    arrowVariantOptions: params.arrowVariantOptions,
    arrowTypeOptions: params.arrowTypeOptions,
    arrowHeadOptions: params.arrowHeadOptions,
    arrowModeOptions: params.arrowModeOptions,
    lineStyleOptions: params.lineStyleOptions,
    lineCornerOptions: params.lineCornerOptions,
    lineFillModeOptions: params.lineFillModeOptions,
    lineRoughFillStyleOptions: params.lineRoughFillStyleOptions,
    borderPresetOptions: params.borderPresetOptions,
    blurTypeOptions: params.blurTypeOptions,
    canDeleteSelection: true,
    cropReady: true,
    fontOptions: params.fontOptions,
    frameBackgroundPalette: params.frameBackgroundPalette,
    highlightedTool: 'crop',
    inspectorToolSettings: params.inspectorToolSettings,
    isResizableLayerSelection: false,
    layerAspectRatio: 1,
    layerSizeDraft: { height: 120, width: 160 },
    layerSizeLocked: false,
    layerSizeText: '160 x 120',
    recentColors: params.recentColors,
    richShapeSelection: null,
    selection: params.selection,
    selectionDeleteIcon: <span>del</span>,
    selectionDuplicateIcon: <span>dup</span>,
    shapeFillPalette: params.shapeFillPalette,
    shapeStrokePalette: params.shapeStrokePalette,
    stepAlphabetOptions: params.stepAlphabetOptions,
    stepTypeOptions: params.stepTypeOptions,
    textBackgroundPalette: params.textBackgroundPalette,
    textCalloutFormatOptions: params.textCalloutFormatOptions,
    textColorPalette: params.textColorPalette,
    toolPresetHeader: null,
  };
}

export function createContentProps(overrides: Record<string, unknown> = {}) {
  const params = createInspectorCommandParams();
  return {
    ...params,
    confirmDialog: null,
    copyRenderedImageDisabledReason: null,
    defaultImagePresetId: 'preset-default',
    hasImage: true,
    onConfirmDialogCancel: vi.fn(),
    onConfirmDialogConfirm: vi.fn(),
    richShapeSelection: null,
    scenePresetHeader: null,
    savePresetPickerOpen: false,
    setSavePresetPickerOpen: vi.fn(),
    showDocumentActions: false,
    showViewportMetrics: true,
    toolPresetHeader: null,
    ...overrides,
  };
}
