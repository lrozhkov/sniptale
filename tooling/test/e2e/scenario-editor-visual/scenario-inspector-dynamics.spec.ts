import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`inspector dynamics and inner geometry in ${theme}`, async ({ page, hostOrigin }, info) => {
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      { width: 1600, height: 1000 },
      'compare',
      {
        tourFixture: '1',
      }
    );
    const panel = page.locator('#guide-inspector-panel');
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    const gap = await panel.locator('.guide-style-accent').evaluate((node) => {
      const group = node.closest('.guide-inspector-group')!;
      return (
        group.nextElementSibling!.getBoundingClientRect().top - node.getBoundingClientRect().bottom
      );
    });
    expect.soft(gap).toBeGreaterThanOrEqual(12);
    await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: 'Playback', exact: true })
      .click();
    const toggle = panel.getByRole('switch').first();
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
    await expect
      .configure({ soft: true })
      .poll(() =>
        toggle.evaluate((node) => {
          const track = node.getBoundingClientRect();
          const thumb = node.firstElementChild!.getBoundingClientRect();
          return Math.round(track.right - thumb.right);
        })
      )
      .toBe(3);
    const numeric = panel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').first();
    await numeric.hover();
    const slider = numeric.locator('input[type="range"]');
    await numeric.locator('span').first().hover();
    const idleThumb = await slider.screenshot();
    await slider.hover();
    const hoveredThumb = await slider.screenshot({ animations: 'disabled' });
    expect.soft(idleThumb.equals(hoveredThumb)).toBe(false);
    await slider.click();
    await page.mouse.move(700, 100);
    await expect
      .soft(numeric.locator('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]'))
      .toHaveCSS('opacity', '0');
    await numeric.hover();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toBeFocused();
    await page.mouse.move(700, 100);
    await expect(
      numeric.locator('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]')
    ).toHaveCSS('opacity', '1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    await expect(
      numeric.locator('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]')
    ).toHaveCSS('opacity', '0');
    await info.attach(`dynamics-${theme}`, {
      body: await panel.screenshot(),
      contentType: 'image/png',
    });
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`inspector headers, contextual actions and resources in ${locale} ${theme}`, async ({
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
      const panel = page.locator('#guide-inspector-panel');
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const choice = panel
        .locator('.guide-inspector-choice [role="group"] button[aria-pressed="false"]')
        .first();
      const idle = await choice.evaluate((node) => getComputedStyle(node).color);
      await choice.hover();
      await expect
        .poll(() => choice.evaluate((node) => getComputedStyle(node).color))
        .not.toBe(idle);
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Объекты слайда' : 'Slide objects', exact: true })
        .click();
      await panel
        .getByRole('button', { name: ru ? 'Точка действия' : 'Hotspot', exact: true })
        .click();
      await panel
        .getByRole('button', {
          name: ru ? 'К настройкам слайда' : 'Back to slide settings',
          exact: true,
        })
        .click();
      const heading = panel.locator('[data-ui="shared.categorized-inspector.section-heading"]');
      const bounds: number[] = [];
      for (const name of [
        ru ? 'Слайд' : 'Slide',
        ru ? 'Камера' : 'Camera',
        ru ? 'Объекты слайда' : 'Slide objects',
        ru ? 'Воспроизведение' : 'Playback',
      ]) {
        const tab = panel.getByRole('navigation').getByRole('button', { name, exact: true });
        await tab.hover();
        if ((await tab.getAttribute('aria-pressed')) !== 'true')
          await expect(tab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await tab.click();
        await expect(tab).toHaveCSS('box-shadow', 'none');
        await expect(tab).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        bounds.push(
          await heading
            .locator(':scope > span')
            .evaluate((node) => node.getBoundingClientRect().top)
        );
      }
      expect(Math.max(...bounds) - Math.min(...bounds)).toBeLessThanOrEqual(1);
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Объекты слайда' : 'Slide objects', exact: true })
        .click();
      const add = heading.locator('button');
      await expect(add).toHaveCSS('width', '32px');
      await expect(add).toHaveCSS('height', '32px');
      const row = panel.locator('.tour-object-item').first();
      const actions = row.locator('.tour-object-item-actions');
      await page.mouse.move(700, 100);
      await expect(actions).toHaveCSS('opacity', '0');
      const before = await row.locator('.tour-object-row').boundingBox();
      await row.hover();
      await expect(actions).toHaveCSS('opacity', '1');
      expect(await row.locator('.tour-object-row').boundingBox()).toEqual(before);
      await expect
        .soft(panel.locator('ol.tour-object-list > li'))
        .toHaveCount(await panel.locator('.tour-object-item').count());
      await expect.soft(row.locator('.tour-object-row > svg')).toHaveCount(1);
      const iconAction = actions.locator('button:not(:disabled)').first();
      const idleColor = await iconAction.evaluate((node) => getComputedStyle(node).color);
      await iconAction.hover();
      await expect.soft(iconAction).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect.soft(iconAction).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect.soft(iconAction).not.toHaveCSS('color', idleColor);
      const dividerGap = await row.evaluate(
        (node) =>
          node.getBoundingClientRect().bottom -
          node.querySelector('.tour-object-row')!.getBoundingClientRect().bottom
      );
      expect(dividerGap).toBeGreaterThanOrEqual(4);
      await page.mouse.move(700, 100);
      await row.locator('.tour-object-row').focus();
      await page.keyboard.press('Tab');
      await expect(actions).toHaveCSS('opacity', '1');
      expect(await actions.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      await info.attach(`objects-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      const library = page.locator('#guide-library-panel');
      const tabs = library.locator('.guide-left-navigation');
      const oldLeft = await tabs.evaluate((node) => getComputedStyle(node, '::after').left);
      await tabs.getByRole('button', { name: ru ? 'Ресурсы' : 'Resources', exact: true }).click();
      await expect
        .poll(() => tabs.evaluate((node) => getComputedStyle(node, '::after').left))
        .not.toBe(oldLeft);
      expect(
        await tabs.evaluate((node) => getComputedStyle(node, '::after').transitionDuration)
      ).toBe('0.28s');
      const active = tabs.locator('[aria-pressed="true"]');
      expect(await active.locator('svg').evaluate((node) => getComputedStyle(node).color)).toBe(
        await active.evaluate((node) => getComputedStyle(node).color)
      );
      await expect(library.locator('.guide-resource-footer')).toHaveCount(0);
      const images = library.locator('.guide-image-resources');
      const previewButton = images
        .getByRole('button', {
          name: ru ? 'Посмотреть изображение' : 'View image',
          exact: true,
        })
        .first();
      await images.locator('.tour-resource-row').first().hover();
      await previewButton.click();
      const previewDialog = page.locator('#tour-resource-preview');
      await expect(previewDialog).toBeVisible();
      await expect.soft(library.locator('#tour-resource-preview')).toHaveCount(0);
      const previewBounds = await previewDialog.boundingBox();
      expect.soft(previewBounds!.x + previewBounds!.width).toBeGreaterThan(800);
      await page.keyboard.press('Escape');
      await expect(previewButton).toBeFocused();
      await expect(
        images.getByRole('button', {
          name: ru ? 'Загрузить изображение' : 'Upload image',
          exact: true,
        })
      ).toHaveCount(0);
      await images
        .locator('.guide-image-upload-compact .guide-action-menu-anchor > button')
        .click();
      await expect(
        page.getByRole('button', {
          name: ru ? 'Загрузить изображение' : 'Upload image',
          exact: true,
        })
      ).toBeVisible();
      await page
        .getByRole('button', { name: ru ? 'Библиотека изображений' : 'Image library', exact: true })
        .click();
      await expect(page.locator('#guide-resource-drawer')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(
        images.locator('.guide-image-upload-compact .guide-action-menu-anchor > button')
      ).toBeFocused();
      await expect(library.locator('.tour-audio-resources .tour-audio-acquisition')).toBeVisible();
      await library.locator('.tour-audio-acquisition input[type="file"]').setInputFiles({
        name: 'Narration.wav',
        mimeType: 'audio/wav',
        buffer: silentAudio(),
      });
      await expect(library.locator('.tour-audio-resource')).toHaveCount(1);
      await expect(library.locator('.tour-audio-acquisition [aria-expanded]')).toHaveCount(1);
      await library.locator('.tour-audio-resource').hover();
      await library
        .getByRole('button', {
          name: ru ? 'Озвучить выбранное' : 'Attach to selection',
          exact: true,
        })
        .click();
      await expect(
        library.getByRole('button', { name: ru ? 'Привязки: 1' : 'Bindings: 1', exact: true })
      ).toBeVisible();
      await library.locator('.tour-audio-resource .tour-audio-name').click();
      await expect(library.locator('[data-tour-narration-preview]')).toBeVisible();
      await info.attach(`resources-full-${locale}-${theme}`, {
        body: await library.screenshot(),
        contentType: 'image/png',
      });
      const resize = page.locator('.guide-panel-divider-left');
      await resize.focus();
      for (let index = 0; index < 9; index++) await page.keyboard.press('ArrowLeft');
      await expect(resize).toHaveAttribute('aria-valuenow', '180');
      expect(
        await library.evaluate((node) =>
          [...node.querySelectorAll('button')]
            .filter(
              (button) =>
                button.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
            )
            .map((button) => button.textContent)
        )
      ).toEqual([]);
      await info.attach(`resources-${locale}-${theme}`, {
        body: await library.screenshot(),
        contentType: 'image/png',
      });
      await page.getByRole('button', { name: ru ? 'Руководство' : 'Guide', exact: true }).click();
      await library
        .getByRole('button', { name: ru ? 'Ресурсы' : 'Resources', exact: true })
        .click();
      await expect(library.locator('.guide-image-upload-compact [aria-expanded]')).toHaveCount(1);
      const guideRow = library.locator('.guide-resource-row').first();
      await guideRow.hover();
      const guidePreview = guideRow.getByRole('button', {
        name: ru ? 'Посмотреть изображение' : 'Preview image',
        exact: true,
      });
      await guidePreview.click();
      await expect(page.locator('#guide-resource-preview')).toBeVisible();
      await expect(library.locator('#guide-resource-preview')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(guidePreview).toBeFocused();
      await info.attach(`guide-resources-${locale}-${theme}`, {
        body: await library.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}

function silentAudio(): Buffer {
  const dataSize = 16000;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}
