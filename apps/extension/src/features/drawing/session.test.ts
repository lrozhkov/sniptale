import { describe, expect, it, vi } from 'vitest';
import { appendDrawingSample, buildDrawingStrokeOutline } from './freehand';
import { createDefaultDrawingToolDefaults } from './model';
import { createDrawingSession } from './session';

describe('drawing session', () => {
  it('keeps the drawing tool active while selecting a newly committed object', () => {
    const session = createDrawingSession();
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

  it('groups object replacements into reversible committed states', () => {
    const session = createDrawingSession({ historyLimit: 2 });
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
    session.undo();
    expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 0 } });
    session.redo();
    expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 10 } });
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
    const session = createDrawingSession();
    const listener = vi.fn();
    session.subscribe(listener);
    session.setActiveTool('marker');
    session.dispose();
    session.setActiveTool('pencil');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('covers selection, defaults, deletion, clearing, reset, and guarded no-ops', () => {
    const session = createDrawingSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    session.undo();
    session.redo();
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
    session.reset();
    unsubscribe();
    session.setActiveTool('marker');
    expect(session.getSnapshot()).toMatchObject({
      activeTool: 'marker',
      canRedo: false,
      canUndo: false,
      document: { objects: [] },
    });
    expect(listener).toHaveBeenCalled();
  });

  it('uses provided initial state and trims both history directions', () => {
    const initial = {
      version: 1 as const,
      objects: [{ id: 'one', kind: 'blur' as const, bounds: { x: 0, y: 0, width: 1, height: 1 } }],
    };
    const session = createDrawingSession({ initialDocument: initial, historyLimit: 1 });
    session.clear();
    session.undo();
    session.redo();
    session.redo();
    expect(session.getSnapshot().document.objects).toEqual([]);
  });
});
