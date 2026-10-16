import { writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { openRealPopup, sendRuntimeMessage } from '../support/recording-action';

type Composition = { locale: AppLocale; theme: 'light' | 'dark' };
const sizes = [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
];
const templateName = 'Synthetic reference template';
const templateText = 'Summarize only the selected synthetic reference data.';
const providerName = 'Synthetic loopback provider';
const modelName = 'Synthetic local text model — long reference name';
const promptText =
  'Review the synthetic inventory. Preserve valid selected data and the editable draft.';
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
const tr = (c: Composition, key: TranslationKey) => translate(key, c.locale);
const modalRoot = (page: Page) => page.locator('.sniptale-ai-modal-root');
const named = (page: Page | Locator, c: Composition, key: TranslationKey) =>
  page.getByRole('button', { name: tr(c, key), exact: true });

test.use({ actionTimeout: 10_000 });
test.setTimeout(150_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('.sniptale-toast')).toHaveCount(0);
  await modalRoot(page).evaluate(async (modal) => {
    await modal.ownerDocument.fonts.ready;
    const animations = modal.getAnimations({ subtree: true });
    await Promise.allSettled(
      animations
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished)
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function configure(context: BrowserContext, extensionId: string, c: Composition) {
  const settings = await context.newPage();
  await settings.setViewportSize(sizes[0]!);
  try {
    await settings.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html` +
        '?section=interface-browser&view=interface'
    );
    const language = settings.locator('#settings-interface-language');
    await expect(language).toBeEnabled();
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe('string');
    await language.click();
    await settings
      .getByRole('option', {
        name: c.locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe(c.locale);
    await settings.evaluate(async (theme) => {
      await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
      localStorage.setItem('sniptale-theme-preference', theme);
    }, c.theme);
    await settings.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-prompts`
    );
    await named(settings, c, 'templates.section.addButton').click();
    await settings.locator('#template-name').fill(templateName);
    await settings.locator('#template-content').fill(templateText);
    await expect(settings.locator('#template-name')).toHaveValue(templateName);
    await expect(settings.locator('#template-content')).toHaveValue(templateText);
    await named(settings.getByRole('dialog'), c, 'common.actions.save').click();
    await expect(settings.getByRole('dialog')).toHaveCount(0);
    await expect(settings.getByText(templateName, { exact: true })).toBeVisible();
  } finally {
    await settings.close();
  }
}

async function admit(context: BrowserContext, extensionId: string, origin: string) {
  await context.route(`${origin}/`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
    <html><head><title>Synthetic content AI reference</title></head><body>
    <main style="max-width:850px;margin:32px;font:18px/28px Georgia,serif;color:#24364b">
    <h1>Reference inventory</h1><p id="synthetic-paragraph">Selected reference paragraph contains apples and pears.</p>
    <table border="1" cellpadding="10"><thead><tr><th>Item</th><th>Quantity</th></tr></thead>
    <tbody><tr><td>Apples</td><td>12</td></tr><tr><td>Pears</td><td>8</td></tr></tbody></table>
    </main></body></html>`,
    })
  );
  const page = await context.newPage();
  await page.setViewportSize(sizes[0]!);
  await page.goto(origin);
  const popup = await openRealPopup(context, extensionId);
  await popup.evaluate((host) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant synthetic AI origin';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${host}/*`] })
      );
    };
    document.body.append(grant);
  }, origin);
  const grant = popup.getByRole('button', { name: 'Grant synthetic AI origin', exact: true });
  await grant.click();
  await expect(grant).toHaveAttribute('data-granted', 'true');
  const tabId = await popup.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    if (tab?.id === undefined) throw new Error('Synthetic AI source tab missing');
    return tab.id;
  }, page.url());
  await page.reload();
  expect(
    await sendRuntimeMessage(popup, {
      type: 'PAGE_ACCESS',
      operation: 'register-granted-site',
      tabId,
    })
  ).toMatchObject({ success: true, result: 'registered' });
  expect(
    await popup.evaluate(
      (id) =>
        chrome.tabs.sendMessage(id, {
          type: 'ENABLE_SCREENSHOT_MODE',
          workingMode: 'highlighter',
        }),
      tabId
    )
  ).toMatchObject({ success: true });
  await page.bringToFront();
  return { page, popup, tabId };
}

async function enter(page: Page) {
  await ui(page, 'content.toolbar.mode-selector-button').click();
  await ui(page, 'content.toolbar.mode-option.quick-edit').click();
  await ui(page, 'content.toolbar.page-editing-mode.ai').click();
  await page.locator('#synthetic-paragraph').click();
  await expect(modalRoot(page)).toBeVisible();
}

async function localProvider() {
  let received = 0;
  let mode: 'hold' | 'error' = 'hold';
  const pending = new Set<ServerResponse>();
  const failureBody = JSON.stringify({ error: { message: 'Synthetic local provider failure' } });
  const fail = (response: ServerResponse) => {
    if (response.destroyed) return;
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(failureBody);
  };
  const server = createServer((request, response) => {
    if (request.url !== '/v1/chat/completions' || request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    // Consume synthetic request bytes without recording bodies, headers, or credentials.
    request.resume();
    request.once('end', () => {
      received++;
      if (mode === 'error') fail(response);
      else pending.add(response);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback provider address missing');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    received: () => received,
    error: () => {
      mode = 'error';
    },
    release: async () => {
      await Promise.all(
        [...pending].map(
          (response) =>
            new Promise<void>((resolve) => {
              pending.delete(response);
              if (response.destroyed) return resolve();
              response.once('close', resolve);
              response.once('finish', resolve);
              fail(response);
            })
        )
      );
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

async function interfaceFont(target: Locator) {
  const role = await target.evaluate(async (node) => {
    await node.ownerDocument.fonts.ready;
    const probe = node.ownerDocument.createElement('span');
    probe.style.fontFamily = 'var(--sniptale-font-interface)';
    node.append(probe);
    const family = getComputedStyle(probe).fontFamily;
    probe.remove();
    return family;
  });
  await expect(target).toHaveCSS('font-family', role);
  expect(
    await target.evaluate((node, family) => {
      const alias = family.split(',')[0]!.replaceAll(/["']/gu, '').trim();
      return Array.from(node.ownerDocument.fonts).some(
        (face) => face.family.replaceAll(/["']/gu, '') === alias && face.status === 'loaded'
      );
    }, role)
  ).toBe(true);
}

async function inViewport(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Visible modal control has no bounds');
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
}

async function command(target: Locator) {
  await expect(target).toHaveCSS('height', '32px');
  await expect(target).toHaveCSS('border-radius', '4px');
  await expect(target).toHaveCSS('font-size', '13px');
  await expect(target).toHaveCSS('line-height', '18px');
  await expect(target).toHaveCSS('font-weight', '400');
}

async function geometry(page: Page, c: Composition) {
  const modal = modalRoot(page);
  const heading = modal.getByText(tr(c, 'aiModal.title'), { exact: true });
  await expect(heading).toHaveCSS('font-size', '14px');
  await expect(heading).toHaveCSS('line-height', '20px');
  await expect(heading).toHaveCSS('font-weight', '500');
  await expect(modal).toHaveCSS('border-radius', '8px');
  await interfaceFont(modal);
  await expect(modal.locator('.sniptale-ai-modal-context-info')).toHaveCSS('font-size', '12px');
  await expect(modal.locator('.sniptale-ai-modal-context-info')).toHaveCSS('line-height', '16px');
  await inViewport(page, modal);
  for (const key of [
    'aiModal.openModelSettings',
    'aiModal.openPromptTemplatesSettings',
    'aiModal.cancelButton',
  ] as const) {
    await command(named(modal, c, key));
    await inViewport(page, named(modal, c, key));
  }
}

async function templates(page: Page, c: Composition, info: TestInfo) {
  const template = ui(page, 'ai-modal.template-picker').getByRole('button', {
    name: tr(c, 'aiModal.templatesLabel'),
    exact: true,
  });
  await template.click();
  const options = page.getByRole('option');
  const menu = page.locator('.sniptale-ai-modal-template-menu');
  await expect(menu).toBeVisible();
  await interfaceFont(menu);
  await inViewport(page, menu);
  await expect(menu.locator('.sniptale-select-value-label-menu').first()).toHaveCSS(
    'font-size',
    '13px'
  );
  await expect(menu.locator('.sniptale-select-option-description').first()).toHaveCSS(
    'font-size',
    '12px'
  );
  await expect(menu.locator('.sniptale-select-option-description').first()).toHaveCSS(
    'line-height',
    '16px'
  );
  await capture(page, info, 'template-menu');
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(modalRoot(page)).toBeVisible();
  await expect(template).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modalRoot(page)).toHaveCount(0);
  await enter(page);
  await template.click();
  await page.getByRole('option', { name: new RegExp(templateName) }).click();
  await expect(page.locator('#ai-prompt')).toHaveValue(templateText);
  await page.locator('#ai-prompt').fill(promptText);
  await expect(named(modalRoot(page), c, 'aiModal.submitShortcutTitle')).toBeDisabled();
}

async function settingsFromModal(
  page: Page,
  context: BrowserContext,
  c: Composition,
  key: TranslationKey
) {
  const opened = context.waitForEvent('page');
  await named(modalRoot(page), c, key).click();
  return opened;
}

async function configureProvider(settings: Page, c: Composition, providerOrigin: string) {
  await expect(settings).toHaveURL(/section=ai-connections/u);
  await settings.evaluate((origin) => {
    const button = document.createElement('button');
    button.textContent = 'Grant synthetic loopback provider';
    button.style.cssText = 'position:fixed;right:8px;top:8px;z-index:2147483647';
    button.onclick = async () => {
      button.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${origin}/*`] })
      );
    };
    document.body.append(button);
  }, providerOrigin);
  const grant = settings.getByRole('button', {
    name: 'Grant synthetic loopback provider',
    exact: true,
  });
  await grant.click();
  await expect(grant).toHaveAttribute('data-granted', 'true');
  await grant.evaluate((node) => node.remove());
  const providers = settings.getByRole('region', {
    name: tr(c, 'settings.aiProviders.providersTitle'),
    exact: true,
  });
  await named(providers, c, 'common.actions.add').click();
  const dialog = settings.getByRole('dialog');
  await dialog.locator('input').nth(0).fill(providerName);
  await dialog.locator('input').nth(1).fill(`${providerOrigin}/v1`);
  await dialog.locator('input[type=password]').fill('synthetic-test-only-key');
  await named(dialog, c, 'common.actions.add').scrollIntoViewIfNeeded();
  await named(dialog, c, 'common.actions.add').click();
  await expect(dialog).toHaveCount(0);
  await expect(providers).toContainText(providerName);
  const models = settings.getByRole('region', {
    name: tr(c, 'settings.aiProviders.modelsTitle'),
    exact: true,
  });
  await named(models, c, 'common.actions.add').click();
  await named(dialog, c, 'settings.aiProviders.modelProviderPlaceholder').click();
  await settings.getByRole('option', { name: providerName, exact: true }).click();
  await dialog
    .getByPlaceholder(tr(c, 'settings.aiProviders.modelNamePlaceholder'), { exact: true })
    .fill(modelName);
  await dialog
    .getByPlaceholder(tr(c, 'settings.aiProviders.modelCodePlaceholder'), { exact: true })
    .fill('synthetic-text-model');
  await named(dialog, c, 'common.actions.add').scrollIntoViewIfNeeded();
  await named(dialog, c, 'common.actions.add').click();
  await expect(dialog).toHaveCount(0);
  await expect(models).toContainText(modelName);
}

async function models(
  page: Page,
  context: BrowserContext,
  c: Composition,
  origin: string,
  info: TestInfo
) {
  const settings = await settingsFromModal(page, context, c, 'aiModal.openModelSettings');
  await configureProvider(settings, c, origin);
  await settings.close();
  await page.bringToFront();
  await named(modalRoot(page), c, 'aiModal.closeTitle').click();
  await enter(page);
  await expect(page.locator('#ai-prompt')).toHaveValue(promptText);
  const trigger = page.locator('.sniptale-ai-model-selector-trigger');
  await trigger.click();
  const search = page.getByRole('textbox', {
    name: tr(c, 'aiModal.modelSearchPlaceholder'),
    exact: true,
  });
  await search.fill('unmatched-model-query');
  await expect(page.getByText(tr(c, 'aiModal.modelsNotFound'), { exact: true })).toBeVisible();
  await page
    .getByRole('button', {
      name: tr(c, 'shared.ui.clearField').replace(
        '{field}',
        tr(c, 'aiModal.modelSearchPlaceholder')
      ),
      exact: true,
    })
    .click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  const menu = modalRoot(page).locator('.sniptale-dropdown-menu');
  await expect(menu).toHaveCSS('border-radius', '4px');
  await expect(search).toHaveCSS('border-radius', '4px');
  const providerLabel = menu.getByText(providerName, { exact: true });
  await expect(providerLabel).toHaveCSS('font-size', '12px');
  await expect(providerLabel).toHaveCSS('line-height', '16px');
  await expect(providerLabel).toHaveCSS('text-transform', 'none');
  await capture(page, info, 'model-menu');
  const bounds = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(modalRoot(page)).toBeVisible();
  await page.keyboard.press('Tab');
  const settingsButton = named(modalRoot(page), c, 'aiModal.openModelSettings');
  await expect(settingsButton).toBeFocused();
  await expect(settingsButton).toHaveCSS('outline-width', '2px');
  await expect(settingsButton).toHaveCSS('outline-style', 'solid');
  await trigger.click();
  await page.getByRole('button', { name: modelName, exact: true }).click();
  await expect(trigger).toContainText(modelName);
  await expect(named(modalRoot(page), c, 'aiModal.submitShortcutTitle')).toBeEnabled();
}

async function dataControls(page: Page, c: Composition, info: TestInfo) {
  const modal = modalRoot(page);
  const spoiler = modal.locator('.sniptale-ai-spoiler-toggle');
  if ((await spoiler.getAttribute('aria-expanded')) !== 'true') await spoiler.click();
  const section = modal
    .locator('.sniptale-tree-row')
    .filter({ has: page.locator('.sniptale-expand-btn') })
    .first();
  const sectionBox = await section.boundingBox();
  expect(sectionBox?.height).toBeLessThanOrEqual(34);
  const treeCheck = section.locator('input[type="checkbox"]');
  await expect(treeCheck).toHaveCSS('width', '16px');
  await expect(treeCheck).toHaveCSS('height', '16px');
  const expandBox = await section.locator('.sniptale-expand-btn').boundingBox();
  expect(expandBox?.height).toBeLessThanOrEqual(24);

  const search = modal.getByRole('textbox', {
    name: tr(c, 'aiModal.searchDataLabel'),
    exact: true,
  });
  await search.fill('Apples');
  await expect(search).toHaveCSS('font-size', '13px');
  await expect(search).toHaveCSS('line-height', '18px');
  await expect(search).toHaveCSS('font-weight', '500');
  const clear = named(modal, c, 'aiModal.clearSearchLabel');
  await expect(clear).toHaveCSS('height', '24px');
  await expect(clear.locator('svg')).toHaveCSS('width', '13px');
  await capture(page, info, 'data-filter');
  await named(modal, c, 'aiModal.clearSearchLabel').click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  const selectedOnly = modal.locator('.sniptale-ai-data-selected-filter');
  await selectedOnly.click();
  await expect(selectedOnly).toHaveAttribute('aria-pressed', 'true');
  await selectedOnly.click();
  await expect(selectedOnly).toHaveAttribute('aria-pressed', 'false');
  const expand = modal.getByRole('button', { name: tr(c, 'aiModal.expandAllButton'), exact: true });
  if (await expand.count()) await expand.click();
  const checkbox = modal.locator('.sniptale-tree-row-field input[type=checkbox]').first();
  const checked = await checkbox.isChecked();
  await checkbox.setChecked(!checked);
  await checkbox.setChecked(checked);
  const jsonToggle = modal.locator('.sniptale-ai-data-preview-toggle');
  if ((await jsonToggle.getAttribute('aria-pressed')) !== 'true') await jsonToggle.click();
  const json = modal.locator('.sniptale-json-preview');
  await expect(json).toBeVisible();
  expect(await json.evaluate((node) => getComputedStyle(node).fontFamily)).toContain('monospace');
  await expect(json).toHaveCSS('user-select', 'text');
  const original = await json.innerText();
  expect(original).toContain('Selected reference paragraph');
  await named(modal, c, 'aiModal.copyButton').click();
  await expect(named(modal, c, 'aiModal.copied')).toBeVisible();
  const grip = json.locator('..').locator(':scope > .sniptale-resizer');
  await grip.scrollIntoViewIfNeeded();
  const before = await json.boundingBox();
  const handle = await grip.boundingBox();
  if (!before || !handle) throw new Error('Actual JSON resize target missing');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 24, { steps: 6 });
  await page.mouse.up();
  expect((await json.boundingBox())!.height).toBeLessThan(before.height - 8);
  await expect(json).toHaveText(original);
  return original;
}

async function waitingAndRecovery(
  page: Page,
  c: Composition,
  provider: Awaited<ReturnType<typeof localProvider>>,
  info: TestInfo
) {
  const modal = modalRoot(page);
  const prompt = page.locator('#ai-prompt');
  const json = modal.locator('.sniptale-json-preview');
  const selected = await json.innerText();
  const sourceText = await page.locator('#synthetic-paragraph').innerText();
  const submit = named(modal, c, 'aiModal.submitShortcutTitle');
  const before = provider.received();
  await submit.click();
  await expect.poll(provider.received).toBe(before + 1);
  await expect(ui(page, 'ai-modal.loading-state')).toBeVisible();
  await expect(prompt).toBeDisabled();
  const cancel = named(modal, c, 'aiModal.waitingCancelButton');
  await command(cancel);
  await inViewport(page, cancel);
  await capture(page, info, 'waiting-cancel');
  await cancel.click();
  await expect(ui(page, 'ai-modal.loading-state')).toHaveCount(0);
  await expect(prompt).toHaveValue(promptText);
  await expect(json).toHaveText(selected);
  await provider.release();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await expect(page.locator('.sniptale-toast-error')).toHaveCount(0);
  await expect(page.locator('#synthetic-paragraph')).toHaveText(sourceText);
  await expect(prompt).toHaveValue(promptText);
  provider.error();
  for (const attempt of [1, 2]) {
    const count = provider.received();
    await submit.click();
    await expect.poll(provider.received).toBeGreaterThan(count);
    await expect(page.locator('.sniptale-toast-error')).toBeVisible({ timeout: 20_000 });
    await expect(ui(page, 'ai-modal.loading-state')).toHaveCount(0);
    await expect(prompt).toHaveValue(promptText);
    await expect(json).toHaveText(selected);
    await expect(submit).toBeEnabled();
    await page.screenshot({
      path: info.outputPath(`provider-error-${attempt}.png`),
      fullPage: false,
    });
    await expect(page.locator('.sniptale-toast-error')).toHaveCount(0);
  }
  await named(modal, c, 'aiModal.cancelButton').click();
  await expect(modal).toHaveCount(0);
}

async function compositions(
  page: Page,
  popup: Page,
  tabId: number,
  c: Composition,
  info: TestInfo
) {
  for (const size of sizes) {
    await page.setViewportSize(size);
    await geometry(page, c);
    await inViewport(page, named(modalRoot(page), c, 'aiModal.submitShortcutTitle'));
    await capture(page, info, `data-json-${size.width}x${size.height}`);
  }
  if (c.locale === 'ru' && c.theme === 'dark') {
    await page.setViewportSize({ width: 960, height: 560 });
    await geometry(page, c);
    await capture(page, info, 'data-json-960x560');
    await popup.evaluate((id) => chrome.tabs.setZoom(id, 1.25), tabId);
    expect(await popup.evaluate((id) => chrome.tabs.getZoom(id), tabId)).toBe(1.25);
    await inViewport(page, named(modalRoot(page), c, 'aiModal.cancelButton'));
    await capture(page, info, 'browser-zoom-125');
    await popup.evaluate((id) => chrome.tabs.setZoom(id, 1), tabId);
  }
  await page.setViewportSize(sizes[0]!);
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const c = { locale, theme };
    test(`content AI ${locale} ${theme} native composition`, async ({}, info) => {
      const host = await startHostServer();
      const provider = await localProvider();
      let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
      let page: Page | undefined;
      try {
        launched = await launchExtensionBrowser({ viewport: sizes[0]! });
        launched.context.setDefaultTimeout(10_000);
        await configure(launched.context, launched.extensionId, c);
        const opened = await admit(launched.context, launched.extensionId, host.origin);
        page = opened.page;
        const authored = await page.locator('#synthetic-paragraph').evaluate((node) => {
          const css = getComputedStyle(node);
          return {
            family: css.fontFamily,
            size: css.fontSize,
            line: css.lineHeight,
            text: node.textContent,
          };
        });
        await enter(page);
        await capture(page, info, 'initial-modal');
        await geometry(page, c);
        await templates(page, c, info);
        await models(page, launched.context, c, provider.origin, info);
        await dataControls(page, c, info);
        await compositions(page, opened.popup, opened.tabId, c, info);
        if (locale === 'en' && theme === 'light') await waitingAndRecovery(page, c, provider, info);
        else await named(modalRoot(page), c, 'aiModal.cancelButton').click();
        expect(
          await page.locator('#synthetic-paragraph').evaluate((node) => {
            const css = getComputedStyle(node);
            return {
              family: css.fontFamily,
              size: css.fontSize,
              line: css.lineHeight,
              text: node.textContent,
            };
          })
        ).toEqual(authored);
      } catch (error) {
        if (page && !page.isClosed()) {
          await page.screenshot({ path: info.outputPath('failure-ui.png'), fullPage: false });
          await writeFile(
            info.outputPath('visible-state.json'),
            JSON.stringify(
              {
                modalVisible: await modalRoot(page).isVisible(),
                prompt: await page
                  .locator('#ai-prompt')
                  .inputValue()
                  .catch(() => null),
                requests: provider.received(),
              },
              null,
              2
            )
          );
        }
        throw error;
      } finally {
        if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
        await provider.close();
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
