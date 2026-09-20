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
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function seedReviewVideo(
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

async function persistedFocus(page: Page) {
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

async function timelineGesture(page: Page, start: number, end?: number) {
  const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
  const box = (await plane.locator('[data-ui="gallery.videoReview.ruler"]').boundingBox())!;
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
  const testName = `gallery editing and keyboard (${variant.locale}, ${variant.theme})`;
  test(testName, async ({ page }, testInfo) => {
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
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        true
      );
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog'),
        video = dialog.locator('video');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
      await expect(button('gallery.videoReview.telemetry')).toBeVisible();
      const historyMarker = dialog
        .getByRole('button', { name: label('gallery.videoReview.telemetry'), exact: false })
        .and(dialog.locator('button[title*=" · "]'));
      await expect(historyMarker).toHaveCount(1);
      await button('gallery.videoReview.telemetry').click();
      await expect(historyMarker).toHaveCount(0);
      await button('gallery.videoReview.telemetry').click();
      await expect(historyMarker).toHaveCount(1);
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
      .locator('[data-ui="gallery.videoReview.ruler"]')
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
    const plane = (await dialog.locator('[data-ui="gallery.videoReview.ruler"]').boundingBox())!;
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
    await button('gallery.videoReview.pointerTool').click();
    await timelineGesture(page, 4.1, 8.1);
    const fragmentDownload = page.waitForEvent('download');
    await button('gallery.videoReview.downloadSelection').click();
    const fragment = await fragmentDownload;
    expect(fragment.suggestedFilename()).toBe('beta-v1-fragment-4.000-8.000.webm');
    const fragmentInput = new Input({
      source: new BlobSource(new Blob([Uint8Array.from(await readFile(await fragment.path()))])),
      formats: ALL_FORMATS,
    });
    try {
      expect(await fragmentInput.getDurationFromMetadata()).toBeCloseTo(4, 2);
    } finally {
      fragmentInput.dispose();
    }
    expect(await recordingCount(page)).toBe(1);
    await expect(button('gallery.videoReview.redo')).toBeEnabled();
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
  for (const rate of [0.0625, 0.125, 0.5, 1.25, 1.5, 2, 4, 8, 16]) {
    for (const audio of ['speed', 'mute']) {
      if (gaps && (rate !== 2 || audio !== 'speed')) continue;
      const gapLabel = gaps ? ' gaps' : '';
      const testName = `gallery exports ${rate}x with ${audio} audio (${container}${gapLabel})`;
      test(testName, async ({ page }, testInfo) => {
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
            .getByRole('button', { name: label('gallery.videoReview.speedRate'), exact: true })
            .click();
          await page
            .getByRole('option', { name: `${rate < 0.25 ? `1/${1 / rate}` : rate}×`, exact: true })
            .click();
          await dialog
            .getByRole('button', { name: label('gallery.videoReview.speedAudio'), exact: true })
            .click();
          await page
            .getByRole('option', {
              name: label(
                audio === 'mute'
                  ? 'gallery.videoReview.muteSound'
                  : 'gallery.videoReview.speedSound'
              ),
              exact: true,
            })
            .click();
          await timelineGesture(page, 6, 10);
          const speed = dialog.getByRole('button', {
            name: `Speed ${rate < 0.25 ? `1/${1 / rate}` : rate}× 6.0 – 10.0`,
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
                const measure = (time: number, window = 0.2) => {
                  const start = Math.round(time * buffer.sampleRate);
                  const end = start + Math.round(window * buffer.sampleRate);
                  let crossings = 0;
                  let sum = 0;
                  for (let index = start; index < end; index++) {
                    const value = channel[index] ?? 0;
                    sum += value * value;
                    if (index > start && (channel[index - 1] ?? 0) <= 0 && value > 0) crossings++;
                  }
                  return { frequency: crossings / window, rms: Math.sqrt(sum / (end - start)) };
                };
                return {
                  duration: buffer.duration,
                  origin: measure(0.3),
                  gap: measure(4 + 2.3 / rate),
                  before: measure(1.5),
                  during: measure(4 + 1 / rate, Math.min(0.2, 1 / rate)),
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

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`quick editor advanced workspace (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        true
      );
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.workspaceTools"] button')
      ).toHaveCount(2);
      await expect(button('gallery.videoReview.telemetry')).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: testInfo.outputPath('basic.png') });
      await button('gallery.videoReview.advancedEditing').click();
      const laneControls = dialog.locator('[data-ui="gallery.videoReview.trackControls"]');
      await expect(laneControls).toBeInViewport();
      await expect(laneControls.getByRole('button')).toHaveCount(3);
      expect(
        await button('gallery.videoReview.zoomTrack').evaluate(
          (node) => !!node.closest('[data-ui="gallery.videoReview.trackHeader"]')
        )
      ).toBe(true);
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.workspaceTools"] button')
      ).toHaveCount(1);
      await expect(button('gallery.videoReview.advancedEditing').locator('span')).toBeVisible();
      await expect(dialog.locator('[data-ui="gallery.videoReview.audioLane"]')).toHaveCount(1);
      await button('gallery.videoReview.zoomTrack').click();
      await button('gallery.videoReview.audioTrack').click();
      await button('gallery.videoReview.zoomAdd').first().click();
      const zoomRegion = dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first();
      await expect(zoomRegion).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]')).toBeVisible();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.backgroundInspector"]')
      ).toHaveCount(0);
      await button('gallery.videoReview.scene').click();
      await page.mouse.move(0, 0);
      await expect(button('gallery.videoReview.backgroundNone')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)'
      );
      await button('gallery.videoReview.backgroundNone').hover();
      await expect(button('gallery.videoReview.backgroundNone')).not.toHaveCSS(
        'border-color',
        'rgba(0, 0, 0, 0)'
      );
      const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#4488bb';
        context.fillRect(0, 0, 16, 16);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      await dialog.locator('input[accept="image/png,image/jpeg,image/webp"]').setInputFiles({
        name: 'background.png',
        mimeType: 'image/png',
        buffer: Buffer.from(image, 'base64'),
      });
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(1);
      await dialog
        .getByRole('textbox', {
          name: label('gallery.videoReview.backgroundPadding'),
          exact: true,
        })
        .fill('8');
      await dialog
        .getByRole('textbox', { name: label('gallery.videoReview.backgroundPadding'), exact: true })
        .press('Tab');
      const mode = button('gallery.videoReview.advancedEditing');
      await page.mouse.move(0, 0);
      await expect(mode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(mode).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      await mode.hover();
      await expect(mode).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      await expect(mode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.mouse.move(0, 0);
      await expect(mode).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
      const heading = inspector.locator('header h2');
      const backBox = await button('gallery.videoReview.back').boundingBox();
      const titleBox = await heading.boundingBox();
      const closeBox = await button('common.actions.close').boundingBox();
      expect(
        Math.abs(backBox!.y + backBox!.height / 2 - titleBox!.y - titleBox!.height / 2)
      ).toBeLessThan(2);
      expect(closeBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
      const format = button('videoEditor.sidebar.canvasFormatLabel');
      const formatRow = format.locator('xpath=../..');
      expect((await formatRow.boundingBox())!.height).toBeLessThan(40);
      const padding = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundPadding'),
        exact: true,
      });
      await expect(padding).toHaveCSS('font-size', '12px');
      await expect(format).toHaveCSS('font-size', '12px');
      await expect(formatRow.locator(':scope > span')).toHaveCSS('font-size', '12px');
      const mute = button('gallery.videoReview.audioEnabled').first();
      const enabledColor = await mute.evaluate((node) => getComputedStyle(node).color);
      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'false');
      await expect
        .poll(() => mute.evaluate((node) => getComputedStyle(node).color))
        .not.toBe(enabledColor);
      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'true');
      await page.mouse.move(0, 0);
      await expect(mute).toHaveCSS('color', enabledColor);
      await inspector
        .locator('[data-ui="gallery.videoReview.canvasSettings"]')
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('scene-inspector.png') });
      await button('gallery.videoReview.audioTrack').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.audioLane"]')).toHaveCount(1);
      await expect(dialog.locator('[data-audio-lane="music"]')).toHaveCount(0);
      await button('gallery.videoReview.audioTrack').click();
      await expect(dialog.locator('[data-audio-lane="music"]')).toBeVisible();

      const headers = dialog.locator('[data-ui="gallery.videoReview.trackHeader"]');
      const originalWave = dialog
        .locator('[data-ui="gallery.videoReview.audioLane"]')
        .first()
        .locator('path');
      await expect
        .poll(async () => (await originalWave.getAttribute('d'))?.length ?? 0)
        .toBeGreaterThan(100);
      const wav = Buffer.alloc(44 + 48000 * 2 * 2);
      wav.write('RIFF');
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(48000, 24);
      wav.writeUInt32LE(96000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(wav.length - 44, 40);
      for (let i = 0; i < 96000; i++)
        wav.writeInt16LE(
          Math.round(Math.sin((i / 48000) * 440 * Math.PI * 2) * (i < 48000 ? 4000 : 12000)),
          44 + i * 2
        );
      await dialog
        .locator('input[accept="audio/*"]')
        .first()
        .setInputFiles({ name: 'peaks.wav', mimeType: 'audio/wav', buffer: wav });
      const music = dialog.locator('[data-ui="gallery.videoReview.audioLane"]').last();
      await expect
        .poll(async () => (await music.locator('path').getAttribute('d'))?.length ?? 0)
        .toBeGreaterThan(100);
      const audioClip = music.locator('[role="button"]').first();
      await expect(audioClip).toHaveAttribute('title', 'peaks.wav');
      await expect(audioClip).toHaveText('');
      const originalClipBox = (await audioClip.boundingBox())!;
      const handle = audioClip.locator('[data-audio-edge="end"]');
      await expect(handle.locator('span')).toBeVisible();
      const handleBox = (await handle.boundingBox())!;
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 150, handleBox.y + handleBox.height / 2, { steps: 3 });
      expect((await audioClip.boundingBox())!.width).toBeLessThanOrEqual(originalClipBox.width + 1);
      await page.mouse.up();
      expect((await audioClip.boundingBox())!.width).toBeLessThanOrEqual(originalClipBox.width + 1);
      await audioClip.click();
      const clipMute = button('gallery.videoReview.audioClipMute');
      await clipMute.click();
      await page.mouse.move(0, 0);
      await expect(clipMute).toHaveAttribute('aria-pressed', 'true');
      await expect(clipMute).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await clipMute.hover();
      await expect(clipMute).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      await clipMute.click();
      const zoomControl = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      await zoomControl.focus();
      await zoomControl.press('End');
      const headerX = (await headers.last().boundingBox())!.x;
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      await viewport.evaluate((node) => {
        node.scrollLeft = 120;
      });
      expect((await headers.last().boundingBox())!.x).toBeCloseTo(headerX, 1);
      await viewport.evaluate((node) => {
        node.scrollLeft = 0;
      });
      await button('gallery.videoReview.fit').click();
      const playhead = dialog.locator('[data-ui="gallery.videoReview.playhead"]');
      expect((await playhead.boundingBox())!.height).toBeGreaterThan(150);
      const timePlane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      await timePlane.focus();
      await page.keyboard.press('Space');
      await expect(button('gallery.videoReview.pause')).toBeVisible();
      await expect(timePlane).toHaveCSS('outline-style', 'none');
      await expect(timePlane).toHaveCSS('box-shadow', 'none');
      await page.keyboard.press('Space');
      await expect(button('gallery.videoReview.addOverlayComment')).toHaveCount(0);
      await expect(button('gallery.videoReview.copyReport')).toHaveCount(0);
      await button('gallery.videoReview.comments').click();
      const addNote = button('gallery.videoReview.addComment');
      const noteBounds = (await addNote.boundingBox())!;
      const listBounds = (await dialog.locator('aside ol').boundingBox())!;
      expect(noteBounds.width).toBeCloseTo(listBounds.width, 0);
      await expect(addNote).toHaveCSS('justify-content', 'center');
      await addNote.click();
      await dialog
        .getByRole('textbox', { name: label('gallery.videoReview.commentText'), exact: true })
        .fill('Explicit note');
      await button('gallery.videoReview.save').click();
      await expect(dialog.locator('ol')).toContainText('Explicit note');
      await page.screenshot({ path: testInfo.outputPath('advanced.png') });
      await page.setViewportSize({ width: 800, height: 600 });
      await expect(button('gallery.videoReview.back')).toBeInViewport();
      await expect(button('gallery.videoReview.advancedEditing')).toBeInViewport();
      const stage = await dialog.locator('[data-ui="gallery.videoReview.stage"]').boundingBox();
      expect(stage!.height).toBeGreaterThan(140);
      const navigation = dialog.locator('[data-ui="gallery.videoReview.inspectorNavigation"]');
      expect((await navigation.boundingBox())!.height).toBeGreaterThan(32);
      await expect(dialog.locator('ol').getByText('Explicit note', { exact: true })).toBeInViewport(
        { ratio: 1 }
      );
      await page.screenshot({ path: testInfo.outputPath('minimum.png') });
      await button('gallery.videoReview.advancedEditing').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(0);
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(1);
      await button('gallery.videoReview.exportVideo').click();
      await expect.poll(() => recordingCount(page)).toBe(2);
      await expect(button('common.actions.close')).toBeEnabled();
      await button('common.actions.close').click();
      await expect(page.locator('[data-ui="gallery.videoReview.dialog"]')).toHaveCount(0);
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`quick editor zoom preview and connections (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        true
      );
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.zoomTrack').click();
      // Two active regions with a real gap between them.
      await button('gallery.videoReview.zoomAdd').first().click();
      await timelineGesture(page, 5);
      await expect
        .poll(async () =>
          Number(
            await dialog
              .locator('[data-ui="gallery.videoReview.timePlane"]')
              .getAttribute('aria-valuenow')
          )
        )
        .toBeGreaterThan(4);
      await button('gallery.videoReview.zoomAdd').first().click();
      const lane = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const link = lane.locator('[data-ui="gallery.videoReview.zoomLink"]');
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('data-connected', 'false');
      // The selected region shows the framing preview with a real source frame.
      const inspector = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      await expect(inspector).toBeVisible();
      const preview = inspector.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      await expect(preview).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      const focusX = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.zoomFocusX'),
        exact: true,
      });
      await expect(focusX).toHaveValue('50');
      // Framing seeks the main player to the source frame shown in the mini-preview.
      const beforeFraming = await dialog.locator('video').evaluate((video) => video.currentTime);
      await preview.locator('canvas').focus();
      await page.keyboard.press('ArrowRight');
      await expect(focusX).toHaveValue('51');
      await expect
        .poll(() => dialog.locator('video').evaluate((video) => video.currentTime))
        .toBeGreaterThan(beforeFraming);
      expect(await dialog.locator('video').evaluate((video) => video.paused)).toBe(true);
      const scale = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.zoomScale'),
        exact: true,
      });
      await scale.fill('');
      await scale.pressSequentially('2.25');
      await scale.press('Tab');
      await expect(scale).toHaveValue('2.25');
      const enter = inspector.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionIn'),
        exact: true,
      });
      const enterDuration = enter.getByRole('textbox', {
        name: label('gallery.videoReview.zoomTransitionDuration'),
        exact: true,
      });
      await enterDuration.fill('1.5');
      await enterDuration.press('Tab');
      // The gesture below is a separate undo step from the debounced setup edits.
      await expect
        .poll(() => persistedFocus(page))
        .toMatchObject({ transform: { centerX: 0.51, scale: 2.25 }, enter: { duration: 1.5 } });
      // Long-transition framing shows the final target on both surfaces, before release.
      await preview.scrollIntoViewIfNeeded();
      const canvasBounds = await preview.locator('canvas').boundingBox();
      if (!canvasBounds) throw new Error('Framing preview has no bounds');
      const stageVideo = dialog.locator('video');
      await page.mouse.move(
        canvasBounds.x + canvasBounds.width * 0.51,
        canvasBounds.y + canvasBounds.height * 0.5
      );
      await page.mouse.down();
      const originTransform = await stageVideo.evaluate((node) => node.style.transform);
      await page.mouse.move(
        canvasBounds.x + canvasBounds.width * 0.61,
        canvasBounds.y + canvasBounds.height * 0.5,
        { steps: 5 }
      );
      await expect
        .poll(() => stageVideo.evaluate((node) => node.style.transform))
        .not.toBe(originTransform);
      expect(
        await stageVideo.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m11)
      ).toBeCloseTo(2.25);
      await expect(focusX).toHaveValue('51');
      await page.mouse.up();
      await expect(focusX).toHaveValue('61');
      await button('gallery.videoReview.undo').click();
      await expect(focusX).toHaveValue('51');
      // Main canvas grabs the image, with exact opposite camera movement and no feedback.
      const pan = dialog.locator('[data-ui="gallery.videoReview.zoomTarget"]');
      const panBounds = await pan.boundingBox();
      if (!panBounds) throw new Error('Stage focus has no bounds');
      await page.mouse.move(
        panBounds.x + panBounds.width * 0.5,
        panBounds.y + panBounds.height * 0.5
      );
      await page.mouse.down();
      const beforePan = await stageVideo.evaluate((node) => node.style.transform);
      await page.mouse.move(
        panBounds.x + panBounds.width * 0.6125,
        panBounds.y + panBounds.height * 0.5,
        { steps: 5 }
      );
      await expect
        .poll(() => stageVideo.evaluate((node) => node.style.transform))
        .not.toBe(beforePan);
      await expect(focusX).toHaveValue('51');
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect.poll(() => stageVideo.evaluate((node) => node.style.transform)).toBe(beforePan);
      await expect(focusX).toHaveValue('51');
      await enter.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('zoom-transition-controls.png') });
      const video = dialog.locator('video');
      await video.evaluate((node: HTMLVideoElement) => {
        node.currentTime = 5;
      });
      await button('gallery.videoReview.play').click();
      const motion = await video.evaluate(async (node: HTMLVideoElement) => {
        const samples: { width: number; x: number; scale: number }[] = [];
        const start = performance.now();
        await new Promise<void>((resolve) => {
          const sample = () => {
            const matrix = new DOMMatrix(getComputedStyle(node).transform);
            samples.push({ width: node.offsetWidth, x: matrix.m41, scale: matrix.m11 });
            if (performance.now() - start < 700) requestAnimationFrame(sample);
            else resolve();
          };
          requestAnimationFrame(sample);
        });
        return samples;
      });
      await button('gallery.videoReview.pause').click();
      expect(motion.length).toBeGreaterThan(10);
      expect(new Set(motion.map((sample) => sample.width)).size).toBe(1);
      for (let i = 1; i < motion.length; i++) {
        expect(motion[i]!.scale).toBeGreaterThanOrEqual(motion[i - 1]!.scale - 0.0001);
        expect(motion[i]!.x).toBeLessThanOrEqual(motion[i - 1]!.x + 0.01);
      }

      await page.setViewportSize({ width: 800, height: 600 });
      await preview.scrollIntoViewIfNeeded();
      await expect(preview).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('zoom-preview-minimum.png') });
      await page.setViewportSize({ width: 1280, height: 720 });
      // Area/Result switch re-projects the footprint over the same frame.
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.zoomPreviewResult'), exact: true })
        .click();
      await expect(preview).toHaveAttribute('data-view', 'result');
      await page.screenshot({ path: testInfo.outputPath('zoom-preview.png') });
      // Hover/focus reveals the connect affordance in the eligible gap.
      await link.hover();
      await link.click();
      await expect(link).toHaveAttribute('data-connected', 'true');
      // Selecting a connected gap opens link settings instead of unlinking.
      await link.click();
      const linkInspector = dialog.locator('[data-ui="gallery.videoReview.zoomLinkInspector"]');
      await expect(linkInspector).toBeVisible();
      await expect(
        linkInspector.locator('[data-ui="gallery.videoReview.zoomLinkDuration"]')
      ).not.toBeEmpty();
      const easing = linkInspector.getByRole('button', {
        name: label('gallery.videoReview.zoomLinkEasing'),
        exact: true,
      });
      await easing.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.transitionLinear'), exact: true })
        .click();
      await expect(easing).toContainText(label('gallery.videoReview.transitionLinear'));
      await page.screenshot({ path: testInfo.outputPath('zoom-link.png') });
      // The inspector removes the connection explicitly.
      await linkInspector
        .getByRole('button', { name: label('gallery.videoReview.zoomLinkRemove'), exact: true })
        .click();
      await expect(link).toHaveAttribute('data-connected', 'false');
      // The connected transition persists into the exported edit state.
      await link.click();
      await expect(link).toHaveAttribute('data-connected', 'true');
      await page.setViewportSize({ width: 800, height: 600 });
      await expect(link).toBeVisible();
      await link.click();
      await expect(linkInspector).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('zoom-link-minimum.png') });
      // Reopen the persisted edit and verify the authored connection parameters.
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(link).toHaveAttribute('data-connected', 'true');
      await link.click();
      await expect(easing).toContainText(label('gallery.videoReview.transitionLinear'));
      await button('gallery.videoReview.exportVideo').click();
      await expect.poll(() => recordingCount(page)).toBe(2);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('quick editor exports an exact portrait fragment and exposes compact speed controls', async ({
  page,
}, testInfo) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
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
    await expect(button('gallery.videoReview.speedMode')).toBeEnabled();
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.speedMode').click();
    const speed = button('gallery.videoReview.speedRate');
    const sound = button('gallery.videoReview.speedAudio');
    const tool = await button('gallery.videoReview.speedMode').boundingBox();
    const rateBox = await speed.boundingBox();
    const soundBox = await sound.boundingBox();
    expect(rateBox!.x).toBeGreaterThan(tool!.x);
    expect(Math.abs(rateBox!.y - tool!.y)).toBeLessThan(2);
    expect(Math.abs(soundBox!.y - tool!.y)).toBeLessThan(2);
    expect(rateBox!.width).toBeLessThan(90);
    expect(soundBox!.width).toBeLessThan(160);
    await speed.click();
    await expect(page.getByRole('option', { name: '2×', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await speed.click();
    const menu = page.getByRole('listbox');
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.width).toBeGreaterThanOrEqual(112);
    for (const option of await menu.getByRole('option').all()) {
      expect(
        await option.locator('.sniptale-select-option-copy').evaluate((node) => {
          const style = getComputedStyle(node);
          return node.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 1;
        })
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await button('gallery.videoReview.pointerTool').focus();
    await page.keyboard.press('Space');
    await expect(dialog).toHaveAttribute('data-playback-focus', 'true');
    expect(
      await button('gallery.videoReview.pointerTool').evaluate(
        (node) => getComputedStyle(node).boxShadow
      )
    ).toBe('none');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(dialog).not.toHaveAttribute('data-playback-focus');
    await page.keyboard.press('ArrowRight');
    await timelineGesture(page, 4);
    await expect
      .poll(async () =>
        Number(
          await dialog
            .locator('[data-ui="gallery.videoReview.timePlane"]')
            .getAttribute('aria-valuenow')
        )
      )
      .toBeGreaterThan(3);

    const toolbar = dialog.locator('[data-ui="gallery.videoReview.toolbar"]');
    await expect(
      toolbar.getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
    ).toBeVisible();
    await button('videoEditor.app.panelFullHeight').click();
    const dock = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
    const dockBox = (await dock.boundingBox())!;
    const timelineBox = (await dialog
      .locator('[data-ui="gallery.videoReview.timeline"]')
      .boundingBox())!;
    expect(dockBox.y + dockBox.height).toBeGreaterThanOrEqual(
      timelineBox.y + timelineBox.height - 2
    );
    expect(timelineBox.x + timelineBox.width).toBeLessThanOrEqual(dockBox.x + 2);
    await page.setViewportSize({ width: 800, height: 600 });
    for (const control of await toolbar.getByRole('button').all())
      await expect(control).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('full-height-inspector.png') });
    await button('videoEditor.app.panelRestoreHeight').click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await button('gallery.videoReview.pointerTool').click();
    await button('videoEditor.sidebar.canvasFormatLabel').click();
    await page.getByRole('option', { name: '9:16', exact: true }).click();
    await button('gallery.videoReview.exportSettings').click();
    await expect(dialog.locator('[data-ui="gallery.videoReview.exportSettings"]')).toBeVisible();
    await button('gallery.videoReview.exportFrameRate').click();
    await page.getByRole('option', { name: '30', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('export-settings.png') });
    await timelineGesture(page, 0.25, 2.25);
    const downloading = page.waitForEvent('download');
    await button('gallery.videoReview.downloadSelection').click();
    const download = await downloading;
    await download.saveAs(testInfo.outputPath('exact-portrait.webm'));
    const bytes = await readFile(await download.path());
    const dimensions = await page.evaluate(async (encoded) => {
      const blob = new Blob([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))], {
        type: 'video/webm',
      });
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('Export decode failed'));
          video.src = url;
        });
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }, bytes.toString('base64'));
    expect(dimensions).toMatchObject({ width: 90, height: 160 });
    expect(dimensions.duration).toBeCloseTo(2, 1);
    expect(await recordingCount(page)).toBe(1);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`quick editor spotlight preview and export (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.zoomTrack').click();
      await button('gallery.videoReview.zoomAdd').first().click();
      await button('gallery.videoReview.focusType').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      const opening = dialog
        .locator('[data-ui="gallery.videoReview.zoomPreview"]')
        .getByRole('group', {
          name: label('gallery.videoReview.focusSpotlight'),
          exact: true,
        });
      await expect(opening).toBeVisible();
      await opening.focus();
      await page.keyboard.press('ArrowRight');
      await expect(
        dialog.getByRole('textbox', { name: label('gallery.videoReview.focusAreaX'), exact: true })
      ).toHaveValue('26');
      await button('gallery.videoReview.undo').click();
      await expect(
        dialog.getByRole('textbox', { name: label('gallery.videoReview.focusAreaX'), exact: true })
      ).toHaveValue('25');
      const stage = dialog.locator('[data-ui="gallery.videoReview.stage"]');
      const areaX = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.focusAreaX'),
        exact: true,
      });
      const stageArea = stage.getByRole('group', {
        name: label('gallery.videoReview.focusSpotlight'),
        exact: true,
      });
      const originalLeft = await stageArea.evaluate((node) => node.style.left);
      const smallBounds = await opening.boundingBox();
      if (!smallBounds) throw new Error('Spotlight preview has no bounds');
      await page.mouse.move(
        smallBounds.x + smallBounds.width / 2,
        smallBounds.y + smallBounds.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        smallBounds.x + smallBounds.width * 0.7,
        smallBounds.y + smallBounds.height / 2,
        { steps: 5 }
      );
      await expect.poll(() => stageArea.evaluate((node) => node.style.left)).not.toBe(originalLeft);
      await expect(areaX).toHaveValue('25');
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect.poll(() => stageArea.evaluate((node) => node.style.left)).toBe(originalLeft);
      const stageBounds = await stageArea.boundingBox();
      if (!stageBounds) throw new Error('Spotlight stage has no bounds');
      await page.mouse.move(
        stageBounds.x + stageBounds.width / 2,
        stageBounds.y + stageBounds.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        stageBounds.x + stageBounds.width * 0.7,
        stageBounds.y + stageBounds.height / 2,
        { steps: 5 }
      );
      await expect.poll(() => opening.evaluate((node) => node.style.left)).not.toBe(originalLeft);
      await expect(areaX).toHaveValue('25');
      await page.mouse.up();
      await expect(areaX).toHaveValue('35');
      await button('gallery.videoReview.undo').click();
      await expect(areaX).toHaveValue('25');
      await timelineGesture(page, 1);
      await expect(stage.locator('[data-ui="gallery.videoReview.spotlight"]')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0.65)'
      );
      const dimmed = await stage.screenshot({ path: testInfo.outputPath('spotlight-dim.png') });
      await button('gallery.videoReview.advancedEditing').click();
      await expect(stage.locator('[data-ui="gallery.videoReview.spotlight"]')).toHaveCount(0);
      const plain = await stage.screenshot();
      const pixels = await page.evaluate(
        async ({ plain, dimmed }) => {
          const sample = async (encoded: string) => {
            const image = await createImageBitmap(
              new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
                type: 'image/png',
              })
            );
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(image, 0, 0);
            image.close();
            const pixel = (x: number, y: number) =>
              Array.from(
                ctx.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1)
                  .data
              ).slice(0, 3);
            return { outside: pixel(0.15, 0.4), inside: pixel(0.4, 0.4) };
          };
          return { plain: await sample(plain), dimmed: await sample(dimmed) };
        },
        { plain: plain.toString('base64'), dimmed: dimmed.toString('base64') }
      );
      // Mode changes resize the stage by subpixels; allow only resampling noise.
      for (let channel = 0; channel < 3; channel++)
        expect(
          Math.abs(pixels.dimmed.inside[channel]! - pixels.plain.inside[channel]!)
        ).toBeLessThanOrEqual(3);
      expect(pixels.dimmed.outside.reduce((a, b) => a + b, 0)).toBeLessThan(
        pixels.plain.outside.reduce((a, b) => a + b, 0) * 0.5
      );
      await button('gallery.videoReview.advancedEditing').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await button('gallery.videoReview.focusOutside').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusBlur'), exact: true })
        .click();
      await timelineGesture(page, 1);
      await expect(stage.locator('[data-ui="gallery.videoReview.spotlight"]')).not.toHaveCSS(
        'backdrop-filter',
        'none'
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const clearPixel = await page.evaluate(
        async (encoded) => {
          const image = await createImageBitmap(
            new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
              type: 'image/png',
            })
          );
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          image.close();
          const pixel = (x: number) =>
            Array.from(
              ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * 0.4), 1, 1)
                .data
            ).slice(0, 3);
          return { inside: pixel(0.4), outside: pixel(0.15) };
        },
        (
          await stage.screenshot({ path: testInfo.outputPath('spotlight-blur-stage.png') })
        ).toString('base64')
      );
      for (let channel = 0; channel < 3; channel++)
        expect(
          Math.abs(clearPixel.inside[channel]! - pixels.dimmed.inside[channel]!)
        ).toBeLessThanOrEqual(3);

      expect(
        clearPixel.outside.reduce(
          (sum, value, channel) => sum + Math.abs(value - pixels.plain.outside[channel]!),
          0
        )
      ).toBeGreaterThan(20);
      await page.screenshot({ path: testInfo.outputPath('spotlight-blur.png') });
      const downloading = page.waitForEvent('download');
      await button('gallery.videoReview.downloadVideo').click();
      const download = await downloading;
      await download.saveAs(testInfo.outputPath('spotlight-blur.webm'));
      const exported = await readFile(await download.path());
      const comparison = await page.evaluate(async (encoded) => {
        const original = document.querySelector<HTMLVideoElement>(
          '[data-ui="gallery.videoReview.stage"] video'
        )!;
        const blob = new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
          type: 'video/webm',
        });
        const resultUrl = URL.createObjectURL(blob);
        const decode = async (url: string) => {
          const video = document.createElement('video');
          try {
            video.muted = true;
            await new Promise<void>((resolve, reject) => {
              video.onloadedmetadata = () => resolve();
              video.onerror = () => reject(new Error('Decode failed'));
              video.src = url;
            });
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
              video.currentTime = 1.05;
            });
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(video, 0, 0);
            return {
              width: canvas.width,
              height: canvas.height,
              data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            };
          } finally {
            video.removeAttribute('src');
            video.load();
          }
        };
        try {
          const source = await decode(original.currentSrc),
            result = await decode(resultUrl);
          const error = (left: number, right: number, top: number, bottom: number) => {
            let sum = 0,
              count = 0;
            for (let y = Math.ceil(source.height * top); y < source.height * bottom; y++)
              for (let x = Math.ceil(source.width * left); x < source.width * right; x++)
                for (let c = 0; c < 3; c++) {
                  const i = (y * source.width + x) * 4 + c;
                  sum += Math.abs(source.data[i]! - result.data[i]!);
                  count++;
                }
            return sum / count;
          };
          return {
            width: result.width,
            height: result.height,
            inside: error(0.32, 0.68, 0.52, 0.68),
            outside: error(0.05, 0.2, 0.5, 0.8),
          };
        } finally {
          URL.revokeObjectURL(resultUrl);
        }
      }, exported.toString('base64'));
      expect(comparison).toMatchObject({ width: 160, height: 90 });
      expect(comparison.inside).toBeLessThan(12);
      expect(comparison.outside).toBeGreaterThan(8);
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await page.setViewportSize({ width: 800, height: 600 });
      await expect(button('gallery.videoReview.focusType')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('spotlight-minimum.png') });
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(button('gallery.videoReview.focusType')).toContainText(
        label('gallery.videoReview.focusSpotlight')
      );
      await page.setViewportSize({ width: 1280, height: 720 });
      await timelineGesture(page, 5);
      await button('gallery.videoReview.zoomAdd').first().click();
      const lane = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const link = lane.locator('[data-ui="gallery.videoReview.zoomLink"]');
      await expect(link).toHaveCount(0);
      await button('gallery.videoReview.focusType').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await expect(link).toHaveCount(1);
      await link.click();
      await expect(link).toHaveAttribute('data-connected', 'true');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await lane.locator('[role="button"]').last().click();
      await button('gallery.videoReview.focusType').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.zoomRegionLabel'), exact: true })
        .click();
      await expect(link).toHaveCount(0);
      await button('gallery.videoReview.undo').click();
      await expect(link).toHaveAttribute('data-connected', 'true');
      await lane.locator('[role="button"]').first().click();
      await button('gallery.videoReview.focusOutside').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusDim'), exact: true })
        .click();
      await button('gallery.videoReview.scene').click();
      const background = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#4488bb';
        context.fillRect(0, 0, 16, 16);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      await dialog.locator('input[accept="image/png,image/jpeg,image/webp"]').setInputFiles({
        name: 'focus-background.png',
        mimeType: 'image/png',
        buffer: Buffer.from(background, 'base64'),
      });
      await expect(stage.locator('img')).toHaveCount(1);
      await timelineGesture(page, 1);
      const edge = await page.evaluate(
        async (encoded) => {
          const bitmap = await createImageBitmap(
            new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
              type: 'image/png',
            })
          );
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return Array.from(ctx.getImageData(2, Math.floor(canvas.height / 2), 1, 1).data).slice(
            0,
            3
          );
        },
        (
          await stage.screenshot({ path: testInfo.outputPath('spotlight-background.png') })
        ).toString('base64')
      );
      for (const [channel, expected] of [24, 48, 65].entries())
        expect(Math.abs(edge[channel]! - expected)).toBeLessThanOrEqual(3);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('quick editor continues playback after a fractional cut and accepts navigation during a note draft', async ({
  page,
}) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'ru' },
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
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.cutMode').click();
    await timelineGesture(page, 0.4, 2.123456789);
    await expect(button('gallery.videoReview.undo')).toBeEnabled();
    await button('gallery.videoReview.pointerTool').click();
    await timelineGesture(page, 0);
    await button('gallery.videoReview.play').click();
    const video = dialog.locator('video');
    await expect
      .poll(() => video.evaluate((node) => node.currentTime), { timeout: 8000 })
      .toBeGreaterThan(3);
    expect(await video.evaluate((node) => node.paused)).toBe(false);
    await button('gallery.videoReview.pause').click();
    await button('gallery.videoReview.comments').click();
    await button('gallery.videoReview.addComment').click();
    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    for (const time of [4, 6, 3, 5]) {
      await plane.focus();
      await page.keyboard.press('ArrowRight');
      await expect(dialog).toHaveAttribute('data-playback-focus', 'true');
      await timelineGesture(page, time);
      await expect
        .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
        .toBeCloseTo(time, 0);
      expect(await dialog.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    }
    await expect(dialog.locator('textarea')).toBeVisible();
    await button('gallery.videoReview.discard').click();
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`quick editor contextual history commands and note editing (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        true
      );
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
      const action = dialog
        .locator(`[aria-label^="${label('gallery.videoReview.telemetry')} ·"]`)
        .first();
      await action.click();
      await expect(
        dialog
          .locator('aside')
          .getByRole('button', { name: label('gallery.videoReview.actionFocus'), exact: true })
      ).toBeEnabled();
      await dialog
        .locator('aside')
        .getByRole('button', { name: label('gallery.videoReview.actionFocus'), exact: true })
        .click();
      await expect(button('gallery.videoReview.advancedEditing')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const focus = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      await expect(focus).toBeVisible();
      await expect(
        focus.getByRole('textbox', { name: label('gallery.videoReview.zoomScale'), exact: true })
      ).toHaveValue('2.5');
      await page.screenshot({ path: testInfo.outputPath('contextual-focus.png') });
      await action.click();
      await expect(
        dialog
          .locator('aside')
          .getByRole('button', { name: label('gallery.videoReview.actionFocus'), exact: true })
      ).toBeDisabled();
      await button('gallery.videoReview.actionSpeed').click();
      await expect(
        dialog
          .locator('aside')
          .getByRole('textbox', { name: label('gallery.videoReview.rangeStart'), exact: true })
      ).toBeVisible();
      await action.click();
      await expect(button('gallery.videoReview.actionSpeed')).toBeDisabled();
      await expect(button('gallery.videoReview.actionCut')).toBeDisabled();
      await button('gallery.videoReview.undo').click();
      await action.click();
      await button('gallery.videoReview.actionCut').click();
      await action.click();
      await expect(
        dialog.getByText(label('gallery.videoReview.actionRemoved'), { exact: true })
      ).toBeVisible();
      await expect(button('gallery.videoReview.actionCut')).toHaveCount(0);
      const lanes = dialog.locator('[data-ui="gallery.videoReview.audioLane"]');
      await expect(lanes.first().locator('[aria-hidden="true"].opacity-80')).toHaveCount(1);
      await expect(button('gallery.videoReview.copyReport')).toHaveCount(0);
      await button('gallery.videoReview.comments').click();
      const addNote = button('gallery.videoReview.addComment');
      const noteBounds = (await addNote.boundingBox())!;
      const listBounds = (await dialog.locator('aside ol').boundingBox())!;
      expect(noteBounds.width).toBeCloseTo(listBounds.width, 0);
      await expect(addNote).toHaveCSS('justify-content', 'center');
      await addNote.click();
      await dialog.locator('textarea').fill('Context note');
      await button('gallery.videoReview.save').click();
      await button('gallery.videoReview.editComment').click();
      const composer = dialog.locator('[data-ui="gallery.videoReview.commentComposer"]');
      await expect(composer).toHaveCount(1);
      await expect(composer.locator('textarea')).toHaveValue('Context note');
      await expect(composer.locator('textarea')).toHaveCSS('border-width', '0px');
      await expect(
        dialog.locator('ol li:has([data-ui="gallery.videoReview.commentComposer"])')
      ).toHaveCSS('border-width', '0px');
      await page.screenshot({ path: testInfo.outputPath('note-editor.png') });
      await button('gallery.videoReview.discard').click();
      const report = button('gallery.videoReview.downloadReport');
      const exporting = button('gallery.videoReview.exportVideo');
      expect((await report.boundingBox())!.y).toBeLessThan((await exporting.boundingBox())!.y);
      const reportIconX = (await report.locator('svg').boundingBox())!.x;
      expect((await exporting.locator('svg').boundingBox())!.x).toBeCloseTo(reportIconX, 0);
      expect(
        (await button('gallery.videoReview.downloadVideo').locator('svg').boundingBox())!.x
      ).toBeCloseTo(reportIconX, 0);
      await page.mouse.move(0, 0);
      await expect(exporting).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(exporting).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      await exporting.hover();
      await expect(exporting).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      await expect(dialog.locator('textarea')).toHaveCount(0);
      await button('gallery.videoReview.pointerTool').click();
      await timelineGesture(page, 5, 7);
      await button('gallery.videoReview.speedMode').click();
      await expect(
        dialog
          .locator('aside')
          .getByRole('textbox', { name: label('gallery.videoReview.rangeStart'), exact: true })
      ).toHaveValue('5');
      const inspector = dialog.locator('aside');
      await expect(
        inspector.getByText(label('gallery.videoReview.speedRate'), { exact: true })
      ).toBeVisible();
      await expect(button('gallery.videoReview.copyReport')).toHaveCount(0);
      await page.setViewportSize({ width: 800, height: 600 });
      await button('gallery.videoReview.exportSettings').click();
      const quality = button('gallery.videoReview.exportQuality');
      await quality.scrollIntoViewIfNeeded();
      await expect(quality).toBeInViewport();
      const downloadBounds = (await button('gallery.videoReview.downloadVideo').boundingBox())!;
      expect((await quality.boundingBox())!.y).toBeGreaterThanOrEqual(
        downloadBounds.y + downloadBounds.height
      );
      expect(
        await button('gallery.videoReview.exportFrameRate')
          .locator('.truncate')
          .evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
      ).toBe(true);
      const inspectorBox = (await inspector.boundingBox())!;
      const qualityBox = (await quality.boundingBox())!;
      expect(qualityBox.y + qualityBox.height).toBeLessThanOrEqual(
        inspectorBox.y + inspectorBox.height
      );
      await expect(exporting).toBeInViewport({ ratio: 1 });
      await expect(button('gallery.videoReview.downloadVideo')).toBeInViewport({ ratio: 1 });
      await expect(inspector.locator('header h2')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('polish-minimum-export.png') });
      await button('gallery.videoReview.exportSettings').click();
      const speedValue = inspector.getByRole('button', {
        name: label('gallery.videoReview.speedRate'),
        exact: true,
      });
      await speedValue.scrollIntoViewIfNeeded();
      await speedValue.click();
      await expect(page.getByRole('option', { name: '2×', exact: true })).toBeInViewport();
      await page.keyboard.press('Escape');
      await page.screenshot({ path: testInfo.outputPath('polish-minimum-inspector.png') });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
