import { expect, it, vi } from 'vitest';
import { createDrawingSession, type DrawingDocumentCommit } from './session';

it('deletes an explicit object set atomically and preserves the remaining selection', () => {
  const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  for (const [id, x] of [
    ['one', 0],
    ['two', 20],
    ['three', 40],
  ] as const) {
    session.commitObject({ id, kind: 'blur', bounds: { x, y: 0, width: 10, height: 10 } });
  }
  session.setActiveTool('select');
  session.setSelection(['one', 'two']);
  onDocumentCommit.mockClear();

  session.deleteObjects(['one', 'three', 'missing', 'one']);

  expect(onDocumentCommit).toHaveBeenCalledOnce();
  expect(session.getSnapshot().document.objects.map((object) => object.id)).toEqual(['two']);
  expect(session.getSnapshot().selectedObjectIds).toEqual(['two']);
});
