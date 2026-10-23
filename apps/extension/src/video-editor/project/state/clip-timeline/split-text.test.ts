import { getProjectOriginalAudioRanges } from '../../../../features/video/project/timeline/original-audio';
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
  VideoClipLinkMode,
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

function withOriginalBinding(audio: boolean) {
  const { project, clip } = fixture(audio);
  delete project.textDocuments;
  delete clip.sourceInstanceId;
  project.version = 6;
  const track = createVideoProjectTrack('Voice', 2, 'AUDIO');
  project.tracks.push(track);
  const asset = { ...project.assets[0]!, id: 'voice-asset', type: VideoProjectAssetType.AUDIO };
  project.assets.push(asset);
  const take = createAudioClipFromAsset(track.id, asset, 2);
  take.duration = 6;
  take.sourceDuration = 6;
  take.originalAudioMute = {
    volume: 0.25,
    targets: [{ assetId: clip.assetId, sourceInstanceId: clip.id }],
  };
  project.clips.push(take);
  return { project, clip, take };
}

it.each([false, true])(
  'retains a targeted legacy instance across source split without text (audio=%s)',
  (audio) => {
    const { project, clip } = withOriginalBinding(audio);
    const before = structuredClone(project);
    const result = splitProjectClipsAtTimeWithResult(project, clip.id, 5)!;
    const sources = result.project.clips.filter(
      (item) => item.type === clip.type && item.assetId === clip.assetId
    );
    expect(
      sources.map((item) => ('sourceInstanceId' in item ? item.sourceInstanceId : null))
    ).toEqual([clip.id, clip.id]);
    expect(sources.map((item) => getProjectOriginalAudioRanges(result.project, item))).toEqual([
      [{ start: 2, end: 5, volume: 0.25 }],
      [{ start: 5, end: 8, volume: 0.25 }],
    ]);
    expect(isExportReadyVideoProject(result.project)).toBe(true);
    expect(project).toEqual(before);
  }
);

it('projects voice cuts and subsequent move and speed changes from current result geometry', () => {
  const { project, clip, take } = withOriginalBinding(false);
  const result = splitProjectClipsAtTimeWithResult(project, take.id, 5)!;
  expect(getProjectOriginalAudioRanges(result.project, clip)).toEqual([
    { start: 2, end: 8, volume: 0.25 },
  ]);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(result.project);
  store.getState().moveClip(result.trailingClipId, 9);
  store.getState().updateClipPlaybackRate(result.trailingClipId, 2);
  const changed = store.getState().project!;
  expect(getProjectOriginalAudioRanges(changed, clip)).toEqual([
    { start: 2, end: 5, volume: 0.25 },
    { start: 9, end: 10, volume: 0.25 },
  ]);
  expect(isExportReadyVideoProject(changed)).toBe(true);
});

it('remaps copied voice targets after linked source duplication and keeps original bindings', () => {
  const { project, clip, take } = withOriginalBinding(false);
  clip.groupId = take.groupId = 'linked';
  clip.linkMode = take.linkMode = VideoClipLinkMode.LINKED;
  const before = structuredClone(project);
  const result = duplicateProjectClipsWithResult(project, clip.id)!;
  const copiedSource = result.project.clips.find(
    (item) => item.id !== clip.id && item.type === 'VIDEO'
  );
  const copiedTake = result.project.clips.find(
    (item) => item.id !== take.id && item.type === 'AUDIO'
  );
  if (!copiedSource || copiedSource.type !== 'VIDEO' || !copiedTake || copiedTake.type !== 'AUDIO')
    throw new Error('Missing copies');
  expect(copiedSource.sourceInstanceId).toBeTruthy();
  expect(copiedSource.sourceInstanceId).not.toBe(clip.id);
  expect(copiedTake.originalAudioMute?.targets).toEqual([
    { assetId: clip.assetId, sourceInstanceId: copiedSource.sourceInstanceId },
  ]);
  expect(result.project.clips.find((item) => item.id === take.id)).toEqual(take);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  expect(project).toEqual(before);
});

it('keeps explicit targets when only the voice take is copied', () => {
  const { project, take } = withOriginalBinding(false);
  const result = duplicateProjectClipsWithResult(project, take.id)!;
  const copies = result.project.clips.filter((item) => item.type === 'AUDIO');
  expect(copies).toHaveLength(2);
  expect(
    copies.map((item) => (item.type === 'AUDIO' ? item.originalAudioMute : undefined))
  ).toEqual([take.originalAudioMute, take.originalAudioMute]);
});
