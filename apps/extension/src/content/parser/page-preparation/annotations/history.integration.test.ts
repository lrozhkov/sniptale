// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createFrameDataFixture } from '../../../selection/frame-runtime/test-support';
import { createPagePreparationHistoryStore } from '../history/store';
import type { FrameSessionSnapshot, PagePreparationSessionSnapshot } from '../history/types';
import { createBrowserAnnotationSession } from './session';
import type { BrowserAnnotationTargetEvidence } from './types';

function createEvidence(locator: string): BrowserAnnotationTargetEvidence {
  return {
    fileLabel: 'Target',
    frame: { kind: 'top-document' },
    locator,
    nodePosition: { x: 20, y: 30 },
    pageUrl: 'https://example.test/page',
    targetPath: 'main > button',
    targetRole: 'button',
    targetSelector: locator,
    targetText: 'Target',
    viewport: { height: 720, width: 1280 },
  };
}

function createFrameSnapshot(frameIds: readonly string[] = []): FrameSessionSnapshot {
  return {
    frames: frameIds.map((frameId) => createFrameDataFixture(frameId)),
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

describe('browser annotation history integration', () => {
  it('skips allocator-only history entries without reusing identifiers', () => {
    const session = createBrowserAnnotationSession();
    const store = createPagePreparationHistoryStore();
    const frameSession = createFrameSnapshot();
    store.registerBridge({
      applySnapshot: (snapshot) => session.applySnapshot(snapshot.annotations),
      captureSnapshot: (): PagePreparationSessionSnapshot => ({
        annotations: session.captureSnapshot(),
        frameSession,
      }),
    });
    const first = createEvidence('#first');

    store.beginTransaction('comment-edit');
    session.setComment({ comment: 'Temporary', evidence: first, targetKey: first.locator });
    session.setComment({ comment: '', evidence: first, targetKey: first.locator });
    store.commitTransaction('comment-edit');

    expect(store.getState()).toMatchObject({ canRedo: false, canUndo: false });

    const second = createEvidence('#second');
    expect(
      session.setComment({ comment: 'Persistent', evidence: second, targetKey: second.locator })
    ).toBe(2);
    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({
        annotationId: 2,
        commentMarker: 2,
        creationOrder: 2,
        targetKey: second.locator,
      }),
    ]);
  });

  it('restores frame creation order through add, remove, re-add, undo, and redo', () => {
    const session = createBrowserAnnotationSession();
    const store = createPagePreparationHistoryStore();
    let frameSession = createFrameSnapshot();
    store.registerBridge({
      applySnapshot: (snapshot) => {
        frameSession = snapshot.frameSession;
        session.applySnapshot(snapshot.annotations);
      },
      captureSnapshot: (): PagePreparationSessionSnapshot => ({
        annotations: session.captureSnapshot(),
        frameSession,
      }),
    });

    store.beginTransaction('add-frame');
    frameSession = createFrameSnapshot(['frame-1']);
    session.syncFrameIds(['frame-1']);
    store.commitTransaction('add-frame');
    expect(session.captureSnapshot().frameOrders).toEqual([
      { creationOrder: 1, frameId: 'frame-1' },
    ]);

    store.beginTransaction('remove-frame');
    frameSession = createFrameSnapshot();
    session.syncFrameIds([]);
    store.commitTransaction('remove-frame');

    store.beginTransaction('re-add-frame');
    frameSession = createFrameSnapshot(['frame-1']);
    session.syncFrameIds(['frame-1']);
    store.commitTransaction('re-add-frame');
    expect(session.captureSnapshot().frameOrders).toEqual([
      { creationOrder: 2, frameId: 'frame-1' },
    ]);

    store.undo();
    expect(session.captureSnapshot().frameOrders).toEqual([]);
    store.undo();
    expect(session.captureSnapshot().frameOrders).toEqual([
      { creationOrder: 1, frameId: 'frame-1' },
    ]);
    store.redo();
    expect(session.captureSnapshot().frameOrders).toEqual([]);
    store.redo();
    expect(session.captureSnapshot().frameOrders).toEqual([
      { creationOrder: 2, frameId: 'frame-1' },
    ]);
  });
});
