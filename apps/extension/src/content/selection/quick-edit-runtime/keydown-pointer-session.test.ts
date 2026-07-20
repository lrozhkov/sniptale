/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ownedElementMock: vi.fn(() => false),
  quickEditTargetMock: vi.fn(),
  resolveActiveElementMock: vi.fn(),
  styleInspectableTargetMock: vi.fn(() => false),
  textTargetMock: vi.fn(() => false),
}));

vi.mock('./events.shared', () => ({
  isQuickEditOwnedElement: mocks.ownedElementMock,
  isQuickEditStyleInspectableTarget: mocks.styleInspectableTargetMock,
  isQuickEditTextTarget: mocks.textTargetMock,
  resolveActiveQuickEditElement: mocks.resolveActiveElementMock,
  resolveQuickEditTarget: mocks.quickEditTargetMock,
}));

import { handleQuickEditKeyDown } from './keydown';
import {
  handleQuickEditBlur,
  handleQuickEditClick,
  handleQuickEditMouseLeave,
  handleQuickEditMouseMove,
  handleQuickEditOutsideClick,
} from './pointer';
import { activateEditableElement, clearEditableElementState } from './session';

function createKeyboardOptions() {
  return {
    applyCropSelection: vi.fn(),
    cancelEditing: vi.fn(),
    cancelTransientInteraction: vi.fn(() => true),
    deleteSelection: vi.fn(),
    disableDocumentMode: vi.fn(),
    disableRequested: vi.fn(),
    duplicateSelection: vi.fn(),
    finishEditing: vi.fn(),
    hasCropGuide: true,
    isDocumentModeEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => true),
    redo: vi.fn(),
    undo: vi.fn(),
  } as any;
}

function createPointerOptions() {
  return {
    editingElementsSize: vi.fn(() => 1),
    finishEditing: vi.fn(),
    hideHoverOverlay: vi.fn(),
    isDocumentModeEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => true),
    isStyleInspectorModeEnabled: vi.fn(() => false),
    makeElementEditable: vi.fn(),
    showHoverOverlay: vi.fn(),
  } as any;
}

describe('quick edit keydown, pointer, and session flows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('inserts a protected space and commits editing on enter', () => {
    const element = document.createElement('div');
    element.classList.add('sniptale-editing');
    element.textContent = 'A';
    document.body.appendChild(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    mocks.resolveActiveElementMock.mockReturnValue(element);
    const options = createKeyboardOptions();

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
    handleQuickEditKeyDown(spaceEvent, options);
    expect(element.textContent).toContain('\u00a0');

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    handleQuickEditKeyDown(enterEvent, options);
    expect(options.finishEditing).toHaveBeenCalledWith(element);
  });

  it('disables quick edit on escape when nothing is actively edited', () => {
    const options = createKeyboardOptions();
    mocks.resolveActiveElementMock.mockReturnValue(null);

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    handleQuickEditKeyDown(escapeEvent, options);
    expect(options.disableRequested).toHaveBeenCalledOnce();
  });

  it('disables document mode first when Escape is pressed', () => {
    const options = createKeyboardOptions();
    options.isDocumentModeEnabled.mockReturnValue(true);

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    handleQuickEditKeyDown(escapeEvent, options);

    expect(options.disableDocumentMode).toHaveBeenCalledOnce();
    expect(options.disableRequested).not.toHaveBeenCalled();
  });

  it('drives pointer hover, click, outside click, and blur flows', () => {
    const element = document.createElement('div');
    element.classList.add('sniptale-editing');
    document.body.appendChild(element);
    const childLink = document.createElement('a');
    childLink.href = 'https://example.com';
    element.appendChild(childLink);
    mocks.quickEditTargetMock.mockReturnValue(element);
    mocks.textTargetMock.mockReturnValue(true);
    const options = createPointerOptions();

    handleQuickEditMouseMove(new MouseEvent('mousemove'), options);
    handleQuickEditClick(new MouseEvent('click'), options);
    handleQuickEditOutsideClick(new MouseEvent('mousedown'), options, [element]);
    handleQuickEditMouseLeave(options);
    handleQuickEditBlur(new FocusEvent('blur', { relatedTarget: null }), options);
    vi.runAllTimers();

    expect(options.showHoverOverlay).toHaveBeenCalledWith(element);
    expect(options.makeElementEditable).toHaveBeenCalledWith(element);
    expect(options.hideHoverOverlay).toHaveBeenCalled();
    expect(options.finishEditing).toHaveBeenCalledWith(element);
  });

  it('activates and clears editable element session state', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editingElements = new Map();
    const sessionOptions = {
      disconnectResizeObserver: vi.fn(),
      editingElements,
      handleChildLinkClick: vi.fn(),
      hideBlockingOverlay: vi.fn(),
      setupResizeObserver: vi.fn(),
      showBlockingOverlay: vi.fn(),
      updateBlockingOverlayShape: vi.fn(),
    } as any;

    activateEditableElement(
      element,
      'editable-1',
      { originalContentEditable: 'inherit', originalText: 'Original' } as any,
      sessionOptions
    );
    clearEditableElementState(element, 'editable-1', sessionOptions);

    expect(sessionOptions.showBlockingOverlay).toHaveBeenCalledOnce();
    expect(sessionOptions.hideBlockingOverlay).toHaveBeenCalledOnce();
    expect(sessionOptions.disconnectResizeObserver).toHaveBeenCalledOnce();
  });
});
