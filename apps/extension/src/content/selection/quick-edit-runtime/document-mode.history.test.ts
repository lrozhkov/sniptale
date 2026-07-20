// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let locatorId = 0;
  const resolveLocator = (element: HTMLElement): string => {
    if (!element.dataset['testLocator']) {
      locatorId += 1;
      element.dataset['testLocator'] = `locator-${locatorId}`;
    }

    return element.dataset['testLocator'];
  };

  return {
    beginTransaction: vi.fn(),
    cancelTransaction: vi.fn(),
    captureDomStateMap: vi.fn((elements: Iterable<HTMLElement>) => {
      return new Map(
        Array.from(elements, (element) => [
          resolveLocator(element),
          { attributes: {}, html: element.innerHTML },
        ])
      );
    }),
    commitTransaction: vi.fn(),
    createDomMutationBatch: vi.fn(
      (
        elements: Iterable<HTMLElement>,
        beforeStates: Map<string, { attributes: Record<string, string>; html: string }>
      ) => ({
        patches: Array.from(elements, (element) => {
          const locator = resolveLocator(element);
          return {
            after: { attributes: {}, html: element.innerHTML },
            before: beforeStates.get(locator),
            locator,
          };
        }),
      })
    ),
  };
});

vi.mock('../../parser/page-preparation/history', () => ({
  captureDomStateMap: mocks.captureDomStateMap,
  createDomMutationBatch: mocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: mocks.beginTransaction,
    cancelTransaction: mocks.cancelTransaction,
    commitTransaction: mocks.commitTransaction,
  },
}));

import { createQuickEditDocumentModeHistoryTracker } from './document-mode.history';

function appendParagraph(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  document.body.append(paragraph);
  return paragraph;
}

function dispatchInputSequence(target: HTMLElement, mutate: () => void): void {
  target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));
  mutate();
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}

function selectInside(element: HTMLElement): void {
  const selection = document.getSelection();
  if (!selection) {
    throw new Error('Expected document selection');
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function readLastBatchCall() {
  const batchCall = mocks.createDomMutationBatch.mock.calls.at(-1);
  if (!batchCall) {
    throw new Error('Expected DOM mutation batch call');
  }

  return {
    roots: Array.from(batchCall[0] as Iterable<HTMLElement>),
  };
}

function readLastCommittedBatch() {
  const commitCall = mocks.commitTransaction.mock.calls.at(-1);
  if (!commitCall) {
    throw new Error('Expected history commit call');
  }

  return commitCall[1] as {
    patches: Array<{ before: { attributes: Record<string, string>; html: string } | undefined }>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('begins a document-mode history transaction', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();

  tracker.begin();

  expect(mocks.beginTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
});

it('captures before-state before text mutation and commits the changed root', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Before');

  tracker.begin();
  dispatchInputSequence(paragraph, () => {
    paragraph.textContent = 'After';
  });
  tracker.commit();

  const { roots } = readLastBatchCall();
  const batch = readLastCommittedBatch();
  expect(roots).toEqual([paragraph]);
  expect(batch.patches[0]?.before).toEqual({ attributes: {}, html: 'Before' });
  expect(mocks.commitTransaction).toHaveBeenCalledWith(
    'quick-edit-document-mode',
    expect.objectContaining({ patches: expect.any(Array) })
  );
});

it('cancels the transaction when no input occurred', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();

  tracker.begin();
  tracker.commit();

  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  expect(mocks.commitTransaction).not.toHaveBeenCalled();
});

it('ignores events from the Sniptale extension root', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const extensionRoot = document.createElement('div');
  const child = document.createElement('p');

  extensionRoot.id = 'sniptale-extension-root';
  child.textContent = 'Overlay text';
  extensionRoot.append(child);
  document.body.append(extensionRoot);

  tracker.begin();
  dispatchInputSequence(child, () => {
    child.textContent = 'Edited overlay text';
  });
  tracker.commit();

  expect(mocks.captureDomStateMap).not.toHaveBeenCalled();
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
});

it('commits multiple edited roots in one transaction', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const first = appendParagraph('First');
  const second = appendParagraph('Second');

  tracker.begin();
  dispatchInputSequence(first, () => {
    first.textContent = 'First edited';
  });
  dispatchInputSequence(second, () => {
    second.textContent = 'Second edited';
  });
  tracker.commit();

  expect(readLastBatchCall().roots).toEqual([first, second]);
  expect(mocks.commitTransaction).toHaveBeenCalledOnce();
});

it('uses the selection root before falling back to body-level tracking', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Before');

  tracker.begin();
  selectInside(paragraph);
  dispatchInputSequence(document.body, () => {
    paragraph.textContent = 'After';
  });
  tracker.commit();

  expect(readLastBatchCall().roots).toEqual([paragraph]);
});

it('skips disconnected dirty roots during cleanup without throwing', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Before');

  tracker.begin();
  dispatchInputSequence(paragraph, () => {
    paragraph.textContent = 'After';
  });
  paragraph.remove();

  expect(() => tracker.commit()).not.toThrow();
  expect(mocks.createDomMutationBatch).not.toHaveBeenCalled();
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
});
