// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createFrameDataFixture } from '../../../selection/frame-runtime/test-support';
import { createQuickEditHistoryTracker } from '../../../selection/quick-edit-runtime/history';
import { createPagePreparationDrawingSession } from '../../../drawing/history';
import {
  applyPageStylePatchWithHistory,
  flushPendingPageStyleHistory,
} from '../../../overlay/design-review/runtime/actions';
import { commitPropertiesComment } from '../../../overlay/design-review/runtime/comment';
import { browserAnnotationSession, createBrowserAnnotationTargetEvidence } from '../annotations';
import { pagePreparationHistory as history } from '.';
import type {
  FrameSessionSnapshot,
  PagePreparationHistoryBridge,
  PagePreparationChangeScope,
} from './types';

let frameSession: FrameSessionSnapshot;
let bridge: PagePreparationHistoryBridge;
let target: HTMLDivElement;
let drawing: ReturnType<typeof createPagePreparationDrawingSession>;

beforeEach(() => {
  browserAnnotationSession.resetForDocument();
  frameSession = {
    frames: [],
    globalEffectMode: 'border',
    globalStepBadgeSettings: { autoMode: true },
    sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    sessionBorderPreset: DEFAULT_BORDER_PRESET,
    sessionCalloutStyle: null,
    sessionFocusSettings: { opacity: 0.5, showBorder: false },
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: [],
  };
  bridge = {
    captureSnapshot: () => ({
      annotations: browserAnnotationSession.captureSnapshot(),
      frameSession,
    }),
    applySnapshot: (snapshot) => {
      browserAnnotationSession.applySnapshot(snapshot.annotations);
      frameSession = snapshot.frameSession;
    },
  };
  history.registerBridge(bridge);
  history.clear();
  target = document.createElement('div');
  target.id = 'target';
  target.textContent = 'Original';
  Object.defineProperty(target, 'getClientRects', {
    value: () => [DOMRect.fromRect({ height: 40, width: 100 })],
  });
  document.body.append(target);
  drawing = createPagePreparationDrawingSession(history);
});

afterEach(() => {
  flushPendingPageStyleHistory();
  history.clear();
  history.unregisterBridge(bridge);
  drawing.dispose();
  browserAnnotationSession.resetForDocument();
  target.remove();
  vi.restoreAllMocks();
});

function editText(value = 'Edited') {
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'text');
  target.textContent = value;
  expect(tracker.commit(target, 'text')).toBe(true);
}

async function editStyle() {
  await applyPageStylePatchWithHistory({
    element: target,
    patch: { declarations: [{ property: 'color', value: 'red' }] },
  });
  flushPendingPageStyleHistory();
  commitPropertiesComment({
    comment: 'Review',
    evidence: createBrowserAnnotationTargetEvidence(target),
    target,
  });
}

function addFrame() {
  history.beginTransaction('frame');
  frameSession = { ...frameSession, frames: [createFrameDataFixture('frame')] };
  history.commitTransaction('frame');
}

function addDrawing() {
  drawing.commitObject({
    id: 'drawing',
    kind: 'blur',
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  });
}

it.each(['text-first', 'style-first'])(
  'preserves foreign DOM, evidence and retained undo/redo on Content Editing reset: %s',
  async (order) => {
    if (order === 'text-first') {
      editText();
      await editStyle();
    } else {
      await editStyle();
      editText();
    }
    addFrame();
    addDrawing();
    expect(history.resetScope('content-editing')).toBe(true);
    expect(target.textContent).toBe('Original');
    expect(target.style.color).toBe('red');
    expect(browserAnnotationSession.captureSnapshot().domRecords[0]).toMatchObject({
      comment: 'Review',
    });
    expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toBeUndefined();
    expect(frameSession.frames).toHaveLength(1);
    expect(drawing.getSnapshot().document.objects).toHaveLength(1);
    expect(history.hasChanges('content-editing')).toBe(false);
    history.undo();
    history.undo();
    history.undo();
    history.undo();
    expect(target.textContent).toBe('Original');
    expect(target.style.color).toBe('');
    history.redo();
    history.redo();
    history.redo();
    history.redo();
    expect(target.textContent).toBe('Original');
    expect(target.style.color).toBe('red');
    expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.textChange).toBeUndefined();
  }
);

it.each(['text-first', 'style-first'])(
  'preserves content and retained undo/redo on Design Review reset: %s',
  async (order) => {
    if (order === 'text-first') {
      editText();
      await editStyle();
    } else {
      await editStyle();
      editText();
    }
    expect(history.resetScope('design-review')).toBe(true);
    expect(target.textContent).toBe('Edited');
    expect(target.style.color).toBe('');
    expect(browserAnnotationSession.captureSnapshot().domRecords[0]).toMatchObject({
      propertyChanges: [],
      textChange: { before: 'Original', after: 'Edited' },
    });
    history.undo();
    expect(target.textContent).toBe('Original');
    expect(target.style.color).toBe('');
    history.redo();
    expect(target.textContent).toBe('Edited');
    expect(target.style.color).toBe('');
    expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.comment).toBeUndefined();
  }
);

it.each(['drawing', 'annotation'] as const)(
  'resets %s without clearing the other document owners',
  async (scope) => {
    editText();
    await editStyle();
    addFrame();
    addDrawing();
    expect(history.resetScope(scope)).toBe(true);
    expect(target.textContent).toBe('Edited');
    expect(target.style.color).toBe('red');
    expect(frameSession.frames).toHaveLength(scope === 'annotation' ? 0 : 1);
    expect(drawing.getSnapshot().document.objects).toHaveLength(scope === 'drawing' ? 0 : 1);
    expect(history.hasChanges(scope)).toBe(false);
    while (history.getState().canUndo) history.undo();
    expect(target.textContent).toBe('Original');
    expect(target.style.color).toBe('');
    while (history.getState().canRedo) history.redo();
    expect(target.textContent).toBe('Edited');
    expect(target.style.color).toBe('red');
    expect(frameSession.frames).toHaveLength(scope === 'annotation' ? 0 : 1);
    expect(drawing.getSnapshot().document.objects).toHaveLength(scope === 'drawing' ? 0 : 1);
  }
);

it('isolates a long-lived empty/dirty transaction from enclosed foreign commits', async () => {
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'pending');
  await editStyle();
  expect(history.hasPendingSnapshotChanges('content-editing')).toBe(false);
  target.textContent = 'Pending text';
  expect(tracker.commit(target, 'pending')).toBe(true);
  history.undo();
  expect(target.textContent).toBe('Original');
  expect(target.style.color).toBe('red');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.comment).toBe('Review');
  history.redo();
  expect(history.resetScope('design-review')).toBe(true);
  expect(target.textContent).toBe('Pending text');
  expect(target.style.color).toBe('');
});

it('rejects open transactions and missing exact DOM targets without removing foreign state', async () => {
  editText();
  await editStyle();
  history.beginTransaction('open', null, 'annotation');
  expect(history.resetScope('content-editing')).toBe(false);
  history.cancelTransaction('open');
  target.remove();
  expect(history.resetScope('content-editing')).toBe(false);
  expect(target.textContent).toBe('Edited');
  expect(target.style.color).toBe('red');
  expect(history.hasChanges('content-editing')).toBe(true);
  expect(history.hasChanges('design-review')).toBe(true);
});

it('restores successful own undos after a later failure and retains foreign evidence', async () => {
  let state = 1;
  const scope: PagePreparationChangeScope = 'drawing';
  history.commitEntry({
    scope,
    domEffect: {
      hasChanges: true,
      hasCurrentChanges: () => true,
      apply: () => ({ success: false, failures: ['blocked'] }),
    },
  });
  history.commitEntry({
    scope,
    domEffect: {
      hasChanges: true,
      hasCurrentChanges: () => state !== 0,
      apply: (direction) => {
        state = direction === 'undo' ? 0 : 1;
        return { success: true, failures: [] };
      },
    },
  });
  await editStyle();
  expect(history.resetScope('drawing')).toBe(false);
  expect(state).toBe(1);
  expect(target.style.color).toBe('red');
  expect(history.hasChanges('drawing')).toBe(true);
  expect(history.hasChanges('design-review')).toBe(true);
});

it('retains foreign evidence and factual history when compensation cannot restore an own entry', async () => {
  let state = 1;
  history.commitEntry({
    scope: 'drawing',
    domEffect: {
      hasChanges: true,
      hasCurrentChanges: () => true,
      apply: () => ({ success: false, failures: ['blocked'] }),
    },
  });
  history.commitEntry({
    scope: 'drawing',
    domEffect: {
      hasChanges: true,
      hasCurrentChanges: () => state !== 0,
      apply: (direction) => {
        if (direction === 'redo') return { success: false, failures: ['restore-blocked'] };
        state = 0;
        return { success: true, failures: [] };
      },
    },
  });
  await editStyle();
  expect(history.resetScope('drawing')).toBe(false);
  expect(state).toBe(0);
  expect(target.style.color).toBe('red');
  expect(history.hasChanges('design-review')).toBe(true);
  history.undo();
  history.undo();
  expect(target.style.color).toBe('');
  expect(history.getState().canUndo).toBe(true);
});

it('rejects ancestor replacement before undoing anything when a retained style target is inside', async () => {
  target.innerHTML = '<span>Original child</span>';
  const tracker = createQuickEditHistoryTracker();
  tracker.begin(target, 'ancestor');
  target.firstChild!.textContent = 'Edited child';
  tracker.commit(target, 'ancestor');
  const child = target.firstElementChild as HTMLElement;
  Object.defineProperty(child, 'getClientRects', {
    value: () => [DOMRect.fromRect({ width: 40, height: 20 })],
  });
  await applyPageStylePatchWithHistory({
    element: child,
    patch: { declarations: [{ property: 'color', value: 'red' }] },
  });
  flushPendingPageStyleHistory();
  addDrawing();
  expect(history.resetScope('drawing')).toBe(true);
  expect(target.firstElementChild).toBe(child);
  expect(child.style.color).toBe('red');
  expect(history.resetScope('content-editing')).toBe(false);
  expect(target.firstElementChild).toBe(child);
  expect(child.textContent).toBe('Edited child');
  expect(child.style.color).toBe('red');
  expect(history.hasChanges('content-editing')).toBe(true);
});

it('does not report a resettable Design Review change when its style has returned to baseline', async () => {
  await applyPageStylePatchWithHistory({
    element: target,
    patch: { declarations: [{ property: 'color', value: 'red' }] },
  });
  flushPendingPageStyleHistory();
  await applyPageStylePatchWithHistory({
    element: target,
    patch: { declarations: [{ property: 'color', value: '' }] },
  });
  flushPendingPageStyleHistory();
  expect(target.style.color).toBe('');
  expect(history.hasChanges('design-review')).toBe(false);
});
