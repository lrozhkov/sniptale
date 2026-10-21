import { beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditWatermark } from '../../../../features/video/project/scene/watermark';
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

import { canUseHybridMp4VideoPipeline, planMp4VideoRenderSpans } from './planner';

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
    quality: VideoExportQualityPreset.MEDIUM,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
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

it('accelerates MP4 and WebM composition while retaining playback-rate fallback', () => {
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
    expect.objectContaining({ kind: 'accelerated-composite', reason: 'decoded-frame-provider' })
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

it('retains fallback for unsupported and hidden sources while accelerating resized composition', () => {
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
  ).toBe('accelerated-composite');
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

it('requires full composition for adaptive MP4 even with a clean source', () => {
  const settings = { format: VideoExportFormat.MP4, fps: 60, frameRateMode: 'adaptive' as const };
  expect(canUseHybridMp4VideoPipeline(settings as never)).toBe(false);
  expect(planMp4VideoRenderSpans(createProject(), settings as never)).toEqual([
    { kind: 'composite', reason: 'non-mp4-asset', start: 0, end: 4 },
  ]);
  expect(canUseHybridMp4VideoPipeline({ ...settings, frameRateMode: 'constant' } as never)).toBe(
    true
  );
});

it('composites authored captions independently of the legacy subtitle toggle', () => {
  const project = createProject();
  project.textDocuments = [
    {
      id: 'doc',
      binding: { kind: 'project' },
      captions: {
        enabled: true,
        style: { position: 'bottom', fontSize: 0.04, color: '#ffffff', background: '#000000' },
      },
      document: {
        version: 1,
        fragments: [
          {
            id: 'text',
            text: 'Authored',
            originalText: '',
            start: 1,
            end: 2,
            timeDomain: 'result',
            alignment: 'manual',
            revision: 0,
            timingRevision: 0,
            showInVideo: true,
          },
        ],
      },
    },
  ];
  const spans = planMp4VideoRenderSpans(project, createSettings({ burnInSubtitles: false }));
  expect(spans.some((span) => span.kind !== 'clean-source')).toBe(true);
  expect(spans.some((span) => span.kind === 'clean-source' && span.start < 2 && span.end > 1)).toBe(
    false
  );
  project.textDocuments[0]!.captions!.enabled = false;
  expect(
    planMp4VideoRenderSpans(project, createSettings()).every((span) => span.kind === 'clean-source')
  ).toBe(true);
});

it.each(['text', 'image'] as const)(
  'composites a same-size clean MP4 when the %s watermark is active',
  (mode) => {
    const watermark = { ...createQuickEditWatermark('Mark'), mode };
    const spans = planMp4VideoRenderSpans(createProject({ watermark }), createSettings());
    expect(spans).toHaveLength(1);
    expect(spans[0]?.kind).not.toBe('clean-source');
  }
);

it('retains clean-source eligibility with dormant watermark settings', () => {
  const watermark = createQuickEditWatermark('Retained');
  watermark.image = { assetId: 'project-asset:logo', width: 20, height: 10, size: 0.2, opacity: 1 };
  expect(planMp4VideoRenderSpans(createProject({ watermark }), createSettings())[0]?.kind).toBe(
    'clean-source'
  );
});

it('composites scene edge fades while retaining clean-source eligibility for dormant settings', () => {
  const sceneEdges = {
    intro: { enabled: true, duration: 1, color: '#ff0000ff' },
    outro: { enabled: false, duration: 2, color: '#0000ffff' },
  };
  const project = createProject({ sceneEdges });
  expect(
    planMp4VideoRenderSpans(project, createSettings()).every((span) => span.kind !== 'clean-source')
  ).toBe(true);
  sceneEdges.intro.enabled = false;
  expect(
    planMp4VideoRenderSpans(project, createSettings()).every((span) => span.kind === 'clean-source')
  ).toBe(true);
  sceneEdges.intro.enabled = true;
  sceneEdges.intro.duration = 0;
  expect(
    planMp4VideoRenderSpans(project, createSettings()).every((span) => span.kind === 'clean-source')
  ).toBe(true);
});

it('routes only the active join window through faithful composition and retains fast paths outside', () => {
  const project = createProject();
  const video = project.clips[0]!;
  if (video.type !== 'VIDEO') throw new Error('Expected video');
  const first = { ...video, duration: 2, sourceDuration: 2 };
  project.clips = [first, { ...first, id: 'second', startTime: 2, sourceStart: 2 }];
  project.compositionJoins = [
    {
      id: 'join',
      clipId: first.id,
      edge: 'end',
      transition: { type: 'dissolve', before: 0.2, after: 0.3 },
    },
  ];
  const spans = planMp4VideoRenderSpans(project, createSettings());
  expect(spans.map(({ start, end, kind }) => ({ start, end, kind }))).toEqual([
    { start: 0, end: 1.8, kind: 'clean-source' },
    { start: 1.8, end: 2.3, kind: 'composite' },
    { start: 2.3, end: 4, kind: 'accelerated-composite' },
  ]);
  expect(spans[1]).toMatchObject({ reason: 'transition' });
  project.compositionJoins = [{ id: 'join', clipId: first.id, edge: 'end' }];
  expect(
    planMp4VideoRenderSpans(project, createSettings()).every(({ kind }) => kind !== 'composite')
  ).toBe(true);
});
