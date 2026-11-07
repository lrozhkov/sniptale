import { expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createDrawingSession } from '../../features/drawing/public';
import { beginDrawingPointer, commitDrawingPointerDraft } from './interaction';
import { updateDrawingPointerDraft } from './pointer-update';

function createNestedSelectionSession() {
  const onDocumentCommit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  session.commitObject({
    id: 'background',
    kind: 'rectangle',
    color: '#000',
    fillColor: '#fff',
    width: 2,
    bounds: { x: 0, y: 0, width: 500, height: 500 },
  });
  session.commitObject({
    id: 'small',
    kind: 'blur',
    bounds: { x: 60, y: 60, width: 20, height: 20 },
  });
  session.commitObject({
    id: 'outside',
    kind: 'blur',
    bounds: { x: 300, y: 300, width: 40, height: 40 },
  });
  session.setActiveTool('select');
  session.select('outside');
  onDocumentCommit.mockClear();
  return { session, onDocumentCommit };
}

it.each([
  ['replace', { ctrlKey: false, shiftKey: false }, ['background']],
  ['add', { ctrlKey: false, shiftKey: true }, ['outside', 'background']],
  ['toggle', { ctrlKey: true, shiftKey: false }, ['outside', 'background']],
] as const)(
  'defers an unselected layer %s click until release without changing geometry',
  (_mode, modifiers, expected) => {
    const { session, onDocumentCommit } = createNestedSelectionSession();
    const before = session.getSnapshot();
    const started = beginDrawingPointer({
      modifiers,
      point: { x: 40, y: 40 },
      snapshot: before,
      timestamp: 0,
    });
    expect(started.selection).toBeUndefined();
    expect(started.draft).toMatchObject({ kind: 'marquee', clickObjectId: 'background' });
    expect(session.getSnapshot().selectedObjectIds).toEqual(['outside']);
    if (!started.draft) throw new Error('Expected pending click');
    const jitter = updateDrawingPointerDraft({
      documentObjects: before.document.objects,
      draft: started.draft,
      event: {} as ReactPointerEvent<HTMLCanvasElement>,
      point: { x: 43.99, y: 40 },
      root: { kind: 'viewport', element: null },
    });
    expect(jitter).toEqual({ draft: started.draft });
    commitDrawingPointerDraft(session, jitter.draft);
    expect(session.getSnapshot().selectedObjectIds).toEqual(expected);
    expect(session.getSnapshot().document).toEqual(before.document);
    expect(onDocumentCommit).not.toHaveBeenCalled();
  }
);

it.each([
  ['replace', { ctrlKey: false, shiftKey: false }, ['small']],
  ['add', { ctrlKey: false, shiftKey: true }, ['small', 'outside']],
  ['toggle', { ctrlKey: true, shiftKey: false }, ['small', 'outside']],
] as const)(
  'turns an unselected background drag into a %s containment marquee at four pixels',
  (_mode, modifiers, expected) => {
    const { session, onDocumentCommit } = createNestedSelectionSession();
    const before = session.getSnapshot();
    const started = beginDrawingPointer({
      modifiers,
      point: { x: 40, y: 40 },
      snapshot: before,
      timestamp: 0,
    });
    expect(started.selection).toBeUndefined();
    if (!started.draft) throw new Error('Expected pending click');
    const update = (draft: typeof started.draft, point: { x: number; y: number }) => {
      if (!draft) throw new Error('Expected draft');
      return updateDrawingPointerDraft({
        documentObjects: before.document.objects,
        draft,
        event: {} as ReactPointerEvent<HTMLCanvasElement>,
        point,
        root: { kind: 'viewport', element: null },
      });
    };
    const threshold = update(started.draft, { x: 44, y: 40 });
    expect(threshold.draft.kind).toBe('marquee');
    expect(threshold.draft).not.toHaveProperty('clickObjectId');
    expect(threshold.selection).toEqual(_mode === 'replace' ? [] : ['outside']);
    const enclosed = update(threshold.draft, { x: 100, y: 100 });
    expect(enclosed.selection).toEqual(expected);
    session.setSelection(enclosed.selection ?? []);
    commitDrawingPointerDraft(session, enclosed.draft);
    expect(session.getSnapshot().selectedObjectIds).toEqual(expected);
    const returned = update(enclosed.draft, { x: 40, y: 40 });
    expect(returned.draft).not.toHaveProperty('clickObjectId');
    expect(session.getSnapshot().document).toEqual(before.document);
    expect(onDocumentCommit).not.toHaveBeenCalled();
  }
);

it('continues to move an already selected layer and prioritize its resize handle', () => {
  const { session } = createNestedSelectionSession();
  const start = (point: { x: number; y: number }) =>
    beginDrawingPointer({ point, snapshot: session.getSnapshot(), timestamp: 0 });
  expect(start({ x: 320, y: 320 }).draft).toMatchObject({
    kind: 'move',
    original: { id: 'outside' },
  });
  expect(start({ x: 340, y: 340 }).draft).toMatchObject({ kind: 'resize', handle: 'se' });
});

function createOverlapSelectionSession(multi = false) {
  const { session, onDocumentCommit } = createNestedSelectionSession();
  session.commitObject({
    id: 'upper',
    kind: 'rectangle',
    bounds: { x: 250, y: 250, width: 150, height: 150 },
    color: '#000',
    width: 2,
  });
  session.setSelection(multi ? ['small', 'outside'] : ['outside']);
  onDocumentCommit.mockClear();
  const before = session.getSnapshot();
  const started = beginDrawingPointer({
    point: { x: 320, y: 320 },
    snapshot: before,
    timestamp: 0,
  });
  if (!started.draft) throw new Error('Expected overlap gesture');
  const update = (draft: NonNullable<typeof started.draft>, x: number) =>
    updateDrawingPointerDraft({
      documentObjects: before.document.objects,
      draft,
      event: {} as ReactPointerEvent<HTMLCanvasElement>,
      point: { x, y: 320 },
      root: { kind: 'viewport', element: null },
    });
  return { session, onDocumentCommit, before, started, update };
}

it.each([false, true])(
  'moves selected layers below an unselected hit after four pixels, multi=%s',
  (multi) => {
    const scene = createOverlapSelectionSession(multi);
    expect(scene.started.draft).toMatchObject({ kind: 'marquee', clickObjectId: 'upper' });
    const threshold = scene.update(scene.started.draft!, 324);
    expect(threshold.draft.kind).toBe(multi ? 'move-selection' : 'move');
    expect(threshold.draft).not.toHaveProperty('clickObjectId');
    commitDrawingPointerDraft(scene.session, threshold.draft);
    expect(
      scene.session.getSnapshot().document.objects.find((object) => object.id === 'outside')
    ).toMatchObject({ bounds: { x: 304, y: 300 } });
    expect(
      scene.session.getSnapshot().document.objects.find((object) => object.id === 'upper')
    ).toEqual(scene.before.document.objects.at(-1));
    expect(scene.session.getSnapshot().selectedObjectIds).toEqual(
      multi ? ['small', 'outside'] : ['outside']
    );
    expect(scene.onDocumentCommit).toHaveBeenCalledOnce();
  }
);

it.each([false, true])(
  'selects the upper layer on an overlap click without moving selected layers, multi=%s',
  (multi) => {
    const scene = createOverlapSelectionSession(multi);
    const jitter = scene.update(scene.started.draft!, 323.99);
    expect(jitter.draft).toBe(scene.started.draft);
    commitDrawingPointerDraft(scene.session, jitter.draft);
    expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['upper']);
    expect(scene.session.getSnapshot().document).toEqual(scene.before.document);
    expect(scene.onDocumentCommit).not.toHaveBeenCalled();
  }
);

it('keeps an overlap drag after the pointer returns below the threshold', () => {
  const scene = createOverlapSelectionSession();
  const crossed = scene.update(scene.started.draft!, 324);
  const returned = scene.update(crossed.draft, 321);
  expect(returned.draft).not.toHaveProperty('clickObjectId');
  commitDrawingPointerDraft(scene.session, returned.draft);
  expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['outside']);
  expect(
    scene.session.getSnapshot().document.objects.find((object) => object.id === 'outside')
  ).toMatchObject({ bounds: { x: 301, y: 300 } });
});

it.each([
  { ctrlKey: true, shiftKey: false },
  { ctrlKey: false, shiftKey: true },
])('preserves modifier marquee over an unselected layer overlapping selection: %j', (modifiers) => {
  const scene = createOverlapSelectionSession();
  const started = beginDrawingPointer({
    modifiers,
    point: { x: 320, y: 320 },
    snapshot: scene.before,
    timestamp: 0,
  });
  expect(started.draft).toMatchObject({
    kind: 'marquee',
    clickObjectId: 'upper',
    mode: modifiers.ctrlKey ? 'toggle' : 'add',
  });
});

it('preserves rotation and shear while dragging selected geometry beneath an upper layer', () => {
  const scene = createOverlapSelectionSession();
  scene.session.commitObject({
    id: 'transformed',
    kind: 'rectangle',
    bounds: { x: 300, y: 300, width: 40, height: 40 },
    color: '#000',
    width: 2,
    rotation: 30,
    skewX: 20,
  });
  scene.session.commitObject({
    id: 'cover',
    kind: 'blur',
    bounds: { x: 250, y: 250, width: 150, height: 150 },
  });
  scene.session.select('transformed');
  const before = scene.session.getSnapshot();
  const started = beginDrawingPointer({
    point: { x: 320, y: 320 },
    snapshot: before,
    timestamp: 0,
  });
  if (!started.draft) throw new Error('Expected overlap gesture');
  const moved = updateDrawingPointerDraft({
    documentObjects: before.document.objects,
    draft: started.draft,
    event: {} as ReactPointerEvent<HTMLCanvasElement>,
    point: { x: 340, y: 330 },
    root: { kind: 'viewport', element: null },
  });
  commitDrawingPointerDraft(scene.session, moved.draft);
  expect(
    scene.session.getSnapshot().document.objects.find((object) => object.id === 'transformed')
  ).toMatchObject({ bounds: { x: 320, y: 310, width: 40, height: 40 }, rotation: 30, skewX: 20 });
});
