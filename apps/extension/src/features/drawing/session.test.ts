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
