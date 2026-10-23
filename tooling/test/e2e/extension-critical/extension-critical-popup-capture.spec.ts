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
    target.id = 'popup-capture-target';
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

async function triggerCapture(
  popup: Page,
  tabId: number,
  entry: CaptureEntry,
  mode: CaptureMode,
  delay = 0,
  afterCapture: ScreenshotCaptureConfig['afterCapture'] = 'download_default'
) {
  const config = { ...captureConfig(mode), delay, afterCapture };
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

async function createRetainedDrawing(page: Page) {
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
  await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
  await page.keyboard.press('Escape');
  await page.mouse.click(340, 270);
  const input = page.locator('[data-ui="content.drawing.text-input"]');
  await input.fill('Retain popup capture drawing');
  await input.press('Enter');
  await expect(page.locator('[data-ui="content.drawing.text-object"]')).toContainText(
    'Retain popup capture drawing'
  );
}

async function checkRetainedDrawing(page: Page) {
  await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
  await expect(page.locator('[data-ui="content.toolbar.drawing.text"]')).toBeVisible();
  const object = page.locator('[data-ui="content.drawing.text-object"]');
  await expect(object).toContainText('Retain popup capture drawing');
  await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
  await expect(object).toHaveCount(0);
  await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
  await expect(object).toContainText('Retain popup capture drawing');
  await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
  const canvas = page.locator(
    '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
  );
  const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const before = await pixels();
  await page.mouse.move(740, 320);
  await page.mouse.down();
  await page.mouse.move(840, 370, { steps: 5 });
  await page.mouse.up();
  await expect.poll(pixels).not.toBe(before);
  await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
  await expect.poll(pixels).toBe(before);
}

async function editDocumentText(page: Page) {
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.quick-edit"]').click();
  await page.locator('[data-ui="content.toolbar.page-editing-mode.direct-text"]').click();
  const target = page.locator('#popup-capture-target');
  await target.click();
  await target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText('Retain edited page text');
  await expect(target).toHaveText('Retain edited page text');
}

async function checkRetainedDocument(page: Page) {
  await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
  await expect(
    page.locator('[data-ui="content.toolbar.page-editing-mode.direct-text"]')
  ).toHaveAttribute('aria-pressed', 'true');
  const target = page.locator('#popup-capture-target');
  await expect(target).toHaveText('Retain edited page text');
  await page.locator('[data-ui="content.toolbar.page-editing-mode.block-selection"]').click();
  await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
  await expect(target).toHaveText('Popup capture proof');
  await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
  await expect(target).toHaveText('Retain edited page text');
  await page.locator('[data-ui="content.toolbar.page-editing-mode.direct-text"]').click();
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
  for (const mode of ['visible', 'full'] as const) {
    test(`Popup ${mode} capture excludes late toast in editor at ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup, tabId } = await openCapturePage(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
      try {
        await enableToolbar(popup, page, tabId);
        await popup.evaluate(async (id) => {
          await chrome.tabs.sendMessage(id, {
            type: 'SHOW_TOAST',
            payload: { message: 'Toast capture proof', type: 'info' },
          });
        }, tabId);
        const toast = page.locator('[data-ui="shared.toast.host"]').last();
        await expect(toast).toBeVisible();
        await toast.evaluate((element) => {
          const root = element.getRootNode();
          if (!(root instanceof ShadowRoot)) throw new Error('Content toast root unavailable');
          const lateToast = element.cloneNode(true);
          if (!(lateToast instanceof HTMLElement)) throw new Error('Toast clone unavailable');
          const marker = document.createElement('span');
          marker.style.cssText =
            'position:absolute;left:0;top:0;width:32px;height:32px;background:rgb(255,0,255);z-index:2147483647';
          lateToast.append(marker);
          const observer = new MutationObserver(() => {
            if (!root.host.classList.contains('sniptale-capture-ui-hidden')) return;
            root.append(lateToast);
            root.host.setAttribute(
              'data-toast-capture-display',
              getComputedStyle(lateToast).display
            );
            lateToast.setAttribute('data-capture-toast-proof', 'true');
            observer.disconnect();
          });
          observer.observe(root.host, { attributes: true, attributeFilter: ['class'] });
        });
        const editorOpened = context.waitForEvent('page');
        expect(await triggerCapture(popup, tabId, 'home', mode, 0, 'edit')).toMatchObject({
          success: true,
          result: 'accepted',
        });
        const editor = await editorOpened;
        try {
          await editor.setViewportSize(viewport.size);
          await editor.waitForURL(/editor/);
          await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
          const lateToast = page.locator('[data-capture-toast-proof="true"]');
          await expect(lateToast).toHaveCount(1);
          await expect
            .poll(() =>
              lateToast.evaluate((element) => {
                const root = element.getRootNode();
                return root instanceof ShadowRoot
                  ? root.host.getAttribute('data-toast-capture-display')
                  : null;
              })
            )
            .toBe('none');
          const canvas = editor.locator('canvas').first();
          await expect
            .poll(() =>
              canvas.evaluate((element: HTMLCanvasElement) => {
                if (!element.width || !element.height) return { hasPage: false, toast: 0 };
                const pixels = element
                  .getContext('2d')
                  ?.getImageData(0, 0, element.width, element.height).data;
                if (!pixels) return { hasPage: false, toast: 0 };
                let pagePixels = 0;
                let toastPixels = 0;
                for (let offset = 0; offset < pixels.length; offset += 4) {
                  if (pixels[offset]! > 250 && pixels[offset + 1]! < 5 && pixels[offset + 2]! > 250)
                    toastPixels += 1;
                  if (
                    pixels[offset]! > 220 &&
                    pixels[offset + 1]! > 70 &&
                    pixels[offset + 1]! < 150 &&
                    pixels[offset + 2]! < 70
                  )
                    pagePixels += 1;
                }
                return { hasPage: pagePixels > 1000, toast: toastPixels };
              })
            )
            .toEqual({ toast: 0, hasPage: true });
          await expect(editor.locator('[data-ui="editor.page.open-loading"]')).toHaveCount(0);
          await editor.evaluate(() => document.fonts.ready);
          await editor.screenshot({
            path: info.outputPath('editor-without-toast.png'),
            fullPage: false,
          });
          await page.bringToFront();
          await expect(lateToast).toBeVisible();
          await lateToast.evaluate((element) => element.remove());
        } finally {
          await editor.close();
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }

  test(`Crop output actions retain preparation without conflicting feedback at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    context.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const { page, popup, tabId } = await openCapturePage(
      context,
      extensionId,
      hostOrigin,
      viewport.size
    );
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: hostOrigin });
      await enableToolbar(popup, page, tabId);
      for (const afterCapture of [
        'copy',
        'download_default',
        'ask_system',
        'save_to_library',
        'ask_preset',
        'edit',
      ] as const) {
        const beforeDownloads = await completedDownloads(popup);
        if (afterCapture === 'copy')
          await page.evaluate(() => navigator.clipboard.writeText('Crop clipboard proof'));
        const editorOpened = afterCapture === 'edit' ? context.waitForEvent('page') : undefined;
        expect(
          await triggerCapture(popup, tabId, 'home', 'selection', 0, afterCapture)
        ).toMatchObject({
          success: true,
          result: 'accepted',
        });
        await finishSelection(page);
        await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
        if (afterCapture === 'copy') {
          await expect
            .poll(() =>
              page.evaluate(async () => {
                const items = await navigator.clipboard.read();
                return items.some((item) => item.types.includes('image/png'));
              })
            )
            .toBe(true);
        } else if (afterCapture === 'download_default' || afterCapture === 'ask_system') {
          await expect
            .poll(() => completedDownloads(popup), { timeout: 45_000 })
            .toBe(beforeDownloads + 1);
        } else if (afterCapture === 'ask_preset') {
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        } else if (editorOpened) {
          const editor = await editorOpened;
          await editor.waitForURL(/editor/);
          await editor.close();
          await page.bringToFront();
        } else {
          await expect(page.locator('[data-ui="shared.toast.host"] [role="status"]')).toBeVisible();
        }
        await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
        if (afterCapture === 'copy') await createRetainedDrawing(page);
        await checkRetainedDrawing(page);
        await expect(page.locator('[data-ui="shared.toast.host"] [role="alert"]')).toHaveCount(0);
        expect(
          errors.filter((message) =>
            /Screenshot surface|Selection error|Screenshot error/.test(message)
          )
        ).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`crop-${afterCapture}.png`),
          fullPage: false,
        });
      }
    } finally {
      await attachDiagnostics(info, popup, tabId, errors);
      await popup.close();
      await page.close();
    }
  });

  for (const entry of ['home', 'quick-action'] as const) {
    for (const mode of ['visible', 'selection', 'full'] as const) {
      test(`${entry} ${mode} capture preserves an existing toolbar and drawing at ${viewport.name}`, async ({
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
          await enableToolbar(popup, page, tabId);
          await createRetainedDrawing(page);
          if (mode === 'selection') {
            const beforeCancel = await completedDownloads(popup);
            expect(await triggerCapture(popup, tabId, entry, mode)).toMatchObject({
              success: true,
              result: 'accepted',
            });
            await expect(page.locator('.sniptale-selection-container')).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
            expect(await completedDownloads(popup)).toBe(beforeCancel);
            await checkRetainedDrawing(page);
          }
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const beforeCapture = await completedDownloads(popup);
            expect(await triggerCapture(popup, tabId, entry, mode)).toMatchObject({
              success: true,
              result: 'accepted',
            });
            if (mode === 'selection') await finishSelection(page);
            await expect
              .poll(() => completedDownloads(popup), { timeout: 45_000 })
              .toBe(beforeCapture + 1);
            await checkRetainedDrawing(page);
            expect(
              messages.filter((message) =>
                /Screenshot surface|quick-action screenshot surface|cancelled quick-action capture/.test(
                  message
                )
              )
            ).toEqual([]);
          }
          await page.screenshot({ path: info.outputPath('capture-complete.png'), fullPage: false });
          await page.locator('[data-ui="content.toolbar.settings-button"]').click();
          await page.getByRole('button', { name: 'Close', exact: true }).click();
          await expect(page.locator('[data-ui="content.toolbar.root"]')).not.toBeVisible();
          await expect(page.locator('[data-ui="content.drawing.text-object"]')).toHaveCount(0);
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
      await expect(page.locator('[data-ui="content.toolbar.root"]')).not.toBeVisible();
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

  for (const mode of ['visible', 'selection'] as const) {
    test(`QuickEdit document survives ${mode} popup capture at ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(120_000);
      const { page, popup, tabId } = await openCapturePage(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
      try {
        await enableToolbar(popup, page, tabId);
        await editDocumentText(page);
        const before = await completedDownloads(popup);
        if (mode === 'visible') {
          expect(await triggerCapture(popup, tabId, 'quick-action', mode, 10)).toMatchObject({
            success: true,
            result: 'accepted',
          });
          await page.locator('.sniptale-countdown-cancel').click();
          await checkRetainedDocument(page);
          expect(await completedDownloads(popup)).toBe(before);
        }
        expect(await triggerCapture(popup, tabId, 'home', mode)).toMatchObject({
          success: true,
          result: 'accepted',
        });
        if (mode === 'selection') await finishSelection(page);
        await expect.poll(() => completedDownloads(popup), { timeout: 45_000 }).toBe(before + 1);
        await checkRetainedDocument(page);
        await page.screenshot({
          path: info.outputPath('retained-document-edit.png'),
          fullPage: false,
        });
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}
