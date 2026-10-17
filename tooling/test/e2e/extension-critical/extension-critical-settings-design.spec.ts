import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';

import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_VIEWS,
  type SettingsSectionId,
} from '../../../../apps/extension/src/platform/navigation/extension-pages/settings-route/codec';

type Locale = 'ru' | 'en';
type Theme = 'light' | 'dark';
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);

test.use({ actionTimeout: 10_000 });

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

async function openSettings(page: Page, extensionId: string) {
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=interface-browser&view=interface`
  );
  await expect(page.locator('#settings-interface-language')).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const value: unknown = (await chrome.storage.local.get('sniptale-locale-preference'))[
          'sniptale-locale-preference'
        ];
        return value === 'ru' || value === 'en';
      })
    )
    .toBe(true);
  await settle(page);
}

async function sidebarWheelNavigation(page: Page, info: TestInfo) {
  const nav = page.locator('[data-ui="settings.sidebar.nav-list"]');
  const last = nav.getByRole('button').last();
  const box = (await nav.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 1200);
  await expect(
    last,
    'The sidebar scroll owner must expose its last section to pointer users'
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('sidebar-bottom.png'), fullPage: false });
  await last.click();
  await expect(page).toHaveURL(/section=settings-transfer/);
}

test('native settings sidebar wheel reaches the last section at short height', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await configure(page, extensionId, 'en', 'light');
  await interfaceRowRhythm(page, info);
  await neutralThemeChoice(page, 'en', info);
  await sidebarWheelNavigation(page, info);
  await route(page, extensionId, 'access-data', 'permissions');
  await assertFit(page);
  await screenshot(page, info, 'site-access-mode');
});

async function configure(page: Page, extensionId: string, locale: Locale, theme: Theme) {
  await openSettings(page, extensionId);
  await page.locator('#settings-interface-language').click();
  await page
    .getByRole('option', {
      name: locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toBe(locale);
  await page.evaluate(
    async ({ locale, theme }) => {
      localStorage.setItem('sniptale-locale-preference', locale);
      localStorage.setItem('sniptale-theme-preference', theme);
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
    },
    { locale, theme }
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('#settings-interface-language')).toBeEnabled();
  await settle(page);
}

async function contentReady(page: Page) {
  const content = ui(page, 'settings.page.content-scroll');
  await expect.poll(async () => (await content.innerText()).trim().length).toBeGreaterThan(0);
  await expect(content.locator('.animate-pulse')).toHaveCount(0);
  await settle(page);
}

async function route(page: Page, extensionId: string, section: SettingsSectionId, view?: string) {
  const url = new URL(`chrome-extension://${extensionId}/apps/extension/src/settings/index.html`);
  url.searchParams.set('section', section);
  if (view) url.searchParams.set('view', view);
  await page.goto(url.href);
  await contentReady(page);
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await settle(page);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function assertFit(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
  const content = ui(page, 'settings.page.content-scroll');
  expect(await content.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
    1
  );
  await expect(ui(page, 'settings.sidebar.footer')).toBeInViewport({ ratio: 1 });
  const roles = await content
    .locator('.sniptale-parameter-name:visible, .sniptale-parameter-row:visible')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return {
          name: node.classList.contains('sniptale-parameter-name'),
          size: style.fontSize,
          lineHeight: style.lineHeight,
          weight: style.fontWeight,
          family: style.fontFamily,
          height: node.getBoundingClientRect().height,
        };
      })
    );
  for (const role of roles) {
    if (role.name) {
      expect(role.family).toContain('Sniptale Interface');
      expect(role.size).toBe('13px');
      expect(role.lineHeight).toBe('18px');
      expect(role.weight).toBe('400');
    } else expect(role.height).toBeGreaterThanOrEqual(31.5);
  }
  for (const caption of await page
    .locator(
      '[data-command-caption]:visible, ' +
        'button[data-ui="shared.ui.content-toolbar-button"] > ' +
        '.sniptale-command-content:visible'
    )
    .all()) {
    const fit = await caption.evaluate((node) => {
      const parent = node.closest('button');
      if (!parent) throw new Error('Command content must have a button owner.');
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const bounds = [];
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent?.trim() || text.parentElement?.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        bounds.push(
          ...Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height)
        );
      }
      if (!bounds.length) return null;
      const b = parent.getBoundingClientRect();
      return {
        text: parent.textContent,
        left: Math.min(...bounds.map((rect) => rect.left)),
        right: Math.max(...bounds.map((rect) => rect.right)),
        parentLeft: b.left,
        parentRight: b.right,
      };
    });
    if (!fit) continue;
    expect(
      fit.left,
      `${fit.text}: command content must remain inside its button`
    ).toBeGreaterThanOrEqual(fit.parentLeft - 1);
    expect(
      fit.right,
      `${fit.text}: command content must remain inside its button`
    ).toBeLessThanOrEqual(fit.parentRight + 1);
  }
}

async function interfaceRowRhythm(page: Page, info: TestInfo) {
  const rows = ui(page, 'settings.page.content-scroll').locator('.sniptale-parameter-row');
  const geometry = await rows.evaluateAll((nodes) =>
    nodes.slice(0, 3).map((node) => ({
      height: node.getBoundingClientRect().height,
      labelTop: node.querySelector('.sniptale-parameter-name')!.getBoundingClientRect().top,
    }))
  );
  expect(geometry).toHaveLength(3);
  for (const row of geometry)
    expect
      .soft(Math.abs(row.height - 40), 'One-line Interface row height must be 40px')
      .toBeLessThanOrEqual(1);
  for (let index = 1; index < geometry.length; index++) {
    expect
      .soft(
        Math.abs(geometry[index]!.labelTop - geometry[index - 1]!.labelTop - 44),
        'Interface label pitch must be 44px'
      )
      .toBeLessThanOrEqual(1);
  }
  const language = page.locator('#settings-interface-language');
  const languageRow = ui(page, 'settings.control-row').filter({ has: language });
  await languageRow.locator('.sniptale-parameter-name').click();
  await expect(
    page.getByRole('listbox'),
    'A parameter name must not open its dropdown'
  ).toHaveCount(0);
  await language.click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  await settle(page);
  const menuStyle = await menu.evaluate((node) => {
    const style = getComputedStyle(node);
    return { fontSize: style.fontSize, radius: style.borderRadius };
  });
  expect.soft(menuStyle.fontSize).toBe('13px');
  expect.soft(menuStyle.radius).toBe('4px');
  const options = await menu.getByRole('option').evaluateAll((nodes) =>
    nodes.map((node) => ({
      height: node.getBoundingClientRect().height,
      fontSize: getComputedStyle(node).fontSize,
    }))
  );
  expect(options).toHaveLength(2);
  for (const option of options) {
    expect.soft(option.height).toBeGreaterThanOrEqual(35.5);
    expect.soft(option.fontSize).toBe('13px');
  }
  await writeFile(
    info.outputPath('interface-row-menu-geometry.json'),
    JSON.stringify({ geometry, menuStyle, options }, null, 2)
  );
  await screenshot(page, info, 'interface-language-menu');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(language).toBeFocused();
}

async function neutralThemeChoice(page: Page, locale: Locale, info: TestInfo) {
  const themes = page.getByRole('group', {
    name: translate('settings.appearance.themeModeLabel', locale),
    exact: true,
  });
  const selected = themes.locator('button[aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  await expect(
    selected,
    'An ordinary selected property must have no persistent inset shadow'
  ).toHaveCSS('box-shadow', 'none');
  await selected.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(selected).toBeFocused();
  const focus = await selected.evaluate((node) => {
    const style = getComputedStyle(node);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(focus.style).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(2);
  await screenshot(page, info, 'theme-keyboard-focus');
}

async function verifyThemeActivation(page: Page, locale: Locale, initial: Theme) {
  const group = page.getByRole('group', {
    name: translate('settings.appearance.themeModeLabel', locale),
    exact: true,
  });
  for (const choice of ['system', 'dark', 'light'] as const) {
    const button = group.getByRole('button', {
      name: translate(`settings.appearance.${choice}Option`, locale),
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale-theme-preference'))[
              'sniptale-theme-preference'
            ]
        )
      )
      .toBe(choice);
  }
  const dark = group.getByRole('button', {
    name: translate('settings.appearance.darkOption', locale),
    exact: true,
  });
  const box = (await dark.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(dark).toHaveAttribute('aria-pressed', 'false');
  await dark.focus();
  await page.keyboard.press('Space');
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await group
    .getByRole('button', {
      name: translate(`settings.appearance.${initial}Option`, locale),
      exact: true,
    })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial);
}

async function interfaceChoice(page: Page, locale: Locale) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const startup = page.getByRole('button', {
    name: t('settings.appearance.popupStartupAriaLabel'),
    exact: true,
  });
  await startup.click();
  const menu = page.getByRole('option', {
    name: t('settings.appearance.popupStartupOptions.menu'),
    exact: true,
  });
  await menu.click();
  await expect(startup).toContainText(t('settings.appearance.popupStartupOptions.menu'));
  await expect(startup).toBeFocused();
  await page.reload();
  await expect(startup).toContainText(t('settings.appearance.popupStartupOptions.menu'));
}

async function paletteFlow(page: Page, locale: Locale, info: TestInfo) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const anchor = ui(page, 'settings.sidebar').getByRole('button').first();
  await anchor.focus();
  await page.keyboard.press('Control+k');
  const palette = ui(page, 'settings.command-palette');
  const query = palette.getByRole('textbox');
  await expect(query).toBeFocused();
  await query.fill('unlikely-setting-no-match');
  await expect(palette.getByRole('option')).toHaveCount(0);
  await palette.locator('.sniptale-field-clear').click();
  await expect(query).toHaveValue('');
  await expect(query).toBeFocused();
  await expect(palette.getByRole('option')).toHaveCount(16);
  await query.fill(t('settings.navigation.aiConnections'));
  await expect(palette.getByRole('option')).toHaveCount(1);
  await screenshot(page, info, 'palette-search');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await query.fill(t('settings.navigation.aiConnections'));
  await query.press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(page).toHaveURL(/section=ai-connections/);
  await contentReady(page);
}

async function providerAndModelFlow(
  page: Page,
  locale: Locale,
  hostOrigin: string,
  info: TestInfo
) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const providers = page.getByRole('region', {
    name: t('settings.aiProviders.providersTitle'),
    exact: true,
  });
  const addProvider = providers.getByRole('button', { name: t('common.actions.add'), exact: true });
  await addProvider.click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: t('common.actions.add'), exact: true });
  await submit.click();
  await expect.poll(() => dialog.locator('.sniptale-input-error').count()).toBeGreaterThan(0);
  const name = `Settings design ${randomUUID()}`;
  await dialog.locator('input').nth(0).fill(name);
  await dialog.locator('input').nth(1).fill(`${hostOrigin}/v1`);
  await dialog.locator('input[type="password"]').fill('synthetic-design-proof-no-network');
  const cancel = dialog.getByRole('button', { name: t('common.actions.cancel'), exact: true });
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  await screenshot(page, info, 'provider-draft');
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(providers).not.toContainText(name);
  await addProvider.click();
  await expect(dialog.locator('input').first()).toHaveValue('');
  await dialog.locator('input').nth(0).fill(name);
  await dialog.locator('input').nth(1).fill(`${hostOrigin}/v1`);
  await dialog.locator('input[type="password"]').fill('synthetic-design-proof-no-network');
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport({ ratio: 1 });
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await expect(providers).toContainText(name);
  await page.reload();
  await expect(providers).toContainText(name);
  const models = page.getByRole('region', {
    name: t('settings.aiProviders.modelsTitle'),
    exact: true,
  });
  await models.getByRole('button', { name: t('common.actions.add'), exact: true }).click();
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  await expect.poll(() => dialog.locator('.sniptale-input-error').count()).toBeGreaterThan(0);
  await dialog
    .getByRole('button', { name: t('settings.aiProviders.modelProviderPlaceholder'), exact: true })
    .click();
  await page.getByRole('option', { name, exact: true }).click();
  const modelName = dialog.getByPlaceholder(t('settings.aiProviders.modelNamePlaceholder'), {
    exact: true,
  });
  await modelName.fill('Cancelled model draft');
  await dialog
    .getByPlaceholder(t('settings.aiProviders.modelCodePlaceholder'), { exact: true })
    .fill('synthetic-model');
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  await screenshot(page, info, 'model-draft');
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(models).not.toContainText('Cancelled model draft');
}

async function authoredPreviewBoundary(page: Page, extensionId: string, info: TestInfo) {
  await route(page, extensionId, 'annotations', 'numbering');
  const preview = page.locator('.sniptale-settings-preview > span > span > span').first();
  await expect(preview).toBeAttached();
  const read = () =>
    preview.evaluate((node) => {
      const s = getComputedStyle(node);
      return {
        family: s.fontFamily,
        size: s.fontSize,
        weight: s.fontWeight,
        lineHeight: s.lineHeight,
      };
    });
  const before = await read();
  expect(before.family).toContain('Sniptale Text');
  await expect(preview).toHaveText(/\S/);
  const shell = ui(page, 'settings.page.root');
  const interfaceNode = ui(page, 'settings.sidebar').getByRole('button').first();
  const interfaceBefore = await interfaceNode.evaluate((node) => getComputedStyle(node).fontFamily);
  await shell.evaluate((node: HTMLElement) =>
    node.style.setProperty('--sniptale-font-interface', 'monospace')
  );
  await expect(interfaceNode).not.toHaveCSS('font-family', interfaceBefore);
  expect(await read()).toEqual(before);
  await shell.evaluate((node: HTMLElement) =>
    node.style.removeProperty('--sniptale-font-interface')
  );
  await screenshot(page, info, 'authored-numbering-preview');
}

async function settingsRailMarker(page: Page) {
  const marker = ui(page, 'settings.sidebar.active-marker');
  const current = ui(page, 'settings.sidebar.nav-list').locator('[aria-current="page"]');
  await settle(page);
  await expect(marker).toBeVisible();
  expect(await marker.evaluate((node) => node.closest('.sniptale-command-content'))).toBeNull();
  const before = (await marker.boundingBox())!;
  const target = (await current.boundingBox())!;
  expect(Math.abs(before.y + before.height / 2 - target.y - target.height / 2)).toBeLessThanOrEqual(
    0.5
  );
  await current.hover();
  await page.mouse.down();
  const pressed = (await marker.boundingBox())!;
  expect(pressed).toEqual(before);
  await page.mouse.up();
}

async function settingsReorderPreview(page: Page, locale: Locale, info: TestInfo) {
  const root = page.locator('[data-settings-collection-root]').first();
  const rows = root.locator('[data-settings-collection-item]');
  const ids = () =>
    rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-settings-collection-item'))
    );
  const before = await ids();
  expect(before.length).toBeGreaterThan(2);
  const handle = rows.first().getByRole('button', {
    name: translate('settings.collection.dragHandle', locale),
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const origin = (await handle.boundingBox())!;
  const destination = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2, destination.y + destination.height - 4, {
    steps: 5,
  });
  await expect.poll(ids).toEqual([before[1], before[0], ...before.slice(2)]);
  await settle(page);
  const boxes = await rows.evaluateAll((nodes) =>
    nodes.slice(0, 3).map((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    })
  );
  for (let index = 1; index < boxes.length; index++)
    expect(boxes[index]!.top).toBeGreaterThanOrEqual(boxes[index - 1]!.bottom - 0.5);
  await screenshot(page, info, 'collection-live-reorder');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(ids).toEqual(before);
}

async function voiceTestField(page: Page, locale: Locale, info: TestInfo) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const heading = page.getByRole('heading', {
    name: t('settings.voiceInput.testTitle'),
    exact: true,
  });
  const field = page.getByRole('textbox', {
    name: t('settings.voiceInput.textareaLabel'),
    exact: true,
  });
  await field.scrollIntoViewIfNeeded();
  await expect.soft(heading).toHaveCSS('font-size', '14px', { timeout: 100 });
  await expect.soft(heading).toHaveCSS('font-weight', '500', { timeout: 100 });
  const label = page.getByText(t('settings.voiceInput.textareaLabel'), { exact: true });
  await expect.soft(label).toHaveCSS('font-size', '13px', { timeout: 100 });
  await expect.soft(label).toHaveCSS('font-weight', '400', { timeout: 100 });
  await expect.soft(field).toHaveCSS('border-radius', '4px', { timeout: 100 });
  await expect.soft(field).toHaveCSS('line-height', '20px', { timeout: 100 });
  await expect.soft(field).toHaveCSS('font-weight', '400', { timeout: 100 });
  await expect(field).toHaveCSS('font-family', /Sniptale Text/);
  const placeholder = () =>
    field.evaluate((node) => {
      const style = getComputedStyle(node, '::placeholder');
      return { color: style.color, opacity: style.opacity };
    });
  const color = await field.evaluate((node) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sniptale-color-text-dim)';
    node.parentElement!.append(probe);
    const result = getComputedStyle(probe).color;
    probe.remove();
    return result;
  });
  await field.hover();
  expect.soft(await placeholder()).toEqual({ color, opacity: '0.72' });
  await field.click();
  expect((await placeholder()).opacity).toBe('0');
  await field.fill('Текст проверки микрофона');
  await expect(field).toHaveValue('Текст проверки микрофона');
  const diagnostics = page
    .locator('summary')
    .filter({ hasText: t('settings.voiceInput.diagnosticsTitle') });
  await diagnostics.click();
  await expect(page.getByText(t('settings.voiceInput.apiStatus'), { exact: true })).toBeVisible();
  await expect(field).toHaveValue('Текст проверки микрофона');
  await screenshot(page, info, 'voice-diagnostics');
  await diagnostics.click();
  await field.fill('');
  await field.blur();
  expect.soft(await placeholder()).toEqual({ color, opacity: '0.72' });
  await screenshot(page, info, 'voice-test-field');
}

for (const theme of ['light', 'dark'] as const)
  for (const size of [
    { width: 1280, height: 560 },
    { width: 1920, height: 900 },
  ]) {
    test(`native voice test field ${theme} ${size.width}`, async ({ page, extensionId }, info) => {
      await page.setViewportSize(size);
      await configure(page, extensionId, 'ru', theme);
      await route(page, extensionId, 'voice-input');
      await voiceTestField(page, 'ru', info);
    });
  }

for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      test(`native settings design ${locale} ${theme} ${size.width}x${size.height}`, async ({
        page,
        extensionId,
        hostOrigin,
      }, info) => {
        test.setTimeout(120_000);
        await page.setViewportSize(size);
        await configure(page, extensionId, locale, theme);
        await interfaceRowRhythm(page, info);
        await neutralThemeChoice(page, locale, info);
        await verifyThemeActivation(page, locale, theme);
        await expect(ui(page, 'settings.page.root')).toHaveCSS('font-size', '13px');
        await expect(ui(page, 'settings.page.root')).toHaveCSS('line-height', '18px');
        await expect(ui(page, 'settings.page.root')).toHaveCSS('font-weight', '400');
        await interfaceChoice(page, locale);
        const nav = ui(page, 'settings.sidebar.nav-list');
        await expect(nav.getByRole('button')).toHaveCount(16);
        for (const [index, section] of SETTINGS_SECTION_IDS.entries()) {
          const button = nav.getByRole('button').nth(index);
          await button.scrollIntoViewIfNeeded();
          await button.click();
          await expect(button).toHaveAttribute('aria-current', 'page');
          await expect(page).toHaveURL((url) => url.searchParams.get('section') === section);
          await contentReady(page);
          await settingsRailMarker(page);
          const collection = ui(page, 'settings.page.content-scroll')
            .locator('section')
            .filter({
              has: page.locator('[data-settings-collection-root]'),
            })
            .last();
          if (await collection.count())
            expect((await collection.boundingBox())!.width).toBeLessThanOrEqual(960.5);
          if (section === 'quick-actions') await settingsReorderPreview(page, locale, info);
          await assertFit(page);
          await screenshot(page, info, `route-${section}`);
        }
        await paletteFlow(page, locale, info);
        await providerAndModelFlow(page, locale, hostOrigin, info);
        await authoredPreviewBoundary(page, extensionId, info);
      });
    }

test('native settings subpages retain content scroll and browser navigation', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 560 });
  await configure(page, extensionId, 'ru', 'light');
  for (const section of SETTINGS_SECTION_IDS) {
    const views = SETTINGS_SECTION_VIEWS[section];
    if (!views.length) continue;
    await route(page, extensionId, section, views[0]);
    const railMarker = ui(page, 'settings.sidebar.active-marker');
    await expect(railMarker).toBeVisible();
    expect(await railMarker.evaluate((node) => node.closest('button'))).toBeNull();
    const tabs = ui(page, 'settings.subpage-tabs').first();
    if (section === 'native-app' && (await tabs.count()) === 0) {
      const enable = page.getByRole('button', {
        name: translate('settings.nativeApp.permissionEnable', 'ru'),
        exact: true,
      });
      for (const view of views) {
        await route(page, extensionId, section, view);
        await expect(enable).toBeEnabled();
        await screenshot(page, info, `subpage-${section}-${view}-permission-gate`);
      }
      continue;
    }
    for (const [index, view] of views.entries()) {
      const button = tabs.getByRole('button').nth(index);
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(page).toHaveURL((url) => url.searchParams.get('view') === view);
      await contentReady(page);
      await assertFit(page);
      await screenshot(page, info, `subpage-${section}-${view}`);
    }
  }
  await route(page, extensionId, 'interface-browser', 'interface');
  const tabs = ui(page, 'settings.subpage-tabs');
  await tabs.getByRole('button').nth(1).click();
  await expect(page).toHaveURL(/view=context-menu/);
  await page.goBack();
  await expect(page).toHaveURL(/view=interface/);
  await page.goForward();
  await expect(page).toHaveURL(/view=context-menu/);
});

test('native settings responsive layouts retain scroll controls and horizontal bounds', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await configure(page, extensionId, 'en', 'dark');
  const geometry = [];
  for (const width of [1441, 1440, 1439, 1281, 1280, 1279, 1100]) {
    await page.setViewportSize({ width, height: 560 });
    await settle(page);
    await assertFit(page);
    const viewport = page.locator('.sniptale-settings-viewport');
    if (width < 1280) {
      expect(
        await viewport.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeGreaterThan(0);
      await viewport.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
      });
      expect(await viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await screenshot(page, info, `responsive-${width}-scrolled-right`);
      await viewport.evaluate((node) => {
        node.scrollLeft = 0;
      });
    }
    geometry.push(
      await ui(page, 'settings.page.layout').evaluate((node) => ({
        viewport: innerWidth,
        columns: getComputedStyle(node).gridTemplateColumns,
        width: node.getBoundingClientRect().width,
      }))
    );
    await screenshot(page, info, `responsive-${width}`);
  }
  await writeFile(info.outputPath('responsive-geometry.json'), JSON.stringify(geometry, null, 2));
});

test('native AI unlock utility remains usable at its supported popup size', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 440, height: 420 });
  await configure(page, extensionId, 'en', 'light');
  const url = new URL(`chrome-extension://${extensionId}/apps/extension/src/settings/index.html`);
  url.searchParams.set('aiUnlock', '1');
  url.searchParams.set('requestId', `synthetic-layout-proof-${randomUUID()}`);
  await page.goto(url.href);
  await expect(ui(page, 'settings.ai-unlock.root')).toBeVisible();
  const dialog = page.getByRole('dialog');
  const passphrase = dialog.locator('input[type="password"]');
  await expect(passphrase).toBeVisible();
  await expect(passphrase).toBeEnabled();
  await passphrase.fill('synthetic-layout-only');
  await expect(passphrase).toHaveAttribute('type', 'password');
  const cancel = dialog.getByRole('button', {
    name: translate('common.actions.cancel', 'en'),
    exact: true,
  });
  await passphrase.press('Tab');
  await expect(cancel).toBeFocused();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  await expect(
    dialog.getByRole('button', {
      name: translate('settings.aiProviders.secretProtectionUnlockAction', 'en'),
      exact: true,
    })
  ).toBeInViewport({ ratio: 1 });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(440);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(420);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
  await screenshot(page, info, 'ai-unlock-440x420');
});

async function transferChoices(page: Page, extensionId: string, info: TestInfo) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await route(page, extensionId, 'settings-transfer');
  const choices = page.getByRole('group', {
    name: t('settings.settingsTransfer.exportKindLabel'),
    exact: true,
  });
  const complete = choices.getByRole('button', {
    name: t('settings.settingsTransfer.completeBackup'),
    exact: true,
  });
  const selective = choices.getByRole('button', {
    name: t('settings.settingsTransfer.selectivePackage'),
    exact: true,
  });
  await expect(complete).toHaveAttribute('aria-pressed', 'true');
  await expect(complete).toHaveCSS('font-size', '13px');
  await expect(complete).toHaveCSS('line-height', '18px');
  await expect(complete).toHaveCSS('font-weight', '400');
  await expect(complete).toHaveCSS('box-shadow', 'none');
  await expect(complete).toHaveCSS('border-top-width', '0px');
  await selective.click();
  await expect(selective).toHaveAttribute('aria-pressed', 'true');
  await expect(complete).toHaveAttribute('aria-pressed', 'false');
  const tree = page.getByRole('tree', {
    name: t('settings.settingsTransfer.treeLabel'),
    exact: true,
  });
  await expect(tree).toBeVisible();
  await screenshot(page, info, 'transfer-selective-choice');
  await complete.click();
  await expect(complete).toHaveAttribute('aria-pressed', 'true');
  await expect(tree).toHaveCount(0);
}

async function clearPresetName(page: Page, fieldLabel: string, value: string) {
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('textbox', { name: fieldLabel, exact: true });
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
  const clear = dialog.getByRole('button', {
    name: translate('shared.ui.clearField', 'en').replace('{field}', fieldLabel),
    exact: true,
  });
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(clear).toHaveCount(0);
  return input;
}

async function cancelPreset(page: Page, info: TestInfo, name: string) {
  const dialog = page.getByRole('dialog');
  const surfaces = ui(page, 'shared.highlighter-manual-inspector-surface');
  for (const surface of await surfaces.all())
    await expect(surface).toHaveCSS('border-radius', '4px');
  for (const label of await dialog.locator('.sniptale-parameter-name:visible').all()) {
    await expect(label).toHaveCSS('font-family', /Sniptale Interface/);
    await expect(label).toHaveCSS('font-size', '13px');
    await expect(label).toHaveCSS('line-height', '18px');
    await expect(label).toHaveCSS('font-weight', '400');
  }
  const cancel = dialog.getByRole('button', {
    name: translate('common.actions.cancel', 'en'),
    exact: true,
  });
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(560);
  await screenshot(page, info, name);
  await cancel.click();
  await expect(dialog).toHaveCount(0);
}

async function alignmentProperty(page: Page, info: TestInfo) {
  const group = ui(page, 'shared.callout-alignment');
  const selected = group.locator('.sniptale-glass-bold-button--active');
  await expect(selected).toHaveCount(1);
  const previousLabel = await selected.getAttribute('aria-label');
  const target = group.getByRole('button', {
    name: translate('content.callout.alignRight', 'en'),
    exact: true,
  });
  const expected = await group.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sniptale-color-text-primary)';
    probe.style.backgroundColor = 'var(--sniptale-color-surface-hover)';
    element.append(probe);
    const style = getComputedStyle(probe);
    const result = { color: style.color, background: style.backgroundColor };
    probe.remove();
    return result;
  });
  await page.mouse.move(10, 10);
  await expect.soft(selected).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect.soft(selected).toHaveCSS('color', expected.color);
  await expect.soft(selected).toHaveCSS('background-color', expected.background);
  await expect.soft(target).toHaveAttribute('data-command-press', '');
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect.soft(target).toHaveAttribute('data-pressing', 'true');
    await expect(selected).toHaveAttribute('aria-label', previousLabel!);
  } finally {
    await page.mouse.up();
  }
  await expect(target).toHaveClass(/sniptale-glass-bold-button--active/);
  await expect(target).not.toHaveAttribute('data-pressing', 'true');
  await page.mouse.move(10, 10);
  await screenshot(page, info, 'callout-alignment-property');
}

test('native settings preset drafts clear names and cancel without changing their catalogs', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 560 });
  await configure(page, extensionId, 'en', 'light');
  await transferChoices(page, extensionId, info);
  for (const preset of [
    { view: 'borders', add: 'highlighter.section.addButton', name: 'highlighter.editor.nameLabel' },
    {
      view: 'callouts',
      add: 'highlighter.calloutPresets.add',
      name: 'highlighter.calloutPresets.editor.name',
    },
    {
      view: 'numbering',
      add: 'highlighter.stepBadgePresets.add',
      name: 'highlighter.stepBadgePresets.editor.name',
    },
  ] as const) {
    const t = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    await route(page, extensionId, 'annotations', preset.view);
    const rows = page.locator('[data-settings-collection-item]');
    await expect.poll(() => rows.count()).toBeGreaterThan(0);
    const catalog = () =>
      rows.evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute('data-settings-collection-item'),
          title: node.querySelector('.truncate[title]')?.getAttribute('title'),
        }))
      );
    const before = await catalog();
    await page.getByRole('button', { name: t(preset.add), exact: true }).click();
    const createName = await clearPresetName(
      page,
      t(preset.name),
      'A deliberately long editable template name for this draft'
    );
    await createName.fill(`Cancelled create draft ${preset.view}`);
    if (preset.view === 'callouts') await alignmentProperty(page, info);
    await screenshot(page, info, `preset-${preset.view}-create-name`);
    await cancelPreset(page, info, `preset-${preset.view}-create-footer`);
    expect(await catalog()).toEqual(before);
    const edit = rows
      .first()
      .getByRole('button', { name: t('settings.collection.actions.edit'), exact: true });
    await edit.click();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByRole('textbox', { name: t(preset.name), exact: true });
    await expect(name).not.toHaveValue('');
    const storedName = await name.inputValue();
    const editedName = await clearPresetName(page, t(preset.name), `${storedName} draft`);
    await expect(
      dialog.getByRole('button', { name: t('common.actions.save'), exact: true })
    ).toBeDisabled();
    await editedName.fill(`Cancelled edit draft ${preset.view}`);
    if (preset.view === 'callouts') {
      await dialog
        .getByRole('navigation')
        .getByRole('button', { name: t('content.callout.manualTitle'), exact: true })
        .click();
      const titleLabel = t('content.callout.titleTextLabel');
      const titleInput = dialog.getByRole('textbox', { name: titleLabel, exact: true });
      if ((await titleInput.count()) === 0)
        await dialog.getByLabel(t('content.callout.titleToggle'), { exact: true }).click();
      await clearPresetName(page, titleLabel, 'Cancelled callout title draft');
    }
    await cancelPreset(page, info, `preset-${preset.view}-edit-footer`);
    expect(await catalog()).toEqual(before);
    await edit.click();
    await expect(dialog.getByRole('textbox', { name: t(preset.name), exact: true })).toHaveValue(
      storedName
    );
    await cancelPreset(page, info, `preset-${preset.view}-retained-name`);
    await page.reload();
    await contentReady(page);
    expect(await catalog()).toEqual(before);
  }
});

test('native settings resource create forms clear names and cancel without catalog changes', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 560 });
  await configure(page, extensionId, 'en', 'light');
  const t = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  for (const resource of [
    {
      section: 'annotations',
      view: 'tags',
      add: 'highlighter.templateTags.add',
      name: 'highlighter.templateTags.name',
      save: 'highlighter.templateTags.add',
    },
    {
      section: 'editor-resources',
      view: 'gradients',
      add: 'settings.editor.gradients.add',
      name: 'settings.editor.presetName',
      save: 'common.actions.save',
    },
    {
      section: 'editor-resources',
      view: 'surfaces',
      add: 'settings.editor.surfaceStyles.add',
      name: 'settings.editor.presetName',
      save: 'common.actions.save',
    },
  ] as const) {
    await route(page, extensionId, resource.section, resource.view);
    const add = page.getByRole('button', { name: t(resource.add), exact: true });
    await expect(add).toBeEnabled();
    const catalog = () =>
      page.locator('[data-settings-collection-item]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute('data-settings-collection-item'),
          title: node.querySelector('.truncate[title]')?.getAttribute('title'),
        }))
      );
    await settle(page);
    const before = await catalog();
    await add.click();
    const name = await clearPresetName(page, t(resource.name), `Cancelled ${resource.view} draft`);
    const dialog = page.getByRole('dialog');
    for (const field of await dialog.locator('.sniptale-input, .sniptale-textarea').all()) {
      await expect(field, 'Ordinary fields retain the shared control radius in portals').toHaveCSS(
        'border-radius',
        '4px'
      );
    }
    const save = dialog.getByRole('button', { name: t(resource.save), exact: true });
    await expect(save).toBeDisabled();
    await expect(name).toBeFocused();
    await cancelPreset(page, info, `resource-${resource.view}-cleared-name`);
    expect(await catalog()).toEqual(before);
    await add.click();
    await expect(dialog.getByRole('textbox', { name: t(resource.name), exact: true })).toHaveValue(
      ''
    );
    await expect(save).toBeDisabled();
    await cancelPreset(page, info, `resource-${resource.view}-reopened-create`);
    expect(await catalog()).toEqual(before);
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`native settings navigation and collection roles ${theme}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await configure(page, extensionId, 'en', theme);
    const tabs = ui(page, 'settings.subpage-tabs').first();
    const active = tabs.locator('button[aria-current="page"]');
    const marker = await active.evaluate((node) => {
      const style = getComputedStyle(node, '::after');
      return { content: style.content, display: style.display, height: style.height };
    });
    expect.soft(marker.display, 'The selected route line must be painted').not.toBe('none');
    expect.soft(marker.content).not.toBe('none');
    expect.soft(marker.height).toBe('2px');
    await expect.soft(active).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 500 });
    await active.hover();
    await expect.soft(active).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 500 });
    await route(page, extensionId, 'screen-sizes');
    const row = page.locator('[data-settings-collection-item]').first();
    const title = row.locator('div[title]').first();
    const metadata = row.locator(':scope > div.min-w-0 > div').nth(1);
    await expect(metadata).toBeVisible();
    await expect.soft(title).toHaveCSS('font-weight', '400', { timeout: 500 });
    const contrast = await metadata.evaluate((node) => {
      const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
      const foreground = rgb(getComputedStyle(node).color);
      let owner: Element | null = node;
      let background: number[] = [];
      while (owner) {
        background = rgb(getComputedStyle(owner).backgroundColor);
        if (background.length === 3 || background[3] === 1) break;
        owner = owner.parentElement;
      }
      const luminance = (channels: number[]) =>
        channels.slice(0, 3).reduce((sum, channel, index) => {
          const value = channel / 255;
          const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
        }, 0);
      const a = luminance(foreground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect
      .soft(contrast, 'Meaningful row metadata must remain readable')
      .toBeGreaterThanOrEqual(4.5);
    await screenshot(page, info, 'collection-title-and-metadata');
  });
}

async function journalFilterLabels(page: Page) {
  const search = ui(page, 'settings.page.content-scroll').getByRole('textbox').first();
  const filters = search.locator('..').locator('..');
  const labels = await filters.evaluate((node) =>
    Array.from(node.children).map((field) => {
      const range = document.createRange();
      range.selectNodeContents(field.firstChild!);
      const rect = range.getBoundingClientRect();
      return { top: rect.top, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })
  );
  for (const label of labels.slice(1)) {
    await page.mouse.click(label.x, label.y);
    await expect(filters.locator('[aria-expanded="true"]')).toHaveCount(0);
  }
  expect(
    Math.max(...labels.map((label) => label.top)) - Math.min(...labels.map((label) => label.top))
  ).toBeLessThanOrEqual(1);
}

async function journalResizeBounds(page: Page, info: TestInfo) {
  for (const width of [1441, 1440, 1439, 1281, 1280, 1279, 1100]) {
    await page.setViewportSize({ width, height: 560 });
    await settle(page);
    const bounds = await ui(page, 'settings.events-log.table').evaluate((node) => ({
      table: node.getBoundingClientRect().width,
      owner: node.parentElement!.clientWidth,
      scroll: node.parentElement!.scrollWidth,
    }));
    expect(bounds.table).toBeLessThanOrEqual(Math.max(880, bounds.owner) + 1);
    expect(bounds.scroll).toBeLessThanOrEqual(Math.max(880, bounds.owner) + 1);
    const viewport = page.locator('.sniptale-settings-viewport');
    if (width < 1280) {
      await viewport.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
      });
      expect(await viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }
    await screenshot(page, info, `journal-responsive-${width}`);
  }
}

for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ])
      test(`native settings journal bounds ${locale} ${theme} ${size.width}`, async ({
        page,
        extensionId,
      }, info) => {
        await page.setViewportSize(size);
        await configure(page, extensionId, locale, theme);
        await page.evaluate(async () => {
          const time = new Date().toISOString();
          const entries = Array.from({ length: 24 }, (_, index) => ({
            schemaVersion: 1,
            time,
            lastTime: time,
            level: 'info',
            source: index === 1 ? 'diagnostic-source-'.repeat(6) : 'media-preview',
            context: index === 1 ? 'context-'.repeat(10) : 'extension-page',
            message: index === 1 ? 'LongDiagnosticValue'.repeat(45) : `Preview ready ${index + 1}`,
            repeats: 1,
            dropped: 0,
          }));
          await chrome.storage.local.set({
            sniptale_runtime_diagnostic_log: { version: 1, entries },
          });
        });
        await route(page, extensionId, 'events-logs');
        const table = ui(page, 'settings.events-log.table');
        const longRow = table.locator('tbody tr').filter({ hasText: 'LongDiagnosticValue' });
        await expect(longRow).toHaveCount(1);
        await longRow.scrollIntoViewIfNeeded();
        await screenshot(page, info, 'journal-long-values');
        await journalFilterLabels(page);
        const geometry = await table.evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          ownerWidth: node.parentElement!.clientWidth,
          ownerScrollWidth: node.parentElement!.scrollWidth,
          rowHeight: Array.from(node.querySelectorAll('tbody tr'))
            .find((row) => row.textContent?.includes('Preview ready'))!
            .getBoundingClientRect().height,
        }));
        await writeFile(
          info.outputPath('journal-geometry.json'),
          JSON.stringify(
            {
              ...geometry,
              text: await table.innerText(),
            },
            null,
            2
          )
        );
        const headerAlpha = await table.locator('thead').evaluate((node) => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d')!;
          context.fillStyle = getComputedStyle(node).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return context.getImageData(0, 0, 1, 1).data[3];
        });
        expect(headerAlpha).toBe(255);
        expect(geometry.rowHeight).toBeGreaterThanOrEqual(40);
        expect(geometry.rowHeight).toBeLessThanOrEqual(48);
        expect(geometry.width).toBeLessThanOrEqual(Math.max(880, geometry.ownerWidth) + 1);
        expect(geometry.ownerScrollWidth).toBeLessThanOrEqual(
          Math.max(880, geometry.ownerWidth) + 1
        );
        const search = ui(page, 'settings.page.content-scroll').getByRole('textbox').first();
        await search.fill('LongDiagnosticValue');
        await expect(table.locator('tbody tr')).toHaveCount(1);
        await expect(longRow).toBeVisible();
        const pendingDownload = page.waitForEvent('download');
        await page.getByRole('button', { name: /JSONL/u }).click();
        const download = await pendingDownload;
        const exported: unknown = JSON.parse(await readFile((await download.path())!, 'utf8'));
        expect(exported).toMatchObject({
          source: 'diagnostic-source-'.repeat(6),
          context: 'context-'.repeat(10),
        });
        await search.fill('');
        await expect(table.locator('tbody tr').filter({ hasText: 'Preview ready' })).toHaveCount(
          23
        );
        await ui(page, 'events.logs.rows').evaluate((node) => {
          node.scrollTop = 0;
        });
        await screenshot(page, info, 'journal-ordinary-values');
        if (locale === 'en' && theme === 'light' && size.width === 1280)
          await journalResizeBounds(page, info);
      });
