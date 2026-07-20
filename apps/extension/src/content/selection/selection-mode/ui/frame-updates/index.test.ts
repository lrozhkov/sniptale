// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectionModeDom } from '../dom-types';

const {
  calculateContentSizeTooltipPositionMock,
  setContentSizeTooltipPositionMock,
  syncContentSizeTooltipValuesMock,
} = vi.hoisted(() => ({
  calculateContentSizeTooltipPositionMock: vi.fn(() => ({ left: 12, top: 34 })),
  setContentSizeTooltipPositionMock: vi.fn(),
  syncContentSizeTooltipValuesMock: vi.fn(),
}));

vi.mock('@sniptale/ui/content-size-tooltip/core', () => ({
  CONTENT_SIZE_TOOLTIP_DIMENSIONS: { width: 430, height: 46 },
  ContentSizeTooltipCopy: undefined,
  calculateContentSizeTooltipPosition: calculateContentSizeTooltipPositionMock,
  mergeStyleRecords: vi.fn(),
}));

vi.mock('@sniptale/ui/content-size-tooltip/dom', () => ({
  ContentSizeTooltipDom: undefined,
  createContentSizeTooltipDom: vi.fn(),
  setContentSizeTooltipPosition: setContentSizeTooltipPositionMock,
  syncContentSizeTooltipAspectRatioButtonState: vi.fn(),
  syncContentSizeTooltipValues: syncContentSizeTooltipValuesMock,
}));

import { cleanupSelectionModeDom, resetFinalElements, updateDragFrame, updateFinalFrame } from '.';

function createDom(): SelectionModeDom {
  const dragFrame = document.createElement('div');
  const finalFrame = document.createElement('div');
  const finalOverlay = document.createElement('div');
  const sizePanel = document.createElement('div');
  const widthInput = document.createElement('input');
  const heightInput = document.createElement('input');
  const aspectRatioButton = document.createElement('button');
  const cancelButton = document.createElement('button');
  const overlayContainer = document.createElement('div');
  const sizeTooltip = document.createElement('div');
  const topShade = document.createElement('div');
  const bottomShade = document.createElement('div');
  const leftShade = document.createElement('div');
  const rightShade = document.createElement('div');

  topShade.className = 'sniptale-shade-top';
  bottomShade.className = 'sniptale-shade-bottom';
  leftShade.className = 'sniptale-shade-left';
  rightShade.className = 'sniptale-shade-right';
  finalOverlay.append(topShade, bottomShade, leftShade, rightShade);

  widthInput.min = '10';
  widthInput.max = '900';
  heightInput.min = '10';
  heightInput.max = '700';
  aspectRatioButton.setAttribute('aria-pressed', 'true');
  cancelButton.style.display = 'none';

  overlayContainer.append(cancelButton, dragFrame, finalFrame, finalOverlay, sizePanel);
  document.body.appendChild(overlayContainer);

  return {
    overlayContainer,
    hoverFrame: null,
    scissorsIcon: document.createElement('div'),
    hoverSizeLabel: null,
    dragFrame,
    finalFrame,
    finalOverlay,
    sizePanel,
    sizeTooltip: sizeTooltip as never,
    widthInput,
    heightInput,
    aspectRatioButton,
    cancelButton,
    dragEventCatcher: document.createElement('div'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
});

function registerDragFrameUpdateTest() {
  it('creates and reuses the drag-size label while updating frame geometry', () => {
    const dom = createDom();

    updateDragFrame(dom, { x: 11.2, y: 20.4, width: 200.6, height: 100.4 });
    updateDragFrame(dom, { x: 12, y: 22, width: 150.2, height: 90.8 });

    const labels = dom.dragFrame?.querySelectorAll('.sniptale-drag-size-label') ?? [];
    expect(dom.dragFrame?.style.left).toBe('12px');
    expect(dom.dragFrame?.style.top).toBe('22px');
    expect(dom.dragFrame?.style.width).toBe('150.2px');
    expect(dom.dragFrame?.style.height).toBe('90.8px');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe('150 × 91');
  });
}

function registerFinalFrameUpdateTest() {
  it('syncs tooltip values, frame geometry, overlay shades, and panel position', () => {
    const dom = createDom();

    updateFinalFrame(dom, { x: 100, y: 120, width: 240, height: 160 });

    expect(dom.finalFrame?.style.left).toBe('100px');
    expect(dom.finalFrame?.style.top).toBe('120px');
    expect(dom.finalFrame?.style.width).toBe('240px');
    expect(dom.finalFrame?.style.height).toBe('160px');
    expect(syncContentSizeTooltipValuesMock).toHaveBeenCalledWith({
      tooltip: dom.sizeTooltip,
      width: 240,
      height: 160,
      maintainAspectRatio: true,
      widthMin: 10,
      widthMax: 900,
      heightMin: 10,
      heightMax: 700,
    });
    expect(calculateContentSizeTooltipPositionMock).toHaveBeenCalledWith({
      anchorRect: { x: 100, y: 120, width: 240, height: 160 },
    });
    expect(setContentSizeTooltipPositionMock).toHaveBeenCalledWith(dom.sizePanel, {
      left: 12,
      top: 34,
    });
    expect(dom.finalOverlay?.querySelector('.sniptale-shade-top')?.getAttribute('style')).toContain(
      'height: 120px'
    );
    expect(
      dom.finalOverlay?.querySelector('.sniptale-shade-right')?.getAttribute('style')
    ).toContain('width: 940px');
  });
}

function registerMissingDomGuardTest() {
  it('returns early when final-frame dependencies are missing', () => {
    const dom = createDom();
    dom.sizePanel = null;

    updateFinalFrame(dom, { x: 10, y: 20, width: 30, height: 40 });

    expect(syncContentSizeTooltipValuesMock).not.toHaveBeenCalled();
    expect(setContentSizeTooltipPositionMock).not.toHaveBeenCalled();
  });
}

function registerCleanupTests() {
  it('removes final elements and fully clears the owned DOM references', () => {
    const dom = createDom();
    const cancelButton = dom.cancelButton;

    resetFinalElements(dom);

    expect(dom.finalFrame).toBeNull();
    expect(dom.finalOverlay).toBeNull();
    expect(dom.sizePanel).toBeNull();
    expect(dom.sizeTooltip).toBeNull();
    expect(dom.widthInput).toBeNull();
    expect(dom.heightInput).toBeNull();
    expect(dom.aspectRatioButton).toBeNull();
    expect(cancelButton).not.toBeNull();
    if (!cancelButton) {
      throw new Error('Expected cancel button fixture');
    }
    expect(cancelButton.isConnected).toBe(true);
    expect(cancelButton.style.display).toBe('');

    cleanupSelectionModeDom(dom);

    expect(dom.overlayContainer).toBeNull();
    expect(dom.dragFrame).toBeNull();
    expect(dom.scissorsIcon).toBeNull();
    expect(dom.cancelButton).toBeNull();
    expect(dom.dragEventCatcher).toBeNull();
  });
}

describe('selection-mode ui frame updates', () => {
  registerDragFrameUpdateTest();
  registerFinalFrameUpdateTest();
  registerMissingDomGuardTest();
  registerCleanupTests();
});
