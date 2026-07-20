// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
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
  createDragFrame: createDragFrameDomMock,
  createFinalElements: createFinalElementsDomMock,
  createHoverElements: createHoverElementsDomMock,
  createOverlayContainer: createOverlayContainerDomMock,
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
  getVisual?: () => ResolvedBorderPresetVisual;
  getMaxSelectionHeight?: () => number;
  getMaxSelectionWidth?: () => number;
  minSelectionSize?: number;
  onCancel?: () => void;
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
    fillOpacity: 15,
    id: 'preset-1',
    inheritCustomCss: false,
    opacity: 100,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 0,
    strokeColor: '#22c55e',
    strokeOpacity: 90,
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
  const onResetToIdle = overrides?.onResetToIdle ?? vi.fn();
  const onSetupSizePanelListeners = overrides?.onSetupSizePanelListeners ?? vi.fn();
  const getMaxSelectionWidth = overrides?.getMaxSelectionWidth ?? vi.fn(() => 1400);
  const getMaxSelectionHeight = overrides?.getMaxSelectionHeight ?? vi.fn(() => 900);
  const getDom = overrides?.getDom ?? (() => dom);
  const getVisual = overrides?.getVisual ?? (() => visual);
  const prepareVisual = overrides?.prepareVisual ?? vi.fn(async () => undefined);

  const runtime = createSelectionModeUiRuntime({
    getDom,
    getVisual,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    minSelectionSize: overrides?.minSelectionSize ?? 100,
    onCancel: onCancel as () => void,
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

    expect(createDragFrameDomMock).toHaveBeenCalledWith(dom, visual, 'rgba(0, 0, 0, 0.35)');
    expect(createHoverElementsDomMock).toHaveBeenCalledWith(dom, visual, 800);
    expect(createOverlayContainerDomMock).toHaveBeenCalledWith(dom, {
      cancelSelection: expect.any(Function),
      zIndexBase: 800,
    });
  });
}

function registerFinalElementsConfigTest() {
  it('passes final-element callbacks and limits through the runtime config', () => {
    const getMaxSelectionWidth = vi.fn(() => 1600);
    const getMaxSelectionHeight = vi.fn(() => 1000);
    const { dom, onConfirm, onResetToIdle, onSetupSizePanelListeners, runtime } =
      createUiRuntimeFixture({
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
