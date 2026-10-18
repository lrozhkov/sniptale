import { replaceNativeReviewWorkspace } from '../support/native-review-workspace';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { createReviewCaptionSettings } from '../../../../apps/extension/src/features/video/review/text-document';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo, clickReviewExport } from '../support/quick-editor-media-fixture';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';
import { webcamVideoPixels, readWebcamWorkspace } from '../support/quick-editor-webcam-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function resizeInspector(page: Page, dialog: Locator, width: number) {
  const content = dialog.locator('.review-inspector-scroll');
  const read = () => content.evaluate((node) => Number.parseFloat(getComputedStyle(node).width));
  const current = await read();
  const handle = (await dialog
    .locator('[data-ui="gallery.videoReview.resizeInspector"]')
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - (width - current), handle.y + 20, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(read).toBe(width);
}

/** One admitted history fixture sets the pixel proof style without bypassing project validation. */
async function seedPixelStyle(page: Page, conflict = false) {
  const saved = await readWebcamWorkspace(page);
  if (!saved) throw new Error('Missing saved caption document');
  const before = replayReviewHistory(
    saved.history,
    saved.cursor,
    saved.source,
    reviewAdvancedContentBaseline(saved.advanced)
  ).advancedContent;
  const settings = {
    ...createReviewCaptionSettings(),
    enabled: true,
    style: {
      ...createReviewCaptionSettings().style,
      fontSize: 0.08,
      background: '#347812ff',
      color: '#ffffffff',
    },
  };
  const after = {
    ...before,
    canvas: { width: 640, height: 360 },
    captions: settings,
    text: {
      version: 1 as const,
      fragments: before.text!.fragments.map((fragment, index) => ({
        ...fragment,
        text: conflict
          ? 'Длинная фраза '.repeat(150)
          : index === 0
            ? 'Łukasz — Первая фраза'
            : fragment.text,
        start: 0,
        end: 3,
        showInVideo: true,
        style: undefined,
      })),
    },
  };
  const history = [
    ...saved.history.slice(0, saved.cursor),
    { id: crypto.randomUUID(), at: Date.now(), target: 'advancedContent' as const, before, after },
  ];
  const row = parseVideoWorkspace({
    ...saved,
    revision: saved.revision + 1,
    updatedAt: Date.now(),
    history,
    cursor: history.length,
  });
  if (!row) throw new Error('Caption pixel fixture failed admission');
  await replaceNativeReviewWorkspace(page, row.aggregateId, row);
}

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'light' },
  { width: 1920, height: 900, locale: 'en', theme: 'dark' },
  { width: 1024, height: 560, locale: 'ru', theme: 'light' },
] as const) {
  test(`scene captions ${variant.width}x${variant.height} ${variant.locale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /Minified React error|Maximum update depth/i.test(message.text())
      )
        errors.push(message.text());
    });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const open = async () => {
      const route = new URL(page.url()).searchParams;
      if (route.get('mode') === 'edit' && route.has('mediaId')) {
        await expect(dialog).toBeVisible();
        return;
      }
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    };
    const canvas = dialog.locator('[data-ui="gallery.videoReview.manualPreview"] canvas');
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
          sniptale_quick_preview_preferences: {
            rasterPreset: '360p',
            frameRate: '30',
            pausedQuality: 'same',
            showFrameRate: false,
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await open();
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.textTrackOpen').click();
      const trackText = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
      await trackText
        .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
        .click();
      await trackText
        .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
        .fill('Первая фраза');
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.text)
        .toBe('Первая фраза');
      await button('gallery.videoReview.scene').click();
      const controls = dialog.locator('[data-ui="gallery.videoReview.captionScene"]');
      if (!(await controls.isVisible()))
        await dialog
          .getByRole('heading', { name: label('gallery.videoReview.captions'), exact: true })
          .locator('..')
          .click();
      const enable = controls.getByRole('switch', {
        name: label('gallery.videoReview.captionsEnabled'),
        exact: true,
      });
      await expect(enable).toHaveAttribute('aria-checked', 'false');
      await enable.click();
      await expect(enable).toHaveAttribute('aria-checked', 'true');
      // The existing opening fade intentionally paints the complete first frame black.
      await dialog
        .locator('video')
        .first()
        .evaluate((node) => {
          node.currentTime = 1;
        });
      await expect(canvas).toBeVisible();
      await expect
        .poll(() =>
          canvas.evaluate((node) =>
            node
              .getContext('2d')!
              .getImageData(0, 0, node.width, node.height)
              .data.some((value, index) => index % 4 !== 3 && value > 0)
          )
        )
        .toBe(true);
      await expect
        .poll(async () => (await persistedReviewContent(page))?.captions?.enabled)
        .toBe(true);
      await button('gallery.videoReview.undo').click();
      await expect(enable).toHaveAttribute('aria-checked', 'false');
      await button('gallery.videoReview.redo').click();
      await expect(enable).toHaveAttribute('aria-checked', 'true');
      const initialWidth = await dialog
        .locator('.review-inspector-scroll')
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).width));
      for (const width of variant.width === 1920
        ? [523, 524, 525, 640, initialWidth]
        : [420, initialWidth]) {
        await resizeInspector(page, dialog, width);
        await controls.scrollIntoViewIfNeeded();
        await expect(enable).toBeInViewport();
        const field = controls.locator('[data-ui="shared.ui.compact-inspector.segmented-field"]');
        const bounds = (await field.boundingBox())!;
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(variant.width);
        if (width !== initialWidth)
          await page.screenshot({
            path: info.outputPath(`captions-inspector-${width}.png`),
            fullPage: false,
          });
        expect(errors).toEqual([]);
      }
      await page.screenshot({ path: info.outputPath('captions-scene.png'), fullPage: false });
      await button('gallery.videoReview.textTrackOpen').click();
      const phrase = trackText
        .locator('[data-ui="gallery.videoReview.textPhrase"] button[aria-expanded]')
        .first();
      if ((await phrase.getAttribute('aria-expanded')) === 'false') await phrase.click();
      const visibility = trackText.getByRole('switch', {
        name: label('gallery.videoReview.textFragmentShown'),
        exact: true,
      });
      await expect(visibility).toHaveAttribute('aria-checked', 'true');
      await trackText
        .getByRole('heading', { name: label('gallery.videoReview.captionStyle'), exact: true })
        .locator('..')
        .click();
      const inherit = trackText.getByRole('switch', {
        name: label('gallery.videoReview.captionInherit'),
        exact: true,
      });
      await inherit.click();
      await expect(inherit).toHaveAttribute('aria-checked', 'false');
      await trackText
        .locator('[data-ui="gallery.videoReview.captionStyle"]')
        .getByRole('button', { name: label('gallery.videoReview.captionTop'), exact: true })
        .click();
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.style?.position)
        .toBe('top');
      await visibility.click();
      await expect(visibility).toHaveAttribute('aria-checked', 'false');
      await expect(
        trackText.getByRole('heading', {
          name: label('gallery.videoReview.captionStyle'),
          exact: true,
        })
      ).toHaveCount(0);
      await visibility.click();
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.showInVideo)
        .toBe(true);
      await page.screenshot({ path: info.outputPath('captions-fragment.png'), fullPage: false });
      if (variant.width === 1920) {
        await seedPixelStyle(page);
        await page.reload();
        await open();
        const video = dialog.locator('video').first();
        await video.evaluate((node) => {
          node.currentTime = 1;
        });
        const pixel = () =>
          canvas.evaluate((node) => [
            ...node
              .getContext('2d')!
              .getImageData(Math.floor(node.width * 0.5), Math.floor(node.height * 0.94), 1, 1)
              .data,
          ]);
        await expect.poll(pixel).toEqual([52, 120, 18, 255]);
        const reservedPixel = await canvas.evaluate((node) => [
          ...node
            .getContext('2d')!
            .getImageData(Math.floor(node.width * 0.5), Math.floor(node.height * 0.75), 1, 1).data,
        ]);
        expect(reservedPixel).not.toEqual([52, 120, 18, 255]);
        const preview = await canvas.evaluate((node) => ({
          width: node.width,
          height: node.height,
        }));
        await writeFile(
          info.outputPath('captions-canvas.png'),
          Buffer.from((await canvas.evaluate((node) => node.toDataURL())).split(',')[1]!, 'base64')
        );
        const glyphs = await canvas.evaluate((node) => {
          const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
          const bright = (x: number, y: number) =>
            [0, 1, 2].every((channel) => pixels[(y * node.width + x) * 4 + channel]! > 235);
          const points: { x: number; y: number }[] = [];
          for (let y = Math.floor(node.height * 0.8); y < node.height * 0.93; y++)
            for (let x = Math.floor(node.width * 0.25); x < node.width * 0.75; x++)
              if (bright(x, y) && bright(x + 1, y) && bright(x, y + 1) && bright(x + 1, y + 1))
                points.push({ x: x / node.width, y: y / node.height });
          return points
            .filter((_, index) => index % Math.max(1, Math.floor(points.length / 6)) === 0)
            .slice(0, 6);
        });
        expect(glyphs.length).toBeGreaterThanOrEqual(3);
        await page.screenshot({
          path: info.outputPath('captions-preview-pixels.png'),
          fullPage: false,
        });
        const downloading = page.waitForEvent('download');
        await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
        const download = await downloading;
        const path = info.outputPath('captions-rendered.webm');
        await download.saveAs(path);
        expect(await download.failure()).toBeNull();
        const decoded = await webcamVideoPixels(page, (await readFile(path)).toString('base64'), [
          { time: 1, x: 0.5, y: 0.94 },
          { time: 5, x: 0.5, y: 0.94 },
          ...glyphs.flatMap((point) =>
            [-1, 0, 1].flatMap((dy) =>
              [-1, 0, 1].map((dx) => ({
                time: 1,
                x: point.x + dx / preview.width,
                y: point.y + dy / preview.height,
              }))
            )
          ),
          { time: 0, x: 0.5, y: 0.94 },
        ]);
        expect(decoded.width).toBe(preview.width);
        expect(decoded.height).toBe(preview.height);
        decoded.pixels[0]!.slice(0, 3).forEach((value, index) =>
          expect(Math.abs(value - [52, 120, 18][index]!)).toBeLessThan(12)
        );
        expect(decoded.pixels[1]!.slice(0, 3)).not.toEqual(decoded.pixels[0]!.slice(0, 3));
        // Encoding may move an antialiased stroke by one pixel; each sampled white glyph
        // must still have a white core in its decoded 3×3 neighbourhood.
        for (let index = 0; index < glyphs.length; index++) {
          const core = decoded.pixels.slice(2 + index * 9, 2 + (index + 1) * 9);
          expect(Math.max(...core.map((pixel) => Math.min(...pixel.slice(0, 3))))).toBeGreaterThan(
            195
          );
        }
        expect(Math.max(...decoded.pixels.at(-1)!.slice(0, 3))).toBeLessThan(25);
        await seedPixelStyle(page, true);
        await page.reload();
        await open();
        const alert = dialog
          .getByRole('alert')
          .filter({ hasText: label('gallery.videoReview.captionConflict') });
        await expect(alert).toBeVisible();
        await alert.getByRole('button').first().click();
        await expect(
          dialog.getByRole('textbox', {
            name: label('gallery.videoReview.speechText'),
            exact: true,
          })
        ).toBeVisible();
        const unexpectedDownloads: string[] = [];
        const onDownload = (download: import('@playwright/test').Download) =>
          unexpectedDownloads.push(download.suggestedFilename());
        page.on('download', onDownload);
        await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
        await expect(
          dialog
            .getByRole('status')
            .filter({ hasText: label('gallery.videoReview.exportAdvancedUnavailable') })
        ).toContainText(label('gallery.videoReview.captionConflict'));
        await expect(button('gallery.videoReview.downloadVideo')).toBeDisabled();
        expect(unexpectedDownloads).toEqual([]);
        page.off('download', onDownload);
        await page.screenshot({ path: info.outputPath('captions-conflict.png'), fullPage: false });
        await button('gallery.videoReview.textTrackOpen').click();
        const expanded = trackText
          .locator('[data-ui="gallery.videoReview.textPhrase"] button[aria-expanded]')
          .first();
        if ((await expanded.getAttribute('aria-expanded')) === 'false') await expanded.click();
        await trackText
          .getByRole('switch', {
            name: label('gallery.videoReview.textFragmentShown'),
            exact: true,
          })
          .click();
        await expect
          .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.showInVideo)
          .toBe(false);
        await expect(alert).toHaveCount(0);
        const hiddenDownload = page.waitForEvent('download');
        await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
        const hidden = await hiddenDownload;
        const hiddenPath = info.outputPath('captions-hidden.webm');
        await hidden.saveAs(hiddenPath);
        expect(await hidden.failure()).toBeNull();
        const hiddenPixels = await webcamVideoPixels(
          page,
          (await readFile(hiddenPath)).toString('base64'),
          [{ time: 1, x: 0.5, y: 0.94 }]
        );
        expect(hiddenPixels.pixels[0]!.slice(0, 3)).not.toEqual(decoded.pixels[0]!.slice(0, 3));
      }
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
