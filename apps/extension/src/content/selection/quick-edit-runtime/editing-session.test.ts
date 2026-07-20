// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: mocks.logMock }),
}));

import { cancelEditableElement, finishEditableElement } from './editing-session';

function createOriginalChildNodes(html: string): Node[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  return Array.from(template.content.childNodes, (node) => node.cloneNode(true));
}

function shouldFinishEditableElementsAndLogChangedContent(): void {
  const originalText = 'Original';
  const currentText = 'Updated';
  const element = document.createElement('div');
  element.dataset['sniptaleEditableId'] = 'editable-1';
  element.textContent = currentText;
  element.classList.add('sniptale-editing');
  const clearElementEditingState = vi.fn();
  const editingElements = new Map([
    [
      'editable-1',
      {
        originalContentEditable: 'inherit',
        originalText,
      },
    ],
  ]);

  finishEditableElement(editingElements as never, clearElementEditingState, element);

  expect(element.contentEditable).toBe('inherit');
  expect(editingElements.size).toBe(0);
  expect(clearElementEditingState).toHaveBeenCalledWith(element, 'editable-1');
  expect(mocks.logMock).toHaveBeenCalledWith('Text changed', {
    currentLength: currentText.length,
    deltaLength: currentText.length - originalText.length,
    originalLength: originalText.length,
  });
  expect(mocks.logMock).not.toHaveBeenCalledWith(
    'Text changed',
    expect.objectContaining({ current: currentText, original: originalText })
  );
}

function shouldCancelEditableElementsAndRestoreDomState(): void {
  const element = document.createElement('div');
  element.dataset['sniptaleEditableId'] = 'editable-2';
  element.innerHTML = '<span>Next</span>';
  element.setAttribute('class', 'next');
  element.setAttribute('style', 'color: red');
  const clearElementEditingState = vi.fn();
  const createRangeSpy = vi.spyOn(element.ownerDocument, 'createRange');
  const editingElements = new Map([
    [
      'editable-2',
      {
        originalClass: 'original',
        originalChildNodes: createOriginalChildNodes('<strong>Original</strong>'),
        originalContentEditable: 'false',
        originalInnerHTML: '<strong>Original</strong>',
        originalStyle: 'color: blue',
      },
    ],
  ]);

  cancelEditableElement(editingElements as never, clearElementEditingState, element);

  expect(element.innerHTML).toContain('Original');
  expect(element.innerHTML).toBe('<strong>Original</strong>');
  expect(element.getAttribute('class')).toBe('original');
  expect(element.getAttribute('style')).toBe('color: blue');
  expect(clearElementEditingState).toHaveBeenCalledWith(element, 'editable-2');
  expect(createRangeSpy).not.toHaveBeenCalled();
}

function shouldRemoveRestoredAttributesWhenOriginalValuesWereMissing(): void {
  const element = document.createElement('div');
  element.dataset['sniptaleEditableId'] = 'editable-3';
  element.setAttribute('class', 'next');
  element.setAttribute('style', 'color: red');
  const clearElementEditingState = vi.fn();
  const editingElements = new Map([
    [
      'editable-3',
      {
        originalClass: '',
        originalChildNodes: createOriginalChildNodes('<em>Original</em>'),
        originalContentEditable: 'inherit',
        originalInnerHTML: '<em>Original</em>',
        originalStyle: '',
      },
    ],
  ]);

  cancelEditableElement(editingElements as never, clearElementEditingState, element);

  expect(element.hasAttribute('class')).toBe(false);
  expect(element.hasAttribute('style')).toBe(false);
}

function shouldNoopWhenEditingSessionIsMissing(): void {
  const element = document.createElement('div');
  element.dataset['sniptaleEditableId'] = 'missing';
  const clearElementEditingState = vi.fn();

  finishEditableElement(new Map(), clearElementEditingState, element);
  cancelEditableElement(new Map(), clearElementEditingState, element);

  expect(clearElementEditingState).not.toHaveBeenCalled();
}

function shouldLogEditingLifecycleForOwnedSessions(): void {
  const element = document.createElement('div');
  element.dataset['sniptaleEditableId'] = 'editable-4';
  element.textContent = 'Stable';
  const clearElementEditingState = vi.fn();
  const editingElements = new Map([
    [
      'editable-4',
      {
        originalClass: 'original',
        originalChildNodes: createOriginalChildNodes('Stable'),
        originalContentEditable: 'inherit',
        originalInnerHTML: 'Stable',
        originalStyle: '',
        originalText: 'Stable',
      },
    ],
  ]);

  finishEditableElement(editingElements as never, clearElementEditingState, element);

  expect(mocks.logMock).toHaveBeenCalledWith('Editing finished', 'editable-4');
}

describe('quick edit editing session', () => {
  it(
    'finishes editable elements and logs only changed content',
    shouldFinishEditableElementsAndLogChangedContent
  );
  it(
    'cancels editable elements and restores original DOM state',
    shouldCancelEditableElementsAndRestoreDomState
  );
  it(
    'removes class and style attributes when the original session did not own them',
    shouldRemoveRestoredAttributesWhenOriginalValuesWereMissing
  );
  it(
    'no-ops when the element does not map to an active editing session',
    shouldNoopWhenEditingSessionIsMissing
  );
  it('logs the editing lifecycle for owned sessions', shouldLogEditingLifecycleForOwnedSessions);
});
