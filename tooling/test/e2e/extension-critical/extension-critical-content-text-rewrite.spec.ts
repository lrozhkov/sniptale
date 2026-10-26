import { createServer, type ServerResponse } from 'node:http';
import type { Page, Locator, BrowserContext } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';

test.setTimeout(120_000);
const replacement = '<b>Plain replacement text</b>';
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);
const command = (page: Page | Locator, locale: AppLocale, key: TranslationKey) =>
  page.getByRole('button', { name: translate(key, locale), exact: true });

async function localProvider() {
  let mode: 'success' | 'hold' | 'error' | 'truncated' = 'success';
  let received = 0;
  let aborted = 0;
  let plain = 0;
  const pending = new Set<ServerResponse>();
  const complete = (response: ServerResponse, value = replacement, truncated = false) => {
    if (response.destroyed) return;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [{ finish_reason: truncated ? 'length' : 'stop', message: { content: value } }],
      })
    );
  };
  const server = createServer((request, response) => {
    if (request.url !== '/v1/chat/completions' || request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (value: unknown) => {
      if (typeof value !== 'string' || body.length > 128_000) {
        request.destroy();
        return;
      }
      body += value;
    });
    request.once('end', () => {
      received++;
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        response.writeHead(400).end();
        return;
      }
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'messages' in parsed &&
        Array.isArray(parsed.messages)
      ) {
        const messages = parsed.messages;
        const hasText = messages.some(
          (entry: unknown) =>
            typeof entry === 'object' &&
            entry !== null &&
            'role' in entry &&
            entry.role === 'user' &&
            'content' in entry &&
            typeof entry.content === 'string' &&
            entry.content.startsWith('Selected text:\n') &&
            entry.content.includes('\n\nUser instruction:\n')
        );
        const hasPlainInstruction = messages.some(
          (entry: unknown) =>
            typeof entry === 'object' &&
            entry !== null &&
            'role' in entry &&
            entry.role === 'system' &&
            'content' in entry &&
            typeof entry.content === 'string' &&
            entry.content.includes('Return only the replacement text.')
        );
        if (hasText && hasPlainInstruction) plain++;
      }
      // Keep only counters. Do not retain request bodies, headers or credentials.
      body = '';
      if (mode === 'hold') pending.add(response);
      else if (mode === 'error') {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Synthetic private provider failure' } }));
      } else complete(response, replacement, mode === 'truncated');
    });
    response.once('close', () => {
      if (!response.writableEnded) aborted++;
      pending.delete(response);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Synthetic provider address missing');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    received: () => received,
    aborted: () => aborted,
    plain: () => plain,
    setMode: (value: typeof mode) => {
      mode = value;
    },
    release: (value = replacement) => {
      for (const response of pending) complete(response, value);
      pending.clear();
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

async function configureProvider(
  context: BrowserContext,
  extensionId: string,
  locale: AppLocale,
  origin: string,
  suffix: string
) {
  const settings = await context.newPage();
  const providerName = `Plain text provider ${suffix}`;
  const modelName = `Plain text model ${suffix}`;
  try {
    await settings.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`
    );
    await settings.evaluate((origin) => {
      const button = document.createElement('button');
      button.textContent = 'Grant synthetic text provider';
      button.style.cssText = 'position:fixed;right:8px;top:8px;z-index:2147483647';
      button.onclick = async () => {
        button.dataset['granted'] = String(
          await chrome.permissions.request({ origins: [`${origin}/*`] })
        );
      };
      document.body.append(button);
    }, origin);
    const grant = settings.getByRole('button', {
      name: 'Grant synthetic text provider',
      exact: true,
    });
    await grant.click();
    await expect(grant).toHaveAttribute('data-granted', 'true');
    await grant.evaluate((node) => node.remove());
    const providers = settings.getByRole('region', {
      name: translate('settings.aiProviders.providersTitle', locale),
      exact: true,
    });
    await command(providers, locale, 'common.actions.add').click();
    const dialog = settings.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(providerName);
    await dialog.locator('input').nth(1).fill(`${origin}/v1`);
    await dialog.locator('input[type=password]').fill('synthetic-test-only-key');
    await command(dialog, locale, 'common.actions.add').click();
    await expect(dialog).toHaveCount(0);
    const models = settings.getByRole('region', {
      name: translate('settings.aiProviders.modelsTitle', locale),
      exact: true,
    });
    await command(models, locale, 'common.actions.add').click();
    await command(dialog, locale, 'settings.aiProviders.modelProviderPlaceholder').click();
    await settings.getByRole('option', { name: providerName, exact: true }).click();
    await dialog
      .getByPlaceholder(translate('settings.aiProviders.modelNamePlaceholder', locale), {
        exact: true,
      })
      .fill(modelName);
    await dialog
      .getByPlaceholder(translate('settings.aiProviders.modelCodePlaceholder', locale), {
        exact: true,
      })
      .fill('synthetic-plain-text-model');
    await command(dialog, locale, 'common.actions.add').click();
    await expect(dialog).toHaveCount(0);
    return modelName;
  } finally {
    await settings.close();
  }
}

async function expectWithinViewport(page: Page, element: Locator) {
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('Visible text editor bounds missing');
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`single text AI applies, stops and restores source at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const small = viewport.name === '1280x560';
    const locale: AppLocale = small ? 'ru' : 'en';
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    await setup.evaluate(
      async (small) =>
        chrome.storage.local.set({
          'sniptale-locale-preference': small ? 'ru' : 'en',
          'sniptale-theme-preference': small ? 'dark' : 'light',
        }),
      small
    );
    await setup.close();
    const provider = await localProvider();
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    try {
      const modelName = await configureProvider(
        context,
        extensionId,
        locale,
        provider.origin,
        viewport.name
      );
      await page.bringToFront();
      if (!small) {
        await ui(page, 'content.toolbar.settings-button').click();
        const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
        if (!(await vertical.isVisible()))
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        await vertical.click();
        await ui(page, 'content.toolbar.settings-button').click();
      }
      await page.evaluate(() => {
        const section = document.createElement('section');
        section.style.cssText =
          'position:absolute;left:32px;top:70px;width:560px;max-width:calc(100vw - 64px);z-index:1;background:white;color:#111;font:20px/28px Georgia,serif';
        const text = document.createElement('p');
        text.id = 'ai-text-source';
        text.style.margin = '0 0 12px';
        text.append(
          'Original ',
          Object.assign(document.createElement('strong'), { textContent: 'selected' }),
          ' words'
        );
        const other = document.createElement('p');
        other.id = 'ai-text-other';
        other.textContent = 'Another target text';
        const frame = document.createElement('iframe');
        frame.id = 'ai-text-frame';
        frame.style.cssText = 'width:340px;height:90px;border:1px solid #aaa';
        const ordinary = document.createElement('button');
        ordinary.id = 'ai-text-ordinary';
        ordinary.textContent = 'Ordinary action';
        ordinary.onclick = () => {
          ordinary.textContent = 'Ordinary action completed';
        };
        section.append(text, other, frame, ordinary);
        document.body.append(section);
        const inner = frame.contentDocument;
        if (!inner) throw new Error('Synthetic frame missing');
        const child = inner.createElement('p');
        child.id = 'ai-frame-source';
        child.textContent = 'Frame source text';
        inner.body.append(child);
      });
      await ui(page, 'content.toolbar.mode-selector-button').click();
      await ui(page, 'content.toolbar.mode-option.quick-edit').click();
      await ui(page, 'content.toolbar.page-editing-mode.ai').click();
      const table = page.locator('.sniptale-ai-modal-root');
      await expect(table).toBeVisible();
      await expect(table.locator('.sniptale-ai-spoiler-toggle')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await command(table, locale, 'aiModal.closeTitle').click();

      const source = page.locator('#ai-text-source');
      await ui(page, 'content.toolbar.text-marker').click();
      const box = (await source.boundingBox())!;
      await page.mouse.move(box.x + 2, box.y + 14);
      await page.mouse.down();
      await page.mouse.move(box.x + 240, box.y + 14, { steps: 10 });
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(1);
      await ui(page, 'content.toolbar.ai-text').click();
      await expect(ui(page, 'content.toolbar.text-marker-panel')).toHaveCount(0);
      const originalMarkup = await source.evaluate((node) => node.innerHTML);
      await source.click();
      const popover = ui(page, 'content.ai-text.popover');
      const prompt = ui(page, 'content.ai-text.prompt');
      const submit = ui(page, 'content.ai-text.submit');
      await expect(popover).toBeVisible();
      await expect(prompt).toBeFocused();
      const templates = ui(page, 'ai-modal.template-picker');
      await expect(templates.getByRole('button')).toBeEnabled();
      await templates.getByRole('button').click();
      await page.getByRole('option').first().click();
      await expect(prompt).not.toHaveValue('');
      expect(provider.received()).toBe(0);
      const voice = ui(page, 'content.ai-text.voice');
      await expect(voice).toBeVisible();
      const fieldBounds = (await ui(page, 'content.ai-text.prompt-field').boundingBox())!;
      const voiceBounds = (await voice.boundingBox())!;
      expect(voiceBounds.x).toBeGreaterThan(fieldBounds.x);
      expect(voiceBounds.y).toBeGreaterThanOrEqual(fieldBounds.y);
      expect(voiceBounds.x + voiceBounds.width).toBeLessThanOrEqual(
        fieldBounds.x + fieldBounds.width
      );
      expect(voiceBounds.y + voiceBounds.height).toBeLessThanOrEqual(
        fieldBounds.y + fieldBounds.height
      );
      await expect(
        ui(page, 'content.ai-text.footer').locator('[data-ui="content.ai-text.voice"]')
      ).toHaveCount(0);
      await popover.locator('.sniptale-ai-model-selector-trigger').click();
      await page.getByRole('button', { name: modelName, exact: true }).click();
      await expect(submit).toHaveAttribute('title', new RegExp(modelName));
      await expect(submit).toHaveAttribute(
        'title',
        new RegExp(translate('content.toolbar.aiTextDisclosureData', locale))
      );
      await expect(submit).toHaveAttribute(
        'title',
        new RegExp(translate('aiModal.disclosureHistory', locale))
      );
      const beforeDrag = (await popover.boundingBox())!;
      const handle = (await ui(page, 'content.ai-text.drag').boundingBox())!;
      await page.mouse.move(handle.x + 20, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x - 60, handle.y + handle.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      await expect
        .poll(async () => (await popover.boundingBox())!.x)
        .toBeLessThan(beforeDrag.x - 30);
      await expectWithinViewport(page, popover);
      await prompt.fill('Rewrite only this selected text.');
      await expectWithinViewport(page, submit);
      await page.screenshot({ path: info.outputPath('plain-text-ready.png'), fullPage: false });
      await prompt.press('Control+Enter');
      await expect(source).toHaveText(replacement);
      await expect(source.locator('b')).toHaveCount(0);
      await expect(popover).toHaveCount(0);
      await expect.poll(provider.received).toBe(1);
      expect(provider.plain()).toBe(1);
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(0);
      await ui(page, 'content.toolbar.history-undo-button').click();
      await expect(source).toHaveJSProperty('innerHTML', originalMarkup);
      await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(1);
      await ui(page, 'content.toolbar.history-redo-button').click();
      await expect(source).toHaveText(replacement);
      await ui(page, 'content.toolbar.history-undo-button').click();

      provider.setMode('hold');
      await source.click();
      await prompt.fill('Keep this instruction after Stop.');
      await submit.click();
      await expect.poll(provider.received).toBe(2);
      await expect(ui(page, 'content.ai-text.status')).toContainText(
        translate('content.toolbar.aiTextWaiting', locale)
      );
      await page.screenshot({ path: info.outputPath('plain-text-waiting.png'), fullPage: false });
      const abortedBeforeStop = provider.aborted();
      await submit.click();
      await expect.poll(provider.aborted).toBe(abortedBeforeStop + 1);
      await expect(prompt).toHaveValue('Keep this instruction after Stop.');
      await expect(source).toHaveText('Original selected words');
      provider.release('Late ignored response');
      await submit.click();
      await expect.poll(provider.received).toBe(3);
      const abortedBeforeClose = provider.aborted();
      await ui(page, 'content.ai-text.close').click();
      await expect.poll(provider.aborted).toBe(abortedBeforeClose + 1);
      await expect(popover).toHaveCount(0);
      await expect(source).toHaveText('Original selected words');

      provider.setMode('error');
      await ui(page, 'content.toolbar.ai-text').click();
      await source.click();
      await popover.locator('.sniptale-ai-model-selector-trigger').click();
      await page.getByRole('button', { name: modelName, exact: true }).click();
      await prompt.fill('Explicit retry after a provider failure.');
      await submit.click();
      await expect(popover.getByRole('alert')).toContainText(
        translate('content.toolbar.aiTextError', locale)
      );
      await expect(source).toHaveText('Original selected words');
      await expect(popover).not.toContainText('Synthetic private provider failure');
      provider.setMode('truncated');
      await submit.click();
      await expect(popover.getByRole('alert')).toBeVisible();
      await expect(source).toHaveText('Original selected words');
      provider.setMode('success');
      await submit.click();
      await expect(source).toHaveText(replacement);

      const frameSource = page.frameLocator('#ai-text-frame').locator('#ai-frame-source');
      await frameSource.click();
      await prompt.fill('Rewrite this frame text.');
      await submit.click();
      await expect(frameSource).toHaveText(replacement);
      await ui(page, 'content.toolbar.history-undo-button').click();
      await expect(frameSource).toHaveText('Frame source text');
      provider.setMode('hold');
      await frameSource.click();
      await prompt.fill('Refuse a stale frame response.');
      const beforeFrame = provider.received();
      await submit.click();
      await expect.poll(provider.received).toBe(beforeFrame + 1);
      await page.evaluate(
        ({ remove, origin }) => {
          const frame = document.getElementById('ai-text-frame');
          if (!(frame instanceof HTMLIFrameElement)) throw new Error('Synthetic frame missing');
          if (remove) frame.remove();
          else frame.src = `${origin}/`;
        },
        { remove: small, origin: hostOrigin }
      );
      provider.release('Stale frame answer');
      await expect(popover.getByRole('alert')).toContainText(
        translate('content.toolbar.aiTextStale', locale)
      );
      await expect(source).toHaveText(replacement);
      await page.setViewportSize({ width: 1024, height: 560 });
      await prompt.fill('A long editable instruction. '.repeat(300));
      await prompt.press('Control+End');
      await expectWithinViewport(page, prompt);
      await expectWithinViewport(page, submit);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({ path: info.outputPath('plain-text-short.png'), fullPage: false });
      await prompt.press('Escape');
      await expect(popover).toHaveCount(0);
      await ui(page, 'content.toolbar.mode-selector-button').click();
      await ui(page, 'content.toolbar.mode-option.cursor').click();
      await page.locator('#ai-text-ordinary').click();
      await expect(page.locator('#ai-text-ordinary')).toHaveText('Ordinary action completed');
      expect(provider.plain()).toBe(provider.received());
    } finally {
      await page.close();
      await popup.close();
      await provider.close();
    }
  });
}
