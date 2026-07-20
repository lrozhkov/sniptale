// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { activateEditableElement, clearEditableElementState } from './session';

function createEditableData() {
  return {
    originalContentEditable: 'inherit',
    originalText: 'Original',
  } as any;
}

function createOptions(editingElements = new Map()) {
  return {
    disconnectResizeObserver: vi.fn(),
    editingElements,
    handleChildLinkClick: vi.fn(),
    hideBlockingOverlay: vi.fn(),
    setupResizeObserver: vi.fn(),
    showBlockingOverlay: vi.fn(),
    updateBlockingOverlayShape: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('activates editable elements, removes anchor hrefs, and blocks host clicks', () => {
  const element = document.createElement('a');
  element.href = 'https://example.com';
  element.textContent = 'Link';
  const childLink = document.createElement('a');
  childLink.href = 'https://example.com/child';
  element.appendChild(childLink);
  document.body.appendChild(element);
  const options = createOptions();

  activateEditableElement(element, 'editable-1', createEditableData(), options);

  const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
  element.dispatchEvent(clickEvent);
  childLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  expect(element.contentEditable).toBe('true');
  expect(element.dataset['sniptaleEditableId']).toBe('editable-1');
  expect(element.dataset['sniptaleOriginalHref']).toBe('https://example.com');
  expect(element.hasAttribute('href')).toBe(false);
  expect(clickEvent.defaultPrevented).toBe(true);
  expect(options.showBlockingOverlay).toHaveBeenCalledOnce();
  expect(options.updateBlockingOverlayShape).toHaveBeenCalledWith(element);
  expect(options.setupResizeObserver).toHaveBeenCalledWith(element);
  expect(options.editingElements.get('editable-1')).toEqual(createEditableData());
});

it('clears editable state without hiding overlays when other edits remain', () => {
  const element = document.createElement('a');
  element.dataset['sniptaleEditableId'] = 'editable-1';
  element.dataset['sniptaleOriginalHref'] = 'https://example.com';
  const editingElements = new Map([
    ['editable-1', createEditableData()],
    ['editable-2', createEditableData()],
  ]);
  const options = createOptions(editingElements);

  clearEditableElementState(element, 'editable-1', options);

  expect(element.getAttribute('href')).toBe('https://example.com');
  expect(options.hideBlockingOverlay).not.toHaveBeenCalled();
  expect(options.disconnectResizeObserver).not.toHaveBeenCalled();
  expect(editingElements.has('editable-1')).toBe(false);
});

it('clears editable state and hides overlays when the last element is released', () => {
  const element = document.createElement('div');
  const childLink = document.createElement('a');
  element.appendChild(childLink);
  document.body.appendChild(element);
  const options = createOptions();

  activateEditableElement(element, 'editable-1', createEditableData(), options);
  vi.clearAllMocks();
  clearEditableElementState(element, 'editable-1', options);
  childLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  expect(element.dataset['sniptaleEditableId']).toBeUndefined();
  expect((element as any)._sniptaleClickHandler).toBeUndefined();
  expect(options.hideBlockingOverlay).toHaveBeenCalledOnce();
  expect(options.disconnectResizeObserver).toHaveBeenCalledOnce();
  expect(options.handleChildLinkClick).not.toHaveBeenCalled();
});
