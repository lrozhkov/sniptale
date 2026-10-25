import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`quick editor track settings finish saving and preserve lane spacing (${viewport.width})`, async ({
    page,
  }, info) => {
    page.setDefaultTimeout(15000);
    await page.setViewportSize(viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
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
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.trackSettings').click();
      const toggles = dialog.locator('[data-review-header-track] [role="switch"]');
      await expect
        .poll(() =>
          dialog.locator('[data-ui="autosave-control"] > button').getAttribute('aria-label')
        )
        .toContain(label('common.states.saved'));
      expect(await toggles.count()).toBeGreaterThan(4);
      for (const toggle of await toggles.all()) {
        if (
          (await toggle.getAttribute('aria-label'))?.includes(label('gallery.videoReview.webcam'))
        )
          continue;
        await expect(toggle).toBeEnabled();
        const name = await toggle.getAttribute('aria-label');
        await test.step(`toggle ${name}`, async () => {
          const checked = await toggle.isChecked();
          await toggle.click();
          await expect(toggle).toBeChecked({ checked: !checked });
          await expect(toggle).toBeEnabled();
          const track = await toggle.evaluate((node) =>
            node.closest('[data-review-header-track]')?.getAttribute('data-review-header-track')
          );
          const row = dialog.locator(`[data-review-track="${track}"]`);
          if (checked) {
            await expect(row).toHaveAttribute('data-review-track-muted', 'true');
            expect(
              await row
                .locator('[data-review-track-content]')
                .evaluate((node) => getComputedStyle(node, '::after').backgroundImage)
            ).toContain('repeating-linear-gradient');
          }
          const tool =
            track === 'zoom'
              ? 'gallery.videoReview.focusRangeTool'
              : track === 'annotationEffects'
                ? 'gallery.videoReview.annotationEffectsAdd'
                : track === 'originalAudio'
                  ? 'gallery.videoReview.originalAudioRange'
                  : null;
          if (tool && checked) await expect(button(tool)).toHaveCount(0);
          await expect
            .poll(() =>
              dialog.locator('[data-ui="autosave-control"] > button').getAttribute('aria-label')
            )
            .toContain(label('common.states.saved'));
          await toggle.click();
          await expect(toggle).toBeChecked({ checked });
          await expect(toggle).toBeEnabled();
        });
      }
      await dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]').evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect
        .poll(() =>
          dialog
            .locator('[data-ui="gallery.videoReview.trackListViewport"]')
            .evaluate((node) => node.scrollTop)
        )
        .toBe(0);
      await page.screenshot({ path: info.outputPath('track-settings-saved.png'), fullPage: false });
      const gaps = await dialog
        .locator('[data-review-track] > [data-review-track-content]')
        .evaluateAll((nodes) => {
          const rects = nodes
            .map((node) => (node.firstElementChild ?? node).getBoundingClientRect())
            .filter((rect) => rect.height > 0);
          return rects.slice(1).map((rect, index) => rect.top - rects[index]!.bottom);
        });
      expect(gaps.length).toBeGreaterThan(4);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(4);
      const alignment = await dialog.locator('[data-review-track]').evaluateAll((rows) =>
        rows.map((row) => {
          const track = row.getAttribute('data-review-track');
          const header = document.querySelector(`[data-review-header-track="${track}"]`);
          return header
            ? Math.abs(header.getBoundingClientRect().top - row.getBoundingClientRect().top)
            : Infinity;
        })
      );
      for (const delta of alignment) expect(delta).toBeLessThanOrEqual(1);
      await button('gallery.videoReview.trackSettings').click();
      for (let i = 0; i < 4; i++) await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.trackSettings').click();
      const focusToggle = dialog.locator('[data-review-header-track="zoom"] [role="switch"]');
      await dialog.locator('[data-review-header-track="zoom"] [data-review-track-select]').click();
      await button('gallery.videoReview.focusRangeTool').click();
      await focusToggle.click();
      await expect(focusToggle).not.toBeChecked();
      await expect(button('gallery.videoReview.focusRangeTool')).toHaveCount(0);
      await expect(button('gallery.videoReview.pointerTool')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      for (const toggle of await toggles.all()) {
        if (await toggle.isChecked()) {
          await expect(toggle).toBeEnabled();
          await toggle.click();
          await expect(toggle).not.toBeChecked();
        }
      }
      await expect(button('gallery.videoReview.annotationEffectsAdd')).toHaveCount(0);
      await expect(button('gallery.videoReview.originalAudioRange')).toHaveCount(0);
      await expect(button('gallery.videoReview.cutMode')).toBeVisible();
      await expect(button('gallery.videoReview.speedMode')).toBeVisible();
      await dialog.locator('[data-review-track="annotationEffects"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('disabled-tracks.png'), fullPage: false });
      await expect
        .poll(() =>
          dialog.locator('[data-ui="autosave-control"] > button').getAttribute('aria-label')
        )
        .toContain(label('common.states.saved'));
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).last().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.trackSettings').click();
      await expect(focusToggle).not.toBeChecked();
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

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
      await button('gallery.videoReview.speedMode').click();
      await source.scrollIntoViewIfNeeded();
      const sourceRect = (await source.boundingBox())!;
      await page.mouse.move(sourceRect.x + sourceRect.width * 0.2, sourceRect.y + 16);
      await page.mouse.down();
      await page.mouse.move(sourceRect.x + sourceRect.width * 0.4, sourceRect.y + 16, { steps: 4 });
      await page.mouse.up();
      await expect(source.locator('[data-ui="gallery.videoReview.editBlock"]')).toBeVisible();
      await page.screenshot({
        path: info.outputPath('compact-source-selection.png'),
        fullPage: false,
      });
      await button('gallery.videoReview.undo').click();
      await expect(source.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(0);
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
      await dialog.locator('[data-review-header-track="zoom"] [data-review-track-select]').click();
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
      await expect(focus).toHaveCSS('height', '72px');
      await expect(blocks.last()).toHaveCSS('height', '32px');
      await page.screenshot({ path: info.outputPath('normal-focus-height.png'), fullPage: false });
      const leftBefore = await blocks
        .last()
        .evaluate((node) => ({ left: node.style.left, width: node.style.width }));
      await density.click();
      await expect(focus).toHaveCSS('height', '56px');
      await expect(blocks.last()).toHaveCSS('height', '24px');
      await expect(link).toHaveCSS('height', '20px');
      await expect(link).toHaveCSS('top', '4px');
      expect(
        await blocks.last().evaluate((node) => ({ left: node.style.left, width: node.style.width }))
      ).toEqual(leftBefore);
      await expect(blocks.last()).toHaveAttribute('aria-pressed', 'true');
      await density.click();
      await expect(source).toHaveCSS('height', '48px');
      await expect(focus).toHaveCSS('height', '72px');
      await density.click();
      await button('gallery.videoReview.trackSettings').click();
      const visibility = dialog.locator('[data-review-header-track="zoom"] [role="switch"]');
      await visibility.click();
      await button('gallery.videoReview.trackSettings').click();
      await expect(focus).toHaveCount(0);
      await button('gallery.videoReview.trackSettings').click();
      await visibility.click();
      await button('gallery.videoReview.trackSettings').click();
      await expect(focus).toHaveCSS('height', '56px');
      await button('gallery.videoReview.advancedEditing').click();
      await expect(source).toHaveCSS('height', '32px');
      await button('gallery.videoReview.advancedEditing').click();
      await expect(focus).toHaveCSS('height', '56px');
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
      await page.keyboard.down('Alt');
      await page.mouse.move(block.x + block.width / 2 + 25, block.y + block.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
      await page.keyboard.up('Alt');
      await expect
        .poll(async () => (await persistedFocus(page))?.sourceAnchor?.start ?? before)
        .toBeGreaterThan(before);
      await link.click();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.zoomLinkInspector"]')
      ).toBeVisible();
      await expect(link).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: info.outputPath('compact-track-height.png'), fullPage: false });
      const selectRange = async (start: number, end: number) => {
        await source.scrollIntoViewIfNeeded();
        const rect = (await source.boundingBox())!;
        await page.mouse.move(rect.x + (rect.width * start) / 12.01, rect.y + 12);
        await page.mouse.down();
        await page.mouse.move(rect.x + (rect.width * end) / 12.01, rect.y + 12, { steps: 5 });
        await page.mouse.up();
      };
      await dialog
        .locator('[data-review-header-track="source"] [data-review-track-select]')
        .click();
      await button('gallery.videoReview.speedMode').click();
      await selectRange(8, 11);
      await button('gallery.videoReview.cutMode').click();
      await selectRange(7, 10);
      const edits = source.locator('[data-ui="gallery.videoReview.editBlock"]');
      await expect(edits).toHaveCount(2);
      for (const edit of await edits.all()) await expect(edit).toHaveCSS('height', '24px');
      await expect(source).toHaveCSS('height', '60px');
      await page.screenshot({ path: info.outputPath('compact-overlap.png'), fullPage: false });
      await density.click();
      await expect(source).toHaveCSS('height', '60px');
      for (const edit of await edits.all()) await expect(edit).toHaveCSS('height', '24px');
      await expect(focus).toHaveCSS('height', '72px');
      for (const control of [density]) {
        const fit = await control.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const parent = node
            .closest('[data-ui="gallery.videoReview.trackControls"]')!
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
