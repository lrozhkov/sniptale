import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const width of [1280, 1920])
  for (const theme of ['light', 'dark'] as const)
    test(`toolbar feedback ${width} ru ${theme}`, async ({ page }, info) => {
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
      const button = (key: Parameters<typeof translate>[0]) =>
        page.getByRole('button', { name: label(key), exact: true });
      try {
        await page.setViewportSize({ width, height: width === 1280 ? 560 : 900 });
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: {
            'sniptale-locale-preference': 'ru',
            'sniptale-theme-preference': theme,
          },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
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
        await button('gallery.videoReview.advancedEditing').click();
        await page.evaluate(() => document.fonts.ready);
        const toolbar = page.locator('.review-timeline-toolbar');
        const exportButton = toolbar.locator('[data-ui="gallery.videoReview.openExport"]');
        const help = toolbar.getByRole('button', {
          name: label('gallery.keyboard.title'),
          exact: true,
        });
        const density = button('gallery.videoReview.compactTrackHeight');
        await button('gallery.videoReview.trackSettings').click();
        await page.screenshot({ path: info.outputPath('track-settings.png'), fullPage: false });
        const lock = page
          .locator('[data-review-header-track="zoom"] [data-track-controls] button')
          .last();
        const densityBox = (await density.boundingBox())!;
        const lockBox = (await lock.boundingBox())!;
        expect
          .soft(Math.abs(densityBox.x + densityBox.width / 2 - lockBox.x - lockBox.width / 2))
          .toBeLessThanOrEqual(1);
        const trackSwitch = page.locator('[data-review-header-track="zoom"]').getByRole('switch');
        await expect.soft(trackSwitch).toHaveClass(/sniptale-glass-switch/);
        await trackSwitch.click();
        await expect(trackSwitch).toHaveAttribute('aria-checked', 'false');
        await trackSwitch.press('Space');
        await expect(trackSwitch).toHaveAttribute('aria-checked', 'true');
        await density.click();
        await expect(density).toHaveAttribute('aria-pressed', 'true');
        await expect.soft(density.locator('svg')).toHaveClass(/lucide-chevrons-up-down/);
        await density.click();
        await expect.soft(density.locator('svg')).toHaveClass(/lucide-chevrons-down-up/);
        await button('gallery.videoReview.trackSettings').click();
        const helpBox = (await help.boundingBox())!;
        const exportBox = (await exportButton.boundingBox())!;
        expect.soft(helpBox.x).toBeGreaterThanOrEqual(exportBox.x + exportBox.width);
        await help.click();
        await expect(page.locator('dialog[open]')).toHaveCount(2);
        await page.keyboard.press('Escape');
        await expect(help).toBeFocused();
        for (const key of [
          'gallery.videoReview.undo',
          'gallery.videoReview.redo',
          'gallery.videoReview.historyReset',
        ] as const)
          await expect.soft(button(key).locator('[data-review-toolbar-label]')).toHaveCount(0);
        const reset = button('gallery.videoReview.historyReset');
        await reset.hover();
        await expect(reset).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(reset).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
        await reset.click();
        await expect(page.locator('[data-ui="gallery.videoReview.historyChoices"]')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(reset).toBeFocused();
        const cut = button('gallery.videoReview.cutMode');
        await page.mouse.move(0, 0);
        await expect.soft(cut).toHaveCSS('font-weight', '400');
        await cut.hover();
        await expect.soft(cut).toHaveCSS('font-weight', '450');
        await page.screenshot({ path: info.outputPath('toolbar-hover.png'), fullPage: false });
        await addReviewFocus(page);
        await button('gallery.videoReview.undo').click();
        await expect(button('gallery.videoReview.redo')).toBeEnabled();
        await button('gallery.videoReview.redo').click();
        await button('gallery.videoReview.play').click();
        const pause = button('gallery.videoReview.pause');
        await expect.soft(pause.locator('svg rect')).toHaveCount(2);
        await pause.click();
        await expect(button('gallery.videoReview.play')).toBeVisible();
        if (width === 1280 && theme === 'light') {
          await button('gallery.videoReview.annotationEffectsAdd').click();
          const selector = button('gallery.videoReview.annotationEffectsChoose');
          const description = await selector.getAttribute('aria-describedby');
          expect(description).not.toBeNull();
          const marker = page.locator(`[id="${description}"]`);
          const markerBox = (await marker.boundingBox())!;
          const selectorBox = (await selector.boundingBox())!;
          expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(selectorBox.x);
          await selector.click();
          await page.getByRole('option', { name: 'Главная мысль', exact: true }).click();
          await expect(selector).toHaveText('Главная мысль');
          await page.screenshot({
            path: info.outputPath('annotation-choice.png'),
            fullPage: false,
          });
          await button('gallery.videoReview.pointerTool').click();
          await page.setViewportSize({ width: 1100, height: 560 });
          const scroll = page.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
          await expect(scroll).toHaveCSS('overflow-x', 'auto');
          expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
          await scroll.evaluate((node) => {
            node.scrollLeft = node.scrollWidth;
          });
          await expect(help).toBeInViewport();
          await help.click();
          await page.keyboard.press('Escape');
          await expect(help).toBeFocused();
          await page.screenshot({ path: info.outputPath('below-minimum.png'), fullPage: false });
        }
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
