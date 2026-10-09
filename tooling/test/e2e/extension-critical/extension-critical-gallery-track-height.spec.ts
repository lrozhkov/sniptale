import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`quick editor compact track geometry (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      const focus = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const density = dialog
        .locator('[data-ui="gallery.videoReview.trackControls"]')
        .getByRole('button', {
          name: label('gallery.videoReview.compactTrackHeight'),
          exact: true,
        });
      await expect(
        dialog.getByRole('button', {
          name: label('gallery.videoReview.compactTrackHeight'),
          exact: true,
        })
      ).toHaveCount(1);
      await expect(source).toHaveCSS('height', '48px');
      await density.click();
      await expect(source).toHaveCSS('height', '32px');
      await expect(density).toHaveAttribute('aria-pressed', 'true');
      const sourceRect = (await source.boundingBox())!;
      await page.mouse.move(sourceRect.x + sourceRect.width * 0.2, sourceRect.y + 16);
      await page.mouse.down();
      await page.mouse.move(sourceRect.x + sourceRect.width * 0.4, sourceRect.y + 16, { steps: 4 });
      await page.mouse.up();
      await expect(dialog.locator('[data-ui="gallery.videoReview.sourceRange"]')).toBeVisible();
      await page.screenshot({
        path: info.outputPath('compact-source-selection.png'),
        fullPage: false,
      });
      await button('gallery.videoReview.advancedEditing').click();
      const seek = async (time: number) => {
        const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
        await ruler.scrollIntoViewIfNeeded();
        const rect = (await ruler.boundingBox())!;
        const duration = Number(
          await dialog
            .locator('[data-ui="gallery.videoReview.timePlane"]')
            .getAttribute('aria-valuemax')
        );
        await page.mouse.click(rect.x + (rect.width * time) / duration, rect.y + 12);
      };
      await density.click();
      await seek(0.5);
      await addReviewFocus(page);
      await seek(6);
      await addReviewFocus(page);
      const link = focus.locator('[data-ui="gallery.videoReview.zoomLink"]');
      await expect(link).toHaveCount(1);
      await link.click();
      await expect(link).toHaveAttribute('data-connected', 'true');
      await seek(6);
      await button('gallery.videoReview.focusRangeTool').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.editingTools"]')
        .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusBorder'), exact: true })
        .click();
      await addReviewFocus(page);
      const blocks = focus.locator('[role="button"]');
      await expect(blocks).toHaveCount(3);
      await expect(focus).toHaveCSS('height', '68px');
      await expect(blocks.last()).toHaveCSS('height', '32px');
      await page.screenshot({ path: info.outputPath('normal-focus-height.png'), fullPage: false });
      const leftBefore = await blocks
        .last()
        .evaluate((node) => ({ left: node.style.left, width: node.style.width }));
      await density.click();
      await expect(focus).toHaveCSS('height', '52px');
      await expect(blocks.last()).toHaveCSS('height', '24px');
      await expect(link).toHaveCSS('height', '20px');
      await expect(link).toHaveCSS('top', '2px');
      expect(
        await blocks.last().evaluate((node) => ({ left: node.style.left, width: node.style.width }))
      ).toEqual(leftBefore);
      await expect(blocks.last()).toHaveAttribute('aria-pressed', 'true');
      await density.click();
      await expect(source).toHaveCSS('height', '48px');
      await expect(focus).toHaveCSS('height', '68px');
      await density.click();
      const visibility = dialog
        .locator('[data-ui="gallery.videoReview.trackControls"]')
        .getByRole('button', { name: label('gallery.videoReview.zoomTrack'), exact: true });
      await visibility.click();
      await expect(focus).toHaveCount(0);
      await visibility.click();
      await expect(focus).toHaveCSS('height', '52px');
      await button('gallery.videoReview.advancedEditing').click();
      await expect(source).toHaveCSS('height', '32px');
      await button('gallery.videoReview.advancedEditing').click();
      await expect(focus).toHaveCSS('height', '52px');
      await expect(
        dialog.getByRole('button', {
          name: label('gallery.videoReview.compactTrackHeight'),
          exact: true,
        })
      ).toHaveCount(1);
      await blocks.last().scrollIntoViewIfNeeded();
      const before = (await persistedFocus(page))!.sourceAnchor!.start;
      const block = (await blocks.last().boundingBox())!;
      await page.mouse.move(block.x + block.width / 2, block.y + block.height / 2);
      await page.mouse.down();
      await page.keyboard.down('Shift');
      await page.mouse.move(block.x + block.width / 2 + 25, block.y + block.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await expect
        .poll(async () => (await persistedFocus(page))?.sourceAnchor?.start ?? before)
        .toBeGreaterThan(before);
      await link.click();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.zoomLinkInspector"]')
      ).toBeVisible();
      await expect(link).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: info.outputPath('compact-track-height.png'), fullPage: false });
      const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      const selectRange = async (start: number, end: number) => {
        await ruler.scrollIntoViewIfNeeded();
        const rect = (await ruler.boundingBox())!;
        await page.mouse.move(rect.x + (rect.width * start) / 12.01, rect.y + 12);
        await page.mouse.down();
        await page.mouse.move(rect.x + (rect.width * end) / 12.01, rect.y + 12, { steps: 5 });
        await page.mouse.up();
      };
      await selectRange(8, 11);
      await button('gallery.videoReview.speedMode').click();
      await selectRange(9, 10);
      await button('gallery.videoReview.cutMode').click();
      const edits = source.locator('[data-ui="gallery.videoReview.editBlock"]');
      await expect(edits).toHaveCount(2);
      for (const edit of await edits.all()) await expect(edit).toHaveCSS('height', '24px');
      await expect(source).toHaveCSS('height', '60px');
      await page.screenshot({ path: info.outputPath('compact-overlap.png'), fullPage: false });
      await density.click();
      await expect(source).toHaveCSS('height', '60px');
      for (const edit of await edits.all()) await expect(edit).toHaveCSS('height', '24px');
      await expect(focus).toHaveCSS('height', '68px');
      for (const control of [density]) {
        const fit = await control.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const parent = node
            .closest('[data-ui="gallery.videoReview.trackHeader"]')!
            .getBoundingClientRect();
          return (
            rect.left >= parent.left &&
            rect.right <= parent.right &&
            rect.top >= parent.top &&
            rect.bottom <= parent.bottom
          );
        });
        expect(fit).toBe(true);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
