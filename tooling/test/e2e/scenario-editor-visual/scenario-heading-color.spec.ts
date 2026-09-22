import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';
const check = expect.configure({ soft: true, timeout: 1000 });

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`heading and color geometry in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      const ru = locale === 'ru';
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      const panel = page.locator('#guide-inspector-panel');
      const mode = page.locator('.tour-representation-switch [aria-pressed="true"]');
      await page.mouse.move(700, 100);
      const idleBorder = await mode.evaluate((node) => getComputedStyle(node).borderTopColor);
      await check(mode).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await check(mode.locator('span')).toHaveCSS('font-size', '13px');
      await mode.hover();
      await check(mode).toHaveCSS('border-top-color', idleBorder);
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const accent = panel.locator('.guide-style-accent');
      check((await accent.boundingBox())!.height).toBeLessThanOrEqual(40);
      const picker = accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const palette = accent.locator('[data-ui="shared.ui.color-selector.palette-trigger"]');
      await check(palette.locator('svg.lucide-palette')).toHaveCount(1);
      await picker.click();
      const popup = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await expect(popup).toBeVisible();
      const triggerBounds = await picker.boundingBox();
      const popupBounds = await popup.boundingBox();
      check(popupBounds!.x + popupBounds!.width).toBeLessThanOrEqual(triggerBounds!.x - 8);
      await info.attach(`color-open-${locale}-${theme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.keyboard.press('Escape');
      await expect(picker).toBeFocused();
      await panel
        .getByRole('button', {
          name: ru ? 'Показать все настройки' : 'Show all settings',
          exact: true,
        })
        .click();
      const appearanceHeading = panel.locator('.guide-appearance-heading');
      const spacing = await appearanceHeading.evaluate((node) => {
        const next = node.nextElementSibling!.querySelector('.guide-inspector-group-heading')!;
        return next.getBoundingClientRect().top - node.getBoundingClientRect().bottom;
      });
      check(spacing).toBeGreaterThanOrEqual(12);
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      const all = panel.getByRole('button', {
        name: ru ? 'Показать все настройки' : 'Show all settings',
        exact: true,
      });
      if (await all.count()) await all.click();
      const geometry = await panel.locator('.guide-inspector-disclosure').evaluateAll((nodes) =>
        nodes.map((node) => {
          const label = node.querySelector('span')!;
          const icon = node.querySelector('svg')!;
          const box = label.getBoundingClientRect();
          const svg = icon.getBoundingClientRect();
          const style = getComputedStyle(label);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metrics = context.measureText(label.textContent!);
          const baseline =
            box.top +
            (box.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 +
            metrics.fontBoundingBoxAscent;
          const inkCenter =
            baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
          return {
            title: label.textContent,
            iconSize: svg.height,
            lineHeight: style.lineHeight,
            boxDelta: box.top + box.height / 2 - svg.top - svg.height / 2,
            inkDelta: inkCenter - svg.top - svg.height / 2,
          };
        })
      );
      await info.attach(`heading-geometry-${locale}-${theme}`, {
        body: JSON.stringify(geometry),
        contentType: 'application/json',
      });
      check(
        geometry.every(({ iconSize, lineHeight }) => iconSize === 16 && lineHeight === '20px')
      ).toBe(true);
      check(geometry.every(({ boxDelta }) => Math.abs(boxDelta) <= 1)).toBe(true);
      await info.attach(`headings-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await panel
        .getByRole('button', { name: ru ? 'Точка действия' : 'Hotspot', exact: true })
        .click();
      const textColor = panel.locator(
        '.tour-hint-style-settings [data-ui="shared.ui.compact-inspector.color-field"]'
      );
      check((await textColor.boundingBox())!.height).toBeLessThanOrEqual(40);
      const labels = [
        ru ? 'Внутренний отступ' : 'Inner padding',
        ru ? 'Скругление' : 'Corner radius',
        ru ? 'По нажатию' : 'On click',
      ];
      const centers: number[] = [];
      for (const label of labels) {
        const box = await panel.getByText(label, { exact: true }).boundingBox();
        centers.push(box!.y + box!.height / 2);
      }
      check(Math.abs(centers[1]! - centers[0]! - (centers[2]! - centers[1]!))).toBeLessThanOrEqual(
        1
      );
      await textColor.scrollIntoViewIfNeeded();
      await info.attach(`hotspot-fields-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`editor chrome follows panel surface in ${theme}`, async ({ page, hostOrigin }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1600, height: 1000 });
    const panelColor = await page
      .locator('.guide-center-panel')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    const colors = await page
      .locator(
        '.guide-document .guide-block-grip, .guide-document .guide-block-width, .guide-document .guide-block-height, .guide-document .guide-action-menu-anchor > button, .guide-document .guide-image-tools > button, .guide-voice-control > [data-ui="scenario.voice-input"]'
      )
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
    expect(colors.length).toBeGreaterThan(3);
    expect([...new Set(colors)]).toEqual([panelColor]);
  });
}
