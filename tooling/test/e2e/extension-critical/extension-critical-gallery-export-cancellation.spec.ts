import { expect, test, type Page } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { terminateExtensionServiceWorker } from '../support/extension-fixture';
import { startHostServer } from '../support/host-server';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  evaluateInTarget,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';

interface ExportCancellationFault {
  armed: boolean;
  entered: boolean;
  closed: number;
}

declare global {
  interface Window {
    exportCancellationFault: ExportCancellationFault;
  }
}

/** Keep one native render encoder pending until its owner closes it on cancellation. */
async function installPendingEncoder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeEncoder = VideoEncoder;
    const fault: ExportCancellationFault = { armed: false, entered: false, closed: 0 };
    window.exportCancellationFault = fault;
    window.VideoEncoder = new Proxy(NativeEncoder, {
      construct(Target, [init]: ConstructorParameters<typeof VideoEncoder>) {
        const encoder = new Target(init);
        let chosen = false;
        let held = false;
        const waiting: EventListenerOrEventListenerObject[] = [];
        const nativeQueue = Object.getOwnPropertyDescriptor(
          NativeEncoder.prototype,
          'encodeQueueSize'
        )?.get;
        if (!nativeQueue) throw new Error('Native encoder queue getter is unavailable');
        const configure = encoder.configure.bind(encoder);
        const encode = encoder.encode.bind(encoder);
        const close = encoder.close.bind(encoder);
        const addEventListener = encoder.addEventListener.bind(encoder);
        encoder.configure = (config) => {
          // Render samples carry display geometry; capability probes remain native.
          chosen = fault.armed && !!config.displayWidth && !fault.entered;
          configure(config);
        };
        encoder.encode = (frame, options) => {
          if (chosen) {
            held = true;
            fault.entered = true;
            return;
          }
          encode(frame, options);
        };
        Object.defineProperty(encoder, 'encodeQueueSize', {
          get: () => (held ? 4 : Reflect.apply(nativeQueue, encoder, [])),
        });
        encoder.addEventListener = ((type, listener, options) => {
          if (type === 'dequeue' && held) {
            if (listener) waiting.push(listener);
            return;
          }
          addEventListener(type, listener, options);
        }) as typeof encoder.addEventListener;
        encoder.close = () => {
          close();
          if (!held) return;
          held = false;
          fault.closed += 1;
          for (const listener of waiting.splice(0)) {
            const event = new Event('dequeue');
            if (typeof listener === 'function') listener.call(encoder, event);
            else listener.handleEvent(event);
          }
        };
        return encoder;
      },
    });
  });
}

async function stagedWriterCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const locks = await navigator.locks.query();
    return locks.held.filter(
      (lock) => lock.name === 'sniptale:persistence:privacy-erasure:transition'
    ).length;
  });
}

test('canceling a pending fragment render releases capture and permits another export', async ({}, info) => {
  test.setTimeout(120_000);
  const host = await startHostServer();
  const directory = await mkdtemp(join(process.cwd(), '.tmp/export-cancellation-'));
  const extension = join(directory, 'extension');
  await cp(process.env.SNIPTALE_EXTENSION_BUILD_DIR ?? '.tmp/e2e-builds/test', extension, {
    recursive: true,
  });
  const manifestPath = join(extension, 'manifest.json');
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest))
    throw new Error('Invalid extension manifest');
  // Native capture needs activeTab or an all-sites grant in this disposable browser.
  await writeFile(manifestPath, JSON.stringify({ ...manifest, host_permissions: ['<all_urls>'] }));
  const launched = await launchExtensionBrowser({
    extensionBuildDir: extension.replace(`${process.cwd()}/`, ''),
    viewport: PRIMARY_BROWSER_VIEWPORTS[1].size,
  });
  const { context, extensionId } = launched;
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  try {
    await installPendingEncoder(page);
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
    await page.evaluate(() => chrome.storage.local.set({ 'sniptale-locale-preference': 'en' }));
    await page.reload();
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    await addReviewFocus(page);
    await dialog
      .locator('[data-ui="gallery.videoReview.focusType"]')
      .getByRole('button', {
        name: label('gallery.videoReview.focusLens'),
        exact: true,
      })
      .click();
    await dialog.getByRole('button', { name: 'Scene', exact: true }).click();
    await dialog
      .locator('[data-ui="gallery.videoReview.canvasSettings"]')
      .getByRole('button', {
        name: label('videoEditor.sidebar.canvasResolutionLabel'),
        exact: true,
      })
      .click();
    await page.getByRole('option', { name: '1280 × 720', exact: true }).click();
    await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
    await dialog
      .getByRole('button', { name: label('videoEditor.exportDialog.resolutionLabel'), exact: true })
      .click();
    await page.getByRole('option', { name: '480p', exact: true }).click();

    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    const ruler = plane.locator('[data-ui="gallery.videoReview.ruler"]');
    const bounds = await ruler.boundingBox();
    if (!bounds) throw new Error('Review timeline is unavailable');
    const duration = Number(await plane.getAttribute('aria-valuemax'));
    await page.mouse.move(bounds.x + (bounds.width * 0.25) / duration, bounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + (bounds.width * 1.25) / duration, bounds.y + 12, { steps: 8 });
    await page.mouse.up();
    const exportSelection = dialog.getByRole('button', {
      name: label('gallery.videoReview.exportSelection'),
      exact: true,
    });
    await page.evaluate(() => {
      window.exportCancellationFault.armed = true;
    });
    await exportSelection.click();
    await expect.poll(() => page.evaluate(() => window.exportCancellationFault.entered)).toBe(true);
    await expect.poll(() => stagedWriterCount(page)).toBe(1);
    await page.screenshot({ path: info.outputPath('pending-export.png'), fullPage: false });
    const cancel = dialog.getByRole('button', {
      name: label('gallery.videoReview.cancelExport'),
      exact: true,
    });
    await cancel.click();
    await expect.poll(() => page.evaluate(() => window.exportCancellationFault.closed)).toBe(1);
    await expect(cancel).toHaveCount(0);
    await expect.poll(() => stagedWriterCount(page)).toBe(0);

    const coldGallery = await context.newPage();
    await coldGallery.goto(page.url());
    await expect(coldGallery.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    await coldGallery.close();
    const target = await context.newPage();
    await target.goto(host.origin);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    const tabId = await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
      if (typeof tab?.id !== 'number') throw new Error('Capture target is unavailable');
      await chrome.tabs.update(tab.id, { active: true });
      return tab.id;
    }, target.url());
    expect(
      await popup.evaluate(
        (id) =>
          chrome.runtime.sendMessage({
            type: 'PAGE_ACCESS',
            operation: 'register-granted-site',
            tabId: id,
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          }),
        tabId
      )
    ).toMatchObject({ success: true, result: 'registered' });
    await terminateExtensionServiceWorker(context);
    await target.bringToFront();
    const editorOpened = context.waitForEvent('page');
    const popupTarget = await triggerExtensionAction(context, extensionId, target);
    try {
      expect(
        await sendRuntimeMessageInTarget(context, popupTarget, {
          type: 'TRIGGER_SCREENSHOT_CAPTURE',
          tabId,
          config: {
            screenshotMode: 'visible',
            viewportPresetId: null,
            delay: 0,
            afterCapture: 'edit',
            imageFormat: 'png',
            imageQuality: 90,
            exitAfterCapture: true,
          },
        })
      ).toMatchObject({ success: true });
      const editor = await editorOpened;
      await editor.waitForURL(/editor/);
      await expect(editor.locator('[data-ui="editor.floating.tool-rail"]')).toBeVisible();
      await expect(editor.locator('[data-ui="editor.page.open-loading"]')).toHaveCount(0);
      await editor.screenshot({
        path: info.outputPath('recovered-adjacent-screenshot.png'),
        fullPage: false,
      });
      await editor.close();
    } finally {
      await evaluateInTarget(context, popupTarget, 'window.close()').catch(() => undefined);
    }
    await popup.close();
    await target.close();
    await page.bringToFront();
    const downloading = page.waitForEvent('download');
    await exportSelection.click();
    const download = await downloading;
    await download.saveAs(info.outputPath('retry.webm'));
    expect(await download.failure()).toBeNull();
    await expect.poll(() => stagedWriterCount(page)).toBe(0);
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
