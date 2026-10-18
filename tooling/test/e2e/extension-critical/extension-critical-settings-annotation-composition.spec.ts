import type { Locator, Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';

const text = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');

async function configure(page: Page, extensionId: string, theme: 'light' | 'dark') {
  const base = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`;
  await page.goto(`${base}?section=interface-browser&view=interface`);
  await expect(page.locator('#settings-interface-language')).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toMatch(/^(ru|en)$/);
  await page.evaluate(async (theme) => {
    localStorage.setItem('sniptale-locale-preference', 'ru');
    await chrome.storage.local.set({
      'sniptale-locale-preference': 'ru',
      'sniptale-theme-preference': theme,
    });
  }, theme);
  return base;
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`annotation template parameter roles ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      await page.goto(`${base}?section=annotations&view=borders`);
      await page
        .getByRole('button', { name: text('highlighter.section.addButton'), exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      await page.screenshot({ path: info.outputPath('border-template-idle.png'), fullPage: false });
      const name = dialog.getByRole('textbox').first();
      await expect(name).toHaveClass(/sniptale-input/);
      await expect(
        dialog.getByText(text('highlighter.editor.nameLabel'), { exact: true })
      ).toHaveCSS('font-weight', '400');
      const legend = dialog.locator('[data-ui="shared.annotation-template-tag-assignment"] legend');
      await expect(legend).toHaveCSS('font-size', '13px');
      await expect(legend).toHaveCSS('font-weight', '400');
      await name.fill('Cancelled template composition');
      await verifyTagAssignment(dialog, page);
      const fill = dialog.getByRole('button', {
        name: text('highlighter.editor.fillSection'),
        exact: true,
      });
      await fill.click();
      const surface = dialog.locator('[data-ui="shared.ui.surface-style-selector"]');
      const row = surface.locator('.sniptale-parameter-row');
      await expect(row).toBeVisible();
      await expect(row.locator('.sniptale-parameter-name')).toHaveCSS('font-size', '13px');
      await expect(row.locator('.sniptale-parameter-name')).toHaveCSS('font-weight', '400');
      await settle(page);
      await page.screenshot({ path: info.outputPath('border-template-fill.png'), fullPage: false });
      for (const section of [
        'geometrySection',
        'shadowSection',
        'blurSection',
        'focusSection',
        'behaviorSection',
      ] as const) {
        await dialog
          .getByRole('button', { name: text(`highlighter.editor.${section}`), exact: true })
          .click();
        if (section === 'geometrySection') {
          const padding = dialog.locator('[data-ui="shared.linked-padding-fields"]');
          await expect(
            padding.getByText(text('highlighter.editor.paddingLabel'), { exact: true })
          ).toHaveCSS('font-size', '13px');
          expect(
            (await padding.locator('.sniptale-numeric-entry').first().boundingBox())!.height
          ).toBeGreaterThanOrEqual(32);
        }
        await settle(page);
        await page.screenshot({ path: info.outputPath(`border-${section}.png`), fullPage: false });
      }
      await dialog
        .getByRole('button', { name: text('highlighter.editor.customCssLabel'), exact: true })
        .click();
      const css = dialog.getByRole('textbox').last();
      await expect(css).toHaveAttribute('title', text('highlighter.editor.customCssHint'));
      await css.fill('border-radius: 12px;');
      await settle(page);
      await page.screenshot({ path: info.outputPath('border-template-css.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: text('common.actions.cancel'), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
    });
  }
}

async function verifyTagAssignment(dialog: Locator, page: Page) {
  const tags = dialog.getByRole('button', {
    name: text('highlighter.templateTags.assignmentLabel'),
    exact: true,
  });
  await tags.click();
  const option = page.getByRole('menuitemcheckbox').first();
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await tags.click();
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`annotation CSS editors retain errors and quiet names ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      for (const preset of [
        {
          view: 'callouts',
          add: 'highlighter.calloutPresets.add',
          name: 'highlighter.calloutPresets.editor.name',
          section: 'content.callout.manualCss',
          id: 'sniptale-callout-custom-css',
          hint: 'content.callout.cssHint',
          invalid: '[card]\nposition: fixed;',
        },
        {
          view: 'numbering',
          add: 'highlighter.stepBadgePresets.add',
          name: 'highlighter.stepBadgePresets.editor.name',
          section: 'content.stepBadge.cssSection',
          id: 'sniptale-step-badge-custom-css',
          hint: 'content.stepBadge.cssHint',
          invalid: '[badge]\nposition: fixed;',
        },
      ] as const) {
        await page.goto(`${base}?section=annotations&view=${preset.view}`);
        await page.getByRole('button', { name: text(preset.add), exact: true }).click();
        const dialog = page.getByRole('dialog');
        const name = dialog.getByRole('textbox', { name: text(preset.name), exact: true });
        await expect(name).toHaveAttribute('placeholder', text(preset.name));
        await expect(name).toHaveClass(/sniptale-input/);
        await name.fill('Cancelled CSS draft');
        await dialog.getByRole('button', { name: text(preset.section), exact: true }).click();
        const css = dialog.locator(`#${preset.id}`);
        const feedback = dialog.locator(`#${preset.id}-help`);
        await expect(css).toHaveAttribute('title', text(preset.hint));
        await expect(feedback).toHaveClass('sr-only');
        await css.fill(preset.invalid);
        await expect(css).toHaveAttribute('aria-invalid', 'true');
        await expect(feedback).not.toHaveClass('sr-only');
        await expect(feedback).toHaveCSS('font-size', '13px');
        await feedback.scrollIntoViewIfNeeded();
        await settle(page);
        await page.screenshot({
          path: info.outputPath(`${preset.view}-css-error.png`),
          fullPage: false,
        });
        await css.fill('');
        await expect(css).toHaveAttribute('aria-invalid', 'false');
        await expect(feedback).toHaveClass('sr-only');
        await settle(page);
        await page.screenshot({
          path: info.outputPath(`${preset.view}-css-empty.png`),
          fullPage: false,
        });
        const cancel = dialog.getByRole('button', {
          name: text('common.actions.cancel'),
          exact: true,
        });
        await cancel.scrollIntoViewIfNeeded();
        await expect(cancel).toBeInViewport({ ratio: 1 });
        await cancel.click();
        await expect(dialog).toHaveCount(0);
      }
    });
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
}

test('annotation template compact layout retains actual scroll owners', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const base = await configure(page, extensionId, 'light');
  for (const width of [639, 640, 641, 1100]) {
    await page.setViewportSize({ width, height: 560 });
    await page.goto(`${base}?section=annotations&view=borders`);
    const viewport = page.locator('.sniptale-settings-viewport');
    expect(await viewport.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await page
      .getByRole('button', { name: text('highlighter.section.addButton'), exact: true })
      .click();
    const dialog = page.locator('.sniptale-highlighter-preset-editor-dialog');
    const fill = dialog.getByRole('button', {
      name: text('highlighter.editor.fillSection'),
      exact: true,
    });
    await fill.scrollIntoViewIfNeeded();
    await fill.click();
    const surface = dialog.locator('[data-ui="shared.ui.surface-style-selector"]');
    await surface.scrollIntoViewIfNeeded();
    expect(await surface.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const cancel = dialog.getByRole('button', { name: text('common.actions.cancel'), exact: true });
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeInViewport({ ratio: 1 });
    await settle(page);
    await page.screenshot({
      path: info.outputPath(`annotation-footer-${width}.png`),
      fullPage: false,
    });
    await cancel.click();
    await expect(dialog).toHaveCount(0);
  }
});
