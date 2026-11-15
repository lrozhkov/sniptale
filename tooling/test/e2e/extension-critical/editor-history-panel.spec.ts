import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../support/catalog-fixture';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

test.use({ actionTimeout: 10_000 });

async function draw(page: Page) {
  const before = await page.evaluate(
    () => window.__sniptaleEditorHarness!.getCanvasObjects().length
  );
  const box = await page.locator('[data-ui="editor.canvas.document-boundary"]').boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  const left = Math.max(box!.x, 30);
  const right = Math.min(box!.x + box!.width, viewport.width - 400);
  const top = Math.max(box!.y, 110);
  const bottom = Math.min(box!.y + box!.height, viewport.height - 110);
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 16, y + 12, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length))
    .toBe(before + 1);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const variant of [
    { locale: 'ru', theme: 'light' },
    { locale: 'en', theme: 'dark' },
  ] as const) {
    test(`image history states, grouping and restore ${viewport.name} ${variant.locale}`, async ({
      page,
    }, info) => {
      const host = await startHostServer();
      try {
        await page.setViewportSize(viewport.size);
        await applyHarnessBootstrap(page, {
          storage: {
            'sniptale-locale-preference': variant.locale,
            'sniptale-theme-preference': variant.theme,
          },
        });
        await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}?theme=${variant.theme}`);
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
          )
          .toBeGreaterThan(0);
        const ui = (id: string) => page.locator(`[data-ui="${id}"]`);
        const originalCount = await page.evaluate(
          () => window.__sniptaleEditorHarness!.getCanvasObjects().length
        );
        const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
        const historyIndex = () =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
        await ui('editor.floating.tool-rail.pencil').click();
        await draw(page);
        await ui('editor.floating.tool-rail.select').click();
        const pencil = await page.evaluate(() =>
          window
            .__sniptaleEditorHarness!.getCanvasObjects()
            .find((object) => object['sniptaleType'] === 'pencil')
        );
        expect(typeof pencil?.['sniptaleId']).toBe('string');
        const initialLeft = pencil?.['left'];
        if (typeof initialLeft !== 'number') throw new Error('Pencil position is unavailable');
        const pencilLeft = () =>
          page.evaluate(
            (id) =>
              window
                .__sniptaleEditorHarness!.getCanvasObjects()
                .find((object) => object['sniptaleId'] === id)?.['left'],
            pencil!['sniptaleId']
          );
        const marker = page.locator(`[data-editor-layer-id="${pencil!['sniptaleId']}"]`);
        const selectionButton = (await marker.evaluate((node) => node.tagName === 'BUTTON'))
          ? marker
          : marker.getByRole('button', {
              name: label('editor.toolbar.toggleLayerSelection'),
              exact: true,
            });
        await selectionButton.click();
        // Arrow keys belong to the canvas after leaving the layer row's own keyboard scope.
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        const before = await historyIndex();
        for (let index = 1; index <= 2; index++) {
          await page.keyboard.press('ArrowRight');
          await expect.poll(historyIndex).toBe(before + index);
        }
        await ui('editor.floating.layers.mode.history').click();
        await expect(ui('editor.inspector.history')).toBeVisible();
        const rows = ui('editor.inspector.history.entry');
        await expect(rows).toHaveCount(4);
        await expect(
          page.locator('[data-ui="editor.inspector.history.entry"][aria-current]')
        ).toHaveCount(1);
        const group = page.locator('.editor-history-group[data-grouped]');
        await expect(group).toHaveCount(1);
        await expect(group.locator('button')).toHaveCount(2);
        await expect(group.locator('button').first()).toContainText(
          label('editor.history.operations.move')
        );
        await expect(group).not.toHaveAttribute('tabindex');
        await expect(group).not.toHaveAttribute('aria-current');
        await rows.nth(1).click();
        await expect.poll(historyIndex).toBe(1);
        // History projection has the existing 0.5 CSS px coordinate tolerance.
        await expect.poll(pencilLeft).toBeCloseTo(initialLeft, 0);
        await expect(rows.nth(1)).toHaveAttribute('aria-current', 'step');
        await expect(
          page.locator('[data-ui="editor.inspector.history.entry"][data-future]')
        ).toHaveCount(2);
        const future = rows.nth(2);
        await expect(future).toHaveCSS('font-style', 'italic');
        expect(await future.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(
          await rows.nth(1).evaluate((node) => getComputedStyle(node).backgroundColor)
        );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath('history-current-and-undone.png'),
          fullPage: false,
        });
        await rows.nth(3).focus();
        await page.keyboard.press('Enter');
        await expect.poll(historyIndex).toBe(3);
        await expect.poll(pencilLeft).toBeCloseTo(initialLeft + 2, 0);
        await expect(
          page.locator('[data-ui="editor.inspector.history.entry"][data-future]')
        ).toHaveCount(0);
        await ui('editor.inspector.history.restore').click();
        const confirmation = ui('editor.floating.tool-rail.history.reset-confirm');
        await expect(confirmation).toBeVisible();
        await confirmation
          .getByRole('button', { name: label('common.actions.cancel'), exact: true })
          .click();
        await expect(confirmation).toHaveCount(0);
        await expect(rows).toHaveCount(4);
        await rows.nth(0).click();
        await expect.poll(historyIndex).toBe(0);
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length)
          )
          .toBe(originalCount);
        await ui('editor.floating.tool-rail.pencil').click();
        await expect(ui('editor.inspector.history')).toBeVisible();
        await draw(page);
        await expect(rows).toHaveCount(2);
        await expect.poll(historyIndex).toBe(1);
        await expect(
          page.locator('[data-ui="editor.inspector.history.entry"][data-future]')
        ).toHaveCount(0);
        await ui('editor.inspector.history.restore').click();
        await confirmation
          .getByRole('button', { name: label('editor.toolbar.restoreOriginal'), exact: true })
          .click();
        await expect(confirmation).toHaveCount(0);
        await expect(rows).toHaveCount(1);
        await expect.poll(historyIndex).toBe(0);
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length)
          )
          .toBe(originalCount);
        if (viewport.name === '1280x560' && variant.locale === 'ru') {
          for (const width of [719, 720, 721, 1100]) {
            await page.setViewportSize({ width, height: 560 });
            // The editor has an established 1280px minimum; its page owns horizontal scrolling.
            await page.locator('.sniptale-image-page').evaluate((node) => {
              node.scrollLeft = node.scrollWidth;
            });
            await expect(ui('editor.floating.layers.mode.history')).toBeInViewport();
            await expect(ui('editor.inspector.history.restore')).toBeInViewport();
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
            ).toBe(true);
            await page.screenshot({
              path: info.outputPath(`history-width-${width}.png`),
              fullPage: false,
            });
          }
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
