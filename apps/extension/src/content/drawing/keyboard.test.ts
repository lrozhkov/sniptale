import { expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
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
