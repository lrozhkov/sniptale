import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quiet Background selection at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
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
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      const solid = button('gallery.videoReview.backgroundSolid');
      await solid.click();
      await expect(solid).toHaveAttribute('aria-pressed', 'true');
      await expect(solid).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect(solid).toHaveCSS('box-shadow', 'none');
      const modes = dialog.locator('.review-background-kinds button');
      const geometry = await modes.evaluateAll((nodes) =>
        nodes.map((node) => ({
          y: node.getBoundingClientRect().y,
          fits: node.scrollWidth <= node.clientWidth,
        }))
      );
      expect(geometry).toHaveLength(3);
      expect(geometry.every((value) => value.y === geometry[0]!.y && value.fits)).toBe(true);
      const paint = dialog.locator('.review-background-paint');
      await expect(paint.locator('button > svg')).toBeHidden();
      const fieldBox = (await paint.boundingBox())!;
      const paintBox = (await paint.locator('button').boundingBox())!;
      expect(paintBox.x + paintBox.width).toBeCloseTo(fieldBox.x + fieldBox.width, 0);
      await page.screenshot({ path: testInfo.outputPath('solid-selection.png') });

      const more = dialog.getByRole('button', {
        name: label('settings.editor.backgrounds.showMore'),
        exact: true,
      });
      await more.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('gradient-more.png'), fullPage: false });
      await more.hover();
      await page.screenshot({
        path: testInfo.outputPath('gradient-more-hover.png'),
        fullPage: false,
      });
      await more.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(more).toBeFocused();
      await expect(more).toHaveCSS('outline-width', '2px');
      await more.click();
      await expect(dialog.locator('[data-ui="shared.ui.backgroundThumbnails.group"]')).toHaveText([
        label('gallery.videoReview.backgroundColors'),
        label('gallery.videoReview.backgroundGradients'),
      ]);
      const selected = dialog
        .locator('[data-ui="gallery.videoReview.gradientPresets"] button[style*="gradient"]')
        .first();
      await selected.click();
      await page.mouse.move(10, 10);
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      const colors = await selected.evaluate((node) => {
        const probe = document.createElement('span');
        node.append(probe);
        probe.style.color = 'var(--sniptale-color-text-secondary)';
        const neutral = getComputedStyle(probe).color;
        probe.style.color = 'var(--sniptale-color-accent)';
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return { neutral, accent };
      });
      await expect(selected).toHaveCSS('outline-width', '1px');
      await expect(selected).toHaveCSS('outline-color', colors.neutral);
      await expect(selected).toHaveCSS('opacity', '1');
      await selected.hover();
      await expect(selected).toHaveCSS('opacity', '0.8');
      await page.screenshot({ path: testInfo.outputPath('gradient-selection.png') });
      await selected.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(selected).toBeFocused();
      await expect(selected).toHaveCSS('outline-width', '2px');
      await expect(selected).toHaveCSS('outline-color', colors.accent);
      await expect(dialog.locator('[data-ui="gallery.videoReview.inspector"]')).toBeInViewport();
      const presetName = await selected.getAttribute('aria-label');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.scene').click();
      // The combined palette starts with colors; reveal the gradient page again on reopen.
      await more.click();
      const restored = dialog.locator(
        '[data-ui="gallery.videoReview.gradientPresets"] button[aria-pressed="true"]'
      );
      await expect(restored).toHaveCount(1);
      await expect(restored).toHaveAttribute('aria-label', presetName!);
      await expect(restored).toHaveCSS('outline-width', '1px');
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
