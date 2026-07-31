// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import {
  pagePreparationHistory,
  type FrameSessionSnapshot,
  type PagePreparationSessionSnapshot,
} from '../../parser/page-preparation/history';
import { createQuickEditHistoryTracker } from './history';
import { createQuickEditDocumentModeHistoryTracker } from './document-mode.history';

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

const frameSession = createFrameSnapshot();
const bridge = {
  applySnapshot: (snapshot: PagePreparationSessionSnapshot): void => {
    browserAnnotationSession.applySnapshot(snapshot.annotations);
  },
  captureSnapshot: (): PagePreparationSessionSnapshot => ({
    annotations: browserAnnotationSession.captureSnapshot(),
    frameSession,
  }),
};

beforeEach(() => {
  document.body.replaceChildren();
  browserAnnotationSession.resetForDocument();
  pagePreparationHistory.clear();
  pagePreparationHistory.registerBridge(bridge);
});

afterEach(() => {
  pagePreparationHistory.unregisterBridge(bridge);
  pagePreparationHistory.clear();
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

function commitText(args: { after: string; id: string; target: HTMLElement }): void {
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(args.target, args.id);
  args.target.textContent = args.after;
  expect(tracker.commit(args.target, args.id)).toBe(true);
}

it('undoes and redoes DOM text and annotation evidence through one history entry', () => {
  const target = document.createElement('p');
  target.id = 'editable';
  target.textContent = 'Before';
  document.body.append(target);

  commitText({ after: 'After', id: 'first', target });
  expect(target.textContent).toBe('After');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toEqual({
    after: 'After',
    before: 'Before',
  });

  pagePreparationHistory.undo();
  expect(target.textContent).toBe('Before');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);

  pagePreparationHistory.redo();
  expect(target.textContent).toBe('After');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toEqual({
    after: 'After',
    before: 'Before',
  });
});

it('does not create evidence or history for a no-op point edit', () => {
  const target = document.createElement('p');
  target.textContent = 'Same';
  document.body.append(target);

  commitText({ after: 'Same', id: 'noop', target });

  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: false });
});

it('restores point-edit DOM and evidence when history is cleared before commit', () => {
  const target = document.createElement('p');
  target.textContent = 'Before';
  document.body.append(target);
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'cleared');
  target.textContent = 'After';
  pagePreparationHistory.clear();

  expect(() => tracker.commit(target, 'cleared')).toThrow(
    'Quick Edit history transaction was lost before commit'
  );
  expect(target.textContent).toBe('Before');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: false });
});

it('restores point-edit DOM and evidence when the history bridge disappears before commit', () => {
  const target = document.createElement('p');
  target.textContent = 'Before';
  document.body.append(target);
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'bridge-lost');
  target.textContent = 'After';
  pagePreparationHistory.unregisterBridge(bridge);

  expect(() => tracker.commit(target, 'bridge-lost')).toThrow(
    'Quick Edit history transaction was lost before commit'
  );
  expect(target.textContent).toBe('Before');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
});

it('removes returned text evidence and restores it with undo', () => {
  const target = document.createElement('p');
  target.textContent = 'Before';
  document.body.append(target);
  commitText({ after: 'After', id: 'first', target });
  commitText({ after: 'Before', id: 'second', target });

  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  pagePreparationHistory.undo();
  expect(target.textContent).toBe('After');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toEqual({
    after: 'After',
    before: 'Before',
  });
});

it('keeps SPA replacement identity separate despite matching export selectors', () => {
  const original = document.createElement('p');
  original.id = 'same';
  original.textContent = 'Original';
  document.body.append(original);
  commitText({ after: 'Original changed', id: 'original', target: original });
  original.remove();

  const replacement = document.createElement('p');
  replacement.id = 'same';
  replacement.textContent = 'Replacement';
  document.body.append(replacement);
  commitText({ after: 'Replacement changed', id: 'replacement', target: replacement });

  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([
    expect.objectContaining({
      annotationId: 1,
      textChange: { after: 'Original changed', before: 'Original' },
    }),
    expect.objectContaining({
      annotationId: 2,
      textChange: { after: 'Replacement changed', before: 'Replacement' },
    }),
  ]);
  expect(browserAnnotationSession.getLiveTarget(1)).toBe(original);
  expect(browserAnnotationSession.getLiveTarget(2)).toBe(replacement);
  expect(() => browserAnnotationSession.captureSnapshot()).not.toThrow();
});

it('records a committed target inside a same-origin iframe', () => {
  const iframe = document.createElement('iframe');
  iframe.id = 'frame';
  document.body.append(iframe);
  const target = iframe.contentDocument!.createElement('p');
  target.id = 'inner';
  target.textContent = 'Before';
  iframe.contentDocument!.body.append(target);

  commitText({ after: 'After', id: 'iframe-edit', target });

  expect(browserAnnotationSession.captureSnapshot().domRecords[0]).toMatchObject({
    evidence: {
      frame: { kind: 'iframe', selector: 'iframe#frame' },
      targetSelector: '#inner',
    },
    textChange: { after: 'After', before: 'Before' },
  });
});

it('commits and replays a document-mode edit inside a same-origin iframe realm', () => {
  const iframe = document.createElement('iframe');
  iframe.id = 'document-frame';
  document.body.append(iframe);
  const target = iframe.contentDocument!.createElement('p');
  target.id = 'inner-document-edit';
  target.textContent = 'Before';
  iframe.contentDocument!.body.append(target);
  const tracker = createQuickEditDocumentModeHistoryTracker();
  tracker.begin();
  target.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
    })
  );
  target.textContent = 'After';
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));

  tracker.commit();
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]).toMatchObject({
    evidence: {
      frame: { kind: 'iframe', selector: 'iframe#document-frame' },
      targetSelector: '#inner-document-edit',
    },
    textChange: { after: 'After', before: 'Before' },
  });

  pagePreparationHistory.undo();
  expect(target.textContent).toBe('Before');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  pagePreparationHistory.redo();
  expect(target.textContent).toBe('After');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toEqual({
    after: 'After',
    before: 'Before',
  });
});
