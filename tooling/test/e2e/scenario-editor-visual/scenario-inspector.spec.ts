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
      await expect.soft(composition).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
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
      const accentColors = await align.evaluate((node) =>
        ['accent', 'accent-emphasis'].map((token) => {
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
          accentColors.includes(await align.evaluate((node) => getComputedStyle(node).color))
        )
        .toBe(true);
      await expect(align).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.mouse.move(800, 500);
      await expect
        .poll(async () =>
          accentColors.includes(await align.evaluate((node) => getComputedStyle(node).color))
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
      await expect.soft(contents).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
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
      const row = panel.locator('.tour-slide-row');
      await expect
        .soft(row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }))
        .toHaveCount(1);
      if (await row.getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true }).count()) {
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
