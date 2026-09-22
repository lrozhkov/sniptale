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
      await check(mode.locator('svg')).toHaveCSS(
        'color',
        await mode.evaluate((node) => getComputedStyle(node).color)
      );
      await mode.hover();
      await check(mode).toHaveCSS('border-top-color', idleBorder);
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const accent = panel.locator('.guide-style-accent');
      check((await accent.boundingBox())!.height).toBeLessThanOrEqual(40);
      const resetEdge = await accent.evaluate(
        (node) =>
          node.getBoundingClientRect().right -
          node.querySelector(':scope > button')!.getBoundingClientRect().right
      );
      check(Math.abs(resetEdge)).toBeLessThanOrEqual(1);
      const colorTrigger = accent.locator('[data-ui="shared.ui.color-selector.trigger"]');
      await check(colorTrigger).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await check(colorTrigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const picker = accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const palette = accent.locator('[data-ui="shared.ui.color-selector.palette-trigger"]');
      await check(palette.locator('svg.lucide-palette')).toHaveCount(1);
      await check(picker.locator('span:last-child')).toBeVisible();
      check((await picker.locator('span:last-child').boundingBox())!.width).toBeGreaterThan(20);
      const labelColor = await accent
        .locator('[data-ui="shared.ui.compact-inspector.color-field"] > span')
        .evaluate((node) => getComputedStyle(node).color);
      check(labelColor).not.toBe(await picker.evaluate((node) => getComputedStyle(node).color));
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
      await popup.getByRole('button', { name: 'HEX', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(picker).toBeFocused();
      await expect(picker).toContainText('RGB(');
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
      await expect(divider).toHaveAttribute('aria-valuenow', '260');
      const valueGeometry = await picker.locator('span:last-child').evaluate((node) => ({
        width: node.clientWidth,
        content: node.scrollWidth,
        height: node.getBoundingClientRect().height,
      }));
      check(valueGeometry.width).toBeGreaterThan(20);
      check(valueGeometry.content).toBeLessThanOrEqual(valueGeometry.width + 1);
      check(valueGeometry.height).toBeGreaterThan(1);
      await info.attach(`color-value-narrow-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await divider.focus();
      await page.keyboard.press('Home');
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
      await check(panel.locator('.guide-inspector-disclosure').first()).not.toHaveCSS(
        'border-radius',
        '0px'
      );
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

for (const theme of ['light', 'dark'] as const) {
  test(`guide text selectors keep neutral selection in ${theme}`, async ({ page, hostOrigin }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1600, height: 1000 });
    const hint = page
      .locator('#guide-inspector-panel .guide-inspector-hint')
      .filter({ hasText: 'Layouts change block widths' });
    check(
      await hint.evaluate(
        (node) =>
          node.getBoundingClientRect().top -
          node.previousElementSibling!.getBoundingClientRect().bottom
      )
    ).toBeGreaterThanOrEqual(8);
    const dropdown = page
      .locator('#guide-inspector-panel [data-ui="shared.ui.compact-select"] > button')
      .first();
    await dropdown.click();
    await page.mouse.move(500, 20);
    const openBorder = await dropdown.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--sniptale-color-border-accent-strong)';
      node.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await check(dropdown).toHaveCSS('border-top-color', openBorder);
    await dropdown.hover();
    await check(dropdown).toHaveCSS('border-top-color', openBorder);
    await page.keyboard.press('Escape');
    const save = page.getByRole('button', { name: 'Save as layout', exact: true });
    await expect(save).toHaveCSS('justify-content', 'flex-start');
    await save.click();
    const nameInput = page.locator('.guide-template-controls input');
    await expect(nameInput).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(save).toBeFocused();
    await page.locator('.guide-block[data-kind="text"]').first().locator('textarea').focus();
    const panel = page.locator('#guide-inspector-panel');
    const back = panel.locator('.scenario-inspector-navigation');
    await back.hover();
    const backBounds = await back.boundingBox();
    const sectionBounds = await panel
      .locator('.guide-block-inspector .guide-inspector-group')
      .first()
      .boundingBox();
    check(sectionBounds!.y - backBounds!.y - backBounds!.height).toBeGreaterThanOrEqual(8);
    const resets = panel.locator('.guide-block-inspector button:has(> svg.lucide-rotate-ccw)');
    check(
      new Set(
        await resets.evaluateAll((nodes) =>
          nodes.map((node) => getComputedStyle(node).justifyContent)
        )
      ).size
    ).toBe(1);
    const selected = panel.locator(
      '[data-ui="shared.ui.compact-inspector.segmented-row"] button[aria-pressed="true"]'
    );
    expect(await selected.count()).toBe(3);
    for (const button of await selected.all()) {
      await button.hover();
      await check(button).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await check(button).toHaveCSS('box-shadow', 'none');
      await check(button).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`palette follows inspector scrolling and closes with clipped anchor in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1600, height: 600 }, 'compare');
    const panel = page.locator('#guide-inspector-panel');
    await panel.getByRole('button', { name: 'Show all settings', exact: true }).click();
    const trigger = panel.locator(
      '.guide-style-accent [data-ui="shared.ui.color-selector.palette-trigger"]'
    );
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const layer = page.locator('[data-ui="shared.ui.color-selector.expanded-layer"]');
    await expect(layer).toBeVisible();
    const scroll = panel.locator('.guide-panel-scroll');
    const previous = await trigger.boundingBox();
    await scroll.evaluate((node) => {
      node.scrollTop -= 40;
    });
    await expect.poll(async () => (await trigger.boundingBox())!.y).not.toBe(previous!.y);
    await expect
      .poll(async () => {
        const anchor = await panel
          .locator('.guide-style-accent [data-ui="shared.ui.color-selector.trigger"]')
          .boundingBox();
        const box = await layer.boundingBox();
        return Math.abs(
          box!.y - Math.min(Math.max(anchor!.y, 8), Math.max(8, 600 - 8 - box!.height))
        );
      })
      .toBeLessThanOrEqual(1);
    await scroll.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(layer).toBeHidden();
  });
}
