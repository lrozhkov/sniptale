// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import {
  browserAnnotationSession,
  formatBrowserAnnotationSnapshot,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type {
  FrameSessionSnapshot,
  PagePreparationHistoryBridge,
} from '../../../parser/page-preparation/history/types';
import { applyPageStylePatchWithHistory } from './actions';
import { commitPropertiesComment, readPropertiesComment } from './comment';
import {
  commitDesignReviewAction,
  deleteDesignReviewRecord,
  readDesignReviewRecord,
  serializeDesignReviewRecord,
} from './record';

function createEvidence(selector = '#target'): BrowserAnnotationTargetEvidence {
  return {
    fileLabel: 'Target',
    frame: { kind: 'top-document' },
    locator: selector,
    nodePosition: { x: 20, y: 30 },
    pageUrl: 'https://example.test/page',
    targetPath: 'main > button',
    targetRole: 'button',
    targetSelector: selector,
    targetText: 'Target',
    viewport: { height: 720, width: 1280 },
  };
}

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

let bridge: PagePreparationHistoryBridge;

beforeEach(() => {
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  pagePreparationHistory.clear();
  const frameSession = createFrameSnapshot();
  bridge = {
    applySnapshot: (snapshot) => browserAnnotationSession.applySnapshot(snapshot.annotations),
    captureSnapshot: () => ({
      annotations: browserAnnotationSession.captureSnapshot(),
      frameSession,
    }),
  };
  pagePreparationHistory.registerBridge(bridge);
});

afterEach(() => {
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Properties comment producer', () => {
  it('flushes an older style transaction before recording the comment transaction', async () => {
    const target = document.createElement('div');
    const rect = DOMRect.fromRect({ height: 40, width: 80 });
    Object.defineProperty(target, 'getClientRects', {
      configurable: true,
      value: () => ({
        0: rect,
        [Symbol.iterator]: () => [rect][Symbol.iterator](),
        item: (index: number) => (index === 0 ? rect : null),
        length: 1,
      }),
    });
    document.body.append(target);

    await applyPageStylePatchWithHistory({
      element: target,
      patch: { declarations: [{ property: 'color', value: 'red' }] },
    });
    expect(pagePreparationHistory.hasOpenTransactions()).toBe(true);

    commitPropertiesComment({ comment: 'After style', evidence: createEvidence(), target });
    expect(pagePreparationHistory.hasOpenTransactions()).toBe(false);

    pagePreparationHistory.undo();
    expect(readPropertiesComment(target)).toEqual({ comment: '', marker: 1 });
    expect(target.style.color).toBe('red');
    expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges).toHaveLength(
      1
    );

    pagePreparationHistory.undo();
    expect(target.style.color).toBe('');
    expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  });

  it('commits through history and preserves the original number across remove/re-add undo/redo', () => {
    const target = document.createElement('button');
    const evidence = createEvidence();

    expect(commitPropertiesComment({ comment: 'First', evidence, target })).toBe(1);
    expect(commitPropertiesComment({ comment: '', evidence, target })).toBeNull();
    expect(commitPropertiesComment({ comment: 'Again', evidence, target })).toBe(2);
    expect(readPropertiesComment(target)).toEqual({ comment: 'Again', marker: 2 });

    pagePreparationHistory.undo();
    expect(readPropertiesComment(target)).toEqual({ comment: '', marker: null });
    pagePreparationHistory.undo();
    expect(readPropertiesComment(target)).toEqual({ comment: 'First', marker: 1 });
    pagePreparationHistory.redo();
    expect(readPropertiesComment(target)).toEqual({ comment: '', marker: null });
    pagePreparationHistory.redo();
    expect(readPropertiesComment(target)).toEqual({ comment: 'Again', marker: 2 });
  });

  it('deduplicates an unchanged comment instead of adding another history entry', () => {
    const target = document.createElement('div');
    const evidence = createEvidence();

    commitPropertiesComment({ comment: 'Stable', evidence, target });
    commitPropertiesComment({ comment: 'Stable', evidence, target });
    pagePreparationHistory.undo();

    expect(readPropertiesComment(target)).toEqual({ comment: '', marker: null });
    expect(pagePreparationHistory.getState().canUndo).toBe(false);
  });

  it('rolls session evidence back when the history commit fails', () => {
    const target = document.createElement('div');
    const evidence = createEvidence();
    vi.spyOn(pagePreparationHistory, 'commitTransaction').mockImplementationOnce(() => {
      throw new Error('history failed');
    });

    expect(() => commitPropertiesComment({ comment: 'Not committed', evidence, target })).toThrow(
      'history failed'
    );
    expect(readPropertiesComment(target)).toEqual({ comment: '', marker: null });
    expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
    expect(pagePreparationHistory.hasOpenTransactions()).toBe(false);

    expect(commitPropertiesComment({ comment: 'Retry', evidence, target })).toBe(1);
    expect(readPropertiesComment(target)).toEqual({ comment: 'Retry', marker: 1 });
  });
});

describe('Design Review record deletion', () => {
  it('copies only the current element through the canonical Markdown v2 formatter', () => {
    const target = document.createElement('button');
    target.id = 'target';
    const rect = DOMRect.fromRect({ height: 40, width: 80 });
    Object.defineProperty(target, 'getClientRects', {
      configurable: true,
      value: () => ({
        0: rect,
        [Symbol.iterator]: () => [rect][Symbol.iterator](),
        item: (index: number) => (index === 0 ? rect : null),
        length: 1,
      }),
    });
    document.body.append(target);

    commitPropertiesComment({ comment: 'Check the label', evidence: createEvidence(), target });
    commitDesignReviewAction({ action: 'verify', target });

    const snapshot = browserAnnotationSession.captureSnapshot();
    expect(serializeDesignReviewRecord(target)).toBe(
      formatBrowserAnnotationSnapshot({
        ...snapshot,
        domRecords: snapshot.domRecords.filter(
          (record) => record.annotationId === browserAnnotationSession.getAnnotationId(target)
        ),
        frameOrders: [],
      })
    );
    expect(serializeDesignReviewRecord(target)).toContain('Design review action: verify');
    expect(serializeDesignReviewRecord(target)).toContain('Comment:\nCheck the label');
  });

  it('atomically clears review evidence and CSS while preserving Quick Edit text history', async () => {
    const host = document.createElement('section');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const target = document.createElement('div');
    const rect = DOMRect.fromRect({ height: 40, width: 80 });
    Object.defineProperty(target, 'getClientRects', {
      configurable: true,
      value: () => ({
        0: rect,
        [Symbol.iterator]: () => [rect][Symbol.iterator](),
        item: (index: number) => (index === 0 ? rect : null),
        length: 1,
      }),
    });
    shadowRoot.append(target);
    document.body.append(host);
    const evidence = createEvidence();

    await applyPageStylePatchWithHistory({
      element: target,
      patch: { declarations: [{ property: 'color', value: 'red' }] },
    });
    commitPropertiesComment({ comment: 'Fix color', evidence, target });
    commitDesignReviewAction({ action: 'fix', target });
    browserAnnotationSession.recordTextChange({
      after: 'Edited',
      before: 'Original',
      evidence,
      target,
    });

    deleteDesignReviewRecord(target);

    expect(target.style.color).toBe('');
    expect(readDesignReviewRecord(target)).toMatchObject({
      propertyChanges: [],
      textChange: { after: 'Edited', before: 'Original' },
    });
    expect(readDesignReviewRecord(target)).not.toHaveProperty('comment');
    expect(readDesignReviewRecord(target)).not.toHaveProperty('designReview');

    pagePreparationHistory.undo();
    expect(target.style.color).toBe('red');
    expect(readDesignReviewRecord(target)).toMatchObject({
      comment: 'Fix color',
      designReview: { action: 'fix' },
      textChange: { after: 'Edited', before: 'Original' },
    });

    pagePreparationHistory.redo();
    expect(target.style.color).toBe('');
    expect(readDesignReviewRecord(target)).toMatchObject({
      propertyChanges: [],
      textChange: { after: 'Edited', before: 'Original' },
    });
  });

  it('refuses to reset CSS after page-owned declaration drift', async () => {
    const target = document.createElement('div');
    const rect = DOMRect.fromRect({ height: 40, width: 80 });
    Object.defineProperty(target, 'getClientRects', {
      configurable: true,
      value: () => ({
        0: rect,
        [Symbol.iterator]: () => [rect][Symbol.iterator](),
        item: (index: number) => (index === 0 ? rect : null),
        length: 1,
      }),
    });
    document.body.append(target);
    const evidence = createEvidence();
    await applyPageStylePatchWithHistory({
      element: target,
      patch: { declarations: [{ property: 'color', value: 'red' }] },
    });
    commitPropertiesComment({ comment: 'Keep evidence', evidence, target });

    target.style.color = 'blue';
    expect(() => deleteDesignReviewRecord(target)).toThrow('stale-target-state');

    expect(target.style.color).toBe('blue');
    expect(readDesignReviewRecord(target)).toMatchObject({
      comment: 'Keep evidence',
      propertyChanges: [expect.objectContaining({ property: 'color' })],
    });
    expect(pagePreparationHistory.hasOpenTransactions()).toBe(false);
  });

  it('retains one-way recovery when an exact reset cannot restore its source endpoint', async () => {
    const target = document.createElement('div');
    const rect = DOMRect.fromRect({ height: 40, width: 80 });
    Object.defineProperty(target, 'getClientRects', {
      configurable: true,
      value: () => ({
        0: rect,
        [Symbol.iterator]: () => [rect][Symbol.iterator](),
        item: (index: number) => (index === 0 ? rect : null),
        length: 1,
      }),
    });
    document.body.append(target);
    await applyPageStylePatchWithHistory({
      element: target,
      patch: {
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'font-size', value: '18px' },
        ],
      },
    });
    commitPropertiesComment({ comment: 'Restore me', evidence: createEvidence(), target });
    const originalRemoveProperty = target.style.removeProperty.bind(target.style);
    const removeProperty = vi
      .spyOn(target.style, 'removeProperty')
      .mockImplementation((property) => {
        if (property === 'font-size') throw new Error('page blocked reset');
        return originalRemoveProperty(property);
      });
    const originalSetProperty = target.style.setProperty.bind(target.style);
    const setProperty = vi
      .spyOn(target.style, 'setProperty')
      .mockImplementation((property, value, priority) => {
        if (property !== 'color') originalSetProperty(property, value, priority);
      });

    expect(() => deleteDesignReviewRecord(target)).toThrow('rollback-failed');
    expect(target.style.color).toBe('');
    expect(target.style.fontSize).toBe('18px');

    setProperty.mockRestore();
    removeProperty.mockRestore();
    pagePreparationHistory.undo();
    expect(target.style.color).toBe('red');
    expect(target.style.fontSize).toBe('18px');
    expect(readDesignReviewRecord(target)).toMatchObject({
      comment: 'Restore me',
      propertyChanges: [
        expect.objectContaining({ property: 'color' }),
        expect.objectContaining({ property: 'font-size' }),
      ],
    });
    expect(pagePreparationHistory.getState().canRedo).toBe(false);
  });

  it('compensates session and retains CSS recovery when delete history commit fails', async () => {
    const target = document.createElement('div');
    const rect = DOMRect.fromRect({ height: 40, width: 80 });
    Object.defineProperty(target, 'getClientRects', {
      configurable: true,
      value: () => ({
        0: rect,
        [Symbol.iterator]: () => [rect][Symbol.iterator](),
        item: (index: number) => (index === 0 ? rect : null),
        length: 1,
      }),
    });
    document.body.append(target);
    await applyPageStylePatchWithHistory({
      element: target,
      patch: {
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'font-size', value: '18px' },
        ],
      },
    });
    commitPropertiesComment({ comment: 'Restore me', evidence: createEvidence(), target });
    let compensating = false;
    vi.spyOn(pagePreparationHistory, 'commitTransaction').mockImplementationOnce(() => {
      compensating = true;
      throw new Error('history failed');
    });
    const originalSetProperty = target.style.setProperty.bind(target.style);
    const setProperty = vi
      .spyOn(target.style, 'setProperty')
      .mockImplementation((property, value, priority) => {
        if (compensating && property === 'font-size') throw new Error('page blocked compensation');
        originalSetProperty(property, value, priority);
      });
    const originalRemoveProperty = target.style.removeProperty.bind(target.style);
    const removeProperty = vi
      .spyOn(target.style, 'removeProperty')
      .mockImplementation((property) =>
        compensating && property === 'color' ? '' : originalRemoveProperty(property)
      );

    expect(() => deleteDesignReviewRecord(target)).toThrow('CSS compensation');
    expect(target.style.color).toBe('red');
    expect(target.style.fontSize).toBe('');

    setProperty.mockRestore();
    removeProperty.mockRestore();
    pagePreparationHistory.undo();
    expect(target.style.color).toBe('red');
    expect(target.style.fontSize).toBe('18px');
    expect(readDesignReviewRecord(target)).toMatchObject({
      comment: 'Restore me',
      propertyChanges: [
        expect.objectContaining({ property: 'color' }),
        expect.objectContaining({ property: 'font-size' }),
      ],
    });
    expect(pagePreparationHistory.getState().canRedo).toBe(false);
  });
});
