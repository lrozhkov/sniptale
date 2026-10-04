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
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      const solid = button('gallery.videoReview.backgroundSolid');
      await solid.click();
      await expect(solid).toHaveAttribute('aria-pressed', 'true');
      await expect(solid).toHaveCSS('border-top-width', '1px');
      await expect(solid).toHaveCSS('box-shadow', 'none');
      await page.screenshot({ path: testInfo.outputPath('solid-selection.png') });
      await button('gallery.videoReview.backgroundGradient').click();
      const presets = dialog.locator('[data-ui="gallery.videoReview.gradientPresets"] button');
      const selected = presets.first();
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
