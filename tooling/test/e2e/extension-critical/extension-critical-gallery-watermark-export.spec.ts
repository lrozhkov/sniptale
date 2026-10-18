import { replaceNativeReviewWorkspace } from '../support/native-review-workspace';
import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { createQuickEditWatermark } from '../../../../apps/extension/src/features/video/review/advanced/watermark';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { startHostServer } from '../support/host-server';
import { seedReviewWebcamBundle, clickReviewExport } from '../support/quick-editor-media-fixture';
import {
  seedWebcamComposition,
  webcamVideoPixels,
  readWebcamWorkspace,
} from '../support/quick-editor-webcam-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

/** Authored history fixture keeps actual acquired logo/camera ownership and validates its durable envelope. */
async function seedWatermarkComposition(page: Page, kind: 'text' | 'image') {
  const stored = await readWebcamWorkspace(page);
  if (!stored) throw new Error('Missing saved review');
  const document = replayReviewHistory(
    stored.history,
    stored.cursor,
    stored.source,
    reviewAdvancedContentBaseline(stored.advanced)
  );
  const previous = document.advancedContent;
  const watermark = {
    ...(previous.watermark ?? createQuickEditWatermark('MMЖ')),
    mode: kind,
    layout: kind === 'text' ? ('tiled' as const) : ('single' as const),
    text: {
      ...createQuickEditWatermark('MMЖ').text,
      size: 0.25,
      color: '#ff00ffff',
      weight: 'bold' as const,
      shadow: false,
    },
    placement: { anchor: 'bottom-right' as const, margin: 0.02 },
    tile: { spacing: 0.04, rotation: -30 },
    ...(previous.watermark?.image
      ? { image: { ...previous.watermark.image, size: 0.3, opacity: 1 } }
      : {}),
  };
  if (kind === 'image' && !watermark.image) throw new Error('Logo was not acquired through UI');
  const history = [
    ...stored.history.slice(0, stored.cursor).map((operation) => {
      if (operation.target !== 'edit' || operation.after?.kind !== 'cut') return operation;
      return {
        ...operation,
        after: {
          ...operation.after,
          transition: { type: 'fade-black' as const, before: 0.5, after: 0.5 },
        },
      };
    }),
    {
      id: 'watermark-parity',
      at: Date.now(),
      target: 'advancedContent' as const,
      before: previous,
      // Large bold glyphs retain 5×5 solid interiors even after the tile's 30° rotation.
      after: {
        ...previous,
        canvas: kind === 'text' ? { width: 640, height: 360 } : { width: 320, height: 180 },
        watermark,
      },
    },
  ];
  const row = parseVideoWorkspace({
    ...stored,
    revision: stored.revision + 1,
    updatedAt: Date.now(),
    history,
    cursor: history.length,
  });
  if (!row) throw new Error('Watermark composition fixture is invalid');
  await replaceNativeReviewWorkspace(page, row.aggregateId, row);
}

for (const kind of ['text', 'image'] as const) {
  test(`watermark ${kind} uses the same final-canvas pixels in composed preview, full export and fragment`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const open = async () => {
      await page.getByRole('button', { name: 'Screen or window: Screen', exact: true }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
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
      await button('gallery.videoReview.trackSettings').click();
      await dialog
        .getByRole('switch', {
          name: `${label('gallery.videoReview.trackEnabled')}: ${label('gallery.videoReview.webcam')}`,
          exact: true,
        })
        .click();
      await expect
        .poll(async () => {
          const saved = await readWebcamWorkspace(page);
          return saved
            ? !!replayReviewHistory(
                saved.history,
                saved.cursor,
                saved.source,
                reviewAdvancedContentBaseline(saved.advanced)
              ).advancedContent.webcam
            : false;
        })
        .toBe(true);
      await button('gallery.videoReview.trackSettings').click();
      await seedWebcamComposition(page);
      await page.reload();
      await expect(dialog).toBeVisible();
      if (kind === 'image') {
        await button('gallery.videoReview.scene').click();
        const inspector = dialog.locator('[data-ui="gallery.videoReview.watermarkInspector"]');
        await inspector
          .getByRole('button', { name: label('gallery.videoReview.watermarkImage'), exact: true })
          .click();
        await inspector.locator('input[type=file]').setInputFiles({
          name: 'watermark.svg',
          mimeType: 'image/svg+xml',
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#ff00ff"/></svg>'
          ),
        });
        await expect
          .poll(async () => {
            const saved = await readWebcamWorkspace(page);
            return saved
              ? !!replayReviewHistory(
                  saved.history,
                  saved.cursor,
                  saved.source,
                  reviewAdvancedContentBaseline(saved.advanced)
                ).advancedContent.watermark?.image
              : false;
          })
          .toBe(true);
      }
      await seedWatermarkComposition(page, kind);
      await page.reload();
      await expect(dialog).toBeVisible();
      const canvas = dialog.locator('[data-ui="gallery.videoReview.watermark"] canvas');
      const video = dialog.locator('video').first();
      await expect
        .poll(() =>
          canvas.evaluate((node) => {
            const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
            return pixels.some((value, index) => index % 4 === 3 && value === 255);
          })
        )
        .toBe(true);
      const preview = await canvas.evaluate((node) => {
        const context = node.getContext('2d')!;
        const pixels = context.getImageData(0, 0, node.width, node.height).data;
        const points: Array<{ x: number; y: number; color: number[] }> = [];
        // Interior solid pixels avoid antialiasing and lossy-codec chroma edges.
        for (let y = 3; y < node.height - 3; y += 4)
          for (let x = 3; x < node.width - 3; x += 4) {
            let opaque = true;
            for (let dy = -2; dy <= 2; dy++)
              for (let dx = -2; dx <= 2; dx++) {
                const offset = ((y + dy) * node.width + x + dx) * 4;
                if (
                  pixels[offset + 3] !== 255 ||
                  pixels[offset]! < 250 ||
                  pixels[offset + 1]! > 5 ||
                  pixels[offset + 2]! < 250
                )
                  opaque = false;
              }
            if (opaque)
              points.push({
                x: x / node.width,
                y: y / node.height,
                color: [...pixels.slice((y * node.width + x) * 4, (y * node.width + x) * 4 + 4)],
              });
          }
        const stride = Math.max(1, Math.floor(points.length / 12));
        return {
          width: node.width,
          height: node.height,
          points: points.filter((_, index) => index % stride === 0).slice(0, 12),
          pixels: points.length,
        };
      });
      expect(preview.points.length).toBeGreaterThanOrEqual(4);
      for (const time of [2.5, 4.5]) {
        await video.evaluate((node, time) => {
          node.currentTime = time;
        }, time);
        await expect
          .poll(() =>
            canvas.evaluate(
              (node, samples) =>
                samples.map((point) => [
                  ...node
                    .getContext('2d')!
                    .getImageData(
                      Math.floor(point.x * node.width),
                      Math.floor(point.y * node.height),
                      1,
                      1
                    ).data,
                ]),
              preview.points
            )
          )
          .toEqual(preview.points.map((point) => point.color));
      }
      await page.screenshot({
        path: info.outputPath(`watermark-${kind}-composed.png`),
        fullPage: false,
      });
      const downloading = page.waitForEvent('download');
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
      const download = await downloading;
      const fullPath = info.outputPath(`watermark-${kind}-full.webm`);
      await download.saveAs(fullPath);
      expect(await download.failure()).toBeNull();
      const full = await webcamVideoPixels(page, (await readFile(fullPath)).toString('base64'), [
        ...preview.points.map((point) => ({ ...point, time: 2.5 })),
        ...preview.points.slice(0, 4).map((point) => ({ ...point, time: 1 })),
      ]);
      expect(full.width).toBe(preview.width);
      expect(full.height).toBe(preview.height);
      for (const pixel of full.pixels.slice(0, preview.points.length)) {
        expect(pixel[0]).toBeGreaterThan(220);
        expect(pixel[1]).toBeLessThan(35);
        expect(pixel[2]).toBeGreaterThan(220);
      }
      for (const pixel of full.pixels.slice(preview.points.length))
        expect(Math.max(...pixel.slice(0, 3))).toBeLessThan(35);
      const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      const ruler = plane.locator('[data-ui="gallery.videoReview.ruler"]');
      await ruler.scrollIntoViewIfNeeded();
      const bounds = (await ruler.boundingBox())!;
      const duration = Number(await plane.getAttribute('aria-valuemax'));
      await page.mouse.move(bounds.x + (bounds.width * 2.25) / duration, bounds.y + 12);
      await page.mouse.down();
      await page.mouse.move(bounds.x + (bounds.width * 5.5) / duration, bounds.y + 12, {
        steps: 8,
      });
      await page.mouse.up();
      const fragmentDownloading = page.waitForEvent('download');
      await button('gallery.videoReview.downloadSelection').click();
      const fragmentDownload = await fragmentDownloading;
      const fragmentPath = info.outputPath(`watermark-${kind}-fragment.webm`);
      await fragmentDownload.saveAs(fragmentPath);
      expect(await fragmentDownload.failure()).toBeNull();
      const fragment = await webcamVideoPixels(
        page,
        (await readFile(fragmentPath)).toString('base64'),
        preview.points.map((point) => ({ ...point, time: 1 }))
      );
      for (const pixel of fragment.pixels) {
        expect(pixel[0]).toBeGreaterThan(220);
        expect(pixel[1]).toBeLessThan(35);
        expect(pixel[2]).toBeGreaterThan(220);
      }
      await writeFile(
        info.outputPath(`watermark-${kind}-parity.json`),
        JSON.stringify({ preview, full, fragment }, null, 2)
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
