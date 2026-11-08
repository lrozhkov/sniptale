import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

async function geometry(page: Page) {
  return page.evaluate(() => {
    const objects = window.__sniptaleEditorHarness!.getCanvasObjects();
    const source = objects.find((object) => object['sniptaleType'] === 'source-image')!;
    const annotation = objects.find((object) => object['sniptaleType'] === 'text')!;
    const marker = objects.find((object) => object['sniptaleType'] === 'frame-annotation')!;
    return {
      marker: [
        Number(marker['left']),
        Number(marker['top']),
        Number(marker['scaledWidth']),
        Number(marker['scaledHeight']),
      ],
      source: [
        Number(source['left']),
        Number(source['top']),
        Number(source['scaledWidth']),
        Number(source['scaledHeight']),
      ],
      annotation: [
        Number(annotation['left']),
        Number(annotation['top']),
        Number(annotation['scaledWidth']),
        Number(annotation['scaledHeight']),
      ],
    };
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const locale of ['en', 'ru'] as const) {
    test(`window header composition is reversible with annotations and Undo ${name} ${locale}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await page.setViewportSize(size);
      await applyHarnessBootstrap(page, {
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': locale === 'en' ? 'light' : 'dark',
        },
      });
      await page.addInitScript(
        (value) => localStorage.setItem('sniptale-locale-preference', value),
        locale
      );
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
        )
        .toBeGreaterThan(0);
      const viewport = (await page.locator('[data-ui="editor.canvas.viewport"]').boundingBox())!;
      await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
      await page.keyboard.press('Escape');
      await page.mouse.click(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
      await page.keyboard.insertText('Composition proof');
      await page.keyboard.press('Escape');
      await page.locator('[data-ui="content.toolbar.future-frame-step-badge"]').click();
      await page.mouse.click(
        viewport.x + viewport.width / 2 - 100,
        viewport.y + viewport.height / 2
      );
      await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
      await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
      const initial = await geometry(page);
      const normalized = (value: Awaited<ReturnType<typeof geometry>>) => [
        (value.annotation[0]! - value.source[0]!) / value.source[2]!,
        (value.annotation[1]! - value.source[1]!) / value.source[3]!,
        value.annotation[2]! / value.source[2]!,
        value.annotation[3]! / value.source[3]!,
      ];
      const checkPlacement = async () => {
        const actual = normalized(await geometry(page));
        normalized(initial).forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 5));
      };
      await page.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
      const settings = page.locator('[data-ui="window-header-settings"]');
      await settings
        .getByRole('button', { name: translate('windowHeader.application', locale), exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window
              .__sniptaleEditorHarness!.getCanvasObjects()
              .some((object) => object['sniptaleType'] === 'browser-frame')
          )
        )
        .toBe(true);
      const disclosure = page
        .locator('summary')
        .filter({ hasText: translate('editor.scene.placementSection', locale) });
      await disclosure.click();
      const choose = async (fit: boolean) => {
        await page
          .getByRole('button', {
            name: translate('windowHeader.placement', locale),
            exact: true,
          })
          .click();
        await page
          .getByRole('option', {
            name: translate(fit ? 'windowHeader.fitCanvas' : 'windowHeader.expandCanvas', locale),
            exact: true,
          })
          .click();
        if (!fit)
          await expect
            .poll(async () => Math.abs((await geometry(page)).source[2]! - initial.source[2]!))
            .toBeLessThan(0.001);
      };
      const expanded = await geometry(page);
      const expectGeometry = async (expected: typeof expanded) => {
        await expect
          .poll(async () => {
            const actual = await geometry(page);
            return Math.max(
              ...(['source', 'marker', 'annotation'] as const).flatMap((key) =>
                actual[key].map(
                  (value, index) =>
                    Math.abs(value - expected[key][index]!) / (key === 'annotation' ? 0.5 : 0.001)
                )
              )
            );
          })
          .toBeLessThanOrEqual(1);
      };
      for (let repeat = 0; repeat < 3; repeat += 1) {
        await choose(true);
        await expect
          .poll(async () => (await geometry(page)).source[2]!)
          .toBeLessThan(initial.source[2]!);
        await checkPlacement();
        const fitted = await geometry(page);
        await choose(false);
        await expectGeometry(expanded);
        await checkPlacement();
        if (repeat === 2) {
          const historyIndex = await page.evaluate(
            () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
          );
          await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
          await expect
            .poll(() =>
              page.evaluate(
                () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
              )
            )
            .toBe(historyIndex - 1);
          await expectGeometry(fitted);
          await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
          await expect
            .poll(() =>
              page.evaluate(
                () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
              )
            )
            .toBe(historyIndex);
          await expectGeometry(expanded);
        }
      }
      expect(expanded.source.slice(2)).toEqual(initial.source.slice(2));
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyMuted)
        )
        .toBe(0);
      await page.screenshot({ path: info.outputPath('header-composition.png'), fullPage: false });
    });
  }
}
