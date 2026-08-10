// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createContentSizeTooltipDomMock,
  enhanceSelectionModeToolbarMock,
  getSelectionModeSizePanelCopyMock,
} = vi.hoisted(() => ({
  createContentSizeTooltipDomMock: vi.fn(),
  enhanceSelectionModeToolbarMock: vi.fn(),
  getSelectionModeSizePanelCopyMock: vi.fn(),
}));

vi.mock('@sniptale/ui/content-size-tooltip/dom', () => ({
  ContentSizeTooltipDom: undefined,
  createContentSizeTooltipDom: createContentSizeTooltipDomMock,
  setContentSizeTooltipPosition: vi.fn(),
  syncContentSizeTooltipAspectRatioButtonState: vi.fn(),
  syncContentSizeTooltipValues: vi.fn(),
  createContentSizeTooltipDivider: vi.fn(() => document.createElement('span')),
}));

vi.mock('./toolbar', () => ({
  enhanceSelectionModeToolbar: enhanceSelectionModeToolbarMock,
  syncSelectionToolbarPaddingState: vi.fn(),
}));

vi.mock('../constants', () => ({
  getSelectionModeSizePanelCopy: getSelectionModeSizePanelCopyMock,
}));

import { createSelectionModeFinalElements } from '.';
import type { SelectionModeDom } from '../dom-types';
import type { ResolvedBorderPresetVisual } from '../../../../../features/highlighter/style';

function createDomFixture(): SelectionModeDom {
  const overlayContainer = document.createElement('div');
  document.body.appendChild(overlayContainer);

  return {
    overlayContainer,
    hoverFrame: null,
    scissorsIcon: document.createElement('div'),
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

function createTooltipFixture() {
  return {
    root: document.createElement('div'),
    actions: document.createElement('div'),
    widthInput: document.createElement('input'),
    heightInput: document.createElement('input'),
    widthDecreaseButton: document.createElement('button'),
    widthIncreaseButton: document.createElement('button'),
    heightDecreaseButton: document.createElement('button'),
    heightIncreaseButton: document.createElement('button'),
    aspectRatioButton: document.createElement('button'),
    cancelButton: document.createElement('button'),
    confirmButton: document.createElement('button'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  getSelectionModeSizePanelCopyMock.mockReturnValue({ confirm: 'save' });
});

function createFinalElementsOptions(overrides?: {
  onCancel?: () => void;
  onConfirm?: () => void;
  onResetToIdle?: () => void;
  onSetupSizePanelListeners?: () => void;
}) {
  const onConfirm = overrides?.onConfirm ?? vi.fn();
  const onCancel = overrides?.onCancel ?? vi.fn();
  const onResetToIdle = overrides?.onResetToIdle ?? vi.fn();
  const onSetupSizePanelListeners = overrides?.onSetupSizePanelListeners ?? vi.fn();

  return {
    zIndexBase: 600,
    overlayBackground: 'rgba(0, 0, 0, 0.4)',
    minSelectionSize: 100,
    getMaxSelectionWidth: () => 1280,
    getMaxSelectionHeight: () => 720,
    getCaptureAction: () => 'download_default' as const,
    getSelection: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    onAdjustPadding: vi.fn(),
    onCaptureActionChange: vi.fn(),
    onCancel: onCancel as () => void,
    onConfirm: onConfirm as () => void,
    onResetToIdle: onResetToIdle as () => void,
    onSetupSizePanelListeners: onSetupSizePanelListeners as () => void,
    visual: createSelectionVisual(),
  };
}

function createSelectionVisual(): ResolvedBorderPresetVisual {
  return {
    customCss: '',
    customCssStyles: {},
    fillColor: '#22c55e',
    fillCss: '#22c55e',
    id: 'preset-1',
    inheritCustomCss: false,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 30,
    strokeColor: '#38bdf8',
    strokeStyle: 'solid',
    strokeWidth: 2,
  };
}

function expectFinalElementsShape(
  dom: SelectionModeDom,
  tooltip: ReturnType<typeof createTooltipFixture>
) {
  expect(createContentSizeTooltipDomMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mountInto: dom.overlayContainer,
      widthMin: 100,
      widthMax: 1280,
      heightMin: 100,
      heightMax: 720,
    })
  );
  expect(dom.finalOverlay?.querySelectorAll('.sniptale-shade')).toHaveLength(4);
  expect(dom.finalOverlay?.querySelector('.sniptale-selection-event-catcher')).not.toBeNull();
  expect(dom.finalFrame?.querySelectorAll('.sniptale-resize-handle')).toHaveLength(8);
  expect(dom.finalOverlay?.parentElement).toBe(dom.overlayContainer);
  expect(dom.finalFrame?.parentElement).toBe(dom.overlayContainer);
  expect(dom.finalOverlay?.nextElementSibling).toBe(dom.finalFrame);
  expect(dom.sizeTooltip).toBe(tooltip);
  expect(dom.sizePanel).toBe(tooltip.root);
  expect(dom.widthInput).toBe(tooltip.widthInput);
  expect(dom.heightInput).toBe(tooltip.heightInput);
  expect(dom.aspectRatioButton).toBe(tooltip.aspectRatioButton);
  expect(dom.scissorsIcon).toBeNull();
}

function triggerFinalElementsActions(
  dom: SelectionModeDom,
  tooltip: ReturnType<typeof createTooltipFixture>
) {
  tooltip.cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  tooltip.confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  dom.finalOverlay
    ?.querySelector<HTMLElement>('.sniptale-selection-event-catcher')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('selection-mode final elements', () => {
  it('returns early when no overlay container exists', () => {
    const dom = {
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

    createSelectionModeFinalElements(dom, {} as never);

    expect(createContentSizeTooltipDomMock).not.toHaveBeenCalled();
  });

  it('creates overlay, frame, resize handles, and tooltip-backed controls', () => {
    const dom = createDomFixture();
    const tooltip = createTooltipFixture();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onResetToIdle = vi.fn();
    const onSetupSizePanelListeners = vi.fn();
    const options = createFinalElementsOptions({
      onConfirm,
      onCancel,
      onResetToIdle,
      onSetupSizePanelListeners,
    });

    createSelectionModeFinalElements(dom, options);

    expectFinalElementsShape(dom, tooltip);
    expect(onSetupSizePanelListeners).toHaveBeenCalledTimes(1);
    triggerFinalElementsActions(dom, tooltip);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onResetToIdle).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
