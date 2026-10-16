import { writeFile } from 'node:fs/promises';
import { test, expect } from '../support/extension-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

const compositions = [
  { locale: 'ru', theme: 'light', viewport: { width: 1280, height: 560 } },
  { locale: 'en', theme: 'dark', viewport: { width: 1280, height: 560 } },
  { locale: 'en', theme: 'light', viewport: { width: 1920, height: 900 } },
  { locale: 'ru', theme: 'dark', viewport: { width: 1920, height: 900 } },
] as const;

for (const composition of compositions) {
  test(`native catalog content menus ${composition.locale} ${composition.theme} ${composition.viewport.width}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize(composition.viewport);
    const base = `chrome-extension://${extensionId}/apps/extension/src`;
    await page.goto(`${base}/settings/index.html?section=interface-browser&view=interface`);
    const language = page.locator('#settings-interface-language');
    await expect(language).toBeEnabled();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe('string');
    await language.click();
    await page
      .getByRole('option', {
        name: composition.locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe(composition.locale);
    await page.goto(`${base}/design-system/index.html`);
    await page.locator(`[data-ui="design-system.theme-preview.${composition.theme}"]`).click();
    await expect(page.locator('[data-ui="design-system.theme-surface"]')).toHaveAttribute(
      'data-theme',
      composition.theme
    );
    await page
      .getByPlaceholder(translate('designSystem.page.searchPlaceholder', composition.locale), {
        exact: true,
      })
      .fill('product.ui.toolbar-menu');
    const menus = page.locator('.sniptale-toolbar-menu');
    await expect(menus).toHaveCount(3);
    await expect(
      menus
        .first()
        .getByText(composition.locale === 'en' ? 'Native size' : 'Нативный размер', { exact: true })
    ).toBeVisible();
    await expect(
      menus
        .last()
        .getByText(composition.locale === 'en' ? 'Current viewport' : 'Текущий viewport', {
          exact: true,
        })
    ).toBeVisible();
    const observations = [];
    for (const [index, menu] of (await menus.all()).entries()) {
      await menu.scrollIntoViewIfNeeded();
      await expect(menu).toBeVisible();
      await menu.evaluate(async (element) => {
        await element.ownerDocument.fonts.ready;
        await Promise.allSettled(
          element
            .getAnimations({ subtree: true })
            .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
            .map((animation) => animation.finished)
        );
      });
      await page.screenshot({
        path: info.outputPath(`catalog-content-menu-${index}.png`),
        fullPage: false,
      });
      observations.push(
        await menu.evaluate((element) => ({
          radius: getComputedStyle(element).borderRadius,
          padding: getComputedStyle(element).padding,
          heading: Array.from(element.querySelectorAll('.sniptale-toolbar-menu-title')).map(
            (title) => {
              const css = getComputedStyle(title);
              return {
                size: css.fontSize,
                line: css.lineHeight,
                weight: css.fontWeight,
                transform: css.textTransform,
                tracking: css.letterSpacing,
              };
            }
          ),
          rows: Array.from(element.querySelectorAll('.sniptale-toolbar-menu-item')).map((row) => {
            const css = getComputedStyle(row);
            const glyph = row.querySelector('svg');
            return {
              minimum: css.minHeight,
              padding: css.padding,
              size: css.fontSize,
              line: css.lineHeight,
              glyph: glyph?.getBoundingClientRect().width,
            };
          }),
        }))
      );
    }
    const path = info.outputPath('catalog-content-menu-geometry.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await info.attach('catalog-content-menu-geometry', { path, contentType: 'application/json' });
    for (const menu of observations) {
      expect.soft(menu.radius).toBe('4px');
      expect.soft(menu.padding).toBe('5px');
      for (const heading of menu.heading)
        expect.soft(heading).toEqual({
          size: '12px',
          line: '16px',
          weight: '500',
          transform: 'none',
          tracking: 'normal',
        });
      for (const row of menu.rows) {
        expect.soft(row.minimum).toBe('32px');
        expect.soft(row.padding).toBe('6px 8px');
        expect.soft([row.size, row.line]).toEqual(['13px', '18px']);
        expect.soft(row.glyph).toBeCloseTo(16, 1);
      }
    }
  });
}
