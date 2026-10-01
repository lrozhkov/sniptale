// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pagePreparationHistory,
  type PagePreparationResetScope,
} from '../../../parser/page-preparation/history';
import { ToolbarHistoryControls } from './history';
import { useToolbarMenuState } from '../state/menu';

function HistoryHarness(
  props: Omit<Parameters<typeof ToolbarHistoryControls>[0], 'displayMode' | 'toolbarMenuState'>
) {
  const toolbarMenuState = useToolbarMenuState();
  return (
    <ToolbarHistoryControls
      {...props}
      displayMode="horizontal"
      toolbarMenuState={toolbarMenuState}
    />
  );
}
import { dispatchFrameEditingChanged } from '../../../platform/page-context/mode-events';

// Vitest exposes the active JSDOM instance for URL changes without recreating the environment.
declare const jsdom: { reconfigure(options: { url: string }): void };

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let historyState = { canRedo: false, canUndo: false, revision: 0 };
let openTransactions = false;
let listener: (() => void) | null = null;

function renderComponent(
  screenshotMode = true,
  reset: {
    canClearPagePreparation: boolean;
    onClearPagePreparation: () => void;
    resetScope?: PagePreparationResetScope;
  } = {
    canClearPagePreparation: false,
    onClearPagePreparation: () => undefined,
  },
  isNavigationMode = false
) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <HistoryHarness
        screenshotMode={screenshotMode}
        isNavigationMode={isNavigationMode}
        {...reset}
      />
    );
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

  expect(container?.querySelector('[data-ui="content.toolbar.reset-all-button"]')).not.toBeNull();
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

function verifyFrameEditingBlocksHistoryControls() {
  historyState = { canRedo: true, canUndo: true, revision: 1 };
  renderComponent();

  act(() => dispatchFrameEditingChanged({ active: true }));

  const undoButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-undo-button"]'
  );
  const redoButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-redo-button"]'
  );
  expect(undoButton?.disabled).toBe(true);
  expect(redoButton?.disabled).toBe(true);

  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, code: 'KeyZ', ctrlKey: true, key: 'z' })
  );
  expect(pagePreparationHistory.undo).not.toHaveBeenCalled();

  act(() => dispatchFrameEditingChanged({ active: false }));
  expect(undoButton?.disabled).toBe(false);
  expect(redoButton?.disabled).toBe(false);
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
  it('does not bind hotkeys when page preparation mode is off', verifyDisabledPreparationMode);
  it('places reset beside undo and redo and runs it outside screenshot mode', () => {
    const onClearPagePreparation = vi.fn();
    renderComponent(false, { canClearPagePreparation: true, onClearPagePreparation });

    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    expect(buttons.map((button) => button.dataset['ui'])).toEqual([
      'content.toolbar.history-undo-button',
      'content.toolbar.history-redo-button',
      'content.toolbar.reset-all-button',
    ]);
    const reset = buttons[2];
    expect(reset?.querySelector('svg')?.classList.contains('lucide-rotate-ccw')).toBe(true);
    expect(reset?.getAttribute('title')).toBe('content.toolbar.clearPagePreparation');
    act(() => reset?.click());
    expect(onClearPagePreparation).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
  });
  it('refreshes button state from the subscribed history store', verifySubscribedStateRefresh);
  it('offers reset for committed changes while an editor keeps a transaction open', () => {
    historyState = { canRedo: false, canUndo: true, revision: 1 };
    openTransactions = true;
    renderComponent(true, { canClearPagePreparation: true, onClearPagePreparation: vi.fn() });
    expect(
      container?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.reset-all-button"]')
        ?.disabled
    ).toBe(false);
  });
  it('shows only Reset all in ordinary navigation and keeps shared history', () => {
    historyState = { canRedo: true, canUndo: true, revision: 2 };
    renderComponent(
      false,
      { canClearPagePreparation: true, onClearPagePreparation: vi.fn() },
      true
    );
    expect(
      Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).map(
        (button) => button.dataset['ui']
      )
    ).toEqual(['content.toolbar.reset-all-button']);
    expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
    expect(pagePreparationHistory.redo).not.toHaveBeenCalled();
  });
  it(
    'keeps undo and redo disabled until a document-mode transaction closes',
    verifyOpenTransactionBlocksHistoryControls
  );
  it(
    'keeps undo and redo disabled while a frame is being edited',
    verifyFrameEditingBlocksHistoryControls
  );
});

const resetScopes: readonly PagePreparationResetScope[] = [
  'all',
  'drawing',
  'annotation',
  'content-editing',
  'design-review',
];
it.each(resetScopes)(
  'omits local file save in %s mode after mode switches and reopening',
  (resetScope) => {
    const originalUrl = window.location.href;
    jsdom.reconfigure({ url: 'file:///tmp/prepared-page.html' });
    expect(window.location.protocol).toBe('file:');
    const picker = vi.fn();
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker });
    const reset = { canClearPagePreparation: true, onClearPagePreparation: vi.fn(), resetScope };
    const assertActions = (navigation: boolean) => {
      expect(
        container?.querySelector('[data-ui="content.toolbar.local-html-save-button"]')
      ).toBeNull();
      expect(container?.querySelectorAll('button')).toHaveLength(navigation ? 1 : 3);
      expect(
        container?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.reset-all-button"]')
          ?.disabled
      ).toBe(false);
    };
    try {
      renderComponent(true, reset);
      assertActions(false);
      renderComponent(false, reset, true);
      assertActions(true);
      act(() => root?.unmount());
      root = null;
      container?.remove();
      container = null;
      renderComponent(true, reset);
      assertActions(false);
      expect(picker).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(window, 'showSaveFilePicker');
      jsdom.reconfigure({ url: originalUrl });
    }
  }
);
