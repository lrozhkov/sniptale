import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../factories/creation';
import { createCanvasComment } from '../../review/comments';
import { parseReviewAnnotation } from '../../review/validation';
import { addVideoProjectCommentDocument, applyVideoProjectCommentEdit } from './authoring';
import { isExportReadyVideoProject } from '../validation/root';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'comments',
    filename: 'video.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const note = { id: 'note', text: '', anchor: { kind: 'point' as const, time: 2 } };
  const comment = createCanvasComment({ id: 'bubble', annotationId: note.id, start: 2 });
  const result = addVideoProjectCommentDocument(project, {
    id: 'comments',
    target: { kind: 'source', clipId: clip.id },
    note,
  });
  if (!result.ok || !result.document) throw new Error('Missing accepted comments');
  result.document.canvasComments = [comment];
  return { project: result.project, entry: result.document, original: project, clip, note };
}

it('adds an empty editable note without changing Gallery committed parsing or reviving legacy overlays', () => {
  const { project, entry, original, note } = fixture();
  expect(project.version).toBe(23);
  expect(entry.annotations[0]?.text).toBe('');
  expect(entry.canvasComments[0]?.annotationId).toBe(note.id);
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(original.commentDocuments).toBeUndefined();
  expect(parseReviewAnnotation(note, 10)).toBeNull();
  expect(parseReviewAnnotation(note, 10, true)).toEqual(note);
});

it('preserves accepted identity on no-op, changes only note fields, and refuses stale or recreated bases', () => {
  const { project, entry } = fixture();
  const noop = applyVideoProjectCommentEdit(project, entry, {
    kind: 'note',
    id: 'note',
    patch: { text: '' },
  });
  expect(noop).toEqual({ ok: true, project, document: entry });
  if (!noop.ok) throw new Error('No-op refused');
  expect(noop.project).toBe(project);
  const changed = applyVideoProjectCommentEdit(project, entry, {
    kind: 'note',
    id: 'note',
    patch: { text: 'Accepted', anchor: { kind: 'range', start: 1, end: 4 } },
  });
  if (!changed.ok || !changed.document) throw new Error('Edit refused');
  expect(changed.document.annotations[0]).toMatchObject({
    text: 'Accepted',
    anchor: { kind: 'range', start: 1, end: 4 },
  });
  expect(changed.document.canvasComments).toEqual(entry.canvasComments);
  expect(entry.annotations[0]!.text).toBe('');
  expect(
    applyVideoProjectCommentEdit(changed.project, entry, {
      kind: 'note',
      id: 'note',
      patch: { text: 'Stale' },
    })
  ).toEqual({ ok: false, reason: 'stale' });
  expect(
    applyVideoProjectCommentEdit(
      { ...project, commentDocuments: [structuredClone(entry)] },
      entry,
      { kind: 'remove-document' }
    )
  ).toEqual({ ok: false, reason: 'stale' });
});

it('keeps dormant source notes editable while enforcing every bound track lock and source bounds', () => {
  const { project, entry, clip } = fixture();
  const edit = { kind: 'note' as const, id: 'note', patch: { text: 'Current' } };
  const locked = {
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, locked: true })),
  };
  expect(applyVideoProjectCommentEdit(locked, entry, edit)).toEqual({
    ok: false,
    reason: 'locked',
  });
  expect(
    addVideoProjectCommentDocument(locked, {
      id: 'new',
      target: { kind: 'source', clipId: clip.id },
      note: entry.annotations[0]!,
    })
  ).toEqual({ ok: false, reason: 'locked' });
  const dormant = { ...project, clips: [] };
  expect(applyVideoProjectCommentEdit(dormant, entry, edit).ok).toBe(true);
  expect(
    applyVideoProjectCommentEdit(project, entry, {
      kind: 'note',
      id: 'note',
      patch: { anchor: { kind: 'point', time: 11 } },
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(applyVideoProjectCommentEdit({ ...dormant, assets: [] }, entry, edit)).toEqual({
    ok: false,
    reason: 'invalid',
  });
});

it('refuses missing, invalid and repeated identities without mutating accepted data', () => {
  const { project, entry } = fixture();
  const before = structuredClone(project);
  for (const edit of [
    { kind: 'note' as const, id: 'missing', patch: { text: 'No' } },
    { kind: 'remove-note' as const, id: 'missing' },
  ])
    expect(applyVideoProjectCommentEdit(project, entry, edit)).toEqual({
      ok: false,
      reason: 'stale',
    });
  expect(
    applyVideoProjectCommentEdit(project, entry, { kind: 'add-note', note: entry.annotations[0]! })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    applyVideoProjectCommentEdit(project, entry, {
      kind: 'note',
      id: 'note',
      patch: { anchor: { kind: 'point', time: NaN } },
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    addVideoProjectCommentDocument(project, {
      id: 'comments',
      target: { kind: 'project' },
      note: entry.annotations[0]!,
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    addVideoProjectCommentDocument(project, {
      id: 'new',
      target: { kind: 'source', clipId: 'missing' },
      note: entry.annotations[0]!,
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(
    addVideoProjectCommentDocument(project, {
      id: 'invalid',
      target: { kind: 'project' },
      note: { ...entry.annotations[0]!, anchor: { kind: 'point', time: NaN } },
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(project).toEqual(before);
});

it('keeps unrelated documents and passive legacy data when removing a note or document', () => {
  const { project, entry } = fixture();
  const added = addVideoProjectCommentDocument(project, {
    id: 'independent',
    target: { kind: 'project' },
    note: { id: 'note', text: 'Independent', anchor: { kind: 'point', time: 0 } },
  });
  if (!added.ok || !added.document) throw new Error('Missing independent document');
  const removed = applyVideoProjectCommentEdit(added.project, entry, {
    kind: 'remove-note',
    id: 'note',
  });
  if (!removed.ok || !removed.document) throw new Error('Note removal refused');
  expect(removed.document.annotations).toEqual([]);
  expect(removed.document.canvasComments).toEqual(entry.canvasComments);
  expect(removed.project.commentDocuments![1]).toBe(added.document);
  const document = applyVideoProjectCommentEdit(removed.project, removed.document, {
    kind: 'remove-document',
  });
  if (!document.ok) throw new Error('Document removal refused');
  expect(document.document).toBeNull();
  expect(document.project.commentDocuments).toEqual([added.document]);
});

it('refuses the complete note append when the project budget is full, including retry', () => {
  const { project, entry } = fixture();
  entry.annotations = Array.from({ length: 2000 }, (_, index) => ({
    id: String(index),
    text: '',
    anchor: { kind: 'point' as const, time: 2 },
  }));
  const before = structuredClone(project);
  for (let retry = 0; retry < 2; retry++)
    expect(
      applyVideoProjectCommentEdit(project, entry, {
        kind: 'add-note',
        note: { id: 'over-limit', text: '', anchor: { kind: 'point', time: 2 } },
      })
    ).toEqual({ ok: false, reason: 'invalid' });
  expect(project).toEqual(before);
});
