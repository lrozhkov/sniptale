// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';

const { createSelectionModeFinalElementsMock } = vi.hoisted(() => ({
  createSelectionModeFinalElementsMock: vi.fn(),
}));

vi.mock('./final-elements', () => ({
  createSelectionModeFinalElements: createSelectionModeFinalElementsMock,
}));

import {
  createDragEventCatcher,
  createDragFrame,
  createFinalElements,
  removeDragEventCatcher,
} from '.';
import type { SelectionModeDom } from './dom-types';

function createDomFixture(): SelectionModeDom {
  const overlayContainer = document.createElement('div');
  document.body.appendChild(overlayContainer);

  return {
    overlayContainer,
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

function createSelectionVisual(
  overrides: Partial<ResolvedBorderPresetVisual> = {}
): ResolvedBorderPresetVisual {
  return {
    customCss: '',
    customCssStyles: { outlineOffset: '4px' },
    fillColor: '#22c55e',
    fillOpacity: 24,
    id: 'preset-1',
    inheritCustomCss: true,
    opacity: 70,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 10,
    shadow: 30,
    strokeColor: '#ff00aa',
    strokeOpacity: 75,
    strokeStyle: 'dotted',
    strokeWidth: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('selection-mode ui primitives', () => {
  it('creates the drag frame once and keeps it attached to the overlay container', () => {
    const dom = createDomFixture();
    const visual = createSelectionVisual();

    createDragFrames(dom, visual);
    expectDragFrameStyles(dom);
  });

  it('creates and removes the drag event catcher idempotently', () => {
    const dom = createDomFixture();

    createDragEventCatcher(dom, 1000);
    createDragEventCatcher(dom, 1200);

    expect(dom.dragEventCatcher).not.toBeNull();
    expect(
      dom.overlayContainer?.querySelectorAll('.sniptale-selection-drag-event-catcher')
    ).toHaveLength(1);
    expect(dom.dragEventCatcher?.style.zIndex).toBe('999');

    removeDragEventCatcher(dom);

    expect(dom.dragEventCatcher).toBeNull();
    expect(
      dom.overlayContainer?.querySelector('.sniptale-selection-drag-event-catcher')
    ).toBeNull();
  });

  it('delegates final element construction to the owner-local final-elements seam', () => {
    const dom = createDomFixture();
    const cancelButton = document.createElement('button');
    const visual = createSelectionVisual({ strokeColor: '#0ea5e9', strokeWidth: 2 });
    const options = createFinalElementOptions(visual);
    dom.cancelButton = cancelButton;

    createFinalElements(dom, options);

    expect(createSelectionModeFinalElementsMock).toHaveBeenCalledWith(dom, options);
    expect(cancelButton.style.display).toBe('none');
  });
});

function createFinalElementOptions(visual: ResolvedBorderPresetVisual) {
  return {
    getMaxSelectionHeight: () => 800,
    getMaxSelectionWidth: () => 1200,
    minSelectionSize: 100,
    onConfirm: vi.fn(),
    onResetToIdle: vi.fn(),
    onSetupSizePanelListeners: vi.fn(),
    overlayBackground: 'rgba(0, 0, 0, 0.5)',
    visual,
    zIndexBase: 300,
  };
}

function createDragFrames(dom: SelectionModeDom, visual: ResolvedBorderPresetVisual) {
  createDragFrame(dom, visual, 'rgba(0, 0, 0, 0.4)');
  createDragFrame(
    dom,
    createSelectionVisual({ strokeColor: '#000', strokeWidth: 5 }),
    'rgba(255, 255, 255, 0.2)'
  );
}

function expectDragFrameStyles(dom: SelectionModeDom) {
  expect(dom.dragFrame).not.toBeNull();
  expect(dom.overlayContainer?.querySelectorAll('.sniptale-selection-drag-frame')).toHaveLength(1);
  expect(dom.dragFrame?.style.border).toContain('3px dotted');
  expect(dom.dragFrame?.style.backgroundColor).toBe('rgba(34, 197, 94, 0.24)');
  expect(dom.dragFrame?.style.borderRadius).toBe('10px');
  expect(dom.dragFrame?.style.boxShadow).toContain('rgba(0, 0, 0, 0.4)');
}
