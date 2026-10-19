// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import {
  pagePreparationHistory,
  type PagePreparationSessionSnapshot,
} from '../../parser/page-preparation/history';
import { createQuickEditHistoryTracker } from './history';
import { canResetQuickEditText, resetQuickEditText } from './text-reset';
import * as historyModule from '../../parser/page-preparation/history';

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
  const strong = document.createElement('strong');
  strong.textContent = 'Original';
  target.append(strong, document.createTextNode(' text'));
  document.body.append(target);
});
afterEach(() => {
  vi.restoreAllMocks();
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});
function edit(value: string, id: string): void {
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, id);
  target.textContent = value;
  expect(tracker.commit(target, id)).toBe(true);
}

it('restores earliest rich text after repeated canonical edits while retaining live CSS', () => {
  edit('Review edit', 'review');
  edit('Content editing edit', 'content-edit');
  target.style.color = 'red';
  expect(canResetQuickEditText(target)).toBe(true);
  expect(resetQuickEditText(target)).toBe(true);
  expect(target.querySelector('strong')?.textContent).toBe('Original');
  expect(target.textContent).toBe('Original text');
  expect(target.style.color).toBe('red');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toBeUndefined();
  expect(canResetQuickEditText(target)).toBe(false);
  pagePreparationHistory.undo();
  expect(target.textContent).toBe('Content editing edit');
  expect(target.style.color).toBe('red');
  expect(canResetQuickEditText(target)).toBe(true);
  pagePreparationHistory.redo();
  expect(target.querySelector('strong')?.textContent).toBe('Original');
  expect(target.style.color).toBe('red');
});

it('preserves text on Design Review mode reset and resets it through canonical content scope', () => {
  edit('Review edit', 'review');
  expect(pagePreparationHistory.resetScope('design-review')).toBe(true);
  expect(target.textContent).toBe('Review edit');
  expect(pagePreparationHistory.resetScope('content-editing')).toBe(true);
  expect(target.querySelector('strong')?.textContent).toBe('Original');
});

it('retains root positioning and computed geometry through text reset, Undo and Redo', () => {
  target.style.cssText = 'position: absolute; left: 620px; top: 170px; width: 180px; margin: 0;';
  const originalStyle = target.getAttribute('style');
  edit('Changed', 'positioned');
  function expectGeometry(): void {
    expect(target.getAttribute('style')).toBe(originalStyle);
    const computed = getComputedStyle(target);
    expect(computed.position).toBe('absolute');
    expect(computed.left).toBe('620px');
    expect(computed.top).toBe('170px');
    expect(computed.width).toBe('180px');
  }
  expect(resetQuickEditText(target)).toBe(true);
  expectGeometry();
  pagePreparationHistory.undo();
  expect(target.textContent).toBe('Changed');
  expectGeometry();
  pagePreparationHistory.redo();
  expect(target.querySelector('strong')?.textContent).toBe('Original');
  expectGeometry();
});

it('refuses missing, detached and replacement baselines without changing live content', () => {
  expect(resetQuickEditText(target)).toBe(false);
  edit('Changed', 'first');
  target.remove();
  expect(resetQuickEditText(target)).toBe(false);
  const replacement = document.createElement('p');
  replacement.textContent = 'Replacement';
  replacement.id = target.id;
  document.body.append(replacement);
  expect(resetQuickEditText(replacement)).toBe(false);
  expect(replacement.textContent).toBe('Replacement');
});

it('compensates reset commit refusal and preserves previously completed work', () => {
  edit('Completed edit', 'first');
  target.style.color = 'red';
  vi.spyOn(pagePreparationHistory, 'commitTransaction').mockReturnValue(false);
  expect(() => resetQuickEditText(target)).toThrow('lost before commit');
  expect(target.textContent).toBe('Completed edit');
  expect(target.style.color).toBe('red');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange?.after).toBe(
    'Completed edit'
  );
  expect(pagePreparationHistory.hasOpenTransactions()).toBe(false);
});

it('refuses reset while another text transaction is open', () => {
  edit('Completed edit', 'first');
  pagePreparationHistory.beginTransaction('other', null, 'content-editing');
  expect(resetQuickEditText(target)).toBe(false);
  expect(target.textContent).toBe('Completed edit');
  pagePreparationHistory.cancelTransaction('other');
});

it('resets an isolated-world HTML wrapper with a different owning-window constructor', () => {
  edit('Changed', 'first');
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const frameDocument = iframe.contentDocument;
  if (!frameDocument) throw new Error('Expected accessible iframe document');
  const otherView = frameDocument.defaultView;
  vi.spyOn(document, 'defaultView', 'get').mockReturnValue(otherView);
  expect(canResetQuickEditText(target)).toBe(true);
  expect(resetQuickEditText(target)).toBe(true);
  expect(target.querySelector('strong')?.textContent).toBe('Original');
});

it('hides reset when the original text is manually restored', () => {
  edit('Changed', 'first');
  edit('Original text', 'restored');
  expect(target.querySelector('strong')).toBeNull();
  expect(canResetQuickEditText(target)).toBe(false);
});

it('restores completed text when applying reset throws after changing the DOM', () => {
  edit('Completed edit', 'first');
  const apply = historyModule.applyDomMutationBatch;
  let shouldThrow = true;
  vi.spyOn(historyModule, 'applyDomMutationBatch').mockImplementation((batch, direction) => {
    const result = apply(batch, direction);
    if (shouldThrow) {
      shouldThrow = false;
      throw new Error('Apply failed');
    }
    return result;
  });
  expect(() => resetQuickEditText(target)).toThrow('Apply failed');
  expect(target.textContent).toBe('Completed edit');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange?.after).toBe(
    'Completed edit'
  );
  expect(pagePreparationHistory.hasOpenTransactions()).toBe(false);
});
