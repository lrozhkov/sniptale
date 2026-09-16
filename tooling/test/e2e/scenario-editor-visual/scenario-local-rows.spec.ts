import { expect, type Locator, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

async function drag(page: Page, block: Locator, x: number, y: number) {
  const grip = block.locator('.guide-block-grip');
  await grip.focus();
  await expect(grip).toHaveCSS('opacity', '1');
  await expect(grip).toHaveCSS('pointer-events', 'auto');
  const box = await grip.boundingBox();
  if (!box) throw new Error('Missing grip');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
}
for (const theme of ['light', 'dark'] as const) {
  test(`local rows and spatial placement retain widths, Undo and exports in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const reopen = page.url();
    const step = page.locator('article#text-only');
    for (const text of ['First', 'Second', 'Third']) {
      const add = step
        .locator('.guide-insertion-block')
        .last()
        .getByRole('button', { name: 'Heading', exact: true });
      await add.focus();
      await add.click();
      await step.locator('.guide-block textarea').last().fill(text);
    }
    const blocks = step.locator('.guide-block');
    const ids = await blocks.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-block-id'))
    );
    const first = blocks.nth(0);
    const second = blocks.nth(1);
    const third = blocks.nth(2);
    for (const block of [first, second, third]) {
      const width = block.locator('.guide-block-width');
      await width.focus();
      await width.click();
    }
    await second.getByRole('button', { name: 'Start a new row', exact: true }).focus();
    await second.getByRole('button', { name: 'Start a new row', exact: true }).click();
    await expect(step.locator('.guide-block-row')).toHaveCount(2);
    const b = await second.boundingBox();
    const a = await first.boundingBox();
    if (!b || !a) throw new Error('Missing rows');
    expect(b.y).toBeGreaterThan(a.y + a.height);
    await step.scrollIntoViewIfNeeded();
    const target = await second.boundingBox();
    if (!target) throw new Error('Missing target');
    await drag(page, first, target.x + 2, target.y + target.height / 2);
    await expect(page.locator('.guide-block-drop-preview')).toHaveCount(2);
    await expect(page.locator('.guide-block-drop-preview').first()).toHaveText('25%');
    await testInfo.attach(`rows-preview-${theme}`, {
      body: await page.screenshot({ path: `tasks/scenario-local-rows/preview-${theme}.png` }),
      contentType: 'image/png',
    });
    await page.mouse.up();
    await expect(blocks.nth(0)).toHaveAttribute('data-width', '25');
    await expect(blocks.nth(1)).toHaveAttribute('data-width', '25');
    await expect(step.locator('.guide-block-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(step.locator('.guide-block-row')).toHaveCount(2);
    await expect(first).toHaveAttribute('data-width', '50');
    await first.locator('.guide-block-grip').focus();
    await first.locator('.guide-block-grip').press('ArrowRight');
    await expect(first).toHaveAttribute('data-width', '25');
    await expect(first.locator('.guide-block-grip')).toBeFocused();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(step.locator('.guide-block-row')).toHaveCount(2);
    await expect(first).toHaveAttribute('data-width', '50');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(reopen);
    await expect(step.locator('.guide-block-row')).toHaveCount(2);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const reader = page.locator('.guide-reader article#text-only');
    await expect(reader.locator('.guide-block-row')).toHaveCount(2);
    await expect(reader.locator(`[data-block-id="${ids[0]}"]`)).toHaveAttribute('data-width', '50');
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    await expect(page.locator('.guide-print article#text-only .guide-block-row')).toHaveCount(2);
    await page.goto(reopen);
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
      Object.defineProperty(window, 'rowsHtml', {
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
      const value: unknown = Reflect.get(window, 'rowsHtml');
      if (typeof value !== 'string') throw new Error('Missing HTML');
      return value;
    });
    const url = `${hostOrigin}/rows-export.html`;
    await page.route(url, (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await page.goto(url);
    await expect(page.locator('article#guide-item-text-only .guide-block-row')).toHaveCount(2);
    const exportedRows = await page
      .locator('article#guide-item-text-only .guide-block-row')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          top: node.getBoundingClientRect().top,
          bottom: node.getBoundingClientRect().bottom,
        }))
      );
    expect(exportedRows[1]!.top).toBeGreaterThan(exportedRows[0]!.bottom);
    issues.assertClean();
  });
}
