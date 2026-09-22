import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`scenario inspector shares color and section patterns in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 720 });
    const panel = page.locator('#guide-inspector-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('h2')).toHaveText('Compare two images');
    await expect(panel.locator('.guide-inspector-scope')).toHaveCount(0);
    await panel
      .getByRole('navigation', { name: 'Настройки шага' })
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    const accent = panel.locator('.guide-style-accent');
    await expect(accent.locator('input[type="color"]')).toHaveCount(0);
    await expect(accent.getByText('Акцентный цвет', { exact: true })).toBeVisible();
    await accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toHaveCount(0);
    await testInfo.attach(`inspector-narrow-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect(
      await panel.evaluate((node) =>
        [
          ...node.querySelectorAll(
            'button, [role="group"], .guide-style-fields, .guide-inspector-choice, .guide-style-accent'
          ),
        ]
          .filter((el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            text: el.textContent?.slice(0, 40),
            width: el.getBoundingClientRect().width,
          }))
      )
    ).toEqual([]);
    expect(
      await panel
        .locator('.guide-inspector-choice [role="group"] button > span')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth)
            .map((node) => node.textContent)
        )
    ).toEqual([]);
    await page.setViewportSize({ width: 1024, height: 640 });
    await testInfo.attach(`inspector-minimum-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await panel.getByRole('button', { name: 'Показать все настройки', exact: true }).click();
    await expect(panel.getByRole('navigation', { name: 'Настройки шага' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Показать разделы настроек', exact: true }).click();
    await expect(
      panel.getByRole('navigation').getByRole('button', { name: 'Оформление', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    await expect(panel.locator('h2')).toHaveText('Весь сценарий');
    await expect(
      panel.getByRole('button', { name: 'Показать все настройки', exact: true })
    ).toHaveCount(0);
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`inspector fields wrap and groups support keyboard disclosure in ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 900 },
        'compare',
        { tourFixture: '1' }
      );
      const panel = page.locator('#guide-inspector-panel');
      const appearance = locale === 'ru' ? 'Оформление' : 'Appearance';
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: appearance, exact: true })
        .click();
      const guideInset = await panel.evaluate(
        (node) =>
          node.querySelector('nav button')!.getBoundingClientRect().top -
          node.querySelector('.guide-panel-heading')!.getBoundingClientRect().bottom
      );
      expect.soft(guideInset).toBe(12);
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      for (const width of [420, 260]) {
        if (width === 260) for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
        await expect(divider).toHaveAttribute('aria-valuenow', String(width));
        expect(
          await panel.evaluate((node) =>
            [
              ...node.querySelectorAll<HTMLElement>(
                'h2, h3, button, .guide-inspector-choice, .guide-style-accent'
              ),
            ]
              .filter((el) => el.getBoundingClientRect().width > 0)
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1 ||
                  el.scrollWidth > el.clientWidth + 1
              )
              .map((el) => el.textContent)
          )
        ).toEqual([]);
        await info.attach(`guide-${locale}-${theme}-${width}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      const disclosure = panel.locator('.guide-inspector-disclosure').first();
      await disclosure.focus();
      await page.keyboard.press('Enter');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(panel.locator('.guide-inspector-group-body').first()).toBeHidden();
      await page.keyboard.press('Space');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.locator('.guide-inspector-group-body').first()).toBeVisible();
      await page
        .getByRole('button', {
          name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
          exact: true,
        })
        .click();
      const tourPanel = page.locator('#guide-inspector-panel');
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', { name: locale === 'ru' ? 'Камера' : 'Camera', exact: true })
        .click();
      await tourPanel.locator('[data-ui="shared.ui.compact-select"] > button').click();
      await page
        .getByRole('option', { name: locale === 'ru' ? 'Вручную' : 'Manual', exact: true })
        .click();
      await expect(
        tourPanel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
      ).toHaveCount(3);
      expect(
        await tourPanel.evaluate((node) =>
          [
            ...node.querySelectorAll<HTMLElement>(
              '[data-ui="shared.ui.compact-inspector.numeric-row"], [data-ui="shared.ui.compact-select"]'
            ),
          ]
            .filter(
              (el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
            )
            .map((el) => el.textContent)
        )
      ).toEqual([]);
      await info.attach(`tour-${locale}-${theme}-260`, {
        body: await tourPanel.screenshot(),
        contentType: 'image/png',
      });
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', {
          name: locale === 'ru' ? 'Объекты слайда' : 'Slide objects',
          exact: true,
        })
        .click();
      await tourPanel
        .getByRole('button', { name: locale === 'ru' ? 'Точка действия' : 'Hotspot', exact: true })
        .click();
      await expect(
        tourPanel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').first()
      ).toBeVisible();
      expect(
        await tourPanel.evaluate((node) =>
          [
            ...node.querySelectorAll<HTMLElement>(
              'button, input, textarea, [data-ui="shared.ui.compact-inspector.numeric-row"]'
            ),
          ]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .filter(
              (el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
            )
            .map((el) => ({ text: el.textContent, label: el.getAttribute('aria-label') }))
        )
      ).toEqual([]);
      const surface = tourPanel.locator('[data-ui="shared.ui.surface-style-selector"]');
      expect(
        await surface
          .locator('.truncate')
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.scrollWidth > node.clientWidth + 1)
              .map((node) => node.textContent)
          )
      ).toEqual([]);
      await surface.locator('[data-ui="shared.ui.surface-style-selector.trigger"]').click();
      await expect(surface.getByRole('dialog')).toBeVisible();
      await surface.locator('[data-ui="surface-style.cancel"]').click();
      await expect(surface.getByRole('dialog')).toHaveCount(0);
      await expect(
        surface.locator('[data-ui="shared.ui.surface-style-selector.trigger"]')
      ).toBeFocused();
      await info.attach(`object-${locale}-${theme}-260`, {
        body: await tourPanel.screenshot(),
        contentType: 'image/png',
      });
      await tourPanel
        .getByRole('button', {
          name: locale === 'ru' ? 'К настройкам слайда' : 'Back to slide settings',
          exact: true,
        })
        .click();
      await expect(tourPanel.locator('[data-inspector-object]')).toBeFocused();
      await expect(tourPanel.locator('.tour-object-item-actions')).toBeVisible();
      await expect(tourPanel.locator('.tour-object-add button svg')).toHaveCount(1);
      await expect(tourPanel.locator('.tour-object-item-actions button').first()).toBeDisabled();
    });
  }
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`navigation inspector feedback in ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
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
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      await page
        .locator('#guide-library-panel')
        .getByRole('button', { name: ru ? 'Навигационный слайд' : 'Navigation slide', exact: true })
        .click();
      const panel = page.locator('#guide-inspector-panel');
      const title = panel.getByRole('textbox', { name: ru ? 'Заголовок' : 'Title', exact: true });
      await expect(title).toBeVisible();
      const radius = await page
        .locator('.guide-project-name input')
        .evaluate((node) => getComputedStyle(node).borderRadius);
      expect.soft(await title.evaluate((node) => getComputedStyle(node).borderRadius)).toBe(radius);
      await expect(title).toHaveCSS('height', '36px');
      await expect(title).toHaveCSS('font-size', '12px');
      const leftTab = page.locator('.guide-left-navigation [aria-pressed="true"]');
      await expect.soft(leftTab).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect
        .soft(leftTab)
        .toHaveCSS('color', await panel.evaluate((node) => getComputedStyle(node).color));
      await title.fill('Navigation title');
      const controls = title.locator('..').locator('.guide-voice-control');
      const clear = controls.locator('button').last();
      await expect.soft(clear).toHaveAttribute('title', ru ? 'Очистить текст' : 'Clear text');
      await clear.hover();
      await expect.soft(clear).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');

      const railGeometry = await panel.evaluate((node) => {
        const nav = node.querySelector('nav')!;
        const button = nav.querySelector('button')!;
        const heading = node.querySelector(
          '[data-ui="shared.categorized-inspector.section-heading"]'
        )!;
        const label = heading.querySelector('span')!;
        return {
          left: button.getBoundingClientRect().left - node.getBoundingClientRect().left,
          right: nav.getBoundingClientRect().right - button.getBoundingClientRect().right,
          above:
            label.getBoundingClientRect().top -
            node.querySelector('.guide-panel-heading')!.getBoundingClientRect().bottom,
          below: heading.getBoundingClientRect().bottom - label.getBoundingClientRect().bottom,
        };
      });
      expect.soft(Math.abs(railGeometry.left - railGeometry.right)).toBeLessThanOrEqual(2);
      expect.soft(Math.abs(railGeometry.above - railGeometry.below)).toBeLessThanOrEqual(2);
      const composition = panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Композиция' : 'Composition', exact: true });
      await composition.hover();
      await expect.soft(composition).toHaveAttribute('aria-pressed', 'false', { timeout: 1000 });
      await composition.click();
      const labels = await panel
        .locator(
          '.tour-layout-setting > span, [data-ui="shared.ui.compact-inspector.numeric-row"] > span'
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const css = getComputedStyle(node);
            return [css.fontFamily, css.fontSize, css.fontWeight, css.lineHeight].join('|');
          })
        );
      expect.soft(new Set(labels).size).toBe(1);
      const rightEdges = await panel
        .locator(
          '.tour-layout-setting > [role="group"], [data-ui="shared.ui.compact-inspector.numeric-value-field"]'
        )
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
      expect(Math.max(...rightEdges) - Math.min(...rightEdges)).toBeLessThanOrEqual(1);

      const align = panel.getByRole('button', { name: ru ? 'Справа' : 'Right', exact: true });
      await align.click();
      await expect(align).toHaveAttribute('aria-pressed', 'true');
      const selectedColors = await align.evaluate((node) =>
        ['text-primary'].map((token) => {
          const probe = document.createElement('span');
          probe.style.color = `var(--sniptale-color-${token})`;
          node.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })
      );
      await expect
        .poll(async () =>
          selectedColors.includes(await align.evaluate((node) => getComputedStyle(node).color))
        )
        .toBe(true);
      await expect(align).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.mouse.move(800, 500);
      await expect
        .poll(async () =>
          selectedColors.includes(await align.evaluate((node) => getComputedStyle(node).color))
        )
        .toBe(true);
      const number = panel
        .locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
        .first();
      await number.locator('input').fill('77');
      await expect(number.locator('input')).toBeFocused();
      await expect(number).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect.soft(number).toHaveAttribute('data-focus-appearance', 'accent-box');
      expect
        .soft(await number.evaluate((node) => getComputedStyle(node).borderTopColor))
        .not.toBe('rgba(0, 0, 0, 0)');
      const contents = panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Пункты оглавления' : 'Contents links', exact: true });
      await contents.hover();
      await expect.soft(contents).toHaveAttribute('aria-pressed', 'false', { timeout: 1000 });
      await contents.click();
      await panel
        .getByRole('button', { name: ru ? 'Добавить кнопку' : 'Add button', exact: true })
        .click();
      await expect.soft(panel.locator('.guide-inspector-disclosure')).toHaveCount(0);
      const remove = panel.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true });
      expect
        .soft(await remove.evaluate((node) => getComputedStyle(node).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');
      await panel
        .getByRole('button', {
          name: ru ? 'К настройкам слайда' : 'Back to slide settings',
          exact: true,
        })
        .click();
      const row = panel.locator('.tour-contents-row');
      const rowCenters = await row.locator('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return box.top + box.height / 2;
        })
      );
      expect.soft(Math.max(...rowCenters) - Math.min(...rowCenters)).toBeLessThanOrEqual(1);
      const resize = page.locator('.guide-panel-divider-right');
      await resize.focus();
      for (let index = 0; index < 10; index++) await page.keyboard.press('ArrowRight');
      await expect(resize).toHaveAttribute('aria-valuenow', '260');
      const narrowRow = await row.locator('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return { center: box.top + box.height / 2, right: box.right };
        })
      );
      expect(
        Math.max(...narrowRow.map((box) => box.center)) -
          Math.min(...narrowRow.map((box) => box.center))
      ).toBeLessThanOrEqual(1);
      expect(Math.max(...narrowRow.map((box) => box.right))).toBeLessThanOrEqual(
        (await panel.boundingBox())!.x + 260
      );
      await info.attach(`contents-row-${locale}-${theme}-260`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await resize.focus();
      await page.keyboard.press('Home');

      await expect
        .soft(row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }))
        .toHaveCount(1);
      if (await row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }).count()) {
        await row.hover();
        await row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }).click();
        await expect(row).toHaveCount(0);
        await page
          .locator('.guide-page-header')
          .getByRole('button', { name: ru ? 'Отменить' : 'Undo', exact: true })
          .click();
        await expect(row).toHaveCount(1);
      }
      await composition.hover();
      await composition.click();
      await expect.soft(number.locator('input')).toHaveValue('77');
      const playback = panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Воспроизведение' : 'Playback', exact: true });
      await playback.click();
      const select = panel.locator('[data-ui="shared.ui.compact-select"] > button').first();
      await select.click();
      const selected = page.getByRole('option', { selected: true });
      await selected.hover();
      const selectedBackground = await selected.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished));
        return getComputedStyle(node).backgroundColor;
      });
      await page.mouse.move(800, 500);
      await expect.soft(selected).toHaveCSS('background-color', selectedBackground);
      await page.keyboard.press('Escape');
      await panel
        .locator('[aria-label="' + (ru ? 'Показать все настройки' : 'Show all settings') + '"]')
        .click();
      await expect
        .soft(panel.locator('.guide-panel-heading button').first())
        .not.toHaveAttribute('aria-pressed');
      await expect
        .soft(panel.locator('.guide-inspector-group-heading h3').first())
        .toHaveCSS('font-weight', '600');
      const separators = await panel.locator('.guide-inspector-section').evaluateAll((sections) =>
        sections.slice(1).map((section) => {
          const group = section.querySelector('.guide-inspector-group')!;
          return (
            parseFloat(getComputedStyle(section).borderTopWidth) +
            parseFloat(getComputedStyle(group).borderTopWidth)
          );
        })
      );
      expect(separators.length).toBeGreaterThan(0);
      expect(separators.every((width) => width === 1)).toBe(true);
      await info.attach(`navigation-feedback-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`inspector field vocabulary in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
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
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const segment = panel
        .locator('.guide-inspector-choice [role="group"] button[aria-pressed="true"]')
        .first();
      await expect.soft(segment).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(
        panel.locator('.guide-inspector-choice [role="group"] > span[aria-hidden]').first()
      ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(segment).toHaveCSS('box-shadow', 'none');
      const valueFonts = await panel
        .locator(
          '.guide-inspector-choice [role="group"] button[aria-pressed="true"], .guide-inspector-choice [data-ui="shared.ui.compact-select"] > button'
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return [
              style.fontFamily,
              style.fontSize,
              style.fontWeight,
              style.lineHeight,
              style.color,
            ].join('|');
          })
        );
      expect(new Set(valueFonts).size).toBe(1);

      await segment.hover();
      await expect(segment).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      const accent = panel.locator('.guide-style-accent');
      const colorSpacing = await accent.evaluate(
        (node) =>
          node.querySelector(':scope > button')!.getBoundingClientRect().left -
          node
            .querySelector('[data-ui="shared.ui.color-selector.trigger"]')!
            .getBoundingClientRect().right
      );
      expect.soft(colorSpacing).toBe(8);
      await accent.locator('[data-ui="shared.ui.color-selector.palette-trigger"]').click();
      const palette = page.locator('[data-ui="shared.ui.color-selector.expanded"]');
      expect.soft(await palette.locator('button').count()).toBeGreaterThanOrEqual(8);
      await page.keyboard.press('Escape');
      await info.attach(`guide-colors-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      await page
        .locator('.guide-page-header')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const parameterLabels =
        '.guide-number-toggle, .tour-text-field > span:not(.guide-voice-field), [data-ui="shared.ui.compact-inspector.numeric-row"] > span, [data-ui="shared.ui.compact-inspector.color-field"] > span, [data-ui="shared.ui.surface-style-selector"] > div:first-child > span';
      for (const section of [
        ru ? 'Воспроизведение' : 'Playback',
        ru ? 'Пояснения' : 'Explanations',
      ]) {
        await panel
          .getByRole('navigation')
          .getByRole('button', { name: section, exact: true })
          .click();
        const fonts = await panel.locator(parameterLabels).evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return [
              style.fontFamily,
              style.fontSize,
              style.fontWeight,
              style.lineHeight,
              style.color,
            ].join('|');
          })
        );
        expect(fonts.length).toBeGreaterThan(2);
        expect.soft(new Set(fonts).size).toBe(1);
        for (const toggle of await panel.getByRole('switch').all()) {
          await expect.soft(toggle).toHaveCSS('width', '32px');
          await expect.soft(toggle).toHaveCSS('height', '20px');
        }
        const numeric = panel
          .locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
          .first();
        await numeric.hover();
        const scrub = numeric.locator(
          '[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]'
        );
        await expect(scrub).toHaveCSS('opacity', '1');
        const fill = await scrub.evaluate((node) =>
          getComputedStyle(node).getPropertyValue('--sniptale-range-fill-color').trim()
        );
        expect.soft(fill).not.toBe('');
        await info.attach(`document-${section}-${locale}-${theme}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      const redo = page
        .locator('.guide-page-header')
        .getByRole('button', { name: ru ? 'Повторить' : 'Redo', exact: true });
      await expect(redo).toBeDisabled();
      const create = page.locator('.tour-list-actions button').first();
      await expect(create).toBeEnabled();
      await expect(create).toHaveCSS('opacity', '1');
      expect
        .soft(Number(await redo.evaluate((node) => getComputedStyle(node).opacity)))
        .toBeLessThanOrEqual(0.4);
    });
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`semantic inspector rows ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await page.emulateMedia({ colorScheme: theme });
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
      await panel
        .getByRole('button', {
          name: locale === 'ru' ? 'Показать все настройки' : 'Show all settings',
          exact: true,
        })
        .click();
      const row = panel
        .locator('.guide-inspector-choice:has(> span + [data-ui="shared.ui.compact-select"])')
        .first();
      await expect(row).toBeVisible();
      for (const width of [420, 260]) {
        await panel.evaluate((node, size) => {
          (node as HTMLElement).style.width = `${size}px`;
        }, width);
        const layout = panel
          .locator(
            '.guide-inspector-group:has(> .guide-inspector-group-heading .guide-inspector-static-heading):has(> .guide-inspector-group-body > [data-ui="shared.ui.compact-select"]:only-child)'
          )
          .first();
        await layout.scrollIntoViewIfNeeded();
        const heading = (await layout.locator('.guide-inspector-group-heading').boundingBox())!;
        const field = (await layout.locator('[data-ui="shared.ui.compact-select"]').boundingBox())!;
        if (width === 420)
          expect(
            Math.abs(heading.y + heading.height / 2 - field.y - field.height / 2)
          ).toBeLessThanOrEqual(1);
        else expect(field.y).toBeGreaterThanOrEqual(heading.y + heading.height);
        await row.scrollIntoViewIfNeeded();
        const label = (await row.locator(':scope > span').first().boundingBox())!;
        const select = (await row
          .locator(':scope > [data-ui="shared.ui.compact-select"]')
          .first()
          .boundingBox())!;
        if (width === 420)
          expect(
            Math.abs(label.y + label.height / 2 - select.y - select.height / 2)
          ).toBeLessThanOrEqual(1);
        else expect(select.y).toBeGreaterThanOrEqual(label.y + label.height);
        expect(select.x + select.width).toBeLessThanOrEqual(
          (await panel.boundingBox())!.x + width + 1
        );
      }
      await page
        .getByRole('button', {
          name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
          exact: true,
        })
        .click();
      await page
        .locator('#guide-library-panel')
        .getByRole('button', {
          name: locale === 'ru' ? 'Навигационный слайд' : 'Navigation slide',
          exact: true,
        })
        .click();
      const paint = panel.locator('[data-ui="shared.ui.paint-selector"]').first();
      await expect(paint).toHaveAttribute('data-trigger-variant', 'swatch');
      const trigger = paint.locator('[data-ui="shared.ui.paint-selector.trigger"]');
      await expect(trigger.locator('.lucide-palette')).toHaveCount(1);
      await expect(trigger).toContainText('#');
      await expect(trigger).toHaveCSS('border-top-width', '0px');
      await trigger.click();
      await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toBeVisible();
      await trigger.click();
      await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toHaveCount(0);
      await info.attach('scenario-semantic-inspector', {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}
