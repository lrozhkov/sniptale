// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../features/video/project/recording-events/records';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
import { normalizeVideoProjectCursorSkin } from '../../features/video/project/cursor';
import type { VideoProject } from '../../features/video/project/types';
import { VideoExportFormat, VideoExportQualityPreset } from '../../features/video/project/types';
import {
  renderProjectCompositionScene,
  type ProjectCompositionSceneInput,
} from './composition-scene';
const owners = vi.hoisted(() => ({
  captions: vi.fn(),
  assert: vi.fn(),
  text: vi.fn(),
  watermark: vi.fn(),
  mark: vi.fn(),
  effects: vi.fn(),
  draw: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video-review/project-captions', () => ({
  createVideoProjectCaptionRenderer: () => ({ prepare: owners.captions }),
}));
vi.mock('./runtime', () => ({
  getProjectExportSpatialRenderer: vi.fn(),
  getProjectExportWatermarkRenderer: () => ({ prepare: owners.watermark }),
}));
vi.mock('./effect-runtime', () => ({ renderOffscreenProjectEffectFrames: owners.effects }));
vi.mock('./renderer', () => ({ drawProjectFrame: owners.draw }));
vi.mock('../../features/video/composition/effect-runtime', () => ({
  disposeEffectRuntimeComposition: owners.dispose,
}));
beforeEach(() => {
  vi.clearAllMocks();
  owners.captions.mockResolvedValue({ assertExportable: owners.assert, draw: owners.text });
  owners.watermark.mockResolvedValue({ draw: owners.mark });
  owners.effects.mockResolvedValue(undefined);
});
function input(): ProjectCompositionSceneInput {
  const project = {
    ...createEmptyVideoProject('Scene', 8, 4),
    duration: 2,
    watermark: { ...createQuickEditWatermark('Mark'), mode: 'text' as const },
  };
  const settings = {
    format: VideoExportFormat.MP4,
    mp4VideoCodec: 'AVC' as const,
    width: 8,
    height: 4,
    fps: 24,
    resolution: 'SOURCE' as const,
    quality: VideoExportQualityPreset.MEDIUM,
    downloadAfterExport: false,
  };
  return {
    project,
    settings,
    job: { cancelled: false },
    currentTime: 1,
    context: document.createElement('canvas').getContext('2d')!,
    loadedImages: {},
    clipMediaElements: new Map(),
  };
}

function withTrajectory(args: ProjectCompositionSceneInput) {
  args.project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        samples: [],
        trajectory: {
          format: 'cursor-trajectory-v1',
          formatVersion: 1,
          algorithm: 'sed-window-v1',
          encoding: 'json-ascii-int-v1',
          trajectoryId: 'a'.repeat(32),
          state: 'unavailable',
          finalized: true,
          totalBlocks: 0,
          totalRecords: 0,
          totalSamples: 0,
          totalBytes: 0,
          streamSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      },
    ],
  };
  return args;
}

it('awaits the exact frame window before effects and drawing while captions retain the saved project', async () => {
  const args = withTrajectory(input());
  const original = args.project;
  const prepared = { ...original, name: 'Prepared frame' };
  const prepare = vi.fn(async () => prepared);
  args.job.cursorTrajectoryRenderer = { prepareCamera: vi.fn(), prepare, clear: vi.fn() };
  await renderProjectCompositionScene(args);
  expect(prepare).toHaveBeenCalledExactlyOnceWith(original, 1);
  expect(owners.captions).toHaveBeenCalledWith(original, args.settings, undefined);
  expect(owners.effects).toHaveBeenCalledWith(expect.objectContaining({ project: prepared }));
  expect(owners.draw.mock.calls[0]?.[1]).toBe(prepared);
  expect(args.project).toBe(original);
});

it('passes prepared event facts through cursor preparation before effects and drawing', async () => {
  const args = withTrajectory(input());
  if (!isRecordingEventsDescriptor(fixture.descriptor)) throw new Error('Invalid fixture.');
  args.project.actionFeedback = [
    {
      recordingId: 'recording',
      sourceInstanceId: 'instance',
      signals: [],
      settings: [],
      events: fixture.descriptor,
    },
  ];
  const eventsPrepared = { ...args.project, name: 'Event facts' };
  const cursorPrepared = { ...eventsPrepared, name: 'Event and cursor facts' };
  const events = vi.fn(async () => eventsPrepared);
  const cursor = vi.fn(async () => cursorPrepared);
  args.job.recordingEventsRenderer = { prepare: events, clear: vi.fn() };
  args.job.cursorTrajectoryRenderer = { prepareCamera: vi.fn(), prepare: cursor, clear: vi.fn() };
  await renderProjectCompositionScene(args);
  expect(cursor).toHaveBeenCalledExactlyOnceWith(eventsPrepared, 1);
  expect(owners.effects).toHaveBeenCalledWith(expect.objectContaining({ project: cursorPrepared }));
  expect(owners.draw.mock.calls[0]?.[1]).toBe(cursorPrepared);
  expect(owners.captions).toHaveBeenCalledWith(args.project, args.settings, undefined);
});

it('refuses cancellation after a delayed cursor window without drawing a stale frame', async () => {
  const args = withTrajectory(input());
  const gate = Promise.withResolvers<VideoProject>();
  args.job.cursorTrajectoryRenderer = {
    prepareCamera: vi.fn(),
    prepare: vi.fn(() => gate.promise),
    clear: vi.fn(),
  };
  const result = renderProjectCompositionScene(args);
  expect(owners.draw).not.toHaveBeenCalled();
  args.job.cancelled = true;
  gate.resolve(args.project);
  await expect(result).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(owners.effects).not.toHaveBeenCalled();
  expect(owners.draw).not.toHaveBeenCalled();
});
it('draws complete FX, captions and watermark in order and releases effect frames without outer fades', async () => {
  const args = input();
  await renderProjectCompositionScene(args);
  const order = [
    owners.captions,
    owners.assert,
    owners.watermark,
    owners.effects,
    owners.draw,
    owners.text,
    owners.mark,
    owners.dispose,
  ].map((mock) => mock.mock.invocationCallOrder[0]!);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(owners.text).toHaveBeenCalledWith(args.context, 1);
  expect(owners.effects).toHaveBeenCalledWith(
    expect.objectContaining({ clipMediaElements: args.clipMediaElements })
  );
  expect(owners.draw).toHaveBeenCalledExactlyOnceWith(
    args.context,
    args.project,
    args.settings,
    1,
    args.loadedImages,
    args.clipMediaElements,
    expect.objectContaining({ spatialRenderer: expect.any(Function) })
  );
});
it('refuses cancellation after async effects before publishing a frame and releases the prepared effects', async () => {
  const args = input();
  owners.effects.mockImplementationOnce(async () => {
    args.job.cancelled = true;
    return undefined;
  });
  await expect(renderProjectCompositionScene(args)).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(owners.draw).not.toHaveBeenCalled();
  expect(owners.text).not.toHaveBeenCalled();
  expect(owners.mark).not.toHaveBeenCalled();
  expect(owners.dispose).toHaveBeenCalledOnce();
});
it('does not draw after caption admission failure and releases effect frames after a draw failure', async () => {
  const args = input();
  owners.assert.mockImplementationOnce(() => {
    throw new Error('caption unavailable');
  });
  await expect(renderProjectCompositionScene(args)).rejects.toThrow('caption unavailable');
  expect(owners.effects).not.toHaveBeenCalled();
  owners.draw.mockImplementationOnce(() => {
    throw new Error('draw failed');
  });
  await expect(renderProjectCompositionScene(args)).rejects.toThrow('draw failed');
  expect(owners.dispose).toHaveBeenCalledOnce();
  expect(owners.mark).not.toHaveBeenCalled();
});

it('checks the held caption sample outside the selected range before drawing any scene content', async () => {
  const args = input();
  args.settings = {
    ...args.settings,
    scope: 'selected-range',
    rangeStartSeconds: 1.1,
    rangeEndSeconds: 1.2,
  };
  owners.assert.mockImplementationOnce((scope: { time?: number }) => {
    if (scope.time === 0.975) throw new Error('held caption conflict');
  });
  await expect(
    renderProjectCompositionScene({ ...args, currentTime: 0.975, captionSampleTime: 0.975 })
  ).rejects.toThrow('held caption conflict');
  expect(owners.effects).not.toHaveBeenCalled();
  expect(owners.draw).not.toHaveBeenCalled();
});

it('paints the final-canvas watermark despite retained experimental source metadata', async () => {
  const args = input();
  args.project.watermarkSource = { assetId: 'missing', sourceInstanceId: 'main' };
  const clear = vi.fn();
  args.job.watermarkRenderer = { clear, prepare: vi.fn() };
  await renderProjectCompositionScene(args);
  expect(owners.watermark).toHaveBeenCalledOnce();
  expect(owners.mark).toHaveBeenCalledOnce();
  expect(clear).not.toHaveBeenCalled();
  expect(owners.draw).toHaveBeenCalledOnce();
});

it.each(['job', 'signal'] as const)(
  'refuses %s cancellation after a delayed event window before cursor preparation or drawing',
  async (cancellation) => {
    const args = withTrajectory(input());
    if (!isRecordingEventsDescriptor(fixture.descriptor)) throw new Error('Invalid fixture.');
    args.project.actionFeedback = [
      {
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        signals: [],
        settings: [],
        events: fixture.descriptor,
      },
    ];
    const gate = Promise.withResolvers<VideoProject>();
    const prepare = vi.fn(() => gate.promise);
    const cursor = vi.fn(async () => args.project);
    args.job.recordingEventsRenderer = { prepare, clear: vi.fn() };
    args.job.cursorTrajectoryRenderer = { prepareCamera: vi.fn(), prepare: cursor, clear: vi.fn() };
    const controller = new AbortController();
    args.signal = controller.signal;
    const result = renderProjectCompositionScene(args);
    expect(prepare).toHaveBeenCalledExactlyOnceWith(
      args.project,
      { start: 1, end: 1 },
      controller.signal
    );
    if (cancellation === 'job') args.job.cancelled = true;
    else controller.abort();
    gate.resolve(args.project);
    await expect(result).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
    expect(cursor).not.toHaveBeenCalled();
    expect(owners.effects).not.toHaveBeenCalled();
    expect(owners.draw).not.toHaveBeenCalled();
  }
);

it.each(['success', 'draw-failure', 'late-cancel'] as const)(
  'retains the single source pass through %s and releases it after the frame settles',
  async (mode) => {
    const args = input();
    const releasePass = vi.fn();
    const sourceSampling = { releasePass } as unknown as NonNullable<
      typeof args.job.sourceSampling
    >;
    args.job.sourceSampling = sourceSampling;
    args.sourceSamplingFallback = 'first';
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    owners.draw.mockImplementationOnce(() => {
      started.resolve();
      return gate.promise;
    });
    const rendering = renderProjectCompositionScene(args);
    await started.promise;
    expect(owners.draw).toHaveBeenCalledOnce();
    expect(owners.effects).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSampling, sourceSamplingFallback: 'first' })
    );
    expect(owners.draw.mock.lastCall![6]).toEqual(
      expect.objectContaining({ sourceSampling, sourceSamplingFallback: 'first' })
    );
    expect(releasePass).not.toHaveBeenCalled();
    if (mode === 'late-cancel') args.job.cancelled = true;
    if (mode === 'draw-failure') gate.reject(new Error('render failure'));
    else gate.resolve();
    if (mode === 'draw-failure') await expect(rendering).rejects.toThrow('render failure');
    else if (mode === 'late-cancel')
      await expect(rendering).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
    else await rendering;
    expect(releasePass).toHaveBeenCalledOnce();
    expect(owners.dispose.mock.invocationCallOrder.at(-1)).toBeLessThan(
      releasePass.mock.invocationCallOrder[0]!
    );
    if (mode !== 'success') expect(owners.mark).not.toHaveBeenCalled();
  }
);
it('releases a prepared source pass when the FX wave fails before drawing starts', async () => {
  const args = input(),
    releasePass = vi.fn();
  args.job.sourceSampling = { releasePass } as unknown as NonNullable<
    typeof args.job.sourceSampling
  >;
  owners.effects.mockRejectedValueOnce(new Error('FX wave failed'));
  await expect(renderProjectCompositionScene(args)).rejects.toThrow('FX wave failed');
  expect(releasePass).toHaveBeenCalledOnce();
  expect(owners.draw).not.toHaveBeenCalled();
});
