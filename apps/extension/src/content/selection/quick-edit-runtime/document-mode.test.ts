// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const historyMocks = vi.hoisted(() => ({
  applyDomMutationBatch: vi.fn(
    (
      _batch: {
        patches: Array<{
          before: { attributes: Record<string, string>; html: string };
          target: HTMLElement;
        }>;
      } | null = null,
      _direction: 'undo' | 'redo' = 'undo'
    ) => ({ missingLocators: [], success: true })
  ),
  beginTransaction: vi.fn(() => true),
  cancelTransaction: vi.fn(),
  captureDomStateMap: vi.fn((elements: Iterable<HTMLElement>) => {
    return new Map(
      Array.from(elements, (element, index) => [
        `locator-${index}`,
        { attributes: {}, html: element.innerHTML },
      ])
    );
  }),
  commitTransaction: vi.fn(() => true),
  createDomMutationBatch: vi.fn((elements: Iterable<HTMLElement>) => ({
    patches: Array.from(elements, (target) => ({
      after: { attributes: {}, html: target.innerHTML },
      before: { attributes: {}, html: target.innerHTML },
      changed: true,
      locator: '#target',
      target,
    })),
  })),
}));

vi.mock('../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../parser/page-preparation/history')>()),
  applyDomMutationBatch: historyMocks.applyDomMutationBatch,
  captureDomStateMap: historyMocks.captureDomStateMap,
  createDomMutationBatch: historyMocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: historyMocks.beginTransaction,
    cancelTransaction: historyMocks.cancelTransaction,
    commitTransaction: historyMocks.commitTransaction,
  },
}));

import { createQuickEditDocumentMode } from './document-mode';

function createDocumentMode(disableRequested = vi.fn()) {
  return createQuickEditDocumentMode({
    disableRequested,
    editingElements: new Map(),
    finishEditing: vi.fn(),
    getIsQuickEditMode: () => true,
    hideBlockingOverlay: vi.fn(),
    hideHoverOverlay: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  historyMocks.beginTransaction.mockReturnValue(true);
  historyMocks.commitTransaction.mockReturnValue(true);
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
  document.body.className = '';
  document.body.replaceChildren();
});

function dispatchDocumentModeInput(target: HTMLElement, mutate: () => void): void {
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

it('begins a document-mode history transaction on enable', () => {
  const documentMode = createDocumentMode();
  document.body.classList.add('sniptale-quick-edit-text-cursor');

  documentMode.enable();

  expect(historyMocks.beginTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);
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
  document.body.classList.add('sniptale-quick-edit-text-cursor');
  dispatchDocumentModeInput(paragraph, () => {
    paragraph.textContent = 'After';
  });
  documentMode.disable();

  expect(historyMocks.createDomMutationBatch).toHaveBeenCalledWith([paragraph], expect.any(Map));
  expect(historyMocks.commitTransaction).toHaveBeenCalledWith('quick-edit-document-mode', {
    patches: [expect.objectContaining({ changed: true })],
  });
  expect(document.body.classList.contains('sniptale-quick-edit-text-cursor')).toBe(false);
});

it('keeps document mode active when designMode restore fails', () => {
  let designMode = 'off';
  let allowRestore = false;
  Object.defineProperty(document, 'designMode', {
    configurable: true,
    get: () => designMode,
    set: (value) => {
      if (value === 'off' && designMode === 'on' && !allowRestore) {
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

  allowRestore = true;
  documentMode.disable();
});

it('prevents the input and disables through the owner when before-state capture fails', () => {
  const disableRequested = vi.fn();
  const documentMode = createDocumentMode(disableRequested);
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Before';
  document.body.append(paragraph);
  historyMocks.captureDomStateMap.mockImplementationOnce(() => {
    throw new Error('locator allocation failed');
  });

  documentMode.enable();
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
  });
  const shouldMutate = paragraph.dispatchEvent(beforeInput);
  if (shouldMutate) {
    paragraph.textContent = 'After';
  }
  paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));

  expect(beforeInput.defaultPrevented).toBe(true);
  expect(shouldMutate).toBe(false);
  expect(paragraph.textContent).toBe('Before');
  expect(document.designMode).toBe('off');
  expect(documentMode.isEnabled()).toBe(false);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(false);
  expect(disableRequested).toHaveBeenCalledOnce();
  expect(historyMocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
});

it('recovers non-cancelable IME input before disabling after capture failure', () => {
  const disableRequested = vi.fn();
  const documentMode = createDocumentMode(disableRequested);
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Before';
  document.body.append(paragraph);
  historyMocks.captureDomStateMap.mockImplementationOnce(() => {
    throw new Error('locator allocation failed');
  });
  historyMocks.applyDomMutationBatch.mockImplementationOnce((batch, direction) => {
    if (batch && direction === 'undo') {
      batch.patches.forEach((patch) => {
        patch.target.innerHTML = patch.before.html;
      });
    }
    return { missingLocators: [], success: true };
  });

  documentMode.enable();
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: false,
    inputType: 'insertCompositionText',
    isComposing: true,
  });
  expect(paragraph.dispatchEvent(beforeInput)).toBe(true);
  paragraph.textContent = 'After';

  expect(beforeInput.defaultPrevented).toBe(false);
  expect(documentMode.isEnabled()).toBe(true);
  expect(disableRequested).not.toHaveBeenCalled();

  paragraph.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      isComposing: true,
    })
  );

  expect(historyMocks.applyDomMutationBatch).toHaveBeenCalledWith(
    expect.objectContaining({ patches: [expect.objectContaining({ target: paragraph })] }),
    'undo'
  );
  expect(paragraph.textContent).toBe('Before');
  expect(document.designMode).toBe('off');
  expect(documentMode.isEnabled()).toBe(false);
  expect(disableRequested).toHaveBeenCalledOnce();
  expect(historyMocks.cancelTransaction).toHaveBeenCalledWith('quick-edit-document-mode');
  expect(historyMocks.commitTransaction).not.toHaveBeenCalled();
});

it('retains exact IME recovery across repeated batch construction failures', () => {
  const disableRequested = vi.fn();
  const documentMode = createDocumentMode(disableRequested);
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Before';
  document.body.append(paragraph);
  historyMocks.captureDomStateMap.mockImplementationOnce(() => {
    throw new Error('locator allocation failed');
  });
  historyMocks.createDomMutationBatch
    .mockImplementationOnce(() => {
      throw new Error('recovery batch construction failed');
    })
    .mockImplementationOnce(() => {
      throw new Error('recovery batch retry failed');
    });
  historyMocks.applyDomMutationBatch.mockImplementationOnce((batch, direction) => {
    if (batch && direction === 'undo') {
      batch.patches.forEach((patch) => {
        patch.target.innerHTML = patch.before.html;
      });
    }
    return { missingLocators: [], success: true };
  });

  documentMode.enable();
  paragraph.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertCompositionText',
      isComposing: true,
    })
  );
  paragraph.textContent = 'After';
  paragraph.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      isComposing: true,
    })
  );

  expect(paragraph.textContent).toBe('After');
  expect(document.designMode).toBe('off');
  expect(documentMode.isEnabled()).toBe(true);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(true);
  expect(disableRequested).toHaveBeenCalledOnce();

  expect(() => documentMode.disable()).toThrow('Document-mode capture and input recovery failed');
  expect(paragraph.textContent).toBe('After');
  expect(documentMode.isEnabled()).toBe(true);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(true);

  expect(() => documentMode.disable()).toThrow(
    'Document-mode input recovery succeeded only after an earlier failure'
  );
  expect(paragraph.textContent).toBe('Before');
  expect(documentMode.isEnabled()).toBe(false);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(false);
  expect(historyMocks.commitTransaction).not.toHaveBeenCalled();
});

it('surfaces commit failure after restoring document-mode lifecycle state', () => {
  const documentMode = createDocumentMode();
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Before';
  document.body.append(paragraph);
  historyMocks.commitTransaction.mockImplementationOnce(() => {
    throw new Error('history finalization failed');
  });

  documentMode.enable();
  dispatchDocumentModeInput(paragraph, () => {
    paragraph.textContent = 'After';
  });

  expect(() => documentMode.disable()).toThrow('history finalization failed');
  expect(document.designMode).toBe('off');
  expect(documentMode.isEnabled()).toBe(false);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(false);
});

it('keeps failed capture listeners blocking until document-mode restore can finish', () => {
  let designMode = 'off';
  let allowRestore = false;
  Object.defineProperty(document, 'designMode', {
    configurable: true,
    get: () => designMode,
    set: (value) => {
      if (value === 'off' && designMode === 'on' && !allowRestore) {
        throw new Error('restore failed');
      }
      designMode = value;
    },
  });
  const disableRequested = vi.fn();
  const documentMode = createDocumentMode(disableRequested);
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Before';
  document.body.append(paragraph);
  historyMocks.captureDomStateMap.mockImplementationOnce(() => {
    throw new Error('capture failed');
  });

  documentMode.enable();
  const first = new InputEvent('beforeinput', { bubbles: true, cancelable: true });
  paragraph.dispatchEvent(first);
  const second = new InputEvent('beforeinput', { bubbles: true, cancelable: true });
  paragraph.dispatchEvent(second);

  expect(first.defaultPrevented).toBe(true);
  expect(second.defaultPrevented).toBe(true);
  expect(document.designMode).toBe('on');
  expect(documentMode.isEnabled()).toBe(true);
  expect(disableRequested).toHaveBeenCalledOnce();

  allowRestore = true;
  expect(() => documentMode.disable()).toThrow('Failed to capture document-mode history state');
  expect(documentMode.isEnabled()).toBe(false);
  expect(document.designMode).toBe('off');
});
