// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import {
  addPagePreparationHistoryAppliedListener,
  pagePreparationHistory,
  type FrameSessionSnapshot,
  type PagePreparationHistoryBridge,
  type PagePreparationResetScope,
  type PagePreparationSessionSnapshot,
} from '../../../parser/page-preparation/history';
import { createPagePreparationDrawingSession } from '../../../drawing/history';
import { clearAllSniptaleIds } from '../../../platform/frame';
import { createQuickEditHistoryTracker } from '../../../selection/quick-edit-runtime/history';
import { createQuickEditDocumentModeHistoryTracker } from '../../../selection/quick-edit-runtime/document-mode.history';
import { ToolbarHistoryControls } from './history';
import { useToolbarMenuState } from '../state/menu';

function HistoryHarness(props: { resetScope?: PagePreparationResetScope }) {
  const toolbarMenuState = useToolbarMenuState();
  return (
    <ToolbarHistoryControls
      screenshotMode
      resetScope={props.resetScope ?? 'all'}
      displayMode="horizontal"
      toolbarMenuState={toolbarMenuState}
    />
  );
}

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createFrameSnapshot(): FrameSessionSnapshot {
  return {
    frames: [],
    globalEffectMode: 'border',
    globalStepBadgeSettings: { autoMode: true },
    sessionBorderPreset: DEFAULT_BORDER_PRESET,
    sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    sessionCalloutStyle: null,
    sessionFocusSettings: { opacity: 0.5, showBorder: false },
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: [],
  };
}

function createSnapshot(): PagePreparationSessionSnapshot {
  return {
    annotations: {
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextMarkerNumber: 1,
      nextCreationOrder: 1,
      schemaVersion: 1,
    },
    frameSession: createFrameSnapshot(),
  };
}

let bridge: PagePreparationHistoryBridge;
let container: HTMLDivElement;
let root: Root;
const historyListenerCleanups: Array<() => void> = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  pagePreparationHistory.clear();
  const snapshot = createSnapshot();
  bridge = {
    applySnapshot: vi.fn(),
    captureSnapshot: () => structuredClone(snapshot),
  };
  pagePreparationHistory.registerBridge(bridge);

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  historyListenerCleanups.splice(0).forEach((cleanup) => cleanup());
  pagePreparationHistory.unregisterBridge(bridge);
  pagePreparationHistory.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('replays a finished Page Edit text change through the toolbar redo button', () => {
  const target = document.createElement('p');
  target.textContent = 'Before';
  document.body.append(target);

  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'edit-1');
  target.textContent = 'After';
  tracker.commit(target, 'edit-1');

  act(() => {
    root.render(<HistoryHarness />);
  });

  const undoButton = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-undo-button"]'
  );
  const redoButton = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-redo-button"]'
  );

  act(() => undoButton?.click());
  expect(target.textContent).toBe('Before');
  expect(redoButton?.disabled).toBe(false);

  act(() => redoButton?.click());
  expect(target.textContent).toBe('After');
  expect(redoButton?.disabled).toBe(true);
});

it('replays a finished direct-on-page text change through the toolbar redo button', () => {
  const target = document.createElement('p');
  target.textContent = 'Before';
  document.body.append(target);

  const tracker = createQuickEditDocumentModeHistoryTracker();
  tracker.begin();
  target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));
  target.textContent = 'After';
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  tracker.commit();

  act(() => {
    root.render(<HistoryHarness />);
  });

  const undoButton = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-undo-button"]'
  );
  const redoButton = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-redo-button"]'
  );

  act(() => undoButton?.click());
  expect(target.textContent).toBe('Before');
  expect(redoButton?.disabled).toBe(false);

  act(() => redoButton?.click());
  expect(target.textContent).toBe('After');
  expect(redoButton?.disabled).toBe(true);
});

it('keeps Page Edit redo locators when AI cleanup clears transient ids', () => {
  const target = document.createElement('p');
  target.dataset['sniptaleId'] = 'parsed-field-1';
  target.textContent = 'Before';
  document.body.append(target);
  historyListenerCleanups.push(addPagePreparationHistoryAppliedListener(clearAllSniptaleIds));

  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'edit-with-transient-cleanup');
  target.textContent = 'After';
  tracker.commit(target, 'edit-with-transient-cleanup');

  act(() => {
    root.render(<HistoryHarness />);
  });
  const undoButton = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-undo-button"]'
  );
  const redoButton = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-redo-button"]'
  );

  act(() => undoButton?.click());
  expect(target.textContent).toBe('Before');
  expect(redoButton?.disabled).toBe(false);

  act(() => redoButton?.click());
  expect(target.textContent).toBe('After');
  act(() => {
    pagePreparationHistory.clear();
  });
  expect(target.dataset['sniptaleId']).toBeUndefined();
});

it('keeps Drawing and Quick Edit independent through mounted scope switches, buttons, and shortcuts', () => {
  const target = document.createElement('p');
  target.textContent = 'Original';
  document.body.append(target);
  const drawing = createPagePreparationDrawingSession(pagePreparationHistory);
  const tracker = createQuickEditHistoryTracker();
  const edit = (value: string, id: string) => {
    act(() => {
      tracker.begin(target, id);
      target.textContent = value;
      tracker.commit(target, id);
    });
  };
  const renderScope = (resetScope: PagePreparationResetScope) => {
    act(() => root.render(<HistoryHarness resetScope={resetScope} />));
  };
  const button = (action: 'undo' | 'redo') => {
    const control = container.querySelector<HTMLButtonElement>(
      `[data-ui="content.toolbar.history-${action}-button"]`
    );
    if (!control) throw new Error(`Missing history ${action} control`);
    return control;
  };
  const shortcut = (
    key: string,
    options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
  ) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: key === 'y' ? 'KeyY' : 'KeyZ',
      key,
      ...options,
    });
    act(() => {
      document.body.dispatchEvent(event);
    });
    return event.defaultPrevented;
  };
  const drawingIds = () => drawing.getSnapshot().document.objects.map(({ id }) => id);
  try {
    drawing.commitObject({
      id: 'independent-drawing',
      kind: 'blur',
      bounds: { x: 10, y: 20, width: 30, height: 40 },
    });
    edit('First edit', 'first-text');
    renderScope('drawing');
    expect(shortcut('z', { ctrlKey: true })).toBe(true);
    expect(drawingIds()).toEqual([]);
    expect(target.textContent).toBe('First edit');
    expect(button('undo').disabled).toBe(true);
    expect(button('redo').disabled).toBe(false);

    renderScope('content-editing');
    expect(button('undo').disabled).toBe(false);
    expect(button('redo').disabled).toBe(true);
    edit('Second edit', 'second-text');
    renderScope('drawing');
    expect(button('undo').disabled).toBe(true);
    expect(button('redo').disabled).toBe(false);
    expect(shortcut('y', { ctrlKey: true })).toBe(true);
    expect(drawingIds()).toEqual(['independent-drawing']);
    expect(target.textContent).toBe('Second edit');

    renderScope('content-editing');
    act(() => button('undo').click());
    expect(target.textContent).toBe('First edit');
    expect(drawingIds()).toEqual(['independent-drawing']);
    renderScope('design-review');
    expect(button('redo').disabled).toBe(false);
    act(() => button('redo').click());
    expect(target.textContent).toBe('Second edit');

    renderScope('annotation');
    expect(button('undo').disabled).toBe(true);
    expect(button('redo').disabled).toBe(true);
    expect(shortcut('z', { ctrlKey: true })).toBe(false);
    expect(target.textContent).toBe('Second edit');
    expect(drawingIds()).toEqual(['independent-drawing']);

    renderScope('drawing');
    act(() => button('undo').click());
    expect(drawingIds()).toEqual([]);
    expect(target.textContent).toBe('Second edit');
    renderScope('content-editing');
    expect(shortcut('z', { metaKey: true })).toBe(true);
    expect(target.textContent).toBe('First edit');
    expect(drawingIds()).toEqual([]);
    expect(shortcut('z', { metaKey: true, shiftKey: true })).toBe(true);
    expect(target.textContent).toBe('Second edit');
    renderScope('drawing');
    act(() => button('redo').click());
    expect(drawingIds()).toEqual(['independent-drawing']);
    expect(target.textContent).toBe('Second edit');
  } finally {
    drawing.dispose();
  }
});
