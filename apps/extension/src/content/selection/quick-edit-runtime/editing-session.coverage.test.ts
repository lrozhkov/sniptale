// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: mocks.logMock }),
}));

import { cancelEditableElement, finishEditableElement } from './editing-session';

function createEditableData(overrides: Partial<Record<string, unknown>> = {}) {
  const template = document.createElement('template');
  template.innerHTML = '<strong>Original</strong>';

  return {
    originalClass: 'before',
    originalChildNodes: Array.from(template.content.childNodes, (node) => node.cloneNode(true)),
    originalContentEditable: 'inherit',
    originalInnerHTML: '<strong>Original</strong>',
    originalStyle: 'color: red;',
    originalText: 'Original',
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('falls back to text-only restore for incomplete legacy edit records', () => {
  const clearElementEditingState = vi.fn();
  const element = document.createElement('div');
  element.dataset['sniptaleEditableId'] = 'editable-1';
  element.innerHTML = '<em>Changed</em>';
  const editingElements = new Map([
    [
      'editable-1',
      createEditableData({
        originalChildNodes: undefined,
        originalInnerHTML: '<img src=x onerror=alert(1)>',
        originalText: '<img src=x onerror=alert(1)>',
      }),
    ],
  ]);

  cancelEditableElement(editingElements, clearElementEditingState, element);

  expect(element.innerHTML).toBe('&lt;img src=x onerror=alert(1)&gt;');
});

it('ignores finish and cancel requests without an editable id or record', () => {
  const clearElementEditingState = vi.fn();
  const element = document.createElement('div');
  const editingElements = new Map();

  finishEditableElement(editingElements, clearElementEditingState, element);
  element.dataset['sniptaleEditableId'] = 'missing';
  cancelEditableElement(editingElements, clearElementEditingState, element);

  expect(clearElementEditingState).not.toHaveBeenCalled();
  expect(mocks.logMock).not.toHaveBeenCalled();
});

it('finishes editing, restores contentEditable, and logs text changes', () => {
  const originalText = 'Original';
  const currentText = 'Changed';
  const clearElementEditingState = vi.fn();
  const element = document.createElement('div');
  element.className = 'sniptale-editing';
  element.contentEditable = 'true';
  element.dataset['sniptaleEditableId'] = 'editable-1';
  element.textContent = currentText;
  const editingElements = new Map([['editable-1', createEditableData()]]);

  finishEditableElement(editingElements, clearElementEditingState, element);

  expect(element.contentEditable).toBe('inherit');
  expect(element.classList.contains('sniptale-editing')).toBe(false);
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
  expect(mocks.logMock).toHaveBeenCalledWith('Editing finished', 'editable-1');
});

it('cancels editing and restores markup attributes', () => {
  const clearElementEditingState = vi.fn();
  const element = document.createElement('div');
  element.dataset['sniptaleEditableId'] = 'editable-1';
  element.contentEditable = 'true';
  element.innerHTML = '<em>Changed</em>';
  const editingElements = new Map([['editable-1', createEditableData()]]);

  cancelEditableElement(editingElements, clearElementEditingState, element);

  expect(element.innerHTML).toBe('<strong>Original</strong>');
  expect(element.contentEditable).toBe('inherit');
  expect(element.getAttribute('class')).toBe('before');
  expect(element.getAttribute('style')).toBe('color: red;');
  expect(editingElements.size).toBe(0);
  expect(clearElementEditingState).toHaveBeenCalledWith(element, 'editable-1');
  expect(mocks.logMock).toHaveBeenCalledWith('Editing cancelled', 'editable-1');
});

it('removes class and style attributes when the original element had none', () => {
  const clearElementEditingState = vi.fn();
  const element = document.createElement('div');
  element.className = 'edited';
  element.setAttribute('style', 'display: none;');
  element.dataset['sniptaleEditableId'] = 'editable-1';
  const editingElements = new Map([
    ['editable-1', createEditableData({ originalClass: '', originalStyle: '' })],
  ]);

  cancelEditableElement(editingElements, clearElementEditingState, element);

  expect(element.hasAttribute('class')).toBe(false);
  expect(element.hasAttribute('style')).toBe(false);
});
