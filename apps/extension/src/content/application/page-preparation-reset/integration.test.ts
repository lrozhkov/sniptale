// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createPagePreparationDrawingSession } from '../../drawing/history';
import { createPagePreparationHistoryStore } from '../../parser/page-preparation/history/store';
import type { PagePreparationSessionSnapshot } from '../../parser/page-preparation/history/types';
import { clearAllPagePreparationChanges } from './index';

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

it('resets interleaved page and Drawing changes from the shared editing session', () => {
  const history = createPagePreparationHistoryStore();
  let pageSnapshot = createSnapshot('before');
  history.registerBridge({
    applySnapshot: (snapshot) => {
      pageSnapshot = snapshot;
    },
    captureSnapshot: () => pageSnapshot,
  });
  const session = createPagePreparationDrawingSession(history);
  session.commitObject({
    id: 'first',
    kind: 'blur',
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  });
  const beforePageChange = pageSnapshot;
  pageSnapshot = createSnapshot('after');
  history.commitEntry({ before: beforePageChange, after: pageSnapshot });
  session.commitObject({
    id: 'second',
    kind: 'blur',
    bounds: { x: 10, y: 0, width: 10, height: 10 },
  });
  const clearHighlights = vi.fn();
  const resetAnnotations = vi.fn();

  expect(clearAllPagePreparationChanges({ clearHighlights, history, resetAnnotations })).toBe(true);

  expect(pageSnapshot.frameSession.stepBadgeOrder).toEqual([['before', 0]]);
  expect(session.getSnapshot().document.objects).toEqual([]);
  expect(history.getState()).toMatchObject({ canRedo: false, canUndo: false });
  expect(clearHighlights).toHaveBeenCalledOnce();
  expect(resetAnnotations).toHaveBeenCalledOnce();
});
