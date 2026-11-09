import { readFile, writeFile } from 'node:fs/promises';
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
  EnhancementFixtureVariant,
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
    inspection?: Pick<InspectionOptions, 'effectRoi'>;
  }
) {
  try {
    return await page.evaluate(
      ({ fixture, mode, presentation, reference, interval, inspection }) =>
        window.__sniptaleOffscreenHarness!.enhancementProof.gallery(
          fixture,
          mode,
          presentation,
          reference,
          interval,
          inspection
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
  interval?: EnhancementProofWindow,
  inspection?: Pick<InspectionOptions, 'effectRoi'>
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
    { exportId: last.exportId, options: { ...options, ...inspection } }
  );
}
function checkFileTransport(
  result: Inspection,
  duration = 10,
  expected?: { audioPulses: readonly number[] }
) {
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
}
function checkFile(result: Inspection, duration = 10, expected?: typeof NEURAL_EXPECTED) {
  checkFileTransport(result, duration, expected);
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

const LATE_PROBES = [0.1, 0.3, 0.6, 0.9];
const LATE_SEEKS = [0.9, 0.1, 0.6];
const LATE_CONTROLS = [
  {
    name: 'optical-scene-lens',
    window: { start: 3.7, end: 4.7 },
    audioPulses: [0.3],
    detail: false,
  },
  {
    name: 'perspective-optical-click',
    window: { start: 5.5, end: 6.5 },
    audioPulses: [0.5],
    detail: true,
  },
  {
    name: 'camera-scene-optical-click',
    window: { start: 6.9, end: 7.9 },
    audioPulses: [0.1],
    detail: true,
  },
];
const OVERLAP_CONTROL = {
  name: 'two-overlapping-scene-lenses',
  window: { start: 7, end: 8 },
  audioPulses: [0],
  detail: true,
};
type LateControl = typeof OVERLAP_CONTROL;

function checkLateFile(result: Inspection, control: LateControl) {
  checkFileTransport(result, 1, control);
  expect(result.selected).toHaveLength(LATE_PROBES.length);
  expect(result.seeks.map((seek) => seek.time)).toEqual(LATE_SEEKS);
  for (const [index, probe] of LATE_PROBES.entries()) {
    expect(Math.abs(result.selected[index]!.timestamp - probe)).toBeLessThanOrEqual(0.0005 + 1e-9);
  }
}
function panelDisplacement(
  reference: readonly number[],
  current: readonly number[]
): number | null {
  if (reference.length !== current.length || reference.length <= 12) return null;
  const scores: { shift: number; score: number }[] = [];
  for (let shift = -6; shift <= 6; shift++) {
    let a = 0,
      b = 0,
      aa = 0,
      bb = 0,
      ab = 0,
      count = 0;
    for (let index = 6; index < reference.length - 6; index++) {
      const left = reference[index]!,
        right = current[index + shift]!;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
      a += left;
      b += right;
      aa += left * left;
      bb += right * right;
      ab += left * right;
      count++;
    }
    const variance = (aa - (a * a) / count) * (bb - (b * b) / count);
    if (variance <= 0) return null;
    const score = (ab - (a * b) / count) / Math.sqrt(variance);
    if (!Number.isFinite(score)) return null;
    scores.push({ shift, score });
  }
  scores.sort((a, b) => b.score - a.score);
  // Normalized double-precision correlations within 1e-9 are numerically ambiguous, not geometry proof.
  return scores[0]!.score - scores[1]!.score <= 1e-9 ? null : scores[0]!.shift;
}

function compareLateGeometry(
  enhanced: Inspection,
  reference: Inspection,
  control: LateControl,
  fullNative = false
) {
  for (const probe of LATE_PROBES) {
    const enhancedTime = fullNative ? control.window.start + probe : probe;
    const current = enhanced.selected.find(
      (sample) => Math.abs(sample.timestamp - enhancedTime) < 0.001
    );
    const original = reference.selected.find(
      (sample) => Math.abs(sample.timestamp - probe) < 0.001
    );
    expect(
      current,
      `${control.name} enhanced source time${control.window.start + probe}`
    ).toBeDefined();
    expect(
      original,
      `${control.name} OFF source time${control.window.start + probe}`
    ).toBeDefined();
    expect(Math.abs(current!.timestamp - enhancedTime)).toBeLessThanOrEqual(0.0005 + 1e-9);
    expect(Math.abs(original!.timestamp - probe)).toBeLessThanOrEqual(0.0005 + 1e-9);
    for (const sample of [current!, original!]) {
      expect(sample.effectRoi).toBeDefined();
      const roi = sample.effectRoi!;
      expect(roi.bounds).toEqual({ x: 480, y: 180, width: 960, height: 720 });
      for (const [axis, shifted] of [
        ['x', roi.shiftedX],
        ['y', roi.shiftedY],
      ] as const) {
        const displacement = panelDisplacement(roi.boundary[axis], shifted[axis]);
        expect(displacement, `${control.name} actual decoded +3px${axis} negative control`).toBe(3);
        expect(Math.abs(displacement!)).toBeGreaterThan(2);
      }
    }
    for (const axis of ['x', 'y'] as const) {
      const displacement = panelDisplacement(
        original!.effectRoi!.boundary[axis],
        current!.effectRoi!.boundary[axis]
      );
      expect(
        displacement,
        `${control.name} unique panel boundary ${axis} alignment`
      ).not.toBeNull();
      expect(Math.abs(displacement!)).toBeLessThanOrEqual(2);
    }
    // Existing authored detail improvement remains independent of the placement measurement.
    if (control.detail)
      compareDetail(enhanced, { ...reference, selected: [original!] }, enhancedTime);
  }
}

for (const variant of [undefined, 'overlapping-scene-lenses'] satisfies (
  | EnhancementFixtureVariant
  | undefined
)[]) {
  test(`remaining Clark late effect acceptance ${variant ?? 'existing full Native file'}`, async ({
    page,
  }, info) => {
    test.setTimeout(900_000);
    expect(panelDisplacement(new Array(32).fill(0), new Array(32).fill(0))).toBeNull();
    expect(panelDisplacement(new Array(32).fill(1), new Array(32).fill(1))).toBeNull();
    const ambiguous = Array.from({ length: 32 }, (_, index) => index % 2);
    expect(panelDisplacement(ambiguous, ambiguous)).toBeNull();
    const fullFile = process.env['SNIPTALE_ENHANCEMENT_NATIVE_FULL_FILE'];
    test.skip(
      !fullFile,
      'Supply the completed 10-second Native Clark file; do not re-encode it for inspection.'
    );
    const fullBytes = variant ? null : await readFile(fullFile!);
    const controls = variant ? [OVERLAP_CONTROL] : LATE_CONTROLS;
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1920, height: 900 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        apiBehavior: { runtimeFallback: 'typed-success' },
      });
      await page.goto(host.origin + OFFSCREEN_HARNESS_PATH);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const capabilities = await page.evaluate(() =>
        window.__sniptaleOffscreenHarness!.enhancementProof.capabilities()
      );
      expect(
        capabilities.clark,
        capabilities.reason ?? 'Clark must execute on the acceptance target.'
      ).toBe(true);
      const schema = await page.evaluate(
        (variant) => window.__sniptaleOffscreenHarness!.enhancementProof.schema(variant),
        variant
      );
      expect(schema.nativeClips).toBe(6);
      expect(schema.sceneRegions).toBe(variant ? 5 : 4);
      expect(schema.archivedSamples).toBe(361);
      const fixture = await page.evaluate(
        (variant) => window.__sniptaleOffscreenHarness!.enhancementProof.createFixture(variant),
        variant
      );
      let full: Inspection | undefined;
      if (fullBytes) {
        full = await page.evaluate(
          ({ bytes, probes }) =>
            window.__sniptaleOffscreenHarness!.enhancementProof.inspectFile(
              new Blob([Uint8Array.from(bytes)], { type: 'video/webm' }),
              { duration: 10, probes, effectRoi: true }
            ),
          {
            bytes: [...fullBytes],
            probes: controls.flatMap((control) =>
              LATE_PROBES.map((probe) => control.window.start + probe)
            ),
          }
        );
        checkFileTransport(full);
        await record(info, 'completed-native-full-late-rois', full);
      }
      await record(info, 'late-control-scope', {
        variant: variant ?? 'existing',
        controls,
        outputRaster: [1920, 1080],
        viewport: [1920, 900],
        fps: 30,
        shortFrames: 30,
        probes: LATE_PROBES,
        seeks: LATE_SEEKS,
        roi: { x: 480, y: 180, width: 960, height: 720 },
        geometryPolicy:
          'Paired same-source-time actual panel boundary alignment; enhancement ' +
          'geometry, not an independent effect algorithm oracle.',
      });
      for (const control of controls) {
        const off = await native(page, host.origin, fixture, 'off', false, false, control.window, {
          effectRoi: true,
        });
        checkLateFile(off, control);
        await record(info, `native-${control.name}-off`, off);
        await saveOutput(page, info, `native-${control.name}-off.webm`);
        const enhanced =
          full ??
          (await native(page, host.origin, fixture, 'clark-x2', false, false, control.window, {
            effectRoi: true,
          }));
        if (!full) {
          checkLateFile(enhanced, control);
          await record(info, `native-${control.name}-clark`, enhanced);
          await saveOutput(page, info, `native-${control.name}-clark.webm`);
        }
        compareLateGeometry(enhanced, off, control, Boolean(full));
        for (const presentation of [false, true]) {
          const route = presentation ? 'presentation' : 'ordinary';
          const reference = await gallery(page, info, {
            fixture,
            mode: 'off',
            presentation,
            reference: false,
            interval: control.window,
            inspection: { effectRoi: true },
          });
          checkLateFile(reference, control);
          await record(info, `gallery-${route}-${control.name}-off`, reference);
          await saveOutput(page, info, `gallery-${route}-${control.name}-off.mp4`);
          const result = await gallery(page, info, {
            fixture,
            mode: 'clark-x2',
            presentation,
            reference: false,
            interval: control.window,
            inspection: { effectRoi: true },
          });
          checkLateFile(result, control);
          await record(info, `gallery-${route}-${control.name}-clark`, result);
          await saveOutput(page, info, `gallery-${route}-${control.name}-clark.mp4`);
          compareLateGeometry(result, reference, control);
          expect(result.history.reads).toBeGreaterThanOrEqual(30);
          for (const clock of [result.history.firstClock, result.history.lastClock]) {
            expect(clock).not.toBeNull();
            expect(clock!.sourceTime).toBeGreaterThanOrEqual(control.window.start - 1 / 30);
            expect(clock!.sourceTime).toBeLessThanOrEqual(control.window.end + 1 / 30);
            expect(clock!.globalResultTime).toBeGreaterThanOrEqual(control.window.start - 1 / 30);
            expect(clock!.globalResultTime).toBeLessThanOrEqual(control.window.end + 1 / 30);
          }
        }
      }
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
