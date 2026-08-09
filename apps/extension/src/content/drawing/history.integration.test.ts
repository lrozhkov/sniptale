// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../features/highlighter/style/defaults';
import { createPagePreparationHistoryStore } from '../parser/page-preparation/history/store';
import { pagePreparationHistory } from '../parser/page-preparation/history';
import type { PagePreparationSessionSnapshot } from '../parser/page-preparation/history/types';
import { ToolbarHistoryControls } from '../overlay/toolbar/capture/history';
import type { ContentDrawingController } from './controller';
import { createPagePreparationDrawingSession } from './history';
import { createDrawingModeController } from './mode';

function createSnapshot(label: string): PagePreparationSessionSnapshot {
  return {
    annotations: {
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCreationOrder: 1,
      nextMarkerNumber: 1,
      schemaVersion: 1,
    },
    frameSession: {
      frames: [],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: [[label, 0]],
    },
  };
}

function createBlur(id: string) {
  return {
    id,
    kind: 'blur' as const,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  };
}

function registerSnapshotBridge(history: ReturnType<typeof createPagePreparationHistoryStore>) {
  let pageSnapshot = createSnapshot('bridge');
  history.registerBridge({
    applySnapshot: (snapshot) => {
      pageSnapshot = snapshot;
    },
    captureSnapshot: () => pageSnapshot,
  });
}

it('replays page and Drawing operations through one chronological history', () => {
  const history = createPagePreparationHistoryStore();
  let pageSnapshot = createSnapshot('page-before');
  history.registerBridge({
    applySnapshot: (snapshot) => {
      pageSnapshot = snapshot;
    },
    captureSnapshot: () => pageSnapshot,
  });
  const session = createPagePreparationDrawingSession(history);

  session.commitObject(createBlur('first'));
  const beforePageChange = pageSnapshot;
  pageSnapshot = createSnapshot('page-after');
  history.commitEntry({ after: pageSnapshot, before: beforePageChange });
  session.commitObject(createBlur('second'));

  history.undo();
  expect(session.getSnapshot().document.objects.map(({ id }) => id)).toEqual(['first']);
  history.undo();
  expect(pageSnapshot.frameSession.stepBadgeOrder).toEqual([['page-before', 0]]);
  history.undo();
  expect(session.getSnapshot().document.objects).toEqual([]);

  history.redo();
  history.redo();
  history.redo();
  expect(pageSnapshot.frameSession.stepBadgeOrder).toEqual([['page-after', 0]]);
  expect(session.getSnapshot().document.objects.map(({ id }) => id)).toEqual(['first', 'second']);
});

it('rejects a Drawing mutation when shared history has no active preparation bridge', () => {
  const session = createPagePreparationDrawingSession(createPagePreparationHistoryStore());
  session.commitObject(createBlur('untracked'));
  expect(session.getSnapshot().document.objects).toEqual([]);
});

it('keeps document and cursor consistent when a subscriber undoes during commit publication', () => {
  const history = createPagePreparationHistoryStore();
  registerSnapshotBridge(history);
  const session = createPagePreparationDrawingSession(history);
  let undoDuringPublication = true;
  history.subscribe(() => {
    if (undoDuringPublication && history.getState().canUndo) {
      undoDuringPublication = false;
      history.undo();
    }
  });

  session.commitObject(createBlur('reentrant'));

  expect(session.getSnapshot().document.objects).toEqual([]);
  expect(history.getState()).toMatchObject({ canRedo: true, canUndo: false });
});

it('clears the Drawing document when the shared history is cleared', () => {
  const history = createPagePreparationHistoryStore();
  registerSnapshotBridge(history);
  const session = createPagePreparationDrawingSession(history);
  session.commitObject(createBlur('cleared'));

  history.clear();

  expect(session.getSnapshot().document.objects).toEqual([]);
  expect(history.getState()).toMatchObject({ canRedo: false, canUndo: false });
});

it('keeps document and cursor empty when a subscriber clears history during commit publication', () => {
  const history = createPagePreparationHistoryStore();
  registerSnapshotBridge(history);
  const session = createPagePreparationDrawingSession(history);
  let clearDuringPublication = true;
  history.subscribe(() => {
    if (clearDuringPublication && history.getState().canUndo) {
      clearDuringPublication = false;
      history.clear();
    }
  });

  session.commitObject(createBlur('reentrant-clear'));

  expect(session.getSnapshot().document.objects).toEqual([]);
  expect(history.getState()).toMatchObject({ canRedo: false, canUndo: false });
});

it.each(['undo', 'redo'] as const)(
  'rejects nested clear and navigation while a Drawing %s replay is applying',
  (direction) => {
    const history = createPagePreparationHistoryStore();
    registerSnapshotBridge(history);
    const session = createPagePreparationDrawingSession(history);
    session.commitObject(createBlur('first'));
    session.commitObject(createBlur('second'));
    if (direction === 'redo') {
      history.undo();
      history.undo();
    }
    let nestedMutationAttempted = false;
    session.subscribe(() => {
      if (nestedMutationAttempted) return;
      nestedMutationAttempted = true;
      history.clear();
      history.undo();
      history.redo();
    });

    history[direction]();

    expect(nestedMutationAttempted).toBe(true);
    expect(session.getSnapshot().document.objects.map(({ id }) => id)).toEqual(['first']);
    expect(history.getState()).toMatchObject({ canRedo: true, canUndo: true });
  }
);

it('preserves shared Drawing replay across screenshot-mode transitions', () => {
  const history = createPagePreparationHistoryStore();
  registerSnapshotBridge(history);
  const session = createPagePreparationDrawingSession(history);
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => [],
    getScrollRoot: () => ({ element: null, kind: 'viewport' }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const baseModeController = {
    handleClearHighlights: vi.fn(),
    handleEnableCursorMode: vi.fn(() => true),
    handleHideToolbar: vi.fn(),
    handleToggleDesignReviewMode: vi.fn(),
    handleToggleHighlighterMode: vi.fn(),
    handleToggleNavigationLock: vi.fn(),
    handleToggleQuickEditDocumentMode: vi.fn(),
    handleToggleQuickEditMode: vi.fn(),
    handleToggleScreenshotMode: vi.fn(),
  };
  const mode = createDrawingModeController({
    baseModeController,
    controller,
    disableDrawing: vi.fn(),
    onUnavailable: vi.fn(),
    setDrawingMode: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  });

  mode.handleToggleDrawingMode?.(true);
  session.commitObject(createBlur('across-mode'));
  mode.handleToggleScreenshotMode(false);
  mode.handleToggleScreenshotMode(true);
  mode.handleToggleDrawingMode?.(true);
  history.undo();
  expect(session.getSnapshot().document.objects).toEqual([]);
  history.redo();
  expect(session.getSnapshot().document.objects.map(({ id }) => id)).toEqual(['across-mode']);
});

it('keeps the shared history cursor stable when a disposed Drawing effect cannot replay', () => {
  const history = createPagePreparationHistoryStore();
  registerSnapshotBridge(history);
  const session = createPagePreparationDrawingSession(history);
  session.commitObject(createBlur('disposed'));
  expect(history.getState()).toMatchObject({ canRedo: false, canUndo: true });

  session.dispose();
  history.undo();

  expect(history.getState()).toMatchObject({ canRedo: false, canUndo: true });
});

it('drives Drawing undo and redo through the existing toolbar history controls', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let pageSnapshot = createSnapshot('toolbar');
  const bridge = {
    applySnapshot: (snapshot: PagePreparationSessionSnapshot) => {
      pageSnapshot = snapshot;
    },
    captureSnapshot: () => pageSnapshot,
  };
  pagePreparationHistory.clear();
  pagePreparationHistory.registerBridge(bridge);
  const session = createPagePreparationDrawingSession();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => root.render(createElement(ToolbarHistoryControls, { screenshotMode: true })));
  act(() => session.commitObject(createBlur('toolbar-drawing')));
  const undo = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-undo-button"]'
  );
  const redo = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.history-redo-button"]'
  );
  expect(undo?.disabled).toBe(false);
  act(() => undo?.click());
  expect(session.getSnapshot().document.objects).toEqual([]);
  expect(redo?.disabled).toBe(false);
  act(() => redo?.click());
  expect(session.getSnapshot().document.objects.map(({ id }) => id)).toEqual(['toolbar-drawing']);

  act(() => root.unmount());
  host.remove();
  pagePreparationHistory.unregisterBridge(bridge);
  pagePreparationHistory.clear();
  vi.unstubAllGlobals();
});
