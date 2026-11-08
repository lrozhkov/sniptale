import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Output,
  WebMOutputFormat,
} from 'mediabunny';
import { writeFile } from 'node:fs/promises';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import eventsFixture from '../../../../apps/extension/src/features/video/project/recording-events/fixtures.json' with { type: 'json' };
import {
  createRecordingEventsBlockPacker,
  decodeRecordingEventsBlock,
} from '../../../../apps/extension/src/features/video/project/recording-events/blocks';
import { isRecordingEventsDescriptor } from '../../../../apps/extension/src/features/video/project/recording-events/records';
import { applyRecordingEventFact } from '../../../../apps/extension/src/composition/persistence/recordings/recording-events/facts';
import { isRecordingEventsHead } from '../../../../apps/extension/src/composition/persistence/recordings/recording-events/guards';
import type { StoredRecordingEventFact } from '../../../../apps/extension/src/composition/persistence/recordings/recording-events/contracts';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  createCursorTrajectoryBlockPacker,
  decodeCursorTrajectoryBlock,
} from '../../../../apps/extension/src/features/video/project/cursor-trajectory/blocks';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectorySegment,
} from '../../../../apps/extension/src/features/video/project/cursor-trajectory/types';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../apps/extension/src/features/video/project/cursor';
import { applyVideoProjectMutationPatch } from '../../../../apps/extension/src/features/video/project/mutation';
import { assertExportReadyVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { isCursorTrajectoryHead } from '../../../../apps/extension/src/composition/persistence/recordings/cursor-trajectory/guards';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

enableGpuPreviewProof();

/** Static source pixels make camera movement observable independently of source animation. */
async function staticCameraSource(page: Page) {
  const packets = await page.evaluate(async () => {
    const packets: {
      data: number[];
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
    }[] = [];
    let failed: Error | null = null;
    const encoder = new VideoEncoder({
      output(chunk) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        packets.push({
          data: [...data],
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration ?? 100000,
        });
      },
      error(error) {
        failed = error;
      },
    });
    try {
      encoder.configure({
        codec: 'vp8',
        width: 160,
        height: 90,
        framerate: 10,
        bitrate: 2000000,
        hardwareAcceleration: 'prefer-software',
      });
      const canvas = new OffscreenCanvas(160, 90);
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#142040';
      context.fillRect(0, 0, 160, 90);
      context.fillStyle = '#ff36bd';
      context.fillRect(56, 56, 8, 8);
      for (let frame = 0; frame < 120; frame++) {
        const sample = new VideoFrame(canvas, { timestamp: frame * 100000, duration: 100000 });
        encoder.encode(sample, { keyFrame: frame % 20 === 0 });
        sample.close();
      }
      await encoder.flush();
      if (failed) throw failed;
      return packets;
    } finally {
      encoder.close();
    }
  });
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const video = new EncodedVideoPacketSource('vp8');
  output.addVideoTrack(video);
  await output.start();
  for (const packet of packets)
    await video.add(
      new EncodedPacket(
        Uint8Array.from(packet.data),
        packet.type,
        packet.timestamp / 1e6,
        packet.duration / 1e6
      ),
      { decoderConfig: { codec: 'vp8', codedWidth: 160, codedHeight: 90 } }
    );
  video.close();
  await output.finalize();
  if (!target.buffer) throw new Error('Missing static camera source.');
  return new Uint8Array(target.buffer);
}

function sourceFixture(mediaSize: number) {
  const recording = betaV1Fixture.records.recordings[0]!;
  const trajectoryId = '0123456789abcdef0123456789abcdef';
  const identity = { recordingId: recording.id, trajectoryId };
  const writer = createCursorTrajectoryBlockPacker(recording.id, trajectoryId);
  const segment: CursorTrajectorySegment = {
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    width: 160,
    height: 90,
    reason: 'start',
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  };
  const packed = writer.append(segment);
  for (let i = 0; i < 6000; i++)
    packed.push(
      ...writer.append({
        kind: 'sample',
        segmentId: 0,
        observationSeq: i,
        activeTimeUs: i * 2000,
        xQ8: Math.floor((16 + (i * 128) / 5999) * 256 + 0.5),
        yQ8: (45 + (i % 2 ? 4 : -4)) * 256,
        observed: true,
        visible: true,
        event: 'move',
        button: 'none',
        relatedObservationSeq: null,
        anchors: [],
      })
    );
  packed.push(
    ...writer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 12010000, reason: 'stop' }),
    ...writer.finish()
  );
  const totals = writer.summary();
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId,
    state: 'complete',
    finalized: true,
    ...totals,
  };
  let initialSegment: CursorTrajectorySegment | null = null;
  const rows = packed.map((block) => {
    const decoded = decodeCursorTrajectoryBlock(block.bytes, initialSegment);
    if (!decoded) throw new Error('Invalid canonical fixture.');
    const row = {
      ...identity,
      sequence: block.entry.sequence,
      startTimeUs: block.entry.startTimeUs,
      entry: block.entry,
      initialSegment,
      bytes: Array.from(block.bytes),
    };
    for (const record of decoded.records) {
      if (record.kind === 'segment') initialSegment = record;
      if (record.kind === 'boundary' || record.kind === 'gap') initialSegment = null;
    }
    return row;
  });
  const head = {
    ...identity,
    sourceRecordingId: recording.id,
    writerGeneration: 'fixture-generation',
    revision: rows.length + 2,
    width: 160,
    height: 90,
    retired: false,
    finalized: true,
    state: 'complete',
    ...totals,
    activeSegment: null,
    lastObservationSeq: 5999,
    lastSegmentId: 0,
    lastTimeUs: 12010000,
  };
  if (!isCursorTrajectoryHead(head)) throw new Error('Invalid fixture head.');
  const base = createVideoProjectFromRecording({
    recordingId: recording.id,
    filename: recording.filename,
    width: 160,
    height: 90,
    duration: 12.01,
    mimeType: 'video/webm',
    size: mediaSize,
  });
  const clip = base.clips.find((item) => item.type === 'VIDEO');
  if (!clip?.sourceInstanceId) throw new Error('Missing source instance.');
  const project = applyVideoProjectMutationPatch(base, {
    cursorTrack: {
      captureMode: 'separate',
      samples: [],
      skin: {
        ...normalizeVideoProjectCursorSkin(undefined),
        preset: 'DOT',
        color: '#13e36b',
        scale: 1,
        hidden: false,
      },
      sourceObservations: [
        {
          recordingId: recording.id,
          sourceInstanceId: clip.sourceInstanceId,
          samples: [],
          trajectory: descriptor,
        },
      ],
    },
  });
  assertExportReadyVideoProject(project);
  return { head, rows, project };
}

async function eventSourceFixture() {
  if (!isRecordingEventsDescriptor(eventsFixture.descriptor))
    throw new Error('Invalid event fixture.');
  const recordingId = betaV1Fixture.records.recordings[0]!.id;
  const eventStreamId = eventsFixture.eventStreamId;
  const packer = createRecordingEventsBlockPacker(recordingId, eventStreamId);
  const blocks: ReturnType<typeof packer.append> = [];
  const facts = new Map<string, StoredRecordingEventFact>();
  const store: Parameters<typeof applyRecordingEventFact>[0] = {
    get: async (query) => facts.get(JSON.stringify(query)),
    put: async (value) => {
      facts.set(
        JSON.stringify([value.recordingId, value.eventStreamId, value.kind, value.entryId]),
        value
      );
    },
    add: async (value) => {
      const key = JSON.stringify([
        value.recordingId,
        value.eventStreamId,
        value.kind,
        value.entryId,
      ]);
      if (facts.has(key)) throw new Error('Duplicate fixture fact.');
      facts.set(key, value);
    },
  };
  let activeInputs = 0,
    lastSegmentId: number | null = null,
    activeSegment: number | null = null;
  for (const block of eventsFixture.blocks) {
    const decoded = decodeRecordingEventsBlock(new TextEncoder().encode(block.utf8));
    if (!decoded) throw new Error('Invalid canonical event block.');
    for (const record of decoded.records) {
      blocks.push(...packer.append(record));
      activeInputs += await applyRecordingEventFact(store, { recordingId, eventStreamId }, record);
      if (record.kind === 'segment') {
        lastSegmentId = record.segmentId;
        activeSegment = record.segmentId;
      }
      if (record.kind === 'boundary' || record.kind === 'gap') activeSegment = null;
    }
  }
  blocks.push(...packer.finish());
  const descriptor = { ...eventsFixture.descriptor, ...packer.summary() };
  if (!isRecordingEventsDescriptor(descriptor))
    throw new Error('Invalid repacked event descriptor.');
  const head = {
    recordingId,
    eventStreamId,
    sourceRecordingId: recordingId,
    writerGeneration: 'quick-history-fixture',
    kind: 'head',
    entryId: 0,
    revision: blocks.length + 2,
    retired: false,
    finalized: true,
    state: descriptor.state,
    activeSegment,
    lastSegmentId,
    hasGap: true,
    activeInputs,
    ...packer.summary(),
  };
  if (!isRecordingEventsHead(head)) throw new Error('Invalid event fixture head.');
  return {
    descriptor,
    head,
    facts: [...facts.values()],
    blocks: blocks.map((block) => ({
      recordingId,
      eventStreamId,
      kind: 'block',
      entryId: block.entry.sequence,
      entry: block.entry,
      bytes: Array.from(block.bytes),
    })),
  };
}

async function seekProjectTime(page: Page, time: number) {
  const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
  await expect(ruler).toBeVisible();
  await expect.poll(() => ruler.locator(':scope > div > span').count()).toBeGreaterThan(1);
  const ticks = await ruler.locator(':scope > div > span').evaluateAll((labels) =>
    labels.flatMap((label) => {
      const match = /^(\d+):(\d+\.\d+|\d+)$/.exec(label.textContent?.trim() ?? '');
      return match && label.parentElement
        ? [
            {
              x: label.parentElement.getBoundingClientRect().x,
              time: Number(match[1]) * 60 + Number(match[2]),
            },
          ]
        : [];
    })
  );
  const first = ticks[0];
  const next = ticks[1];
  const bounds = await ruler.boundingBox();
  if (!first || !next || !bounds) throw new Error('Missing timeline ruler.');
  await ruler.click({
    position: {
      x: first.x - bounds.x + ((time - first.time) * (next.x - first.x)) / (next.time - first.time),
      y: 8,
    },
  });
  // Pointer seeking can land between frames. One project frame is sufficient for this source-range proof.
  await expect
    .poll(async () => {
      const text = await page.locator('[data-playback-counter="true"]').textContent();
      const match = /^(\d+):(\d+\.\d+|\d+)/.exec(text?.trim() ?? '');
      return match ? Math.abs(Number(match[1]) * 60 + Number(match[2]) - time) : Infinity;
    })
    .toBeLessThanOrEqual(1 / 30 + 0.001);
}

async function paintedCursor(page: Page) {
  return page.locator('[data-preview-stage-canvas]').evaluate((canvas: HTMLCanvasElement) => {
    const readback = document.createElement('canvas');
    readback.width = canvas.width;
    readback.height = canvas.height;
    try {
      const context = readback.getContext('2d');
      if (!context) throw new Error('Missing preview raster.');
      context.drawImage(canvas, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      let sumX = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs(pixels[i]! - 19) <= 1 &&
          Math.abs(pixels[i + 1]! - 227) <= 1 &&
          Math.abs(pixels[i + 2]! - 107) <= 1 &&
          pixels[i + 3] === 255
        ) {
          count++;
          sumX += (i / 4) % canvas.width;
        }
      }
      return { count, x: count ? sumX / count / canvas.width : null };
    } finally {
      readback.width = readback.height = 0;
    }
  });
}

for (const viewport of [PRIMARY_BROWSER_VIEWPORTS[1]]) {
  test(`archived cursor follows camera through preview, reopen and export ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport.size);
    const server = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        apiBehavior: { runtimeFallback: 'typed-success' },
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      const media = await staticCameraSource(page);
      const fixture = sourceFixture(media.byteLength);
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        {
          width: 160,
          height: 90,
          duration: 12.01,
        },
        false,
        false,
        { bytes: media, mimeType: 'video/webm' }
      );
      await page.evaluate(
        async ({ databaseName, fixture }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(
                ['video_projects', 'recording_cursor_trajectories', 'recording_cursor_blocks'],
                'readwrite'
              );
              tx.objectStore('video_projects').put({
                id: fixture.project.id,
                project: fixture.project,
                createdAt: fixture.project.createdAt,
                updatedAt: fixture.project.updatedAt,
              });
              tx.objectStore('recording_cursor_trajectories').put(fixture.head);
              for (const row of fixture.rows)
                tx.objectStore('recording_cursor_blocks').put({
                  ...row,
                  bytes: new Uint8Array(row.bytes),
                });
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
          } finally {
            db.close();
          }
        },
        { databaseName: betaV1Fixture.databaseName, fixture }
      );
      await page.goto(
        `${server.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${fixture.project.id}&theme=light`
      );
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
      await expect(
        page.locator('[data-ui="video-editor.timeline.history-cursor-row"]')
      ).toContainText(/Archived cursor history|История курсора в архиве/);
      await expect.poll(async () => (await paintedCursor(page)).count).toBeGreaterThan(10);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 1).toBeLessThan(0.3);
      await seekProjectTime(page, 11);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 0).toBeGreaterThan(0.7);
      await page.screenshot({
        path: info.outputPath('cursor-trajectory-late.png'),
        fullPage: false,
      });
      await page.reload();
      await expect(
        page.locator('[data-ui="video-editor.timeline.history-cursor-row"]')
      ).toContainText(/Archived cursor history|История курсора в архиве/);
      await seekProjectTime(page, 11);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 0).toBeGreaterThan(0.7);
      const saved = await readNativeVideoProject(page, fixture.project.id);
      expect(saved?.cursorTrack?.samples).toEqual([]);
      expect(saved?.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
      expect(saved?.cursorTrack?.sourceObservations?.[0]?.trajectory?.totalSamples).toBe(6000);
      await page.screenshot({
        path: info.outputPath('cursor-trajectory-reopened.png'),
        fullPage: false,
      });
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
      const category = (key: Parameters<typeof translate>[0]) =>
        page
          .locator('nav')
          .getByRole('button', { name: label(key), exact: true })
          .click();
      await page.locator('[data-ui="video-editor.timeline.playhead-handle"]').press('Home');
      await page.locator('[data-ui="video-editor.timeline.toolbar.add-zoom"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page, fixture.project.id))?.motionRegions?.length
        )
        .toBe(1);
      await category('videoEditor.sidebar.inspectorGroupTiming');
      const duration = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.motionDurationLabel'),
        exact: true,
      });
      await duration.fill('5');
      await duration.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page, fixture.project.id))?.motionRegions?.[0]?.duration
        )
        .toBe(5);
      await category('videoEditor.sidebar.inspectorGroupFraming');
      const cursorChoice = page
        .locator('[data-ui="camera.followTarget"]')
        .getByRole('button', { name: label('editor.scene.cameraFollowCursor'), exact: true });
      await expect(cursorChoice).toBeEnabled();
      await cursorChoice.click();
      const scale = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.motionScaleLabel'),
        exact: true,
      });
      await scale.fill('200');
      await scale.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page, fixture.project.id))?.motionRegions?.[0]?.scale
        )
        .toBe(2);
      await chooseInspectorValue(
        page,
        page.locator('[data-ui="camera.composition"]'),
        label('editor.scene.cameraComposition'),
        label('editor.scene.cameraCompositionOff')
      );
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page, fixture.project.id))?.motionRegions?.[0]?.focusMode
        )
        .toBe('CURSOR');
      const sampleCanvasPoint = async (selector: string, point: { x: number; y: number }) =>
        page.locator(selector).evaluate((canvas: HTMLCanvasElement, point) => {
          const readback = document.createElement('canvas');
          readback.width = canvas.width;
          readback.height = canvas.height;
          try {
            const context = readback.getContext('2d');
            if (!context) throw new Error('Preview point readback is unavailable.');
            context.drawImage(canvas, 0, 0);
            const scale = Math.min(canvas.width / 160, canvas.height / 90);
            const x = (canvas.width - 160 * scale) / 2 + point.x * scale;
            const y = (canvas.height - 90 * scale) / 2 + point.y * scale;
            return Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(
              0,
              3
            );
          } finally {
            readback.width = readback.height = 0;
          }
        }, point);
      const landmark = async (selector = '[data-preview-stage-canvas]') =>
        page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
          const readback = document.createElement('canvas');
          readback.width = canvas.width;
          readback.height = canvas.height;
          try {
            const context = readback.getContext('2d');
            if (!context) throw new Error('Preview landmark readback is unavailable.');
            context.drawImage(canvas, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const factor = Math.min(canvas.width / 160, canvas.height / 90);
            const offsetX = (canvas.width - 160 * factor) / 2;
            const offsetY = (canvas.height - 90 * factor) / 2;
            const runs: { start: number; end: number; y: number }[] = [];
            for (let y = 0; y < 90; y++) {
              const row = Math.round(offsetY + y * factor);
              let start: number | null = null;
              for (let x = 0; x <= 160; x++) {
                const index =
                  (row * canvas.width + Math.round(offsetX + Math.min(x, 159) * factor)) * 4;
                const matchesMarker =
                  x < 160 &&
                  pixels[index]! > 220 &&
                  pixels[index + 1]! < 100 &&
                  pixels[index + 2]! > 140;
                if (matchesMarker && start === null) start = x;
                if (!matchesMarker && start !== null) {
                  runs.push({ start, end: x, y });
                  start = null;
                }
              }
            }
            if (!runs.length) return null;
            const top = Math.min(...runs.map((run) => run.y));
            const bottom = Math.max(...runs.map((run) => run.y)) + 1;
            // Keep the original reference row when it intersects the marker's colored interior.
            const reference = runs.filter((run) => run.y === 75);
            const row = reference.length ? 75 : Math.floor((top + bottom - 1) / 2);
            const widest = runs
              .filter((run) => run.y === row)
              .sort((a, b) => b.end - b.start - (a.end - a.start))[0];
            return widest ? { ...widest, top, bottom } : null;
          } finally {
            readback.width = readback.height = 0;
          }
        });
      await chooseInspectorValue(
        page,
        page.locator('[data-ui="video-editor.framing-preview"]'),
        label('videoEditor.sidebar.framingPreviewLabel'),
        label('videoEditor.sidebar.framingResultView')
      );
      await seekProjectTime(page, 2.5);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 0).toBeGreaterThan(0.45);
      await expect.poll(landmark).not.toBeNull();
      const midpoint = (await landmark())!;
      const miniPoint = { x: midpoint.start + 5, y: midpoint.y };
      const stageColor = await sampleCanvasPoint('[data-preview-stage-canvas]', miniPoint);
      const inspectorFront =
        '[data-ui="video-editor.framing-preview"] canvas[data-preview-inspector-canvas]';
      await expect(page.locator(inspectorFront)).toHaveCount(1);
      await expect(page.locator(inspectorFront)).toBeVisible();
      await writeFile(
        info.outputPath('archive-follow-inspector-pixels.json'),
        JSON.stringify(
          {
            point: miniPoint,
            landmark: { stage: midpoint, inspector: await landmark(inspectorFront) },
            backing: {
              stage: await page
                .locator('[data-preview-stage-canvas]')
                .evaluate((canvas: HTMLCanvasElement) => ({
                  width: canvas.width,
                  height: canvas.height,
                })),
              inspector: await page
                .locator(inspectorFront)
                .evaluate((canvas: HTMLCanvasElement) => ({
                  width: canvas.width,
                  height: canvas.height,
                })),
            },
            center: {
              point: { x: (midpoint.start + midpoint.end) / 2, y: midpoint.y },
              stage: await sampleCanvasPoint('[data-preview-stage-canvas]', {
                x: (midpoint.start + midpoint.end) / 2,
                y: midpoint.y,
              }),
              inspector: await sampleCanvasPoint(inspectorFront, {
                x: (midpoint.start + midpoint.end) / 2,
                y: midpoint.y,
              }),
            },
            stage: stageColor,
            inspector: await sampleCanvasPoint(inspectorFront, miniPoint),
            background: {
              stage: await sampleCanvasPoint('[data-preview-stage-canvas]', { x: 20, y: 20 }),
              inspector: await sampleCanvasPoint(inspectorFront, { x: 20, y: 20 }),
            },
          },
          null,
          2
        )
      );
      await expect
        .poll(async () => {
          const miniColor = await sampleCanvasPoint(inspectorFront, miniPoint);
          return Math.max(...stageColor.map((value, index) => Math.abs(value - miniColor[index]!)));
        })
        .toBeLessThan(4);
      await page.screenshot({
        path: info.outputPath('archive-follow-inspector-result.png'),
        fullPage: false,
      });
      await seekProjectTime(page, 2);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 0).toBeGreaterThan(0.35);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 1).toBeLessThan(0.55);
      await expect.poll(landmark).not.toBeNull();
      const first = (await landmark())!;
      await seekProjectTime(page, 4);
      await expect
        .poll(async () => (await landmark())?.start ?? Infinity)
        .toBeLessThan(first.start - 4);
      const last = (await landmark())!;
      expect(last.end - last.start).toBeGreaterThan(8);
      expect(last.bottom - last.top).toBeGreaterThan(8);
      // Source marker56..64 at2x and recorded cursorY41..49 imply top59..75 and bottom75..91.
      // Three project pixels allow chroma-edge interpolation and rounding; the frame clips at90.
      expect(last.top).toBeGreaterThanOrEqual(58);
      expect(last.top).toBeLessThanOrEqual(78);
      expect(last.bottom).toBeGreaterThanOrEqual(72);
      expect(last.bottom).toBeLessThanOrEqual(90);
      await page.screenshot({
        path: info.outputPath('archive-follow-camera.png'),
        fullPage: false,
      });
      const point = {
        x: Math.round(
          last.start + Math.min((first.start - last.start) / 2, (last.end - last.start) / 2)
        ),
        y: last.y,
      };
      const samplePoint = () => sampleCanvasPoint('[data-preview-stage-canvas]', point);
      const lateColor = await samplePoint();
      await writeFile(
        info.outputPath('archive-camera-landmarks.json'),
        JSON.stringify({ first, last, point, lateColor }, null, 2)
      );
      await seekProjectTime(page, 2);
      await expect
        .poll(async () => {
          const color = await samplePoint();
          return color.reduce((sum, value, i) => sum + Math.abs(value - lateColor[i]!), 0);
        })
        .toBeGreaterThan(80);
      const earlyColor = await samplePoint();
      await page.reload();
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
      const followed = (await readNativeVideoProject(page, fixture.project.id))!;
      expect(followed.motionRegions?.[0]?.focusMode).toBe('CURSOR');
      expect(followed.cursorTrack?.samples).toEqual([]);
      expect(followed.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
      for (const format of ['WEBM', 'MP4'] as const) {
        const encoded = await encodedNativeVideoSamples(
          page,
          server.origin,
          followed,
          format,
          [
            { time: 2, ...point, expected: earlyColor },
            { time: 4, ...point, expected: lateColor },
          ],
          { start: 0, end: 5 }
        );
        await writeFile(
          info.outputPath(`archive-follow-camera-export-${format.toLowerCase()}.json`),
          JSON.stringify({ first, last, point, earlyColor, lateColor, encoded }, null, 2)
        );
        expect(encoded.samples).toHaveLength(2);
        for (const pixel of encoded.samples) expect(pixel.error).toBeLessThan(12);
      }
      await page.evaluate(
        async ({ databaseName, recordingId, trajectoryId }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const transaction = db.transaction('recording_cursor_trajectories', 'readwrite');
              transaction
                .objectStore('recording_cursor_trajectories')
                .delete([recordingId, trajectoryId]);
              transaction.oncomplete = () => resolve();
              transaction.onabort = () => reject(transaction.error);
            });
          } finally {
            db.close();
          }
        },
        {
          databaseName: betaV1Fixture.databaseName,
          recordingId: fixture.head.recordingId,
          trajectoryId: fixture.head.trajectoryId,
        }
      );
      await page.goto(
        `${server.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${fixture.project.id}&theme=light`
      );
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
      await page
        .locator(`[data-timeline-effect-segment="${followed.motionRegions![0]!.id}"]`)
        .getByRole('button', {
          name: label('videoEditor.timeline.motionSegment') + ' · 2.00x',
          exact: true,
        })
        .click();
      await category('videoEditor.sidebar.inspectorGroupFraming');
      await expect(cursorChoice).toBeDisabled();
      const unavailable = (await readNativeVideoProject(page, fixture.project.id))!;
      expect(unavailable.motionRegions?.[0]?.focusMode).toBe('CURSOR');
      expect(unavailable.cursorTrack?.samples).toEqual([]);
      expect(unavailable.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
      await expect
        .poll(
          async () => {
            const color = await sampleCanvasPoint('[data-preview-stage-canvas]', { x: 20, y: 20 });
            return color[0]! > 10 && color[1]! > 15 && color[2]! > 40;
          },
          { message: 'Missing cursor history must preserve the valid source video.' }
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('archive-unavailable-follow.png'),
        fullPage: false,
      });
    } finally {
      await page.close();
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Quick Edit reads archived history and late cursor keys after reopen ${viewport.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport.size);
    const server = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        apiBehavior: { runtimeFallback: 'typed-success' },
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      const media = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const cursor = sourceFixture(media.byteLength),
        events = await eventSourceFixture();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12.01 },
        false,
        false,
        undefined,
        undefined,
        { modeChoice: 'advanced' }
      );
      await page.evaluate(
        async ({ databaseName, cursor, events }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(
                [
                  'recording_telemetry',
                  'recording_cursor_trajectories',
                  'recording_cursor_blocks',
                  'recording_events',
                ],
                'readwrite'
              );
              tx.objectStore('recording_cursor_trajectories').put(cursor.head);
              for (const row of cursor.rows)
                tx.objectStore('recording_cursor_blocks').put({
                  ...row,
                  bytes: new Uint8Array(row.bytes),
                });
              tx.objectStore('recording_events').put(events.head);
              for (const row of events.blocks)
                tx.objectStore('recording_events').put({
                  ...row,
                  bytes: new Uint8Array(row.bytes),
                });
              for (const fact of events.facts) tx.objectStore('recording_events').put(fact);
              tx.objectStore('recording_telemetry').put({
                recordingId: cursor.head.recordingId,
                createdAt: 1,
                updatedAt: 1,
                captureMode: null,
                viewport: null,
                actionEvents: [],
                signals: [],
                cursorTrack: {
                  captureMode: 'separate',
                  skin: cursor.project.cursorTrack!.skin,
                  samples: [],
                },
                cursorTrajectory: cursor.project.cursorTrack!.sourceObservations![0]!.trajectory,
                recordingEvents: events.descriptor,
              });
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
          } finally {
            db.close();
          }
        },
        { databaseName: betaV1Fixture.databaseName, cursor, events }
      );
      const open = async () => {
        await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=light`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await page
          .locator('[data-gallery-keyboard-id="recording:beta-v1-recording"]')
          .getByRole('button', { name: 'beta-v1.webm', exact: true })
          .first()
          .click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        await expect(page.locator('[data-ui="gallery.videoReview.timePlane"]')).toBeVisible();
        await expect(
          page.locator('[data-ui="gallery.videoReview.archivedCursorHistory"]')
        ).toHaveText('Archived cursor history');
        await expect(
          page.getByText('Recording history is incomplete', { exact: true })
        ).toBeVisible();
      };
      await open();
      const dialog = page.locator('dialog');
      await dialog
        .locator('[data-review-header-track="actions"] [data-review-track-select]')
        .click();
      await expect(dialog.locator('[title="Ctrl+S"]').first()).toBeVisible();
      const late = async () => {
        const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
        await plane.focus();
        await page.keyboard.press('End');
        await expect
          .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
          .toBeGreaterThan(10);
        await expect(
          page.getByText('Recording history is incomplete', { exact: true })
        ).toBeVisible();
        const row = page.locator('[data-ui="cursorFocusPath.timelineKeys"]').getByRole('button', {
          name: translate('videoEditor.sidebar.cursorFocusPathTitle', 'en'),
          exact: true,
        });
        const bounds = await row.boundingBox();
        if (!bounds) throw new Error('Cursor history row is unavailable.');
        const duration = Number(await plane.getAttribute('aria-valuemax'));
        await row.click({ position: { x: (bounds.width * 11) / duration, y: 8 } });
        const selectedTimelineKey = page.locator(
          '[data-ui="cursorFocusPath.timelineKeys"] [data-cursor-focus-key][aria-pressed="true"]'
        );
        const overlay = page.locator('[data-ui="cursorFocusPath.overlay"]');
        const selectedOverlayKey = overlay.locator('[data-cursor-focus-key][aria-pressed="true"]');
        await expect(selectedTimelineKey).toHaveCount(1);
        await expect(overlay).toBeVisible();
        await expect(selectedOverlayKey).toHaveCount(1);
        const selectedId = await selectedTimelineKey.getAttribute('data-cursor-focus-key');
        expect(selectedId).toBeTruthy();
        if (!selectedId) throw new Error('Selected cursor key identity is unavailable.');
        await expect(selectedOverlayKey).toHaveAttribute('data-cursor-focus-key', selectedId);
        await expect
          .poll(() =>
            overlay.evaluate(
              (svg) =>
                Math.max(
                  ...[...svg.querySelectorAll('circle')].map((circle) =>
                    Number(circle.getAttribute('cx'))
                  )
                ) / Number(svg.getAttribute('viewBox')!.split(' ')[2])
            )
          )
          .toBeGreaterThan(0.7);
      };
      await late();
      await page.screenshot({ path: info.outputPath('quick-history-late.png'), fullPage: false });
      const workspace = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
      expect(JSON.stringify(workspace)).not.toContain('observationSeq');
      expect(JSON.stringify(workspace)).not.toContain('keyboard-repeat-block');
      await open();
      await late();
      await page.screenshot({
        path: info.outputPath('quick-history-reopened.png'),
        fullPage: false,
      });
    } finally {
      await page.close();
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
