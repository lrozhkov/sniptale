// @vitest-environment jsdom
import { createVideoProjectCaptionRenderer } from '../../workflows/video-review/project-captions';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { VideoExportFormat, VideoExportQualityPreset } from '../../features/video/project/types';
import type { ProjectCompositionSceneInput } from './composition-scene';
import type { ProjectExportRuntimeState } from './types';
import { renderSharedProjectComposition } from './shared-composition';
import { createNativeCompositionMaterializer } from '../../workflows/video/native-composition/materializer';
const io = vi.hoisted(() => ({
  create: vi.fn(),
  render: vi.fn<(time: number, signal: AbortSignal) => Promise<HTMLCanvasElement>>(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video/native-composition/materializer', () => ({
  createNativeCompositionMaterializer: io.create,
}));
vi.mock('./media-loading/blob', () => ({ loadBlobForAsset: vi.fn() }));
beforeEach(() => {
  io.create.mockImplementation(() => ({ renderFrame: io.render, dispose: io.dispose }));
  io.render.mockImplementation(async () => document.createElement('canvas'));
});
afterEach(() => vi.resetAllMocks());
function fixture() {
  const canvas = document.createElement('canvas');
  const input: ProjectCompositionSceneInput & {
    job: ProjectCompositionSceneInput['job'] & Pick<ProjectExportRuntimeState, 'sharedComposition'>;
  } = {
    project: { ...createEmptyVideoProject('Shared export', 801, 601), duration: 2 },
    settings: {
      width: 800,
      height: 600,
      fps: 24,
      format: VideoExportFormat.MP4,
      mp4VideoCodec: 'AVC',
      quality: VideoExportQualityPreset.MEDIUM,
      resolution: 'SOURCE',
      downloadAfterExport: false,
    },
    job: { cancelled: false },
    context: canvas.getContext('2d')!,
    currentTime: 0.5,
    loadedImages: {},
    clipMediaElements: new Map(),
  };
  return { input, draw: vi.spyOn(input.context, 'drawImage') };
}
it.each([false, true])(
  'preserves authored data and forwards explicit subtitle/output policy (%s)',
  async (burnInSubtitles) => {
    const f = fixture();
    f.input.settings.burnInSubtitles = burnInSubtitles;
    const saved = structuredClone(f.input.project);
    expect(await renderSharedProjectComposition(f.input)).toBe(true);
    const prepared = vi.mocked(createNativeCompositionMaterializer).mock.calls[0]![0];
    expect(prepared.project).toBe(f.input.project);
    expect(f.input.project).toEqual(saved);
    expect(prepared.sceneOutput).toEqual({
      width: 800,
      height: 600,
      resolution: 'SOURCE',
      includeSubtitles: burnInSubtitles,
    });
    expect(prepared.sampleFps).toBe(24);
    expect(prepared.sourceDiscontinuity).toBe(false);
    expect(prepared.rasterSize).toBe(f.input.settings);
    expect(f.draw).toHaveBeenCalledOnce();
    f.input.job.sharedComposition?.dispose();
  }
);
it('waits for the actual completed frame before copying and retains one owner across required times', async () => {
  const f = fixture();
  const completion = Promise.withResolvers<HTMLCanvasElement>();
  io.render.mockReturnValueOnce(completion.promise);
  const running = renderSharedProjectComposition(f.input);
  expect(f.draw).not.toHaveBeenCalled();
  const completed = document.createElement('canvas');
  completion.resolve(completed);
  expect(await running).toBe(true);
  expect(f.draw).toHaveBeenCalledWith(completed, 0, 0);
  f.input.currentTime = 0.75;
  expect(await renderSharedProjectComposition(f.input)).toBe(true);
  expect(io.create).toHaveBeenCalledOnce();
  expect(io.render.mock.calls.map(([time]) => time)).toEqual([0.5, 0.75]);
  expect(io.dispose).not.toHaveBeenCalled();
  f.input.job.sharedComposition?.dispose();
  expect(io.dispose).toHaveBeenCalledOnce();
});
it('retains export caption refusal and current sample-time admission', async () => {
  const f = fixture();
  const failure = new Error('Caption font unavailable');
  const captions = await createVideoProjectCaptionRenderer().prepare(
    f.input.project,
    f.input.settings
  );
  vi.spyOn(captions, 'assertExportable').mockImplementation(() => {
    throw failure;
  });
  io.render.mockImplementation(async () => {
    const args = vi.mocked(createNativeCompositionMaterializer).mock.calls[0]![0];
    args.assertCaptions?.(captions);
    return document.createElement('canvas');
  });
  await expect(renderSharedProjectComposition(f.input)).rejects.toBe(failure);
  expect(f.draw).not.toHaveBeenCalled();
  expect(io.dispose).toHaveBeenCalledOnce();
  expect(f.input.job.sharedComposition).toBeUndefined();
});
it('does not publish a frame completed after cancellation and releases the job owner', async () => {
  const f = fixture();
  const completion = Promise.withResolvers<HTMLCanvasElement>();
  io.render.mockReturnValueOnce(completion.promise);
  const run = renderSharedProjectComposition(f.input);
  const rejected = expect(run).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  f.input.job.cancelled = true;
  completion.resolve(document.createElement('canvas'));
  await rejected;
  expect(f.draw).not.toHaveBeenCalled();
  expect(io.dispose).toHaveBeenCalledOnce();
});
it('keeps enhanced export on its admitted source route without allocating shared resources', async () => {
  const f = fixture();
  f.input.settings.detailEnhancement = 'clark-x2';
  expect(await renderSharedProjectComposition(f.input)).toBe(false);
  expect(io.create).not.toHaveBeenCalled();
  expect(f.draw).not.toHaveBeenCalled();
});

it('updates caption admission for each required sample without recreating the scene', async () => {
  const f = fixture();
  const captions = await createVideoProjectCaptionRenderer().prepare(
    f.input.project,
    f.input.settings
  );
  const admission = vi.spyOn(captions, 'assertExportable');
  io.render.mockImplementation(async () => {
    vi.mocked(createNativeCompositionMaterializer).mock.calls[0]![0].assertCaptions?.(captions);
    return document.createElement('canvas');
  });
  await renderSharedProjectComposition(f.input);
  expect(admission).toHaveBeenLastCalledWith({ start: 0, end: 2, duration: 2 });
  f.input.captionSampleTime = 0.75;
  await renderSharedProjectComposition(f.input);
  expect(admission).toHaveBeenLastCalledWith({ time: 0.75 });
  expect(io.create).toHaveBeenCalledOnce();
  f.input.job.sharedComposition?.dispose();
});

it('forwards only borrowed media URLs, with current sources taking precedence', async () => {
  const f = fixture();
  const { createProject, createVideoClip, createTextClip } =
    await import('../../features/video/project/timeline/project-meta.test.helpers');
  f.input.project = createProject([
    createVideoClip({ id: 'a', assetId: 'source-a' }),
    createVideoClip({ id: 'b', assetId: 'source-b' }),
    createVideoClip({ id: 'unloaded', assetId: 'source-unloaded' }),
    createTextClip({ id: 'text' }),
  ]);
  const a = document.createElement('video');
  a.src = 'blob:source-a';
  const b = document.createElement('video');
  b.src = 'blob:obsolete';
  Object.defineProperty(b, 'currentSrc', { value: 'blob:source-b' });
  f.input.clipMediaElements = new Map([
    ['a', a],
    ['b', b],
  ]);
  const image = document.createElement('img');
  image.src = 'blob:image';
  f.input.loadedImages['image'] = image;
  f.input.loadedImages['unloaded'] = document.createElement('img');
  await renderSharedProjectComposition(f.input);
  expect(vi.mocked(createNativeCompositionMaterializer).mock.calls[0]![0].assetUrls).toEqual({
    'source-a': 'blob:source-a',
    'source-b': 'blob:source-b',
    image: 'blob:image',
  });
  expect(a.src).toBe('blob:source-a');
  expect(b.src).toBe('blob:obsolete');
  f.input.job.sharedComposition?.dispose();
});

it('retires the prior source owner when an export snapshot or output changes', async () => {
  const f = fixture();
  await renderSharedProjectComposition(f.input);
  f.input.project = { ...f.input.project, name: 'New snapshot' };
  await renderSharedProjectComposition(f.input);
  expect(io.dispose).toHaveBeenCalledTimes(1);
  f.input.settings = { ...f.input.settings, width: 640, height: 480 };
  await renderSharedProjectComposition(f.input);
  expect(io.dispose).toHaveBeenCalledTimes(2);
  expect(
    vi.mocked(createNativeCompositionMaterializer).mock.lastCall![0].sceneOutput
  ).toMatchObject({ width: 640, height: 480 });
  f.input.job.sharedComposition?.dispose();
});

it('cancels an active source request on cleanup and retires its materializer exactly once', async () => {
  const f = fixture();
  const completion = Promise.withResolvers<HTMLCanvasElement>();
  io.render.mockReturnValueOnce(completion.promise);
  const pending = renderSharedProjectComposition(f.input);
  const rejected = expect(pending).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  const signal = io.render.mock.calls[0]![1];
  expect(signal.aborted).toBe(false);
  f.input.job.sharedComposition?.dispose();
  expect(signal.aborted).toBe(true);
  completion.resolve(document.createElement('canvas'));
  await rejected;
  expect(f.draw).not.toHaveBeenCalled();
  expect(io.dispose).toHaveBeenCalledOnce();
});

it('restores the output context and retires resources after publication failure', async () => {
  const f = fixture();
  const failure = new Error('Output context lost');
  f.input.context.globalAlpha = 0.25;
  f.draw.mockImplementationOnce(() => {
    throw failure;
  });
  await expect(renderSharedProjectComposition(f.input)).rejects.toBe(failure);
  expect(f.input.context.globalAlpha).toBe(0.25);
  expect(io.dispose).toHaveBeenCalledOnce();
  expect(f.input.job.sharedComposition).toBeUndefined();
});
