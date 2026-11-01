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

async function seekLate(page: Page) {
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
      x: first.x - bounds.x + ((11 - first.time) * (next.x - first.x)) / (next.time - first.time),
      y: 8,
    },
  });
  // Pointer seeking can land between frames. One project frame is sufficient for this source-range proof.
  await expect
    .poll(async () => {
      const text = await page.locator('[data-playback-counter="true"]').textContent();
      const match = /^(\d+):(\d+\.\d+|\d+)/.exec(text?.trim() ?? '');
      return match ? Math.abs(Number(match[1]) * 60 + Number(match[2]) - 11) : Infinity;
    })
    .toBeLessThanOrEqual(1 / 30 + 0.001);
}

async function paintedCursor(page: Page) {
  return page.locator('[data-preview-stage-canvas]').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing preview raster.');
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
  });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`block cursor beyond 4096 observations survives seek and reopen ${viewport.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport.size);
    const server = await startHostServer();
    const media = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
    const fixture = sourceFixture(media.byteLength);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        apiBehavior: { runtimeFallback: 'typed-success' },
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
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
      await seekLate(page);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 0).toBeGreaterThan(0.7);
      await page.screenshot({
        path: info.outputPath('cursor-trajectory-late.png'),
        fullPage: false,
      });
      await page.reload();
      await expect(
        page.locator('[data-ui="video-editor.timeline.history-cursor-row"]')
      ).toContainText(/Archived cursor history|История курсора в архиве/);
      await seekLate(page);
      await expect.poll(async () => (await paintedCursor(page)).x ?? 0).toBeGreaterThan(0.7);
      const saved = await readNativeVideoProject(page, fixture.project.id);
      expect(saved?.cursorTrack?.samples).toEqual([]);
      expect(saved?.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
      expect(saved?.cursorTrack?.sourceObservations?.[0]?.trajectory?.totalSamples).toBe(6000);
      await page.screenshot({
        path: info.outputPath('cursor-trajectory-reopened.png'),
        fullPage: false,
      });
    } finally {
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
        .getByRole('button', {
          name: translate('gallery.videoReview.historyOpen', 'en'),
          exact: true,
        })
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
        await expect(page.locator('[data-cursor-focus-key][aria-pressed="true"]')).toHaveCount(1);
        const overlay = page.locator('[data-ui="cursorFocusPath.overlay"]');
        await expect(overlay).toBeVisible();
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
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
