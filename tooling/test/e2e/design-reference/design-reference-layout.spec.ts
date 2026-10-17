import { test, expect } from '@playwright/test';
import type { Server } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { createDesignReferenceServer } from '../../../design-reference/server.mjs';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

let server: Server | undefined;
let origin: string;

test.use({ actionTimeout: 10_000 });

test.beforeAll(async () => {
  server = createDesignReferenceServer();
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Reference server has no TCP port.');
  origin = `http://127.0.0.1:${address.port}/tooling/design-reference/`;
});

test.afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve()))
    );
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`reference control composition ${viewport.name}`, async ({ page }, info) => {
    await page.setViewportSize(viewport.size);
    await page.goto(origin);
    await expect(page.locator('body')).toHaveCSS('font-weight', '400');
    await page.goto(`${origin}examples/properties/?view=both&mode=examples&lang=ru`);
    await expect(page.locator('.reference-disclosure')).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);
    for (const summary of await page.locator('.reference-disclosure > summary').all()) {
      await summary.scrollIntoViewIfNeeded();
      await expect(summary).toHaveCSS('min-height', '32px');
      await expect(summary).toHaveCSS('padding-left', '8px');
      await expect(summary).toHaveCSS('padding-right', '8px');
      for (const glyph of await summary.locator('svg').all()) {
        const box = (await glyph.boundingBox())!;
        expect(box.width).toBeLessThanOrEqual(16.5);
        expect(box.height).toBeLessThanOrEqual(16.5);
        await expect(glyph).toHaveCSS('fill', 'none');
      }
      await summary.click();
      await expect(summary.locator('..')).toHaveAttribute('open', '');
      await summary.press('Space');
      await expect(summary.locator('..')).not.toHaveAttribute('open');
    }
    await page.screenshot({ path: info.outputPath('properties-disclosure.png'), fullPage: false });
    await page.goto(`${origin}examples/compositions/?view=both&mode=examples&lang=ru`);
    await expect(page.locator('.theme')).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);
    const observations = [];
    for (const theme of await page.locator('.theme').all()) {
      const input = theme.getByRole('spinbutton', { name: 'Размытие фона', exact: true });
      await input.scrollIntoViewIfNeeded();
      const unit = input.locator('..').locator('.number-unit');
      const swatch = theme.locator('.color-swatch').first();
      const edge = await swatch.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.left + (box.width + parseFloat(getComputedStyle(node, '::before').width)) / 2;
      });
      const right = () => unit.evaluate((node) => node.getBoundingClientRect().right);
      const rest = await right();
      expect.soft(Math.abs(rest - edge)).toBeLessThanOrEqual(1.5);
      const family = await unit.evaluate((node) => getComputedStyle(node).fontFamily);
      await expect.soft(input).toHaveCSS('font-family', family, { timeout: 100 });
      await theme
        .locator('.number-label')
        .filter({ hasText: /^Размытие фона$/u })
        .click();
      await expect(input).not.toBeFocused();
      await input.hover();
      expect(Math.abs((await right()) - rest)).toBeLessThanOrEqual(0.5);
      await input.click();
      await expect
        .poll(() =>
          input.evaluate(
            (node: HTMLInputElement) =>
              node.selectionStart === 0 && node.selectionEnd === node.value.length
          )
        )
        .toBe(true);
      await expect(unit).toBeVisible();
      const fiveDigits = await input.evaluate((node) => {
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = getComputedStyle(node).font;
        return context.measureText('00000').width;
      });
      const width = (await input.boundingBox())!.width;
      expect(width).toBeGreaterThanOrEqual(fiveDigits - 0.5);
      observations.push({
        theme: await theme.getAttribute('data-theme'),
        edge,
        rest,
        editing: await right(),
        width,
        fiveDigits,
      });
      expect(Math.abs((await right()) - rest)).toBeLessThanOrEqual(0.5);
      await input.press('Escape');
    }
    await writeFile(
      info.outputPath('mixed-value-edges.json'),
      JSON.stringify(observations, null, 2)
    );
    await page.screenshot({ path: info.outputPath('mixed-value-edges.png'), fullPage: false });
    await page.goto(`${origin}examples/numbers/?view=both&mode=examples&lang=ru`);
    const stepper = page.locator('[data-stepper="true"]').first();
    const radius = stepper.getByRole('spinbutton', { name: 'Радиус', exact: true });
    await expect(radius).toHaveCSS('line-height', '18px');
    await radius.hover();
    await stepper.getByRole('button', { name: 'Радиус — увеличить', exact: true }).click();
    await expect(radius).toHaveValue('25');
    await radius.press('ArrowDown');
    await expect(radius).toHaveValue('20');
  });
}
