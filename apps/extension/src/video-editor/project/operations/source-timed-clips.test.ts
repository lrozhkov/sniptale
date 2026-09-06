import { VideoTrackKind } from '../../../features/video/project/types';
import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { VideoMediaFitMode } from '../../../features/video/project/types/media';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoProjectAssetType,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectAudioClip,
  type VideoProjectAsset,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types/model';
import {
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types/interaction';
import {
  collectRecordingSourceUnits,
  collectRepresentativeRecordingSourceClips,
  getSourceEnd,
  getSourceUnitKey,
  isRecordingSourceTimedClip,
  reconcileRecordingInteractionAnchors,
  updateSourceTimedClipTiming,
} from './source-timed-clips';
import type { SourceTimedClip } from './source-timed-clips';

function createClip(id: string, type: VideoProjectClipType, trackId: string): SourceTimedClip {
  const clip = {
    assetId: 'asset-1',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: 'group-1',
    id,
    linkMode: VideoClipLinkMode.LINKED,
    muted: false,
    name: id,
    sourceDuration: 4,
    sourceStart: id === 'clip-2' ? 4 : 0,
    startTime: id === 'clip-2' ? 4 : 0,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type,
    volume: 1,
  };

  if (type === VideoProjectClipType.AUDIO) {
    return clip as VideoProjectAudioClip;
  }

  return {
    ...clip,
    fitMode: VideoMediaFitMode.CONTAIN,
  } as VideoProjectVideoClip;
}

function createProject(): VideoProject {
  const project = createEmptyVideoProject('Source timed clips');
  project.tracks.push(createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO));
  const [primaryTrack, audioTrack] = project.tracks;
  project.assets = [createRecordingAsset()];
  project.clips = [
    createClip('clip-1', VideoProjectClipType.VIDEO, primaryTrack!.id),
    createClip('clip-2', VideoProjectClipType.VIDEO, primaryTrack!.id),
    createClip('audio-1', VideoProjectClipType.AUDIO, audioTrack!.id),
  ];
  return project;
}

function createRecordingAsset(): VideoProjectAsset {
  return {
    createdAt: 0,
    id: 'asset-1',
    metadata: {
      audioPeaks: null,
      duration: 10,
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    },
    name: 'Recording',
    source: { kind: 'recording', recordingId: 'recording-1' },
    type: VideoProjectAssetType.VIDEO,
  };
}

it('normalizes source-timed clips and groups recording source units', () => {
  const project = createProject();
  const clip = project.clips[0]!;

  expect(isRecordingSourceTimedClip(project, clip, 'recording-1')).toBe(true);
  expect(getSourceEnd(clip as SourceTimedClip)).toBe(4);
  expect(getSourceUnitKey(clip as SourceTimedClip)).toBe('group-1');
  expect(updateSourceTimedClipTiming(clip as SourceTimedClip, { playbackRate: 2 })).toEqual(
    expect.objectContaining({ duration: 2, playbackRate: 2 })
  );
  expect(collectRecordingSourceUnits(project, 'recording-1')).toHaveLength(1);
  expect(collectRepresentativeRecordingSourceClips(project, 'recording-1')[0]?.type).toBe(
    VideoProjectClipType.VIDEO
  );
});

function createAnchoredInteractionProject(): VideoProject {
  const project = createProject();
  project.baseRecordingId = 'recording-1';
  project.clips = [createClip('anchor-clip', VideoProjectClipType.VIDEO, project.tracks[0]!.id)];
  project.actionEvents = [
    {
      data: {},
      duration: 0.5,
      id: 'anchored-action',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: { x: 10, y: 20 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'recording-1',
        sourceClipId: 'anchor-clip',
        sourceTime: 2,
      },
      time: 2,
    },
    {
      data: {},
      duration: 1,
      id: 'manual-action',
      kind: VideoProjectActionEventKind.CALLOUT,
      label: 'Manual',
      point: null,
      preset: VideoProjectActionPreset.SPOTLIGHT,
      time: 1,
    },
  ];
  project.cursorTrack = {
    captureMode: 'separate',
    samples: [
      {
        id: 'anchored-cursor',
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'recording-1',
          sourceClipId: 'anchor-clip',
          sourceTime: 1,
        },
        time: 1,
        visible: true,
        x: 10,
        y: 20,
      },
      { id: 'manual-cursor', time: 0.5, visible: true, x: 30, y: 40 },
    ],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: true,
    },
  };
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.ACTION,
      focusPoint: { x: 10, y: 20 },
      id: 'anchored-motion',
      scale: 1.4,
      startTime: 1.5,
      targetActionEventId: 'anchored-action',
      zoomInDuration: 0.4,
      zoomOutDuration: 0.4,
    },
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: null,
      id: 'manual-motion',
      scale: 1.2,
      startTime: 0,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];
  return project;
}

it('reprojects recording interactions across move, rate, split, and removal edits', () => {
  const project = createAnchoredInteractionProject();
  const sourceClip = project.clips[0] as VideoProjectVideoClip;
  const moved = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, startTime: 3 }],
  });
  expect(moved.actionEvents.map(({ id, time }) => ({ id, time }))).toEqual([
    { id: 'manual-action', time: 1 },
    { id: 'anchored-action', time: 5 },
  ]);
  expect(moved.cursorTrack?.samples.map(({ id, time }) => ({ id, time }))).toEqual([
    { id: 'manual-cursor', time: 0.5 },
    { id: 'anchored-cursor', time: 4 },
  ]);
  expect(moved.motionRegions).toEqual([
    expect.objectContaining({ id: 'anchored-motion', startTime: 4.5 }),
    expect.objectContaining({ id: 'manual-motion', startTime: 0 }),
  ]);

  const retimed = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, duration: 2, playbackRate: 2 }],
  });
  expect(retimed.actionEvents.find((event) => event.id === 'anchored-action')).toEqual(
    expect.objectContaining({ duration: 0.25, time: 1 })
  );
  expect(retimed.motionRegions?.[0]).toEqual(
    expect.objectContaining({ duration: 1, startTime: 0.75 })
  );

  const split = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [
      { ...sourceClip, duration: 1, sourceDuration: 1 },
      {
        ...sourceClip,
        duration: 3,
        groupId: 'group-2',
        id: 'anchor-clip-trailing',
        sourceDuration: 3,
        sourceStart: 1,
        startTime: 1,
      },
    ],
  });
  expect(split.actionEvents.find((event) => event.id === 'anchored-action')?.sourceAnchor).toEqual(
    expect.objectContaining({ sourceClipId: 'anchor-clip-trailing' })
  );

  const removed = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, id: 'duplicate', startTime: 5 }],
  });
  expect(removed.actionEvents.map((event) => event.id)).toEqual(['manual-action']);
  expect(removed.cursorTrack?.samples.map((sample) => sample.id)).toEqual(['manual-cursor']);
  expect(removed.motionRegions?.map((region) => region.id)).toEqual(['manual-motion']);
});

it('strips dangling anchors fail-soft instead of deleting their interactions on clip edits', () => {
  const project = createAnchoredInteractionProject();
  const sourceClip = project.clips[0] as VideoProjectVideoClip;
  project.actionEvents[0] = {
    ...project.actionEvents[0]!,
    sourceAnchor: {
      kind: 'recording-source',
      recordingId: 'recording-1',
      sourceClipId: 'missing-clip',
      sourceTime: 2,
    },
  };
  project.cursorTrack!.samples[0] = {
    ...project.cursorTrack!.samples[0]!,
    sourceAnchor: {
      kind: 'recording-source',
      recordingId: 'foreign-recording',
      sourceClipId: 'anchor-clip',
      sourceTime: 1,
    },
  };

  const reconciled = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, startTime: 3 }],
  });

  expect(reconciled.actionEvents).toEqual([
    expect.objectContaining({ id: 'manual-action', time: 1 }),
    expect.objectContaining({ id: 'anchored-action', time: 2 }),
  ]);
  expect(reconciled.actionEvents[1]).not.toHaveProperty('sourceAnchor');
  expect(reconciled.cursorTrack?.samples).toEqual([
    expect.objectContaining({ id: 'manual-cursor', time: 0.5 }),
    expect.objectContaining({ id: 'anchored-cursor', time: 1 }),
  ]);
  expect(reconciled.cursorTrack?.samples[1]).not.toHaveProperty('sourceAnchor');
  expect(reconciled.motionRegions?.map((region) => region.id)).toEqual([
    'anchored-motion',
    'manual-motion',
  ]);
});

it('transfers split-boundary action and cursor anchors before the leading half is removed', () => {
  const project = createAnchoredInteractionProject();
  const sourceClip = project.clips[0] as VideoProjectVideoClip;
  project.cursorTrack!.samples[0] = {
    ...project.cursorTrack!.samples[0]!,
    sourceAnchor: {
      kind: 'recording-source',
      recordingId: 'recording-1',
      sourceClipId: 'anchor-clip',
      sourceTime: 2,
    },
    time: 2,
  };
  const trailingClip = {
    ...sourceClip,
    duration: 2,
    groupId: 'group-trailing',
    id: 'anchor-clip-trailing',
    sourceDuration: 2,
    sourceStart: 2,
    startTime: 2,
  };

  const split = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, duration: 2, sourceDuration: 2 }, trailingClip],
  });
  const afterLeadingRemoval = reconcileRecordingInteractionAnchors(split, {
    ...split,
    clips: [trailingClip],
  });

  expect(split.actionEvents[1]?.sourceAnchor?.sourceClipId).toBe('anchor-clip-trailing');
  expect(split.cursorTrack?.samples[1]?.sourceAnchor?.sourceClipId).toBe('anchor-clip-trailing');
  expect(afterLeadingRemoval.actionEvents.map((event) => event.id)).toContain('anchored-action');
  expect(afterLeadingRemoval.cursorTrack?.samples.map((sample) => sample.id)).toContain(
    'anchored-cursor'
  );
});

it.each([
  ['recording-1', 0, 1],
  [null, 0, 1],
  ['recording-1', 3, 2],
] as const)(
  'projects sources independently with base %s, offset %s and rate %s',
  (base, firstOffset, rate) => {
    const project = createAnchoredInteractionProject();
    project.baseRecordingId = base;
    const firstClip = project.clips[0] as VideoProjectVideoClip;
    project.assets.push({
      ...project.assets[0]!,
      id: 'asset-b',
      source: {
        kind: 'project-asset',
        projectAssetId: 'bytes-b',
        originRecordingId: 'recording-b',
      },
    });
    project.clips.push({
      ...firstClip,
      id: 'clip-b',
      assetId: 'asset-b',
      groupId: null,
      startTime: 10,
    });
    const anchor = {
      kind: 'recording-source' as const,
      recordingId: 'recording-b',
      sourceClipId: 'clip-b',
      sourceTime: 2,
    };
    project.actionEvents.push({
      ...project.actionEvents[0]!,
      id: 'action-b',
      sourceAnchor: anchor,
      time: 12,
    });
    project.cursorTrack!.samples.push({
      ...project.cursorTrack!.samples[0]!,
      id: 'cursor-b',
      sourceAnchor: anchor,
      time: 12,
    });
    project.motionRegions!.push({
      ...project.motionRegions![0]!,
      id: 'zoom-b',
      targetActionEventId: 'action-b',
      startTime: 11,
    });
    project.objectTracks = [
      {
        id: 'object-a',
        kind: 'object',
        source: 'visualDetection',
        analysis: {
          sourceAssetId: firstClip.assetId,
          sourceClipId: firstClip.id,
          sampleFps: 1,
          projectStartTime: 2,
          projectEndTime: 2,
        },
        samples: [{ time: 2, x: 10, y: 20, visible: true, confidence: 1 }],
      },
      {
        id: 'object-b',
        kind: 'object',
        source: 'visualDetection',
        analysis: {
          sourceAssetId: 'asset-b',
          sourceClipId: 'clip-b',
          sampleFps: 1,
          projectStartTime: 12,
          projectEndTime: 12,
        },
        samples: [{ time: 12, x: 10, y: 20, visible: true, confidence: 1 }],
      },
    ];
    const next = reconcileRecordingInteractionAnchors(project, {
      ...project,
      clips: project.clips.map((clip) =>
        clip.id === 'clip-b'
          ? { ...clip, startTime: 20, playbackRate: rate, duration: 4 / rate }
          : { ...clip, startTime: clip.startTime + firstOffset }
      ),
    });
    expect(next.objectTracks?.find((track) => track.id === 'object-a')?.samples[0]?.time).toBe(
      2 + firstOffset
    );
    expect(next.objectTracks?.find((track) => track.id === 'object-b')?.samples[0]?.time).toBe(
      20 + 2 / rate
    );
    expect(next.actionEvents.find((event) => event.id === 'action-b')).toMatchObject({
      time: 20 + 2 / rate,
      sourceAnchor: anchor,
    });
    expect(next.cursorTrack!.samples.find((sample) => sample.id === 'cursor-b')).toMatchObject({
      time: 20 + 2 / rate,
      sourceAnchor: anchor,
    });
    expect(next.motionRegions!.find((region) => region.id === 'zoom-b')?.startTime).toBe(
      20 + 1 / rate
    );
    expect(next.actionEvents.find((event) => event.id === 'anchored-action')).toEqual({
      ...project.actionEvents[0],
      time: 2 + firstOffset,
    });
  }
);

it('keeps explicit interaction edits and project replacement authoritative', () => {
  const project = createAnchoredInteractionProject();
  const replacement = { ...project, id: 'another-project', clips: [] };
  expect(reconcileRecordingInteractionAnchors(project, replacement)).toBe(replacement);
  const edited = {
    ...project,
    clips: project.clips.map((clip) => ({ ...clip, startTime: 3 })),
    actionEvents: [],
    cursorTrack: null,
    motionRegions: [],
    objectTracks: [],
  };
  const next = reconcileRecordingInteractionAnchors(project, edited);
  expect(next.actionEvents).toBe(edited.actionEvents);
  expect(next.cursorTrack).toBeNull();
  expect(next.motionRegions).toBe(edited.motionRegions);
  expect(next.objectTracks).toBe(edited.objectTracks);
});
