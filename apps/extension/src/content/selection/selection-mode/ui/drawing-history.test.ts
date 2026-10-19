import { describe, expect, it, vi } from 'vitest';
import { createCropDrawingHistory } from './drawing-history';
import type { DrawingObject } from '../../../../features/drawing/public';

const ink = (id: string, x = 10): DrawingObject => ({
  id,
  kind: 'blur',
  bounds: { x, y: 20, width: 30, height: 40 },
});

describe('isolated Crop drawing history', () => {
  it('undoes and redoes committed document edits without recording replay', () => {
    const owner = createCropDrawingHistory();
    expect(owner.getState()).toEqual({ canUndo: false, canRedo: false });
    owner.session.commitObject(ink('first'));
    owner.session.replaceObject(ink('first', 50));
    owner.undo();
    expect(owner.session.getSnapshot().document.objects).toEqual([ink('first')]);
    owner.undo();
    expect(owner.session.getSnapshot().document.objects).toEqual([]);
    expect(owner.getState()).toEqual({ canUndo: false, canRedo: true });
    owner.undo();
    owner.redo();
    owner.redo();
    owner.redo();
    expect(owner.session.getSnapshot().document.objects).toEqual([ink('first', 50)]);
    expect(owner.getState()).toEqual({ canUndo: true, canRedo: false });
  });

  it('truncates redo after a new committed branch', () => {
    const owner = createCropDrawingHistory();
    owner.session.commitObject(ink('first'));
    owner.session.commitObject(ink('old-branch'));
    owner.undo();
    owner.session.commitObject(ink('new-branch'));
    expect(owner.getState().canRedo).toBe(false);
    owner.redo();
    expect(owner.session.getSnapshot().document.objects.map((object) => object.id)).toEqual([
      'first',
      'new-branch',
    ]);
  });

  it('ignores selection, preferences and preview but records a committed deletion', () => {
    const owner = createCropDrawingHistory();
    owner.session.commitObject(ink('first'));
    owner.session.select('first');
    owner.session.setActiveTool('text');
    owner.session.setDefaults({ ...owner.session.getSnapshot().defaults });
    owner.session.previewObjects([ink('first', 70)]);
    owner.undo();
    expect(owner.session.getSnapshot().document.objects).toEqual([]);
    expect(owner.session.getSnapshot().selectedObjectIds).toEqual([]);
    owner.redo();
    owner.session.deleteObjects(['first']);
    owner.undo();
    expect(owner.session.getSnapshot().document.objects).toEqual([ink('first')]);
  });

  it('does not create a phantom step for an unchanged canonical document', () => {
    const owner = createCropDrawingHistory();
    owner.session.commitObject(ink('first'));
    owner.session.replaceObject(ink('first'));
    owner.undo();
    expect(owner.session.getSnapshot().document.objects).toEqual([]);
  });

  it('releases listeners and retained documents when its session is disposed', () => {
    const owner = createCropDrawingHistory();
    const listener = vi.fn();
    const unsubscribe = owner.subscribe(listener);
    owner.session.commitObject(ink('first'));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    owner.session.commitObject(ink('second'));
    expect(listener).toHaveBeenCalledOnce();
    owner.session.dispose();
    owner.undo();
    owner.redo();
    expect(owner.getState()).toEqual({ canUndo: false, canRedo: false });
    expect(createCropDrawingHistory().getState()).toEqual({ canUndo: false, canRedo: false });
  });
});
