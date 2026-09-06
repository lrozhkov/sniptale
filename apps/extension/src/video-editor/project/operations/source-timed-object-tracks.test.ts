import { expect, it } from 'vitest';
import { hydrateVideoProject } from '../../../features/video/project/hydration';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectAssetType,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';
import { reconcileRecordingInteractionAnchors } from './source-timed-clips';

function createSourceBoundObjectProject(): VideoProject {
  const project = createEmptyVideoProject('Source-bound object track');
  project.baseRecordingId = 'recording-1';
  project.assets = [
    {
      createdAt: 0,
      id: 'asset-1',
      metadata: {
        audioPeaks: null,
        duration: 4,
        hasAudio: false,
        height: 720,
        mimeType: 'video/webm',
        size: 100,
        width: 1280,
      },
      name: 'Recording',
      source: { kind: 'recording', recordingId: 'recording-1' },
      type: VideoProjectAssetType.VIDEO,
    },
  ];
  project.clips = [createSourceClip(project.tracks[0]!.id)];
  project.objectTracks = [
    {
      analysis: {
        projectEndTime: 4,
        projectStartTime: 0,
        sampleFps: 2,
        sourceAssetId: 'asset-1',
        sourceClipId: 'anchor-clip',
      },
      correctionAnchors: [{ confidence: 1, id: 'correction-late', time: 3, x: 70, y: 80 }],
      id: 'visual-object',
      kind: 'object',
      samples: [
        { confidence: 0.8, time: 0.5, visible: true, x: 10, y: 20 },
        { confidence: 0.9, time: 3, visible: true, x: 70, y: 80 },
      ],
      source: 'visualDetection',
    },
    {
      id: 'manual-object',
      kind: 'object',
      samples: [{ confidence: 1, time: 1, visible: true, x: 30, y: 40 }],
      source: 'manual',
    },
  ];
  return project;
}

function createSourceClip(trackId: string): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'anchor-clip',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Recording',
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 0,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

it('reprojects source-bound object samples and correction anchors across source edits', () => {
  const project = createSourceBoundObjectProject();
  const sourceClip = project.clips[0] as VideoProjectVideoClip;

  const moved = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, startTime: 3 }],
  });
  expect(moved.objectTracks?.find((track) => track.id === 'visual-object')).toEqual(
    expect.objectContaining({
      analysis: expect.objectContaining({ projectEndTime: 6, projectStartTime: 3.5 }),
      correctionAnchors: [expect.objectContaining({ id: 'correction-late', time: 6 })],
      samples: [expect.objectContaining({ time: 3.5 }), expect.objectContaining({ time: 6 })],
    })
  );
  expect(moved.objectTracks?.find((track) => track.id === 'manual-object')?.samples).toEqual([
    expect.objectContaining({ time: 1 }),
  ]);

  const retimed = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, duration: 2, playbackRate: 2 }],
  });
  expect(getVisualObjectSampleTimes(retimed)).toEqual([0.25, 1.5]);

  const trimmed = reconcileRecordingInteractionAnchors(project, {
    ...project,
    clips: [{ ...sourceClip, duration: 3, sourceDuration: 3, sourceStart: 1 }],
  });
  expect(getVisualObjectSampleTimes(trimmed)).toEqual([2]);
});

it('keeps object-track lineage through a split and prunes unreachable source samples', () => {
  const project = createSourceBoundObjectProject();
  const sourceClip = project.clips[0] as VideoProjectVideoClip;
  const trailingClip = {
    ...sourceClip,
    duration: 2,
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
    clips: [{ ...trailingClip, startTime: 0 }],
  });

  expect(afterLeadingRemoval.objectTracks?.find((track) => track.id === 'visual-object')).toEqual(
    expect.objectContaining({
      analysis: expect.objectContaining({
        projectEndTime: 1,
        projectStartTime: 1,
        sourceClipId: 'anchor-clip-trailing',
      }),
      correctionAnchors: [expect.objectContaining({ id: 'correction-late', time: 1 })],
      samples: [expect.objectContaining({ time: 1 })],
    })
  );

  const afterSourceRemoval = reconcileRecordingInteractionAnchors(afterLeadingRemoval, {
    ...afterLeadingRemoval,
    clips: [],
  });
  expect(afterSourceRemoval.objectTracks?.map((track) => track.id)).toEqual(['manual-object']);
});

function getVisualObjectSampleTimes(project: VideoProject): number[] | undefined {
  return project.objectTracks
    ?.find((track) => track.id === 'visual-object')
    ?.samples.map((sample) => sample.time);
}

it('keeps each tracked point on its actual split owner when the same source is overlaid twice', () => {
  const project = createSourceBoundObjectProject();
  const original = project.clips[0] as VideoProjectVideoClip;
  const duplicate = { ...original, id: 'other-use', trackId: 'other-track' };
  project.tracks.push({ ...project.tracks[0]!, id: 'other-track', order: 1, isRoot: false });
  project.clips.push(duplicate);
  const left = { ...original, duration: 2, sourceDuration: 2 };
  const tail = {
    ...original,
    id: 'original-tail',
    startTime: 6,
    sourceStart: 2,
    sourceDuration: 2,
    duration: 2,
  };
  const otherLeft = { ...duplicate, duration: 2, sourceDuration: 2 };
  const otherTail = {
    ...duplicate,
    id: 'other-tail',
    startTime: 6,
    sourceStart: 2,
    sourceDuration: 2,
    duration: 2,
  };
  const split = reconcileRecordingInteractionAnchors(
    project,
    { ...project, clips: [otherLeft, otherTail, left, tail] },
    new Map([
      [original.id, tail.id],
      [duplicate.id, otherTail.id],
    ])
  );
  const tracked = split.objectTracks!.find((track) => track.id === 'visual-object')!;
  expect(tracked.samples).toMatchObject([
    { time: 0.5, sourceClipId: original.id },
    { time: 7, sourceClipId: tail.id },
  ]);
  expect(tracked.correctionAnchors).toMatchObject([{ time: 7, sourceClipId: tail.id }]);
  expect(hydrateVideoProject(JSON.parse(JSON.stringify(split))).objectTracks).toEqual(
    split.objectTracks
  );
  const removedLeft = reconcileRecordingInteractionAnchors(split, {
    ...split,
    clips: [otherLeft, otherTail, tail],
  });
  expect(
    removedLeft.objectTracks!.find((track) => track.id === 'visual-object')!.samples
  ).toMatchObject([{ time: 7, sourceClipId: tail.id }]);
  expect(
    removedLeft.objectTracks!.find((track) => track.id === 'visual-object')!.samples
  ).toHaveLength(1);
  const removedSource = reconcileRecordingInteractionAnchors(removedLeft, {
    ...removedLeft,
    clips: [otherLeft, otherTail],
  });
  expect(removedSource.objectTracks!.map((track) => track.id)).toEqual(['manual-object']);
});
