import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewWebcamBundle, clickReviewExport } from '../support/quick-editor-media-fixture';
import {
  seedWebcamComposition,
  webcamVideoPixels,
  readWebcamWorkspace,
} from '../support/quick-editor-webcam-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

test('webcam source clock and topmost composition agree in preview, full export and fragment', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const dialog = page.locator('dialog');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: label(key), exact: true });
  const open = async () => {
    await page.getByRole('button', { name: 'Screen or window: Screen', exact: true }).click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  };
  const camera = dialog.locator('[data-ui="gallery.videoReview.webcamOverlay"] canvas');
  const video = dialog.locator('video').first();
  const pixel = (x: number, y: number) =>
    camera.evaluate(
      (canvas, point) => [
        ...canvas
          .getContext('2d')!
          .getImageData(
            Math.floor(canvas.width * point.x),
            Math.floor(canvas.height * point.y),
            1,
            1
          ).data,
      ],
      { x, y }
    );
  const expected = (actual: number[], reference: number[]) => {
    for (let channel = 0; channel < 3; channel++)
      expect(Math.abs(actual[channel]! - reference[channel]!)).toBeLessThan(9);
  };
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewWebcamBundle(page);
    await page.reload();
    await open();
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.webcam').click();
    await expect.poll(async () => (await pixel(0.85, 0.85))[3]).toBe(255);
    await seedWebcamComposition(page);
    await page.reload();
    await open();
    const original = (
      await readFile(new URL('../fixtures/review-webcam-clock.webm', import.meta.url))
    ).toString('base64');
    const reference = await webcamVideoPixels(page, original, [
      { time: 1.5, x: 0.5, y: 0.5 },
      { time: 3.5, x: 0.5, y: 0.5 },
      { time: 1.75, x: 0.5, y: 0.5 },
      { time: 3.53125, x: 0.5, y: 0.5 },
    ]);
    for (const [index, sourceTime, coordinate] of [
      [0, 2.5, 0.85],
      [1, 4.5, 0.15],
    ] as const) {
      await video.evaluate((video, time) => {
        video.currentTime = time;
      }, sourceTime);
      await expect.poll(async () => (await pixel(coordinate, coordinate))[3]).toBe(255);
      await expect
        .poll(async () =>
          Math.abs((await pixel(coordinate, coordinate))[0]! - reference.pixels[index]![0]!)
        )
        .toBeLessThan(9);
      expected(await pixel(coordinate, coordinate), reference.pixels[index]!);
    }
    await page.screenshot({ path: info.outputPath('webcam-above-effects.png'), fullPage: false });
    const live: Array<{ rate: number; visible: number; maximumError: number }> = [];
    for (const [time, rate, point] of [
      [2.2, 2, 0.85],
      [4.6, 0.25, 0.15],
    ] as const) {
      await video.evaluate((video, time) => {
        video.currentTime = time;
      }, time);
      await expect.poll(async () => (await pixel(point, point))[3]).toBe(255);
      await video.evaluate((video) => video.play());
      await expect.poll(() => video.evaluate((video) => video.playbackRate)).toBe(rate);
      const trace = await page.evaluate(async () => {
        const main = document.querySelector<HTMLVideoElement>('dialog video')!;
        const camera = document.querySelector<HTMLCanvasElement>(
          '[data-ui="gallery.videoReview.webcamOverlay"] canvas'
        )!;
        const context = camera.getContext('2d')!;
        const samples: Array<{ time: number; red: number; alpha: number }> = [];
        const frames: Array<{
          time: number;
          camera: number;
          decoded: number;
          now: number;
          expected: number;
        }> = [];
        const request = HTMLVideoElement.prototype.requestVideoFrameCallback;
        HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
          return request.call(this, (now, metadata) => {
            if (this !== main)
              frames.push({
                time: main.currentTime,
                camera: this.currentTime,
                decoded: metadata.mediaTime,
                now,
                expected: metadata.expectedDisplayTime,
              });
            callback(now, metadata);
          });
        };
        for (let i = 0; i < 18; i++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const time = main.currentTime;
          const progress = Math.max(0, Math.min(1, (time - 4) / 0.5));
          const coordinate = 0.85 - 0.7 * progress * progress * (3 - 2 * progress);
          const rgba = context.getImageData(
            Math.floor(coordinate * camera.width),
            Math.floor(coordinate * camera.height),
            1,
            1
          ).data;
          samples.push({ time, red: rgba[0]!, alpha: rgba[3]! });
        }
        main.pause();
        HTMLVideoElement.prototype.requestVideoFrameCallback = request;
        return { samples, frames };
      });
      await writeFile(info.outputPath(`webcam-live-${rate}.json`), JSON.stringify(trace, null, 2));
      const { samples } = trace;
      const visible = samples.filter((sample) => sample.alpha === 255);
      expect(visible.length).toBeGreaterThanOrEqual(15);
      const maximumError = Math.max(
        ...visible.map((sample) => Math.abs(sample.red - (20 + 16 * (sample.time - 1))))
      );
      expect(maximumError).toBeLessThan(9);
      live.push({ rate, visible: visible.length, maximumError });
    }
    await video.evaluate((video) => {
      video.currentTime = 6.5;
    });
    await expect.poll(async () => (await pixel(0.15, 0.15))[3]).toBe(0);
    const downloading = page.waitForEvent('download');
    await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
    const full = await downloading;
    const fullPath = info.outputPath('webcam-full.webm');
    await full.saveAs(fullPath);
    expect(await full.failure()).toBeNull();
    const rendered = await webcamVideoPixels(page, (await readFile(fullPath)).toString('base64'), [
      { time: 1.25, x: 0.85, y: 0.85 },
      { time: 4, x: 0.15, y: 0.15 },
      { time: 7.5, x: 0.15, y: 0.15 },
    ]);
    expected(rendered.pixels[0]!, reference.pixels[0]!);
    expected(rendered.pixels[1]!, reference.pixels[1]!);
    expect(Math.abs(rendered.pixels[2]![2]! - 160)).toBeGreaterThan(20);
    expect(rendered.width).toBe(160);
    expect(rendered.height).toBeGreaterThan(90);
    expect(rendered.duration).toBeCloseTo(13.012, 1);

    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    const ruler = plane.locator('[data-ui="gallery.videoReview.ruler"]');
    await ruler.scrollIntoViewIfNeeded();
    const bounds = (await ruler.boundingBox())!;
    const duration = Number(await plane.getAttribute('aria-valuemax'));
    await page.mouse.move(bounds.x + (bounds.width * 2.25) / duration, bounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + (bounds.width * 5.5) / duration, bounds.y + 12, { steps: 8 });
    await page.mouse.up();
    const fragmentDownload = page.waitForEvent('download');
    await button('gallery.videoReview.downloadSelection').click();
    const fragment = await fragmentDownload;
    const fragmentPath = info.outputPath('webcam-fragment.webm');
    await fragment.saveAs(fragmentPath);
    expect(await fragment.failure()).toBeNull();
    const excerpt = await webcamVideoPixels(
      page,
      (await readFile(fragmentPath)).toString('base64'),
      [
        { time: 0.25, x: 0.85, y: 0.85 },
        { time: 3, x: 0.15, y: 0.15 },
      ]
    );
    expected(excerpt.pixels[0]!, reference.pixels[2]!);
    expected(excerpt.pixels[1]!, reference.pixels[3]!);
    expect(excerpt.duration).toBeCloseTo(5.375, 1);
    await button('gallery.videoReview.webcamSettings').click();
    const timing = dialog.getByRole('heading', {
      name: label('gallery.videoReview.webcamTiming'),
      exact: true,
    });
    await expect(timing).toBeVisible();
    const offset = dialog.getByRole('textbox', {
      name: label('gallery.videoReview.webcamOffset'),
      exact: true,
    });
    if (!(await offset.isVisible())) await timing.click();
    await offset.fill('-1');
    await offset.press('Enter');
    await button('gallery.videoReview.clearPlaybackRange').click();
    await video.evaluate((video) => {
      video.currentTime = 0.5;
    });
    await expect
      .poll(async () => Math.abs((await pixel(0.85, 0.85))[0]! - reference.pixels[0]![0]!))
      .toBeLessThan(9);
    await ruler.scrollIntoViewIfNeeded();
    const negativeBounds = (await ruler.boundingBox())!;
    await page.mouse.move(
      negativeBounds.x + (negativeBounds.width * 0.25) / duration,
      negativeBounds.y + 12
    );
    await page.mouse.down();
    await page.mouse.move(
      negativeBounds.x + (negativeBounds.width * 0.75) / duration,
      negativeBounds.y + 12,
      { steps: 4 }
    );
    await page.mouse.up();
    const negativeDownloading = page.waitForEvent('download');
    await button('gallery.videoReview.downloadSelection').click();
    const negativeDownload = await negativeDownloading;
    const negativePath = info.outputPath('webcam-negative-offset.webm');
    await negativeDownload.saveAs(negativePath);
    const negative = await webcamVideoPixels(
      page,
      (await readFile(negativePath)).toString('base64'),
      [{ time: 0.25, x: 0.85, y: 0.85 }]
    );
    expected(negative.pixels[0]!, reference.pixels[0]!);
    expect(negative.duration).toBeCloseTo(0.5, 1);
    await writeFile(
      info.outputPath('webcam-parity.json'),
      JSON.stringify(
        {
          reference,
          rendered,
          excerpt,
          negative,
          live,
          fragmentName: fragment.suggestedFilename(),
        },
        null,
        2
      )
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('missing camera does not prevent reopening the main project and Retry restores export', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const dialog = page.locator('dialog');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: label(key), exact: true });
  const open = async () => {
    await page.getByRole('button', { name: /: Screen$/ }).click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  };
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewWebcamBundle(page);
    await page.reload();
    await open();
    await button('gallery.videoReview.advancedEditing').click();
    // Leave a protected publication journal after the durable camera attachment commits.
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        this: IDBObjectStore,
        ...args: Parameters<typeof put>
      ) {
        if (this.name === 'project_assets') throw new Error('Simulated publication outage');
        return put.apply(this, args);
      };
      window.addEventListener(
        'webcam-proof-storage-ready',
        () => {
          IDBObjectStore.prototype.put = put;
        },
        { once: true }
      );
    });
    await button('gallery.videoReview.webcam').click();
    const overlay = dialog.locator('[data-ui="gallery.videoReview.webcamOverlay"]');
    const acquisitionError = dialog.locator('main > [role="alert"]');
    await expect(acquisitionError).toContainText(label('gallery.videoReview.webcamFailed'));
    await expect(overlay.getByRole('alert')).toBeVisible();
    const attached = await readWebcamWorkspace(page);
    expect(attached).not.toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event('webcam-proof-storage-ready')));
    await acquisitionError
      .getByRole('button', { name: label('gallery.videoReview.retry') })
      .click();
    await expect(overlay.locator('[data-focus-frame]')).toBeVisible();
    const recovered = await readWebcamWorkspace(page);
    expect(recovered?.history).toEqual(attached?.history);
    expect(recovered?.cursor).toBe(attached?.cursor);
    const saved = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const transaction = db.transaction('project_assets', 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
        const rows = await new Promise<unknown[]>((resolve, reject) => {
          const request = transaction.objectStore('project_assets').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (rows.length !== 1) throw new Error('Expected one private webcam resource');
        transaction.objectStore('project_assets').clear();
        await done;
        return rows[0];
      } finally {
        db.close();
      }
    });
    await page.reload();
    await open();
    await expect(overlay.getByRole('alert')).toContainText(
      label('gallery.videoReview.webcamFailed')
    );
    await expect(dialog.locator('video').first()).toBeVisible();
    await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
    await expect(
      dialog
        .getByRole('status')
        .filter({ hasText: label('gallery.videoReview.exportBlockerAssetMissing') })
    ).toBeVisible();
    await expect(button('gallery.videoReview.downloadVideo')).toBeDisabled();
    await page.evaluate(async (row) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const transaction = db.transaction('project_assets', 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
        transaction.objectStore('project_assets').put(row);
        await done;
      } finally {
        db.close();
      }
    }, saved);
    await overlay
      .getByRole('button', { name: label('gallery.videoReview.retry'), exact: true })
      .click();
    await expect(overlay.getByRole('alert')).toHaveCount(0);
    await expect(overlay.locator('[data-focus-frame]')).toBeVisible();
    await expect(button('gallery.videoReview.downloadVideo')).toBeEnabled();
    const downloading = page.waitForEvent('download');
    await button('gallery.videoReview.downloadVideo').click();
    const download = await downloading;
    await download.saveAs(info.outputPath('webcam-recovered.webm'));
    expect(await download.failure()).toBeNull();
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
