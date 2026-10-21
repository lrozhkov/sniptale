// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createImageClip,
  createVideoClip,
  createProject,
} from '../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectSceneEdges } from '../../features/video/project/scene/edge-fades';
import { VideoExportFormat, VideoExportQualityPreset } from '../../features/video/project/types';
import { renderProjectCompositionFrame } from './composition-joins';
import type { ProjectCompositionSceneInput } from './composition-scene';
const owners = vi.hoisted(() => ({
  scene: vi.fn(),
  sync: vi.fn(),
  ready: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./composition-scene', () => ({ renderProjectCompositionScene: owners.scene }));
vi.mock('./media-playback/frame', () => ({ syncVideoClipFrame: owners.sync }));
vi.mock('./media-loading/ready', () => ({ waitForMediaElementReady: owners.ready }));
vi.mock('./effect-runtime', () => ({
  createOffscreenProjectEffectRuntime: () => ({ dispose: owners.dispose }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  owners.sync.mockResolvedValue(undefined);
  owners.ready.mockResolvedValue(undefined);
  owners.scene.mockImplementation(async (args: ProjectCompositionSceneInput) => {
    const context = args.context;
    context.clearRect(0, 0, 8, 4);
    context.fillStyle = args.currentTime < 1 ? '#ff0000' : '#0000ff';
    context.fillRect(0, 0, 8, 4);
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 1, 1);
  });
});
afterEach(() => vi.restoreAllMocks());
function input(type: 'dissolve' | 'fade-black' = 'dissolve') {
  const project = createProject([
    createImageClip({ id: 'intro', duration: 1 }),
    createVideoClip({ id: 'main', startTime: 1, duration: 1 }),
  ]);
  project.width = 8;
  project.height = 4;
  project.fps = 4;
  project.duration = 2;
  project.version = 26;
  project.compositionJoins = [
    { id: 'join', clipId: 'intro', edge: 'end', transition: { type, before: 0.2, after: 0.2 } },
  ];
  const settings = {
    format: VideoExportFormat.MP4,
    mp4VideoCodec: 'AVC' as const,
    width: 8,
    height: 4,
    fps: 8,
    resolution: 'SOURCE' as const,
    quality: VideoExportQualityPreset.MEDIUM,
    downloadAfterExport: false,
  };
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 4;
  const main = document.createElement('video');
  main.src = 'blob:accepted-main';
  const job: Parameters<typeof renderProjectCompositionFrame>[0]['job'] = {
    cancelled: false,
    clipMediaElements: new Map([['main', main]]),
  };
  return {
    project,
    settings,
    job,
    context: canvas.getContext('2d')!,
    currentTime: 0.9,
    loadedImages: {},
    clipMediaElements: job.clipMediaElements,
  };
}
function pixel(args: ReturnType<typeof input>, x = 4, y = 2) {
  return Array.from(args.context.getImageData(x, y, 1, 1).data);
}
it('holds complete endpoint frames at the output fps, caches them and paints outer fades once', async () => {
  const args = input();
  const fades = createVideoProjectSceneEdges();
  fades.intro = { enabled: true, duration: 1.5, color: '#000000ff', audioFade: false };
  args.project.sceneEdges = fades;
  await renderProjectCompositionFrame(args);
  expect(owners.scene.mock.calls.map(([sample]) => sample.currentTime)).toEqual([0.875, 1]);
  expect(owners.scene.mock.calls.map(([sample]) => sample.captionSampleTime)).toEqual([0.875, 1]);
  const center = pixel(args);
  for (const [index, expected] of [115, 0, 38, 255].entries())
    expect(Math.abs(center[index]! - expected)).toBeLessThanOrEqual(1);
  expect(pixel(args, 0, 0)).toEqual([0, 153, 0, 255]);
  await renderProjectCompositionFrame({ ...args, currentTime: 1.1 });
  expect(owners.scene).toHaveBeenCalledTimes(2);
  await renderProjectCompositionFrame({ ...args, currentTime: 0.1 });
  expect(owners.scene).toHaveBeenCalledTimes(3);
  args.job.compositionJoinRenderer!.dispose();
  expect(owners.dispose).toHaveBeenCalledOnce();
});
it('borrows URLs into paused independent videos without seeking or revoking the live export media', async () => {
  const args = input();
  const live = args.job.clipMediaElements.get('main')!;
  const seek = vi.fn();
  Object.defineProperty(live, 'currentTime', { get: () => 0.2, set: seek });
  await renderProjectCompositionFrame(args);
  const sample = owners.sync.mock.calls[1]![0].clipMediaElements.get('main');
  expect(sample).toBeInstanceOf(HTMLVideoElement);
  expect(sample).not.toBe(live);
  expect(sample.src).toBe(live.src);
  expect(sample.muted).toBe(true);
  expect(sample.paused).toBe(true);
  expect(seek).not.toHaveBeenCalled();
  args.job.compositionJoinRenderer!.dispose();
  expect(sample.getAttribute('src')).toBeNull();
  expect(live.src).toBe('blob:accepted-main');
});
it('paints a color join over the current complete frame without held endpoint sampling', async () => {
  const args = input('fade-black');
  await renderProjectCompositionFrame({ ...args, currentTime: 1.1 });
  expect(owners.scene).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ currentTime: 1.1, context: args.context })
  );
  expect(pixel(args)[2]).toBeGreaterThanOrEqual(127);
  expect(pixel(args)[2]).toBeLessThanOrEqual(128);
  expect(owners.sync).not.toHaveBeenCalled();
  expect(args.job.compositionJoinRenderer).toBeUndefined();
});
it('keeps the presented frame after a second endpoint failure and retries with a fresh sampler', async () => {
  const args = input();
  args.context.fillStyle = '#abcdef';
  args.context.fillRect(0, 0, 8, 4);
  const before = pixel(args);
  const draw = owners.scene.getMockImplementation()!;
  owners.scene
    .mockImplementationOnce(draw)
    .mockRejectedValueOnce(new Error('second endpoint failed'));
  await expect(renderProjectCompositionFrame(args)).rejects.toThrow('second endpoint failed');
  expect(pixel(args)).toEqual(before);
  expect(args.job.compositionJoinRenderer).toBeUndefined();
  expect(owners.dispose).toHaveBeenCalledOnce();
  await renderProjectCompositionFrame(args);
  expect(pixel(args)).not.toEqual(before);
  args.job.compositionJoinRenderer!.dispose();
});
it('aborts pending preparation on job cleanup and refuses late publication', async () => {
  const args = input();
  args.context.fillStyle = '#abcdef';
  args.context.fillRect(0, 0, 8, 4);
  const before = pixel(args);
  let release: (() => void) | undefined;
  owners.scene.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const pending = renderProjectCompositionFrame(args);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  args.job.compositionJoinRenderer!.dispose();
  release!();
  await expect(pending).rejects.toThrow();
  expect(pixel(args)).toEqual(before);
  expect(args.job.compositionJoinRenderer).toBeUndefined();
});
it('refuses an unrepresentable dissolve at the requested fps and leaves unrelated frames available', async () => {
  const args = input();
  args.project.clips[0]!.startTime = 0.005;
  args.project.clips[0]!.duration = 0.005;
  args.project.clips[1]!.startTime = 0.01;
  args.project.compositionJoins!.unshift({ id: 'region-start', clipId: 'intro', edge: 'start' });
  args.currentTime = 0.01;
  await expect(renderProjectCompositionFrame(args)).rejects.toThrow('Composition join');
  expect(owners.scene).not.toHaveBeenCalled();
  await renderProjectCompositionFrame({ ...args, currentTime: 1.5 });
  expect(owners.scene).toHaveBeenCalledOnce();
});

it('mixes the complete region when its outgoing anchor is a short split descendant', async () => {
  const args = input();
  const intro = args.project.clips[0]!;
  args.project.clips = [
    { ...intro, duration: 0.9 },
    { ...intro, id: 'intro-tail', startTime: 0.9, duration: 0.1 },
    ...args.project.clips.slice(1),
  ];
  args.project.compositionJoins![0]!.clipId = 'intro-tail';
  await renderProjectCompositionFrame(args);
  expect(owners.scene.mock.calls.map(([sample]) => sample.currentTime)).toEqual([0.875, 1]);
  const center = pixel(args);
  for (const [index, expected] of [191, 0, 64, 255].entries())
    expect(Math.abs(center[index]! - expected)).toBeLessThanOrEqual(1);
  args.job.compositionJoinRenderer!.dispose();
});
