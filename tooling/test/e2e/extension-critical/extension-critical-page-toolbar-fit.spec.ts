import { expect, test } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`uncustomized vertical toolbar retains Reset ${viewport.name}`, async ({}, info) => {
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: viewport.size });
    try {
      const { page } = await openDesignReview(
        launched.context,
        launched.extensionId,
        host.origin,
        viewport.size
      );
      const toolbar = page.locator('[data-ui="content.toolbar.root"]');
      await expect(toolbar).toHaveAttribute('data-display-mode', 'horizontal');
      await expect(toolbar).not.toHaveAttribute('data-page-layout', 'true');
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      await page
        .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
        .click();
      await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).click();
      await page.keyboard.press('Escape');
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.design-review"]').click();
      await expect(toolbar).toHaveAttribute('data-display-mode', 'vertical');
      await expect(toolbar).not.toHaveAttribute('data-page-layout', 'true');
      await page.evaluate(() => document.fonts.ready);
      const target = page.locator('#measurement-target');
      const bounds = (await target.boundingBox())!;
      await page.mouse.click(bounds.x + 8, bounds.y + 8);
      const popover = page.locator('[data-ui="content.design-review.popover"]');
      await popover
        .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
        .click();
      await popover
        .getByRole('navigation')
        .getByRole('button', { name: /Size and spacing|Размер и отступы/u })
        .click();
      await popover.getByRole('textbox', { name: /^(Width|Ширина)$/u }).fill('50%');
      await expect.poll(() => target.evaluate((node) => node.style.width)).toBe('50%');
      await popover.getByRole('button', { name: /Close|Закрыть/u }).click();
      await expect(popover).toHaveCount(0);
      const reset = page.locator('[data-ui="content.toolbar.reset-all-button"]');
      await expect(reset).toBeEnabled();
      const centers = await toolbar.evaluate((root) =>
        [...root.children].flatMap((child) => {
          const style = getComputedStyle(child);
          const box = child.getBoundingClientRect();
          return box.width > 0 &&
            box.height > 0 &&
            style.position !== 'absolute' &&
            style.position !== 'fixed'
            ? [box.x + box.width / 2]
            : [];
        })
      );
      expect(centers.length).toBeGreaterThan(1);
      expect(centers.every((center) => Math.abs(center - centers[0]!) <= 1)).toBe(true);
      await page.screenshot({ path: info.outputPath('vertical-fit-top.png'), fullPage: false });
      if (await toolbar.evaluate((node) => node.scrollHeight > node.clientHeight)) {
        const pageScroll = await page.evaluate(() => scrollY);
        await toolbar.hover();
        await page.mouse.wheel(0, 500);
        await expect.poll(() => toolbar.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
      }
      for (const button of await toolbar.locator('button:visible').all()) {
        await button.scrollIntoViewIfNeeded();
        const box = (await button.boundingBox())!;
        const shell = (await toolbar.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.y).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.size.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.size.height + 1);
        expect(box.x).toBeGreaterThanOrEqual(shell.x - 1);
        expect(box.y).toBeGreaterThanOrEqual(shell.y - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(shell.x + shell.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(shell.y + shell.height + 1);
      }
      await page.screenshot({ path: info.outputPath('vertical-fit.png'), fullPage: false });
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      await page.locator('[data-ui="content.toolbar.settings.customize-buttons"]').click();
      await page.locator('[data-ui="content.toolbar.customize-done"]').click();
      await reset.click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: /^(Cancel|Отмена)$/u }).click();
      await expect.poll(() => target.evaluate((node) => node.style.width)).toBe('50%');
      await toolbar.locator('button:visible').first().focus();
      const count = await toolbar.locator('button:visible').count();
      for (
        let index = 0;
        index < count && !(await reset.evaluate((node) => node.matches(':focus')));
        index++
      ) {
        await page.keyboard.press('Tab');
      }
      await expect(reset).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      const label = await reset.getAttribute('aria-label');
      await dialog.getByRole('button', { name: label!, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(() => target.evaluate((node) => node.style.width)).toBe('100px');
      await expect(reset).toBeDisabled();
      await page.setViewportSize({ width: 1000, height: viewport.size.height });
      await expect
        .poll(() =>
          toolbar.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return (
              box.left >= -1 &&
              box.right <= innerWidth + 1 &&
              document.documentElement.scrollWidth <= innerWidth
            );
          })
        )
        .toBe(true);
      await page.screenshot({ path: info.outputPath('vertical-fit-narrow.png'), fullPage: false });
    } finally {
      await closeExtensionBrowser(launched);
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
