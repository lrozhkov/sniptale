import { describe, expect, it } from 'vitest';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoMediaFitMode,
  VideoProjectSourceKind,
  VideoTemporalEasing,
  VideoTimelinePlacementMode,
} from '../types/index';
import {
  createImageClip,
  createProject,
  createTextClip,
  createTrack,
  createVideoClip,
} from '../timeline/project-meta.test.helpers.ts';
import { hydrateVideoProject } from './index';

function createLegacyHydrationProject() {
  const project = createProject(
    [
      createVideoClip({
        fadeInMs: -10,
        fadeOutMs: undefined as unknown as number,
        fitMode: undefined as unknown as VideoMediaFitMode,
        groupId: 'group-1',
        linkMode: undefined as unknown as VideoClipLinkMode,
        name: 'Legacy Clip',
        playbackRate: 8,
        transitionIn: undefined as unknown as VideoClipTransitionKind,
        transitionOut: undefined as unknown as VideoClipTransitionKind,
        volume: 5,
      }),
    ],
    [createTrack('track-video', 0)]
  );

  const firstTrack = project.tracks[0];
  if (!firstTrack) throw new Error('Expected legacy hydration track');
  project.tracks[0] = {
    ...firstTrack,
    name: 'Legacy Track',
    order: undefined as unknown as number,
  };
  const firstAsset = project.assets[0];
  if (!firstAsset) throw new Error('Expected legacy hydration asset');
  project.assets[0] = {
    ...firstAsset,
    metadata: {
      ...firstAsset.metadata,
      audioPeaks: [2, 'bad', -1] as unknown as number[],
    },
  };
  project.timelinePlacementMode = undefined as unknown as VideoTimelinePlacementMode;
  return project;
}

function expectLegacyHydrationShape(hydrated: ReturnType<typeof hydrateVideoProject>) {
  const clip = hydrated.clips[0];

  expect(hydrated.assets[0]?.metadata.audioPeaks).toEqual([1, 0, 0]);
  expect(hydrated.tracks[0]).toEqual(expect.objectContaining({ name: 'Friendly Track', order: 0 }));
  expect(hydrated.timelinePlacementMode).toBe(VideoTimelinePlacementMode.ALLOW_OVERLAP);
  expect(clip).toEqual(
    expect.objectContaining({
      audioGainEnd: 2,
      audioGainStart: 2,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: VideoMediaFitMode.CONTAIN,
      fitScalePercent: 100,
      groupId: 'group-1',
      linkMode: VideoClipLinkMode.LINKED,
      name: 'Friendly Clip',
      playbackRate: 8,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      volume: 1,
      volumeEnvelopeEnd: 2,
      volumeEnvelopeStart: 2,
    })
  );
}

function createDetachedHydrationProject() {
  const project = createProject([
    createTextClip({
      fadeInMs: undefined as unknown as number,
      fadeOutMs: undefined as unknown as number,
      groupId: 'group-2',
      linkMode: undefined as unknown as VideoClipLinkMode,
      volume: undefined as unknown as number,
    }),
    createImageClip({
      assetId: 'asset-video',
      fitMode: undefined as unknown as VideoMediaFitMode,
      groupId: null,
    }),
  ]);

  const firstAsset = project.assets[0];
  if (!firstAsset) {
    throw new Error('Expected detached hydration asset');
  }
  project.assets[0] = {
    ...firstAsset,
    metadata: {
      ...firstAsset.metadata,
      audioPeaks: 'invalid' as unknown as number[],
    },
  };
  return project;
}

function expectDetachedHydrationShape(hydrated: ReturnType<typeof hydrateVideoProject>) {
  expect(hydrated.assets[0]?.metadata.audioPeaks).toBeNull();
  expect(hydrated.clips[0]).toEqual(
    expect.objectContaining({
      fadeInMs: 0,
      fadeOutMs: 0,
      linkMode: VideoClipLinkMode.DETACHED,
      volume: 1,
    })
  );
  expect(hydrated.clips[1]).toEqual(
    expect.objectContaining({ fitMode: VideoMediaFitMode.CONTAIN })
  );
  expect(
    hydrated.clips.every((clip) => ('playbackRate' in clip ? clip.playbackRate === 1 : true))
  ).toBe(true);
}

function createScenarioCursorTrack() {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [
      {
        id: 'sample-1',
        interpolation: VideoTemporalEasing.EASE_OUT,
        skinOverride: {
          animationPreset: VideoCursorAnimationPreset.NONE,
          color: '',
          hidden: 0 as never,
          preset: VideoCursorVisualPreset.ARROW,
          scale: 10,
          shadow: 1 as never,
        },
        time: 1,
        visible: true,
        x: 20,
        y: 40,
      },
      { id: 'sample-2', time: Number.NaN, visible: true, x: 1, y: 2 },
    ],
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color: '#fff',
      hidden: false,
      preset: VideoCursorVisualPreset.ARROW,
      scale: 10,
      shadow: 1 as never,
    },
  };
}

function createScenarioNormalizationProject() {
  const project = createDetachedHydrationProject();

  project.source = {
    kind: VideoProjectSourceKind.SCENARIO,
    scenarioProjectId: 'scenario-1',
  };
  project.cursorTrack = createScenarioCursorTrack();
  project.actionEvents = [
    {
      data: null as never,
      duration: -1,
      id: 'action-1',
      kind: 'CLICK' as never,
      label: 42 as never,
      point: { x: Number.NaN, y: 10 },
      preset: 'CLICK_RIPPLE' as never,
      time: 2,
    },
  ];
  return project;
}

function expectScenarioNormalization(hydrated: ReturnType<typeof hydrateVideoProject>) {
  expect(hydrated.source).toEqual({
    kind: VideoProjectSourceKind.SCENARIO,
    scenarioProjectId: 'scenario-1',
  });
  expect(hydrated.cursorTrack).toEqual(
    expect.objectContaining({
      samples: [
        {
          id: 'sample-1',
          interpolation: VideoTemporalEasing.EASE_OUT,
          skinOverride: {
            animationPreset: 'NONE',
            color: '#f8fafc',
            hidden: false,
            preset: 'ARROW',
            scale: 4,
            shadow: true,
          },
          time: 1,
          visible: true,
          x: 20,
          y: 40,
        },
      ],
      skin: {
        animationPreset: 'NONE',
        color: '#fff',
        hidden: false,
        preset: 'ARROW',
        scale: 4,
        shadow: true,
      },
    })
  );
  expect(hydrated.actionEvents).toEqual([
    expect.objectContaining({
      data: {},
      duration: 0,
      label: '',
      point: null,
    }),
  ]);
}

describe('hydrateVideoProject legacy normalization', () => {
  it('hydrates linked video clips, legacy labels, and normalized peaks', () => {
    expectLegacyHydrationShape(
      hydrateVideoProject(createLegacyHydrationProject(), {
        legacyTrackNames: new Map([['Legacy Track', 'Friendly Track']]),
        legacyClipNames: new Map([['Legacy Clip', 'Friendly Clip']]),
      })
    );
  });

  it('hydrates detached non-media clips and null peak payloads safely', () => {
    expectDetachedHydrationShape(hydrateVideoProject(createDetachedHydrationProject()));
  });
});

it('preserves scenario sources and normalizes cursor and action metadata', () => {
  expectScenarioNormalization(hydrateVideoProject(createScenarioNormalizationProject()));
});

it('backfills recording source metadata without inventing a cursor track', () => {
  const project = createDetachedHydrationProject();

  project.source = undefined as never;
  project.baseRecordingId = 'recording-1';
  project.cursorTrack = null;
  project.actionEvents = undefined as never;

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.source).toEqual({
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'recording-1',
  });
  expect(hydrated.baseRecordingId).toBe('recording-1');
  expect(hydrated.cursorTrack).toBeNull();
  expect(hydrated.actionEvents).toEqual([]);
});

it('hydrates missing utility lane state without reordering legacy tracks', () => {
  const project = createLegacyHydrationProject();
  const originalTrackIds = project.tracks.map((track) => track.id);

  delete (project as { utilityLanes?: unknown }).utilityLanes;

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.tracks.map((track) => track.id)).toEqual(originalTrackIds);
  expect(hydrated.utilityLanes).toEqual({
    actions: { visible: true, locked: false },
    camera: { visible: true, locked: false },
  });
});
