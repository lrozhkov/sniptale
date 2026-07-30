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
  type PagePreparationSessionSnapshot,
} from '../../../parser/page-preparation/history';
import { clearAllSniptaleIds } from '../../../platform/frame';
import { createQuickEditHistoryTracker } from '../../../selection/quick-edit-runtime/history';
import { createQuickEditDocumentModeHistoryTracker } from '../../../selection/quick-edit-runtime/document-mode.history';
import { ToolbarHistoryControls } from './history';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./local-save', () => ({
  ToolbarLocalSaveControl: () => null,
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
    root.render(<ToolbarHistoryControls screenshotMode />);
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
    root.render(<ToolbarHistoryControls screenshotMode />);
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
    root.render(<ToolbarHistoryControls screenshotMode />);
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
