// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { SelectionModeDom } from './dom-types';

const {
  createDragFrameDomMock,
  createFinalElementsDomMock,
  createHoverElementsDomMock,
  createOverlayContainerDomMock,
} = vi.hoisted(() => ({
  createDragFrameDomMock: vi.fn(),
  createFinalElementsDomMock: vi.fn(),
  createHoverElementsDomMock: vi.fn(),
  createOverlayContainerDomMock: vi.fn(),
}));

vi.mock('.', () => ({
  cancelScheduledDragFrameUpdate: vi.fn(),
  cancelScheduledFinalFrameUpdate: vi.fn(),
  createDragFrame: createDragFrameDomMock,
  createFinalElements: createFinalElementsDomMock,
  createHoverElements: createHoverElementsDomMock,
  createOverlayContainer: createOverlayContainerDomMock,
  flushScheduledFinalFrameUpdate: vi.fn(),
  scheduleDragFrameUpdate: vi.fn(),
  scheduleFinalFrameUpdate: vi.fn(),
}));

import { createSelectionModeUiRuntime } from './runtime';

beforeEach(() => {
  vi.clearAllMocks();
});

function createDomFixture(): SelectionModeDom {
  return {
    overlayContainer: null,
    hoverFrame: null,
    scissorsIcon: null,
    hoverSizeLabel: null,
    dragFrame: null,
    dragOverlay: null,
    dragMaskBackground: null,
    dragFrameRafId: null,
    pendingDragRect: null,
    finalFrameRafId: null,
    pendingFinalRect: null,
    finalFrame: null,
    finalOverlay: null,
    sizePanel: null,
    sizeTooltip: null,
    widthInput: null,
    heightInput: null,
    aspectRatioButton: null,
    cancelButton: null,
    dragEventCatcher: null,
  };
}

interface UiRuntimeFixtureOverrides {
  getDom?: () => SelectionModeDom;
  getCaptureAction?: () => 'download_default';
  getSelection?: () => { x: number; y: number; width: number; height: number };
  getVisual?: () => ResolvedBorderPresetVisual;
  getMaxSelectionHeight?: () => number;
  getMaxSelectionWidth?: () => number;
  minSelectionSize?: number;
  onCancel?: () => void;
  onAdjustPadding?: (direction: 'decrease' | 'increase') => void;
  onCaptureActionChange?: (action: CaptureActionType) => void;
  onConfirm?: () => void;
  onResetToIdle?: () => void;
  onSetupSizePanelListeners?: () => void;
  overlayBackground?: string;
  prepareVisual?: () => Promise<void>;
  zIndexBase?: number;
}

function createSelectionVisual(
  overrides: Partial<ResolvedBorderPresetVisual> = {}
): ResolvedBorderPresetVisual {
  return {
    customCss: '',
    customCssStyles: {},
    fillColor: '#22c55e',
    fillCss: '#22c55e',
    id: 'preset-1',
    inheritCustomCss: false,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 0,
    strokeColor: '#22c55e',
    strokeStyle: 'dashed',
    strokeWidth: 4,
    ...overrides,
  };
}

function createUiRuntimeFixture(overrides?: UiRuntimeFixtureOverrides) {
  const initialDom = createDomFixture();
  let dom = initialDom;
  let visual = createSelectionVisual();
  const onConfirm = overrides?.onConfirm ?? vi.fn();
  const onCancel = overrides?.onCancel ?? vi.fn();
  const onAdjustPadding = overrides?.onAdjustPadding ?? vi.fn();
  const onCaptureActionChange = overrides?.onCaptureActionChange ?? vi.fn();
  const onResetToIdle = overrides?.onResetToIdle ?? vi.fn();
  const onSetupSizePanelListeners = overrides?.onSetupSizePanelListeners ?? vi.fn();
  const getMaxSelectionWidth = overrides?.getMaxSelectionWidth ?? vi.fn(() => 1400);
  const getMaxSelectionHeight = overrides?.getMaxSelectionHeight ?? vi.fn(() => 900);
  const getDom = overrides?.getDom ?? (() => dom);
  const getVisual = overrides?.getVisual ?? (() => visual);
  const prepareVisual = overrides?.prepareVisual ?? vi.fn(async () => undefined);

  const runtime = createSelectionModeUiRuntime({
    getCaptureAction: overrides?.getCaptureAction ?? (() => 'download_default'),
    getDom,
    getSelection: overrides?.getSelection ?? (() => ({ x: 1, y: 2, width: 300, height: 200 })),
    getVisual,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    minSelectionSize: overrides?.minSelectionSize ?? 100,
    onCancel: onCancel as () => void,
    onAdjustPadding,
    onCaptureActionChange,
    onConfirm: onConfirm as () => void,
    onResetToIdle: onResetToIdle as () => void,
    onSetupSizePanelListeners: onSetupSizePanelListeners as () => void,
    overlayBackground: overrides?.overlayBackground ?? 'rgba(0, 0, 0, 0.35)',
    prepareVisual,
    zIndexBase: overrides?.zIndexBase ?? 800,
  });

  return {
    dom,
    initialDom,
    getDom,
    getVisual,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    onCancel,
    onAdjustPadding,
    onCaptureActionChange,
    onConfirm,
    onResetToIdle,
    onSetupSizePanelListeners,
    prepareVisual,
    runtime,
    setDom: (nextDom: typeof dom) => {
      dom = nextDom;
    },
    setVisual: (nextVisual: typeof visual) => {
      visual = nextVisual;
    },
  };
}

function registerDomDelegationTest() {
  it('delegates drag, hover, and overlay creation to the dom seam', () => {
    const { dom, runtime } = createUiRuntimeFixture();
    const visual = createSelectionVisual();

    runtime.createDragFrame();
    runtime.createHoverElements();
    runtime.createOverlayContainer();

    expect(createDragFrameDomMock).toHaveBeenCalledWith(dom, visual);
    expect(createHoverElementsDomMock).toHaveBeenCalledWith(dom, visual, 800);
    expect(createOverlayContainerDomMock).toHaveBeenCalledWith(dom, {
      cancelSelection: expect.any(Function),
      overlayBackground: 'rgba(0, 0, 0, 0.35)',
      zIndexBase: 800,
    });
  });
}

function registerFinalElementsConfigTest() {
  it('passes final-element callbacks and limits through the runtime config', () => {
    const getMaxSelectionWidth = vi.fn(() => 1600);
    const getMaxSelectionHeight = vi.fn(() => 1000);
    const {
      dom,
      onAdjustPadding,
      onCaptureActionChange,
      onCancel,
      onConfirm,
      onResetToIdle,
      onSetupSizePanelListeners,
      runtime,
    } = createUiRuntimeFixture({
      getMaxSelectionHeight,
      getMaxSelectionWidth,
      minSelectionSize: 120,
      overlayBackground: 'rgba(255, 255, 255, 0.1)',
      zIndexBase: 900,
    });

    runtime.createFinalElements();

    expect(createFinalElementsDomMock).toHaveBeenCalledWith(dom, {
      zIndexBase: 900,
      overlayBackground: 'rgba(255, 255, 255, 0.1)',
      visual: createSelectionVisual(),
      minSelectionSize: 120,
      getMaxSelectionWidth,
      getMaxSelectionHeight,
      getCaptureAction: expect.any(Function),
      getSelection: expect.any(Function),
      onAdjustPadding,
      onCaptureActionChange,
      onCancel,
      onConfirm,
      onResetToIdle,
      onSetupSizePanelListeners,
    });
  });
}

function registerLatestDomTest() {
  it('reads the latest dom owner when a new selection session replaces the dom shell', () => {
    const { initialDom, runtime, setDom, setVisual } = createUiRuntimeFixture();
    const nextDom: SelectionModeDom = {
      ...initialDom,
      overlayContainer: document.createElement('div'),
    };
    const nextVisual = createSelectionVisual({ strokeColor: '#e879f9', strokeWidth: 3 });

    runtime.createOverlayContainer();
    setDom(nextDom);
    setVisual(nextVisual);
    runtime.createHoverElements();

    expect(createOverlayContainerDomMock).toHaveBeenCalledWith(initialDom, {
      cancelSelection: expect.any(Function),
      overlayBackground: 'rgba(0, 0, 0, 0.35)',
      zIndexBase: 800,
    });
    expect(createHoverElementsDomMock).toHaveBeenCalledWith(nextDom, nextVisual, 800);
  });
}

function registerCancelCallbackTest() {
  it('passes the cancel callback to the overlay container seam', () => {
    const onCancel = vi.fn();
    const { dom, runtime } = createUiRuntimeFixture({ onCancel });

    runtime.createOverlayContainer();
    const overlayOptions = createOverlayContainerDomMock.mock.calls[0]?.[1];
    overlayOptions.cancelSelection();

    expect(createOverlayContainerDomMock).toHaveBeenCalledWith(dom, {
      cancelSelection: expect.any(Function),
      overlayBackground: 'rgba(0, 0, 0, 0.35)',
      zIndexBase: 800,
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
}

function registerPrepareTest() {
  it('prepares the latest preset visual before the selection shell is created', async () => {
    const prepareVisual = vi.fn(async () => undefined);
    const { runtime } = createUiRuntimeFixture({ prepareVisual });

    await runtime.prepare();

    expect(prepareVisual).toHaveBeenCalledTimes(1);
  });
}

function runUiRuntimeSuite() {
  registerDomDelegationTest();
  registerFinalElementsConfigTest();
  registerLatestDomTest();
  registerCancelCallbackTest();
  registerPrepareTest();
}

describe('selection-mode ui runtime', runUiRuntimeSuite);
