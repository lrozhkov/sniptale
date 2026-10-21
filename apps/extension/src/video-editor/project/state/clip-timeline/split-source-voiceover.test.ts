import {
  sourceVoiceoverPlaybackFixture as playbackFixture,
  pairedSourceVoiceoverPlaybackFixture as pairedPlaybackFixture,
} from '../../../../features/video/project/source-voiceover-playback.test-support';
import {
  planProjectSourceVoiceoverPlayback,
  getProjectSourceVoiceoverOriginalAudioRanges,
} from '../../../../features/video/project/source-voiceover-playback';
import { projectSourceVoiceoverViews } from '../../../../features/video/project/source-voiceover-views';
import { createAudioClipFromAsset } from '../../../../features/video/project/factories/clip';
import { getProjectOriginalAudioRanges } from '../../../../features/video/project/timeline/original-audio';
import { applyOverwritePlacement } from '../../../../features/video/project/timeline/overwrite.helpers';
import { VideoClipLinkMode } from '../../../../features/video/project/types';
import { expect, it } from 'vitest';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { buildReviewTimeMap } from '../../../../features/video/review/timeline';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation/root';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
import { duplicateProjectClipsWithResult, splitProjectClipsAtTime } from './split';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';

function fixture() {
  let project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing video');
  delete clip.sourceInstanceId;
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  const audio = createVideoProjectAsset(
    'Take',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'take' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  project = applyVideoProjectMutationPatch(project, {
    tracks: [...project.tracks, track],
    assets: [...project.assets, audio],
    sourceVoiceoverDocuments: [
      {
        id: 'voice',
        binding: { kind: 'source', assetId: clip.assetId, sourceInstanceId: clip.id },
        trackId: track.id,
        enabled: true,
        reference: buildReviewTimeMap(8, []),
        take: {
          id: 'take',
          assetId: audio.id,
          timelineStart: 1,
          sourceOffset: 0.5,
          duration: 4,
          volume: 1,
          muted: false,
          fadeIn: 0.25,
          fadeOut: 0.5,
          sourceAnchor: [{ start: 1, end: 5, offset: 0, duration: 4 }],
        },
      },
    ],
  });
  return { project, clip, track };
}

it('keeps a legacy whole take through actual split move trim rate and deletion commands', () => {
  const { project, clip } = fixture();
  const before = structuredClone(project);
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().splitClipAt(clip.id, 2);
  const parts = store.getState().project!.clips.filter((item) => item.type === 'VIDEO');
  expect(parts.map((part) => part.sourceInstanceId)).toEqual([clip.id, clip.id]);
  const child = parts.find((part) => part.id !== clip.id)!;
  store.getState().addTrack('PRIMARY');
  const destination = store
    .getState()
    .project!.tracks.find((track) => track.id !== clip.trackId && track.kind === 'PRIMARY')!;
  store.getState().moveClip(child.id, 2, destination.id);
  store.getState().trimClipEnd(child.id, 3);
  store.getState().trimClipStart(child.id, 1);
  store.getState().updateClipPlaybackRate(child.id, 2);
  store.getState().moveClip(child.id, 3);
  store.getState().deleteClip([clip.id, child.id]);
  const state = store.getState();
  expect(state.project!.clips).toHaveLength(0);
  expect(state.project!.sourceVoiceoverDocuments).toEqual(before.sourceVoiceoverDocuments);
  expect(isExportReadyVideoProject(state.project)).toBe(true);
  const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.clips).toHaveLength(2);
  expect(undo.project.sourceVoiceoverDocuments).toEqual(before.sourceVoiceoverDocuments);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.clips).toHaveLength(0);
  expect(redo.project.sourceVoiceoverDocuments).toEqual(before.sourceVoiceoverDocuments);
  expect(project).toEqual(before);
});

it('duplicates a source into an independent whole take without copying bytes', () => {
  const { project, clip } = fixture();
  const before = structuredClone(project);
  const result = duplicateProjectClipsWithResult(project, clip.id);
  if (!result) throw new Error('Expected copy');
  expect(result.project.sourceVoiceoverDocuments).toHaveLength(2);
  const copy = result.project.sourceVoiceoverDocuments![1]!;
  const copiedClip = result.project.clips.find((item) => item.id === result.duplicateClipId);
  if (!copiedClip || copiedClip.type !== 'VIDEO') throw new Error('Missing copied source');
  expect(copy.binding.sourceInstanceId).toBe(copiedClip.sourceInstanceId);
  expect(copy.binding.sourceInstanceId).not.toBe(clip.id);
  expect(copy.id).not.toBe('voice');
  expect(copy.take.id).not.toBe('take');
  expect(copy.take.assetId).toBe(project.sourceVoiceoverDocuments![0]!.take.assetId);
  expect(result.project.assets).toEqual(project.assets);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  copy.take.sourceAnchor![0]!.start = 0;
  expect(project).toEqual(before);
});

it('refuses an over-budget copy without partial montage or resource changes', () => {
  const { project, clip } = fixture();
  const document = project.sourceVoiceoverDocuments![0]!;
  project.sourceVoiceoverDocuments = Array.from({ length: 512 }, (_, index) => ({
    ...document,
    id: `document-${index}`,
    take: { ...document.take, id: `take-${index}` },
  }));
  expect(isExportReadyVideoProject(project)).toBe(true);
  const before = structuredClone(project);
  expect(duplicateProjectClipsWithResult(project, clip.id)).toBeNull();
  expect(project).toEqual(before);
});

it('retains takes after deleting a source track and restores explicit voice track deletion with Undo', () => {
  const { project, clip, track } = fixture();
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().addTrack('PRIMARY');
  const sourceTrack = store
    .getState()
    .project!.tracks.find((item) => item.kind === 'PRIMARY' && item.id !== clip.trackId)!;
  store.getState().moveClip(clip.id, 0, sourceTrack.id);
  store.getState().deleteTrack(sourceTrack.id);
  expect(store.getState().project!.sourceVoiceoverDocuments).toEqual(
    project.sourceVoiceoverDocuments
  );
  expect(isExportReadyVideoProject(store.getState().project)).toBe(true);
  store.getState().deleteTrack(track.id);
  const state = store.getState();
  expect(state.project!.sourceVoiceoverDocuments).toEqual([]);
  expect(isExportReadyVideoProject(state.project)).toBe(true);
  const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.sourceVoiceoverDocuments).toEqual(project.sourceVoiceoverDocuments);
  expect(undo.project.tracks.some((item) => item.id === track.id)).toBe(true);
  expect(isExportReadyVideoProject(undo.project)).toBe(true);
});

function pairedFixture() {
  const { project, clip, track } = fixture();
  const source = project.assets.find((asset) => asset.id === clip.assetId)!;
  const originalTrack = createVideoProjectTrack('Original', 2, 'AUDIO');
  const original = createAudioClipFromAsset(originalTrack.id, source);
  const document = project.sourceVoiceoverDocuments![0]!;
  const paired = applyVideoProjectMutationPatch(project, {
    tracks: [...project.tracks, originalTrack],
    clips: [...project.clips, original],
    sourceVoiceoverDocuments: [
      {
        ...document,
        originalAudioSourceInstanceId: original.id,
        originalAudioMuteVolume: 0.25,
      },
    ],
  });
  expect(isExportReadyVideoProject(paired)).toBe(true);
  return { project: paired, clip, track, original };
}

it('freezes the paired legacy AUDIO identity before its first split and keeps exact ducking on both tails', () => {
  const { project, original } = pairedFixture();
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  store.getState().splitClipAt(original.id, 3);
  const after = store.getState().project!;
  const parts = after.clips.filter((clip) => clip.type === 'AUDIO');
  expect(parts).toHaveLength(2);
  expect(parts.map((part) => part.sourceInstanceId)).toEqual([original.id, original.id]);
  expect(
    parts.flatMap((part) =>
      part.type === 'AUDIO' ? getProjectOriginalAudioRanges(after, part) : []
    )
  ).toEqual([
    { start: 1, end: 3, volume: 0.25 },
    { start: 3, end: 5, volume: 0.25 },
  ]);
  expect(after.sourceVoiceoverDocuments).toEqual(project.sourceVoiceoverDocuments);
  expect(isExportReadyVideoProject(after)).toBe(true);
});

it('keeps paired original AUDIO identity on both overwrite tails', () => {
  const { project, original } = pairedFixture();
  const insert = {
    ...original,
    id: 'insert',
    sourceInstanceId: 'unrelated',
    startTime: 2,
    sourceDuration: 1,
    duration: 1,
  };
  const before = structuredClone(project);
  const after = applyOverwritePlacement({ ...project, clips: [...project.clips, insert] }, [
    insert.id,
  ]);
  const tails = after.clips.filter((clip) => clip.type === 'AUDIO' && clip.id !== insert.id);
  expect(tails).toHaveLength(2);
  expect(tails.map((tail) => (tail.type === 'AUDIO' ? tail.sourceInstanceId : null))).toEqual([
    original.id,
    original.id,
  ]);
  expect(
    tails.flatMap((tail) =>
      tail.type === 'AUDIO' ? getProjectOriginalAudioRanges(after, tail) : []
    )
  ).toEqual([
    { start: 1, end: 2, volume: 0.25 },
    { start: 3, end: 5, volume: 0.25 },
  ]);
  expect(getProjectOriginalAudioRanges(after, insert)).toEqual([]);
  expect(after.sourceVoiceoverDocuments).toEqual(project.sourceVoiceoverDocuments);
  expect(isExportReadyVideoProject(after)).toBe(true);
  expect(project).toEqual(before);
});

it('remaps both source and original AUDIO identities when copying their linked pair', () => {
  const { project, clip, original } = pairedFixture();
  clip.groupId = original.groupId = 'pair';
  clip.linkMode = original.linkMode = VideoClipLinkMode.LINKED;
  const before = structuredClone(project);
  const result = duplicateProjectClipsWithResult(project, clip.id);
  if (!result) throw new Error('Expected pair copy');
  const copiedSource = result.project.clips.find(
    (item) => item.type === 'VIDEO' && item.id !== clip.id
  );
  const copiedOriginal = result.project.clips.find(
    (item) => item.type === 'AUDIO' && item.id !== original.id
  );
  if (copiedSource?.type !== 'VIDEO' || copiedOriginal?.type !== 'AUDIO')
    throw new Error('Missing pair copy');
  const copy = result.project.sourceVoiceoverDocuments![1]!;
  expect(copy.binding.sourceInstanceId).toBe(copiedSource.sourceInstanceId);
  expect(copy.originalAudioSourceInstanceId).toBe(copiedOriginal.sourceInstanceId);
  expect(copy.originalAudioSourceInstanceId).not.toBe(original.id);
  expect(getProjectOriginalAudioRanges(result.project, original)).toEqual([
    { start: 1, end: 5, volume: 0.25 },
  ]);
  expect(getProjectOriginalAudioRanges(result.project, copiedOriginal)).toEqual([
    { start: 9, end: 13, volume: 0.25 },
  ]);
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  expect(project).toEqual(before);
});

it('drops the old paired AUDIO target when copying only the VIDEO source', () => {
  const { project, clip, original } = pairedFixture();
  const result = duplicateProjectClipsWithResult(project, clip.id);
  if (!result) throw new Error('Expected source copy');
  const copy = result.project.sourceVoiceoverDocuments![1]!;
  expect(copy).not.toHaveProperty('originalAudioSourceInstanceId');
  expect(copy.binding.sourceInstanceId).not.toBe(clip.id);
  expect(getProjectOriginalAudioRanges(result.project, original)).toEqual([
    { start: 1, end: 5, volume: 0.25 },
  ]);
  expect(result.project.sourceVoiceoverDocuments![0]!.originalAudioSourceInstanceId).toBe(
    original.id
  );
  expect(isExportReadyVideoProject(result.project)).toBe(true);
});

it('joins views after the real Native split command and retains the whole document', () => {
  const { project, clip, document } = playbackFixture(2);
  const split = splitProjectClipsAtTime(project, clip.id, 1);
  expect(split.clips.filter((clip) => clip.type === 'VIDEO')).toHaveLength(2);
  expect(split.sourceVoiceoverDocuments).toEqual([document]);
  expect(planProjectSourceVoiceoverPlayback(split).map((item) => item.entry.duration)).toEqual([2]);
});

it('keeps separate split occurrence views and whole identity without changing the playback join', () => {
  const { project, clip, document } = playbackFixture();
  const split = splitProjectClipsAtTime(project, clip.id, 2);
  const before = structuredClone(split);
  const views = projectSourceVoiceoverViews(split, split.sourceVoiceoverDocuments![0]!);
  expect(views).toHaveLength(2);
  expect(views.map((view) => view.documentId)).toEqual([document.id, document.id]);
  expect(new Set(views.map((view) => view.sourceClipId)).size).toBe(2);
  expect(new Set(views.map((view) => view.clip.id)).size).toBe(2);
  expect(views.map((view) => [view.clip.timelineStart, view.clip.duration])).toEqual([
    [0, 2],
    [2, 2],
  ]);
  expect(planProjectSourceVoiceoverPlayback(split)).toHaveLength(1);
  expect(split).toEqual(before);
});

it('ducks only the paired AUDIO instance using visible voice result intervals before target clipping', () => {
  const { project, document, clip, original } = pairedPlaybackFixture();
  expect(isExportReadyVideoProject(project)).toBe(true);
  clip.startTime = 2;
  original.startTime = 3;
  original.duration = 2;
  original.sourceDuration = 4;
  original.playbackRate = 2;
  const before = structuredClone(project);
  expect(
    planProjectSourceVoiceoverPlayback(project).map(({ entry }) => [
      entry.timelineStart,
      entry.duration,
    ])
  ).toEqual([[2, 4]]);
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, original)).toEqual([
    { start: 3, end: 5, volume: 0.25 },
  ]);
  expect(getProjectSourceVoiceoverOriginalAudioRanges(project, clip)).toEqual([]);
  expect(
    getProjectSourceVoiceoverOriginalAudioRanges(project, {
      ...original,
      sourceInstanceId: 'another-insertion',
    })
  ).toEqual([]);
  expect(
    getProjectSourceVoiceoverOriginalAudioRanges(project, {
      ...original,
      assetId: document.take.assetId,
    })
  ).toEqual([]);
  expect(
    getProjectSourceVoiceoverOriginalAudioRanges(project, { ...original, startTime: 7 })
  ).toEqual([]);
  expect(project).toEqual(before);
  const split = splitProjectClipsAtTime(project, original.id, 4);
  expect(
    split.clips
      .filter((item) => item.type === 'AUDIO')
      .flatMap((item) =>
        item.type === 'AUDIO' ? getProjectSourceVoiceoverOriginalAudioRanges(split, item) : []
      )
  ).toEqual([
    { start: 3, end: 4, volume: 0.25 },
    { start: 4, end: 5, volume: 0.25 },
  ]);
  expect(split.sourceVoiceoverDocuments).toEqual([document]);
});
