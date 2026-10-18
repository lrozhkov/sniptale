import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';

const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`image sizing parameter composition ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      const base = `chrome-extension://${extensionId}/apps/extension/src`;
      await page.goto(`${base}/gallery/index.html`);
      await expect(ui(page, 'gallery.page.root')).toBeVisible();
      await page.evaluate(async (theme) => {
        localStorage.setItem('sniptale-locale-preference', 'ru');
        await chrome.storage.local.set({
          'sniptale-locale-preference': 'ru',
          'sniptale-theme-preference': theme,
        });
      }, theme);
      const bytes = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 540;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#35609c';
        context.fillRect(0, 0, 960, 540);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      await page.goto(`${base}/editor/index.html`);
      await expect(ui(page, 'editor.start')).toBeVisible();
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles({
          name: 'Sizing proof.png',
          mimeType: 'image/png',
          buffer: Buffer.from(bytes, 'base64'),
        });
      await expect(ui(page, 'editor.start')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      for (const mode of ['image-size', 'canvas-size']) {
        await ui(page, `editor.floating.layers.mode.${mode}`).click();
        const section = page.locator(`[data-section="${mode}"]`);
        const dimensions = section.locator('[data-size-panel-dimensions]');
        const rows = dimensions.locator('.sniptale-parameter-row');
        await expect(rows).toHaveCount(2);
        const names = rows.locator('.sniptale-parameter-name');
        const geometry = await names.evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { x: box.x, y: box.y };
          })
        );
        expect(Math.abs(geometry[0]!.x - geometry[1]!.x)).toBeLessThanOrEqual(1);
        expect(geometry[1]!.y - geometry[0]!.y).toBeCloseTo(44, 0);
        const baselines = await section
          .locator('.sniptale-parameter-name')
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));
        for (let index = 1; index < baselines.length; index++) {
          expect(baselines[index]! - baselines[index - 1]!).toBeCloseTo(44, 0);
        }
        const fields = rows.locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]');
        const right = await fields.evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().right)
        );
        expect(Math.abs(right[0]! - right[1]!)).toBeLessThanOrEqual(1);
        await expect(rows.first()).toContainText('px');
        await expect(rows.last()).toContainText('px');
        const lock = dimensions.getByRole('button', {
          name: label('editor.compact.keepAspectRatio'),
          exact: true,
        });
        await lock.click();
        const locked = await lock.getAttribute('aria-pressed');
        await lock.click();
        await expect(lock).toHaveAttribute('aria-pressed', locked === 'true' ? 'false' : 'true');
        const width = dimensions.getByRole('textbox', {
          name: label('editor.compact.widthDimension'),
          exact: true,
        });
        const before = await width.inputValue();
        await width.click();
        await width.fill('123');
        await width.press('Escape');
        await expect(width).toHaveValue(before);
        await page.screenshot({ path: info.outputPath(`${mode}.png`), fullPage: false });
        if (mode === 'image-size') {
          await width.click();
          await width.fill('640');
          await width.press('Enter');
          const apply = section.getByRole('button', {
            name: label('editor.compact.applyImageSize'),
            exact: true,
          });
          await expect(apply).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
          await apply.click();
          await expect(apply).toBeDisabled();
          await expect(width).toHaveValue('640');
          await page.screenshot({ path: info.outputPath('image-resized.png'), fullPage: false });
        } else {
          await section
            .getByRole('button', { name: label('editor.compact.expandCanvas'), exact: true })
            .click();
          await width.click();
          await width.fill('720');
          await width.press('Enter');
          await section
            .getByRole('button', { name: label('common.actions.cancel'), exact: true })
            .click();
          await ui(page, 'editor.floating.layers.mode.canvas-size').click();
          await expect(width).toHaveValue('640');
          await section
            .getByRole('button', { name: label('editor.compact.expandCanvas'), exact: true })
            .click();
          await width.click();
          await width.fill('720');
          await width.press('Enter');
          await section
            .getByRole('button', { name: label('editor.compact.applyExpandCanvas'), exact: true })
            .click();
          await expect(ui(page, 'editor.floating.layers.mode.layers')).toHaveAttribute(
            'aria-pressed',
            'true'
          );
          await ui(page, 'editor.floating.layers.mode.canvas-size').click();
          await expect(width).toHaveValue('720');
          await page.screenshot({ path: info.outputPath('canvas-expanded.png'), fullPage: false });
          await section
            .getByRole('button', { name: label('editor.compact.cropWithinCanvas'), exact: true })
            .click();
          await width.click();
          await width.fill('480');
          await width.press('Enter');
          const apply = section.getByRole('button', {
            name: label('editor.compact.applyCropCanvas'),
            exact: true,
          });
          await apply.click();
          await expect(ui(page, 'editor.floating.layers.mode.layers')).toHaveAttribute(
            'aria-pressed',
            'true'
          );
          await ui(page, 'editor.floating.layers.mode.canvas-size').click();
          await expect(width).toHaveValue('480');
          await page.screenshot({ path: info.outputPath('canvas-cropped.png'), fullPage: false });
        }
      }
    });
  }
}
