import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { syntheticSpeechWav, speechModelResponse } from '../support/voiceover-speech-fixture';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor Focus area corners and hover at HD (${variant.locale}/${variant.theme})`, async ({
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
      await addReviewFocus(page);
      const type = dialog.locator('[data-ui="gallery.videoReview.focusType"]');
      await expect(type.getByRole('button')).toHaveCount(3);
      const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      await expect(preview).toHaveAttribute('data-status', 'ready');
      const frame = preview.locator('[data-focus-frame]');
      await expect
        .poll(async () => (await persistedFocus(page))?.transform.scale)
        .toBeGreaterThan(1);
      await page.mouse.move(5, 5);
      await expect(frame).toHaveAttribute('data-controls-visible', 'true');
      const tracks = dialog.locator('[data-ui="gallery.videoReview.trackControls"] button');
      for (const control of await tracks.all()) {
        const before = (await control.boundingBox())!;
        await control.hover();
        await expect(control).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
        const after = (await control.boundingBox())!;
        expect(after).toEqual(before);
      }
      const initial = (await persistedFocus(page))!.transform;
      for (const corner of ['nw', 'ne', 'sw', 'se']) {
        const before = (await persistedFocus(page))!.transform;
        await frame.hover();
        const grip = frame.locator(`[data-resize="${corner}"]`);
        await expect(grip).toHaveCSS(
          'cursor',
          corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
        );
        await expect(grip).toHaveCSS('opacity', '1');
        const box = (await grip.boundingBox())!;
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(
          x + (corner.endsWith('w') ? 8 : -8),
          y + (corner.startsWith('n') ? 5 : -5),
          { steps: 5 }
        );
        await page.mouse.up();
        await expect
          .poll(async () => (await persistedFocus(page))?.transform.scale)
          .toBeGreaterThan(before.scale);
        await button('gallery.videoReview.undo').click();
        await expect
          .poll(async () => (await persistedFocus(page))?.transform.scale)
          .toBeCloseTo(before.scale);
      }
      await frame.hover();
      const grip = frame.locator('[data-resize="se"]');
      const box = (await grip.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(5, 5);
      await expect(frame).toHaveAttribute('data-controls-visible', 'true');
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(frame).toHaveAttribute('data-controls-visible', 'true');
      await expect(grip).toHaveCSS('opacity', '1');
      await expect.poll(async () => (await persistedFocus(page))?.transform).toEqual(initial);
      const canvas = preview.locator('canvas');
      await button('gallery.videoReview.zoomPreviewResult').click();
      await expect(frame).toHaveCount(0);
      await button('gallery.videoReview.zoomPreviewArea').click();
      await canvas.focus();
      await page.keyboard.press('ArrowRight');
      await expect(frame.locator('[data-resize="nw"]')).toHaveCSS('opacity', '1');
      await button('gallery.videoReview.undo').click();
      await type
        .getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await expect(frame).toHaveAttribute('role', 'group');
      await expect(frame.locator('[data-resize]')).toHaveCount(4);
      await frame.hover();
      const nw = frame.locator('[data-resize="nw"]');
      const spotBox = (await nw.boundingBox())!;
      await page.mouse.move(spotBox.x + spotBox.width / 2, spotBox.y + spotBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(spotBox.x - 8, spotBox.y - 5, { steps: 5 });
      await page.mouse.up();
      await expect
        .poll(async () => (await persistedFocus(page))?.spotlight?.area.width)
        .toBeGreaterThan(0.5);
      const saved = (await persistedFocus(page))!.spotlight;
      await page.mouse.move(5, 5);
      await expect(frame).toHaveAttribute('data-controls-visible', 'true');
      await expect(nw).toHaveCSS('opacity', '1');
      await frame.hover();
      await expect(nw).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: testInfo.outputPath(`focus-frame-${variant.locale}-${variant.theme}.png`),
      });
      await button('common.actions.close').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(
        type.getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await persistedFocus(page))?.spotlight).toEqual(saved);
      await button('gallery.videoReview.undo').click();
      await expect
        .poll(async () => (await persistedFocus(page))?.spotlight?.area.width)
        .toBeCloseTo(0.5);
      await dialog
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.preciseArea') })
        .click();
      for (const key of ['focusAreaWidth', 'focusAreaHeight'] as const) {
        const input = dialog.getByRole('textbox', {
          name: label(`gallery.videoReview.${key}`),
          exact: true,
        });
        await input.fill('1');
        await input.press('Enter');
      }
      await expect
        .poll(async () => (await persistedFocus(page))?.spotlight?.area.width)
        .toBeCloseTo(0.01);
      await frame.hover();
      const grips = await frame.locator('[data-resize]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const bounds = node.getBoundingClientRect();
          return {
            corner: node.getAttribute('data-resize'),
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
          };
        })
      );
      const nwBounds = grips.find((item) => item.corner === 'nw')!;
      const neBounds = grips.find((item) => item.corner === 'ne')!;
      const swBounds = grips.find((item) => item.corner === 'sw')!;
      expect(nwBounds.right).toBeLessThanOrEqual(neBounds.left + 0.1);
      expect(nwBounds.bottom).toBeLessThanOrEqual(swBounds.top + 0.1);
      await button('common.actions.close').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`selected element Actions section (${variant.locale}/${variant.theme})`, async ({
    page,
  }, info) => {
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      const actions = dialog.locator('[data-section="actions"]');
      const heading = actions.locator('summary');
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toContainText(label('gallery.videoReview.actionActions'));
      await expect(heading.locator('svg.lucide-ellipsis')).toHaveCount(1);
      const duplicate = button('gallery.videoReview.focusDuplicate');
      await expect(duplicate).toBeDisabled();
      await expect(duplicate).toHaveAttribute(
        'title',
        label('gallery.videoReview.focusDuplicateZoom')
      );
      await heading.click();
      await expect(button('gallery.videoReview.zoomDelete')).not.toBeVisible();
      await heading.click();
      const remove = button('gallery.videoReview.zoomDelete');
      await remove.scrollIntoViewIfNeeded();
      await page.mouse.move(5, 5);
      const normal = await remove.evaluate((node) => getComputedStyle(node).color);
      await remove.hover();
      expect(await remove.evaluate((node) => getComputedStyle(node).color)).not.toBe(normal);
      await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      for (const target of [523, 524, 525]) {
        const scroll = dialog.locator('.review-inspector-scroll');
        const width = () =>
          scroll.evaluate((node) => {
            const style = getComputedStyle(node);
            return (
              node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            );
          });
        const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
        for (let attempt = 0; attempt < 3 && Math.abs((await width()) - target) > 0.5; attempt++) {
          const current = await width();
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 20);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 20, { steps: 4 });
          await page.mouse.up();
        }
        await expect.poll(width).toBe(target);
        await remove.scrollIntoViewIfNeeded();
        const bounds = (await actions.boundingBox())!;
        expect(bounds.width).toBeCloseTo(target < 524 ? target : (target - 12) / 2, 0);
        for (const command of await actions.getByRole('button').all()) {
          const box = (await command.boundingBox())!;
          expect(box.height).toBe(32);
          expect(box.width).toBeCloseTo(bounds.width, 0);
          expect(box.x).toBeGreaterThanOrEqual(bounds.x);
          expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.5);
          await expect(command.locator('svg')).toHaveAttribute('width', '15');
        }
        await page.screenshot({ path: info.outputPath(`actions-${target}.png`), fullPage: false });
      }
      await button('scenario.editor.inspectorShowSections').click();
      const category = dialog
        .locator('[data-ui="gallery.videoReview.inspectorCategories"]')
        .getByRole('button', { name: label('gallery.videoReview.actionActions'), exact: true });
      await category.click();
      await expect(remove).toBeVisible();
      await button('gallery.videoReview.zoomResetPosition').click();
      await expect.poll(async () => (await persistedFocus(page))?.transform.scale).toBe(1.5);
      await page.screenshot({ path: info.outputPath('actions-category.png'), fullPage: false });
      await remove.click();
      await expect.poll(async () => await persistedFocus(page)).toBeUndefined();
      await button('gallery.videoReview.undo').click();
      await expect.poll(async () => await persistedFocus(page)).not.toBeUndefined();
      await page.setViewportSize({ width: 1100, height: 560 });
      await page.screenshot({ path: info.outputPath('actions-narrow.png'), fullPage: false });
      await button('common.actions.close').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('embedded speech Actions retain their section width', async ({ page }, info) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const dialog = page.locator('dialog');
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': 'light',
      },
      runtimeResponses: { AI_SETTINGS_QUERY: speechModelResponse },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    const chooser = page.waitForEvent('filechooser');
    await dialog
      .locator('[data-ui="gallery.videoReview.trackHeader"]')
      .filter({ hasText: label('gallery.videoReview.audioVoiceover') })
      .getByRole('button', { name: label('gallery.videoReview.audioImport'), exact: true })
      .click();
    await page
      .getByRole('button', { name: label('gallery.videoReview.musicUpload'), exact: true })
      .click();
    await (
      await chooser
    ).setFiles({ name: 'nested-voice.wav', mimeType: 'audio/wav', buffer: syntheticSpeechWav(6) });
    const panel = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
    const editor = panel.locator('[data-ui="gallery.videoReview.audioInspector"]');
    const actions = editor.locator('[data-section="actions"]');
    const remove = actions.getByRole('button', {
      name: label('gallery.videoReview.audioClipDelete'),
      exact: true,
    });
    const scroll = dialog.locator('.review-inspector-scroll');
    const width = () =>
      scroll.evaluate((node) => {
        const style = getComputedStyle(node);
        return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
    const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
    for (const target of [523, 524, 525]) {
      for (let attempt = 0; attempt < 3 && Math.abs((await width()) - target) > 0.5; attempt++) {
        const current = await width();
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 20, { steps: 4 });
        await page.mouse.up();
      }
      await expect.poll(width).toBe(target);
      await remove.scrollIntoViewIfNeeded();
      expect((await actions.boundingBox())!.width).toBeCloseTo(
        (await editor.boundingBox())!.width,
        0
      );
      expect((await remove.boundingBox())!.height).toBe(32);
      await page.screenshot({
        path: info.outputPath(`embedded-actions-${target}.png`),
        fullPage: false,
      });
    }
    await remove.click();
    await expect(editor).toHaveCount(0);
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
      .click();
    await expect(dialog.locator('[data-audio-id]')).toBeVisible();
    await dialog.getByRole('button', { name: label('common.actions.close'), exact: true }).click();
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
