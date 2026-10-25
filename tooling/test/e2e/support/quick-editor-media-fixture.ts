import { readNativeReviewWorkspace } from './native-review-workspace';
import { expect, type Page, type Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { readFile } from 'node:fs/promises';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedVideoPacketSource,
  EncodedPacketSink,
  Input,
  Output,
  WebMOutputFormat,
} from 'mediabunny';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';

/** The immutable fixture writer needs page evaluation, never a browser or worker attachment. */
export interface ReviewMediaFixtureWriter {
  evaluate<Arg>(writer: (argument: Arg) => Promise<void>, argument: Arg): Promise<void>;
  locator?: Page['locator'];
  addLocatorHandler?: Page['addLocatorHandler'];
}

const modeChoicePages = new WeakSet<
  Pick<ReviewMediaFixtureWriter, 'locator' | 'addLocatorHandler'>
>();

export async function installReviewModeChoice(
  page: Pick<ReviewMediaFixtureWriter, 'locator' | 'addLocatorHandler'>,
  mode: 'basic' | 'advanced' = 'basic'
) {
  if (!page.locator || !page.addLocatorHandler || modeChoicePages.has(page)) return;
  const choice = page.locator(`[data-ui="gallery.videoReview.modeChoice.${mode}"]`);
  await page.addLocatorHandler(
    page.locator('[data-ui="gallery.videoReview.modeChoice"]'),
    async () => {
      await choice.click();
    }
  );
  modeChoicePages.add(page);
}

export async function seedReviewVideo(
  page: ReviewMediaFixtureWriter,
  filename: string,
  dimensions: { width: number; height: number; duration: number },
  gaps = false,
  history = false,
  source?: { bytes: Uint8Array; mimeType: 'video/webm' | 'video/mp4' },
  recordingPoint?: { x: number; y: number },
  options: { modeChoice?: 'basic' | 'advanced' | 'manual' } = {}
) {
  if (options.modeChoice !== 'manual') await installReviewModeChoice(page, options.modeChoice);
  let bytes = source
    ? Buffer.from(source.bytes)
    : await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
  if (gaps) bytes = await withAudioGaps(bytes);
  await page.evaluate(
    async ({ fixture, encoded, dimensions, mimeType, history, recordingPoint }) => {
      const body = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-assets', { create: true });
      const objects = await directory.getDirectoryHandle('objects', { create: true });
      const file = await objects.getFileHandle('beta-v1-recording-asset', { create: true });
      const writer = await file.createWritable();
      await writer.write(body);
      await writer.close();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction(
        ['recordings', 'media_library', 'asset_refs', 'asset_owners', 'recording_telemetry'],
        'readwrite'
      );
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      transaction
        .objectStore('recordings')
        .put({ ...fixture.records.recordings[0], size: body.length, mimeType });
      transaction.objectStore('media_library').put({
        ...fixture.records.media_library[0],
        size: body.length,
        mimeType,
        ...dimensions,
      });
      transaction
        .objectStore('asset_refs')
        .put({ ...fixture.records.asset_refs[0], size: body.length, mimeType });
      transaction.objectStore('asset_owners').put(fixture.records.asset_owners[0]);
      if (history)
        transaction.objectStore('recording_telemetry').put({
          recordingId: fixture.records.recordings[0].id,
          captureMode: 'TAB',
          createdAt: 1,
          updatedAt: 1,
          viewport: null,
          cursorTrack: null,
          signals: [],
          actionEvents: [
            {
              id: 'click-1',
              kind: 'CLICK',
              time: 1,
              duration: 0.2,
              point: recordingPoint
                ? {
                    x: recordingPoint.x * dimensions.width,
                    y: recordingPoint.y * dimensions.height,
                  }
                : { x: 40, y: 30 },
              recordingPoint: recordingPoint ?? { x: 0.25, y: 0.33 },
              label: '',
              data: {},
              preset: 'NONE',
            },
          ],
        });
      await done;
      db.close();
    },
    {
      fixture: betaV1Fixture,
      encoded: bytes.toString('base64'),
      dimensions,
      history,
      recordingPoint,
      mimeType: source?.mimeType ?? (filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm'),
    }
  );
}

/** Linked immutable recording bodies exercise first camera acquisition, not a prefilled project. */
export async function seedReviewWebcamBundle(
  page: Page,
  cameraFilename = 'review-webcam-clock.webm'
) {
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  const bytes = await readFile(new URL(`../fixtures/${cameraFilename}`, import.meta.url));
  await page.evaluate(
    async ({ fixture, encoded }) => {
      const body = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
      const writer = await (
        await objects.getFileHandle('webcam-clock-asset', { create: true })
      ).createWritable();
      await writer.write(body);
      await writer.close();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction(
        ['recordings', 'media_library', 'asset_refs', 'asset_owners'],
        'readwrite'
      );
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      for (const store of ['recordings', 'media_library']) {
        const request = transaction
          .objectStore(store)
          .get(store === 'recordings' ? 'beta-v1-recording' : 'recording:beta-v1-recording');
        request.onsuccess = () =>
          transaction.objectStore(store).put({
            ...request.result,
            recordingGroup: {
              groupId: 'webcam-proof',
              role: 'display',
              order: 0,
              sourceLabel: 'Screen',
            },
          });
      }
      const recordingGroup = {
        groupId: 'webcam-proof',
        role: 'webcam',
        order: 1,
        sourceLabel: 'Camera clock',
      };
      transaction.objectStore('recordings').put({
        ...fixture.records.recordings[0],
        id: 'webcam-clock',
        assetId: 'webcam-clock-asset',
        filename: 'camera-clock.webm',
        size: body.length,
        recordingGroup,
      });
      transaction.objectStore('media_library').put({
        ...fixture.records.media_library[0],
        id: 'recording:webcam-clock',
        filename: 'camera-clock.webm',
        originalFilename: 'camera-clock.webm',
        source: { kind: 'recording', recordingId: 'webcam-clock' },
        recordingGroup,
        width: 160,
        height: 90,
        duration: 12,
        size: body.length,
      });
      transaction.objectStore('asset_refs').put({
        ...fixture.records.asset_refs[0],
        assetId: 'webcam-clock-asset',
        location: { kind: 'opfs', objectKey: 'objects/webcam-clock-asset' },
        size: body.length,
      });
      transaction.objectStore('asset_owners').put({
        ...fixture.records.asset_owners[0],
        assetId: 'webcam-clock-asset',
        ownerId: 'webcam-clock',
      });
      await done;
      db.close();
    },
    { fixture: betaV1Fixture, encoded: bytes.toString('base64') }
  );
}

async function withAudioGaps(bytes: Uint8Array) {
  const input = new Input({
    source: new BlobSource(new Blob([Uint8Array.from(bytes)])),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const video = new EncodedVideoPacketSource('vp8');
  const audio = new EncodedAudioPacketSource('opus');
  output.addVideoTrack(video);
  output.addAudioTrack(audio);
  try {
    const v = (await input.getPrimaryVideoTrack())!;
    const a = (await input.getPrimaryAudioTrack())!;
    const vc = (await v.getDecoderConfig())!;
    const ac = (await a.getDecoderConfig())!;
    await output.start();
    for await (const packet of new EncodedPacketSink(v).packets())
      await video.add(packet, { decoderConfig: vc });
    for await (const packet of new EncodedPacketSink(a).packets()) {
      const timestamp = packet.timestamp + 1;
      if (timestamp >= 12 || (timestamp >= 8 && timestamp < 9)) continue;
      await audio.add(packet.clone({ timestamp }), { decoderConfig: ac });
    }
    video.close();
    audio.close();
    await output.finalize();
    return Buffer.from(target.buffer!);
  } finally {
    input.dispose();
  }
}

export async function persistedFocus(page: Page) {
  const workspace = await readNativeReviewWorkspace(
    page,
    `recording:${betaV1Fixture.records.recordings[0].id}`
  );
  const latest = workspace?.history
    .slice(0, workspace.cursor)
    .findLast((operation) => operation.target === 'advancedContent');
  return latest?.target === 'advancedContent' ? latest.after.zoom.regions.at(-1) : undefined;
}

/** Opens the export section before invoking its chosen destination. */
export async function clickReviewExport(
  button: (key: Parameters<typeof translate>[0]) => Locator,
  destination: 'gallery.videoReview.exportVideo' | 'gallery.videoReview.downloadVideo'
) {
  const opener = button('gallery.videoReview.exportSection');
  await opener.and(opener.page().locator('[data-ui="gallery.videoReview.openExport"]')).click();
  await button(destination).click();
}

/** Verifies selected timeline content retains a thin border and a visible surface. */
export async function expectTimelineSelection(item: Locator, paint: Locator = item) {
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await expect(paint).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(paint).toHaveCSS('border-top-width', '1px');
  await expect
    .poll(() =>
      paint.evaluate((node) => {
        const style = getComputedStyle(node);
        return style.borderTopColor === style.color;
      })
    )
    .toBe(true);
}

/** Reads durable recording rows in the seeded native gallery database. */
export async function recordingCount(page: Page) {
  return page.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('recordings').objectStore('recordings').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, betaV1Fixture.databaseName);
}

/** Decode retained PCM recordings through the real immutable OPFS objects after reopening. */
export async function recordedAudioResources(page: Page, excludedKeys: string[] = []) {
  return page.evaluate(async (excluded) => {
    let objects: FileSystemDirectoryHandle;
    try {
      objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return [];
      throw error;
    }
    const result: Array<{ key: string; duration: number; samples: number; peak: number }> = [];
    const context = new AudioContext();
    try {
      for await (const [name, handle] of objects.entries()) {
        if (handle.kind !== 'file' || excluded.includes(name)) continue;
        const bytes = await (await (await objects.getFileHandle(name)).getFile()).arrayBuffer();
        if (new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF') continue;
        const decoded = await context.decodeAudioData(bytes);
        let peak = 0;
        for (const sample of decoded.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
        result.push({ key: name, duration: decoded.duration, samples: decoded.length, peak });
      }
      return result;
    } finally {
      await context.close();
    }
  }, excludedKeys);
}

/** Create focus through its supported toolbar and ruler interval, including occupied lanes. */
export async function addReviewFocus(page: Page) {
  const dialog = page.locator('dialog');
  await dialog.locator('[data-review-header-track="zoom"] [data-review-track-select]').click();
  const tool = dialog.locator(
    '[data-ui="gallery.videoReview.editingTools"] button:has(svg.lucide-focus)'
  );
  const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  const start = Number(await plane.getAttribute('aria-valuenow'));
  const end = Math.min(duration, start + 2);
  const before = await dialog.locator('[data-zoom-edge="start"]').count();
  const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
  await ruler.scrollIntoViewIfNeeded();
  const box = (await ruler.boundingBox())!;
  const x = (time: number) => box.x + (box.width * time) / duration;
  await page.mouse.move(x(start) + 0.1, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(x(end), box.y + 15, { steps: 8 });
  await page.mouse.up();
  await tool.click();
  await expect(dialog.locator('[data-zoom-edge="start"]')).toHaveCount(before + 1);
  await dialog.locator('[data-ui="gallery.videoReview.loopSummary"] button').click();
  if ((await tool.getAttribute('aria-pressed')) === 'true') await tool.click();
}

export async function seedReviewHistory(
  page: Page,
  detailed = false,
  clickCount = 6,
  timeStep = 0.01
) {
  await page.evaluate(
    async ({ fixture, detailed, clickCount, timeStep }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction('recording_telemetry', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      transaction.objectStore('recording_telemetry').put({
        recordingId: fixture.records.recordings[0].id,
        captureMode: 'TAB',
        createdAt: 1,
        updatedAt: 1,
        viewport: null,
        cursorTrack: null,
        signals: [
          ...[
            [0.13, 3.27],
            [3.27, 6.41],
          ].map(([startTime, endTime], index) => ({
            id: `idle-${index}`,
            kind: 'cursor-idle',
            startTime,
            endTime,
            point: null,
            data: {},
          })),
          ...(detailed
            ? [
                {
                  id: 'static',
                  kind: 'static-frame',
                  startTime: 7,
                  endTime: 9,
                  point: null,
                  data: {},
                },
                {
                  id: 'typing',
                  kind: 'typing',
                  startTime: 6.5,
                  endTime: 12.01,
                  point: null,
                  data: { targetName: 'Search field' },
                },
              ]
            : []),
        ],
        actionEvents: Array.from({ length: clickCount }, (_, index) => ({
          id: `click-${index}`,
          kind: 'CLICK',
          time: 1 + index * timeStep,
          duration: 0,
          point: { x: 40, y: 30 },
          recordingPoint: { x: 0.25, y: 0.33 },
          label: detailed ? 'Save recording' : '',
          data: {},
          preset: 'NONE',
        })),
      });
      await done;
      db.close();
    },
    { fixture: betaV1Fixture, detailed, clickCount, timeStep }
  );
}

export async function expectAnimatedReviewHistory(page: Page, count: number) {
  const strip = page.locator('[data-ui="gallery.videoReview.historyStrip"]');
  await expect(strip.locator('button[data-animated="true"]').first()).toBeVisible();
  const buttons = strip.locator('button[data-animated="true"]');
  expect(await buttons.count()).toBeLessThanOrEqual(3);
  let represented = 0;
  for (const button of await buttons.all()) {
    const grouped = await button.evaluate((node) =>
      Boolean(node.closest('[data-ui="gallery.videoReview.historyCluster"]'))
    );
    if (grouped) {
      await button.click();
      const options = page.getByRole('listbox').getByRole('option');
      await expect(options.first()).toBeVisible();
      represented += await options.count();
      await page.keyboard.press('Escape');
    } else represented++;
  }
  expect(represented).toBe(count);
}
