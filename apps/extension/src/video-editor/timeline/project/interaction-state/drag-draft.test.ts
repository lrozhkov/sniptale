import { getTimelineReorderSlots } from './drag-reorder';
import { swapProjectClips } from '../../../project/state/clip-timeline/reorder';
import { expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import {
  createVideoClipFromAsset,
  createAudioClipFromAsset,
} from '../../../../features/video/project/factories/clip';
import { VideoTrackKind } from '../../../../features/video/project/types';
import { createTimelineDragDraft } from './drag-move';
import {
  moveProjectClip,
  trimProjectClipEnd,
} from '../../../project/state/clip-timeline/mutations';

function fixture() {
  const project = createEmptyVideoProject('Linked preview');
  const camera = createVideoProjectTrack('Camera', -1, VideoTrackKind.PRIMARY);
  const audio = createVideoProjectTrack('Audio', 1, VideoTrackKind.AUDIO);
  project.tracks.push(camera, audio);
  const asset = createVideoProjectAsset(
    'Recording',
    'VIDEO',
    { kind: 'recording', recordingId: 'rec' },
    {
      width: 1280,
      height: 720,
      duration: 12,
      size: 1,
      mimeType: 'video/webm',
      hasAudio: true,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  const screen = {
    ...createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 5, {
      groupId: 'recording',
    }),
    id: 'screen',
    duration: 3,
    sourceDuration: 3,
  };
  const sidecar = {
    ...screen,
    id: 'camera',
    trackId: camera.id,
    startTime: 6,
    duration: 1,
    sourceDuration: 1,
  };
  const mic = {
    ...createAudioClipFromAsset(audio.id, asset, 5.25, { groupId: 'recording' }),
    id: 'mic',
    duration: 2.5,
    sourceDuration: 2.5,
  };
  project.clips = [
    screen,
    sidecar,
    mic,
    { ...mic, id: 'independent', groupId: null, startTime: 20 },
  ];
  return project;
}

it('previews every changed linked destination without publishing before release', () => {
  const project = fixture();
  const onMoveClip = vi.fn();
  const draft = createTimelineDragDraft({
    project,
    onSwapClip: vi.fn(),
    onMoveClip,
    onTrimClipStart: vi.fn(),
    onTrimClipEnd: vi.fn(),
  });
  const result = draft.onMoveClip('camera', 10);
  expect(onMoveClip).not.toHaveBeenCalled();
  expect(project.clips.map((clip) => clip.startTime)).toEqual([5, 6, 5.25, 20]);
  expect(result?.relatedClips?.map((clip) => [clip.clipId, clip.startTime, clip.duration])).toEqual(
    [
      ['screen', 9, 3],
      ['mic', 9.25, 2.5],
    ]
  );
  const committed = moveProjectClip(project, 'camera', 10);
  for (const preview of [result!, ...result!.relatedClips!]) {
    expect(committed.clips.find((clip) => clip.id === preview.clipId)).toMatchObject({
      startTime: preview.startTime,
      duration: preview.duration,
      trackId: preview.trackId,
    });
  }
  draft.commit();
  expect(onMoveClip).toHaveBeenCalledExactlyOnceWith('camera', 10);
});

it('derives trimmed companions from the mutation result and omits unchanged independent clips', () => {
  const project = fixture();
  project.clips = project.clips.map((clip) =>
    clip.id === 'camera' && 'sourceDuration' in clip
      ? { ...clip, duration: 2, sourceDuration: 2 }
      : clip
  );
  const onTrimClipEnd = vi.fn();
  const draft = createTimelineDragDraft({
    project,
    onSwapClip: vi.fn(),
    onMoveClip: vi.fn(),
    onTrimClipStart: vi.fn(),
    onTrimClipEnd,
  });
  const result = draft.onTrimClipEnd('screen', 7.5);
  const committed = trimProjectClipEnd(project, 'screen', 7.5);
  const changed = committed.clips.filter(
    (clip) => clip.id !== 'screen' && clip !== project.clips.find((before) => before.id === clip.id)
  );
  expect(changed.length).toBeGreaterThan(0);
  expect(result?.relatedClips?.map((clip) => clip.clipId)).toEqual(changed.map((clip) => clip.id));
  for (const preview of result!.relatedClips!)
    expect(committed.clips.find((clip) => clip.id === preview.clipId)).toMatchObject({
      startTime: preview.startTime,
      duration: preview.duration,
    });
  expect(onTrimClipEnd).not.toHaveBeenCalled();
});

it('does not propose companion moves when a linked track is locked', () => {
  const project = fixture();
  project.tracks[1]!.locked = true;
  const draft = createTimelineDragDraft({
    project,
    onSwapClip: vi.fn(),
    onMoveClip: vi.fn(),
    onTrimClipStart: vi.fn(),
    onTrimClipEnd: vi.fn(),
  });
  expect(draft.onMoveClip('screen', 10)?.relatedClips).toEqual([]);
});

function reorderFixture() {
  const project = fixture();
  const first = project.clips[0]!;
  project.clips.push({ ...first, id: 'neighbor', groupId: null, startTime: 9, duration: 2 });
  return project;
}

it('offers canonical leading-edge reorder slots and previews both groups including unequal camera offsets', () => {
  const project = reorderFixture();
  const camera = project.clips.find((clip) => clip.id === 'camera')!;
  expect(getTimelineReorderSlots(project, camera)).toEqual([
    { direction: 'right', startTime: 9, neighborName: project.clips.at(-1)!.name },
  ]);
  const onSwapClip = vi.fn();
  const draft = createTimelineDragDraft({
    project,
    onSwapClip,
    onMoveClip: vi.fn(),
    onTrimClipStart: vi.fn(),
    onTrimClipEnd: vi.fn(),
  });
  const preview = draft.onSwapClip('camera', 'right')!;
  expect(preview.startTime).toBe(9);
  expect(preview.relatedClips.map((clip) => [clip.clipId, clip.startTime])).toEqual([
    ['screen', 8],
    ['mic', 8.25],
    ['neighbor', 5],
  ]);
  const after = swapProjectClips(project, 'camera', 'right');
  for (const ghost of [preview, ...preview.relatedClips])
    expect(after.clips.find((clip) => clip.id === ghost.clipId)).toMatchObject({
      startTime: ghost.startTime,
      duration: ghost.duration,
    });
  expect(onSwapClip).not.toHaveBeenCalled();
  draft.commit();
  expect(onSwapClip).toHaveBeenCalledExactlyOnceWith('camera', 'right');
});

it('replaces a pending reorder with free placement when the pointer leaves its slot', () => {
  const project = reorderFixture();
  const onSwapClip = vi.fn();
  const onMoveClip = vi.fn();
  const draft = createTimelineDragDraft({
    project,
    onSwapClip,
    onMoveClip,
    onTrimClipStart: vi.fn(),
    onTrimClipEnd: vi.fn(),
  });
  draft.onSwapClip('screen', 'right');
  draft.onMoveClip('screen', 14);
  draft.commit();
  expect(onSwapClip).not.toHaveBeenCalled();
  expect(onMoveClip).toHaveBeenCalledExactlyOnceWith('screen', 14);
});

it('does not expose locked or colliding swaps as usable slots', () => {
  const project = reorderFixture();
  project.tracks[1]!.locked = true;
  expect(getTimelineReorderSlots(project, project.clips[0]!)).toEqual([]);
  project.tracks[1]!.locked = false;
  project.clips.push({ ...project.clips[1]!, id: 'blocker', groupId: null, startTime: 9 });
  expect(getTimelineReorderSlots(project, project.clips[0]!)).toEqual([]);
});
