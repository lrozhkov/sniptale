import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function checkTextGesture(page: Page, block: Locator, undo: Locator, redo: Locator) {
  await block.scrollIntoViewIfNeeded();
  const initial = (await block.boundingBox())!;
  const drag = async () => {
    await page.mouse.move(initial.x + 20, initial.y + initial.height / 2);
    await page.mouse.down();
    await page.mouse.move(initial.x + 50, initial.y + initial.height / 2, { steps: 5 });
  };
  await drag();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeCloseTo(initial.x, 0);
  await drag();
  await page.mouse.up();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeGreaterThan(initial.x + 20);
  await undo.click();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeCloseTo(initial.x, 0);
  await redo.click();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeGreaterThan(initial.x + 20);
}

async function resizeInspectorContent(page: Page, dialog: Locator, width: number) {
  const content = dialog.locator('.review-inspector-scroll');
  const readWidth = () =>
    content.evaluate((element) => Number.parseFloat(getComputedStyle(element).width));
  const current = await readWidth();
  const handle = (await dialog
    .locator('[data-ui="gallery.videoReview.resizeInspector"]')
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - (width - current), handle.y + 20);
  await page.mouse.up();
  await expect.poll(readWidth).toBe(width);
}

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'light' },
  { width: 1920, height: 900, locale: 'en', theme: 'dark' },
  { width: 1024, height: 560, locale: 'ru', theme: 'light' },
] as const) {
  test(`manual track text ${variant.width}x${variant.height} ${variant.locale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
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
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.textTrackOpen').click();
      const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
      const track = dialog.locator('[data-ui="gallery.videoReview.textTrack"]');
      await expect(document).toBeVisible();
      await document
        .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
        .click();
      const textbox = document.getByRole('textbox', {
        name: label('gallery.videoReview.speechText'),
        exact: true,
      });
      await expect(textbox).toBeFocused();
      await textbox.fill('Первая фраза');
      await document
        .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
        .click();
      await expect(textbox).toHaveCount(1);
      await textbox.fill('Вторая фраза');
      await expect(track.locator('[data-text-id]')).toHaveCount(2);
      const blocks = track.locator('[data-text-id]');
      const first = (await blocks.nth(0).boundingBox())!;
      const second = (await blocks.nth(1).boundingBox())!;
      expect(first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true);
      const cards = document.locator('[data-ui="gallery.videoReview.textPhrase"]');
      await cards.nth(0).locator('button[aria-expanded]').click();
      await expect(textbox).toHaveValue('Первая фраза');
      await cards.nth(0).locator('button[aria-expanded]').click();
      await expect(textbox).toHaveCount(0);
      await document.getByRole('searchbox').fill('Вторая');
      await expect(cards).toHaveCount(1);
      await document.getByRole('searchbox').fill('');
      await expect(cards).toHaveCount(2);
      await cards.nth(1).locator('button[aria-expanded]').click();
      await expect(textbox).toHaveValue('Вторая фраза');
      const visibility = document.getByRole('switch', {
        name: label('gallery.videoReview.textFragmentShown'),
        exact: true,
      });
      await visibility.scrollIntoViewIfNeeded();
      await expect(visibility).toBeVisible();
      const switchBox = (await visibility.boundingBox())!;
      expect(switchBox.y + switchBox.height).toBeLessThanOrEqual(variant.height);
      await page.screenshot({ path: info.outputPath('text-document.png'), fullPage: false });
      if (variant.width === 1920) {
        for (const width of [523, 524, 525]) {
          await resizeInspectorContent(page, dialog, width);
          await expect(
            dialog.locator('[data-ui="gallery.videoReview.inspectorNavigation"] button')
          ).toHaveCount(3);
          await expect(document).toBeVisible();
          for (const control of [
            document.getByRole('searchbox'),
            document.getByRole('button', {
              name: label('gallery.videoReview.textFragmentAdd'),
              exact: true,
            }),
          ]) {
            const bounds = (await control.boundingBox())!;
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(variant.width);
          }
          await page.screenshot({
            path: info.outputPath(`text-inspector-${width}.png`),
            fullPage: false,
          });
        }
      }
      await blocks.nth(0).press('Enter');
      await expect(document).toHaveCount(0);
      await expect(
        dialog.getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
      ).toHaveValue('Первая фраза');
      await button('gallery.videoReview.textTrackOpen').click();
      await expect(document).toBeVisible();
      await expect(
        dialog.getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
      ).toHaveCount(0);
      await checkTextGesture(
        page,
        blocks.nth(0),
        button('gallery.videoReview.undo'),
        button('gallery.videoReview.redo')
      );
      if (variant.width < 1280) {
        await dialog
          .getByRole('slider', { name: label('videoEditor.timeline.zoom'), exact: true })
          .press('End');
        const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
        await expect
          .poll(() => viewport.evaluate((element) => element.scrollWidth > element.clientWidth))
          .toBe(true);
        await viewport.hover();
        await page.mouse.wheel(600, 0);
        await expect
          .poll(() => viewport.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('text-horizontal-scroll.png'),
          fullPage: false,
        });
        await button('gallery.videoReview.fit').click();
      }
      // Reload exercises the actual advanced writer and persisted history, not a test-only text state.
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.textTrackOpen').click();
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toContainText('Первая фраза');
      await expect(cards.nth(1)).toContainText('Вторая фраза');
      await page.screenshot({ path: info.outputPath('text-restored.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
