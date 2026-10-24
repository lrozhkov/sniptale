// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createFrameDataFixture } from '../../../selection/frame-runtime/test-support';
import { createPagePreparationDrawingSession } from '../../../drawing/history';
import { captureDomStateMap, createDomMutationBatch } from './dom';
import { createPagePreparationHistoryStore } from './store';
import type { PagePreparationSessionSnapshot } from './types';

let history: ReturnType<typeof createPagePreparationHistoryStore>;
let drawing: ReturnType<typeof createPagePreparationDrawingSession>;
let snapshot: PagePreparationSessionSnapshot;
let target: HTMLParagraphElement;

beforeEach(() => {
  history = createPagePreparationHistoryStore();
  snapshot = {
    annotations: {
      schemaVersion: 1,
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCreationOrder: 1,
      nextMarkerNumber: 1,
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
      stepBadgeOrder: [],
    },
  };
  history.registerBridge({
    captureSnapshot: () => snapshot,
    applySnapshot: (next) => {
      snapshot = next;
    },
  });
  drawing = createPagePreparationDrawingSession(history);
  target = document.createElement('p');
  target.textContent = 'Original';
  document.body.append(target);
});
afterEach(() => {
  history.clear();
  drawing.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function draw(id = 'drawing') {
  drawing.commitObject({ id, kind: 'blur', bounds: { x: 0, y: 0, width: 10, height: 10 } });
}
function text(value = 'Edited') {
  const before = captureDomStateMap([target]);
  target.textContent = value;
  history.commitEntry({
    scope: 'content-editing',
    domBatch: createDomMutationBatch([target], before),
  });
}
function style() {
  const before = captureDomStateMap([target]);
  target.style.color = 'red';
  history.commitEntry({
    scope: 'design-review',
    domBatch: createDomMutationBatch([target], before),
  });
}
function frame() {
  history.beginTransaction('frame');
  snapshot = {
    ...snapshot,
    frameSession: { ...snapshot.frameSession, frames: [createFrameDataFixture('frame')] },
  };
  history.commitTransaction('frame');
}

it('undoes an older drawing without touching newer text or frame changes', () => {
  draw();
  text();
  frame();
  history.undo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(0);
  expect(target.textContent).toBe('Edited');
  expect(snapshot.frameSession.frames).toHaveLength(1);
  expect(history.getState('drawing')).toMatchObject({ canUndo: false, canRedo: true });
  history.undo('page-editing');
  expect(target.textContent).toBe('Original');
  expect(snapshot.frameSession.frames).toHaveLength(1);
  history.redo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  expect(target.textContent).toBe('Original');
});

it('reports availability for the selected domain even when another domain has history', () => {
  text();
  expect(history.getState('drawing')).toMatchObject({ canUndo: false, canRedo: false });
  expect(history.getState('annotation')).toMatchObject({ canUndo: false, canRedo: false });
  history.undo('drawing');
  history.redo('annotation');
  expect(target.textContent).toBe('Edited');
});

it('preserves independent redo when committing a new page edit', () => {
  draw();
  frame();
  text();
  history.undo('drawing');
  history.undo('annotation');
  history.undo('page-editing');
  text('New branch');
  expect(history.getState('page-editing').canRedo).toBe(false);
  expect(history.getState('drawing').canRedo).toBe(true);
  expect(history.getState('annotation').canRedo).toBe(true);
  history.redo('drawing');
  history.redo('annotation');
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  expect(snapshot.frameSession.frames).toHaveLength(1);
  expect(target.textContent).toBe('New branch');
});

it('keeps text and Design Review in one page-editing sequence', () => {
  text();
  style();
  draw();
  history.undo('page-editing');
  expect(target.style.color).toBe('');
  expect(target.textContent).toBe('Edited');
  history.undo('page-editing');
  expect(target.textContent).toBe('Original');
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  history.redo('page-editing');
  history.redo('page-editing');
  expect(target.textContent).toBe('Edited');
  expect(target.style.color).toBe('red');
});

it('invalidates the shared page-editing redo branch after either text or design commits', () => {
  text();
  history.undo('page-editing');
  style();
  expect(history.getState('page-editing').canRedo).toBe(false);
  history.undo('page-editing');
  text('New text');
  expect(history.getState('page-editing').canRedo).toBe(false);
});

it('retains chronological global restore and global clear after independent navigation', () => {
  draw();
  text();
  frame();
  history.undo('drawing');
  history.redo('drawing');
  while (history.getState().canUndo) history.undo();
  expect(target.textContent).toBe('Original');
  expect(snapshot.frameSession.frames).toHaveLength(0);
  expect(drawing.getSnapshot().document.objects).toHaveLength(0);
  while (history.getState().canRedo) history.redo();
  expect(target.textContent).toBe('Edited');
  expect(snapshot.frameSession.frames).toHaveLength(1);
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  history.clear();
  expect(drawing.getSnapshot().document.objects).toHaveLength(0);
  for (const domain of ['drawing', 'annotation', 'page-editing'] as const)
    expect(history.getState(domain)).toMatchObject({ canUndo: false, canRedo: false });
});

it('preserves drawing redo through scoped text clear', () => {
  draw();
  history.undo('drawing');
  text();
  expect(history.resetScope('content-editing')).toBe(true);
  expect(target.textContent).toBe('Original');
  expect(history.getState('drawing').canRedo).toBe(true);
  history.redo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
});

it('keeps factual state and the selected cursor when an older owner effect refuses undo', () => {
  const apply = vi.fn(() => ({ failures: ['unavailable'], success: false }));
  history.commitEntry({ scope: 'drawing', domEffect: { hasChanges: true, apply } });
  text();
  history.undo('drawing');
  expect(apply).toHaveBeenCalledOnce();
  expect(target.textContent).toBe('Edited');
  expect(history.getState('drawing')).toMatchObject({ canUndo: true, canRedo: false });
});

it('does not bypass a factual recovery belonging to another domain', () => {
  draw();
  text();
  const apply = vi.fn(() => ({ failures: [], success: true }));
  history.commitEntry({
    scope: 'design-review',
    domEffect: { hasChanges: true, recoveryOnly: true, apply },
  });
  expect(history.getState('drawing')).toMatchObject({ canUndo: false, canRedo: false });
  history.undo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  expect(apply).not.toHaveBeenCalled();
  history.undo('page-editing');
  expect(apply).toHaveBeenCalledWith('undo');
  expect(history.getState('drawing').canUndo).toBe(true);
  expect(history.getState('page-editing').canRedo).toBe(false);
});

it.each(['transaction', 'deferred'] as const)(
  'refuses direct scoped navigation during an open %s',
  (pending) => {
    draw();
    if (pending === 'transaction') history.beginTransaction('pending', null, 'content-editing');
    else history.beginDeferredCommit('annotation');
    expect(history.getState('drawing').canUndo).toBe(false);
    history.undo('drawing');
    expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  }
);

it('publishes deferred boundary availability on begin, cancel and empty finalize', () => {
  draw();
  const available: boolean[] = [];
  history.subscribe(() => available.push(history.getState('drawing').canUndo));
  const first = history.beginDeferredCommit('annotation')!;
  history.cancelDeferredCommit(first);
  const second = history.beginDeferredCommit('annotation')!;
  history.finalizeDeferredCommit(second);
  expect(available).toEqual([false, true, false, true]);
});

it('retains a disposed drawing redo and still replays an independent page edit', () => {
  draw();
  text();
  history.undo('drawing');
  history.undo('page-editing');
  drawing.dispose();
  history.redo('drawing');
  expect(history.getState('drawing')).toMatchObject({ canUndo: false, canRedo: true });
  expect(target.textContent).toBe('Original');
  history.redo('page-editing');
  expect(target.textContent).toBe('Edited');
  expect(history.getState('drawing').canRedo).toBe(true);
});

it('compensates a scoped snapshot failure without changing a newer independent edit', () => {
  draw();
  text();
  const apply = vi
    .fn<(next: PagePreparationSessionSnapshot) => void>()
    .mockImplementationOnce(() => {
      throw new Error('snapshot unavailable');
    })
    .mockImplementation((next) => {
      snapshot = next;
    });
  history.registerBridge({ captureSnapshot: () => snapshot, applySnapshot: apply });
  history.undo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  expect(target.textContent).toBe('Edited');
  expect(history.getState('drawing')).toMatchObject({ canUndo: true, canRedo: false });
  history.undo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(0);
  expect(target.textContent).toBe('Edited');
});

it('preserves independent redo after a scoped clear cannot restore its own partial progress', () => {
  history.commitEntry({
    scope: 'drawing',
    domEffect: {
      hasChanges: true,
      apply: () => ({ success: false, failures: ['undo unavailable'] }),
    },
  });
  history.commitEntry({
    scope: 'drawing',
    domEffect: {
      hasChanges: true,
      apply: (direction) => ({ success: direction === 'undo', failures: [] }),
    },
  });
  frame();
  history.undo('annotation');
  expect(history.resetScope('drawing')).toBe(false);
  expect(history.getState('annotation').canRedo).toBe(true);
  history.redo('annotation');
  expect(snapshot.frameSession.frames).toHaveLength(1);
});

it('returns its own deferred identity when publication opens another boundary', () => {
  draw();
  let nested: number | null = null;
  let opening = false;
  history.subscribe(() => {
    if (opening) return;
    opening = true;
    nested = history.beginDeferredCommit('annotation');
  });
  const first = history.beginDeferredCommit('drawing');
  expect(first).not.toBe(nested);
  history.cancelDeferredCommit(first!);
  expect(history.getState('drawing').canUndo).toBe(false);
  history.cancelDeferredCommit(nested!);
  expect(history.getState('drawing').canUndo).toBe(true);
});

it('does not cross buried recovery to undo an older independent drawing', () => {
  draw();
  history.commitEntry({
    scope: 'design-review',
    domEffect: {
      hasChanges: true,
      recoveryOnly: true,
      apply: () => ({ failures: [], success: true }),
    },
  });
  frame();
  expect(history.getState('drawing').canUndo).toBe(false);
  history.undo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(1);
  expect(snapshot.frameSession.frames).toHaveLength(1);
  // A later annotation can be undone without crossing the recovery boundary.
  expect(history.getState('annotation').canUndo).toBe(true);
  history.undo('annotation');
  expect(snapshot.frameSession.frames).toHaveLength(0);
  expect(history.getState('drawing').canUndo).toBe(false);
  history.undo('page-editing');
  expect(history.getState('drawing').canUndo).toBe(true);
  history.undo('drawing');
  expect(drawing.getSnapshot().document.objects).toHaveLength(0);
});

it.each(['drawing', 'page-editing'] as const)(
  'retains but blocks %s redo until buried recovery completes',
  (domain) => {
    const recovery = {
      hasChanges: true,
      recoveryOnly: true,
      apply: () => ({ failures: [], success: true }),
    };
    if (domain === 'drawing') {
      draw();
      history.undo('drawing');
      text('First edit');
      history.commitEntry({ scope: 'design-review', domEffect: recovery });
    } else {
      text('First edit');
      history.commitEntry({
        scope: 'design-review',
        domEffect: {
          hasChanges: true,
          apply: () => ({
            success: false,
            failures: ['partial replay'],
            recovery: { effect: recovery },
          }),
        },
      });
      text('Second edit');
      history.undo('page-editing');
      history.undo('page-editing');
    }
    frame();
    expect(history.getState(domain).canRedo).toBe(false);
    history.redo(domain);
    expect(target.textContent).toBe('First edit');
    expect(drawing.getSnapshot().document.objects).toHaveLength(0);
    history.undo('page-editing');
    expect(history.getState(domain).canRedo).toBe(true);
    history.redo(domain);
    expect(snapshot.frameSession.frames).toHaveLength(1);
    expect(target.textContent).toBe(domain === 'drawing' ? 'First edit' : 'Second edit');
    expect(drawing.getSnapshot().document.objects).toHaveLength(domain === 'drawing' ? 1 : 0);
  }
);
