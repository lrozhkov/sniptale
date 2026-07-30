// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import {
  browserAnnotationSession,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type {
  FrameSessionSnapshot,
  PagePreparationHistoryBridge,
} from '../../../parser/page-preparation/history/types';
import { applyPageStylePatchWithHistory } from './actions';
import { commitPropertiesComment, readPropertiesComment } from './comment';

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
    expect(readPropertiesComment(target)).toEqual({ comment: '', marker: null });
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
