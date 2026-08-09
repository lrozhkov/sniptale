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
