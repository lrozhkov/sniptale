// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type {
  FrameSessionSnapshot,
  PagePreparationHistoryBridge,
} from '../../../parser/page-preparation/history/types';
import { applyPageStylePatchWithHistory, flushPendingPageStyleHistory } from './actions';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { captureBrowserAnnotationsExportText } from '../../../parser/page-preparation/annotations/format';

let bridge: PagePreparationHistoryBridge;
beforeEach(() => {
  browserAnnotationSession.resetForDocument();
  const frameSession: FrameSessionSnapshot = {
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
  bridge = {
    applySnapshot: (snapshot) => browserAnnotationSession.applySnapshot(snapshot.annotations),
    captureSnapshot: () => ({
      annotations: browserAnnotationSession.captureSnapshot(),
      frameSession,
    }),
  };
  pagePreparationHistory.registerBridge(bridge);
});

function target() {
  const element = document.createElement('p');
  element.textContent = 'Move me';
  element.style.transform = 'rotate(5deg)';
  const rect = DOMRect.fromRect({ width: 100, height: 40 });
  Object.defineProperty(element, 'getClientRects', { value: () => [rect] });
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => rect });
  document.body.append(element);
  return element;
}

afterEach(() => {
  flushPendingPageStyleHistory();
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.useRealTimers();
});

it('keeps a paused drag in one history transaction and exports its final translation', async () => {
  vi.useFakeTimers();
  const element = target();
  await applyPageStylePatchWithHistory({
    element,
    deferCommit: true,
    patch: { declarations: [{ property: 'translate', value: '10px 2px' }] },
  });
  await vi.advanceTimersByTimeAsync(1000);
  await applyPageStylePatchWithHistory({
    element,
    deferCommit: true,
    patch: { declarations: [{ property: 'translate', value: '20px 4px' }] },
  });
  flushPendingPageStyleHistory();
  expect(element.style.transform).toBe('rotate(5deg)');
  expect(captureBrowserAnnotationsExportText()).toContain('20px 4px');
  pagePreparationHistory.undo();
  expect(element.style.translate).toBe('');
  expect(pagePreparationHistory.getState().canUndo).toBe(false);
  pagePreparationHistory.redo();
  expect(element.style.translate).toBe('20px 4px');
});

it('preserves the DOM and report after a mixed invalid CSS operation', async () => {
  const element = target();
  const before = element.getAttribute('style');
  await expect(
    applyPageStylePatchWithHistory({
      element,
      patch: {
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'width', value: 'bad-value' },
        ],
      },
    })
  ).rejects.toThrow();
  expect(element.getAttribute('style')).toBe(before);
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(0);
});
