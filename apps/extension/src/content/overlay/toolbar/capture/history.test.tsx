// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { ToolbarHistoryControls } from './history';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let historyState = { canRedo: false, canUndo: false, revision: 0 };
let openTransactions = false;
let listener: (() => void) | null = null;

function renderComponent(screenshotMode = true) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ToolbarHistoryControls screenshotMode={screenshotMode} />);
  });
}

function emitHistoryState(nextState: typeof historyState) {
  historyState = nextState;
  listener?.();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(pagePreparationHistory, 'getState').mockImplementation(() => historyState);
  vi.spyOn(pagePreparationHistory, 'hasOpenTransactions').mockImplementation(
    () => openTransactions
  );
  vi.spyOn(pagePreparationHistory, 'subscribe').mockImplementation((nextListener) => {
    listener = nextListener;
    return () => {
      if (listener === nextListener) {
        listener = null;
      }
    };
  });
  vi.spyOn(pagePreparationHistory, 'undo').mockImplementation(() => undefined);
  vi.spyOn(pagePreparationHistory, 'redo').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  historyState = { canRedo: false, canUndo: false, revision: 0 };
  openTransactions = false;
  listener = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function verifyDisabledStateRendering() {
  historyState = { canRedo: true, canUndo: false, revision: 1 };
  renderComponent();

  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.history-undo-button"]')
      ?.hasAttribute('disabled')
  ).toBe(true);
  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.history-redo-button"]')
      ?.hasAttribute('disabled')
  ).toBe(false);
}

function verifyHotkeysOutsideEditableTargets() {
  historyState = { canRedo: true, canUndo: true, revision: 1 };
  renderComponent();

  document.body.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'KeyZ',
      ctrlKey: true,
      key: 'я',
    })
  );
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'KeyZ',
      ctrlKey: true,
      key: 'Я',
      shiftKey: true,
    })
  );
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'KeyY',
      ctrlKey: true,
      key: 'н',
    })
  );

  expect(pagePreparationHistory.undo).toHaveBeenCalledTimes(1);
  expect(pagePreparationHistory.redo).toHaveBeenCalledTimes(2);
}

function verifyEditableTargetBypass() {
  historyState = { canRedo: true, canUndo: true, revision: 1 };
  renderComponent();

  const input = document.createElement('input');
  document.body.append(input);
  input.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, code: 'KeyZ', ctrlKey: true, key: 'я' })
  );

  const inlineEditTarget = document.createElement('div');
  inlineEditTarget.dataset['sniptaleEditableId'] = 'editing-1';
  document.body.append(inlineEditTarget);
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, code: 'KeyZ', ctrlKey: true, key: 'я' })
  );

  expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
  expect(pagePreparationHistory.redo).not.toHaveBeenCalled();
}

function verifyDisabledPreparationMode() {
  historyState = { canRedo: true, canUndo: true, revision: 1 };
  renderComponent(false);

  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, code: 'KeyZ', ctrlKey: true, key: 'я' })
  );

  expect(container?.textContent).toBe('');
  expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
}

function verifySubscribedStateRefresh() {
  historyState = { canRedo: false, canUndo: false, revision: 0 };
  renderComponent();

  act(() => {
    emitHistoryState({ canRedo: true, canUndo: true, revision: 1 });
  });

  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.history-undo-button"]')
      ?.hasAttribute('disabled')
  ).toBe(false);
  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.history-redo-button"]')
      ?.hasAttribute('disabled')
  ).toBe(false);
}

function verifyOpenTransactionBlocksHistoryControls() {
  historyState = { canRedo: true, canUndo: true, revision: 1 };
  openTransactions = true;
  renderComponent();

  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, code: 'KeyZ', ctrlKey: true, key: 'я' })
  );

  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.history-undo-button"]')
      ?.hasAttribute('disabled')
  ).toBe(true);
  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.history-redo-button"]')
      ?.hasAttribute('disabled')
  ).toBe(true);
  expect(pagePreparationHistory.undo).not.toHaveBeenCalled();

  act(() => {
    openTransactions = false;
    emitHistoryState({ canRedo: true, canUndo: true, revision: 2 });
  });

  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.history-undo-button"]')
      ?.hasAttribute('disabled')
  ).toBe(false);
}

describe('ToolbarHistoryControls', () => {
  it(
    'renders undo and redo controls with disabled state from the history store',
    verifyDisabledStateRendering
  );
  it('handles undo and redo hotkeys outside editable targets', verifyHotkeysOutsideEditableTargets);
  it(
    'does not intercept hotkeys inside editable targets or during inline edit sessions',
    verifyEditableTargetBypass
  );
  it(
    'does not render or bind hotkeys when page preparation mode is off',
    verifyDisabledPreparationMode
  );
  it('refreshes button state from the subscribed history store', verifySubscribedStateRefresh);
  it(
    'keeps undo and redo disabled until a document-mode transaction closes',
    verifyOpenTransactionBlocksHistoryControls
  );
});
