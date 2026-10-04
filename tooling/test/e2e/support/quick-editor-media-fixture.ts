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
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';

export async function seedReviewVideo(
  page: Page,
  filename: string,
  dimensions: { width: number; height: number; duration: number },
  gaps = false,
  history = false
) {
  let bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
  if (gaps) bytes = await withAudioGaps(bytes);
  await page.evaluate(
    async ({ fixture, encoded, dimensions, mimeType, history }) => {
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
              point: { x: 40, y: 30 },
              recordingPoint: { x: 0.25, y: 0.33 },
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
      mimeType: filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    }
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
  const raw = await page.evaluate(
    async ({ databaseName, aggregateId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = db
            .transaction('video_workspaces')
            .objectStore('video_workspaces')
            .get(aggregateId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    {
      databaseName: betaV1Fixture.databaseName,
      aggregateId: `recording:${betaV1Fixture.records.recordings[0].id}`,
    }
  );
  const workspace = parseVideoWorkspace(raw);
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
