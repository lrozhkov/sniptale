import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoTimelinePlacementMode,
  VideoTrackKind,
} from '../../../../features/video/project/types';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation/root';
import { projectVideoProjectTextFragment } from '../../../../features/video/project/text/projection';
import { editReviewTextFragment } from '../../../../features/video/review/text-document';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
import { splitProjectClipsAtTimeWithResult, duplicateProjectClipsWithResult } from './split';

function fixture(audio: boolean) {
  const project = createEmptyVideoProject('Source text');
  if (audio) project.tracks.push(createVideoProjectTrack('Audio', 1, 'AUDIO'));
  const asset = createVideoProjectAsset(
    'Material',
    audio ? VideoProjectAssetType.AUDIO : VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 640,
      height: 360,
      duration: 10,
      mimeType: audio ? 'audio/wav' : 'video/webm',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const track = project.tracks.find(
    (item) => item.kind === (audio ? VideoTrackKind.AUDIO : VideoTrackKind.PRIMARY)
  )!;
  const clip = audio
    ? createAudioClipFromAsset(track.id, asset)
    : createVideoClipFromAsset(track.id, asset, 640, 360);
  if (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') throw new Error('Missing media');
  project.version = 5;
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 10;
  project.timelinePlacementMode = VideoTimelinePlacementMode.ALLOW_OVERLAP;
  project.textDocuments = [
    {
      id: 'text',
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Original',
            originalText: 'Recognized',
            revision: 1,
            timingRevision: 0,
            start: 1,
            end: 9,
            timeDomain: 'source',
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  return { project, clip, entry: project.textDocuments[0]! };
}

it.each([false, true])(
  'retains one source document through split and source timing operations (audio=%s)',
  (audio) => {
    const { project, clip, entry } = fixture(audio);
    const before = structuredClone(project);
    const result = splitProjectClipsAtTimeWithResult(project, clip.id, 5)!;
    expect(result.project.clips).toHaveLength(2);
    expect(
      result.project.clips.map((item) =>
        'sourceInstanceId' in item ? item.sourceInstanceId : null
      )
    ).toEqual([clip.id, clip.id]);
    expect(result.project.textDocuments).toEqual(project.textDocuments);
    expect(
      projectVideoProjectTextFragment(result.project, entry, entry.document.fragments[0]!).ranges
    ).toEqual([
      { start: 1, end: 5 },
      { start: 5, end: 9 },
    ]);
    const store = createVideoEditorProjectTestStore();
    store.getState().setProject(result.project);
    store.getState().moveClip(result.trailingClipId, 10);
    const moved = store.getState().project!;
    expect(
      projectVideoProjectTextFragment(moved, entry, entry.document.fragments[0]!).ranges
    ).toEqual([
      { start: 1, end: 5 },
      { start: 10, end: 14 },
    ]);
    store.getState().updateClipPlaybackRate(result.trailingClipId, 2);
    const accelerated = store.getState().project!;
    expect(
      projectVideoProjectTextFragment(accelerated, entry, entry.document.fragments[0]!).ranges
    ).toEqual([
      { start: 1, end: 5 },
      { start: 10, end: 12 },
    ]);
    expect(isExportReadyVideoProject(accelerated)).toBe(true);
    expect(project).toEqual(before);
  }
);

it.each([false, true])(
  'duplicates source text independently and leaves project text alone (audio=%s)',
  (audio) => {
    const { project, clip, entry } = fixture(audio);
    project.textDocuments!.push({
      id: 'free',
      binding: { kind: 'project' },
      document: { version: 1, fragments: [] },
    });
    const result = duplicateProjectClipsWithResult(project, clip.id)!;
    expect(result.project.textDocuments).toHaveLength(3);
    const copied = result.project.textDocuments![2]!;
    expect(copied.id).not.toBe(entry.id);
    expect(copied.binding).toMatchObject({ assetId: project.assets[0]!.id, kind: 'source' });
    if (copied.binding.kind !== 'source') throw new Error('Missing copied binding');
    expect(copied.binding.sourceInstanceId).not.toBe(clip.id);
    const edited = editReviewTextFragment(copied.document, 'phrase', { text: 'Copy' });
    if (!edited.ok) throw new Error(edited.reason);
    copied.document = edited.document;
    expect(entry.document.fragments[0]?.text).toBe('Original');
    expect(
      projectVideoProjectTextFragment(result.project, entry, entry.document.fragments[0]!).ranges
    ).toEqual([{ start: 1, end: 9 }]);
    expect(
      projectVideoProjectTextFragment(result.project, copied, copied.document.fragments[0]!).ranges
    ).toEqual([{ start: 1.25, end: 9.25 }]);
    expect(isExportReadyVideoProject(result.project)).toBe(true);
  }
);

it('refuses the complete duplicate when retained text would exceed the shared budget', () => {
  const { project, clip, entry } = fixture(false);
  entry.document.fragments = Array.from({ length: 1_001 }, (_, index) => ({
    ...entry.document.fragments[0]!,
    id: `phrase-${index}`,
  }));
  const before = structuredClone(project);
  expect(duplicateProjectClipsWithResult(project, clip.id)).toBeNull();
  expect(duplicateProjectClipsWithResult(project, clip.id)).toBeNull();
  expect(project).toEqual(before);
});
