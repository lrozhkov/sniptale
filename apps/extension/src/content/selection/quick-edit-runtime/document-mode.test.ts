// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const historyMocks = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  cancelTransaction: vi.fn(),
  captureDomStateMap: vi.fn((elements: Iterable<HTMLElement>) => {
    return new Map(
      Array.from(elements, (element, index) => [
        `locator-${index}`,
        { attributes: {}, html: element.innerHTML },
      ])
    );
  }),
  commitTransaction: vi.fn(),
  createDomMutationBatch: vi.fn(() => ({ patches: [{ changed: true }] })),
}));

vi.mock('../../parser/page-preparation/history', () => ({
  captureDomStateMap: historyMocks.captureDomStateMap,
  createDomMutationBatch: historyMocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: historyMocks.beginTransaction,
    cancelTransaction: historyMocks.cancelTransaction,
    commitTransaction: historyMocks.commitTransaction,
  },
}));

import { createQuickEditDocumentMode } from './document-mode';

function createDocumentMode() {
  return createQuickEditDocumentMode({
    editingElements: new Map(),
    finishEditing: vi.fn(),
    getIsQuickEditMode: () => true,
    hideBlockingOverlay: vi.fn(),
    hideHoverOverlay: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  document.designMode = 'off';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(document, 'designMode', {
    configurable: true,
    value: 'off',
    writable: true,
  });
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function dispatchDocumentModeInput(target: HTMLElement, mutate: () => void): void {
  target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));
  mutate();
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}

it('begins a document-mode history transaction on enable', () => {
  const documentMode = createDocumentMode();

  documentMode.enable();

  expect(historyMocks.beginTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  documentMode.disable();
});

it('leaves document mode disabled when designMode enable does not stick', () => {
  let designMode = 'off';
  Object.defineProperty(document, 'designMode', {
    configurable: true,
    get: () => designMode,
    set: (value) => {
      if (value !== 'on') {
        designMode = value;
      }
    },
  });
  const documentMode = createDocumentMode();

  expect(() => documentMode.enable()).toThrow('document.designMode did not switch to "on"');

  expect(historyMocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  expect(documentMode.isEnabled()).toBe(false);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(false);
  expect(document.designMode).toBe('off');
});

it('commits document-mode DOM edits when document mode is disabled', () => {
  const documentMode = createDocumentMode();
  const paragraph = document.createElement('p');

  paragraph.textContent = 'Before';
  document.body.append(paragraph);

  documentMode.enable();
  dispatchDocumentModeInput(paragraph, () => {
    paragraph.textContent = 'After';
  });
  documentMode.disable();

  expect(historyMocks.createDomMutationBatch).toHaveBeenCalledWith([paragraph], expect.any(Map));
  expect(historyMocks.commitTransaction).toHaveBeenCalledWith('quick-edit-document-mode', {
    patches: [{ changed: true }],
  });
});

it('keeps document mode active when designMode restore fails', () => {
  let designMode = 'off';
  Object.defineProperty(document, 'designMode', {
    configurable: true,
    get: () => designMode,
    set: (value) => {
      if (value === 'off' && designMode === 'on') {
        throw new Error('restore failed');
      }
      designMode = value;
    },
  });
  const documentMode = createDocumentMode();

  documentMode.enable();
  expect(() => documentMode.disable()).toThrow('restore failed');

  expect(historyMocks.commitTransaction).not.toHaveBeenCalled();
  expect(historyMocks.cancelTransaction).not.toHaveBeenCalled();
  expect(documentMode.isEnabled()).toBe(true);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(true);
  expect(document.designMode).toBe('on');
});
