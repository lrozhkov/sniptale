import { createServer } from 'node:http';
import type { BrowserContext, Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { expect, test, terminateExtensionServiceWorker } from '../support/extension-fixture';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import {
  CORRECTED_TRANSCRIPT,
  CORRECTION_PROMPT,
  RAW_TRANSCRIPT,
  TEXT_MODEL_NAME,
  withVoiceBrowser,
} from './voice-input-model.test-support';

const restore = '[data-ui="content.toolbar.history-restore-button"]';
async function activate(page: Page, popup: Page, mode = 'cursor', knownTabId?: number) {
  const target =
    knownTabId ??
    (await popup.evaluate(
      async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
      page.url()
    ));
  if (target === undefined) throw new Error('Recovery target tab is missing');
  const registered = await popup.evaluate(
    async (tabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      }),
    target
  );
  expect(registered).toMatchObject({ success: true });
  const result = await popup.evaluate(
    async ({ tabId, workingMode }) =>
      chrome.tabs.sendMessage(tabId, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode,
      }),
    { tabId: target, workingMode: mode }
  );
  expect(result).toMatchObject({ success: true });
  await page.bringToFront();
  await expect(page.locator('[data-ui="content.toolbar.mode-selector-button"]')).toBeVisible();
}
async function editTitle(page: Page, value: string, commit: boolean) {
  await mode(page, 'quick-edit');
  await page.locator('[data-ui="content.toolbar.page-editing-mode.block-selection"]').click();
  const title = page.getByTestId('host-page-title');
  const bounds = await title.boundingBox();
  if (!bounds) throw new Error('Page title is not visible');
  await page.mouse.click(bounds.x + 12, bounds.y + 12);
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await title.fill(value);
  if (commit) await title.press('Enter');
}
async function sourceContains(popup: Page, value: string) {
  return popup.evaluate(async (expected) => {
    const values = await chrome.storage.local.get('sniptale_page_recovery');
    return JSON.stringify(values).includes(expected);
  }, value);
}
for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`recovers the last pending page text after reload and explicitly clears it ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await editTitle(page, 'Recovered pending page title', false);
      await page.reload();
      await activate(page, popup);
      await expect(page.getByTestId('host-page-title')).toHaveText('Sniptale E2E Host');
      await expect(page.locator(restore)).toBeVisible();
      await page.screenshot({ path: info.outputPath('restore-available.png'), fullPage: false });
      await page.locator(restore).click();
      await expect(page.getByTestId('host-page-title')).toHaveText('Recovered pending page title');
      await expect(page.locator(restore)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('restored-text.png'), fullPage: false });
      await page.locator('[data-ui="content.toolbar.reset-all-button"]').click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: /^(Reset all|Сбросить всё)$/u }).click();
      await expect(page.getByTestId('host-page-title')).toHaveText('Sniptale E2E Host');
      await expect.poll(() => sourceContains(popup, 'Recovered pending page title')).toBe(false);
      await page.reload();
      await activate(page, popup);
      await expect(page.locator(restore)).toHaveCount(0);
      const hostStorage = await page.evaluate(() =>
        JSON.stringify([Object.values(sessionStorage), Object.values(localStorage)])
      );
      expect(hostStorage).not.toContain('Recovered pending page title');
      await page.setViewportSize({ width: 1000, height: size.height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
test('does not offer another tab the source set and explicit panel Close deletes it', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  test.setTimeout(120000);
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  let duplicate: Page | null = null;
  try {
    await editTitle(page, 'Source tab edits', true);
    await expect.poll(() => sourceContains(popup, 'Source tab edits')).toBe(true);
    const duplicatePage = context.waitForEvent('page');
    const duplicateId = await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      if (tab?.id === undefined) throw new Error('Original tab missing');
      return (await chrome.tabs.duplicate(tab.id)).id;
    }, page.url());
    duplicate = await duplicatePage;
    await duplicate.waitForLoadState();
    await activate(duplicate, popup, 'cursor', duplicateId);
    await expect(duplicate.locator(restore)).toHaveCount(0);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.screenshot({ path: info.outputPath('original-only-restore.png'), fullPage: false });
    await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
    await expect.poll(() => sourceContains(popup, 'Source tab edits')).toBe(false);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toHaveCount(0);
  } finally {
    await duplicate?.close();
    await popup.close();
    await page.close();
  }
});

async function mode(page: Page, value: string) {
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator(`[data-ui="content.toolbar.mode-option.${value}"]`).click();
}

test('recovers pending drawing text through canonical Undo and Redo after reload', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    await mode(page, 'drawing');
    await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
    await page.mouse.click(400, 230);
    await page.locator('[data-ui="content.drawing.text-input"]').fill('Recovered drawing text');
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.locator(restore).click();
    await mode(page, 'drawing');
    const text = page.locator('[data-ui="content.drawing.text-object"]');
    await expect(text).toContainText('Recovered drawing text');
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect(text).toHaveCount(0);
    await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect(text).toContainText('Recovered drawing text');
    await page.screenshot({ path: info.outputPath('restored-drawing.png'), fullPage: false });
  } finally {
    await popup.close();
    await page.close();
  }
});

test('keeps ownership after worker restart and refuses old data after browser restart', async ({
  hostOrigin,
}, info) => {
  test.setTimeout(120000);
  const original = await launchExtensionBrowser({ viewport: { width: 1280, height: 560 } });
  let restarted: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
  try {
    const { page, popup } = await openDesignReview(
      original.context,
      original.extensionId,
      hostOrigin,
      { width: 1280, height: 560 }
    );
    await editTitle(page, 'Private session recovery', true);
    await expect.poll(() => sourceContains(popup, 'Private session recovery')).toBe(true);
    await terminateExtensionServiceWorker(original.context);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await original.context.close();
    restarted = await launchExtensionBrowser({
      userDataDir: original.userDataDir,
      viewport: { width: 1280, height: 560 },
    });
    const next = await openDesignReview(restarted.context, restarted.extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    await activate(next.page, next.popup);
    await expect(next.page.locator(restore)).toHaveCount(0);
    expect(await sourceContains(next.popup, 'Private session recovery')).toBe(true);
    await next.page.screenshot({
      path: info.outputPath('unproven-ownership-refused.png'),
      fullPage: false,
    });
  } finally {
    if (restarted) await closeExtensionBrowser(restarted);
    await closeExtensionBrowser(original, { removeUserDataDir: true });
  }
});

test('restores a page frame and Design Review note in the dark vertical toolbar', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    await popup.evaluate(async () =>
      chrome.storage.local.set({ 'sniptale-theme-preference': 'dark' })
    );
    const title = (await page.getByTestId('host-page-title').boundingBox())!;
    await page.mouse.click(title.x + 12, title.y + 12);
    const comment = page
      .locator('[data-ui="content.design-review.popover"]')
      .getByRole('textbox', { name: /Element comment|Комментарий к элементу/u });
    await comment.fill('Restore this design note');
    await comment.press('Enter');
    await expect(page.locator('[data-ui="content.annotation-marker-button"]')).toHaveCount(1);
    await mode(page, 'highlighter');
    const target = (await page
      .getByRole('button', { name: 'Host action', exact: true })
      .boundingBox())!;
    await page.mouse.click(target.x + 8, target.y + 8);
    await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
    if (!(await vertical.isVisible()))
      await page
        .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
        .click();
    await vertical.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="content.toolbar.root"]')).toHaveAttribute(
      'data-display-mode',
      'vertical'
    );
    await page.locator(restore).click();
    await mode(page, 'highlighter');
    await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
    await mode(page, 'design-review');
    await expect(page.locator('[data-ui="content.annotation-marker-button"]')).toHaveCount(1);
    await page.locator('[data-ui="content.annotation-marker-button"]').click();
    await expect(
      page.getByRole('textbox', { name: /Element comment|Комментарий к элементу/u })
    ).toHaveValue('Restore this design note');
    await page.screenshot({
      path: info.outputPath('restored-frame-note-dark-vertical.png'),
      fullPage: false,
    });
  } finally {
    await popup.close();
    await page.close();
  }
});

test('refuses note-only Restore when the page target has disappeared and retains the source', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    const bounds = (await page.getByTestId('host-page-title').boundingBox())!;
    await page.mouse.click(bounds.x + 12, bounds.y + 12);
    const comment = page
      .locator('[data-ui="content.design-review.popover"]')
      .getByRole('textbox', { name: /Element comment|Комментарий к элементу/u });
    await comment.fill('Preserve missing-target note');
    await comment.press('Enter');
    await expect.poll(() => sourceContains(popup, 'Preserve missing-target note')).toBe(true);
    await page.reload();
    await page.getByTestId('host-page-title').evaluate((node) => node.remove());
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.locator(restore).click();
    await expect(
      page.getByText(
        /Could not save or restore page changes|Не удалось сохранить или восстановить/u
      )
    ).toBeVisible();
    await expect(page.locator(restore)).toBeVisible();
    expect(await sourceContains(popup, 'Preserve missing-target note')).toBe(true);
    await mode(page, 'design-review');
    await expect(page.locator('[data-ui="content.annotation-marker-button"]')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('missing-note-target-refused.png'),
      fullPage: false,
    });
  } finally {
    await popup.close();
    await page.close();
  }
});

async function markTitle(page: Page) {
  await mode(page, 'quick-edit');
  await page.locator('[data-ui="content.toolbar.text-marker"]').click();
  const points = await page.getByTestId('host-page-title').evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error('Host title text is missing');
    const character = (offset: number) => {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      return range.getBoundingClientRect().toJSON();
    };
    return { first: character(0), last: character(7) };
  });
  await page.mouse.move(points.first.left + 0.5, points.first.top + points.first.height / 2);
  await page.mouse.down();
  await page.mouse.move(points.last.right - 0.5, points.last.top + points.last.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(1);
}

async function restorePage(page: Page, popup: Page) {
  await page.reload();
  await activate(page, popup);
  await expect(page.locator(restore)).toBeVisible();
  await page.locator(restore).click();
  await expect(page.locator(restore)).toHaveCount(0);
}

async function recoveryProvider(context: BrowserContext, extensionId: string) {
  let requests = 0;
  const replacement = 'Recovered provider rewrite';
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    request.resume();
    request.once('end', () => {
      requests++;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: replacement } }],
        })
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Provider address is missing');
  const origin = `http://127.0.0.1:${address.port}`;
  const providerName = `Recovery provider ${address.port}`;
  const modelName = `Recovery model ${address.port}`;
  const settings = await context.newPage();
  try {
    await settings.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`
    );
    const locale = await settings.evaluate(async () =>
      (await chrome.storage.local.get('sniptale-locale-preference'))[
        'sniptale-locale-preference'
      ] === 'ru'
        ? 'ru'
        : 'en'
    );
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    await settings.evaluate((origin) => {
      const grant = document.createElement('button');
      grant.textContent = 'Grant recovery provider';
      grant.onclick = async () => {
        grant.dataset['granted'] = String(
          await chrome.permissions.request({ origins: [`${origin}/*`] })
        );
      };
      document.body.append(grant);
    }, origin);
    const grant = settings.getByRole('button', { name: 'Grant recovery provider', exact: true });
    await grant.click();
    await expect(grant).toHaveAttribute('data-granted', 'true');
    await grant.evaluate((node) => node.remove());
    await settings
      .getByRole('region', { name: label('settings.aiProviders.providersTitle'), exact: true })
      .getByRole('button', { name: label('common.actions.add'), exact: true })
      .click();
    const dialog = settings.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(providerName);
    await dialog.locator('input').nth(1).fill(`${origin}/v1`);
    await dialog.locator('input[type=password]').fill('synthetic-recovery-test-key');
    await dialog.getByRole('button', { name: label('common.actions.add'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await settings
      .getByRole('region', { name: label('settings.aiProviders.modelsTitle'), exact: true })
      .getByRole('button', { name: label('common.actions.add'), exact: true })
      .click();
    await dialog
      .getByRole('button', {
        name: label('settings.aiProviders.modelProviderPlaceholder'),
        exact: true,
      })
      .click();
    await settings.getByRole('option', { name: providerName, exact: true }).click();
    await dialog
      .getByPlaceholder(label('settings.aiProviders.modelNamePlaceholder'), { exact: true })
      .fill(modelName);
    await dialog
      .getByPlaceholder(label('settings.aiProviders.modelCodePlaceholder'), { exact: true })
      .fill('recovery-model');
    await dialog.getByRole('button', { name: label('common.actions.add'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
  } catch (error) {
    server.closeAllConnections();
    server.close();
    throw error;
  } finally {
    await settings.close();
  }
  return {
    replacement,
    modelName,
    requests: () => requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`restores text markers through history and Markdown/PDF at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: hostOrigin });
      await markTitle(page);
      await expect.poll(() => sourceContains(popup, 'textMarkers')).toBe(true);
      await restorePage(page, popup);
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(1);
      await mode(page, 'quick-edit');
      await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(0);
      await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(1);
      await page.screenshot({ path: info.outputPath('restored-marker.png'), fullPage: false });
      await mode(page, 'design-review');
      await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
      await page.locator('[data-ui="content.toolbar.annotation-export.copy"]').click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain('Sniptale');
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain('"Sniptale": #ffdf0066 (text offsets 0–8)');
      await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
      await page.locator('[data-ui="content.toolbar.annotation-export.pdf"]').click();
      await expect
        .poll(() => page.frames().filter((frame) => frame.url() === 'about:blank').length)
        .toBe(1);
      const report = page.frames().find((frame) => frame.url() === 'about:blank')!;
      await expect(report.locator('body')).toContainText(/Text highlighting|Подсветка текста/u);
      await expect(report.locator('article')).toHaveCount(1);
      await expect(report.locator('body')).toContainText('Sniptale');
    } finally {
      await popup.close();
      await page.close();
    }
  });

  test(`restores provider AI text and reveals the old marker on Undo at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    const provider = await recoveryProvider(context, extensionId);
    try {
      await page.bringToFront();
      await markTitle(page);
      await page.locator('[data-ui="content.toolbar.ai-text"]').click();
      await page.getByTestId('host-page-title').click();
      const popover = page.locator('[data-ui="content.ai-text.popover"]');
      await expect(popover).toBeVisible();
      await popover.locator('.sniptale-ai-model-selector-trigger').click();
      await page.getByRole('button', { name: provider.modelName, exact: true }).click();
      await page
        .locator('[data-ui="content.ai-text.prompt"]')
        .fill('Rewrite only this selected title.');
      await page.locator('[data-ui="content.ai-text.submit"]').click();
      await expect(page.getByTestId('host-page-title')).toHaveText(provider.replacement);
      await expect.poll(provider.requests).toBe(1);
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(0);
      await expect.poll(() => sourceContains(popup, provider.replacement)).toBe(true);
      await restorePage(page, popup);
      await expect(page.getByTestId('host-page-title')).toHaveText(provider.replacement);
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(0);
      await mode(page, 'quick-edit');
      await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
      await expect(page.getByTestId('host-page-title')).toHaveText('Sniptale E2E Host');
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(1);
      await page.screenshot({
        path: info.outputPath('restored-ai-undo-marker.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
      await expect(page.getByTestId('host-page-title')).toHaveText(provider.replacement);
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(0);
      expect(provider.requests()).toBe(1);
    } finally {
      await provider.close();
      await popup.close();
      await page.close();
    }
  });

  test(`refuses foreign CSS, retries Restore and replays CSS/Move at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    const title = page.getByTestId('host-page-title');
    try {
      await page.addInitScript(() => {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            const target = document.querySelector<HTMLElement>('[data-testid="host-page-title"]');
            target?.style.setProperty('color', 'rgb(1, 2, 3)', 'important');
          },
          { once: true }
        );
      });
      await title.evaluate((node) => node.style.setProperty('color', 'rgb(1, 2, 3)', 'important'));
      const baseline = await title.evaluate((node) => ({
        value: node.style.getPropertyValue('color'),
        priority: node.style.getPropertyPriority('color'),
      }));
      await page.locator('[data-ui="content.toolbar.review-tool.inspect"]').click();
      const inspectedBounds = (await title.boundingBox())!;
      await page.mouse.click(inspectedBounds.x + 12, inspectedBounds.y + 12);
      const panel = page.locator('[data-ui="content.design-review.tool-panel"]');
      await panel.locator('[data-ui="content.design-review.css-section"] > summary').click();
      await panel
        .getByRole('textbox', { name: /CSS declarations|Декларации CSS/u })
        .fill('color: rgb(20, 40, 60);');
      await panel.getByRole('button', { name: /^(Apply CSS|Применить CSS)$/u }).click();
      await expect(title).toHaveCSS('color', 'rgb(20, 40, 60)');
      await page.locator('[data-ui="content.toolbar.review-tool.move"]').click();
      const before = (await title.boundingBox())!;
      await page.mouse.move(before.x + 12, before.y + 12);
      await page.mouse.down();
      await page.mouse.move(before.x + 36, before.y + 24, { steps: 5 });
      await page.mouse.up();
      await expect(title).toHaveCSS('translate', '24px 12px');
      await expect.poll(() => sourceContains(popup, '24px 12px')).toBe(true);
      await page.reload();
      await title.evaluate((node) =>
        node.style.setProperty('color', 'rgb(91, 92, 93)', 'important')
      );
      await activate(page, popup);
      await expect(page.locator(restore)).toBeVisible();
      await page.locator(restore).click();
      await expect(
        page.getByText(
          /Could not save or restore page changes|Не удалось сохранить или восстановить/u
        )
      ).toBeVisible();
      await expect(page.locator(restore)).toBeVisible();
      await expect(title).toHaveCSS('color', 'rgb(91, 92, 93)');
      await expect(title).toHaveCSS('translate', 'none');
      expect(await sourceContains(popup, '24px 12px')).toBe(true);
      await title.evaluate((node, original) => {
        if (original.value) node.style.setProperty('color', original.value, original.priority);
        else node.style.removeProperty('color');
      }, baseline);
      await page.locator(restore).click();
      await expect(page.locator(restore)).toHaveCount(0);
      await expect(title).toHaveCSS('translate', '24px 12px');
      await expect(title).toHaveCSS('color', 'rgb(20, 40, 60)');
      expect(await title.evaluate((node) => node.style.getPropertyPriority('color'))).toBe('');
      await mode(page, 'design-review');
      await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
      await expect(title).toHaveCSS('translate', 'none');
      await expect(title).toHaveCSS('color', 'rgb(20, 40, 60)');
      await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
      expect(
        await title.evaluate((node) => ({
          value: node.style.getPropertyValue('color'),
          priority: node.style.getPropertyPriority('color'),
        }))
      ).toEqual(baseline);
      await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
      await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
      await expect(title).toHaveCSS('translate', '24px 12px');
      await expect(title).toHaveCSS('color', 'rgb(20, 40, 60)');
      await page.screenshot({
        path: info.outputPath('restored-css-move-retry.png'),
        fullPage: false,
      });
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`dictated instructions reach the new AI rewrite through click and PTT at ${viewport.name}`, async ({
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const locale = index === 0 ? 'en' : 'ru';
    await withVoiceBrowser(
      viewport.size,
      locale,
      async ({ page: settings, extensionId, provider, context }) => {
        const { page, popup } = await openDesignReview(
          context,
          extensionId,
          hostOrigin,
          viewport.size
        );
        try {
          await mode(page, 'quick-edit');
          await page.locator('[data-ui="content.toolbar.ai-text"]').click();
          const title = page.getByTestId('host-page-title');
          await title.click();
          const prompt = page.locator('[data-ui="content.ai-text.prompt"]');
          const microphone = page.locator('[data-ui="content.ai-text.voice"]');
          await expect(prompt).toBeVisible();
          await prompt.fill('');
          await microphone.click();
          await expect(microphone).toHaveAttribute('aria-pressed', 'true');
          // Real MediaRecorder requires an audio sample; this wait does not order a state race.
          await page.waitForTimeout(800);
          await expect(microphone).toHaveAttribute('aria-pressed', 'true');
          await microphone.click();
          await expect(prompt).toHaveValue(CORRECTED_TRANSCRIPT);
          expect(provider.corrections).toEqual([
            {
              model: 'synthetic-text',
              messages: [
                { role: 'system', content: CORRECTION_PROMPT },
                { role: 'user', content: RAW_TRANSCRIPT },
              ],
            },
          ]);
          await settings.bringToFront();
          const savedPrompt = 'Keep only the dictated replacement instruction.';
          await settings.locator('[data-ui="settings.voice.correction-prompt"]').fill(savedPrompt);
          await settings.locator('[data-ui="settings.voice.prompt-save"]').click();
          await expect(settings.locator('[data-ui="settings.voice.prompt-save"]')).toBeDisabled();
          await page.bringToFront();
          await prompt.fill('Before  after');
          await prompt.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(7, 7));
          await microphone.hover();
          await page.mouse.down();
          await page.waitForTimeout(800);
          await page.mouse.up();
          const dictatedInstruction = `Before ${CORRECTED_TRANSCRIPT} after`;
          await expect(prompt).toHaveValue(dictatedInstruction);
          expect(provider.uploads).toHaveLength(2);
          expect(provider.corrections).toHaveLength(2);
          expect(provider.corrections[1]).toEqual({
            model: 'synthetic-text',
            messages: [
              { role: 'system', content: savedPrompt },
              { role: 'user', content: RAW_TRANSCRIPT },
            ],
          });
          const popover = page.locator('[data-ui="content.ai-text.popover"]');
          await popover.locator('.sniptale-ai-model-selector-trigger').click();
          await page.getByRole('button', { name: TEXT_MODEL_NAME, exact: true }).click();
          await page.screenshot({
            path: info.outputPath('new-ai-dictated-instruction.png'),
            fullPage: false,
          });
          await page.locator('[data-ui="content.ai-text.submit"]').click();
          await expect(title).toHaveText(CORRECTED_TRANSCRIPT);
          await expect.poll(() => provider.corrections.length).toBe(3);
          expect(provider.corrections[2]).toMatchObject({
            model: 'synthetic-text',
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'user',
                content: expect.stringContaining(dictatedInstruction),
              }),
            ]),
          });
          await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
          await expect(title).toHaveText('Sniptale E2E Host');
          await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
          await expect(title).toHaveText(CORRECTED_TRANSCRIPT);
          expect(provider.uploads).toHaveLength(2);
          expect(provider.corrections).toHaveLength(3);
          await page.screenshot({
            path: info.outputPath('new-ai-dictation-applied.png'),
            fullPage: false,
          });
        } finally {
          await popup.close();
          await page.close();
        }
      }
    );
  });
}
