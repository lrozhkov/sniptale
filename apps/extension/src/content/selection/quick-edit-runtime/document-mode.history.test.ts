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
    applyDomMutationBatch: vi.fn((): { missingLocators: string[]; success: boolean } => ({
      missingLocators: [],
      success: true,
    })),
    beginTransaction: vi.fn(() => true),
    cancelTransaction: vi.fn(),
    captureDomStateMap: vi.fn((elements: Iterable<HTMLElement>) => {
      return new Map(
        Array.from(elements, (element) => [
          resolveLocator(element),
          { attributes: {}, html: element.innerHTML },
        ])
      );
    }),
    commitTransaction: vi.fn((_key: string, _batch?: unknown) => true),
    createDomMutationBatch: vi.fn(
      (
        elements: Iterable<HTMLElement>,
        beforeStates: Map<string, { attributes: Record<string, string>; html: string }>
      ) => ({
        patches: Array.from(elements, (element) => {
          const locator = resolveLocator(element);
          return {
            after: { attributes: {}, html: element.innerHTML },
            before: beforeStates.get(locator) ?? {
              attributes: {},
              html: element.innerHTML,
            },
            locator,
            target: element,
          };
        }),
      })
    ),
  };
});

vi.mock('../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../parser/page-preparation/history')>()),
  applyDomMutationBatch: mocks.applyDomMutationBatch,
  captureDomStateMap: mocks.captureDomStateMap,
  createDomMutationBatch: mocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: mocks.beginTransaction,
    cancelTransaction: mocks.cancelTransaction,
    commitTransaction: mocks.commitTransaction,
  },
}));

import { createQuickEditDocumentModeHistoryTracker } from './document-mode.history';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';

function appendParagraph(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  document.body.append(paragraph);
  return paragraph;
}

function dispatchInputSequence(target: HTMLElement, mutate: () => void): void {
  const shouldMutate = target.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
    })
  );
  if (shouldMutate) {
    mutate();
  }
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}

function dispatchNonCancelableCompositionInput(target: HTMLElement, mutate: () => void): void {
  target.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertCompositionText',
      isComposing: true,
    })
  );
  mutate();
  target.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      isComposing: true,
    })
  );
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
  mocks.beginTransaction.mockReturnValue(true);
  mocks.commitTransaction.mockReturnValue(true);
  mocks.applyDomMutationBatch.mockReturnValue({ missingLocators: [], success: true });
  browserAnnotationSession.resetForDocument();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  document.body.replaceChildren();
  browserAnnotationSession.resetForDocument();
  vi.restoreAllMocks();
});

it('begins a document-mode history transaction', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();

  tracker.begin();

  expect(mocks.beginTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  tracker.cancel();
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
  expect(batch.patches[0]?.before).toMatchObject({ html: 'Before' });
  expect(mocks.commitTransaction).toHaveBeenCalledWith(
    'quick-edit-document-mode',
    expect.objectContaining({ patches: expect.any(Array) })
  );
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toEqual({
    after: 'After',
    before: 'Before',
  });
});

it('cancels the transaction when no input occurred', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();

  tracker.begin();
  tracker.commit();

  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(mocks.commitTransaction).not.toHaveBeenCalled();
});

it('commits internal DOM history without text evidence when input returns to the same text', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Same');

  tracker.begin();
  dispatchInputSequence(paragraph, () => {
    paragraph.textContent = 'Same';
  });
  tracker.commit();

  expect(mocks.commitTransaction).toHaveBeenCalledOnce();
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
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

it('cancels and resets when before-state locator capture fails inside the transaction', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Before');
  mocks.captureDomStateMap.mockImplementationOnce(() => {
    throw new Error('locator allocation failed');
  });

  tracker.begin();
  dispatchInputSequence(paragraph, () => {
    paragraph.textContent = 'After';
  });
  tracker.commit();

  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  expect(mocks.commitTransaction).not.toHaveBeenCalled();
  expect(paragraph.textContent).toBe('Before');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
});

it.each([
  {
    configureFailure: () =>
      mocks.applyDomMutationBatch.mockReturnValueOnce({
        missingLocators: ['locator-1'],
        success: false,
      }),
    name: 'returns failure',
  },
  {
    configureFailure: () =>
      mocks.applyDomMutationBatch.mockImplementationOnce(() => {
        throw new Error('DOM recovery threw');
      }),
    name: 'throws',
  },
])('retains exact recovery state when canonical DOM application $name', ({ configureFailure }) => {
  const onCaptureFailure = vi.fn(() => true);
  const onRecoveryFailure = vi.fn();
  const tracker = createQuickEditDocumentModeHistoryTracker({
    onCaptureFailure,
    onRecoveryFailure,
  });
  const paragraph = appendParagraph('Before');
  mocks.captureDomStateMap.mockImplementationOnce(() => {
    throw new Error('locator allocation failed');
  });
  configureFailure();

  tracker.begin();
  dispatchNonCancelableCompositionInput(paragraph, () => {
    paragraph.textContent = 'After';
  });

  expect(onRecoveryFailure).toHaveBeenCalledOnce();
  expect(onCaptureFailure).not.toHaveBeenCalled();
  expect(mocks.commitTransaction).not.toHaveBeenCalled();
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);

  expect(() => tracker.commit()).toThrow(
    'Document-mode input recovery succeeded only after an earlier failure'
  );
  expect(mocks.applyDomMutationBatch).toHaveBeenCalledTimes(2);
});

it('publishes multiple roots in one session revision and rolls them back on commit failure', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const first = appendParagraph('First');
  const second = appendParagraph('Second');
  const listener = vi.fn();
  const unsubscribe = browserAnnotationSession.subscribe(listener);
  mocks.commitTransaction.mockImplementationOnce(() => {
    throw new Error('history capture failed');
  });

  tracker.begin();
  dispatchInputSequence(first, () => {
    first.textContent = 'First changed';
  });
  dispatchInputSequence(second, () => {
    second.textContent = 'Second changed';
  });
  expect(() => tracker.commit()).toThrow('history capture failed');

  expect(listener).toHaveBeenCalledTimes(2);
  expect(mocks.applyDomMutationBatch).toHaveBeenCalledWith(
    expect.objectContaining({ patches: expect.any(Array) }),
    'undo'
  );
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  unsubscribe();
});

it('compensates and surfaces a lost keyed transaction', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Before');
  mocks.commitTransaction.mockReturnValueOnce(false);

  tracker.begin();
  dispatchInputSequence(paragraph, () => {
    paragraph.textContent = 'After';
  });

  expect(() => tracker.commit()).toThrow(
    'Quick Edit document-mode history transaction was lost before commit'
  );
  expect(mocks.applyDomMutationBatch).toHaveBeenCalledOnce();
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
});

it('surfaces rollback refusal after attempting cancellation and DOM compensation', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Before');
  const rollbackSpy = vi
    .spyOn(browserAnnotationSession, 'rollbackFailedMutation')
    .mockReturnValueOnce(false);
  mocks.commitTransaction.mockImplementationOnce(() => {
    throw new Error('history capture failed');
  });

  tracker.begin();
  dispatchInputSequence(paragraph, () => {
    paragraph.textContent = 'After';
  });

  expect(() => tracker.commit()).toThrow(AggregateError);
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  expect(mocks.applyDomMutationBatch).toHaveBeenCalledOnce();
  expect(rollbackSpy).toHaveBeenCalledOnce();
});

it('attempts session rollback even when cancellation and DOM rollback throw', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  const paragraph = appendParagraph('Before');
  const rollbackSpy = vi.spyOn(browserAnnotationSession, 'rollbackFailedMutation');
  mocks.commitTransaction.mockImplementationOnce(() => {
    throw new Error('history capture failed');
  });
  mocks.cancelTransaction.mockImplementationOnce(() => {
    throw new Error('cancel failed');
  });
  mocks.applyDomMutationBatch.mockImplementationOnce(() => {
    throw new Error('DOM rollback failed');
  });

  tracker.begin();
  dispatchInputSequence(paragraph, () => {
    paragraph.textContent = 'After';
  });

  expect(() => tracker.commit()).toThrow(AggregateError);
  expect(rollbackSpy).toHaveBeenCalledOnce();
});

it('rejects an unavailable transaction before document mode becomes active', () => {
  const tracker = createQuickEditDocumentModeHistoryTracker();
  mocks.beginTransaction.mockReturnValueOnce(false);

  expect(() => tracker.begin()).toThrow(
    'Quick Edit document-mode history transaction is unavailable'
  );
  tracker.recordPotentialEditTarget(appendParagraph('Ignored'));
  expect(mocks.captureDomStateMap).not.toHaveBeenCalled();
});
