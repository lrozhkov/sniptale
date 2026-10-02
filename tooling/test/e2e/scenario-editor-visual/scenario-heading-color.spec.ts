import { checkInspectorUtility, checkInspectorLabels } from '../support/inspector-utilities';
import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  SETTINGS_HARNESS_PATH,
} from '../extension-critical.helpers';
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
      await checkInspectorUtility(page, panel.locator('.guide-panel-heading > button').last());
      await page.screenshot({ path: info.outputPath('inspector-utilities.png') });
      const mode = page.locator('.tour-representation-switch [aria-pressed="true"]');
      await page.mouse.move(700, 100);
      const idleBorder = await mode.evaluate((node) => getComputedStyle(node).borderTopColor);
      await check(mode).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await check(mode).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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
      const nestedStyle = panel.locator('.guide-style-fields > .guide-inspector-group');
      for (const group of await nestedStyle.all()) {
        await check(group).toHaveCSS('border-top-width', '0px');
        await check(group.locator('.guide-inspector-group-heading')).toHaveCSS('font-size', '12px');
        await check(group.locator('button[aria-expanded]').first()).toHaveCSS('min-height', '28px');
      }
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
      await check(palette).toHaveCount(0);
      const value = accent.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      await check(value).toBeVisible();
      check((await value.boundingBox())!.width).toBeGreaterThan(20);
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
      await expect(value).toContainText('RGB(');
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
      await expect(divider).toHaveAttribute('aria-valuenow', '260');
      await checkInspectorLabels(panel);
      const valueGeometry = await value.evaluate((node) => ({
        width: node.clientWidth,
        content: node.scrollWidth,
        height: node.getBoundingClientRect().height,
      }));
      check(valueGeometry.width).toBeGreaterThan(20);
      check(valueGeometry.content).toBeLessThanOrEqual(valueGeometry.width + 1);
      check(valueGeometry.height).toBeGreaterThan(1);
      await info.attach(`color-value-narrow-${locale}-${theme}`, {
        body: await panel.screenshot({ path: info.outputPath('color-panel.png') }),
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
        body: await panel.screenshot({ path: info.outputPath('color-panel.png') }),
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
        body: await panel.screenshot({ path: info.outputPath('color-panel.png') }),
        contentType: 'image/png',
      });
      await page
        .locator('#guide-library-panel')
        .getByRole('button', {
          name: ru ? 'Навигационный слайд' : 'Navigation slide',
          exact: true,
        })
        .click();
      const title = panel.getByRole('textbox', { name: ru ? 'Заголовок' : 'Title', exact: true });
      await title.fill('Navigation title');
      const clear = title.locator('..').locator('.guide-text-clear');
      await page.mouse.move(0, 0);
      const textColorValue = await title.evaluate((node) => getComputedStyle(node).color);
      await expect(clear).not.toHaveCSS('color', textColorValue);
      await expect(clear).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await clear.hover();
      await expect(clear).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await clear.click();
      await expect(title).toHaveValue('');
      await expect(title).toBeFocused();
      await expect(clear).toBeDisabled();
      await expect(clear).toHaveCSS('opacity', '0.4');
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
        [
          '.guide-document .guide-block-grip',
          '.guide-document .guide-block-width',
          '.guide-document .guide-block-height',
          '.guide-document .guide-action-menu-anchor > button',
          '.guide-document .guide-image-tools > button',
          '.guide-voice-control > [data-ui="scenario.voice-input"]',
        ].join(', ')
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
      '.guide-style-accent [data-ui="shared.ui.color-selector.picker-trigger"]'
    );
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const layer = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
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

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`color value editing in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await openVisualHarness(page, hostOrigin, theme, locale, { width: 1280, height: 720 });
      const panel = page.locator('#guide-inspector-panel');
      await panel
        .getByRole('navigation')
        .getByRole('button', {
          name: locale === 'ru' ? 'Оформление' : 'Appearance',
          exact: true,
        })
        .click();
      const field = panel.locator('.guide-style-accent');
      const swatch = field.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const value = field.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      await expect(
        field.locator('[data-ui="shared.ui.color-selector.palette-trigger"]')
      ).toHaveCount(0);
      const before = await field.boundingBox();
      await value.click();
      const input = field.getByRole('textbox');
      await expect(input).toBeFocused();
      expect(await field.boundingBox()).toEqual(before);
      await input.fill('#abcdef');
      await input.press('Enter');
      await expect(value).toHaveText('#ABCDEF');
      await expect(value).toBeFocused();
      expect(await field.boundingBox()).toEqual(before);
      await value.click();
      await input.fill('invalid');
      await input.press('Enter');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(field.getByRole('alert')).toBeVisible();
      expect(await field.boundingBox()).toEqual(before);
      await input.press('Escape');
      await expect(value).toHaveText('#ABCDEF');
      await swatch.click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await expect(picker).toBeVisible();
      const cancel = picker.getByRole('button', {
        name: locale === 'ru' ? 'Отмена' : 'Cancel',
        exact: true,
      });
      const apply = picker.getByRole('button', {
        name: locale === 'ru' ? 'Применить' : 'Apply',
        exact: true,
      });
      expect((await cancel.boundingBox())!.height).toBeLessThanOrEqual(28);
      expect((await apply.boundingBox())!.height).toBeLessThanOrEqual(28);
      expect(await field.boundingBox()).toEqual(before);
      await page.screenshot({ path: info.outputPath('color-picker.png') });
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill('#123456');
      await cancel.click();
      await expect(value).toHaveText('#ABCDEF');
      await expect(swatch).toBeFocused();
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      const bounds = await field.boundingBox();
      const valueBounds = await value.boundingBox();
      expect(valueBounds!.width).toBeGreaterThan(20);
      expect(valueBounds!.x + valueBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      await info.attach(`backlog6-${locale}-${theme}`, {
        body: await panel.screenshot({ path: info.outputPath('color-panel.png') }),
        contentType: 'image/png',
      });
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`drawing color value editing in ${theme}`, async ({ page, hostOrigin }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await applyHarnessBootstrap(page, { storage: { 'sniptale-theme-preference': theme } });
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}?theme=${theme}`);
    await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
    const options = page.locator('[data-ui="editor.drawing.options"]');
    const swatch = options.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').first();
    await expect(swatch.locator('span')).toBeVisible();
    expect((await swatch.locator('span').boundingBox())!.width).toBe(16);
    await expect(
      options.locator('[data-ui="shared.ui.color-selector.value-trigger"]').first()
    ).toBeHidden();
    await swatch.click();
    const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('textbox', { name: 'HEX', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('drawing-color-picker.png') });
    await page.keyboard.press('Escape');
    await expect(swatch).toBeFocused();
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`fixed drawing palette in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.addInitScript(
        ({ theme, locale }) => {
          localStorage.setItem('sniptale-theme-preference', theme);
          localStorage.setItem('sniptale-locale-preference', locale);
        },
        { theme, locale }
      );
      await applyHarnessBootstrap(page, {
        storage: { 'sniptale-theme-preference': theme, 'sniptale-locale-preference': locale },
      });
      await page.goto(
        `${hostOrigin}${SETTINGS_HARNESS_PATH}?section=editor-resources&view=palettes`
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(
        page.getByText(
          locale === 'ru'
            ? 'Первые пять цветов — постоянный быстрый набор для рисования.'
            : 'The first five colors are your fixed drawing shortcuts.',
          { exact: false }
        )
      ).toBeVisible();
      const values = page.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      await expect(values).toHaveCount(10);
      await values.first().click();
      const input = page.locator('[data-ui="shared.ui.color-selector.trigger"] input');
      await input.fill('#123456');
      await input.press('Enter');
      await expect(values.first()).toHaveText('#123456');
      await page.screenshot({ path: info.outputPath('fixed-palette-settings.png') });
      const saved = await page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale_drawing_palette')).sniptale_drawing_palette
      );
      expect(saved.colors[0]).toBe('#123456');
      await applyHarnessBootstrap(page, {
        storage: {
          'sniptale-theme-preference': theme,
          'sniptale-locale-preference': locale,
          sniptale_drawing_palette: saved,
        },
      });
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
      const options = page.locator('[data-ui="editor.drawing.options"]');
      const quick = options.locator(
        '[data-ui="content.toolbar.drawing-options.quick-colors"] button'
      );
      await expect(quick).toHaveCount(5);
      const colors = () => quick.evaluateAll((buttons) => buttons.map((button) => button.title));
      expect(await colors()).toEqual(saved.colors.slice(0, 5));
      await options.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill('#abcdef');
      await picker.getByRole('button', { name: /^(Apply|Применить)$/ }).click();
      expect(await colors()).toEqual(saved.colors.slice(0, 5));
      await page.screenshot({ path: info.outputPath('fixed-palette-drawing.png') });
      await page.reload();
      await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
      await expect(quick).toHaveCount(5);
      expect(await colors()).toEqual(saved.colors.slice(0, 5));
    });
  }
}
