import { expect, test, type Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS)
  for (const locale of ['ru', 'en'] as const)
    for (const theme of ['light', 'dark'] as const) {
      const variant = { locale, theme };
      test(`quick editor note composition ${viewport.name} (${variant.locale}/${variant.theme})`, async ({
        page,
      }, testInfo) => {
        const host = await startHostServer();
        const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
        const dialog = page.locator('dialog');
        const button = (key: Parameters<typeof translate>[0]) =>
          dialog.getByRole('button', { name: label(key), exact: true });
        try {
          await page.setViewportSize(viewport.size);
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
            duration: 12,
          });
          await page.reload();
          await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
          await page.locator('[data-ui="gallery.videoReview.enter"]').click();
          const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
          const sourceBox = (await source.boundingBox())!;
          await page.mouse.move(
            sourceBox.x + sourceBox.width / 6,
            sourceBox.y + sourceBox.height / 2
          );
          await page.mouse.down();
          await page.mouse.move(
            sourceBox.x + sourceBox.width / 3,
            sourceBox.y + sourceBox.height / 2,
            {
              steps: 5,
            }
          );
          await page.mouse.up();
          await button('gallery.videoReview.addComment').first().click();
          const form = dialog.locator('[data-ui="gallery.videoReview.commentComposer"]');
          const field = form.getByRole('textbox', {
            name: label('gallery.videoReview.commentText'),
            exact: true,
          });
          await expect(field).toBeFocused();
          await expect(button('gallery.videoReview.save')).toBeDisabled();
          await field.fill('A saved note');
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await expect(field).toBeFocused();
          const created = await noteFormStyle(form);
          expect(created.border).not.toBe(created.accent);
          expect(created.focusBoundary).toBe('1px');
          await checkNoteComposition(
            form,
            field,
            button('gallery.videoReview.discard'),
            button('gallery.videoReview.save')
          );
          await page.screenshot({ path: testInfo.outputPath('new-note.png'), fullPage: false });
          await button('gallery.videoReview.save').click();
          const marker = source.getByRole('button').first();
          await expect(marker).toBeVisible();
          const markerBox = (await marker.boundingBox())!;
          const noteSourceBox = (await source.boundingBox())!;
          expect(markerBox.height).toBe(16);
          expect(markerBox.y + markerBox.height).toBeLessThanOrEqual(noteSourceBox.y);
          expect(markerBox.width).toBeGreaterThan(16);
          const row = dialog.locator('.review-inspector-list > li');
          await expect(row).toHaveCount(1);
          await row.getByRole('button').first().click();
          await row.hover();
          const edit = row.getByRole('button', {
            name: label('gallery.videoReview.editComment'),
            exact: true,
          });
          const remove = row.getByRole('button', {
            name: label('gallery.videoReview.deleteSelected'),
            exact: true,
          });
          await expect(remove).toBeVisible();
          expect(await remove.textContent()).toBe('');
          const editBox = (await edit.boundingBox())!,
            deleteBox = (await remove.boundingBox())!;
          expect(deleteBox.width).toBe(32);
          expect(deleteBox.height).toBe(32);
          expect(deleteBox.y).toBe(editBox.y);
          expect(deleteBox.x).toBeGreaterThan(editBox.x);
          await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(remove).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
          const danger = await remove.evaluate((node) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--sniptale-color-danger)';
            node.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          });
          await expect(remove).not.toHaveCSS('color', danger);
          await remove.hover();
          await expect(remove).toHaveCSS('color', danger);
          await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(remove).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
          await edit.hover();
          await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(remove).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
          await edit.click();
          await expect(field).toBeFocused();
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await expect(field).toBeFocused();
          expect(await noteFormStyle(form)).toEqual(created);
          await expect(row).toHaveCSS('padding', '0px');
          await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await field.fill('Canceled change');
          await button('gallery.videoReview.discard').click();
          await expect(row).toContainText('A saved note');
          await row.hover();
          await edit.click();
          await checkNoteComposition(
            form,
            field,
            button('gallery.videoReview.discard'),
            button('gallery.videoReview.save')
          );
          await field.fill('An edited note');
          await page.keyboard.press('Tab');
          await expect(form).toBeVisible();
          await expect(form.locator('button:enabled').first()).toBeFocused();
          await page.screenshot({ path: testInfo.outputPath('edit-note.png'), fullPage: false });
          await button('gallery.videoReview.save').click();
          await expect(row).toContainText('An edited note');
          await row.getByRole('button').first().click();
          await row.hover();
          await remove.click();
          await expect(row).toHaveCount(0);
          await button('gallery.videoReview.undo').click();
          await expect(row).toContainText('An edited note');
          await button('common.actions.close').click();
          await page.locator('[data-ui="gallery.videoReview.enter"]').click();
          await expect(row).toContainText('An edited note');
          await row.getByRole('button').first().click();
          await expect(remove).toBeVisible();
          await button('common.actions.close').click();
        } finally {
          await new Promise<void>((resolve) => host.server.close(() => resolve()));
        }
      });
    }

async function noteFormStyle(form: Locator) {
  return form.evaluate((node) => {
    const style = getComputedStyle(node);
    const field = node.querySelector('textarea')!;
    const fieldStyle = getComputedStyle(field);
    const color = (token: string) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      node.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    return {
      width: node.getBoundingClientRect().width,
      padding: style.padding,
      border: style.borderColor,
      height: node.getBoundingClientRect().height,
      fieldWidth: field.getBoundingClientRect().width,
      focusBoundary: fieldStyle.borderTopWidth,
      accent: color('--sniptale-color-accent'),
      strong: color('--sniptale-color-text-secondary'),
    };
  });
}

async function checkNoteComposition(form: Locator, field: Locator, cancel: Locator, save: Locator) {
  await cancel.hover();
  const fieldBox = (await field.boundingBox())!;
  const cancelBox = (await cancel.boundingBox())!;
  const saveBox = (await save.boundingBox())!;
  const voiceBox = (await form.locator('[data-ui="gallery.videoReview.voice"]').boundingBox())!;
  // One-pixel tolerance allows subpixel layout rounding; painted controls need 4px clearance.
  expect(cancelBox.y - (fieldBox.y + fieldBox.height)).toBeGreaterThanOrEqual(4);
  expect(voiceBox.y - (fieldBox.y + fieldBox.height)).toBeGreaterThanOrEqual(4);
  expect(Math.abs(voiceBox.x - fieldBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(saveBox.x + saveBox.width - (fieldBox.x + fieldBox.width))).toBeLessThanOrEqual(
    1
  );
  expect(fieldBox.width).toBeGreaterThan(220);
  await expect(cancel).toHaveCSS('border-top-width', '0px');
  await expect(save).toHaveAttribute('data-command-primary', 'true');
  await expect(save).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(save).toHaveCSS('border-top-width', '0px');
  await field.hover();
}
