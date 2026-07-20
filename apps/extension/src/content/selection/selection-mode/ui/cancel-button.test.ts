// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectionModeDom } from './dom-types';
import {
  ensureSelectionModeCancelButton,
  hideSelectionModeCancelButton,
  showSelectionModeCancelButton,
} from './cancel-button';

function createDomFixture(overlayContainer: HTMLElement | null = null): SelectionModeDom {
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

beforeEach(() => {
  document.body.replaceChildren();
});

function registerMountGuardTest() {
  it('skips creation until an overlay container owns the button surface', () => {
    const dom = createDomFixture();

    ensureSelectionModeCancelButton(dom, { cancelSelection: vi.fn(), zIndexBase: 10 });

    expect(dom.cancelButton).toBeNull();
  });
}

function registerVisibilityContractTest() {
  it('creates one cancel button and exposes hide/show visibility controls', () => {
    const overlayContainer = document.createElement('div');
    const dom = createDomFixture(overlayContainer);
    const cancelSelection = vi.fn();

    ensureSelectionModeCancelButton(dom, { cancelSelection, zIndexBase: 10 });
    ensureSelectionModeCancelButton(dom, { cancelSelection, zIndexBase: 20 });
    hideSelectionModeCancelButton(dom);
    showSelectionModeCancelButton(dom);

    expect(overlayContainer.querySelectorAll('.sniptale-selection-cancel-button')).toHaveLength(1);
    expect(dom.cancelButton?.type).toBe('button');
    expect(dom.cancelButton?.style.width).toBe('36px');
    expect(dom.cancelButton?.style.height).toBe('36px');
    expect(dom.cancelButton?.style.display).toBe('');
    expect(dom.cancelButton?.style.placeItems).toBe('center');
    expect(dom.cancelButton?.style.pointerEvents).toBe('auto');
    expect(dom.cancelButton?.querySelector('svg')).toBeNull();
    expect(
      dom.cancelButton?.querySelectorAll('.sniptale-selection-cancel-icon > span')
    ).toHaveLength(2);
    expect(cancelSelection).not.toHaveBeenCalled();
  });
}

function registerPointerOwnershipTest() {
  it('owns pointer events without leaking drag start and routes click to cancel', () => {
    const overlayContainer = document.createElement('div');
    const dom = createDomFixture(overlayContainer);
    const cancelSelection = vi.fn();

    ensureSelectionModeCancelButton(dom, { cancelSelection, zIndexBase: 10 });
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventMouseDown = vi.spyOn(mouseDownEvent, 'preventDefault');
    const stopMouseDown = vi.spyOn(mouseDownEvent, 'stopPropagation');
    const preventClick = vi.spyOn(clickEvent, 'preventDefault');
    const stopClick = vi.spyOn(clickEvent, 'stopPropagation');

    dom.cancelButton?.dispatchEvent(mouseDownEvent);
    dom.cancelButton?.dispatchEvent(clickEvent);

    expect(preventMouseDown).toHaveBeenCalledOnce();
    expect(stopMouseDown).toHaveBeenCalledOnce();
    expect(preventClick).toHaveBeenCalledOnce();
    expect(stopClick).toHaveBeenCalledOnce();
    expect(cancelSelection).toHaveBeenCalledTimes(1);
  });
}

function registerNoopVisibilityTest() {
  it('keeps hide/show no-op paths safe before the button is mounted', () => {
    const dom = createDomFixture(document.createElement('div'));

    hideSelectionModeCancelButton(dom);
    showSelectionModeCancelButton(dom);

    expect(dom.cancelButton).toBeNull();
  });
}

function runCancelButtonSuite() {
  registerMountGuardTest();
  registerVisibilityContractTest();
  registerPointerOwnershipTest();
  registerNoopVisibilityTest();
}

describe('selection-mode cancel button', runCancelButtonSuite);
