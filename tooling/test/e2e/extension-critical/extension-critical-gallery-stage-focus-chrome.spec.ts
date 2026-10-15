import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light', narrow: false },
  { locale: 'ru', theme: 'dark', narrow: false },
  { locale: 'en', theme: 'light', narrow: true },
] as const) {
  test(`stage Focus chrome hides during capture (${variant.locale}, narrow=${variant.narrow})`, async ({
    page,
  }, info) => {
    if (variant.narrow) await page.setViewportSize({ width: 1200, height: 560 });
    const server = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      const ruler = await dialog.locator('[data-ui="gallery.videoReview.ruler"]').boundingBox();
      if (!ruler) throw new Error('Timeline ruler missing');
      await page.mouse.click(ruler.x + ruler.width / 12.01, ruler.y + 12);
      const types = dialog.locator('[data-ui="gallery.videoReview.focusType"]');
      const stage = dialog.locator('[data-ui="gallery.videoReview.stage"] [data-focus-frame]');
      const inspector = dialog.locator(
        '[data-ui="gallery.videoReview.zoomPreview"] [data-focus-frame]'
      );
      for (const kind of ['spotlight', 'border'] as const) {
        await types
          .getByRole('button', {
            name: label(
              kind === 'border'
                ? 'gallery.videoReview.focusBorder'
                : 'gallery.videoReview.focusSpotlight'
            ),
            exact: true,
          })
          .click();
        const area = async () => (await persistedFocus(page))?.[kind]?.area;
        await expect.poll(area).toBeDefined();
        await expect(inspector).toHaveAttribute('data-controls-visible', 'true');
        await pressCenter(page, inspector);
        await page.mouse.move(page.viewportSize()!.width - 150, 220, { steps: 3 });
        await expect(inspector).toHaveAttribute('data-controls-visible', 'true');
        await expect(inspector.locator('[data-resize="nw"]')).toHaveCSS('opacity', '1');
        await page.keyboard.press('Escape');
        await page.mouse.up();

        const before = (await area())!;
        await stage.focus();
        await stage.hover();
        await chrome(stage, true);
        const origin = await pressCenter(page, stage);
        await chrome(stage, false);
        await page.mouse.move(origin.x + 16, origin.y + 10, { steps: 4 });
        await chrome(stage, false);
        await page.screenshot({ path: info.outputPath(`${kind}-dragging.png`), fullPage: false });
        await page.mouse.up();
        await chrome(stage, true);
        await expect.poll(async () => (await area())?.x ?? 0).toBeGreaterThan(before.x);
        const moved = (await area())!;
        const grip = stage.locator('[data-resize="se"]');
        const corner = await pressCenter(page, grip);
        await chrome(stage, false);
        await page.mouse.move(corner.x - 12, corner.y - 8, { steps: 3 });
        await chrome(stage, false);
        await page.mouse.up();
        await chrome(stage, true);
        await expect.poll(async () => (await area())?.width ?? 1).toBeLessThan(moved.width);

        const resized = await area();
        const center = await pressCenter(page, stage);
        await page.mouse.move(center.x + 8, center.y + 5);
        await chrome(stage, false);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await chrome(stage, true);
        await expect.poll(area).toEqual(resized);
        await pressCenter(page, stage);
        await page.mouse.move(5, 5, { steps: 3 });
        await chrome(stage, false);
        await page.mouse.up();
        await chrome(stage, false);
        await expect(inspector).toHaveAttribute('data-controls-visible', 'true');
        await stage.hover();
        await chrome(stage, true);
        await page.screenshot({
          path: info.outputPath(`${kind}-hover-restored.png`),
          fullPage: false,
        });
        await page.mouse.move(5, 5);
        await chrome(stage, false);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function pressCenter(page: Page, target: Locator) {
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error('Focus target missing');
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  return point;
}

async function chrome(frame: Locator, visible: boolean) {
  await expect(frame).toHaveAttribute('data-controls-visible', String(visible));
  await expect(frame.locator('[data-resize="nw"]')).toHaveCSS('opacity', visible ? '1' : '0');
  if (!visible) await expect(frame).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
}
