import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import {
  applyHarnessBootstrap,
  getRuntimeMessagesByType,
  OFFSCREEN_HARNESS_PATH,
  VideoMessageType,
} from '../extension-critical.helpers';
import type {
  VideoExportDetailMode,
  VideoProjectExportSettings,
} from '../../../../apps/extension/src/features/video/project/types';
import type {
  EnhancementFixture,
  EnhancementProofWindow,
  InspectionOptions,
  inspectEnhancementOutput,
} from '../../harness/export-enhancement';

type Inspection = Awaited<ReturnType<typeof inspectEnhancementOutput>>;
const NEURAL_WINDOW = { start: 0.9, end: 1.9 };
const NEURAL_EXPECTED = {
  probes: [0.1, 0.3, 0.6, 0.9],
  seeks: [0.9, 0.1, 0.6],
  audioPulses: [0.1],
};
function settings(
  mode: VideoExportDetailMode,
  mp4 = false,
  reference = false,
  interval?: EnhancementProofWindow
): VideoProjectExportSettings {
  const range = reference ? { start: 1, end: 1.5 } : interval;
  return {
    width: 1920,
    height: 1080,
    fps: 30,
    quality: 'HIGH',
    resolution: 'SOURCE',
    detailEnhancement: mode,
    downloadAfterExport: false,
    burnInSubtitles: false,
    scope: range ? 'selected-range' : 'project',
    ...(range ? { rangeStartSeconds: range.start, rangeEndSeconds: range.end } : {}),
    ...(mp4 ? { format: 'MP4', mp4VideoCodec: 'AVC' } : { format: 'WEBM', webmVideoCodec: 'VP9' }),
  };
}
async function saveOutput(page: Page, info: TestInfo, name: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(
      (name) => window.__sniptaleOffscreenHarness!.enhancementProof.download(name),
      name
    ),
  ]);
  await download.saveAs(info.outputPath(name));
}
async function gallery(
  page: Page,
  info: TestInfo,
  args: {
    fixture: EnhancementFixture;
    mode: VideoExportDetailMode;
    presentation: boolean;
    reference: boolean;
    interval?: EnhancementProofWindow;
  }
) {
  try {
    return await page.evaluate(
      ({ fixture, mode, presentation, reference, interval }) =>
        window.__sniptaleOffscreenHarness!.enhancementProof.gallery(
          fixture,
          mode,
          presentation,
          reference,
          interval
        ),
      args
    );
  } catch (error) {
    const route = args.presentation ? 'presentation' : 'ordinary';
    const phase = args.reference ? 'off-reference' : 'full';
    const name = `gallery-${route}-${phase}-${args.mode}-failed`;
    try {
      await saveOutput(page, info, `${name}.mp4`);
      await record(info, name, {
        error: error instanceof Error ? error.message : 'Gallery proof failed.',
      });
    } catch (retentionError) {
      console.warn(
        'Gallery failure artifact retention failed:',
        retentionError instanceof Error ? retentionError.message : 'Unknown retention error.'
      );
    }
    throw error;
  }
}
async function native(
  page: Page,
  origin: string,
  fixture: EnhancementFixture,
  mode: VideoExportDetailMode,
  mp4 = false,
  reference = false,
  interval?: EnhancementProofWindow
) {
  const range = reference ? { start: 1, end: 1.5 } : interval;
  await encodedNativeVideoSamples(
    page,
    origin,
    fixture.project,
    mp4 ? 'MP4' : 'WEBM',
    [],
    range,
    undefined,
    settings(mode, mp4, reference, interval),
    mode === 'clark-x2' ? 480_000 : undefined
  );
  const messages = await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED);
  const last = messages.at(-1);
  if (!last || !('exportId' in last) || typeof last.exportId !== 'string')
    throw new Error('Native completion has no export identity.');
  const options: InspectionOptions = reference
    ? { duration: 0.5, offset: 1 }
    : interval
      ? {
          duration: interval.end - interval.start,
          offset: interval.start,
          probes: NEURAL_EXPECTED.probes,
          seeks: NEURAL_EXPECTED.seeks,
        }
      : { duration: 10, offset: 0 };
  return page.evaluate(
    ({ exportId, options }) =>
      window.__sniptaleOffscreenHarness!.enhancementProof.inspectNative(exportId, options),
    { exportId: last.exportId, options }
  );
}
function checkFile(result: Inspection, duration = 10, expected?: typeof NEURAL_EXPECTED) {
  expect(result.dimensions).toEqual({ width: 1920, height: 1080 });
  expect(result.presentedFrames).toBe(Math.round(duration * 30));
  expect(result.decodedFrames).toBe(result.presentedFrames + result.terminalSamples);
  expect(result.terminalSamples).toBeLessThanOrEqual(1);
  expect(Math.abs(result.firstTimestamp)).toBeLessThanOrEqual(1 / 30);
  expect(Math.abs(result.videoEnd - duration)).toBeLessThanOrEqual(1 / 30 + 0.0001);
  expect(result.failures).toEqual([]);
  expect(result.packetCount).toBeGreaterThan(0);
  expect(result.packetSequenceOrderValid).toBe(true);
  expect(result.keyCount).toBeGreaterThan(0);
  expect(result.maximumKeyGap).toBeLessThanOrEqual(2 + 1 / 30 + 0.0001);
  if (result.container.type === 'mp4') {
    expect(result.container.fastStart).toBe(true);
    expect(result.container.sampleTables).toBeGreaterThan(0);
    if (result.container.fragments > 0) {
      expect(result.container.fragmentSamples).toBe(result.packetCount);
      expect(result.container.fragmentSyncSamples).toBe(result.keyCount);
      expect(result.container.randomAccessEntries).toBeGreaterThan(0);
    } else if (result.keyCount < result.packetCount) {
      // Non-fragmented files omit stss only when every sample is a sync sample.
      expect(result.container.explicitSyncSamples).toBeGreaterThan(0);
    }
  } else {
    expect(result.container.cues).toBeGreaterThan(0);
    expect(result.container.clusters).toBeGreaterThan(0);
    expect(result.container.seekHeads).toBeGreaterThan(0);
  }
  for (const seek of result.seeks) {
    expect(Math.abs(seek.timestamp - seek.time)).toBeLessThanOrEqual(1 / 30 + 0.0001);
    expect(seek.colorError).toBeLessThan(12);
  }
  expect(result.audio.frames).toBeGreaterThan(duration * 47000);
  expect(Math.abs(result.audio.end - duration)).toBeLessThanOrEqual(0.04);
  for (const time of expected?.audioPulses ??
    (duration < 1 ? [0] : [1, 2, 3, 4, 5, 6, 7, 8, 8.5, 9]))
    expect(
      Math.min(...result.audio.pulses.map((pulse) => Math.abs(pulse - time)))
    ).toBeLessThanOrEqual(0.04);
  for (const sample of result.selected)
    if (sample.landmark) {
      expect(sample.landmark.count).toBeGreaterThan(30);
      expect(Math.abs(sample.landmark.x! - sample.landmark.expected.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(sample.landmark.y! - sample.landmark.expected.y)).toBeLessThanOrEqual(2);
    }
  expect(result.selected.length).toBe(expected ? expected.probes.length : duration < 1 ? 1 : 11);
  if (expected) {
    expect(result.seeks.map((seek) => seek.time)).toEqual(expected.seeks);
    for (const [index, probe] of expected.probes.entries())
      expect(Math.abs(result.selected[index]!.timestamp - probe)).toBeLessThanOrEqual(
        0.0005 + 1e-9
      );
    expect(result.selected.every((sample) => sample.landmark !== null)).toBe(true);
  }
}
function compareDetail(enhanced: Inspection, reference: Inspection, timestamp = 1) {
  const current = enhanced.selected.find(
    (sample) => Math.abs(sample.timestamp - timestamp) < 0.001
  );
  const original = reference.selected[0];
  expect(current).toBeDefined();
  expect(original).toBeDefined();
  const differences = current!.detail.map((value, index) =>
    Math.abs(value - original!.detail[index]!)
  );
  expect(differences.filter((value) => value > 3).length).toBeGreaterThan(16);
  // The authored raster bars remain distinct. Codec noise alone does not establish this contrast.
  const values = [...current!.detail].sort((a, b) => a - b);
  expect(
    values[Math.floor(values.length * 0.9)]! - values[Math.floor(values.length * 0.1)]!
  ).toBeGreaterThan(80);
}
async function record(info: TestInfo, name: string, result: unknown) {
  const json = JSON.stringify(result, null, 2);
  await writeFile(info.outputPath(`${name}.json`), json);
  await info.attach(`${name}.json`, { body: json, contentType: 'application/json' });
}
for (const mode of ['bicubic-sharpen', 'clark-x2'] as const) {
  test(`encoded enhancement ${mode} preserves both editors, presentation, source clocks and seek indexes`, async ({
    page,
  }, info) => {
    test.setTimeout(900_000);
    const host = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        apiBehavior: { runtimeFallback: 'typed-success' },
      });
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const capabilities = await page.evaluate(() =>
        window.__sniptaleOffscreenHarness!.enhancementProof.capabilities()
      );
      await record(info, 'capabilities', capabilities);
      test.skip(
        mode === 'clark-x2' && !capabilities.clark,
        `Clark is unavailable: ${capabilities.reason}`
      );
      const schema = await page.evaluate(() =>
        window.__sniptaleOffscreenHarness!.enhancementProof.schema()
      );
      expect(schema.nativeClips).toBe(6);
      expect(schema.sceneRegions).toBe(4);
      expect(schema.archivedSamples).toBe(361);
      expect(schema.rejected).toEqual([
        'recording-asset-type',
        'scene-source-binding',
        'source-instance-owner',
        'released-gesture-facts',
      ]);
      await record(info, 'fixture-schema', schema);
      const fixture = await page.evaluate(() =>
        window.__sniptaleOffscreenHarness!.enhancementProof.createFixture()
      );
      const interval = mode === 'clark-x2' ? NEURAL_WINDOW : undefined;
      await record(info, 'proof-scope', {
        mode,
        interval: interval ?? null,
        duration: interval ? 1 : 10,
        expectedPresentedFrames: interval ? 30 : 300,
      });
      let modelRequests = 0;
      const unexpectedModelOrigins = new Set<string>();
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (!/model[^/]*\.bin$/.test(url.pathname)) return;
        modelRequests++;
        if (url.origin !== host.origin) unexpectedModelOrigins.add(url.origin);
      });
      const checkModelSelection = (before: number, selectedMode: VideoExportDetailMode) => {
        expect(unexpectedModelOrigins.size).toBe(0);
        if (selectedMode === 'clark-x2') expect(modelRequests - before).toBeGreaterThan(0);
        else expect(modelRequests).toBe(before);
      };
      const beforeOffNative = modelRequests;
      const offNative = await native(page, host.origin, fixture, 'off', false, true);
      await record(info, 'native-off', offNative);
      await saveOutput(page, info, `native-off-${mode}.webm`);
      checkFile(offNative, 0.5);
      checkModelSelection(beforeOffNative, 'off');
      const beforeNative = modelRequests;
      const nativeResult = await native(page, host.origin, fixture, mode, false, false, interval);
      await record(info, 'native', nativeResult);
      await saveOutput(page, info, `native-${mode}.webm`);
      if (interval) {
        checkFile(nativeResult, 1, NEURAL_EXPECTED);
        compareDetail(nativeResult, offNative, 0.3);
      } else {
        checkFile(nativeResult);
        compareDetail(nativeResult, offNative);
      }
      checkModelSelection(beforeNative, mode);
      for (const presentation of [false, true]) {
        const beforeOff = modelRequests;
        const off = await gallery(page, info, {
          fixture,
          mode: 'off',
          presentation,
          reference: true,
        });
        const name = presentation ? 'gallery-presentation' : 'gallery';
        await record(info, `${name}-off`, off);
        await saveOutput(page, info, `${name}-off-${mode}.mp4`);
        checkFile(off, 0.5);
        checkModelSelection(beforeOff, 'off');
        const beforeGallery = modelRequests;
        const result = await gallery(page, info, {
          fixture,
          mode,
          presentation,
          reference: false,
          ...(interval ? { interval } : {}),
        });
        await record(info, name, result);
        await saveOutput(page, info, `${name}-${mode}.mp4`);
        if (interval) {
          checkFile(result, 1, NEURAL_EXPECTED);
          compareDetail(result, off, 0.3);
          expect(result.history.reads).toBeGreaterThanOrEqual(30);
          expect(result.history.firstClock).not.toBeNull();
          expect(result.history.lastClock).not.toBeNull();
          for (const clock of [result.history.firstClock!, result.history.lastClock!]) {
            expect(clock.sourceTime).toBeGreaterThanOrEqual(interval.start - 1 / 30);
            expect(clock.sourceTime).toBeLessThanOrEqual(interval.end + 1 / 30);
            expect(clock.globalResultTime).toBeGreaterThanOrEqual(interval.start - 1 / 30);
            expect(clock.globalResultTime).toBeLessThanOrEqual(interval.end + 1 / 30);
          }
        } else {
          checkFile(result);
          compareDetail(result, off);
          expect(result.history.reads).toBeGreaterThanOrEqual(300);
          expect(result.history.divergentReads).toBeGreaterThan(0);
        }
        checkModelSelection(beforeGallery, mode);
      }
      if (fixture.sourceFormat === 'mp4') {
        const beforeGate = modelRequests;
        const gate = await native(page, host.origin, fixture, mode, true, true);
        await record(info, 'native-mp4-gate', gate);
        await saveOutput(page, info, `native-mp4-gate-${mode}.mp4`);
        checkFile(gate, 0.5);
        compareDetail(gate, offNative, 0.2);
        checkModelSelection(beforeGate, mode);
      } else
        test.info().annotations.push({
          type: 'native-mp4-gate',
          description:
            'AVC/AAC source encoding is unavailable. Run the MP4 gate case on the physical target.',
        });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
