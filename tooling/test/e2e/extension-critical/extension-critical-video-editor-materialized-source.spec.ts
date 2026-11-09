import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { getVideoClipSourceTime } from '../../../../apps/extension/src/features/video/project/timeline';
import { resolveVideoCompositionRenderPasses } from '../../../../apps/extension/src/features/video/composition/timeline/render';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

enableGpuPreviewProof();
const execute = promisify(execFile);
const entry = `
export { createVideoPreviewFrameMaterializer } from './apps/extension/src/video-editor/preview/cache/materializer';
export { VideoSample } from 'mediabunny';
`;
type ProbeModule = Pick<
  typeof import('../../../../apps/extension/src/video-editor/preview/cache/materializer'),
  'createVideoPreviewFrameMaterializer'
> &
  Pick<typeof import('mediabunny'), 'VideoSample'>;

async function frameColor(path: string, index: number) {
  const { stdout } = await execute(
    '/usr/bin/ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-vf',
      `select=eq(n\\,${index})`,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 }
  );
  return [...stdout.subarray((45 * 160 + 80) * 3, (45 * 160 + 80) * 3 + 3)];
}

test('Native materialized window keeps each VFR exposure source in GPU and Standard', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const externalSource = process.env.SNIPTALE_E2E_MATERIALIZED_SOURCE;
  const sourcePath = externalSource ?? info.outputPath('exposure-vfr.webm');
  if (!externalSource)
    await execute('/usr/bin/ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=red:size=160x90:rate=10:duration=0.5',
      '-f',
      'lavfi',
      '-i',
      'color=blue:size=160x90:rate=10:duration=0.3',
      '-f',
      'lavfi',
      '-i',
      'color=green:size=160x90:rate=10:duration=0.2',
      '-filter_complex',
      "[0:v][1:v][2:v]concat=n=3:v=1:a=0,select='eq(n,0)+eq(n,5)+eq(n,8)'[v]",
      '-map',
      '[v]',
      '-fps_mode',
      'vfr',
      '-c:v',
      'libvpx',
      '-deadline',
      'realtime',
      '-cpu-used',
      '8',
      '-b:v',
      '400k',
      '-an',
      '-y',
      sourcePath,
    ]);
  const bytes = await readFile(sourcePath);
  const { stdout } = await execute('/usr/bin/ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'packet=pts_time',
    '-of',
    'json',
    sourcePath,
  ]);
  const packets = JSON.parse(stdout) as { packets: { pts_time: string }[] };
  const pts = packets.packets.map((packet) => Number(packet.pts_time)).sort((a, b) => a - b);
  expect(pts).toEqual([0, 0.5, 0.8]);
  const colors = await Promise.all(pts.map((_, index) => frameColor(sourcePath, index)));
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename: 'exposure-vfr.webm',
    width: 160,
    height: 90,
    duration: 1,
    size: bytes.length,
    mimeType: 'video/webm',
    hasAudio: false,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip) throw new Error('Window source clip unavailable');
  clip.playbackWindow = { offset: 0, holdAt: 0.8 };
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 1,
      scale: 2,
      zoomInDuration: 1,
      zoomOutDuration: 0,
      motionBlurAmount: 1,
      easing: 'LINEAR',
      focusMode: 'MANUAL',
      focusPoint: { x: 80, y: 45 },
    },
  ];
  const time = 0.5;
  const passes = resolveVideoCompositionRenderPasses(project, time).visualPasses;
  const expectedPasses = passes.map((pass) => {
    const layer = pass.frame.visualLayers.find((layer) => layer.kind === 'video');
    if (!layer || layer.kind !== 'video') throw new Error('Exposure video is missing');
    const requested = getVideoClipSourceTime(layer.clip, pass.time);
    const selected = pts.findLastIndex((timestamp) => timestamp <= requested);
    if (selected < 0) throw new Error('Reference source interval unavailable');
    return {
      time: pass.time,
      sourceTime: requested,
      actualPTS: pts[selected]!,
      alpha: pass.alpha,
      color: colors[selected]!,
    };
  });
  expect(new Set(expectedPasses.map((pass) => pass.actualPTS)).size).toBeGreaterThan(1);
  expect(expectedPasses.reduce((sum, pass) => sum + pass.alpha, 0)).toBeCloseTo(1, 8);
  const expected = expectedPasses.reduce(
    (previous, pass) => previous.map((value, i) => value + pass.color[i]! * pass.alpha),
    [0, 0, 0]
  );
  const externalModule = process.env.SNIPTALE_E2E_MATERIALIZED_MODULE;
  const text = externalModule
    ? await readFile(externalModule, 'utf8')
    : (
        await build({
          stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
          bundle: true,
          format: 'esm',
          platform: 'browser',
          write: false,
          loader: { '.svg': 'text', '.woff2': 'dataurl', '.bin': 'dataurl' },
          define: { 'process.env.NODE_ENV': '"production"' },
        })
      ).outputFiles[0]!.text;
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, {});
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    const results = await page.evaluate(
      async ({ text, bytes, project, assetId, time }) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        const source = URL.createObjectURL(
          new Blob([Uint8Array.from(bytes)], { type: 'video/webm' })
        );
        const panel = document.createElement('section');
        panel.style.cssText =
          'position:fixed;inset:0;background:white;z-index:99999;display:flex;gap:16px';
        document.body.append(panel);
        try {
          const module: ProbeModule = await import(url);
          const results = [];
          for (const renderer of ['gpu', 'legacy'] as const) {
            const selected: number[] = [];
            const converted: number[] = [];
            const original = module.VideoSample.prototype.toVideoFrame;
            const draw = module.VideoSample.prototype.draw;
            const importTexture = GPUDevice.prototype.importExternalTexture;
            module.VideoSample.prototype.toVideoFrame = function (...args) {
              converted.push(this.timestamp);
              return original.apply(this, args);
            };
            module.VideoSample.prototype.draw = function (...args) {
              selected.push(this.timestamp);
              return draw.apply(this, args);
            };
            GPUDevice.prototype.importExternalTexture = function (descriptor) {
              const source = descriptor.source;
              if (
                source instanceof VideoFrame &&
                source.displayWidth === 160 &&
                source.displayHeight === 90
              )
                selected.push(source.timestamp / 1e6);
              return importTexture.call(this, descriptor);
            };
            const materializer = module.createVideoPreviewFrameMaterializer({
              assetUrls: { [assetId]: source },
              previewRenderer: renderer,
              ownerDocument: document,
              project: structuredClone(project),
              rasterSize: { width: 160, height: 90 },
            });
            try {
              const result = await materializer.renderFrameWithPresentation(
                time,
                new AbortController().signal
              );
              const canvas = document.createElement('canvas');
              canvas.width = result.canvas.width;
              canvas.height = result.canvas.height;
              const context = canvas.getContext('2d')!;
              context.drawImage(result.canvas, 0, 0);
              const data = context.getImageData(76, 41, 8, 8).data;
              const mean = [0, 0, 0];
              for (let i = 0; i < data.length; i += 4)
                for (let c = 0; c < 3; c++) mean[c]! += data[i + c]! / 64;
              canvas.style.cssText = 'width:320px;height:180px;image-rendering:pixelated';
              panel.append(canvas);
              results.push({
                renderer,
                backend: result.presentation.renderer,
                time: result.presentation.time,
                camera: result.presentation.camera,
                selected,
                converted,
                mean,
                raster: { width: canvas.width, height: canvas.height },
              });
            } finally {
              materializer.dispose();
              module.VideoSample.prototype.toVideoFrame = original;
              module.VideoSample.prototype.draw = draw;
              GPUDevice.prototype.importExternalTexture = importTexture;
            }
          }
          return results;
        } finally {
          URL.revokeObjectURL(url);
          URL.revokeObjectURL(source);
        }
      },
      { text, bytes: [...bytes], project, assetId: clip.assetId, time }
    );
    await writeFile(
      info.outputPath('materialized-exposure-result.json'),
      JSON.stringify(
        {
          sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
          viewport: page.viewportSize(),
          sourceRaster: { width: 160, height: 90 },
          pts,
          colors,
          expectedPasses,
          expected,
          results,
        },
        null,
        2
      )
    );
    for (const result of results) {
      expect(result.time).toBe(time);
      expect(result.raster).toEqual({ width: 160, height: 90 });
      expect(new Set(result.selected)).toEqual(
        new Set(expectedPasses.map((pass) => pass.actualPTS))
      );
      const error =
        result.mean.reduce((sum, value, i) => sum + Math.abs(value - expected[i]!), 0) / 3;
      expect(error).toBeLessThanOrEqual(5);
    }
    expect(results[0]!.backend?.backend).toBe('gpu');
    expect(results[1]!.backend?.backend).toBe('legacy');
    expect(results[0]!.camera).toEqual(results[1]!.camera);
    await page.screenshot({
      path: info.outputPath('materialized-exposure-witnesses.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
