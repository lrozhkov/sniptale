import { checkInspectorUtility } from '../support/inspector-utilities';
import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`scenario navigation chrome ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      const t = createTranslator(locale);
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      const choices = page.locator('.tour-representation-switch');
      const selected = choices.locator('[aria-pressed="true"]');
      await expect
        .configure({ soft: true, timeout: 1000 })(selected)
        .toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect
        .configure({ soft: true, timeout: 1000 })(selected)
        .not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const appearance = page
        .locator('.guide-page-header')
        .getByRole('button', { name: t('scenario.editor.appearance'), exact: true });
      await appearance.click();
      await expect
        .configure({ soft: true, timeout: 1000 })(appearance)
        .toHaveAttribute('aria-pressed', 'true');
      const panel = page.locator('#guide-inspector-panel');
      await expect
        .configure({ soft: true, timeout: 1000 })(
          panel.getByText(t('scenario.editor.guideEntireDocument'), { exact: true })
        )
        .toHaveCount(1);
      await page.locator('.guide-outline a.guide-outline-step').first().click();
      const heading = panel.locator('[data-ui="shared.categorized-inspector.section-heading"]');
      await expect
        .configure({ soft: true, timeout: 1000 })(heading)
        .toHaveCSS('border-bottom-width', '0px');
      await page.locator('.guide-outline a.guide-outline-step').first().click();
      await expect
        .configure({ soft: true, timeout: 1000 })(appearance)
        .toHaveAttribute('aria-pressed', 'false');
      const row = page.locator('.guide-outline a[aria-current]');
      await expect
        .configure({ soft: true, timeout: 1000 })(row)
        .toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      const inactive = choices.locator('[aria-pressed="false"]');
      await page.mouse.move(0, 0);
      const idleColor = await inactive.evaluate((node) => getComputedStyle(node).color);
      await inactive.hover();
      await expect(inactive).not.toHaveCSS('color', idleColor);
      await expect(inactive).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const resourceTab = page
        .locator('.guide-left-navigation')
        .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true });
      await resourceTab.hover();
      await expect(resourceTab).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(resourceTab).toHaveAttribute('aria-pressed', 'false');
      await expect(inactive).toHaveAttribute('aria-pressed', 'false');
      const rows = page.locator('.guide-outline-row');
      const firstLink = rows.first().locator('a');
      const firstId = await firstLink.getAttribute('href');
      const beforeWidth = (await firstLink.boundingBox())!.width;
      await rows.first().hover();
      expect((await firstLink.boundingBox())!.width).toBe(beforeWidth);
      const menu = rows.first().locator('.guide-action-menu-anchor > button');
      await menu.focus();
      await menu.press('Enter');
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await menu.click();
      await page
        .locator('.guide-action-menu')
        .getByRole('button', { name: t('scenario.editor.guideMoveDown'), exact: true })
        .click();
      await expect(rows.nth(1).locator('a')).toHaveAttribute('href', firstId!);
      await page
        .locator('.guide-history-controls')
        .getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true })
        .click();
      await expect(rows.first().locator('a')).toHaveAttribute('href', firstId!);
      for (const button of await panel.locator('.guide-panel-heading > button').all())
        await checkInspectorUtility(page, button);
      await info.attach('guide-navigation', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await choices
        .getByRole('button', { name: t('scenario.editor.tourMode'), exact: true })
        .click();
      await appearance.click();
      await expect(appearance).toHaveAttribute('aria-pressed', 'true');
      await expect(
        panel.locator('[data-ui="shared.categorized-inspector.section-heading"]')
      ).toHaveCSS('border-bottom-width', '0px');
      const slideRows = page.locator('.tour-slide-row');
      await slideRows.first().locator('.tour-slide-select').click();
      await expect(appearance).toHaveAttribute('aria-pressed', 'false');
      const title = slideRows.first().locator('.tour-slide-title');
      await page.mouse.move(0, 0);
      const titleWidth = (await title.boundingBox())!.width;
      await slideRows.first().hover();
      expect((await title.boundingBox())!.width).toBe(titleWidth);
      await expect(slideRows.first().locator('.tour-slide-card')).toHaveCSS(
        'border-top-color',
        'rgba(0, 0, 0, 0)'
      );
      await slideRows
        .first()
        .getByRole('button', { name: t('scenario.editor.tourSlideActions'), exact: true })
        .click();
      await page.keyboard.press('Escape');
      await expect(
        slideRows
          .first()
          .getByRole('button', { name: t('scenario.editor.tourSlideActions'), exact: true })
      ).toBeFocused();
      for (const button of await panel.locator('.guide-panel-heading > button').all())
        await checkInspectorUtility(page, button);
      await checkInspectorUtility(
        page,
        page.locator('#guide-library-panel .guide-panel-heading > button')
      );
      await appearance.click();
      await panel.locator('.guide-panel-heading > button').last().click();
      await expect(appearance).toHaveAttribute('aria-pressed', 'false');
      await page.screenshot({ path: info.outputPath('tour-navigation.png') });
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`scenario collapsed and resource chrome ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }) => {
      const t = createTranslator(locale);
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      const library = page.locator('#guide-library-panel');
      await library.locator('.guide-panel-heading > button').click();
      const reopen = page.locator('.guide-collapsed-sections');
      await expect(
        reopen.getByRole('button', { name: t('scenario.editor.outline'), exact: true })
      ).toBeVisible();
      await page
        .locator('.tour-representation-switch')
        .getByRole('button', { name: t('scenario.editor.tourMode'), exact: true })
        .click();
      const slides = reopen.getByRole('button', {
        name: t('scenario.editor.tourSlides'),
        exact: true,
      });
      await expect(slides).toBeVisible();
      await expect(slides).toHaveCSS('width', '32px');
      await expect(slides).toHaveCSS('height', '32px');
      await slides.click();
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`scenario resource headings ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      const t = createTranslator(locale);
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      for (const mode of ['scenario.editor.referenceMode', 'scenario.editor.tourMode'] as const) {
        await page
          .locator('.tour-representation-switch')
          .getByRole('button', { name: t(mode), exact: true })
          .click();
        const library = page.locator('#guide-library-panel');
        await library
          .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true })
          .click();
        await info.attach(`resources-${mode}`, {
          body: await library.screenshot(),
          contentType: 'image/png',
        });
        await expect(
          library.locator('.guide-image-resources h3, .tour-audio-resources h3')
        ).toHaveCount(mode === 'scenario.editor.referenceMode' ? 1 : 2);
        for (const heading of await library
          .locator('.guide-image-resources h3, .tour-audio-resources h3')
          .all()) {
          await expect(heading).toHaveCSS('line-height', '20px');
          await expect(heading.locator('svg')).toHaveCSS('height', '16px');
          const delta = await heading.evaluate((node) => {
            const icon = node.querySelector('svg')!.getBoundingClientRect();
            const text = node.querySelector('span')!.getBoundingClientRect();
            return Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2);
          });
          expect(delta).toBeLessThanOrEqual(1);
        }
      }
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`scenario narrow navigation ${theme}`, async ({ page, hostOrigin }, info) => {
    const t = createTranslator('ru');
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'ru',
      { width: 1600, height: 1000 },
      'compare',
      { tourFixture: '1' }
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const resize = page.locator('.guide-panel-divider-left');
    await resize.focus();
    for (let index = 0; index < 9; index++) await page.keyboard.press('ArrowLeft');
    await expect(resize).toHaveAttribute('aria-valuenow', '180');
    for (const mode of ['scenario.editor.referenceMode', 'scenario.editor.tourMode'] as const) {
      const choice = page
        .locator('.tour-representation-switch')
        .getByRole('button', { name: t(mode), exact: true });
      await choice.click();
      await expect(choice).toHaveCSS('transition-duration', '0s');
      const library = page.locator('#guide-library-panel');
      const titles = library.locator('.guide-outline-row a > span:last-child, .tour-slide-title');
      expect(await titles.count()).toBeGreaterThan(0);
      for (const title of await titles.all()) {
        expect((await title.boundingBox())!.width).toBeGreaterThan(65);
      }
      const actions = library.locator('.guide-action-menu-anchor > button').first();
      await actions.focus();
      await actions.press('Enter');
      await expect(page.locator('.guide-action-menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(actions).toBeFocused();
      const overflow = await library.evaluate((node) =>
        [...node.querySelectorAll('button, a')].some(
          (button) => button.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
        )
      );
      expect(overflow).toBe(false);
      await info.attach(`narrow-${mode}`, {
        body: await library.screenshot(),
        contentType: 'image/png',
      });
    }
  });
}
