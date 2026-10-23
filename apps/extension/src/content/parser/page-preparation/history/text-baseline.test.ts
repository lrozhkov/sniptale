// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { browserAnnotationSession } from '../annotations';
import { pagePreparationHistory, type PagePreparationSessionSnapshot } from '.';
import { createQuickEditHistoryTracker } from '../../../selection/quick-edit-runtime/history';

const bridge = {
  applySnapshot: (snapshot: PagePreparationSessionSnapshot) => {
    browserAnnotationSession.applySnapshot(snapshot.annotations);
  },
  captureSnapshot: (): PagePreparationSessionSnapshot => ({
    annotations: browserAnnotationSession.captureSnapshot(),
    frameSession: {
      frames: [],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: [],
    },
  }),
};
let target: HTMLParagraphElement;
beforeEach(() => {
  pagePreparationHistory.registerBridge(bridge);
  pagePreparationHistory.clear();
  browserAnnotationSession.resetForDocument();
  target = document.createElement('p');
  target.textContent = 'Original';
  document.body.append(target);
});
afterEach(() => {
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});
function edit(text: string): void {
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, text);
  target.textContent = text;
  tracker.commit(target, text);
}

it('returns a copy of the earliest applied text baseline', () => {
  edit('First');
  edit('Second');
  const baseline = pagePreparationHistory.getTextBaseline(target);
  expect(baseline?.html).toBe('Original');
  if (!baseline) throw new Error('Expected baseline');
  baseline.html = 'Mutated copy';
  baseline.attributes['class'] = 'changed';
  expect(pagePreparationHistory.getTextBaseline(target)?.html).toBe('Original');
  expect(pagePreparationHistory.getTextBaseline(target)?.attributes['class']).toBeUndefined();
});

it('does not expose a baseline for undone, cleared, detached or replacement targets', () => {
  edit('First');
  pagePreparationHistory.undo();
  expect(pagePreparationHistory.getTextBaseline(target)).toBeNull();
  pagePreparationHistory.redo();
  expect(pagePreparationHistory.getTextBaseline(target)?.html).toBe('Original');
  const replacement = target.cloneNode(true);
  target.replaceWith(replacement);
  expect(pagePreparationHistory.getTextBaseline(target)).toBeNull();
  if (!(replacement instanceof HTMLElement)) throw new Error('Expected replacement element');
  expect(pagePreparationHistory.getTextBaseline(replacement)).toBeNull();
  pagePreparationHistory.clear();
  expect(pagePreparationHistory.getTextBaseline(replacement)).toBeNull();
});

it('ignores attribute-only canonical edits', () => {
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'attributes');
  target.style.color = 'red';
  tracker.commit(target, 'attributes');
  expect(pagePreparationHistory.getTextBaseline(target)).toBeNull();
  edit('Changed');
  expect(pagePreparationHistory.getTextBaseline(target)?.html).toBe('Original');
});
