import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

async function geometry(block: Locator) {
  return block.evaluate((node) => {
    const parent = node.parentElement;
    if (!parent) throw new Error('Missing blocks');
    return {
      width: node.getBoundingClientRect().width,
      parent: parent.getBoundingClientRect().width,
      gap: parseFloat(getComputedStyle(parent).columnGap),
    };
  });
}
for (const theme of ['light', 'dark'] as const) {
  test(`continuous block width previews, saves and exports in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const reopenUrl = page.url();
    const block = page.locator('article#compare .guide-block[data-kind="image"]').first();
    const id = await block.getAttribute('data-block-id');
    const button = block.locator('.guide-block-width');
    await block.scrollIntoViewIfNeeded();
    await block.hover();
    await expect(button).toHaveCSS('opacity', '1');
    const rect = await button.boundingBox();
    if (!rect) throw new Error('Missing width handle');
    const before = await geometry(block);
    const delta = (before.parent + before.gap) * 0.37;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 - delta, rect.y + rect.height / 2, { steps: 8 });
    await expect(block).toHaveAttribute('data-width', '63');
    await expect(block.locator('output')).toHaveText('63%');
    const live = await geometry(block);
    expect(Math.abs(live.width - ((live.parent + live.gap) * 0.63 - live.gap))).toBeLessThan(1);
    await testInfo.attach(`width-preview-${theme}`, {
      body: await page.screenshot({ path: `tasks/scenario-block-width/preview-${theme}.png` }),
      contentType: 'image/png',
    });
    await page.mouse.up();
    await expect(block.locator('output')).toHaveCount(0);
    await expect(block).toHaveAttribute('data-width', '63');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(block).toHaveAttribute('data-width', '100');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(block).toHaveAttribute('data-width', '63');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const readerBlock = page.locator(`.guide-reader [data-block-id="${id}"]`);
    await expect(readerBlock).toHaveAttribute('data-width', '63');
    const read = await geometry(readerBlock);
    expect(Math.abs(read.width - ((read.parent + read.gap) * 0.63 - read.gap))).toBeLessThan(1);
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    const printBlock = page.locator(`.guide-print [data-block-id="${id}"]`);
    await expect(printBlock).toHaveAttribute('data-width', '63');
    const print = await geometry(printBlock);
    expect(Math.abs(print.width - ((print.parent + print.gap) * 0.63 - print.gap))).toBeLessThan(1);
    await testInfo.attach(`width-${theme}.pdf`, {
      body: await page.pdf({ preferCSSPageSize: true }),
      contentType: 'application/pdf',
    });
    await page.goto(reopenUrl);
    await expect(page.locator(`.guide-document [data-block-id="${id}"]`)).toHaveAttribute(
      'data-width',
      '63'
    );
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write: (chunk) => {
                chunks.push(chunk);
              },
            }),
        }),
      });
      Object.defineProperty(window, 'widthExportHtml', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-html-settings > [role=status]')).toHaveText('HTML saved');
    const html = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'widthExportHtml');
      if (typeof value !== 'string') throw new Error('Missing HTML');
      return value;
    });
    const url = `${hostOrigin}/width-export.html`;
    await page.route(url, (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await page.goto(url);
    const exported = page.locator(`[data-block-id="${id}"]`);
    await expect(exported).toHaveAttribute('data-width', '63');
    const saved = await geometry(exported);
    expect(Math.abs(saved.width - ((saved.parent + saved.gap) * 0.63 - saved.gap))).toBeLessThan(1);
    issues.assertClean();
  });
}
