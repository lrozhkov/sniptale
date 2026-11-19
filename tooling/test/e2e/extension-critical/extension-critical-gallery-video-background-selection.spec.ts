import { expect, test } from '@playwright/test';
import { translate } from '../support/catalog-fixture';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quiet Background selection at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await dialog
        .getByRole('tab', { name: label('gallery.videoReview.background'), exact: true })
        .click();
      const kinds = dialog.locator('.review-background-kinds');
      const solid = button('gallery.videoReview.backgroundSolid');
      const segmented = await solid.count();
      if (segmented) {
        await solid.click();
        await expect(solid).toHaveAttribute('aria-pressed', 'true');
        await expect(solid).toHaveCSS('border-top-width', '0px');
        await expect(solid).toHaveCSS('box-shadow', 'none');
        const geometry = await kinds.locator('button').evaluateAll((nodes) =>
          nodes.map((node) => ({
            y: node.getBoundingClientRect().y,
            fits: node.scrollWidth <= node.clientWidth,
          }))
        );
        expect(geometry).toHaveLength(3);
        expect(geometry.every((value) => value.y === geometry[0]!.y && value.fits)).toBe(true);
      } else {
        const trigger = kinds.getByRole('button', {
          name: label('gallery.videoReview.background'),
          exact: true,
        });
        await trigger.click();
        await page
          .getByRole('option', { name: label('gallery.videoReview.backgroundSolid'), exact: true })
          .click();
        await expect(trigger).toContainText(label('gallery.videoReview.backgroundSolid'));
      }
      const paint = dialog.locator('.review-background-paint .sniptale-parameter-row');
      const fieldBox = (await paint.boundingBox())!;
      const paintBox = (await paint.locator('.sniptale-paint-value').boundingBox())!;
      expect(paintBox.x + paintBox.width).toBeCloseTo(fieldBox.x + fieldBox.width - 8, 0);
      await expect(paint.locator('[data-ui="shared.ui.color-selector.value-trigger"]')).toHaveCount(
        1
      );
      await page.screenshot({ path: testInfo.outputPath('solid-selection.png') });

      const more = dialog.getByRole('button', {
        name: label('settings.editor.backgrounds.showMore'),
        exact: true,
      });
      await more.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('gradient-more.png'), fullPage: false });
      await more.hover();
      await page.screenshot({
        path: testInfo.outputPath('gradient-more-hover.png'),
        fullPage: false,
      });
      await more.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(more).toBeFocused();
      await expect(more).toHaveCSS('outline-width', '2px');
      await more.click();
      await expect(dialog.locator('[data-ui="shared.ui.backgroundThumbnails.group"]')).toHaveText([
        label('gallery.videoReview.backgroundColors'),
        label('gallery.videoReview.backgroundGradients'),
      ]);
      const selected = dialog
        .locator('[data-ui="gallery.videoReview.gradientPresets"] button[style*="gradient"]')
        .first();
      await selected.click();
      await page.mouse.move(10, 10);
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      const colors = await selected.evaluate((node) => {
        const probe = document.createElement('span');
        node.append(probe);
        probe.style.color = 'var(--sniptale-color-text-secondary)';
        const neutral = getComputedStyle(probe).color;
        probe.style.color = 'var(--sniptale-color-accent)';
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return { neutral, accent };
      });
      await expect(selected).toHaveCSS('outline-width', '1px');
      await expect(selected).toHaveCSS('outline-color', colors.neutral);
      await expect(selected).toHaveCSS('opacity', '1');
      await selected.hover();
      await expect(selected).toHaveCSS('opacity', '0.8');
      await page.screenshot({ path: testInfo.outputPath('gradient-selection.png') });
      await selected.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(selected).toBeFocused();
      await expect(selected).toHaveCSS('outline-width', '2px');
      await expect(selected).toHaveCSS('outline-color', colors.accent);
      await expect(dialog.locator('[data-ui="gallery.videoReview.inspector"]')).toBeInViewport();
      const presetName = await selected.getAttribute('aria-label');
      const editorUrl = page.url();
      await dialog.locator('[data-ui="gallery.videoReview.moreActions"]').click();
      await page
        .getByRole('menuitem', { name: label('common.actions.close'), exact: true })
        .click();
      await expect(page.locator('[data-ui="gallery.videoReview.dialog"]')).toBeHidden();
      await page.goto(editorUrl);
      await dialog
        .getByRole('tab', { name: label('gallery.videoReview.background'), exact: true })
        .click();
      // The combined palette starts with colors; reveal the gradient page again on reopen.
      await more.click();
      const restored = dialog.locator(
        '[data-ui="gallery.videoReview.gradientPresets"] button[aria-pressed="true"]'
      );
      await expect(restored).toHaveCount(1);
      await expect(restored).toHaveAttribute('aria-label', presetName!);
      await expect(restored).toHaveCSS('outline-width', '1px');
      await dialog.locator('[data-ui="gallery.videoReview.moreActions"]').click();
      await page
        .getByRole('menuitem', { name: label('common.actions.close'), exact: true })
        .click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`background paint keeps its swatch and nested template controls usable at ${viewport.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const theme = viewport.width === 1280 ? 'dark' : 'light';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await page.setViewportSize(viewport);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
      await review
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await review
        .getByRole('tab', { name: label('gallery.videoReview.background'), exact: true })
        .click();
      const panel = review.locator('[data-ui="gallery.videoReview.backgroundInspector"]');
      await panel
        .getByRole('button', { name: label('gallery.videoReview.backgroundSolid'), exact: true })
        .click();
      const value = panel.locator('.review-background-paint .sniptale-paint-value');
      const swatch = value.locator('[data-ui="shared.ui.paint-selector.trigger"]');
      const hex = value.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      const originalHex = await hex.innerText();
      await expect(value).toHaveCSS('height', '32px');
      await expect(swatch).toHaveCSS('height', '30px');
      await expect(swatch).toHaveCSS('border-inline-end-width', '1px');
      if (viewport.width === 1920) {
        const inspector = review.locator('[data-ui="gallery.videoReview.inspector"]');
        const initial = (await inspector.boundingBox())!;
        const initialField = (await value.boundingBox())!;

        const handle = (await review
          .locator('[data-ui="gallery.videoReview.resizeInspector"]')
          .boundingBox())!;
        const x = handle.x + handle.width / 2;
        const y = handle.y + 20;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 220, y, { steps: 6 });
        await page.mouse.up();
        await expect
          .poll(async () => (await inspector.boundingBox())!.width)
          .toBeGreaterThan(initial.width + 180);
        const expanded = (await inspector.boundingBox())!;
        const expandedField = (await value.boundingBox())!;
        expect(expandedField.width).toBe(206);
        expect(
          Math.abs(expandedField.x - expanded.x - (initialField.x - initial.x))
        ).toBeLessThanOrEqual(1);
      }
      await swatch.hover();
      const neutral = await value.evaluate((field) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--sniptale-color-field-hover)';
        field.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return expected;
      });
      await expect(swatch).toHaveCSS('cursor', 'pointer');
      await expect(value).toHaveCSS('background-color', neutral);
      await swatch.click();
      const popup = page.locator('[data-ui="shared.ui.paint-selector.popup"]');
      await expect(popup).toBeVisible();
      await popup
        .getByRole('button', { name: label('highlighter.paintPicker.gradient'), exact: true })
        .click();
      await expect(
        popup.locator('[data-ui="shared.ui.paint-selector.gradient-editor"]')
      ).toBeVisible();
      await popup
        .getByRole('button', { name: label('highlighter.paintPicker.presets'), exact: true })
        .click();
      const templates = popup.locator('[data-ui="shared.ui.paint-selector.templates"]');
      const search = templates.getByRole('searchbox', {
        name: label('highlighter.paintPicker.searchTemplates'),
        exact: true,
      });
      await search.fill('unmatched template');
      await expect(
        templates.getByText(label('highlighter.paintPicker.noMatchingTemplates'))
      ).toBeVisible();
      await search.fill('');
      const filter = templates.getByRole('button', {
        name: label('highlighter.paintPicker.filterTemplates'),
        exact: true,
      });
      await filter.click();
      const radial = page.getByRole('option', {
        name: label('highlighter.paintPicker.radial'),
        exact: true,
      });
      await expect(radial).toBeVisible();
      await page.screenshot({
        path: info.outputPath('background-template-filter.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(radial).toBeHidden();
      await expect(filter).toBeFocused();
      await expect(popup).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
      await expect(swatch).toBeFocused();
      await expect(hex).toHaveText(originalHex);
      const radiusLabel = label('gallery.videoReview.backgroundCornerRadius');
      const paddingLabel = label('gallery.videoReview.backgroundPadding');
      const numeric = (name: string) => panel.getByRole('textbox', { name, exact: true });
      const radius = numeric(radiusLabel);
      const radiusRow = radius.locator(
        'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]'
      );
      const paddingRow = numeric(paddingLabel).locator(
        'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"]'
      );
      const radiusFrame = radiusRow.locator('[data-stepper-placement="sides"]');
      const shadowColor = panel.locator('[data-ui="shared.ui.color-selector.trigger"]').last();
      await expect(radiusFrame).toHaveCSS('height', '32px');
      await expect(shadowColor).toHaveCSS('height', '32px');
      const [paintBox, radiusBox, shadowBox] = await Promise.all([
        value.boundingBox(),
        radiusFrame.boundingBox(),
        shadowColor.boundingBox(),
      ]);
      expect(Math.abs(radiusBox!.width - shadowBox!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(radiusBox!.width - paintBox!.width)).toBeLessThanOrEqual(1);
      const shadowSwatch = shadowColor.locator(
        '[data-ui="shared.ui.color-selector.picker-trigger"]'
      );
      expect((await shadowSwatch.boundingBox())!.x - shadowBox!.x).toBe(1);
      await expect(radiusRow).not.toHaveAttribute('data-has-scrub', 'true');
      await expect(paddingRow).not.toHaveAttribute('data-has-scrub', 'true');
      const minus = radiusRow.getByRole('button', { name: `${radiusLabel} decrease`, exact: true });
      const plus = radiusRow.getByRole('button', { name: `${radiusLabel} increase`, exact: true });
      await expect(minus.locator('svg.lucide-minus')).toBeVisible();
      await expect(plus.locator('svg.lucide-plus')).toBeVisible();
      const [left, middle, right] = await Promise.all([
        minus.boundingBox(),
        radius.boundingBox(),
        plus.boundingBox(),
      ]);
      expect(left!.x + left!.width).toBeLessThanOrEqual(middle!.x);
      expect(right!.x).toBeGreaterThanOrEqual(middle!.x + middle!.width);
      await radius.fill('24');
      await radius.press('Enter');
      await expect(radius).toHaveValue('24');
      await plus.click();
      await expect(radius).toHaveValue('25');
      await radius.press('ArrowUp');
      await expect(radius).toHaveValue('26');
      await plus.hover();
      await page.mouse.wheel(0, -80);
      await expect(radius).toHaveValue('26');
      await radius.focus();
      await plus.hover();
      await expect(radius).toBeFocused();
      await page.keyboard.down('Alt');
      try {
        await page.mouse.wheel(0, -80);
        await expect(radius).toHaveValue('27');
      } finally {
        await page.keyboard.up('Alt');
      }
      await radius.fill('41');
      await radius.press('Escape');
      await expect(radius).toHaveValue('27');
      await paddingRow.hover();
      await expect(paddingRow.locator('input[type="range"]')).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath('background-numeric-fields.png'),
        fullPage: false,
      });
      await value.scrollIntoViewIfNeeded();
      await expect(hex).toHaveCSS('cursor', 'text');
      const hexBox = await value.locator('.inspector-hex-editor input').boundingBox();
      await hex.click();
      const colorInput = value.getByRole('textbox', { name: /· HEX$/u });
      expect(await colorInput.boundingBox()).toEqual(hexBox);
      const alphaButton = value.getByRole('button', { name: /· Opacity,/u });
      const alpha = value.getByRole('spinbutton', { name: /· Opacity/u });
      await colorInput.fill('#5985A380');
      await colorInput.press('Enter');
      await expect(hex).toHaveText('#5985A3');
      await expect(alphaButton).toHaveText('50%');
      await expect(alphaButton).toHaveCSS('cursor', 'text');
      const alphaBox = await value.locator('.alpha-value input').boundingBox();
      await alphaButton.click();
      expect(await alpha.boundingBox()).toEqual(alphaBox);
      await alpha.fill('60');
      await alpha.press('Enter');
      await expect(alphaButton).toHaveText('60%');
      await value.hover();
      const copy = value.getByRole('button', { name: 'Copy color HEX', exact: true });
      await expect(copy).toHaveAttribute('title', 'Copy color HEX');
      await expect(copy).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.evaluate(() => {
        Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
      });
      await copy.click();
      await expect(copy).toHaveAttribute('data-copy-state', 'failed');
      await expect(value.getByRole('textbox', { name: 'Copy color HEX' })).toHaveCount(0);
      await expect(copy.locator('svg.lucide-check')).toHaveCount(0);

      // The harness replaces navigator.clipboard with an image-only mock.
      await page.evaluate(() => {
        Reflect.deleteProperty(document, 'execCommand');
        Reflect.deleteProperty(navigator, 'clipboard');
      });
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: host.origin,
      });
      await page.bringToFront();
      await value.hover();
      await copy.click();
      await expect(copy.locator('svg.lucide-check')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe('#5985A399');
      await page.screenshot({
        path: info.outputPath('background-color-alpha.png'),
        fullPage: false,
      });
    } finally {
      host.server.close();
    }
  });
}
