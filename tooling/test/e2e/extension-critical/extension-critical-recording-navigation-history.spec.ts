import { expect, test } from '@playwright/test';
import http from 'node:http';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import {
  openRealPopup,
  evaluateInTarget,
  sendRuntimeMessage,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';

for (const loadingResource of ['image', 'pre-body-script'] as const) {
  test(`TAB history resumes around ${loadingResource} loading and BFCache return`, async ({}, info) => {
    test.setTimeout(90_000);
    let releaseResource = () => {};
    const resourceRequested = Promise.withResolvers<void>();
    const server = http.createServer((request, response) => {
      if (request.url === '/held-image' || request.url === '/held-script') {
        releaseResource = () => {
          if (response.writableEnded || response.destroyed) return;
          response.writeHead(204);
          response.end();
        };
        resourceRequested.resolve();
        return;
      }
      response.setHeader('content-type', 'text/html');
      response.end(`<!doctype html><head><title>Recording navigation</title>
      ${request.url === '/loading' && loadingResource === 'pre-body-script' ? '<script src="/held-script"></script>' : ''}</head><body>
      <button style="margin:100px;width:200px;height:80px">Record click</button>
      ${request.url === '/loading' && loadingResource === 'image' ? '<img src="/held-image">' : ''}</body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Navigation server is unavailable');
    const origin = `http://127.0.0.1:${address.port}`;
    let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
    try {
      launched = await launchExtensionBrowser({
        viewport: { width: 1280, height: 560 },
        enableBackForwardCache: true,
      });
      const { context, extensionId } = launched;
      await context.addInitScript(() => {
        window.addEventListener('pageshow', (event) => {
          Reflect.set(window, 'restoredFromCache', event.persisted);
        });
      });
      const popup = await openRealPopup(context, extensionId);
      const browser = context.browser();
      if (!browser) throw new Error('Recording browser is unavailable');
      const session = await browser.newBrowserCDPSession();
      let workerTarget: string;
      try {
        const targets = await session.send('Target.getTargets');
        const worker = targets.targetInfos.find(
          (target) =>
            target.type === 'service_worker' &&
            target.url.startsWith(`chrome-extension://${extensionId}/`)
        );
        if (!worker) throw new Error('Background worker target is unavailable');
        workerTarget = worker.targetId;
      } finally {
        await session.detach();
      }
      await evaluateInTarget(
        context,
        workerTarget,
        `(() => {
        globalThis.earlyRuntimeReadinessFailed = false;
        const original = console.warn.bind(console);
        console.warn = (...values) => {
          if (values.some(value => value instanceof Error && value.message === 'Content runtime did not become ready after injection.')) globalThis.earlyRuntimeReadinessFailed = true;
          original(...values);
        };
        return true;
      })()`
      );

      await popup.evaluate(() => {
        Reflect.set(window, 'historyPackets', []);
        chrome.runtime.onMessage.addListener((message, sender) => {
          if (message.type === 'RECORDING_OBSERVATIONS' && message.eventPacket && sender.tab)
            Reflect.get(window, 'historyPackets').push({
              url: sender.url,
              packet: message.eventPacket,
            });
          return false;
        });
      });
      const target = await context.newPage();
      await target.setViewportSize({ width: 1280, height: 560 });
      await target.goto(`${origin}/initial`);
      const tabId = await popup.evaluate(
        async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
        target.url()
      );
      expect(
        await sendRuntimeMessage(popup, {
          type: 'PAGE_ACCESS',
          operation: 'register-granted-all-sites',
          tabId,
        })
      ).toMatchObject({ success: true });
      await target.bringToFront();
      const actionTarget = await triggerExtensionAction(context, extensionId, target);
      await sendRuntimeMessageInTarget(
        context,
        actionTarget,
        {
          type: 'START_RECORDING',
          captureMode: 'TAB',
          tabId,
          viewportPresetId: null,
          settings: {
            ...DEFAULT_VIDEO_SETTINGS,
            countdownSeconds: 0,
            microphoneEnabled: false,
            systemAudioEnabled: false,
            webcamEnabled: false,
            controlledCursorCaptureEnabled: false,
            sourceCount: 1,
          },
        },
        false
      );
      await expect
        .poll(() => sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' }))
        .toMatchObject({ state: { status: 'RECORDING' } });
      const active = await sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' });
      const historyCount = (url: string, kind: string) =>
        popup.evaluate(
          ({ url, kind }) => {
            const packets: { url: string; packet: { records: { kind: string }[] } }[] = Reflect.get(
              window,
              'historyPackets'
            );
            return packets
              .filter((entry) => entry.url === url)
              .flatMap((entry) => entry.packet.records)
              .filter((record) => record.kind === kind).length;
          },
          { url, kind }
        );
      await expect.poll(() => historyCount(`${origin}/initial`, 'segment')).toBeGreaterThan(0);
      await target.goto(`${origin}/loading`, {
        waitUntil: loadingResource === 'image' ? 'domcontentloaded' : 'commit',
      });
      await resourceRequested.promise;
      if (loadingResource === 'pre-body-script') {
        await expect
          .poll(
            () => evaluateInTarget(context, workerTarget, 'globalThis.earlyRuntimeReadinessFailed'),
            { timeout: 15000 }
          )
          .toBe(true);
        expect(await target.evaluate(() => document.body === null)).toBe(true);
        releaseResource();
        await target.waitForLoadState('domcontentloaded');
      }
      await expect
        .poll(() => historyCount(`${origin}/loading`, 'segment'), { timeout: 5000 })
        .toBeGreaterThan(0);
      if (loadingResource === 'image')
        expect(await target.evaluate(() => document.readyState)).not.toBe('complete');
      await target.getByRole('button', { name: 'Record click', exact: true }).click();
      await expect.poll(() => historyCount(`${origin}/loading`, 'action')).toBeGreaterThan(0);
      await target.screenshot({
        path: info.outputPath('collecting-before-load.png'),
        fullPage: false,
      });
      releaseResource();
      await target.waitForLoadState('load');
      const before = await historyCount(`${origin}/initial`, 'segment');
      await target.goBack({ waitUntil: 'commit' });
      await expect
        .poll(() => target.evaluate(() => Reflect.get(window, 'restoredFromCache')))
        .toBe(true);
      await expect.poll(() => historyCount(`${origin}/initial`, 'segment')).toBeGreaterThan(before);
      await target.getByRole('button', { name: 'Record click', exact: true }).click();
      await expect.poll(() => historyCount(`${origin}/initial`, 'action')).toBeGreaterThan(0);
      if (
        !active ||
        typeof active !== 'object' ||
        !('recordingId' in active) ||
        !('controlToken' in active)
      )
        throw new Error('Recording capability is unavailable');
      expect(
        await sendRuntimeMessage(popup, {
          type: 'STOP_RECORDING',
          recordingId: active.recordingId,
          controlToken: active.controlToken,
        })
      ).toMatchObject({ result: 'accepted' });
      await expect
        .poll(() => sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' }))
        .toMatchObject({ state: { status: 'IDLE' } });
      const gallery = await context.newPage();
      await gallery.setViewportSize({ width: 1280, height: 560 });
      await gallery.goto(
        `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html?recordingId=${encodeURIComponent(String(active.recordingId))}&mode=edit`
      );
      await expect(gallery.locator('[data-ui="gallery.videoReview.dialog"]')).toBeVisible();
      await gallery.getByRole('button', { name: 'Advanced editing', exact: true }).click();
      await expect(
        gallery
          .locator(
            '[data-ui="gallery.videoReview.historyStrip"] [data-history-family="mouse"] button'
          )
          .first()
      ).toBeVisible();
      await gallery.screenshot({
        path: info.outputPath('saved-navigation-history.png'),
        fullPage: false,
      });
    } finally {
      releaseResource();
      if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
