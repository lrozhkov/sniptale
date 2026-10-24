// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pagePreparationHistory,
  type PagePreparationHistoryDomain,
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
let domainStates: Partial<Record<PagePreparationHistoryDomain, typeof historyState>> = {};
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
  vi.spyOn(pagePreparationHistory, 'getState').mockImplementation((domain) =>
    domain ? (domainStates[domain] ?? historyState) : historyState
  );
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
  domainStates = {};
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
  it.each([
    {
      scope: 'drawing',
      domain: 'drawing',
      undo: 'content.toolbar.undoDrawing',
      redo: 'content.toolbar.redoDrawing',
    },
    {
      scope: 'annotation',
      domain: 'annotation',
      undo: 'content.toolbar.undoAnnotation',
      redo: 'content.toolbar.redoAnnotation',
    },
    {
      scope: 'content-editing',
      domain: 'page-editing',
      undo: 'content.toolbar.undoPageEdit',
      redo: 'content.toolbar.redoPageEdit',
    },
    {
      scope: 'design-review',
      domain: 'page-editing',
      undo: 'content.toolbar.undoPageEdit',
      redo: 'content.toolbar.redoPageEdit',
    },
    { scope: 'all', domain: undefined, undo: 'editor.toolbar.undo', redo: 'editor.toolbar.redo' },
  ] as const)('routes buttons and shortcuts to $scope with translated action names', (entry) => {
    historyState = { canRedo: true, canUndo: true, revision: 1 };
    renderComponent(true, {
      canClearPagePreparation: false,
      onClearPagePreparation: vi.fn(),
      resetScope: entry.scope,
    });
    const undo = container?.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.history-undo-button"]'
    );
    const redo = container?.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.history-redo-button"]'
    );
    expect(undo?.getAttribute('aria-label')).toBe(entry.undo);
    expect(undo?.getAttribute('title')).toBe(entry.undo);
    expect(redo?.getAttribute('aria-label')).toBe(entry.redo);
    expect(redo?.getAttribute('title')).toBe(entry.redo);
    act(() => undo?.click());
    act(() => redo?.click());

    for (const shortcut of [
      { code: 'KeyZ', key: 'z', ctrlKey: true },
      { code: 'KeyZ', key: 'z', metaKey: true },
      { code: 'KeyZ', key: 'z', ctrlKey: true, shiftKey: true },
      { code: 'KeyZ', key: 'z', metaKey: true, shiftKey: true },
      { code: 'KeyY', key: 'y', ctrlKey: true },
    ]) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...shortcut });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(pagePreparationHistory.undo).toHaveBeenCalledTimes(3);
    expect(pagePreparationHistory.redo).toHaveBeenCalledTimes(4);
    for (const call of vi.mocked(pagePreparationHistory.undo).mock.calls)
      expect(call).toEqual([entry.domain]);
    for (const call of vi.mocked(pagePreparationHistory.redo).mock.calls)
      expect(call).toEqual([entry.domain]);
  });
  it('refreshes selected-domain availability on a scope change without a history revision', () => {
    historyState = { canRedo: true, canUndo: true, revision: 5 };
    domainStates = {
      drawing: { canRedo: true, canUndo: false, revision: 5 },
      annotation: { canRedo: false, canUndo: false, revision: 5 },
      'page-editing': { canRedo: false, canUndo: true, revision: 5 },
    };
    const renderScope = (resetScope: PagePreparationResetScope) =>
      renderComponent(true, {
        canClearPagePreparation: false,
        onClearPagePreparation: vi.fn(),
        resetScope,
      });
    const disabled = (action: 'undo' | 'redo') =>
      container?.querySelector<HTMLButtonElement>(
        `[data-ui="content.toolbar.history-${action}-button"]`
      )?.disabled;
    renderScope('drawing');
    expect(disabled('undo')).toBe(true);
    expect(disabled('redo')).toBe(false);
    renderScope('annotation');
    expect(disabled('undo')).toBe(true);
    expect(disabled('redo')).toBe(true);
    const unavailableUndo = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyZ',
      ctrlKey: true,
      key: 'z',
    });
    document.body.dispatchEvent(unavailableUndo);
    expect(unavailableUndo.defaultPrevented).toBe(false);
    expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
    renderScope('content-editing');
    expect(disabled('undo')).toBe(false);
    expect(disabled('redo')).toBe(true);
    renderScope('design-review');
    expect(disabled('undo')).toBe(false);
    expect(disabled('redo')).toBe(true);
    renderScope('drawing');
    expect(disabled('undo')).toBe(true);
    expect(disabled('redo')).toBe(false);
  });
  it.each([true, false])(
    'does not intercept navigation hotkeys with screenshotMode=%s',
    (screenshotMode) => {
      historyState = { canRedo: true, canUndo: true, revision: 1 };
      renderComponent(
        screenshotMode,
        {
          canClearPagePreparation: true,
          onClearPagePreparation: vi.fn(),
          resetScope: 'drawing',
        },
        true
      );
      for (const shortcut of [
        { code: 'KeyZ', key: 'z', ctrlKey: true },
        { code: 'KeyZ', key: 'z', metaKey: true, shiftKey: true },
        { code: 'KeyY', key: 'y', ctrlKey: true },
      ]) {
        const event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...shortcut,
        });
        document.body.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
      expect(
        container?.querySelector('[data-ui="content.toolbar.history-undo-button"]')
      ).toBeNull();
      expect(
        container?.querySelector('[data-ui="content.toolbar.history-redo-button"]')
      ).toBeNull();
      expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
      expect(pagePreparationHistory.redo).not.toHaveBeenCalled();
    }
  );
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

it('leaves history keys inside a Shadow DOM text editor to native text history', () => {
  historyState = { canRedo: true, canUndo: true, revision: 1 };
  renderComponent(true, {
    canClearPagePreparation: false,
    onClearPagePreparation: vi.fn(),
    resetScope: 'drawing',
  });
  const host = document.createElement('div');
  document.body.append(host);
  const input = document.createElement('textarea');
  host.attachShadow({ mode: 'open' }).append(input);
  const event = new KeyboardEvent('keydown', {
    key: 'z',
    code: 'KeyZ',
    ctrlKey: true,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  act(() => input.dispatchEvent(event));
  expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});

it('does not turn an unavailable Redo shortcut into Undo', () => {
  historyState = { canRedo: false, canUndo: true, revision: 1 };
  renderComponent(true, {
    canClearPagePreparation: false,
    onClearPagePreparation: vi.fn(),
    resetScope: 'drawing',
  });
  const event = new KeyboardEvent('keydown', {
    key: 'z',
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => document.body.dispatchEvent(event));
  expect(pagePreparationHistory.undo).not.toHaveBeenCalled();
  expect(pagePreparationHistory.redo).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});
