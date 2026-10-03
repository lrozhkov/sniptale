import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { appendDrawingSample, appendDrawingSamples, buildDrawingStrokeOutline } from './freehand';
import { createDefaultDrawingToolDefaults } from './model';
import { createDrawingSession, type DrawingDocumentCommit } from './session';

describe('drawing session', () => {
  it('keeps the drawing tool active while selecting a newly committed object', () => {
    const session = createDrawingSession({ onDocumentCommit: () => true });
    session.commitObject({
      id: 'line',
      kind: 'pencil',
      samples: [
        { x: 0, y: 0, t: 0 },
        { x: 20, y: 0, t: 16 },
      ],
      color: '#000000',
      width: 4,
    });
    expect(session.getSnapshot()).toMatchObject({ activeTool: 'pencil', selectedObjectId: 'line' });
  });

  it('publishes document commits and accepts external history replay without recommitting', () => {
    const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
    const session = createDrawingSession({ onDocumentCommit });
    session.commitObject({
      id: 'blur',
      kind: 'blur',
      bounds: { x: 0, y: 0, width: 20, height: 20 },
    });
    session.replaceObject({
      id: 'blur',
      kind: 'blur',
      bounds: { x: 10, y: 0, width: 20, height: 20 },
    });
    expect(onDocumentCommit).toHaveBeenCalledTimes(2);
    const replacement = onDocumentCommit.mock.calls[1]?.[0];
    expect(replacement?.before.objects[0]).toMatchObject({ bounds: { x: 0 } });
    expect(replacement?.after.objects[0]).toMatchObject({ bounds: { x: 10 } });
    expect(replacement!.replay(replacement!.before)).toBe(true);
    expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 0 } });
    expect(replacement!.replay(replacement!.after)).toBe(true);
    expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 10 } });
    expect(onDocumentCommit).toHaveBeenCalledTimes(2);
  });

  it('owns multiple selected ids and commits a batch replacement or deletion once', () => {
    const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
    const session = createDrawingSession({ onDocumentCommit });
    session.commitObject({
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      id: 'one',
      kind: 'blur',
    });
    session.commitObject({
      bounds: { x: 20, y: 0, width: 10, height: 10 },
      id: 'two',
      kind: 'blur',
    });
    session.setActiveTool('select');
    session.setSelection(['one', 'two', 'missing', 'one']);
    expect(session.getSnapshot()).toMatchObject({
      selectedObjectId: 'two',
      selectedObjectIds: ['one', 'two'],
    });

    onDocumentCommit.mockClear();
    session.replaceObjects([
      { id: 'one', kind: 'blur', bounds: { x: 5, y: 0, width: 10, height: 10 } },
      { id: 'two', kind: 'blur', bounds: { x: 25, y: 0, width: 10, height: 10 } },
    ]);
    expect(onDocumentCommit).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().selectedObjectIds).toEqual(['one', 'two']);

    session.deleteSelected();
    expect(onDocumentCommit).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().document.objects).toEqual([]);
    expect(session.getSnapshot().selectedObjectIds).toEqual([]);
  });

  it('leaves the document unchanged when the external history owner rejects a commit', () => {
    const session = createDrawingSession({ onDocumentCommit: () => false });
    session.commitObject({
      id: 'rejected',
      kind: 'blur',
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(session.getSnapshot().document.objects).toEqual([]);
  });

  it('coalesces dense velocity samples without reading pointer pressure', () => {
    const samples = appendDrawingSample(
      [
        { x: 0, y: 0, t: 0 },
        { x: 1, y: 0, t: 10 },
      ],
      { x: 1.5, y: 0, t: 11 },
      true
    );
    expect(samples).toHaveLength(2);
    const slow = buildDrawingStrokeOutline(
      [
        { x: 0, y: 0, t: 0 },
        { x: 20, y: 0, t: 100 },
      ],
      16,
      { dynamicWidth: true }
    );
    const fast = buildDrawingStrokeOutline(
      [
        { x: 0, y: 0, t: 0 },
        { x: 20, y: 0, t: 5 },
      ],
      16,
      { dynamicWidth: true }
    );
    expect(slow).not.toEqual(fast);
  });

  it('batches coalesced samples and reuses completed-stroke geometry', () => {
    const seed = [
      { x: 0, y: 0, t: 0 },
      { x: 4, y: 0, t: 4 },
    ];
    const additions = [
      { x: 5, y: 0, t: 5 },
      { x: 12, y: 2, t: 12 },
      { x: 20, y: 4, t: 20 },
    ];
    const sequential = additions.reduce(
      (samples, sample) => appendDrawingSample(samples, sample, true),
      seed
    );
    const batched = appendDrawingSamples(seed, additions, true);
    expect(batched).toEqual(sequential);

    const first = buildDrawingStrokeOutline(batched, 8, { dynamicWidth: true });
    const cached = buildDrawingStrokeOutline(batched, 8, { dynamicWidth: true });
    const differentWidth = buildDrawingStrokeOutline(batched, 16, { dynamicWidth: true });
    expect(cached).toBe(first);
    expect(differentWidth).not.toBe(first);

    const longSamples = Array.from({ length: 200 }, (_, index) => ({
      x: index * 3,
      y: Math.sin(index / 8) * 30,
      t: index * 4,
    }));
    const finalOutline = buildDrawingStrokeOutline(longSamples, 16, {
      dynamicWidth: true,
      smoothingLevel: 10,
    });
    const previewOutline = buildDrawingStrokeOutline(longSamples, 16, {
      dynamicWidth: true,
      preview: true,
      smoothingLevel: 4,
    });
    expect(previewOutline.length).toBeLessThan(finalOutline.length);
  });

  it('covers duplicate samples, static strokes, dots, and sharp joins', () => {
    const seed = [{ x: 0, y: 0, t: 0 }];
    expect(appendDrawingSample(seed, { x: 0, y: 0, t: 1 }, false)).toEqual(seed);
    expect(appendDrawingSample(seed, { x: 4, y: 0, t: 1 }, false)).toHaveLength(2);
    expect(buildDrawingStrokeOutline([], 4, { dynamicWidth: false })).toEqual([]);
    expect(
      buildDrawingStrokeOutline(seed, 0.2, { dynamicWidth: false, smoothingLevel: 0 })
    ).toHaveLength(20);
    expect(
      buildDrawingStrokeOutline(
        [
          { x: 0, y: 0, t: 0 },
          { x: 20, y: 0, t: 10 },
          { x: 20, y: 20, t: 20 },
        ],
        8,
        { dynamicWidth: false, smoothingLevel: 2 }
      ).length
    ).toBeGreaterThan(20);
  });

  it('notifies subscribers and clears them on disposal', () => {
    const session = createDrawingSession({ onDocumentCommit: () => true });
    const listener = vi.fn();
    session.subscribe(listener);
    session.setActiveTool('marker');
    session.dispose();
    session.setActiveTool('pencil');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('covers selection, defaults, deletion, clearing, reset, and guarded no-ops', () => {
    const session = createDrawingSession({ onDocumentCommit: () => true });
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    session.deleteSelected();
    session.clear();
    session.setActiveTool('pencil');
    session.select(null);
    const defaults = createDefaultDrawingToolDefaults(['#000000']);
    session.setDefaults(defaults);
    session.setDefaults(defaults);
    session.setActiveTool('select');
    session.commitObject({
      id: 'box',
      kind: 'blur',
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    session.replaceObject({
      id: 'missing',
      kind: 'blur',
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    });
    session.select('missing');
    session.deleteSelected();
    session.select('box');
    session.deleteSelected();
    session.clear();
    unsubscribe();
    session.setActiveTool('marker');
    expect(session.getSnapshot()).toMatchObject({
      activeTool: 'marker',
      document: { objects: [] },
    });
    expect(listener).toHaveBeenCalled();
  });

  it('uses provided initial state and disposes its document', () => {
    const initial = {
      version: 1 as const,
      objects: [{ id: 'one', kind: 'blur' as const, bounds: { x: 0, y: 0, width: 1, height: 1 } }],
    };
    const session = createDrawingSession({
      initialDocument: initial,
      onDocumentCommit: () => true,
    });
    session.clear();
    expect(session.getSnapshot().document.objects).toEqual([]);
    session.dispose();
    expect(session.getSnapshot().document.objects).toEqual([]);
  });
});

it('projects reads and previews without changing canonical history or publishing layout commits', () => {
  const initial = {
    id: 'layout',
    kind: 'blur' as const,
    bounds: { x: 10, y: 20, width: 30, height: 40 },
  };
  let shift = 0;
  const capture = vi.fn();
  const resolve = vi.fn((object: typeof initial) =>
    shift === 0 ? object : { ...object, bounds: { ...object.bounds, x: object.bounds.x + shift } }
  );
  const commits: DrawingDocumentCommit[] = [];
  const session = createDrawingSession({
    initialDocument: { version: 1, objects: [initial] },
    objectProjection: {
      capture,
      resolve: (object) => (object.kind === 'blur' ? resolve(object) : object),
    },
    onDocumentCommit: (commit) => {
      commits.push(commit);
      return true;
    },
  });
  expect(capture).toHaveBeenCalledWith(initial);
  expect(session.getSnapshot().document.objects[0]).toBe(initial);
  shift = 100;
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 110 } });
  expect(commits).toHaveLength(0);
  const preview = { ...initial, bounds: { ...initial.bounds, x: 50 } };
  session.previewObjects([preview]);
  expect(capture).toHaveBeenCalledWith(preview, initial);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 150 } });
  session.clearObjectPreview();
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 110 } });
  session.replaceObject(preview);
  expect(commits[0]?.before.objects[0]).toBe(initial);
  expect(commits[0]?.after.objects[0]).toBe(preview);
  commits[0]!.replay(commits[0]!.before);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 110 } });
});

it('duplicates projected objects and ignores empty selection without committing layout changes', () => {
  const object = {
    id: 'source',
    kind: 'blur' as const,
    bounds: { x: 10, y: 20, width: 30, height: 40 },
  };
  const commits: DrawingDocumentCommit[] = [];
  const session = createDrawingSession({
    initialDocument: { version: 1, objects: [object] },
    objectProjection: {
      capture: () => undefined,
      resolve: (candidate) =>
        candidate === object ? { ...object, bounds: { ...object.bounds, x: 110 } } : candidate,
    },
    onDocumentCommit: (commit) => {
      commits.push(commit);
      return true;
    },
  });
  session.duplicateSelected();
  expect(commits).toHaveLength(0);
  session.select(object.id);
  session.duplicateSelected();
  expect(session.getSnapshot().document.objects[1]).toMatchObject({ bounds: { x: 122, y: 32 } });
  expect(commits[0]?.before.objects).toEqual([object]);
});

it('discards projected previews on rejected edits, cancellation and replay', () => {
  const original = {
    id: 'preview',
    kind: 'blur' as const,
    bounds: { x: 10, y: 20, width: 30, height: 40 },
  };
  const sibling = { ...original, id: 'sibling' };
  let commit: DrawingDocumentCommit | undefined;
  let outcome: 'accept' | 'reject' | 'throw' = 'accept';
  const session = createDrawingSession({
    objectProjection: { capture: () => undefined, resolve: (object) => object },
    onDocumentCommit: (next) => {
      commit = next;
      if (outcome === 'throw') throw new Error('rejected');
      return outcome === 'accept';
    },
  });
  session.commitObject(original);
  session.commitObject(sibling);
  const preview = { ...original, bounds: { ...original.bounds, x: 70 } };
  session.previewObjects([]);
  session.previewObjects([original]);
  expect(session.getSnapshot().document.objects[0]).toBe(original);
  session.previewObjects([preview]);
  expect(session.getSnapshot().document.objects).toEqual([preview, sibling]);
  outcome = 'reject';
  session.replaceObject(preview);
  expect(session.getSnapshot().document.objects).toEqual([original, sibling]);
  session.previewObjects([preview]);
  outcome = 'throw';
  expect(() => session.replaceObject(preview)).toThrow('rejected');
  expect(session.getSnapshot().document.objects).toEqual([original, sibling]);
  session.previewObjects([preview]);
  expect(commit!.replay(commit!.before)).toBe(true);
  expect(session.getSnapshot().document.objects).toEqual([original, sibling]);
  session.dispose();
  session.previewObjects([preview]);
  expect(session.getSnapshot().document.objects).toEqual([]);
});

it('keeps projected object positions while changing selection and stacking order', () => {
  const objects = ['a', 'b', 'c'].map((id, index) => ({
    id,
    kind: 'blur' as const,
    bounds: { x: index * 20, y: 0, width: 10, height: 10 },
  }));
  const session = createDrawingSession({
    initialDocument: { version: 1, objects },
    objectProjection: {
      capture: () => undefined,
      resolve: (object) =>
        object.kind === 'blur' ? { ...object, bounds: { ...object.bounds, y: 100 } } : object,
    },
    onDocumentCommit: () => true,
  });
  const order = () => session.getSnapshot().document.objects.map((object) => object.id);
  session.toggleSelection('missing');
  session.toggleSelection('b');
  session.moveSelected('forward');
  expect(order()).toEqual(['a', 'c', 'b']);
  session.moveSelected('backward');
  expect(order()).toEqual(['a', 'b', 'c']);
  session.moveSelected('front');
  expect(order()).toEqual(['a', 'c', 'b']);
  session.moveSelected('back');
  expect(order()).toEqual(['b', 'a', 'c']);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 20, y: 100 } });
  session.toggleSelection('b');
  session.moveSelected('front');
  expect(order()).toEqual(['b', 'a', 'c']);
});

it('avoids repeated vector-length work across smoothing passes of a long stroke', () => {
  const samples = Array.from({ length: 800 }, (_, i) => ({
    x: i * 0.8,
    y: Math.sin(i * 0.07) * 40 + Math.cos(i * 0.023) * 70,
    t: i * 4,
  }));
  const hypot = vi.spyOn(Math, 'hypot');
  try {
    const outline = buildDrawingStrokeOutline(samples, 8, {
      dynamicWidth: true,
      smoothingLevel: 10,
    });
    expect(outline).toHaveLength(1754);
    expect(hypot.mock.calls.length).toBeLessThan(samples.length * 30);
  } finally {
    hypot.mockRestore();
  }
});

it.each([
  [false, false, '1a0ef3625c99bd94fa70f33b8bf25d272e85d63ebf4ee8c8b0732451fe63bb78'],
  [false, true, '99171b8b0b915ad1eed43772cd63d08828dc844862693ee37fefc6f1543d57f2'],
  [true, false, '6b2e2a1a503130f229e4c6add8da0480fd4e00a9f03de3ceea60f502569db9d3'],
  [true, true, 'b2faaba128ccf66492e5181ca0f3097a89808ddb396d9ecba55a59edcd66e58a'],
] as const)(
  'preserves baseline stroke geometry (preview=%s, dynamic=%s)',
  (preview, dynamicWidth, digest) => {
    const samples = Array.from({ length: 800 }, (_, i) => ({
      x: i * 0.8,
      y: Math.sin(i * 0.07) * 40 + Math.cos(i * 0.023) * 70,
      t: i * 4,
    }));
    const outline = buildDrawingStrokeOutline(samples, 8, {
      preview,
      dynamicWidth,
      smoothingLevel: 10,
    });
    expect(createHash('sha256').update(JSON.stringify(outline)).digest('hex')).toBe(digest);
  }
);
