import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { getVideoClipSourceTime } from '../../../../apps/extension/src/features/video/project/timeline';
import { resolveVideoCompositionRenderPasses } from '../../../../apps/extension/src/features/video/composition/timeline/render';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../../apps/extension/src/features/video/project/types';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

// Keep the GPU-capable browser setup for the actual offscreen export pipeline.
test.use({
  launchOptions: {
    args:
      process.platform === 'linux'
        ? [
            '--enable-unsafe-webgpu',
            '--use-angle=swiftshader',
            '--use-vulkan=swiftshader',
            '--enable-features=Vulkan',
            '--disable-vulkan-surface',
          ]
        : [],
  },
});
const execute = promisify(execFile);

test('Native complete export preserves VFR exposures with enhancement off and on in both formats', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const sourcePath = process.env.SNIPTALE_E2E_B1_SOURCE ?? info.outputPath('source-vfr.webm');
  if (!process.env.SNIPTALE_E2E_B1_SOURCE)
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
  const colors = await Promise.all(
    pts.map(async (_, index) => {
      const { stdout } = await execute(
        '/usr/bin/ffmpeg',
        [
          '-v',
          'error',
          '-i',
          sourcePath,
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
    })
  );
  const externalProject = process.env.SNIPTALE_E2E_B1_PROJECT;
  const project: VideoProject = externalProject
    ? JSON.parse(await readFile(externalProject, 'utf8'))
    : createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'source-vfr.webm',
        width: 160,
        height: 90,
        duration: 0.9,
        size: bytes.length,
        mimeType: 'video/webm',
        hasAudio: false,
      });
  if (!externalProject) {
    project.version = 43;
    for (const clip of project.clips) if (clip.type === 'VIDEO') clip.timelineLaneId = null;
    const clip = project.clips.find((clip) => clip.type === 'VIDEO');
    if (!clip) throw new Error('Missing Native source');
    clip.playbackWindow = { offset: 0, holdAt: 0.8 };
    project.motionRegions = [
      {
        ...createVideoProjectMotionRegion(project, 0),
        duration: 0.9,
        scale: 2,
        zoomInDuration: 0.9,
        zoomOutDuration: 0,
        motionBlurAmount: 1,
        easing: 'LINEAR',
        focusMode: 'MANUAL',
        focusPoint: { x: 80, y: 45 },
      },
    ];
  }
  expect(isValidVideoProject(project)).toBe(true);
  await writeFile(info.outputPath('source-project.json'), JSON.stringify(project, null, 2));
  const time = 0.5;
  const expectedPasses = resolveVideoCompositionRenderPasses(project, time).visualPasses.map(
    (pass) => {
      const layer = pass.frame.visualLayers.find((layer) => layer.kind === 'video');
      if (!layer || layer.kind !== 'video') throw new Error('Missing reference video');
      const sourceTime = getVideoClipSourceTime(layer.clip, pass.time);
      const selected = pts.findLastIndex((timestamp) => timestamp <= sourceTime);
      if (selected < 0) throw new Error('Missing reference interval');
      return {
        time: pass.time,
        sourceTime,
        pts: pts[selected]!,
        alpha: pass.alpha,
        color: colors[selected]!,
      };
    }
  );
  expect(new Set(expectedPasses.map((pass) => pass.pts)).size).toBeGreaterThan(1);
  expect(expectedPasses.reduce((sum, pass) => sum + pass.alpha, 0)).toBeCloseTo(1, 8);
  const expected = [0, 1, 2].map((channel) =>
    expectedPasses.reduce((sum, pass) => sum + pass.alpha * pass.color[channel]!, 0)
  );
  await page.addInitScript(() => {
    const timestamps: number[] = [];
    const snapshots: { timestamp: number; width: number; height: number; mean: number[] }[] = [];
    Reflect.set(window, 'sniptaleB1NativeRaw', { timestamps, snapshots });
    const encode = VideoEncoder.prototype.encode;
    VideoEncoder.prototype.encode = function (frame, options) {
      timestamps.push(frame.timestamp);
      if (frame.timestamp === 500_000) {
        const canvas = document.createElement('canvas');
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(frame, 0, 0);
        const x = Math.floor(canvas.width / 2),
          y = Math.floor(canvas.height / 2);
        const data = context.getImageData(x - 4, y - 4, 8, 8).data;
        const mean = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4)
          for (let c = 0; c < 3; c++) mean[c]! += data[i + c]! / 64;
        snapshots.push({
          timestamp: frame.timestamp,
          width: canvas.width,
          height: canvas.height,
          mean,
        });
        canvas.dataset.ui = 'test.nativeRawExport';
        canvas.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;z-index:99999';
        document.body.append(canvas);
      }
      return encode.call(this, frame, options);
    };
  });
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, { preserveMediaLibrary: true, videoProjects: [project] });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(
      page,
      'source-vfr.webm',
      { width: 160, height: 90, duration: 0.9 },
      false,
      false,
      { bytes: new Uint8Array(bytes), mimeType: 'video/webm' }
    );
    const results = [];
    for (const detailEnhancement of ['off', 'bicubic-sharpen'] as const) {
      for (const format of ['WEBM', 'MP4'] as const) {
        const common = {
          burnInSubtitles: false,
          downloadAfterExport: false,
          fps: 30,
          frameRateMode: 'constant' as const,
          width: 160,
          height: 90,
          quality: 'HIGH' as const,
          resolution: 'SOURCE' as const,
          scope: 'project' as const,
          subtitleSidecarFormats: [],
          detailEnhancement,
        };
        const settings: VideoProjectExportSettings =
          format === 'MP4'
            ? { ...common, format, mp4VideoCodec: 'VP9' }
            : { ...common, format, webmVideoCodec: 'VP9' };
        const output = await encodedNativeVideoSamples(
          page,
          host.origin,
          project,
          format,
          [{ time, x: 80, y: 45, expected }],
          undefined,
          undefined,
          settings,
          30_000
        );
        const raw = await page.evaluate(() => {
          const value: unknown = Reflect.get(window, 'sniptaleB1NativeRaw');
          return value as {
            timestamps: number[];
            snapshots: { timestamp: number; width: number; height: number; mean: number[] }[];
          };
        });
        results.push({ format, detailEnhancement, output, raw });
        await writeFile(
          info.outputPath('native-export-source-result.json'),
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
      }
    }
    for (const result of results) {
      expect(result.output.width).toBe(160);
      expect(result.output.height).toBe(90);
      expect(Math.abs(result.output.duration - 0.9)).toBeLessThanOrEqual(1 / 30 + 0.001);
      expect(result.raw.timestamps).toHaveLength(27);
      for (const [i, timestamp] of result.raw.timestamps.entries())
        expect(timestamp).toBe(Math.round((i * 1e6) / 30));
      expect(result.raw.snapshots).toHaveLength(1);
      const mean = result.raw.snapshots[0]!.mean;
      expect(
        mean.reduce((sum, value, channel) => sum + Math.abs(value - expected[channel]!), 0) / 3
      ).toBeLessThanOrEqual(5);
      expect(result.output.samples).toHaveLength(1);
      expect(result.output.samples[0]!.error).toBeLessThan(12);
    }
    await page.screenshot({
      path: info.outputPath('native-export-source-witness.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
