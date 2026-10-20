import { expect, it } from 'vitest';
import { createCanvasComment } from '../../review/comments';
import { createVideoProjectFromRecording } from '../factories/creation';
import { isCommentSourceClip, projectVideoProjectCommentAnchor } from './projection';
import type { VideoProjectCommentDocument } from './types';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'video.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO') throw new Error('Missing video');
  const entry: VideoProjectCommentDocument = {
    id: 'comments',
    binding: {
      kind: 'source',
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
    },
    annotations: [
      { id: 'note', text: 'Linked text', anchor: { kind: 'range', start: 2, end: 10 } },
    ],
    canvasComments: [
      createCanvasComment({ id: 'bubble', annotationId: 'note', start: 2, end: 10 }),
    ],
  };
  const first = {
    ...clip,
    id: 'first',
    sourceStart: 0,
    sourceDuration: 5,
    duration: 5,
    startTime: 2.75,
    sourceInstanceId: clip.sourceInstanceId ?? clip.id,
  };
  const second = {
    ...first,
    id: 'second',
    sourceStart: 7,
    sourceDuration: 5,
    duration: 2.5,
    playbackRate: 2,
    startTime: 7.75,
  };
  project.clips = [
    first,
    second,
    { ...clip, id: 'independent', sourceInstanceId: 'other', startTime: 0 },
  ];
  project.duration = 16;
  project.commentDocuments = [entry];
  return { project, entry, first, second, clip };
}

it('projects each retained slice with intro offset, source rate and exact instance isolation', () => {
  const { project, entry } = fixture();
  const before = structuredClone(entry);
  expect(projectVideoProjectCommentAnchor(project, entry, entry.annotations[0]!.anchor)).toEqual([
    { clipId: 'first', start: 4.75, end: 7.75 },
    { clipId: 'second', start: 7.75, end: 9.25 },
  ]);
  expect(entry).toEqual(before);
});

it('uses half-open note points without borrowing another source instance', () => {
  const { project, entry } = fixture();
  expect(projectVideoProjectCommentAnchor(project, entry, { kind: 'point', time: 7 })).toEqual([
    { clipId: 'second', start: 7.75, end: 7.75 },
  ]);
  project.clips = project.clips.filter((clip) => clip.id !== 'second');
  expect(projectVideoProjectCommentAnchor(project, entry, { kind: 'point', time: 5 })).toEqual([]);
  expect(projectVideoProjectCommentAnchor(project, entry, { kind: 'point', time: 4 })).toEqual([
    { clipId: 'first', start: 6.75, end: 6.75 },
  ]);
});

it('retains cut content, restores projection and bounds stale sourceDuration by placement duration', () => {
  const { project, entry, first, second } = fixture();
  const before = structuredClone(entry);
  project.clips = [];
  expect(projectVideoProjectCommentAnchor(project, entry, entry.annotations[0]!.anchor)).toEqual(
    []
  );
  project.clips = [{ ...first, duration: 3, sourceDuration: 12 }, second];
  expect(projectVideoProjectCommentAnchor(project, entry, entry.annotations[0]!.anchor)).toEqual([
    { clipId: 'first', start: 4.75, end: 5.75 },
    { clipId: 'second', start: 7.75, end: 9.25 },
  ]);
  expect(entry).toEqual(before);
});

it('keeps editorial note projection available on hidden and locked tracks', () => {
  const { project, entry } = fixture();
  project.tracks = project.tracks.map((track) => ({ ...track, locked: true, visible: false }));
  expect(
    projectVideoProjectCommentAnchor(project, entry, { kind: 'point', time: 8 }, false)
  ).toEqual([]);
  expect(projectVideoProjectCommentAnchor(project, entry, { kind: 'point', time: 8 })).toHaveLength(
    1
  );
});

it('keeps project note clocks independent from source placement', () => {
  const { project, entry } = fixture();
  entry.binding = { kind: 'project' };
  project.clips = [];
  expect(projectVideoProjectCommentAnchor(project, entry, { kind: 'point', time: 3 })).toEqual([
    { clipId: null, start: 3, end: 3 },
  ]);
});

it('uses legacy clip identity only until an explicit source instance exists', () => {
  const { clip } = fixture();
  const legacy = { ...clip };
  delete legacy.sourceInstanceId;
  expect(
    isCommentSourceClip(legacy, {
      kind: 'source',
      assetId: clip.assetId,
      sourceInstanceId: clip.id,
    })
  ).toBe(true);
  expect(
    isCommentSourceClip(
      { ...legacy, sourceInstanceId: 'new' },
      { kind: 'source', assetId: clip.assetId, sourceInstanceId: clip.id }
    )
  ).toBe(false);
  expect(isCommentSourceClip(legacy, { kind: 'project' })).toBe(false);
  expect(
    isCommentSourceClip(legacy, { kind: 'source', assetId: 'foreign', sourceInstanceId: clip.id })
  ).toBe(false);
});
