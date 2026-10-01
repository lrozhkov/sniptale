import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor unified export navigation at HD in ${variant.locale}/${variant.theme}`, async ({
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
      const toolbar = dialog.locator('[data-ui="gallery.videoReview.toolbar"]');
      const opener = toolbar.getByRole('button', {
        name: label('gallery.videoReview.exportSection'),
        exact: true,
      });
      const inspector = dialog.locator('aside');
      const exporting = inspector.locator('[data-ui="gallery.videoReview.exportSection"]');
      await opener.click();
      await expect(exporting).toBeVisible();
      await expect(exporting.locator('[data-ui="gallery.videoReview.exportSettings"]')).toHaveCount(
        0
      );
      await expect(button('gallery.videoReview.exportVideo')).toBeEnabled();
      await expect(button('gallery.videoReview.downloadVideo')).toBeEnabled();
      await expect(dialog.locator('[data-ui="gallery.videoReview.exportFooter"]')).toHaveCount(0);
      await button('gallery.videoReview.cutMode').click();
      const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      const drag = async (start: number, end: number) => {
        const bounds = (await source.boundingBox())!;
        await page.mouse.move(bounds.x + bounds.width * start, bounds.y + bounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width * end, bounds.y + bounds.height / 2, {
          steps: 8,
        });
        await page.mouse.up();
      };
      await drag(2.1 / 12, 4.1 / 12);
      const cut = dialog.getByRole('button', {
        name: new RegExp(`^${label('gallery.videoReview.cutLabel')} ·`),
      });
      await expect(cut).toHaveCount(1);
      await cut.click();
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.rangeStart'),
          exact: true,
        })
      ).toBeVisible();
      await opener.click();
      await expect(exporting).toBeVisible();
      await cut.click();
      await expect(exporting).toHaveCount(0);
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.rangeStart'),
          exact: true,
        })
      ).toBeVisible();
      await button('gallery.videoReview.advancedEditing').click();
      await opener.click();
      const settings = exporting.locator('[data-ui="gallery.videoReview.exportSettings"]');
      await expect(settings).toBeVisible();
      await button('gallery.videoReview.exportQuality').click();
      await page
        .getByRole('option', { name: label('videoEditor.exportDialog.qualityMedium'), exact: true })
        .click();
      await expect(button('gallery.videoReview.exportQuality')).toContainText(
        label('videoEditor.exportDialog.qualityMedium')
      );
      await button('gallery.videoReview.exportFrameRate').click();
      await page.getByRole('option', { name: '30', exact: true }).click();
      const navigation = inspector.locator('[data-ui="gallery.videoReview.inspectorNavigation"]');
      await navigation
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      await opener.click();
      await expect(button('gallery.videoReview.exportFrameRate')).toContainText('30');
      await expect(button('gallery.videoReview.exportQuality')).toContainText(
        label('videoEditor.exportDialog.qualityMedium')
      );
      await cut.click();
      await expect(exporting).toHaveCount(0);
      await opener.click();
      await expect(button('gallery.videoReview.exportQuality')).toContainText(
        label('videoEditor.exportDialog.qualityMedium')
      );
      const notes = toolbar.getByRole('button', {
        name: label('gallery.videoReview.addComment'),
        exact: true,
      });
      expect(await notes.evaluate((node) => node.nextElementSibling?.getAttribute('data-ui'))).toBe(
        'gallery.videoReview.toolbar.separator'
      );
      expect(
        await notes.evaluate((node) =>
          node.nextElementSibling?.nextElementSibling?.getAttribute('aria-label')
        )
      ).toBe(label('gallery.videoReview.undo'));
      for (const [width, height, fullHeight] of [
        [1920, 1080, false],
        [1280, 720, false],
        [1280, 720, true],
      ] as const) {
        await page.setViewportSize({ width, height });
        if (fullHeight) await button('videoEditor.app.panelFullHeight').click();
        await expect
          .poll(async () => toolbar.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeLessThanOrEqual(1);
        expect(await toolbar.locator('button').last().getAttribute('data-ui')).toBe(
          'gallery.videoReview.openExport'
        );
        await expect(opener).toBeInViewport({ ratio: 1 });
        expect(
          await opener.evaluate((node) => node.previousElementSibling?.getAttribute('data-ui'))
        ).toBe('gallery.videoReview.toolbar.separator');
        await expect(opener).toHaveAttribute('title', label('gallery.videoReview.exportSection'));
        if (width === 1920)
          await expect(opener.locator('[data-review-toolbar-label]')).toBeVisible();
        const autosaveSpacing = await toolbar.evaluate((node) => {
          const autosave = node.querySelector('[data-ui="autosave-control"]')!;
          const zoom = node.querySelector('input[type="range"]')!;
          const divider = node.querySelector('[data-compact-only]')!;
          return {
            compact: node.getAttribute('data-layout') !== 'balanced',
            gap: zoom.getBoundingClientRect().left - autosave.getBoundingClientRect().right,
            visible: getComputedStyle(divider).display !== 'none',
          };
        });
        if (autosaveSpacing.compact && autosaveSpacing.gap <= 16)
          expect(autosaveSpacing.visible).toBe(true);
        if (!autosaveSpacing.compact || autosaveSpacing.gap >= 32)
          expect(autosaveSpacing.visible).toBe(false);
        expect(
          await opener.evaluate((node) => {
            const right = node.getBoundingClientRect().right;
            return Array.from(
              node.closest('[data-ui="gallery.videoReview.toolbar"]')!.querySelectorAll('button')
            ).every((button) => button.getBoundingClientRect().right <= right + 1);
          })
        ).toBe(true);
        const order = await exporting.evaluate((node) => {
          const settings = node.querySelector('[data-ui="gallery.videoReview.exportSettings"]')!;
          return Array.from(node.querySelectorAll('button[aria-label]'))
            .filter((button) => !settings.contains(button))
            .every(
              (button) =>
                !!(settings.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
            );
        });
        expect(order).toBe(true);
        for (const destination of [
          'gallery.videoReview.exportVideo',
          'gallery.videoReview.downloadVideo',
        ] as const) {
          await button(destination).scrollIntoViewIfNeeded();
          await expect(button(destination)).toBeInViewport({ ratio: 1 });
          await expect(button(destination)).toBeEnabled();
        }
        await expect(inspector.locator('header h2')).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath(`export-${width}-${fullHeight}.png`) });
      }
      await button('videoEditor.app.panelRestoreHeight').click();
      await button('gallery.videoReview.speedMode').click();
      await drag(4 / 12, 6 / 12);
      const speed = dialog.getByRole('button', {
        name: new RegExp(`^${label('gallery.videoReview.speedMode')} [0-9]`),
      });
      await expect(speed).toHaveCount(1);
      await speed.click();
      await expect(
        inspector.getByRole('button', { name: label('gallery.videoReview.speedRate'), exact: true })
      ).toBeVisible();
      await opener.click();
      await speed.click();
      await expect(exporting).toHaveCount(0);
      await opener.click();
      await expect(button('gallery.videoReview.exportQuality')).toContainText(
        label('videoEditor.exportDialog.qualityMedium')
      );
      await expect(button('gallery.videoReview.exportFrameRate')).toContainText('30');
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

// Synthetic 1904x984 H.264 fixture: non-macroblock-aligned visible height, color swatches,
// fine text/grid and 440 Hz AAC. Its coded padding must never become a colored content edge.
test('quick editor export profiles preserve colors, padded edges and format-specific audio', async ({
  page,
}, testInfo) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'ru', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
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
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.scene').click();
    await button('videoEditor.sidebar.canvasFormatLabel').click();
    await page.getByRole('option', { name: '16:9', exact: true }).click();
    await button('videoEditor.sidebar.canvasResolutionLabel').click();
    await page.getByRole('option', { name: '1920 × 1080', exact: true }).click();
    await button('gallery.videoReview.backgroundSolid').click();
    const padding = dialog.getByRole('textbox', {
      name: label('gallery.videoReview.backgroundPadding'),
      exact: true,
    });
    await padding.fill('48');
    await padding.press('Enter');
    await button('gallery.videoReview.exportSettings').click();
    await dialog
      .locator('[data-ui="gallery.videoReview.exportSettings"]')
      .getByRole('button', { name: label('videoEditor.exportDialog.resolutionLabel'), exact: true })
      .click();
    await page.getByRole('option', { name: '720p', exact: true }).click();
    await button('gallery.videoReview.exportFrameRate').click();
    await page.getByRole('option', { name: '30', exact: true }).click();
    await expect(button('gallery.videoReview.exportQuality')).toContainText(
      label('videoEditor.exportDialog.qualityHigh')
    );
    for (const format of ['mp4', 'webm'] as const) {
      await button('videoEditor.exportDialog.formatLabel').click();
      await page
        .getByRole('option', { name: format === 'mp4' ? 'MP4' : 'WebM', exact: true })
        .click();
      await expect(button('gallery.videoReview.exportCodec')).toContainText(
        format === 'mp4' ? 'H.264' : 'VP9'
      );
      await page.screenshot({ path: testInfo.outputPath(`export-profile-${format}.png`) });
      const downloading = page.waitForEvent('download');
      await button('gallery.videoReview.exportSection').click();
      await button('gallery.videoReview.downloadVideo').click();
      const download = await downloading;
      expect(download.suggestedFilename().endsWith(`.${format}`)).toBe(true);
      await download.saveAs(testInfo.outputPath(`color-export.${format}`));
      const bytes = await readFile(await download.path());
      const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
      try {
        expect((await input.getPrimaryVideoTrack())?.codec).toBe(format === 'mp4' ? 'avc' : 'vp9');
        expect((await input.getPrimaryAudioTrack())?.codec).toBe(format === 'mp4' ? 'aac' : 'opus');
      } finally {
        input.dispose();
      }
      const sourceBytes = await readFile(
        new URL('../fixtures/review-avc-padded-color.mp4', import.meta.url)
      );
      const measured = await measureColorExport(
        page,
        bytes.toString('base64'),
        sourceBytes.toString('base64')
      );
      expect(measured.width).toBe(1280);
      expect(measured.height).toBe(720);
      expect(measured.duration).toBeCloseTo(2, 1);
      expect(measured.rms).toBeGreaterThan(0.01);
      // Last fully covered content row: the neutral source edge must stay neutral, not green.
      expect(Math.abs(measured.edge[0]! - 184)).toBeLessThan(8);
      expect(Math.abs(measured.edge[1]! - 194)).toBeLessThan(8);
      expect(Math.abs(measured.edge[2]! - 201)).toBeLessThan(8);
      for (const [actual, expected] of measured.swatches.map(
        (value, index) => [value, measured.reference[index]!] as const
      ))
        for (let channel = 0; channel < 3; channel++)
          expect(
            Math.abs(actual[channel]! - expected[channel]!),
            JSON.stringify(measured)
          ).toBeLessThan(9);
    }
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

async function measureColorExport(page: Page, encoded: string, sourceEncoded: string) {
  return page.evaluate(
    async ({ encoded, sourceEncoded }) => {
      const data = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([data]));
      const video = document.createElement('video');
      const audio = new AudioContext();
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Export decode failed'));
          video.src = url;
        });
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = 1;
        });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(video, 0, 0);
        const pixel = (x: number, y: number) =>
          Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
        const swatches = [255, 605, 955].map((x) =>
          pixel(Math.round(32 + (x * 1216) / 1904), Math.round(45.78 + (230 * 1216) / 1904))
        );
        const edge = pixel(1000, 673);
        const original = document.createElement('video');
        const originalUrl = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(sourceEncoded), (c) => c.charCodeAt(0))])
        );
        let reference: number[][];
        try {
          await new Promise<void>((resolve, reject) => {
            original.onloadeddata = () => resolve();
            original.onerror = () => reject(new Error('Source decode failed'));
            original.src = originalUrl;
          });
          await new Promise<void>((resolve) => {
            original.onseeked = () => resolve();
            original.currentTime = 1;
          });
          const c = document.createElement('canvas');
          c.width = original.videoWidth;
          c.height = original.videoHeight;
          const cx = c.getContext('2d')!;
          cx.drawImage(original, 0, 0);
          const scaled = document.createElement('canvas');
          scaled.width = 1280;
          scaled.height = 720;
          const target = scaled.getContext('2d')!;
          target.fillStyle = '#000';
          target.fillRect(0, 0, 1280, 720);
          target.imageSmoothingQuality = 'high';
          const height = (984 * 1216) / 1904;
          target.drawImage(c, 32, (720 - height) / 2, 1216, height);
          reference = [255, 605, 955].map((x) =>
            Array.from(
              target.getImageData(
                Math.round(32 + (x * 1216) / 1904),
                Math.round((720 - height) / 2 + (230 * 1216) / 1904),
                1,
                1
              ).data
            ).slice(0, 3)
          );
        } finally {
          original.removeAttribute('src');
          original.load();
          URL.revokeObjectURL(originalUrl);
        }

        const buffer = await audio.decodeAudioData(data.buffer);
        const values = buffer.getChannelData(0).slice(1000, 5000);
        const rms = Math.sqrt(values.reduce((sum, x) => sum + x * x, 0) / values.length);
        return {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          edge,
          swatches,
          reference,
          rms,
        };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        await audio.close();
      }
    },
    { encoded, sourceEncoded }
  );
}
