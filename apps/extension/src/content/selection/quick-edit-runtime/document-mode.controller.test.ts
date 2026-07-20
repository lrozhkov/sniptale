// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const historyMocks = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  cancelTransaction: vi.fn(),
  captureDomStateMap: vi.fn(() => new Map([['locator', { attributes: {}, html: 'Before' }]])),
  commitTransaction: vi.fn(),
  createDomMutationBatch: vi.fn(() => ({ patches: [{ changed: true }] })),
}));

vi.mock('../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../parser/page-preparation/history')>()),
  captureDomStateMap: historyMocks.captureDomStateMap,
  createDomMutationBatch: historyMocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: historyMocks.beginTransaction,
    cancelTransaction: historyMocks.cancelTransaction,
    commitTransaction: historyMocks.commitTransaction,
  },
}));

import { createQuickEditRuntimeController } from '.';

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function appendEditableText(): HTMLElement {
  const element = document.createElement('p');
  element.textContent = 'Before';
  document.body.append(element);
  return element;
}

function dispatchDocumentModeInput(target: HTMLElement, mutate: () => void): void {
  target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));
  mutate();
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  document.designMode = 'off';
});

afterEach(() => {
  document.designMode = 'off';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('commits open document-mode history during full quick-edit disable', () => {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });
  const element = appendEditableText();

  controller.mode.enable();
  controller.documentMode.enable();
  dispatchDocumentModeInput(element, () => {
    element.textContent = 'After';
  });
  controller.mode.disable();

  expect(controller.mode.isEnabled()).toBe(false);
  expect(controller.documentMode.isEnabled()).toBe(false);
  expect(document.designMode).toBe('off');
  expect(historyMocks.commitTransaction).toHaveBeenCalledWith('quick-edit-document-mode', {
    patches: [{ changed: true }],
  });
  expect(historyMocks.cancelTransaction).not.toHaveBeenCalled();
});
