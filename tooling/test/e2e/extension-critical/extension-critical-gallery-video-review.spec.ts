import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
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
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function seedReviewVideo(
  page: Page,
  filename: string,
  dimensions: { width: number; height: number; duration: number },
  gaps = false
) {
  let bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
  if (gaps) bytes = await withAudioGaps(bytes);
  await page.evaluate(
    async ({ fixture, encoded, dimensions, mimeType }) => {
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
        ['recordings', 'media_library', 'asset_refs', 'asset_owners'],
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
      await done;
      db.close();
    },
    {
      fixture: betaV1Fixture,
      encoded: bytes.toString('base64'),
      dimensions,
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

async function timelineGesture(page: Page, start: number, end?: number) {
  const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
  const box = (await plane.boundingBox())!;
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  const x = (time: number) => box.x + (box.width * time) / duration;
  await page.mouse.move(x(start), box.y + 12);
  if (end === undefined) await page.mouse.click(x(start), box.y + 12);
  else {
    await page.mouse.down();
    await page.mouse.move(x(end), box.y + 12, { steps: 8 });
    await page.mouse.up();
  }
}

async function drawReviewRegion(page: Page) {
  const stage = page.locator('[data-ui="gallery.videoReview.stage"]');
  const box = (await stage.boundingBox())!;
  const dimensions = await stage.locator('video').evaluate((video: HTMLVideoElement) => ({
    width: video.videoWidth,
    height: video.videoHeight,
  }));
  const scale = Math.min(box.width / dimensions.width, box.height / dimensions.height);
  const width = dimensions.width * scale,
    height = dimensions.height * scale;
  const x = box.x + (box.width - width) / 2,
    y = box.y + (box.height - height) / 2;
  await page.mouse.move(x + width * 0.2, y + height * 0.2);
  await page.mouse.down();
  await page.mouse.move(x + width * 0.6, y + height * 0.6, { steps: 6 });
  await page.mouse.up();
}

async function recordingCount(page: Page) {
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

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`gallery direct manipulation, comment editing, regions and keyboard (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog'),
        video = dialog.locator('video');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
      await expect(dialog.locator('input[type="number"]')).toHaveCount(0);
      await expect(button('gallery.videoReview.point')).toHaveCount(0);
      await expect(
        dialog.getByText(label('gallery.videoReview.telemetryUnavailable'), { exact: true })
      ).toHaveCount(0);
      await timelineGesture(page, 2.5);
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeCloseTo(2.5, 1);
      await button('gallery.videoReview.addComment').click();
      const field = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.commentText'),
        exact: true,
      });
      await expect(field).toBeFocused();
      await field.fill('Recovered unfinished comment');
      await expect
        .poll(() =>
          page.evaluate(async (databaseName) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open(databaseName);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              return await new Promise<boolean>((resolve, reject) => {
                const request = db
                  .transaction('video_workspace_drafts')
                  .objectStore('video_workspace_drafts')
                  .getAll();
                request.onsuccess = () => {
                  const rows: unknown = request.result;
                  resolve(
                    Array.isArray(rows) &&
                      rows.some(
                        (row: unknown) =>
                          row !== null &&
                          typeof row === 'object' &&
                          'annotation' in row &&
                          row.annotation !== null &&
                          typeof row.annotation === 'object' &&
                          'text' in row.annotation &&
                          row.annotation.text === 'Recovered unfinished comment'
                      )
                  );
                };
                request.onerror = () => reject(request.error);
              });
            } finally {
              db.close();
            }
          }, betaV1Fixture.databaseName)
        )
        .toBe(true);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(field).toHaveValue('Recovered unfinished comment');
      await expect(button('gallery.videoReview.undo')).toBeDisabled();
      await field.fill('Original comment');
      await page.keyboard.press('Space');
      await expect(video).toHaveJSProperty('paused', true);
      await drawReviewRegion(page);
      await expect(dialog.locator('[data-region-corner="se"]')).toBeVisible();
      const corner = (await dialog.locator('[data-region-corner="se"]').boundingBox())!;
      await page.mouse.move(corner.x + 3, corner.y + 3);
      await page.mouse.down();
      await page.mouse.move(corner.x + 24, corner.y + 14, { steps: 4 });
      await page.mouse.up();
      await button('gallery.videoReview.save').click();
      await expect(
        dialog.locator('ol').getByText('Original comment', { exact: false })
      ).toBeVisible();
      await button('gallery.videoReview.editComment').click();
      await expect(field).toBeFocused();
      await expect(field).toHaveValue('Original comment ');
      await field.fill('Edited comment');
      await button('gallery.videoReview.save').click();
      await expect(dialog.locator('ol').getByText('Edited comment', { exact: true })).toBeVisible();
      await button('gallery.videoReview.deleteComment').click();
      await expect(dialog.locator('ol').getByText('Edited comment', { exact: true })).toHaveCount(
        0
      );
      await page.keyboard.press('Control+z');
      await expect(dialog.locator('ol').getByText('Edited comment', { exact: true })).toBeVisible();
      await timelineGesture(page, 1, 4);
      await expect(button('gallery.videoReview.commentRange')).toBeVisible();
      await timelineGesture(page, 7);
      await expect(button('gallery.videoReview.addComment')).toBeVisible();
      await timelineGesture(page, 1, 4);
      await button('gallery.videoReview.commentRange').click();
      await field.fill('Interval with region');
      await drawReviewRegion(page);
      await button('gallery.videoReview.save').click();
      await expect(
        dialog.locator('ol').getByText('Interval with region', { exact: true })
      ).toBeVisible();
      await button('gallery.videoReview.fit').click();
      await page.keyboard.press('Space');
      await expect(video).toHaveJSProperty('paused', false);
      await page.keyboard.press('Space');
      await expect(video).toHaveJSProperty('paused', true);
      await video.evaluate((node: HTMLVideoElement) => {
        node.currentTime = node.duration;
      });
      await expect(video).toHaveJSProperty('ended', true);
      await page.keyboard.press('Space');
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeLessThan(1);
      await page.keyboard.press('Space');
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      await expect
        .poll(() => viewport.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeLessThanOrEqual(1);
      await page.setViewportSize({ width: 1000, height: 720 });
      await expect
        .poll(() => viewport.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeLessThanOrEqual(1);
      await page.evaluate(
        (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
        variant.theme
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
      await dialog.screenshot({ path: testInfo.outputPath(`review-${variant.theme}.png`) });
      const reportDownload = page.waitForEvent('download');
      await button('gallery.videoReview.downloadReport').click();
      const report = await readFile(await (await reportDownload).path(), 'utf8');
      expect(report).toContain('Interval with region');
      expect(report).toContain('"region"');
      await button('gallery.videoReview.back').click();
      await expect(page.locator('[data-ui="gallery.preview.surface"] video')).toHaveJSProperty(
        'controls',
        true
      );
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(
        dialog.locator('ol').getByText('Interval with region', { exact: true })
      ).toBeVisible();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('gallery scissors drag, resize and undo preserve original media and independent downloads', async ({
  page,
}, testInfo) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
    await timelineGesture(page, 1.4);
    const priorTime = await dialog
      .locator('video')
      .evaluate((video: HTMLVideoElement) => video.currentTime);
    expect(priorTime).toBeCloseTo(1.4, 1);
    await button('gallery.videoReview.cutMode').click();
    const initialPlane = (await dialog
      .locator('[data-ui="gallery.videoReview.timePlane"]')
      .boundingBox())!;
    await page.mouse.move(initialPlane.x + initialPlane.width * 0.17, initialPlane.y + 10);
    await page.mouse.down();
    await page.mouse.move(initialPlane.x + initialPlane.width * 0.34, initialPlane.y + 10);
    await page.keyboard.press('Escape');
    await page.mouse.move(initialPlane.x + initialPlane.width * 0.5, initialPlane.y + 10);
    await page.mouse.up();
    await expect
      .poll(() => dialog.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeCloseTo(priorTime, 3);
    await expect(dialog.getByRole('button', { name: /^Cut \d/ })).toHaveCount(0);
    await expect(button('gallery.videoReview.undo')).toBeDisabled();
    await timelineGesture(page, 2.1, 4.1);
    const cut = dialog.getByRole('button', { name: 'Cut 2.0 – 4.0', exact: true });
    await expect(cut).toBeVisible();
    const handle = dialog.getByRole('button', {
      name: label('gallery.videoReview.resizeEnd'),
      exact: true,
    });
    const h = (await handle.boundingBox())!;
    const plane = (await dialog
      .locator('[data-ui="gallery.videoReview.timePlane"]')
      .boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(plane.x + (plane.width * 6) / 12.008, h.y + h.height / 2, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(cut).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cut 2.0 – 6.0', exact: true })).toHaveCount(0);
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(plane.x + (plane.width * 6) / 12.008, h.y + h.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(dialog.getByRole('button', { name: 'Cut 2.0 – 6.0', exact: true })).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(cut).toBeVisible();
    const downloading = page.waitForEvent('download');
    await button('gallery.videoReview.downloadVideo').click();
    const download = await downloading;
    await download.saveAs(testInfo.outputPath('download-only.webm'));
    expect(await recordingCount(page)).toBe(1);
    await button('gallery.videoReview.exportVideo').click();
    await expect.poll(() => recordingCount(page)).toBe(2);
    await dialog.screenshot({ path: testInfo.outputPath('direct-cut.png') });
    const originalHash = await page.evaluate(async () => {
      const directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-assets');
      const file = await (
        await (
          await directory.getDirectoryHandle('objects')
        ).getFileHandle('beta-v1-recording-asset')
      ).getFile();
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, '0')
      ).join('');
    });
    expect(originalHash).toBe(
      createHash('sha256')
        .update(await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url)))
        .digest('hex')
    );
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await expect(cut).toBeVisible();
    await button('gallery.videoReview.redo').click();
    await expect(dialog.getByRole('button', { name: 'Cut 2.0 – 6.0', exact: true })).toBeVisible();
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const { container, gaps } of [
  { container: 'webm', gaps: false },
  { container: 'mp4', gaps: false },
  { container: 'webm', gaps: true },
]) {
  for (const rate of [1.25, 1.5, 2, 4]) {
    for (const audio of ['speed', 'mute']) {
      if (gaps && (rate !== 2 || audio !== 'speed')) continue;
      test(`gallery exports ${rate}x with ${audio} audio and durable provenance (${container}${gaps ? ' gaps' : ''})`, async ({
        page,
      }, testInfo) => {
        const host = await startHostServer();
        const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
        try {
          await applyHarnessBootstrap(page, {
            preserveMediaLibrary: true,
            storage: { 'sniptale-locale-preference': 'en' },
          });
          await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
          await page.locator('[data-ui="gallery.page.root"]').waitFor();
          await seedReviewVideo(
            page,
            container === 'mp4' ? 'review-avc-aac.mp4' : 'review-vp8-opus.webm',
            {
              width: 160,
              height: 90,
              duration: 12,
            },
            gaps
          );
          await page.reload();
          await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
          await page.locator('[data-ui="gallery.videoReview.enter"]').click();
          const dialog = page.locator('dialog');
          const button = (key: Parameters<typeof translate>[0]) =>
            dialog.getByRole('button', { name: label(key), exact: true });
          await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
          await button('gallery.videoReview.cutMode').click();
          await timelineGesture(page, 2, 4);
          await button('gallery.videoReview.speedMode').click();
          await dialog
            .getByRole('combobox', { name: label('gallery.videoReview.speedRate'), exact: true })
            .selectOption(String(rate));
          await dialog
            .getByRole('combobox', { name: label('gallery.videoReview.speedAudio'), exact: true })
            .selectOption(audio);
          await timelineGesture(page, 6, 10);
          const speed = dialog.getByRole('button', {
            name: `Speed ${rate}× 6.0 – 10.0`,
            exact: true,
          });
          await expect(speed).toBeVisible();
          await speed.click();
          await button('gallery.videoReview.play').click();
          await expect(dialog.locator('video')).toHaveJSProperty('playbackRate', rate);
          await expect(dialog.locator('video')).toHaveJSProperty('muted', audio === 'mute');
          await button('gallery.videoReview.pause').click();
          await button('gallery.videoReview.exportVideo').click();
          await expect.poll(() => recordingCount(page)).toBe(2);
          const downloading = page.waitForEvent('download');
          await button('gallery.videoReview.downloadVideo').click();
          const download = await downloading;
          await download.saveAs(testInfo.outputPath(`speed.${container}`));
          const bytes = await readFile(await download.path());
          const measured = await page.evaluate(
            async ({ encoded, rate }) => {
              const data = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
              const context = new AudioContext({ sampleRate: 48_000 });
              try {
                const buffer = await context.decodeAudioData(data.buffer);
                const channel = buffer.getChannelData(0);
                const measure = (time: number) => {
                  const start = Math.round(time * buffer.sampleRate);
                  const end = start + Math.round(0.2 * buffer.sampleRate);
                  let crossings = 0;
                  let sum = 0;
                  for (let index = start; index < end; index++) {
                    const value = channel[index] ?? 0;
                    sum += value * value;
                    if (index > start && (channel[index - 1] ?? 0) <= 0 && value > 0) crossings++;
                  }
                  return { frequency: crossings / 0.2, rms: Math.sqrt(sum / (end - start)) };
                };
                return {
                  duration: buffer.duration,
                  origin: measure(0.3),
                  gap: measure(4 + 2.3 / rate),
                  before: measure(1.5),
                  during: measure(4 + 1 / rate),
                  after: measure(4 + 4 / rate + 0.5),
                };
              } finally {
                await context.close();
              }
            },
            { encoded: bytes.toString('base64'), rate }
          );
          const sourceDuration = Number(
            await dialog
              .locator('[data-ui="gallery.videoReview.timePlane"]')
              .getAttribute('aria-valuemax')
          );
          expect(Math.abs(measured.duration - (sourceDuration - 6 + 4 / rate))).toBeLessThan(0.03);
          expect(Math.abs(measured.before.frequency - 440)).toBeLessThan(15);
          expect(Math.abs(measured.after.frequency - 440)).toBeLessThan(15);
          if (gaps) {
            expect(measured.origin.rms).toBeLessThan(0.001);
            expect(measured.gap.rms).toBeLessThan(0.001);
          }
          if (audio === 'mute') expect(measured.during.rms).toBeLessThan(0.001);
          else expect(Math.abs(measured.during.frequency - 440 * rate)).toBeLessThan(20);
          const reportDownload = page.waitForEvent('download');
          await button('gallery.videoReview.downloadReport').click();
          const report = await readFile(await (await reportDownload).path(), 'utf8');
          expect(report).toContain('"audioReencoded": true');
          expect(report).toContain('"videoReencoded": false');
          await button('gallery.videoReview.back').click();
          await page.keyboard.press('Escape');
          await page
            .getByRole('button', { name: `beta-v1-edited.${container}`, exact: true })
            .first()
            .click();
          await page.locator('[data-ui="gallery.videoReview.enter"]').click();
          const provenanceDownload = page.waitForEvent('download');
          await button('gallery.videoReview.downloadReport').click();
          const copyReport = await readFile(await (await provenanceDownload).path(), 'utf8');
          expect(copyReport).toContain('"sourceProvenance"');
          expect(copyReport).toContain('sniptale.video-edit.v1');
          expect(copyReport).toContain('"audioReencoded": true');
        } finally {
          await new Promise<void>((resolve) => host.server.close(() => resolve()));
        }
      });
    }
  }
}
