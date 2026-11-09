import { expect, it, vi } from 'vitest';
import { createDrawingSession, type DrawingObject } from '../../features/drawing/public';
import { handleDrawingKeyDown } from './keyboard';

it('leaves undo and redo shortcuts to the shared page-preparation history owner', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const preventDefault = vi.fn();
  const args = {
    event: { key: 'z', preventDefault, shiftKey: false },
    hasDraft: false,
    onCancelDraft: vi.fn(),
    onEditText: vi.fn(),
    session,
    snapshot: session.getSnapshot(),
  };

  handleDrawingKeyDown(args);
  handleDrawingKeyDown({ ...args, event: { key: 'y', preventDefault, shiftKey: false } });

  expect(preventDefault).not.toHaveBeenCalled();
});

it('handles consecutive Escape presses as selection, tool, then drawing-mode reset', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const preventDefault = vi.fn();
  const onExit = vi.fn();
  session.setActiveTool('arrow');
  session.commitObject({
    id: 'arrow',
    kind: 'arrow',
    color: '#000000',
    dynamicWidth: true,
    end: { x: 20, y: 20 },
    start: { x: 0, y: 0 },
    width: 4,
  });

  const pressEscape = () =>
    handleDrawingKeyDown({
      event: { key: 'Escape', preventDefault, shiftKey: false },
      hasDraft: false,
      onCancelDraft: vi.fn(),
      onEditText: vi.fn(),
      onExit,
      session,
      snapshot: session.getSnapshot(),
    });

  pressEscape();
  expect(session.getSnapshot()).toMatchObject({ activeTool: 'arrow', selectedObjectId: null });
  expect(onExit).not.toHaveBeenCalled();

  pressEscape();
  expect(session.getSnapshot()).toMatchObject({ activeTool: 'select', selectedObjectId: null });
  expect(onExit).not.toHaveBeenCalled();

  pressEscape();
  expect(session.getSnapshot()).toMatchObject({ activeTool: 'select', selectedObjectId: null });
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledTimes(3);
});

it(
  'routes repeated mixed-selection nudges through one async transform owner and ' +
    'cancels pending work on Escape',
  () => {
    const commit = vi.fn(() => true);
    const session = createDrawingSession({ onDocumentCommit: commit });
    const mask = {
      id: 'mask',
      kind: 'simplify',
      bounds: { x: 10, y: 20, width: 30, height: 30 },
      settings: session.getSnapshot().defaults.simplify,
    } as const;
    const box = {
      id: 'box',
      kind: 'rectangle',
      bounds: { x: 50, y: 20, width: 30, height: 30 },
      color: '#123456',
      width: 1,
    } as const;
    session.commitObject(mask);
    session.commitObject(box);
    session.setSelection([mask.id, box.id]);
    commit.mockClear();
    let pending: readonly DrawingObject[] = [];
    const transform = vi.fn(async (objects: readonly DrawingObject[]) => {
      pending = objects;
    });
    const cancel = vi.fn(() => {
      pending = [];
    });
    const simplify = {
      transform,
      cancel,
      getPending: () => (pending.length ? [{ object: mask, updating: true }] : []),
      getPendingObjects: () => pending,
    };
    const press = (key: string) =>
      handleDrawingKeyDown({
        event: { key, shiftKey: false, preventDefault: vi.fn() },
        hasDraft: false,
        onCancelDraft: vi.fn(),
        onEditText: vi.fn(),
        session,
        snapshot: session.getSnapshot(),
        simplify,
      });
    press('ArrowRight');
    press('ArrowRight');
    expect(transform).toHaveBeenCalledTimes(2);
    expect(pending).toMatchObject([{ bounds: { x: 12 } }, { bounds: { x: 52 } }]);
    expect(session.getSnapshot().document.objects).toEqual([mask, box]);
    expect(commit).not.toHaveBeenCalled();
    press('Escape');
    expect(cancel).toHaveBeenCalledOnce();
    expect(session.getSnapshot().selectedObjectIds).toEqual([mask.id, box.id]);
  }
);
