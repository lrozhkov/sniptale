import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

const execute = promisify(execFile);
const points = [
  [20, 70],
  [70, 80],
  [40, 82],
] as const;
type Result = {
  route: string;
  format: string;
  cameraRaw: number[] | null;
  error: string | null;
  bytes: number[];
  outputTimes: number[];
  sourcePTS: number[];
  raw: number[][] | null;
};
type Probe = {
  firstPTS: number;
  prefixRate: number;
  wholeRate: number;
  resolution: number;
  duration: number;
  results: Result[];
  cameraMetadata: {
    firstPTS: number;
    prefixRate: number;
    resolution: number;
    duration: number;
  } | null;
};

const entry = `
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, VideoSampleSource } from 'mediabunny';
import { inspectReviewMedia } from './apps/extension/src/workflows/video-review/media-index';
import { writeReviewFrames } from './apps/extension/src/workflows/video-review/render-export';
import { createQuickEditAdvancedState } from './apps/extension/src/features/video/review/advanced/defaults';
import { createNeutralPresentationSettings } from './apps/extension/src/features/video/review/advanced/presentation';
import { createQuickEditWebcam } from './apps/extension/src/features/video/review/advanced/webcam';
export async function run(bytes, cameraBytes) {
  const file = new Blob([Uint8Array.from(bytes)], { type: 'video/webm' });
  const signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let metadata;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Missing control video');
    metadata = {
      firstPTS: await track.getFirstTimestamp(),
      prefixRate: (await track.computePacketStats(256, { metadataOnly: true })).averagePacketRate,
      wholeRate: index.frameRate,
      resolution: await track.getTimeResolution(),
      duration: index.duration,
    };
  } finally { input.dispose(); }
  const camera = cameraBytes ? new Blob([Uint8Array.from(cameraBytes)], { type: 'video/webm' }) : null;
  let cameraMetadata = null;
  if (camera) {
    const cameraInput = new Input({ source: new BlobSource(camera), formats: ALL_FORMATS });
    try {
      const track = await cameraInput.getPrimaryVideoTrack();
      if (!track) throw new Error('Missing camera control track');
      cameraMetadata = { firstPTS: await track.getFirstTimestamp(),
        prefixRate: (await track.computePacketStats(256, { metadataOnly: true })).averagePacketRate,
        resolution: await track.getTimeResolution(), duration: await track.computeDuration() };
    } finally { cameraInput.dispose(); }
  }
  const results = [];
  for (const format of camera ? ['webm', 'mp4'] : ['webm']) for (const route of ['plain', 'presentation']) {
    let output = new Uint8Array(0);
    const outputTimes = [], sourcePTS = [];
    let raw = null, cameraRaw = null, error = null;
    const add = VideoSampleSource.prototype.add;
    const samples = VideoSampleSink.prototype.samplesAtTimestamps;
    VideoSampleSink.prototype.samplesAtTimestamps = async function* (...args) {
      for await (const sample of samples.apply(this, args)) {
        if (sample) sourcePTS.push(sample.timestamp);
        yield sample;
      }
    };
    VideoSampleSource.prototype.add = async function(sample, ...args) {
      outputTimes.push(sample.timestamp);
      if (!raw) {
        const canvas = document.createElement('canvas');
        canvas.width = sample.displayWidth; canvas.height = sample.displayHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Missing output witness context');
        sample.draw(context, 0, 0, canvas.width, canvas.height);
        raw = [[20,70],[70,80],[40,82]].map(([x,y]) =>
          [...context.getImageData(x,y,1,1).data].slice(0,3));
        if (camera) cameraRaw = [...context.getImageData(136,76,1,1).data].slice(0,3);
        canvas.style.cssText = 'width:320px;height:180px;image-rendering:pixelated';
        document.querySelector('[data-ui="test.leadingResults"]').append(canvas);
      }
      return add.call(this, sample, ...args);
    };
    try {
      const advanced = createQuickEditAdvancedState();
      if (camera) {
        advanced.ui.mode = 'advanced';
        advanced.webcam = createQuickEditWebcam('leading-camera', { width: 160, height: 90 },
          { width: 160, height: 90 });
      }
      if (route === 'presentation') {
        advanced.ui.mode = 'advanced';
        advanced.presentation = createNeutralPresentationSettings();
        advanced.presentation.fadeOut.enabled = true;
        advanced.presentation.fadeOut.duration = 0.02;
      }
      const codec = index.outputCodecs[format].find(value => value === 'vp9' || value === 'vp8');
      if (!codec) throw new Error('Required WebM encoder unavailable');
      await writeReviewFrames({
        file, index, advanced, signal, fragmentOffset: 0,
        edits: [{ id: 'retain-first-quarter', kind: 'cut', start: 0.25, end: index.duration,
          requestedStart: 0.25, requestedEnd: index.duration }],
        renderSettings: { format, codec, frameRate: 30, quality: 'HIGH' },
        readProjectAsset: async id => id === 'leading-camera' ? camera : null,
        writer: { writeAt: async (position, blob) => {
          const part = new Uint8Array(await blob.arrayBuffer());
          if (position + part.length > output.length) {
            const next = new Uint8Array(position + part.length); next.set(output); output = next;
          }
          output.set(part, position);
        } },
      });
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      VideoSampleSource.prototype.add = add;
      VideoSampleSink.prototype.samplesAtTimestamps = samples;
    }
    results.push({ route, format, error, bytes: [...output], outputTimes, sourcePTS, raw, cameraRaw });
  }
  return { ...metadata, cameraMetadata, results };
}`;

async function firstColors(
  path: string,
  samplePoints: readonly (readonly [number, number])[] = points
) {
  const { stdout } = await execute(
    '/usr/bin/ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-map',
      '0:v:0',
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
  return samplePoints.map(([x, y]) => [
    ...stdout.subarray((y * 160 + x) * 3, (y * 160 + x) * 3 + 3),
  ]);
}

// Source metadata differs across prefix/full-file reads; encode only eight output frames per route.
test('Gallery ordered exports preserve bounded first PTS with VFR metadata', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const externalSource = process.env.SNIPTALE_E2E_LEADING_SOURCE;
  const sourcePath = externalSource ?? info.outputPath('leading-vfr.webm');
  if (!externalSource)
    await execute('/usr/bin/ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x90:rate=120:duration=16',
      '-vf',
      "select='if(lt(t,8),not(mod(n,4)),1)',setpts=PTS+0.025/TB",
      '-fps_mode',
      'vfr',
      '-copyts',
      '-avoid_negative_ts',
      'disabled',
      '-fflags',
      '+bitexact',
      '-flags:v',
      '+bitexact',
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
  const expected = await firstColors(sourcePath);
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl', '.bin': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, {});
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    const result = await page.evaluate(
      async ({ text, bytes }) => {
        const panel = document.createElement('section');
        panel.dataset.ui = 'test.leadingResults';
        panel.style.cssText =
          'position:fixed;inset:0;background:white;z-index:99999;display:flex;gap:16px';
        document.body.append(panel);
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const module: { run(bytes: number[]): Promise<Probe> } = await import(url);
          return await module.run(bytes);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { text: bundle.outputFiles[0]!.text, bytes: [...bytes] }
    );
    await writeFile(
      info.outputPath('leading-source-result.json'),
      JSON.stringify(
        {
          sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
          viewport: page.viewportSize(),
          sourceRaster: { width: 160, height: 90 },
          expected,
          ...result,
          results: result.results.map(({ bytes: output, ...rest }) => ({
            ...rest,
            outputBytes: output.length,
          })),
        },
        null,
        2
      )
    );
    expect(result.firstPTS).toBe(0.025);
    expect(result.firstPTS).toBeLessThanOrEqual(1 / result.prefixRate + 1 / result.resolution);
    expect(result.firstPTS).toBeGreaterThan(1 / result.wholeRate + 1 / result.resolution);
    expect(result.results.map((value) => value.error)).toEqual([null, null]);
    for (const value of result.results) {
      expect(value.sourcePTS[0]).toBe(0.025);
      expect(value.outputTimes).toHaveLength(8);
      for (const [i, timestamp] of value.outputTimes.entries()) {
        // Presentation output declares integer microseconds; plain samples retain rational seconds.
        const expectedTick =
          value.route === 'presentation' ? Math.round((i / 30) * 1e6) / 1e6 : i / 30;
        expect(timestamp).toBe(expectedTick);
      }
      const rawErrors = value.raw!.flatMap((color, i) =>
        color.map((channel, j) => Math.abs(channel - expected[i]![j]!))
      );
      expect(Math.max(...rawErrors)).toBeLessThan(4);
      const path = info.outputPath(`${value.route}.webm`);
      await writeFile(path, Uint8Array.from(value.bytes));
      const decoded = await firstColors(path);
      const errors = decoded.flatMap((color, i) =>
        color.map((channel, j) => Math.abs(channel - expected[i]![j]!))
      );
      expect(errors.reduce((sum, value) => sum + value, 0) / errors.length).toBeLessThan(12);
      const { stdout } = await execute('/usr/bin/ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'frame=best_effort_timestamp_time',
        '-of',
        'json',
        path,
      ]);
      const frames = JSON.parse(stdout) as { frames: { best_effort_timestamp_time: string }[] };
      expect(frames.frames).toHaveLength(8);
      for (const [i, frame] of frames.frames.entries()) {
        expect(Math.abs(Number(frame.best_effort_timestamp_time) - i / 30)).toBeLessThanOrEqual(
          0.001001
        );
      }
    }
    await page.screenshot({
      path: info.outputPath('leading-output-witnesses.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

// One prepared camera/project is reused for both exporters and both containers.
test('Gallery camera first PTS agrees across ordinary and presentation exports in both formats', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const source = await readFile(new URL('../fixtures/review-cut-vfr.webm', import.meta.url));
  const cameraPath = info.outputPath('positive-camera.webm');
  await execute('/usr/bin/ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=green:size=160x90:rate=120:duration=1',
    '-vf',
    "select='not(mod(n,4))',setpts=PTS+0.025/TB",
    '-fps_mode',
    'vfr',
    '-copyts',
    '-avoid_negative_ts',
    'disabled',
    '-c:v',
    'libvpx',
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
    '-b:v',
    '200k',
    '-an',
    '-y',
    cameraPath,
  ]);
  const camera = await readFile(cameraPath);
  const expected = (await firstColors(cameraPath, [[80, 45]]))[0]!;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl', '.bin': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, {});
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    const result = await page.evaluate(
      async ({ text, source, camera }) => {
        const panel = document.createElement('section');
        panel.dataset.ui = 'test.leadingResults';
        panel.style.cssText =
          'position:fixed;inset:0;background:white;z-index:99999;display:flex;gap:8px';
        document.body.append(panel);
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const module: { run(source: number[], camera: number[]): Promise<Probe> } = await import(
            url
          );
          return await module.run(source, camera);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { text: bundle.outputFiles[0]!.text, source: [...source], camera: [...camera] }
    );
    await writeFile(
      info.outputPath('camera-leading-result.json'),
      JSON.stringify(
        {
          sourceSHA256: createHash('sha256').update(source).digest('hex'),
          cameraSHA256: createHash('sha256').update(camera).digest('hex'),
          viewport: page.viewportSize(),
          sourceRaster: { width: 160, height: 90 },
          expected,
          ...result,
          results: result.results.map(({ bytes, ...rest }) => ({
            ...rest,
            outputBytes: bytes.length,
          })),
        },
        null,
        2
      )
    );
    expect(result.cameraMetadata!.firstPTS).toBe(0.025);
    expect(result.cameraMetadata!.firstPTS).toBeLessThanOrEqual(
      1 / result.cameraMetadata!.prefixRate + 1 / result.cameraMetadata!.resolution
    );
    expect(result.results).toHaveLength(4);
    expect(result.results.map((value) => value.error)).toEqual([null, null, null, null]);
    for (const value of result.results) {
      expect(value.sourcePTS).toContain(0.025);
      expect(value.outputTimes).toHaveLength(8);
      for (const [i, timestamp] of value.outputTimes.entries()) {
        expect(timestamp).toBe(
          value.route === 'presentation' ? Math.round((i / 30) * 1e6) / 1e6 : i / 30
        );
      }
      expect(
        Math.max(...value.cameraRaw!.map((channel, i) => Math.abs(channel - expected[i]!)))
      ).toBeLessThan(4);
      const path = info.outputPath(`${value.route}.${value.format}`);
      await writeFile(path, Uint8Array.from(value.bytes));
      const decoded = (await firstColors(path, [[136, 76]]))[0]!;
      expect(
        decoded.reduce((sum, channel, i) => sum + Math.abs(channel - expected[i]!), 0) / 3
      ).toBeLessThan(12);
      const { stdout } = await execute('/usr/bin/ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'frame=best_effort_timestamp_time',
        '-of',
        'json',
        path,
      ]);
      const frames = JSON.parse(stdout) as { frames: { best_effort_timestamp_time: string }[] };
      expect(frames.frames).toHaveLength(8);
      for (const [i, frame] of frames.frames.entries()) {
        const tolerance = value.format === 'webm' ? 0.001001 : 0.000002;
        expect(Math.abs(Number(frame.best_effort_timestamp_time) - i / 30)).toBeLessThanOrEqual(
          tolerance
        );
      }
    }
    await page.screenshot({
      path: info.outputPath('camera-leading-witnesses.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
