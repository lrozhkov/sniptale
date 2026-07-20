// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { handleQuickEditKeyDown, handleQuickEditMouseMove } from './events';

function createIframeTarget() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  const innerTarget = iframeDoc.createElement('div');
  innerTarget.textContent = 'Editable text';
  iframeDoc.body.appendChild(innerTarget);
  Object.defineProperty(iframeDoc, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => innerTarget),
  });

  return { iframe, innerTarget };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('uses the inner iframe text node for quick edit hover resolution', () => {
  const { iframe, innerTarget } = createIframeTarget();
  const showHoverOverlay = vi.fn();
  const hideHoverOverlay = vi.fn();

  handleQuickEditMouseMove(
    {
      clientX: 14,
      clientY: 8,
      target: iframe,
      composedPath: () => [iframe],
    } as unknown as MouseEvent,
    {
      cancelEditing: vi.fn(),
      disableDocumentMode: vi.fn(),
      disableRequested: vi.fn(),
      editingElementsSize: () => 0,
      finishEditing: vi.fn(),
      hideHoverOverlay,
      isDocumentModeEnabled: () => false,
      isEnabled: () => true,
      isStyleInspectorModeEnabled: () => false,
      makeElementEditable: vi.fn(),
      showHoverOverlay,
    },
    iframe
  );

  expect(showHoverOverlay).toHaveBeenCalledWith(innerTarget);
  expect(hideHoverOverlay).not.toHaveBeenCalled();
});

it('lets native contenteditable insertion handle spaces when text remains to the right', () => {
  const editable = document.createElement('div');
  editable.className = 'sniptale-editing';
  editable.contentEditable = 'true';
  editable.textContent = 'abc';
  document.body.appendChild(editable);

  const selection = document.getSelection();
  if (!selection) {
    throw new Error('Expected selection');
  }

  const range = document.createRange();
  range.setStart(editable.firstChild ?? editable, 1);
  range.setEnd(editable.firstChild ?? editable, 1);
  selection.removeAllRanges();
  selection.addRange(range);

  const event = new KeyboardEvent('keydown', { key: ' ' });
  const preventDefault = vi.spyOn(event, 'preventDefault');
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: editable,
  });

  handleQuickEditKeyDown(event, {
    cancelEditing: vi.fn(),
    disableDocumentMode: vi.fn(),
    disableRequested: vi.fn(),
    editingElementsSize: () => 1,
    finishEditing: vi.fn(),
    hideHoverOverlay: vi.fn(),
    isDocumentModeEnabled: () => false,
    isEnabled: () => true,
    isStyleInspectorModeEnabled: () => false,
    makeElementEditable: vi.fn(),
    showHoverOverlay: vi.fn(),
  });

  expect(preventDefault).not.toHaveBeenCalled();
  expect(editable.textContent).toBe('abc');
});

it('preserves a trailing space when the caret is already at the end of the editable text', () => {
  const editable = document.createElement('div');
  editable.className = 'sniptale-editing';
  editable.contentEditable = 'true';
  editable.textContent = 'abc';
  document.body.appendChild(editable);

  const selection = document.getSelection();
  if (!selection) {
    throw new Error('Expected selection');
  }

  const range = document.createRange();
  range.setStart(editable.firstChild ?? editable, 3);
  range.setEnd(editable.firstChild ?? editable, 3);
  selection.removeAllRanges();
  selection.addRange(range);

  const event = new KeyboardEvent('keydown', { key: ' ' });
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: editable.firstChild,
  });

  handleQuickEditKeyDown(event, {
    cancelEditing: vi.fn(),
    disableDocumentMode: vi.fn(),
    disableRequested: vi.fn(),
    editingElementsSize: () => 1,
    finishEditing: vi.fn(),
    hideHoverOverlay: vi.fn(),
    isDocumentModeEnabled: () => false,
    isEnabled: () => true,
    isStyleInspectorModeEnabled: () => false,
    makeElementEditable: vi.fn(),
    showHoverOverlay: vi.fn(),
  });

  expect(editable.textContent).toBe('abc\u00A0');
});

it('cancels the active edit on Escape even when the event target is a text node', () => {
  const editable = document.createElement('div');
  editable.className = 'sniptale-editing';
  editable.contentEditable = 'true';
  editable.textContent = 'abc';
  document.body.appendChild(editable);

  const cancelEditing = vi.fn();
  const disableRequested = vi.fn();
  const event = new KeyboardEvent('keydown', { key: 'Escape' });
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: editable.firstChild,
  });

  handleQuickEditKeyDown(event, {
    cancelEditing,
    disableDocumentMode: vi.fn(),
    disableRequested,
    editingElementsSize: () => 1,
    finishEditing: vi.fn(),
    hideHoverOverlay: vi.fn(),
    isDocumentModeEnabled: () => false,
    isEnabled: () => true,
    isStyleInspectorModeEnabled: () => false,
    makeElementEditable: vi.fn(),
    showHoverOverlay: vi.fn(),
  });

  expect(cancelEditing).toHaveBeenCalledWith(editable);
  expect(disableRequested).not.toHaveBeenCalled();
});

it('keeps quick edit mode active on the first Escape when the editable is only discoverable via activeElement', () => {
  const editable = document.createElement('div');
  editable.className = 'sniptale-editing';
  editable.contentEditable = 'true';
  editable.textContent = 'abc';
  document.body.appendChild(editable);

  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    value: editable,
  });

  const cancelEditing = vi.fn();
  const disableRequested = vi.fn();
  const event = new KeyboardEvent('keydown', { key: 'Escape' });
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: document.body,
  });

  handleQuickEditKeyDown(event, {
    cancelEditing,
    disableDocumentMode: vi.fn(),
    disableRequested,
    editingElementsSize: () => 1,
    finishEditing: vi.fn(),
    hideHoverOverlay: vi.fn(),
    isDocumentModeEnabled: () => false,
    isEnabled: () => true,
    isStyleInspectorModeEnabled: () => false,
    makeElementEditable: vi.fn(),
    showHoverOverlay: vi.fn(),
  });

  expect(cancelEditing).toHaveBeenCalledWith(editable);
  expect(disableRequested).not.toHaveBeenCalled();
});
