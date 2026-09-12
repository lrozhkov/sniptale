import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 1024]) {
    test(`scenario control geometry and pointer focus in ${theme} at ${width}`, async ({
      page,
      hostOrigin,
    }, testInfo) => {
      const issues = createPageIssueCollector(page);
      await openVisualHarness(page, hostOrigin, theme, 'ru', {
        width,
        height: width === 1024 ? 640 : 900,
      });
      const closeInspector = page
        .locator('.guide-inspector-panel .guide-panel-heading button')
        .first();
      if (width === 1024 && (await closeInspector.isVisible())) await closeInspector.click();
      const pane = page.locator('.guide-center-panel > .guide-document-scroll');
      await pane.evaluate((node) => {
        node.scrollTop = 0;
      });
      const insert = page.locator('.guide-document > .guide-insertion-item').first();
      await insert.locator('button').first().focus();
      const insertion = await insert
        .locator('button')
        .first()
        .evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const scroll = button.closest('.guide-document-scroll')!.getBoundingClientRect();
          return {
            clearance: rect.top - scroll.top,
            hit: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 2)),
          };
        });
      expect(insertion.clearance).toBeGreaterThanOrEqual(0);
      expect(insertion.hit).toBe(true);
      const step = page.locator('article#compare');
      for (const name of ['Подзаголовок', 'Примечание']) {
        const add = step
          .locator('.guide-insertion-block')
          .last()
          .getByRole('button', { name, exact: true });
        await add.focus();
        await add.click();
      }
      const blocks = page.locator('.guide-document article .guide-block');
      for (const block of await blocks.all()) {
        await block.scrollIntoViewIfNeeded();
        await block.hover();
        const controls = await block.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          const selectors = [
            '.guide-block-grip',
            '.guide-block-width',
            '.guide-block-actions button',
          ];
          if (['text', 'heading', 'note'].includes(node.getAttribute('data-kind') ?? ''))
            selectors.push('.guide-voice-control button');
          return selectors.map((selector) => {
            const button = node.querySelector<HTMLElement>(selector)!;
            const rect = button.getBoundingClientRect();
            return {
              selector,
              width: rect.width,
              height: rect.height,
              top: rect.top - bounds.top,
              inside: rect.left >= bounds.left && rect.right <= bounds.right,
            };
          });
        });
        for (const control of controls) {
          expect(control.width, control.selector).toBe(24);
          expect(control.height, control.selector).toBe(24);
          expect(control.top, control.selector).toBe(6);
          if (control.selector.includes('actions')) expect(control.inside).toBe(true);
        }
      }
      const id = await step.locator('.guide-block').first().getAttribute('data-block-id');
      const block = step.locator(`[data-block-id="${id}"]`);
      await block.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await block.hover();
      const grip = block.locator('.guide-block-grip');
      await grip.click();
      await expect(grip).toBeFocused();
      await expect(grip).toHaveCSS('opacity', '1');
      await expect(page.locator('html')).not.toHaveAttribute('data-guide-reordering');
      const rect = await grip.boundingBox();
      if (!rect) throw new Error('Missing grip');
      await page.mouse.move(rect.x + 12, rect.y + 12);
      await page.mouse.down();
      // Scroll the target into the canvas while retaining the active drag.
      const target = step.locator('.guide-block').nth(1);
      await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      const destination = await step.locator('.guide-block').nth(1).boundingBox();
      if (!destination) throw new Error('Missing drop target');
      await page.mouse.move(
        destination.x + destination.width / 2,
        destination.y + destination.height * 0.7,
        { steps: 8 }
      );
      await expect(grip).toHaveCSS('opacity', '0');
      await page.mouse.up();
      await expect(step.locator('.guide-block').nth(1)).toHaveAttribute('data-block-id', id!);
      await expect(grip).not.toBeFocused();
      await expect(grip).toHaveCSS('opacity', '0');
      await block.hover();
      await expect(grip).toHaveCSS('opacity', '1');
      await expect(page.locator('html')).not.toHaveAttribute('data-guide-reordering');
      await testInfo.attach(`controls-${theme}-${width}`, {
        body: await page.screenshot({
          path: `tasks/scenario-control-alignment/controls-${theme}-${width}.png`,
        }),
        contentType: 'image/png',
      });
      issues.assertClean();
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`third and quarter presets wrap blocks into columns in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    const step = page.locator('article#compare');
    const text = step.locator('.guide-block[data-kind="text"]').first();
    await text.locator('textarea').focus();
    const inspector = page.locator('#guide-inspector-panel');
    await inspector.getByRole('button', { name: 'Third width', exact: true }).click();
    await expect(text).toHaveAttribute('data-width', '33');
    for (let index = 0; index < 2; index++) {
      await text.locator('.guide-block-actions button').focus();
      await text.locator('.guide-block-actions button').click();
      await page.getByRole('button', { name: 'Duplicate block', exact: true }).click();
    }
    const row = step.locator('.guide-block[data-kind="text"]');
    await expect(row).toHaveCount(3);
    const tops = () =>
      row.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    expect(new Set(await tops()).size).toBe(1);
    for (const block of await row.all()) {
      await block.locator('textarea').focus();
      await inspector.getByRole('button', { name: 'Quarter width', exact: true }).click();
      await expect(block).toHaveAttribute('data-width', '25');
    }
    await text.locator('.guide-block-actions button').focus();
    await text.locator('.guide-block-actions button').click();
    await page.getByRole('button', { name: 'Duplicate block', exact: true }).click();
    await expect(row).toHaveCount(4);
    expect(new Set(await tops()).size).toBe(1);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.reload();
    await expect(row).toHaveCount(4);
    for (const block of await row.all()) await expect(block).toHaveAttribute('data-width', '25');
    expect(new Set(await tops()).size).toBe(1);
  });
}
