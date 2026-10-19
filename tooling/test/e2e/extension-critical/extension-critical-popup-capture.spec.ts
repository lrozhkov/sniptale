import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  evaluateInTarget,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';

type CaptureMode = 'visible' | 'selection' | 'full';
type CaptureEntry = 'home' | 'quick-action';

const capturePages = new WeakMap<Page, { extensionId: string; page: Page }>();

function captureConfig(screenshotMode: CaptureMode): ScreenshotCaptureConfig {
  return {
    screenshotMode,
    viewportPresetId: null,
    delay: 0,
    afterCapture: 'download_default',
    imageFormat: 'png',
    imageQuality: 90,
    exitAfterCapture: true,
  };
}

async function sendPopupCommand(popup: Page, command: Record<string, unknown>) {
  const capturePage = capturePages.get(popup);
  if (capturePage && command['type'] !== 'PAGE_ACCESS') {
    const targetId = await triggerExtensionAction(
      popup.context(),
      capturePage.extensionId,
      capturePage.page
    );
    try {
      return await sendRuntimeMessageInTarget(popup.context(), targetId, command);
    } finally {
      await evaluateInTarget(popup.context(), targetId, 'window.close()').catch(() => undefined);
    }
  }
  return popup.evaluate(
    async (message) =>
      chrome.runtime.sendMessage({
        ...message,
        __sniptaleRuntimeFreshness: {
          issuedAtEpochMs: Date.now(),
          nonce: crypto.randomUUID(),
        },
      }),
    command
  );
}

async function openCapturePage(
  context: BrowserContext,
  extensionId: string,
  hostOrigin: string,
  viewport: { width: number; height: number }
) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(hostOrigin);
  const popup = await context.newPage();
  await popup.setViewportSize(viewport);
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  await popup.evaluate(() => {
    const button = document.createElement('button');
    button.textContent = 'Grant capture proof permission';
    button.onclick = async () => {
      button.dataset['granted'] = String(
        await chrome.permissions.request({ origins: ['<all_urls>'] })
      );
    };
    document.body.append(button);
  });
  await popup.getByRole('button', { name: 'Grant capture proof permission' }).click();
  await expect(
    popup.getByRole('button', { name: 'Grant capture proof permission' })
  ).toHaveAttribute('data-granted', 'true');
  await page.reload();
  await page.evaluate(() => {
    document.body.style.minHeight = '1400px';
    const target = document.createElement('section');
    target.textContent = 'Popup capture proof';
    target.style.cssText =
      'position:absolute;left:180px;top:180px;width:420px;height:220px;background:#f97316';
    document.body.append(target);
  });
  const tabId = await popup.evaluate(async (url) => {
    const target = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    if (typeof target?.id !== 'number') throw new Error('Capture proof tab unavailable');
    await chrome.tabs.update(target.id, { active: true });
    return target.id;
  }, page.url());
  expect(
    await sendPopupCommand(popup, {
      type: 'PAGE_ACCESS',
      operation: 'register-granted-site',
      tabId,
    })
  ).toMatchObject({ success: true, result: 'registered' });
  await page.bringToFront();
  capturePages.set(popup, { extensionId, page });
  return { page, popup, tabId };
}

async function enableToolbar(popup: Page, page: Page, tabId: number) {
  const response = await sendPopupCommand(popup, { type: 'ENABLE_SCREENSHOT_MODE', tabId });
  expect(response, `Canonical toolbar enable response: ${JSON.stringify(response)}`).toMatchObject({
    success: true,
  });
  await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
}

async function triggerCapture(popup: Page, tabId: number, entry: CaptureEntry, mode: CaptureMode) {
  const config = captureConfig(mode);
  if (entry === 'home') {
    return sendPopupCommand(popup, { type: 'TRIGGER_SCREENSHOT_CAPTURE', tabId, config });
  }
  const actionId = `popup-capture-proof-${mode}`;
  await popup.evaluate(
    async ({ id, configuration }) =>
      chrome.storage.local.set({
        sniptale_quick_actions: [
          {
            id,
            name: 'Popup capture proof',
            status: true,
            icon: 'Camera',
            ...configuration,
          },
        ],
      }),
    { id: actionId, configuration: config }
  );
  return sendPopupCommand(popup, { type: 'TRIGGER_QUICK_ACTION', tabId, actionId });
}

async function completedDownloads(popup: Page) {
  return popup.evaluate(
    async () =>
      (await chrome.downloads.search({})).filter(
        (download) => download.state === 'complete' && download.bytesReceived > 0
      ).length
  );
}

async function finishSelection(page: Page) {
  await expect(page.locator('.sniptale-selection-container')).toBeVisible();
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(500, 380, { steps: 4 });
  await page.mouse.up();
  await page.locator('.sniptale-selection-size-confirm-button').click();
}

async function attachDiagnostics(info: TestInfo, popup: Page, tabId: number, messages: string[]) {
  const response: unknown = await sendPopupCommand(popup, {
    type: 'SCREENSHOT_MODE_STATUS',
    tabId,
  }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
  const status =
    typeof response === 'object' && response !== null
      ? {
          success: 'success' in response ? response.success : undefined,
          enabled: 'enabled' in response ? response.enabled : undefined,
          error: 'error' in response ? response.error : undefined,
          viewport: 'viewport' in response ? response.viewport : undefined,
          surfaceLeaseGeneration:
            'surfaceLeaseGeneration' in response ? response.surfaceLeaseGeneration : undefined,
          surfaceOperationGeneration:
            'surfaceOperationGeneration' in response
              ? response.surfaceOperationGeneration
              : undefined,
        }
      : { error: 'Screenshot status response unavailable' };
  const downloads = await popup.evaluate(async () =>
    (await chrome.downloads.search({})).map((download) => ({
      id: download.id,
      state: download.state,
      bytesReceived: download.bytesReceived,
      error: download.error,
    }))
  );
  await info.attach('popup-capture-diagnostics', {
    body: JSON.stringify({ status, downloads, messages }, null, 2),
    contentType: 'application/json',
  });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const entry of ['home', 'quick-action'] as const) {
    for (const mode of ['visible', 'selection', 'full'] as const) {
      test(`${entry} ${mode} capture releases an existing toolbar at ${viewport.name}`, async ({
        context,
        extensionId,
        hostOrigin,
      }, info) => {
        test.setTimeout(120_000);
        info.annotations.push({
          type: 'capture-entry',
          description:
            'Dispatch the capture route from the native action popup. The separate extension page controls permissions and reads downloads; it cannot act as the popup route sender because its sender.tab identifies itself.',
        });
        const messages: string[] = [];
        context.on('console', (message) => {
          if (message.type() === 'error') messages.push(message.text());
        });
        context.on('weberror', (error) => messages.push(error.error().message));
        const { page, popup, tabId } = await openCapturePage(
          context,
          extensionId,
          hostOrigin,
          viewport.size
        );
        try {
          if (mode === 'selection') {
            await enableToolbar(popup, page, tabId);
            const beforeCancel = await completedDownloads(popup);
            expect(await triggerCapture(popup, tabId, entry, mode)).toMatchObject({
              success: true,
              result: 'accepted',
            });
            await expect(page.locator('.sniptale-selection-container')).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
            expect(await completedDownloads(popup)).toBe(beforeCancel);
          }
          for (let attempt = 0; attempt < 2; attempt += 1) {
            await enableToolbar(popup, page, tabId);
            const beforeCapture = await completedDownloads(popup);
            expect(await triggerCapture(popup, tabId, entry, mode)).toMatchObject({
              success: true,
              result: 'accepted',
            });
            if (mode === 'selection') await finishSelection(page);
            await expect
              .poll(() => completedDownloads(popup), { timeout: 45_000 })
              .toBe(beforeCapture + 1);
            await expect(page.locator('[data-ui="content.toolbar.root"]')).not.toBeVisible();
            expect(
              messages.filter((message) =>
                /Screenshot surface|quick-action screenshot surface|cancelled quick-action capture/.test(
                  message
                )
              )
            ).toEqual([]);
          }
          await page.screenshot({ path: info.outputPath('capture-complete.png'), fullPage: false });
        } finally {
          await attachDiagnostics(info, popup, tabId, messages);
          await popup.close();
          await page.close();
        }
      });
    }
  }

  test(`Home visible capture mounts a fresh toolbar at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120_000);
    const messages: string[] = [];
    context.on('console', (message) => {
      if (message.type() === 'error') messages.push(message.text());
    });
    context.on('weberror', (error) => messages.push(error.error().message));
    const { page, popup, tabId } = await openCapturePage(
      context,
      extensionId,
      hostOrigin,
      viewport.size
    );
    try {
      const beforeCapture = await completedDownloads(popup);
      expect(await triggerCapture(popup, tabId, 'home', 'visible')).toMatchObject({
        success: true,
        result: 'accepted',
      });
      await expect
        .poll(() => completedDownloads(popup), { timeout: 45_000 })
        .toBe(beforeCapture + 1);
      expect(
        messages.filter((message) =>
          /Screenshot surface|quick-action screenshot surface/.test(message)
        )
      ).toEqual([]);
    } finally {
      await attachDiagnostics(info, popup, tabId, messages);
      await popup.close();
      await page.close();
    }
  });
}
