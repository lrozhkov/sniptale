import { expect, it, vi } from 'vitest';
import { createDrawingSession, type DrawingDocumentCommit } from './session';

function sessionWithObjects(accept = true) {
  const commits = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit: commits });
  for (const id of ['one', 'two', 'three']) {
    session.commitObject({ id, kind: 'blur', bounds: { x: 0, y: 0, width: 10, height: 10 } });
  }
  commits.mockImplementation(() => accept);
  commits.mockClear();
  return { session, commits };
}

it('duplicates a selected drawing with a visible offset and restores it through history replay', () => {
  const { session, commits } = sessionWithObjects();
  session.select('one');
  session.duplicateSelected();
  expect(session.getSnapshot().document.objects).toHaveLength(4);
  expect(session.getSnapshot().document.objects[3]).toMatchObject({
    kind: 'blur',
    bounds: { x: 12, y: 12 },
  });
  expect(session.getSnapshot().selectedObjectId).not.toBe('one');
  expect(commits).toHaveBeenCalledOnce();
  commits.mock.lastCall?.[0].replay(commits.mock.lastCall[0].before);
  expect(session.getSnapshot().document.objects).toHaveLength(3);
});

it('moves selected drawings in each direction and skips no-op edge moves', () => {
  const { session, commits } = sessionWithObjects();
  session.select('one');
  session.moveSelected('back');
  expect(commits).not.toHaveBeenCalled();
  session.moveSelected('forward');
  expect(session.getSnapshot().document.objects.map((object) => object.id)).toEqual([
    'two',
    'one',
    'three',
  ]);
  session.moveSelected('front');
  expect(session.getSnapshot().document.objects.map((object) => object.id)).toEqual([
    'two',
    'three',
    'one',
  ]);
  session.moveSelected('backward');
  expect(session.getSnapshot().document.objects.map((object) => object.id)).toEqual([
    'two',
    'one',
    'three',
  ]);
  session.moveSelected('back');
  expect(session.getSnapshot().document.objects.map((object) => object.id)).toEqual([
    'one',
    'two',
    'three',
  ]);
  expect(commits).toHaveBeenCalledTimes(4);
});

it('keeps the document intact when selection is empty or history rejects an action', () => {
  const { session } = sessionWithObjects(false);
  session.moveSelected('front');
  session.duplicateSelected();
  session.select('one');
  session.moveSelected('front');
  session.duplicateSelected();
  expect(session.getSnapshot().document.objects.map((object) => object.id)).toEqual([
    'one',
    'two',
    'three',
  ]);
  expect(session.getSnapshot().selectedObjectIds).toEqual(['one']);
});
