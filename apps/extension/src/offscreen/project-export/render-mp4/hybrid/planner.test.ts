import { beforeEach, expect, it, vi } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMediaFitMode,
  VideoTimelinePlacementMode,
  type VideoProject,
} from '../../../../features/video/project/types';

const resolveVideoCompositionRenderPassesMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../features/video/composition/timeline/render', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/composition/timeline/render')
  >()),
  resolveVideoCompositionRenderPasses: resolveVideoCompositionRenderPassesMock,
}));

import { planMp4VideoRenderSpans } from './planner';

function createProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    version: 1,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'recording', recordingId: 'recording-1' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 4,
    createdAt: 1,
    updatedAt: 1,
    assets: [
      {
        id: 'asset-1',
        name: 'clip.mp4',
        source: { kind: 'recording', recordingId: 'recording-1' },
        metadata: { duration: 4, hasAudio: false, height: 720, mimeType: 'video/mp4', width: 1280 },
      },
    ],
    tracks: [
      { id: 'track-1', name: 'Track', kind: 'PRIMARY', order: 0, visible: true, locked: false },
    ],
    clips: [
      {
        id: 'clip-1',
        trackId: 'track-1',
        type: 'VIDEO',
        name: 'Clip',
        assetId: 'asset-1',
        startTime: 0,
        duration: 4,
        sourceStart: 0,
        sourceDuration: 4,
        fadeInMs: 0,
        fadeOutMs: 0,
        fitMode: VideoMediaFitMode.STRETCH,
        transitionIn: 'NONE',
        transitionOut: 'NONE',
        transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
      },
    ],
    cursorTrack: null,
    actionEvents: [],
    ...overrides,
  } as VideoProject;
}

function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
    ...overrides,
  };
}

function mockCleanComposition() {
  resolveVideoCompositionRenderPassesMock.mockImplementation((project: VideoProject) => ({
    overlayFrame: {
      actions: [],
      camera: {
        focusPoint: { x: 0, y: 0 },
        motionBlurAmount: 0,
        regionId: null,
        scale: 1,
        viewportHeight: project.height,
        viewportWidth: project.width,
        viewportX: 0,
        viewportY: 0,
      },
      cursor: null,
      visualLayers: [
        {
          clip: project.clips[0],
          clipId: 'clip-1',
          height: 720,
          kind: 'video',
          opacity: 1,
          renderState: {
            blurAmount: 0,
            opacityMultiplier: 1,
            scaleX: 1,
            scaleY: 1,
            translateX: 0,
            translateY: 0,
          },
          rotation: 0,
          width: 1280,
          x: 0,
          y: 0,
          zIndex: 0,
        },
      ],
    },
    visualPasses: [{ alpha: 1, frame: {}, time: 0, transitionOverlays: [] }],
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCleanComposition();
});

it('classifies a full-canvas MP4 video interval as clean source', () => {
  expect(planMp4VideoRenderSpans(createProject(), createSettings() as never)).toEqual([
    expect.objectContaining({
      asset: expect.objectContaining({ id: 'asset-1' }),
      clip: expect.objectContaining({ id: 'clip-1' }),
      kind: 'clean-source',
      sourceEnd: 4,
      sourceStart: 0,
      start: 0,
      end: 4,
    }),
  ]);
});

it('classifies same-size contained video and explicit export ranges as clean source', () => {
  const containedProject = createProject({
    clips: [
      {
        ...createProject().clips[0]!,
        fitMode: VideoMediaFitMode.CONTAIN,
        sourceStart: 1,
        sourceDuration: 3,
      },
    ] as never,
  });

  expect(
    planMp4VideoRenderSpans(
      containedProject,
      createSettings({ rangeEndSeconds: 3, rangeStartSeconds: 1 }) as never
    )
  ).toEqual([
    expect.objectContaining({
      end: 3,
      kind: 'clean-source',
      sourceEnd: 4,
      sourceStart: 2,
      start: 1,
    }),
  ]);
});

it('classifies WebM composition as accelerated and rejects composite-only states', () => {
  resolveVideoCompositionRenderPassesMock.mockImplementationOnce(() => ({
    overlayFrame: {
      actions: [],
      camera: { motionBlurAmount: 0, regionId: null, scale: 1, viewportX: 0, viewportY: 0 },
      cursor: { visible: true, x: 10, y: 20 },
      visualLayers: [],
    },
    visualPasses: [{ transitionOverlays: [] }],
  }));
  expect(planMp4VideoRenderSpans(createProject(), createSettings() as never)[0]).toEqual(
    expect.objectContaining({ kind: 'composite', reason: 'cursor-overlay' })
  );

  const playbackProject = createProject({
    clips: [{ ...createProject().clips[0]!, playbackRate: 2 }] as never,
  });
  expect(planMp4VideoRenderSpans(playbackProject, createSettings() as never)[0]?.kind).toBe(
    'composite'
  );

  const webmProject = createProject({
    assets: [
      {
        ...createProject().assets[0]!,
        metadata: { ...createProject().assets[0]!.metadata, mimeType: 'video/webm' },
      },
    ],
    clips: [
      createProject().clips[0]!,
      {
        id: 'text-1',
        trackId: 'track-1',
        type: 'TEXT',
        startTime: 0,
        duration: 4,
        transform: { height: 80, opacity: 1, rotation: 0, width: 320, x: 10, y: 10 },
      },
    ] as never,
  });
  expect(planMp4VideoRenderSpans(webmProject, createSettings() as never)[0]?.kind).toBe(
    'accelerated-composite'
  );
});

it('falls back to composite for unsupported assets, hidden tracks, and resized exports', () => {
  const unsupportedProject = createProject({
    assets: [
      {
        ...createProject().assets[0]!,
        metadata: { ...createProject().assets[0]!.metadata, mimeType: 'video/quicktime' },
      },
    ],
  });
  expect(planMp4VideoRenderSpans(unsupportedProject, createSettings() as never)[0]?.kind).toBe(
    'composite'
  );

  const hiddenProject = createProject({
    tracks: [{ ...createProject().tracks[0]!, visible: false }],
  });
  expect(planMp4VideoRenderSpans(hiddenProject, createSettings() as never)[0]?.kind).toBe(
    'composite'
  );

  expect(
    planMp4VideoRenderSpans(createProject(), createSettings({ width: 640 }) as never)[0]?.kind
  ).toBe('composite');
});

it('merges adjacent composite spans after timeline boundary splitting', () => {
  const project = createProject({
    clips: [
      { ...createProject().clips[0]!, duration: 2 },
      {
        ...createProject().clips[0]!,
        id: 'clip-2',
        startTime: 2,
        sourceStart: 2,
      },
    ] as never,
    tracks: [{ ...createProject().tracks[0]!, visible: false }],
  });

  expect(planMp4VideoRenderSpans(project, createSettings() as never)).toEqual([
    { end: 4, kind: 'composite', reason: 'visible-clips', start: 0 },
  ]);
});

it('merges adjacent clean spans split by an audio-only boundary', () => {
  const project = createProject({
    clips: [
      createProject().clips[0]!,
      {
        id: 'audio-1',
        trackId: 'track-1',
        type: 'AUDIO',
        assetId: 'asset-1',
        startTime: 2,
        duration: 1,
        sourceStart: 2,
        sourceDuration: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    ] as never,
  });

  expect(planMp4VideoRenderSpans(project, createSettings() as never)).toEqual([
    expect.objectContaining({ end: 4, kind: 'clean-source', sourceEnd: 4, start: 0 }),
  ]);
});
