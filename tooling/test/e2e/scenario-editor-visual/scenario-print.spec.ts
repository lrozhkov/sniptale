import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`prints the complete guide with paper settings in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const prose = page.locator('article#compare .guide-block[data-kind="text"] textarea').first();
    await prose.fill(
      Array.from(
        { length: 90 },
        (_, i) => `Строка ${i + 1}. Проверка длинного шага и переноса текста на следующую страницу.`
      ).join('\n') + '\nКОНЕЦ ДЛИННОГО ШАГА'
    );
    const figure = page.locator('article#compare figure').first();
    await figure.hover();
    await figure.getByRole('button', { name: 'Frame and image', exact: true }).click();
    await page.getByRole('textbox', { name: 'Frame height', exact: true }).fill('2200');
    await page.getByRole('textbox', { name: 'Frame height', exact: true }).press('Enter');
    await page
      .locator('.guide-image-inspector')
      .getByRole('button', { name: 'Done', exact: true })
      .click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Step by step', exact: true }).click();
    await expect(page.locator('.guide-reader article')).toHaveCount(1);
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    await expect(page.locator('.guide-print article')).toHaveCount(2);
    await expect(page.locator('.guide-print img')).toHaveCount(2);
    await page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset.printCalls = String(
          Number(document.documentElement.dataset.printCalls ?? '0') + 1
        );
      };
    });
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-calls', '1');
    await testInfo.attach(`print-screen-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    for (const settings of [
      { paper: 'A4', orientation: 'Portrait', pagination: 'Document', name: 'a4-portrait-flow' },
      {
        paper: 'A4',
        orientation: 'Landscape',
        pagination: 'Each step on a new page',
        name: 'a4-landscape-step',
      },
      {
        paper: 'Letter',
        orientation: 'Portrait',
        pagination: 'Each step on a new page',
        name: 'letter-portrait-step',
      },
    ]) {
      await page.getByRole('button', { name: settings.paper, exact: true }).click();
      await page.getByRole('button', { name: settings.orientation, exact: true }).click();
      await page.getByRole('button', { name: settings.pagination, exact: true }).click();
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      await testInfo.attach(`${settings.name}-${theme}`, {
        body: pdf,
        contentType: 'application/pdf',
      });
    }
    await page.setViewportSize({ width: 800, height: 640 });
    await expect(page.getByRole('button', { name: 'Print / PDF', exact: true })).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Back to export', exact: true })
    ).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Print / PDF', exact: true })).toBeFocused();
    await expect(page.locator('.guide-reader article')).toHaveCount(1);
  });
}
