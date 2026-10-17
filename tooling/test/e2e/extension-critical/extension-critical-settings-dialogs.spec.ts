import type { Locator, Page, TestInfo } from '@playwright/test';
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

async function assertDialog(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.sniptale-modal-header-sm')).toHaveCSS('border-bottom-width', '0px');
  await expect(dialog.locator('.sniptale-modal-footer-sm')).toHaveCSS('border-top-width', '0px');
  await expect(dialog.locator('.sniptale-modal-footer-sm')).toHaveCSS('padding-bottom', '8px');
  for (const field of await dialog.locator('.sniptale-input, .sniptale-textarea').all()) {
    await expect(field).toHaveCSS('border-radius', '4px');
    await expect(field).toHaveCSS('font-weight', '400');
  }
  const firstField = dialog.locator('.sniptale-input, .sniptale-textarea').first();
  await firstField.click();
  await expect(firstField).toHaveCSS('box-shadow', 'none');
  const neutral = await firstField.evaluate((node) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sniptale-color-border-strong)';
    node.parentElement!.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(firstField).toHaveCSS('border-color', neutral);
  const focus = await firstField.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      width: style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth),
      outline: style.outlineColor,
      border: style.borderColor,
    };
  });
  expect(focus.width).toBeLessThanOrEqual(1);
  if (focus.width > 0) expect(focus.outline).toBe(focus.border);
  const cancel = dialog.getByRole('button', { name: text('common.actions.cancel'), exact: true });
  await expect(cancel).toHaveAttribute('data-command-tone', 'secondary');
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport({ ratio: 1 });
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings resource dialog surfaces ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      for (const resource of [
        { view: 'gradients', add: 'settings.editor.gradients.add' },
        { view: 'surfaces', add: 'settings.editor.surfaceStyles.add' },
      ] as const) {
        await page.goto(`${base}?section=editor-resources&view=${resource.view}`);
        const add = page.getByRole('button', { name: text(resource.add), exact: true });
        await add.click();
        const dialog = page.getByRole('dialog');
        await assertDialog(dialog);
        const name = dialog.getByRole('textbox', {
          name: text('settings.editor.presetName'),
          exact: true,
        });
        await expect(name).toHaveAttribute('placeholder', text('settings.editor.presetName'));
        await name.fill('Cancelled resource draft');
        await name.blur();
        await page.mouse.move(0, 0);
        await expect(name).toHaveCSS('box-shadow', 'none');
        await expect(name).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath(`${resource.view}-draft.png`),
          fullPage: false,
        });
        await dialog
          .getByRole('button', { name: text('common.actions.cancel'), exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        await add.click();
        await expect(name).toHaveValue('');
        await dialog
          .getByRole('button', { name: text('common.actions.cancel'), exact: true })
          .click();
      }
    });
  }
}

async function cancelDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: text('common.actions.cancel'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function promptTemplateForms(page: Page, base: string, info: TestInfo) {
  for (const view of ['templates', 'scenario-templates']) {
    await page.goto(`${base}?section=ai-prompts&view=${view}`);
    await page
      .getByRole('button', { name: text('templates.section.addButton'), exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await assertDialog(dialog);
    for (const card of await dialog.locator('.sniptale-modal-field-surface').all()) {
      await expect(card).toHaveCSS('border-top-width', '0px');
      await expect(card).toHaveCSS('padding-left', '0px');
      await expect(card).toHaveCSS('box-shadow', 'none');
    }
    await dialog.locator('#template-name').fill('Cancelled template');
    await dialog
      .locator('#template-content')
      .fill('Editable prose stays in its own full-width field.');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`${view}-draft.png`), fullPage: false });
    await cancelDialog(dialog);
  }
}

async function windowSizeForm(page: Page, base: string, info: TestInfo) {
  await page.goto(`${base}?section=screen-sizes`);
  await page
    .getByRole('button', { name: text('viewportPresets.section.addButton'), exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await assertDialog(dialog);
  await dialog.getByRole('textbox').fill('Cancelled window');
  await dialog.getByRole('spinbutton').first().fill('1440');
  await dialog.getByRole('spinbutton').last().fill('900');
  for (const field of await dialog.getByRole('spinbutton').all()) {
    expect((await field.boundingBox())!.width).toBeLessThanOrEqual(100);
    await expect(field).toHaveCSS('text-align', 'right');
  }
  await page.screenshot({ path: info.outputPath('window-size-draft.png'), fullPage: false });
  await cancelDialog(dialog);
}

async function aiConnectionForms(page: Page, base: string, info: TestInfo) {
  const dialog = page.getByRole('dialog');
  await page.goto(`${base}?section=ai-connections&view=integrations`);
  const providers = page.getByRole('region', {
    name: text('settings.aiProviders.providersTitle'),
    exact: true,
  });
  await providers.getByRole('button', { name: text('common.actions.add'), exact: true }).click();
  await assertDialog(dialog);
  await dialog.locator('input').first().fill('Cancelled provider');
  await dialog.locator('input[type="password"]').fill('synthetic-no-network');
  await page.screenshot({ path: info.outputPath('provider-draft.png'), fullPage: false });
  await cancelDialog(dialog);
  await page.goto(`${base}?section=ai-connections&view=security`);
  await page
    .getByRole('switch', {
      name: text('settings.aiProviders.secretProtectionTitle'),
      exact: true,
    })
    .click();
  await assertDialog(dialog);
  await dialog.locator('input[type="password"]').first().fill('synthetic-local-draft');
  await page.screenshot({ path: info.outputPath('key-protection-draft.png'), fullPage: false });
  await cancelDialog(dialog);
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings prompt window and AI form composition ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      await promptTemplateForms(page, base, info);
      await windowSizeForm(page, base, info);
      await aiConnectionForms(page, base, info);
    });
  }
}

test('settings background name retains the standard field and rename flow', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const base = await configure(page, extensionId, 'light');
  await page.goto(`${base}?section=editor-resources&view=backgrounds`);
  await page
    .getByRole('button', { name: text('settings.editor.backgrounds.add'), exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#406080';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'Dialog background.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(dialog).toHaveCount(0);
  const row = page
    .locator('[data-settings-collection-item]')
    .filter({ hasText: 'Dialog background' });
  await row
    .getByRole('button', { name: text('settings.collection.actions.edit'), exact: true })
    .click();
  const name = dialog.getByRole('textbox');
  await expect(name).toHaveClass(/sniptale-input/);
  await expect(name).toHaveAttribute('maxlength', '120');
  await expect(name).toHaveAttribute('placeholder', text('settings.editor.backgrounds.name'));
  await name.fill('Renamed background');
  await page.screenshot({ path: info.outputPath('background-rename.png'), fullPage: false });
  await dialog.getByRole('button', { name: text('common.actions.save'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator('[data-settings-collection-item]').filter({ hasText: 'Renamed background' })
  ).toBeVisible();
});
