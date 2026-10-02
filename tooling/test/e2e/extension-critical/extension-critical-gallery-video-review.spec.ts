import {
  seedReviewVideo,
  persistedFocus,
  clickReviewExport,
  expectTimelineSelection,
  recordingCount,
  recordedAudioResources,
} from '../support/quick-editor-media-fixture';
import { checkInspectorUtility, checkInspectorLabels } from '../support/inspector-utilities';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

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
      await button('gallery.videoReview.addComment').and(dialog.locator('aside button')).click();
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
      await expect(
        button('gallery.videoReview.addComment').and(dialog.locator('aside button'))
      ).toBeVisible();
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
    await expect(dialog.getByRole('button', { name: /^Cut · \d/ })).toHaveCount(0);
    await expect(button('gallery.videoReview.undo')).toBeDisabled();
    await timelineGesture(page, 2.1, 4.1);
    const cut = dialog.getByRole('button', { name: 'Cut · 2.0 – 4.0', exact: true });
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
    await expect(dialog.getByRole('button', { name: 'Cut · 2.0 – 6.0', exact: true })).toHaveCount(
      0
    );
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(plane.x + (plane.width * 6) / 12.008, h.y + h.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(
      dialog.getByRole('button', { name: 'Cut · 2.0 – 6.0', exact: true })
    ).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(cut).toBeVisible();
    await button('gallery.videoReview.pointerTool').click();
    await timelineGesture(page, 4.1, 8.1);
    const fragmentDownload = page.waitForEvent('download');
    await button('gallery.videoReview.downloadSelection').click();
    const fragment = await fragmentDownload;
    expect(fragment.suggestedFilename()).toMatch(
      /^Sniptale_video-review_.*_fragment-4\.000-8\.000\.webm$/
    );
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
    await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
    const download = await downloading;
    await download.saveAs(testInfo.outputPath('download-only.webm'));
    expect(await recordingCount(page)).toBe(1);
    await clickReviewExport(button, 'gallery.videoReview.exportVideo');
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
    await expect(
      dialog.getByRole('button', { name: 'Cut · 2.0 – 6.0', exact: true })
    ).toBeVisible();
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
          if (rate === 4 && audio === 'speed') {
            const positions = await page.evaluate(async () => {
              const toolbar = document.querySelector<HTMLElement>(
                '[data-ui="gallery.videoReview.toolbar"]'
              )!;
              const leading = toolbar.querySelector('[data-toolbar-side="leading"]')!;
              const samples: number[] = [];
              for (let frame = 0; frame < 20; frame++) {
                await new Promise(requestAnimationFrame);
                samples.push(leading.getBoundingClientRect().width);
              }
              return samples;
            });
            expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(0.5);
          }
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
            name: `Speed ${rate < 0.25 ? `1/${1 / rate}` : rate}× · 6.0 – 10.0`,
            exact: true,
          });
          await expect(speed).toBeVisible();
          await speed.click();
          await button('gallery.videoReview.play').click();
          await expect(dialog.locator('video')).toHaveJSProperty('playbackRate', rate);
          await expect(dialog.locator('video')).toHaveJSProperty('preservesPitch', true);
          await expect(dialog.locator('video')).toHaveJSProperty('muted', audio === 'mute');
          await button('gallery.videoReview.pause').click();
          await clickReviewExport(button, 'gallery.videoReview.exportVideo');
          await expect.poll(() => recordingCount(page)).toBe(2);
          const downloading = page.waitForEvent('download');
          await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
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
          else expect(Math.abs(measured.during.frequency - 440)).toBeLessThan(20);
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
      const selectedRegion = lane.locator('[role="button"][aria-pressed="true"]');
      await expect(selectedRegion.locator('[data-zoom-edge="start"]')).toHaveCSS('width', '12px');
      await expect(selectedRegion).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const restingRegion = lane.locator('[role="button"][aria-pressed="false"]').first();
      await expect(restingRegion).toHaveCSS(
        'background-color',
        await selectedRegion.evaluate((node) => getComputedStyle(node).backgroundColor)
      );

      await lane.screenshot({ path: testInfo.outputPath('focus-lane.png') });
      // The selected region shows the framing preview with a real source frame.
      const inspector = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      await expect(inspector).toBeVisible();
      const preview = inspector.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      await expect(preview).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      await inspector
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.precisePosition') })
        .click();
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
      await expectTimelineSelection(link);
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
      await clickReviewExport(button, 'gallery.videoReview.exportVideo');
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
    await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
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
      await button('gallery.videoReview.zoomAdd').first().click();
      await dialog
        .locator('[data-ui="gallery.videoReview.focusType"]')
        .getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
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
      await dialog
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.preciseArea') })
        .click();
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
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
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
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(dialog.locator('[data-ui="gallery.videoReview.focusType"]')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('spotlight-minimum.png') });
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(
        dialog
          .locator('[data-ui="gallery.videoReview.focusType"]')
          .getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await page.setViewportSize({ width: 1280, height: 720 });
      await timelineGesture(page, 5);
      await button('gallery.videoReview.zoomAdd').first().click();
      const lane = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const link = lane.locator('[data-ui="gallery.videoReview.zoomLink"]');
      await expect(link).toHaveCount(0);
      await dialog
        .locator('[data-ui="gallery.videoReview.focusType"]')
        .getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await expect(link).toHaveCount(1);
      await link.click();
      await expect(link).toHaveAttribute('data-connected', 'true');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await lane.locator('[role="button"]').last().click();
      await dialog
        .locator('[data-ui="gallery.videoReview.focusType"]')
        .getByRole('button', { name: label('gallery.videoReview.zoomRegionLabel'), exact: true })
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
    await button('gallery.videoReview.addComment').and(dialog.locator('aside button')).click();
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
      await expectTimelineSelection(action);
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
      await expect(button('gallery.videoReview.actionCut')).toBeEnabled();
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
      const addNote = button('gallery.videoReview.addComment').and(dialog.locator('aside button'));
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
      const reportIconX = (await report.locator('svg').boundingBox())!.x;
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      const exporting = button('gallery.videoReview.exportVideo');
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
      await page.setViewportSize({ width: 1280, height: 720 });
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      const quality = button('gallery.videoReview.exportQuality');
      await quality.scrollIntoViewIfNeeded();
      await expect(quality).toBeInViewport();
      const downloadBounds = (await button('gallery.videoReview.downloadVideo').boundingBox())!;
      expect(
        (await quality.boundingBox())!.y + (await quality.boundingBox())!.height
      ).toBeLessThanOrEqual(downloadBounds.y);
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
      await exporting.scrollIntoViewIfNeeded();
      await expect(exporting).toBeInViewport({ ratio: 1 });
      await expect(button('gallery.videoReview.downloadVideo')).toBeInViewport({ ratio: 1 });
      await expect(inspector.locator('header h2')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('polish-hd-export.png') });
      await inspector
        .locator('[data-ui="gallery.videoReview.inspectorNavigation"]')
        .getByRole('button', { name: label('gallery.videoReview.speedMode'), exact: true })
        .click();
      const speedValue = inspector.getByRole('button', {
        name: label('gallery.videoReview.speedRate'),
        exact: true,
      });
      await speedValue.scrollIntoViewIfNeeded();
      await speedValue.click();
      await expect(page.getByRole('option', { name: '2×', exact: true })).toBeInViewport();
      await page.keyboard.press('Escape');
      await page.screenshot({ path: testInfo.outputPath('polish-hd-inspector.png') });
      const remove = inspector.getByRole('button', {
        name: label('gallery.videoReview.deleteSelected'),
        exact: true,
      });
      await remove.scrollIntoViewIfNeeded();
      await expect(remove).toBeInViewport();
      await expect(remove).toHaveCSS('min-height', '36px');
      const baseBorder = await remove.evaluate((node) => getComputedStyle(node).borderColor);
      await remove.hover();
      expect(await remove.evaluate((node) => getComputedStyle(node).borderColor)).not.toBe(
        baseBorder
      );
      await page.screenshot({ path: testInfo.outputPath('polish-hd-delete.png') });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('quick editor source audio ranges preserve gain, selection and exported sound', async ({
  page,
}, testInfo) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'ru', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: translate(key, 'ru'), exact: true });
    await button('gallery.videoReview.advancedEditing').click();
    await expect(button('gallery.videoReview.audioTrack')).toHaveAttribute('aria-pressed', 'true');
    await button('gallery.videoReview.originalAudioRange').click();
    const lane = dialog.locator('[data-original-audio-lane]');
    const box = (await lane.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const range = dialog.locator('[data-ui="gallery.videoReview.originalAudioRange"]');
    await expect(range).toHaveCount(1);
    await expect(range).toHaveAttribute('aria-pressed', 'true');
    await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
    await expect(button('gallery.videoReview.muteAudioRange')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('source-audio-range-ru.png') });
    await button('gallery.videoReview.undo').click();
    await expect(range).toHaveCount(0);
    await button('gallery.videoReview.redo').click();
    await expect(range).toHaveCount(1);
    await range.click();
    await button('gallery.videoReview.back').click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await expect(range).toHaveCount(1);
    const downloadPromise = page.waitForEvent('download');
    await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
    const download = await downloadPromise;
    const bytes = await readFile(await download.path());
    const levels = await page.evaluate(async (encoded) => {
      const data = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const context = new AudioContext({ sampleRate: 48000 });
      try {
        const audio = await context.decodeAudioData(data.buffer);
        const pcm = audio.getChannelData(0);
        return [1, 4, 7].map((time) => {
          const from = Math.round(time * audio.sampleRate);
          const window = pcm.subarray(from, from + 4800);
          return Math.sqrt(
            window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
          );
        });
      } finally {
        await context.close();
      }
    }, bytes.toString('base64'));
    expect(levels[0]).toBeGreaterThan(0.01);
    expect(levels[1]).toBeLessThan(0.001);
    expect(levels[2]).toBeGreaterThan(0.01);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`quick editor lane drawing tools and range dragging (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const audio = dialog.locator('[data-original-audio-lane]');
      const focus = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const audioBox = (await audio.boundingBox())!;
      const focusBox = (await focus.boundingBox())!;
      const drag = async (
        box: { x: number; y: number; width: number; height: number },
        from: number,
        to: number
      ) => {
        await page.mouse.move(box.x + box.width * from, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * to, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
      };
      const ranges = dialog.locator('[data-ui="gallery.videoReview.originalAudioRange"]');
      await drag(audioBox, 0.1, 0.2);
      await drag(focusBox, 0.1, 0.2);
      await expect(ranges).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.focusRangePreview"]')).toHaveCount(
        0
      );
      await expect(button('gallery.videoReview.downloadSelection')).toHaveCount(0);
      await button('gallery.videoReview.originalAudioRange').click();
      await expect(button('gallery.videoReview.pointerTool')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      await drag(audioBox, 0.2, 0.4);
      await expect(ranges).toHaveCount(1);
      await expect(ranges).toHaveAttribute('aria-pressed', 'true');
      await expectTimelineSelection(ranges);
      const original = (await ranges.boundingBox())!;
      await drag(audioBox, 0.3, 0.5);
      await expect
        .poll(async () => (await ranges.boundingBox())!.x)
        .toBeGreaterThan(original.x + audioBox.width * 0.18);
      expect(Math.abs((await ranges.boundingBox())!.width - original.width)).toBeLessThan(2);
      const handle = ranges.locator('[data-audio-edge="end"]');
      expect((await handle.boundingBox())!.width).toBe(12);
      await handle.hover();
      await page.mouse.down();
      await page.mouse.move(audioBox.x + audioBox.width * 0.7, audioBox.y + audioBox.height / 2, {
        steps: 10,
      });
      await page.mouse.up();
      await expect
        .poll(async () => (await ranges.boundingBox())!.width)
        .toBeGreaterThan(original.width + audioBox.width * 0.08);
      // A plain click clears the former interval before arming the focus tool.
      await focus.click({ position: { x: focusBox.width * 0.1, y: focusBox.height / 2 } });
      await button('gallery.videoReview.focusRangeTool').click();
      await expect(button('gallery.videoReview.focusRangeTool')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await drag(focusBox, 0.1, 0.3);
      await expect(dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]')).toBeVisible();
      await expectTimelineSelection(focus.locator('[role="button"][aria-pressed="true"]'));
      const focusLabel = focus.locator(
        '[role="button"][aria-pressed="true"] [data-ui="gallery.videoReview.timelineLabel"]'
      );
      await expect(focusLabel).toHaveCSS('font-size', '10px');
      await expect(
        dialog
          .locator(
            '[data-ui="gallery.videoReview.originalAudioRange"] [data-ui="gallery.videoReview.timelineLabel"]'
          )
          .first()
      ).toHaveCSS('font-size', '10px');

      await expect(dialog.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)'
      );
      await expect(button('gallery.videoReview.focusRangeTool')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      const plane = (await dialog
        .locator('[data-ui="gallery.videoReview.timePlane"]')
        .boundingBox())!;
      const playhead = (await dialog
        .locator('[data-ui="gallery.videoReview.playhead"]')
        .boundingBox())!;
      const header = (await dialog
        .locator('[data-ui="gallery.videoReview.trackHeader"]')
        .first()
        .boundingBox())!;
      expect(playhead.y).toBe(plane.y);
      expect(header.y).toBe(plane.y);
      await page.screenshot({ path: testInfo.outputPath('lane-tools.png') });
      await page.setViewportSize({ width: 900, height: 720 });
      await expect(button('gallery.videoReview.focusRangeTool')).toBeInViewport();
      await expect(button('gallery.videoReview.originalAudioRange').first()).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('lane-tools-compact.png') });
      await button('gallery.videoReview.speedMode').click();
      const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      await drag((await source.boundingBox())!, 0.75, 0.9);
      const editLabel = await source
        .locator('[data-ui="gallery.videoReview.editBlock"] button[aria-pressed]')
        .first()
        .getAttribute('aria-label');
      const edit = source.getByRole('button', { name: editLabel!, exact: true }).locator('..');
      await edit.click();
      await expect(edit.locator('button[aria-pressed="true"]')).toHaveCount(1);
      const originalWidth = await edit.evaluate((node) => node.style.width);
      const fitted = edit.locator('[data-ui="gallery.videoReview.timelineLabel"]');
      await expect(edit).toHaveAttribute('title', /2×/);
      for (const [width, mode] of [
        [250, 'full'],
        [80, 'compact'],
        [50, 'value'],
        [38, 'ellipsis'],
      ] as const) {
        await edit.evaluate((node, width) => {
          node.style.width = `${width}px`;
        }, width);
        await expect(fitted).toHaveAttribute('data-mode', mode);
        if (mode === 'value')
          await expect.poll(() => edit.locator('button[aria-pressed]').innerText()).toBe('2×');
        if (mode === 'ellipsis')
          await expect.poll(() => edit.locator('button[aria-pressed]').innerText()).toBe('…');
      }
      await edit.evaluate((node, width) => {
        node.style.width = width;
      }, originalWidth);
      await expect(edit).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(edit).toHaveCSS('border-top-width', '1px');
      const selectedBorder = await edit.evaluate((node) => getComputedStyle(node).borderTopColor);
      await button('gallery.videoReview.pointerTool').click();
      await source.click({ position: { x: 3, y: 3 } });
      await expect(edit.locator('button[aria-pressed="true"]')).toHaveCount(0);
      await expect(edit).not.toHaveCSS('border-top-color', selectedBorder);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`quick editor responsive captions and inspector disclosure (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
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
      const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const toolbar = dialog.locator('[data-ui="gallery.videoReview.toolbar"]');
      const pointer = button('gallery.videoReview.pointerTool');
      const cutTool = button('gallery.videoReview.cutMode');
      await page.mouse.move(0, 0);
      const stroke = await cutTool
        .locator('svg')
        .evaluate((node) => getComputedStyle(node).strokeWidth);
      const iconColor = await cutTool.evaluate((node) => getComputedStyle(node).color);
      await cutTool.hover();
      await expect(cutTool.locator('svg')).toHaveCSS('stroke-width', stroke);
      await expect(cutTool).not.toHaveCSS('color', iconColor);
      await page.mouse.move(0, 0);

      await button('gallery.videoReview.advancedEditing').click();
      for (const [width, height, size] of [
        [1280, 720, 32],
        [1920, 1080, 32],
        [2560, 1440, 32],
        [3840, 2160, 32],
      ] as const) {
        await page.setViewportSize({ width, height });
        await expect(pointer).toHaveCSS('height', `${size}px`);
        await expect(pointer.locator('svg')).toHaveCSS('width', '14px');
        if (width >= 1920) await expect(toolbar).toHaveAttribute('data-labels', 'shown');
        const geometry = await toolbar.evaluate((node) => ({
          width: node.clientWidth,
          content: node.scrollWidth,
        }));
        expect(geometry.content).toBeLessThanOrEqual(geometry.width + 1);
        if (width >= 1280) await expect(toolbar).not.toHaveAttribute('data-layout', 'stacked');
        await expect(pointer).toBeInViewport();
        if ([1280, 1920, 2560, 3840].includes(width))
          await page.screenshot({ path: testInfo.outputPath(`toolbar-${width}.png`) });
        await button('gallery.videoReview.speedMode').click();
        const rate = button('gallery.videoReview.speedRate');
        await expect(rate).toHaveCSS('height', '32px');
        await expect(rate).toHaveCSS('font-size', '12px');
        await expect(rate).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        if (width >= 1920) await expect(toolbar).toHaveAttribute('data-labels', 'shown');
        if (width === 1280) {
          const border = await rate.evaluate((node) => getComputedStyle(node).borderTopColor);
          await rate.hover();
          await expect(rate).not.toHaveCSS('border-top-color', border);
          await page.mouse.move(0, 0);
          const widths = await toolbar.evaluate(async (node) => {
            const values: number[] = [];
            for (let frame = 0; frame < 12; frame++) {
              await new Promise(requestAnimationFrame);
              values.push(
                node.querySelector('[data-toolbar-side="leading"]')!.getBoundingClientRect().width
              );
            }
            return values;
          });
          expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.5);
          await page.screenshot({ path: testInfo.outputPath('toolbar-speed-1280.png') });
        }
        const captions = await toolbar.locator('[data-toolbar-priority]').evaluateAll((buttons) =>
          buttons.map((button) => ({
            priority: Number(button.getAttribute('data-toolbar-priority')),
            hidden: button.hasAttribute('data-caption-hidden'),
          }))
        );
        for (const caption of captions.filter((caption) => caption.hidden)) {
          expect(
            captions
              .filter((other) => other.priority < caption.priority)
              .every((other) => other.hidden)
          ).toBe(true);
        }
        const speedGeometry = await toolbar.evaluate((node) => {
          const leading = node.querySelector('[data-toolbar-side="leading"]')!;
          const transport = node.querySelector('[data-toolbar-transport]')!;
          const trailing = node.querySelector('[data-toolbar-side="trailing"]')!;
          return {
            overflow: node.scrollWidth - node.clientWidth,
            leadingRight: leading.getBoundingClientRect().right,
            transportLeft: transport.getBoundingClientRect().left,
            transportRight: transport.getBoundingClientRect().right,
            trailingLeft: trailing.getBoundingClientRect().left,
          };
        });
        expect(speedGeometry.overflow).toBeLessThanOrEqual(1);
        if (width >= 1280) {
          expect(speedGeometry.leadingRight).toBeLessThanOrEqual(speedGeometry.transportLeft + 1);
          expect(speedGeometry.transportRight).toBeLessThanOrEqual(speedGeometry.trailingLeft + 1);
        }
        if (width >= 1280) await expect(toolbar).not.toHaveAttribute('data-layout', 'stacked');
        await expect(button('gallery.videoReview.fit')).toBeInViewport();
        await pointer.click();
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
      await button('gallery.videoReview.zoomAdd').click();
      const inspector = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      const position = inspector.locator('details[data-level="group"]');
      await expect(position).not.toHaveAttribute('open', '');
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.zoomFocusX'),
          exact: true,
        })
      ).toHaveCount(0);
      await position.locator('summary').click();
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.zoomFocusX'),
          exact: true,
        })
      ).toBeVisible();
      await position.locator('summary').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.focusType"]')
        .getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await expect(inspector.locator('details[data-level="group"]')).not.toHaveAttribute(
        'open',
        ''
      );
      const entry = inspector.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionIn'),
        exact: true,
      });
      const exit = inspector.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionOut'),
        exact: true,
      });
      await entry
        .getByRole('button', { name: label('gallery.videoReview.focusReveal'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusContract'), exact: true })
        .click();
      await expect(
        exit.getByRole('button', { name: label('gallery.videoReview.focusReveal'), exact: true })
      ).toContainText(label('gallery.videoReview.focusFade'));
      await exit
        .getByRole('button', { name: label('gallery.videoReview.focusReveal'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusExpand'), exact: true })
        .click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.exportFooter"]')).toHaveCount(0);
      const noteGroup = toolbar.locator('[data-ui="gallery.videoReview.noteHistoryTools"]');
      await expect(noteGroup.locator('button').first()).toHaveAttribute(
        'aria-label',
        label('gallery.videoReview.addComment')
      );
      await expect(noteGroup.locator('button').nth(1)).toHaveAttribute(
        'aria-label',
        label('gallery.videoReview.undo')
      );
      await noteGroup
        .getByRole('button', { name: label('gallery.videoReview.addComment'), exact: true })
        .click();
      const text = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.commentText'),
        exact: true,
      });
      await expect(text).toBeFocused();
      await text.fill('Toolbar note');
      await button('gallery.videoReview.save').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.exportFooter"]')).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.reportActions"]')).toBeVisible();
      await button('gallery.videoReview.scene').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.exportFooter"]')).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.reportActions"]')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const advanced of [false, true]) {
  for (const variant of [
    { locale: 'ru' as const, theme: 'light' as const },
    { locale: 'ru' as const, theme: 'dark' as const },
    { locale: 'en' as const, theme: 'light' as const },
    { locale: 'en' as const, theme: 'dark' as const },
  ]) {
    const testTitle = [
      'quick editor automatic ranges and export fit',
      `(${variant.locale}, ${variant.theme}, advanced=${advanced})`,
    ].join(' ');
    test(testTitle, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: variant.theme });
      const host = await startHostServer();
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: {
            'sniptale-locale-preference': variant.locale,
            'sniptale-theme-preference': variant.theme,
          },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
        await seedReviewVideo(page, 'review-vp8-opus.webm', {
          width: 160,
          height: 90,
          duration: 12,
        });
        await page.reload();
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        const dialog = page.locator('dialog');
        const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
        const button = (key: Parameters<typeof translate>[0]) =>
          dialog.getByRole('button', { name: label(key), exact: true });
        if (advanced) await button('gallery.videoReview.advancedEditing').click();
        const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
        for (const tool of [
          'gallery.videoReview.speedMode',
          'gallery.videoReview.cutMode',
        ] as const) {
          await button('gallery.videoReview.pointerTool').click();
          await source.click({ position: { x: 2, y: 2 } });
          await button(tool).click();
          const box = (await source.boundingBox())!;
          await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 8 });
          await page.mouse.up();
          const fields = dialog.locator('[data-ui="gallery.videoReview.editRangeFields"]');
          const navigation = dialog.locator('[data-ui="gallery.videoReview.inspectorNavigation"]');
          await expect(navigation).toBeVisible();
          await expect(
            dialog
              .locator('aside')
              .getByRole('button', { name: label('gallery.videoReview.addComment'), exact: true })
          ).toHaveCount(0);
          await navigation
            .getByRole('button', { name: label('gallery.videoReview.comments'), exact: true })
            .click();
          await expect(fields).toHaveCount(0);
          await expect(
            dialog.locator('[data-ui="gallery.videoReview.reportActions"]')
          ).toBeVisible();
          await navigation
            .getByRole('button', {
              name: label(
                tool === 'gallery.videoReview.speedMode' ? tool : 'gallery.videoReview.cutLabel'
              ),
              exact: true,
            })
            .click();
          await expect(dialog.locator('[data-ui="gallery.videoReview.reportActions"]')).toHaveCount(
            0
          );
          await expect(
            fields.getByRole('button', {
              name: label('gallery.videoReview.applyRange'),
              exact: true,
            })
          ).toHaveCount(0);

          const input = fields.getByRole('textbox', {
            name: label('gallery.videoReview.rangeStart'),
            exact: true,
          });
          const original = await input.inputValue();
          const row = input.locator(
            'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]'
          );
          await row.hover();
          const slider = row.locator('input[type="range"]');
          const sliderBox = (await slider.boundingBox())!;
          await page.mouse.move(
            sliderBox.x + sliderBox.width * 0.35,
            sliderBox.y + sliderBox.height / 2
          );
          await page.mouse.down();
          await page.mouse.move(
            sliderBox.x + sliderBox.width * 0.5,
            sliderBox.y + sliderBox.height / 2,
            { steps: 15 }
          );
          await expect(slider).toBeEnabled();
          await expect(input).not.toHaveValue(original);
          await page.mouse.up();
          const releasedValue = await input.inputValue();
          await button('gallery.videoReview.undo').click();
          await expect(input).toHaveValue(original);
          await button('gallery.videoReview.redo').click();
          await expect(input).toHaveValue(releasedValue);
          const steppedFrom = Number(releasedValue);
          const increase = fields.getByRole('button', {
            name: `${label('gallery.videoReview.rangeStart')} increase`,
            exact: true,
          });
          await increase.hover();
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
          expect(Number(await input.inputValue())).toBeGreaterThan(steppedFrom);
          await input.click();
          await row.hover();
          await expect(row).toHaveAttribute('data-range-visible', 'false');
          await expect(
            row.locator('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]')
          ).toHaveAttribute('aria-hidden', 'true');
          await input.press('Enter');
          const beforeUndo = await input.inputValue();
          await expect(dialog.getByRole('alert')).toHaveCount(0);
          await expect(button('gallery.videoReview.undo')).toBeEnabled();
          await button('gallery.videoReview.undo').click();
          await expect(input).not.toHaveValue(beforeUndo);
          await page.screenshot({
            path: testInfo.outputPath(
              `inspector-${tool.endsWith('speedMode') ? 'speed' : 'cut'}.png`
            ),
          });
          await dialog
            .locator('aside')
            .getByRole('button', { name: label('gallery.videoReview.deleteSelected'), exact: true })
            .click();
        }
        if (!advanced) await button('gallery.videoReview.advancedEditing').click();
        await button('gallery.videoReview.scene').click();
        await button('gallery.videoReview.backgroundGradient').click();
        await expect(
          dialog.locator('[data-ui="gallery.videoReview.gradientPresets"] button')
        ).toHaveCount(10);
        const paint = dialog.locator(
          '[data-ui="gallery.videoReview.backgroundInspector"] [data-ui="shared.ui.paint-selector"]'
        );
        await expect(paint).toHaveAttribute('data-trigger-variant', 'swatch');
        const paintButton = paint.locator('[data-ui="shared.ui.paint-selector.trigger"]');
        await expect(paintButton.locator('.lucide-palette')).toHaveCount(1);
        await expect(paintButton).toHaveCSS('border-top-width', '0px');
        await paintButton.click();
        await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toBeVisible();
        await paintButton.click();
        await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toHaveCount(0);
        const backgroundChoice = button('gallery.videoReview.backgroundGradient');
        await backgroundChoice.hover();
        await expect(backgroundChoice).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(backgroundChoice).toHaveCSS('box-shadow', 'none');
        const inspectorPanel = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
        const labels = inspectorPanel.locator(
          [
            '[data-ui="shared.ui.compact-inspector.numeric-row"] > span:first-child',
            '[data-ui="shared.ui.compact-inspector.select-field"] > span:first-child',
          ].join(', ')
        );
        const fonts = await labels.evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return `${style.fontSize}|${style.fontWeight}|${style.color}`;
          })
        );
        expect(new Set(fonts).size).toBe(1);
        const preset = dialog
          .locator('[data-ui="gallery.videoReview.gradientPresets"] button')
          .first();
        await preset.click();
        await expect(preset).toHaveAttribute('aria-pressed', 'true');
        await expect(preset).toHaveCSS('outline-style', 'solid');

        await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
        const exporting = dialog.locator('[data-ui="gallery.videoReview.exportSettings"]');
        await expect(exporting).toBeVisible();
        for (const width of [1920, 1280]) {
          await page.setViewportSize({ width, height: width === 1920 ? 1080 : 720 });
          await expect
            .poll(() =>
              dialog.locator('aside').evaluate((node) => {
                const nodes = [
                  node,
                  ...node.querySelectorAll(
                    [
                      '[data-ui="gallery.videoReview.exportSection"]',
                      '[data-ui="gallery.videoReview.exportSettings"]',
                      'fieldset',
                    ].join(', ')
                  ),
                ];
                return Math.max(...nodes.map((item) => item.scrollWidth - item.clientWidth));
              })
            )
            .toBeLessThanOrEqual(1);
          await page.screenshot({ path: testInfo.outputPath(`export-fit-${width}.png`) });
        }
      } finally {
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

test('quick editor preview has no black raster seam after resizing and changing modes', async ({
  page,
}, testInfo) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'ru' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-avc-padded-color.mp4', {
      width: 1904,
      height: 984,
      duration: 2,
    });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    const stage = dialog.locator('[data-ui="gallery.videoReview.stage"]');
    await expect
      .poll(() => stage.locator('video').evaluate((v) => v.readyState))
      .toBeGreaterThan(1);
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: translate(key, 'ru'), exact: true });
    for (const [width, height] of [
      [1920, 1080],
      [1280, 720],
      [900, 900],
      [2560, 720],
    ]) {
      await page.setViewportSize({ width: width!, height: height! });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      await button('gallery.videoReview.backgroundSolid').click();
      const padding = dialog.getByRole('textbox', {
        name: translate('gallery.videoReview.backgroundPadding', 'ru'),
        exact: true,
      });
      await padding.fill('48');
      await padding.press('Enter');
      await button('gallery.videoReview.advancedEditing').click();
      const screenshot = await page.screenshot({
        path: testInfo.outputPath(`preview-${width}.png`),
      });
      const bounds = await stage.boundingBox();
      expect(bounds).not.toBeNull();
      const edges = await page.evaluate(
        async ({ encoded, box }) => {
          const image = new Image();
          const loaded = new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
          });
          image.src = `data:image/png;base64,${encoded}`;
          await loaded;
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const x = Math.floor(box.x + box.width / 2),
            y = Math.floor(box.y + box.height / 2);
          return [
            [x, Math.ceil(box.y + box.height) - 1],
            [Math.ceil(box.x + box.width) - 1, y],
          ].map(([px, py]) => Array.from(context.getImageData(px!, py!, 1, 1).data).slice(0, 3));
        },
        { encoded: screenshot.toString('base64'), box: bounds! }
      );
      // The synthetic fixture has bright bottom/right edges; a black pixel belongs to the stage.
      for (const edge of edges) expect(Math.max(...edge)).toBeGreaterThan(64);
    }
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`quick inspector section hierarchy and navigation (${locale}, ${theme})`, async ({
      page,
    }, info) => {
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      try {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: {
            'sniptale-locale-preference': locale,
            'sniptale-theme-preference': theme,
          },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await seedReviewVideo(page, 'review-vp8-opus.webm', {
          width: 160,
          height: 90,
          duration: 12,
        });
        await page.reload();
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        const dialog = page.locator('dialog');
        const button = (key: Parameters<typeof translate>[0]) =>
          dialog.getByRole('button', { name: label(key), exact: true });
        await button('gallery.videoReview.advancedEditing').click();
        await button('gallery.videoReview.zoomAdd').click();
        const panel = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
        const zoom = panel.locator('[data-ui="gallery.videoReview.zoomInspector"]');
        for (const width of [1280, 1920]) {
          await page.setViewportSize({ width, height: 1000 });
          for (let direction = 0; direction < 2; direction++) {
            const samples = await panel.evaluate(async (inspector) => {
              const layout = inspector.parentElement!;
              const viewport = layout.querySelector<HTMLElement>(
                '[data-ui="gallery.videoReview.timelineViewport"]'
              )!;
              const stage = layout.querySelector<HTMLElement>('main')!;
              const samples: Array<{ overflow: number; height: number }> = [];
              const sample = () =>
                samples.push({
                  overflow: viewport.scrollWidth - viewport.clientWidth,
                  height: stage.getBoundingClientRect().height,
                });
              const observer = new MutationObserver(sample);
              observer.observe(layout, {
                subtree: true,
                attributes: true,
                attributeFilter: ['class'],
              });
              sample();
              inspector.querySelector<HTMLButtonElement>('header button[aria-pressed]')!.click();
              for (let frame = 0; frame < 12; frame++) {
                await new Promise(requestAnimationFrame);
                sample();
              }
              observer.disconnect();
              return samples;
            });
            expect(Math.max(...samples.map((frame) => frame.overflow))).toBeLessThanOrEqual(1);
            const bounds = [samples[0]!.height, samples.at(-1)!.height];
            for (const frame of samples) {
              expect(frame.height).toBeGreaterThanOrEqual(Math.min(...bounds) - 1);
              expect(frame.height).toBeLessThanOrEqual(Math.max(...bounds) + 1);
            }
          }
        }
        const timelineZoom = dialog.getByRole('slider', {
          name: label('videoEditor.timeline.zoom'),
          exact: true,
        });
        await timelineZoom.press('End');
        const timelineViewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
        await expect
          .poll(() => timelineViewport.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeGreaterThan(100);
        await timelineViewport.evaluate((node) => {
          node.scrollLeft = 100;
        });
        await expect
          .poll(() => timelineViewport.evaluate((node) => node.scrollLeft))
          .toBeGreaterThan(0);
        await button('gallery.videoReview.fit').click();
        await expect
          .poll(() => timelineViewport.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeLessThanOrEqual(1);

        const nested = zoom.locator('details[data-level="group"]');
        const parents = zoom.locator('details[data-level="section"]');
        await expect(parents).toHaveCount(2);
        await expect(parents.first().locator('summary').first()).toHaveCSS('font-weight', '600');
        await expect(nested.locator('summary')).toHaveCSS('font-size', '12px');
        await expect(nested.locator('summary')).toHaveCSS('font-weight', '500');
        await expect(nested).toHaveCSS('border-top-width', '0px');
        await nested.locator('summary').hover();
        await expect(nested.locator('summary')).not.toHaveCSS('box-shadow', 'none');
        await expect(zoom.locator('.review-inspector-phase').first()).toHaveCSS(
          'border-top-width',
          '0px'
        );
        const remove = button('gallery.videoReview.zoomDelete');
        const resetColor = await button('gallery.videoReview.zoomResetPosition').evaluate(
          (node) => getComputedStyle(node).color
        );
        await expect(remove).toHaveCSS('color', resetColor);
        await remove.hover();
        await expect(remove).not.toHaveCSS('color', resetColor);
        await page.mouse.move(0, 0);
        await nested.locator('summary').focus();
        await page.keyboard.press('Space');
        await expect(nested).toHaveAttribute('open', '');
        await expect.poll(() => dialog.locator('video').evaluate((node) => node.paused)).toBe(true);
        const focusX = zoom.getByRole('textbox', {
          name: label('gallery.videoReview.zoomFocusX'),
          exact: true,
        });
        await focusX.fill('61');
        await focusX.press('Enter');
        await nested.locator('summary').click();
        await nested.locator('summary').click();
        await expect(focusX).toHaveValue('61');
        const modes = zoom.locator('[data-ui="gallery.videoReview.previewMode"]');
        const fill = modes.locator(':scope > span[aria-hidden]');
        await expect(fill).toHaveCSS('box-shadow', 'none');
        const neutral = await fill.evaluate((node) => getComputedStyle(node).backgroundColor);
        await expect(modes).toHaveCSS('border-top-width', '0px');
        await expect(modes).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await modes
          .getByRole('button', {
            name: label('gallery.videoReview.zoomPreviewResult'),
            exact: true,
          })
          .click();
        await expect(fill).toHaveCSS('background-color', neutral);
        await expect(modes.locator('[aria-pressed="true"]')).toHaveCSS('font-weight', '500');
        await expect(modes.locator('[aria-pressed="true"]')).toHaveCSS('box-shadow', 'none');
        const toggle = panel.locator('[data-ui="gallery.videoReview.inspectorPresentation"]');
        for (const utility of await panel.locator('header button').all()) {
          await checkInspectorUtility(page, utility);
        }
        await checkInspectorLabels(panel);
        await page.screenshot({ path: info.outputPath('inspector-utilities.png') });
        const toggleClass = await toggle.getAttribute('class');
        await toggle.click();
        await expect(toggle).toHaveAttribute('class', toggleClass!);
        await checkInspectorUtility(page, toggle);
        await checkInspectorLabels(panel);
        const categories = panel.locator('[data-ui="gallery.videoReview.inspectorCategories"]');
        const railGeometry = await categories.evaluate((node) => {
          const nav = node.querySelector('nav')!.getBoundingClientRect();
          const button = node.querySelector('nav button')!.getBoundingClientRect();
          let scroll = node.parentElement!;
          while (scroll && getComputedStyle(scroll).overflowY !== 'auto')
            scroll = scroll.parentElement!;
          const viewport = scroll.getBoundingClientRect();
          return {
            left: button.left - nav.left,
            right: nav.right - button.right - 1,
            visible: button.left >= viewport.left && button.right <= viewport.right,
          };
        });
        expect(railGeometry.visible).toBe(true);
        expect(Math.abs(railGeometry.left - railGeometry.right)).toBeLessThanOrEqual(1);
        expect(railGeometry.left).toBeGreaterThanOrEqual(6);
        const animation = categories.locator('nav').getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAnimation'),
          exact: true,
        });
        await animation.hover();
        await expect(animation).toHaveAttribute('aria-pressed', 'false');
        await animation.focus();
        await page.keyboard.press('Space');
        await expect(animation).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog).not.toHaveAttribute('data-playback-focus', 'true');
        await expect(zoom.locator('[data-ui="gallery.videoReview.zoomPreview"]')).toHaveCount(0);
        await page.keyboard.press('ArrowUp');
        await expect(categories.locator('nav button').first()).toHaveAttribute(
          'aria-pressed',
          'true'
        );
        await expect(zoom.locator('[data-ui="gallery.videoReview.zoomPreview"]')).toBeVisible();
        await panel.locator('header h2').click();
        for (const width of [1280, 1920]) {
          await page.setViewportSize({ width, height: 1000 });
          await expect
            .poll(() => panel.evaluate((node) => node.scrollWidth - node.clientWidth))
            .toBeLessThanOrEqual(1);
          await info.attach(`quick-zoom-sections-${width}`, {
            body: await panel.screenshot(),
            contentType: 'image/png',
          });
        }
        await panel
          .locator('[data-ui="gallery.videoReview.inspectorNavigation"]')
          .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
          .click();
        await expect(categories.locator('nav button')).toHaveCount(3);
        await categories
          .locator('nav')
          .getByRole('button', { name: label('gallery.videoReview.background'), exact: true })
          .click();
        await button('gallery.videoReview.backgroundSolid').click();
        const paint = panel.locator('[data-ui="shared.ui.paint-selector.trigger"]');
        await paint.click();
        await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toBeVisible();
        await toggle.click();
        await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toHaveCount(0);
        const sceneSections = panel.locator('details[data-level="section"]');
        await expect(sceneSections).toHaveCount(3);
        const background = sceneSections.filter({
          has: page.locator('[data-ui="gallery.videoReview.backgroundInspector"]'),
        });
        await background.locator(':scope > summary').click();
        await expect(background).not.toHaveAttribute('open', '');
        await background.locator(':scope > summary').click();
        await expect(paint).toContainText('#');
        await info.attach('quick-scene-all', {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
        await background.locator(':scope > summary').click();
        await expect(background).not.toHaveAttribute('open', '');
        await dialog.locator('video').evaluate(async (video) => {
          await new Promise<void>((resolve) => {
            video.addEventListener('seeked', () => resolve(), { once: true });
            video.currentTime = 5;
          });
        });
        await button('gallery.videoReview.zoomAdd').click();
        await expect(zoom.locator('details[data-level="group"]')).toHaveAttribute('open', '');
        await panel
          .locator('[data-ui="gallery.videoReview.inspectorNavigation"]')
          .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
          .click();
        await expect(background).not.toHaveAttribute('open', '');
      } finally {
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor retains focus and speed beneath a cut at HD in ${variant.locale}/${variant.theme}`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
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
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.focusRangeTool').click();
      const focusLane = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const lane = (await focusLane.boundingBox())!;
      await page.mouse.move(lane.x + lane.width / 12, lane.y + lane.height / 2);
      await page.mouse.down();
      await page.mouse.move(lane.x + (lane.width * 5) / 12, lane.y + lane.height / 2, {
        steps: 10,
      });
      await page.mouse.up();
      const focus = focusLane.locator('[role="button"][data-cut-suppressed]');
      await expect(focus).toHaveCount(1);
      await button('gallery.videoReview.pointerTool').click();
      await timelineGesture(page, 9);
      await button('gallery.videoReview.speedMode').click();
      await timelineGesture(page, 1, 5);
      await button('gallery.videoReview.pointerTool').click();
      await timelineGesture(page, 9);
      await button('gallery.videoReview.cutMode').click();
      await timelineGesture(page, 2, 4);
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'true');
      const sourceLane = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      await expect(sourceLane.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(2);
      await expect(
        sourceLane.locator('[data-ui="gallery.videoReview.editBlock"][data-cut-suppressed="true"]')
      ).toHaveCount(1);
      await focus.click();
      const inspector = dialog.locator('aside');
      await expect(
        inspector.getByText(translate('gallery.videoReview.cutOverlapHint', variant.locale), {
          exact: false,
        })
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`cut-retained-${variant.locale}-${variant.theme}.png`),
      });
      await button('gallery.videoReview.undo').click();
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'false');
      await button('gallery.videoReview.redo').click();
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'true');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [data-cut-suppressed="true"]')
      ).toHaveCount(1);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor preserves authored focus geometry while dragging across Cut at HD in ${variant.locale}/${variant.theme}`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
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
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.focusRangeTool').click();
      const focusLane = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const lane = (await focusLane.boundingBox())!;
      await page.mouse.move(lane.x + lane.width / 12, lane.y + lane.height / 2);
      await page.mouse.down();
      await page.mouse.move(lane.x + (lane.width * 5) / 12, lane.y + lane.height / 2, {
        steps: 10,
      });
      await page.mouse.up();
      const focus = focusLane.locator('[role="button"][data-cut-suppressed]');
      await expect(focus).toHaveCount(1);
      await button('gallery.videoReview.pointerTool').click();
      const authored = await focus.boundingBox();
      await timelineGesture(page, 9);
      await button('gallery.videoReview.cutMode').click();
      await timelineGesture(page, 2, 7);
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'true');
      expect((await focus.boundingBox())!.width).toBeCloseTo(authored!.width, 0);
      expect((await focus.boundingBox())!.x).toBeCloseTo(authored!.x, 0);
      await button('gallery.videoReview.pointerTool').click();
      const dragBy = async (seconds: number) => {
        const box = (await focus.boundingBox())!;
        const start = box.x + box.width / 2;
        await page.keyboard.down('Shift');
        await page.mouse.move(start, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(start + (lane.width * seconds) / 12, box.y + box.height / 2, {
          steps: 10,
        });
        await page.mouse.up();
        await page.keyboard.up('Shift');
        await expect
          .poll(async () => (await focus.boundingBox())!.width)
          .toBeCloseTo(authored!.width, 0);
      };
      await dragBy(2);
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'true');
      const hidden = (await focus.boundingBox())!;
      expect(hidden.x - authored!.x).toBeCloseTo((lane.width * 2) / 12, 0);
      await dragBy(4);
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'false');
      await dragBy(-1);
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'true');
      const partial = (await focus.boundingBox())!;
      await page.screenshot({
        path: testInfo.outputPath(`cut-retained-${variant.locale}-${variant.theme}.png`),
      });
      await button('gallery.videoReview.undo').click();
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'false');
      await button('gallery.videoReview.redo').click();
      await expect(focus).toHaveAttribute('data-cut-suppressed', 'true');
      expect((await focus.boundingBox())!.x).toBeCloseTo(partial.x, 0);
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [data-cut-suppressed="true"]')
      ).toHaveCount(1);
      expect((await focus.boundingBox())!.width).toBeCloseTo(authored!.width, 0);
      expect((await focus.boundingBox())!.x).toBeCloseTo(partial.x, 0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  const testName =
    `quick editor voiceover strip supports pause and optional cap at HD ` +
    `in ${variant.locale}/${variant.theme}`;
  test(testName, async ({ page }, testInfo) => {
    const host = await startHostServer();
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
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.recordVoiceover').click();
      const strip = dialog.locator('[data-ui="gallery.videoReview.voiceoverStrip"]');
      await expect(strip).toBeVisible();
      await expect(
        strip.getByRole('switch', {
          name: translate('gallery.videoReview.voiceoverDurationLimit', variant.locale),
        })
      ).toBeChecked();
      const playVideo = strip.getByRole('switch', {
        name: translate('videoEditor.app.recordAudioPlayVideo', variant.locale),
      });
      await expect(playVideo).toBeChecked();
      if (variant.locale === 'en') await playVideo.uncheck();
      const numericLimit = strip.getByRole('spinbutton', {
        name: translate('gallery.videoReview.voiceoverDurationLimit', variant.locale),
      });
      await expect(numericLimit).toBeVisible();
      const startCapture = strip.getByRole('button', {
        name: translate('videoEditor.app.recordAudioStart', variant.locale),
        exact: true,
      });
      await numericLimit.fill('');
      await expect(startCapture).toBeDisabled();
      await expect(strip.getByRole('alert')).toBeVisible();
      await numericLimit.fill('999999');
      await expect(startCapture).toBeDisabled();
      await numericLimit.fill('1');
      await expect(startCapture).toBeEnabled();
      await expect(numericLimit).toBeInViewport();
      await expect(startCapture).toBeInViewport();
      await expect(dialog.locator('[inert]')).toHaveCount(1);
      await page.screenshot({
        path: testInfo.outputPath(`voiceover-ready-${variant.locale}-${variant.theme}.png`),
      });
      const durationLimit = strip.getByRole('switch', {
        name: translate('gallery.videoReview.voiceoverDurationLimit', variant.locale),
      });
      await durationLimit.uncheck();
      await expect(durationLimit).not.toBeChecked();
      await page.evaluate(() => {
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const destination = audio.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          configurable: true,
          value: async () => destination.stream,
        });
      });
      await strip
        .getByRole('button', {
          name: translate('videoEditor.app.recordAudioStart', variant.locale),
        })
        .click();
      await expect(
        strip.getByRole('button', {
          name: translate('videoEditor.app.recordAudioPause', variant.locale),
        })
      ).toBeVisible();
      await expect(strip.getByRole('meter')).toHaveAttribute(
        'aria-label',
        translate('videoEditor.app.recordAudioSignal.label', variant.locale)
      );
      await expect(strip.locator('[data-ui="audio-recording.level"]')).not.toContainText(
        'videoEditor.app'
      );
      await expect
        .poll(() =>
          dialog
            .locator('video')
            .first()
            .evaluate((video) => video.muted)
        )
        .toBe(true);
      const playback = dialog.locator('[data-toolbar-transport] button[aria-pressed]');
      await expect(playback).toHaveAttribute(
        'aria-label',
        translate(
          variant.locale === 'ru' ? 'gallery.videoReview.pause' : 'gallery.videoReview.play',
          variant.locale
        )
      );
      await expect(
        playback.locator(variant.locale === 'ru' ? 'svg.lucide-pause' : 'svg.lucide-play')
      ).toHaveCount(1);
      await expect(playback.locator('[data-review-toolbar-label]')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`voiceover-recording-${variant.locale}-${variant.theme}.png`),
      });
      await strip
        .getByRole('button', {
          name: translate('videoEditor.app.recordAudioPause', variant.locale),
        })
        .click();
      await expect(
        strip.getByRole('button', {
          name: translate('videoEditor.app.recordAudioResume', variant.locale),
        })
      ).toBeVisible();
      await expect(playback).toHaveAttribute(
        'aria-label',
        translate('gallery.videoReview.play', variant.locale)
      );
      await expect(playback.locator('svg.lucide-play')).toHaveCount(1);
      await page.screenshot({
        path: testInfo.outputPath(`voiceover-paused-${variant.locale}-${variant.theme}.png`),
      });
      const confirmation = dialog.getByRole('alertdialog');
      const closeRecorder = strip.getByRole('button', {
        name: translate('common.actions.close', variant.locale),
        exact: true,
      });
      await closeRecorder.click();
      await expect(confirmation).toBeVisible();
      await expect(
        confirmation.getByRole('button', {
          name: translate('videoEditor.app.recordAudioKeep', variant.locale),
          exact: true,
        })
      ).toBeFocused();
      await page.screenshot({
        path: testInfo.outputPath(`voiceover-discard-${variant.locale}-${variant.theme}.png`),
      });
      await page.keyboard.press('Space');
      await expect(confirmation).toHaveCount(0);
      await expect(closeRecorder).toBeFocused();
      await strip
        .getByRole('button', {
          name: translate('videoEditor.app.recordAudioResume', variant.locale),
        })
        .click();
      await strip
        .getByRole('button', { name: translate('videoEditor.app.recordAudioStop', variant.locale) })
        .click();
      await expect(
        strip.getByRole('button', {
          name: translate('videoEditor.app.recordAudioSave', variant.locale),
        })
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`voiceover-take-${variant.locale}-${variant.theme}.png`),
      });
      await expect(strip.locator('header')).toContainText(
        translate('gallery.videoReview.recordVoiceover', variant.locale)
      );
      expect(await strip.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
      await expect(strip.locator('footer')).toBeInViewport();
      expect((await strip.locator('footer').boundingBox())!.y).toBeGreaterThan(
        (await strip.locator('[data-ui="video-editor.audio-recording.playback"]').boundingBox())!.y
      );
      const takeUrl = await strip.locator('audio').getAttribute('src');
      const original = await strip.locator('audio').evaluate(async (audio) => {
        const bytes = await (await fetch(audio.src)).arrayBuffer();
        const context = new AudioContext();
        try {
          const decoded = await context.decodeAudioData(bytes.slice(0));
          return {
            hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
              .map((value) => value.toString(16).padStart(2, '0'))
              .join(''),
            duration: decoded.duration,
            samples: decoded.length,
          };
        } finally {
          await context.close();
        }
      });
      const originalDownload = page.waitForEvent('download');
      await strip
        .getByRole('button', {
          name: translate('videoEditor.app.recordAudioDownloadOriginal', variant.locale),
          exact: true,
        })
        .click();
      const originalFile = await originalDownload;
      expect(
        createHash('sha256')
          .update(await readFile(await originalFile.path()))
          .digest('hex')
      ).toBe(original.hash);
      expect(original.duration).toBeGreaterThan(0);
      expect(original.samples).toBeGreaterThan(0);
      await expect(strip.locator('audio')).toHaveAttribute('src', takeUrl!);
      const previousAudio = await recordedAudioResources(page);

      await strip
        .getByRole('button', {
          name: translate('videoEditor.app.recordAudioAgain', variant.locale),
          exact: true,
        })
        .click();
      await expect(confirmation).toBeVisible();
      await confirmation
        .getByRole('button', {
          name: translate('videoEditor.app.recordAudioKeep', variant.locale),
          exact: true,
        })
        .click();
      await expect(strip.locator('audio')).toHaveAttribute('src', takeUrl!);
      await closeRecorder.click();
      await expect(confirmation).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(strip.locator('audio')).toHaveAttribute('src', takeUrl!);
      await strip
        .getByRole('button', {
          name: translate('videoEditor.app.recordAudioSave', variant.locale),
        })
        .click();
      await expect(strip).toHaveCount(0);
      await expect(dialog.locator('[inert]')).toHaveCount(0);
      await expect(dialog.locator('[data-audio-lane="voiceover"] [role="button"]')).toHaveCount(1);
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(dialog.locator('[data-audio-lane="voiceover"] [role="button"]')).toHaveCount(1);
      const retained = await recordedAudioResources(
        page,
        previousAudio.map((item) => item.key)
      );
      expect(retained).toHaveLength(1);
      expect(retained[0]!.duration).toBeGreaterThan(0);
      expect(retained[0]!.samples).toBeGreaterThan(0);
      expect(retained[0]!.peak).toBeGreaterThan(0.01);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor jumps to timeline endpoints at HD (${variant.locale}/${variant.theme})`, async ({
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
      const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      const start = dialog.getByRole('button', {
        name: label('gallery.videoReview.timelineStart'),
      });
      const end = dialog.getByRole('button', { name: label('gallery.videoReview.timelineEnd') });
      await expect(start).toBeDisabled();
      await expect(end).toBeEnabled();
      await timelineGesture(page, 2, 4);
      const range = dialog.locator('[data-ui="gallery.videoReview.sourceRange"]');
      await expect(range).toBeVisible();
      const rangeBox = (await range.boundingBox())!;
      await dialog.getByRole('slider', { name: label('videoEditor.timeline.zoom') }).press('End');
      await end.click();
      await expect(end).toBeDisabled();
      await expect
        .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
        .toBeGreaterThan(11.9);
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await expect(range).toBeVisible();
      expect((await range.boundingBox())!.width).toBeCloseTo(rangeBox.width * 16, -1);
      expect(
        await dialog.locator('video').evaluate((video: HTMLVideoElement) => video.paused)
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`timeline-end-${variant.locale}-${variant.theme}.png`),
      });
      await start.click();
      await expect(start).toBeDisabled();
      await expect.poll(async () => Number(await plane.getAttribute('aria-valuenow'))).toBe(0);
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBe(0);
      await plane.focus();
      await page.keyboard.press('End');
      await expect(end).toBeDisabled();
      await expect(range).toBeVisible();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`gallery video owns Space from every focused control at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }) => {
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
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.addStyleTag({
        content: await readFile('apps/extension/src/gallery/shell/app-shell/startup.css', 'utf8'),
      });
      const card = page.getByRole('group', { name: 'beta-v1.webm', exact: true });
      await card.focus();
      await page.keyboard.press('Enter');
      const surface = page.locator('[data-ui="gallery.preview.surface"]');
      const player = surface.locator('[data-ui="gallery.preview.player"]');
      const video = player.locator('video');
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
        .toBeGreaterThanOrEqual(2);
      const controls = [
        player.getByRole('button', { name: label('gallery.preview.player.scale'), exact: true }),
        player.getByRole('button', { name: label('gallery.preview.player.speed'), exact: true }),
        player.getByRole('slider', { name: label('gallery.preview.player.volume'), exact: true }),
        player.getByRole('button', { name: label('gallery.preview.player.mute'), exact: true }),
      ];
      for (const control of controls) {
        await control.focus();
        const before = await video.evaluate((node: HTMLVideoElement) => ({
          paused: node.paused,
          muted: node.muted,
          volume: node.volume,
          speed: node.playbackRate,
        }));
        await page.keyboard.press('Space');
        await expect
          .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
          .toBe(!before.paused);
        await expect(control).toBeFocused();
        await expect(page.getByRole('listbox')).toHaveCount(0);
        expect(
          await video.evaluate((node: HTMLVideoElement) => ({
            muted: node.muted,
            volume: node.volume,
            speed: node.playbackRate,
          }))
        ).toEqual({ muted: before.muted, volume: before.volume, speed: before.speed });
        expect(
          await control.evaluate((node) => {
            const css = getComputedStyle(node);
            return { outline: css.outlineStyle, shadow: css.boxShadow };
          })
        ).toEqual({ outline: 'none', shadow: 'none' });
      }
      await controls[0]!.focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      await expect(page.locator('html')).not.toHaveAttribute('data-video-editor-focus');
      // Native probes exercise browser default actions outside the player's own control subtree.
      await surface.evaluate((node) => {
        const probes = document.createElement('div');
        probes.dataset.spaceProbes = '';
        probes.innerHTML =
          '<input aria-label="Space checkbox probe" type="checkbox">' +
          '<input aria-label="Space text probe" value="unchanged">' +
          '<details><summary>Space disclosure probe</summary>Details</details>';
        node.append(probes);
      });
      const probes = [
        surface.getByRole('switch', { name: 'Space checkbox probe' }),
        surface.getByRole('textbox', { name: 'Space text probe' }),
        surface.locator('[data-space-probes] summary'),
      ];
      for (const probe of probes) {
        await probe.focus();
        const paused = await video.evaluate((node: HTMLVideoElement) => node.paused);
        await page.keyboard.press('Space');
        await expect
          .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
          .toBe(!paused);
        await expect(probe).toBeFocused();
      }
      await expect(probes[0]!).not.toBeChecked();
      await expect(probes[1]!).toHaveValue('unchanged');
      await expect(surface.locator('[data-space-probes] details')).not.toHaveAttribute('open');
      // A held key cannot toggle twice, even when the native repeat is delivered.
      const paused = await video.evaluate((node: HTMLVideoElement) => node.paused);
      await page.keyboard.down('Space');
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
        .toBe(!paused);
      await page.keyboard.down('Space');
      await page.keyboard.up('Space');
      expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(!paused);
      await surface.locator('[data-space-probes]').evaluate((node) => node.remove());
      // The native scroll viewport can own focus while fullscreen controls are hidden.
      await controls[0]!.click();
      await page
        .getByRole('option', { name: label('gallery.preview.player.original'), exact: true })
        .click();
      await player
        .getByRole('button', { name: label('gallery.preview.player.fullscreen'), exact: true })
        .click();
      await expect(player).toHaveAttribute('data-fullscreen', 'true');
      const viewport = player.locator(':scope > [tabindex="0"]');
      await viewport.focus();
      if (await video.evaluate((node: HTMLVideoElement) => node.paused))
        await page.keyboard.press('Space');
      await page.mouse.move(30, 30);
      await expect(player.locator('[data-ui="gallery.preview.player.controls"]')).toHaveAttribute(
        'data-visible',
        'false',
        { timeout: 5000 }
      );
      await page.keyboard.press('Space');
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await expect(viewport).toBeFocused();
      await expect(player.locator('[data-ui="gallery.preview.player.controls"]')).toHaveAttribute(
        'data-visible',
        'true'
      );
      await page.keyboard.press('Escape');
      await expect(player).toHaveAttribute('data-fullscreen', 'false');
      await page.keyboard.press('Escape');
      await expect(surface).toHaveCount(0);
      await expect(page.locator('html')).not.toHaveAttribute('data-video-editor-focus');
      await expect(card).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.locator('[data-ui="gallery.selection.toolbar"]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
        true
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
