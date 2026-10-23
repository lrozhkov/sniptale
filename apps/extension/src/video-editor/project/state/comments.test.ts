import { expect, it } from 'vitest';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';

function fixture() {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(
    createVideoProjectFromRecording({
      recordingId: 'notes',
      filename: 'video.webm',
      width: 640,
      height: 360,
      duration: 10,
      mimeType: 'video/webm',
      size: 100,
    })
  );
  const project = store.getState().project!;
  return { store, project };
}

it('creates and edits through the real root updater with Undo/Redo and one history step per command', () => {
  const { store, project } = fixture();
  const note = { id: 'note', text: '', anchor: { kind: 'point' as const, time: 2 } };
  expect(
    store.getState().addCommentDocument(project, {
      id: 'comments',
      target: { kind: 'project' },
      note,
    })
  ).toBe('comments');
  const added = store.getState().project!;
  expect(store.getState().projectHistory.past).toHaveLength(1);
  expect(
    store.getState().editCommentDocument(added, 'comments', {
      kind: 'note',
      id: 'note',
      patch: { text: 'Accepted text' },
    })
  ).toBe(true);
  const changed = store.getState().project!;
  expect(store.getState().projectHistory.past).toHaveLength(2);
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, changed);
  if (undo?.status !== 'applied') throw new Error('Expected Undo');
  expect(undo.project.commentDocuments?.[0]?.annotations[0]?.text).toBe('');
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected Redo');
  expect(redo.project.commentDocuments?.[0]?.annotations[0]?.text).toBe('Accepted text');
});

it('rejects old project snapshots and no-op commands preserve accepted identity and history', () => {
  const { store, project } = fixture();
  store.getState().addCommentDocument(project, {
    id: 'comments',
    target: { kind: 'project' },
    note: { id: 'note', text: '', anchor: { kind: 'point', time: 0 } },
  });
  const current = store.getState().project!;
  const history = store.getState().projectHistory;
  expect(
    store.getState().editCommentDocument(project, 'comments', { kind: 'remove-document' })
  ).toBe(false);
  expect(
    store.getState().editCommentDocument(current, 'comments', {
      kind: 'note',
      id: 'note',
      patch: { text: '' },
    })
  ).toBe(true);
  expect(
    store.getState().editCommentDocument(current, 'comments', {
      kind: 'note',
      id: 'missing',
      patch: { text: '' },
    })
  ).toBe(false);
  expect(store.getState().project).toBe(current);
  expect(store.getState().projectHistory).toBe(history);
  store.getState().setProject(structuredClone(current));
  expect(
    store.getState().editCommentDocument(current, 'comments', { kind: 'remove-document' })
  ).toBe(false);
});

it('refuses stale creation, missing documents and invalid source targets without history', () => {
  const { store, project } = fixture();
  const input = {
    id: 'comments',
    target: { kind: 'source' as const, clipId: 'missing' },
    note: { id: 'note', text: '', anchor: { kind: 'point' as const, time: 0 } },
  };
  const history = store.getState().projectHistory;
  expect(store.getState().addCommentDocument(project, input)).toBeNull();
  expect(
    store.getState().editCommentDocument(project, 'missing', { kind: 'remove-document' })
  ).toBe(false);
  store.getState().setProject(structuredClone(project));
  const accepted = store.getState().project;
  expect(
    store.getState().addCommentDocument(project, { ...input, target: { kind: 'project' } })
  ).toBeNull();
  expect(store.getState().project).toBe(accepted);
  expect(store.getState().projectHistory.past).toHaveLength(history.past.length);
});
