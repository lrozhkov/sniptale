import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { createCanvasComment } from '../../../../features/video/review/comments';
import { projectVideoProjectCommentAnchor } from '../../../../features/video/project/comments/projection';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation/root';
import {
  VideoTimelinePlacementMode,
  VideoClipLinkMode,
} from '../../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
import { splitProjectClipsAtTimeWithResult, duplicateProjectClipsWithResult } from './split';

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
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO') throw new Error('Missing video');
  delete clip.sourceInstanceId;
  project.version = 23;
  project.timelinePlacementMode = VideoTimelinePlacementMode.ALLOW_OVERLAP;
  project.commentDocuments = [
    {
      id: 'comments',
      binding: { kind: 'source', assetId: clip.assetId, sourceInstanceId: clip.id },
      annotations: [{ id: 'note', text: 'Original', anchor: { kind: 'range', start: 1, end: 9 } }],
      canvasComments: [
        createCanvasComment({ id: 'bubble', annotationId: 'note', start: 1, end: 9 }),
      ],
    },
  ];
  return { project, clip, entry: project.commentDocuments[0]! };
}

it('retains source comments through actual split, move and speed commands without rewriting anchors', () => {
  const { project, clip, entry } = fixture();
  const before = structuredClone(project);
  const split = splitProjectClipsAtTimeWithResult(project, clip.id, 5)!;
  expect(
    split.project.clips.map((item) => ('sourceInstanceId' in item ? item.sourceInstanceId : null))
  ).toEqual([clip.id, clip.id]);
  expect(split.project.commentDocuments).toEqual([entry]);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(split.project);
  store.getState().moveClip(split.trailingClipId, 10);
  store.getState().updateClipPlaybackRate(split.trailingClipId, 2);
  const changed = store.getState().project!;
  expect(
    projectVideoProjectCommentAnchor(changed, entry, entry.annotations[0]!.anchor).map(
      ({ start, end }) => ({ start, end })
    )
  ).toEqual([
    { start: 1, end: 5 },
    { start: 10, end: 12 },
  ]);
  expect(isExportReadyVideoProject(changed)).toBe(true);
  expect(project).toEqual(before);
});

it('duplicates source documents independently once for all selected pieces and preserves local links', () => {
  const { project, clip, entry } = fixture();
  const split = splitProjectClipsAtTimeWithResult(project, clip.id, 5)!;
  split.project.clips = split.project.clips.map((item) => ({
    ...item,
    groupId: 'comment-group',
    linkMode: VideoClipLinkMode.LINKED,
  }));
  const result = duplicateProjectClipsWithResult(split.project, clip.id)!;
  expect(result.project.commentDocuments).toHaveLength(2);
  const copy = result.project.commentDocuments![1]!;
  expect(copy.id).not.toBe(entry.id);
  expect(copy.binding).not.toEqual(entry.binding);
  expect(copy.canvasComments[0]?.annotationId).toBe(copy.annotations[0]?.id);
  copy.annotations[0]!.text = 'Copy';
  copy.canvasComments[0]!.style.radius = 3;
  expect(entry.annotations[0]?.text).toBe('Original');
  expect(entry.canvasComments[0]?.style.radius).toBe(14);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
});

it('refuses the complete duplicate at the shared overlay budget, including retries', () => {
  const { project, clip, entry } = fixture();
  entry.canvasComments = Array.from({ length: 51 }, (_, index) =>
    createCanvasComment({ id: String(index) })
  );
  const before = structuredClone(project);
  expect(duplicateProjectClipsWithResult(project, clip.id)).toBeNull();
  expect(duplicateProjectClipsWithResult(project, clip.id)).toBeNull();
  expect(project).toEqual(before);
});

it('leaves independent project comments untouched by source duplication', () => {
  const { project, clip } = fixture();
  project.commentDocuments!.push({
    id: 'independent',
    binding: { kind: 'project' },
    annotations: [],
    canvasComments: [],
  });
  const result = duplicateProjectClipsWithResult(project, clip.id)!;
  expect(
    result.project.commentDocuments!.filter((item) => item.binding.kind === 'project')
  ).toEqual([project.commentDocuments![1]]);
});
