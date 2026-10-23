// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
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
