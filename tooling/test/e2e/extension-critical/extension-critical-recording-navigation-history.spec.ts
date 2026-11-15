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

async function historyStates(page: import('@playwright/test').Page, recordingId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = db
          .transaction('recording_telemetry')
          .objectStore('recording_telemetry')
          .get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const state = (entry: unknown) =>
        typeof entry === 'object' && entry !== null && 'state' in entry ? entry.state : null;
      if (typeof value !== 'object' || value === null) return null;
      return {
        events: state('recordingEvents' in value ? value.recordingEvents : null),
        cursor: state('cursorTrajectory' in value ? value.cursorTrajectory : null),
      };
    } finally {
      db.close();
    }
  }, recordingId);
}

for (const loadingResource of [
  'image',
  'pre-body-script',
  'pre-body-script-and-image',
  'destination-response',
] as const) {
  test(`TAB history resumes around ${loadingResource} loading and BFCache return`, async ({}, info) => {
    test.setTimeout(90_000);
    let releaseResource = () => {};
    let releaseImage = () => {};
    const resourceRequested = Promise.withResolvers<void>();
    const server = http.createServer((request, response) => {
      if (request.url === '/held-image' || request.url === '/held-script') {
        const release = () => {
          if (response.writableEnded || response.destroyed) return;
          response.writeHead(204);
          response.end();
        };
        if (request.url === '/held-image' && loadingResource === 'pre-body-script-and-image')
          releaseImage = release;
        else {
          releaseResource = release;
          resourceRequested.resolve();
        }
        return;
      }
      const writePage = () => {
        if (response.writableEnded || response.destroyed) return;
        response.setHeader('content-type', 'text/html');
        const loading = request.url === '/loading';
        const script =
          loading && loadingResource.startsWith('pre-body-script')
            ? '<script src="/held-script"></script>'
            : '';
        const image =
          loading &&
          (loadingResource === 'image' || loadingResource === 'pre-body-script-and-image')
            ? '<img src="/held-image">'
            : '';
        response.end(`<!doctype html><head><title>Recording navigation</title>
      ${script}</head><body>
      <button style="margin:100px;width:200px;height:80px">Record click</button>
      ${image}</body>`);
      };
      if (request.url === '/loading' && loadingResource === 'destination-response') {
        releaseResource = writePage;
        resourceRequested.resolve();
      } else writePage();
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
      await expect
        .poll(() =>
          evaluateInTarget(
            context,
            actionTarget,
            `!!document.querySelector('[data-ui="popup.menu.route"]')`
          )
        )
        .toBe(true);
      // Finish first-render preference initialization before testing recording navigation.
      await evaluateInTarget(
        context,
        actionTarget,
        "navigator.locks.request('sniptale:persistence:privacy-erasure', { mode: 'shared' }, () => true)",
        true
      );
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
      if (loadingResource === 'destination-response') {
        const navigation = target.goto(`${origin}/loading`, { waitUntil: 'commit' });
        void navigation.catch(() => undefined);
        await resourceRequested.promise;
        expect(target.url()).toBe(`${origin}/initial`);
        await target.mouse.click(200, 140);
        await expect.poll(() => historyCount(`${origin}/initial`, 'action')).toBeGreaterThan(0);
        releaseResource();
        await navigation;
      } else {
        await target.goto(`${origin}/loading`, {
          waitUntil: loadingResource === 'image' ? 'domcontentloaded' : 'commit',
        });
      }
      await resourceRequested.promise;
      if (loadingResource.startsWith('pre-body-script')) {
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
      if (loadingResource === 'image' || loadingResource === 'pre-body-script-and-image')
        expect(await target.evaluate(() => document.readyState)).not.toBe('complete');
      await target.getByRole('button', { name: 'Record click', exact: true }).click();
      await expect.poll(() => historyCount(`${origin}/loading`, 'action')).toBeGreaterThan(0);
      await target.screenshot({
        path: info.outputPath('collecting-before-load.png'),
        fullPage: false,
      });
      releaseResource();
      releaseImage();
      await target.waitForLoadState('load');
      const before = await historyCount(`${origin}/initial`, 'segment');
      const actionsBeforeReturn = await historyCount(`${origin}/initial`, 'action');
      await target.goBack({ waitUntil: 'commit' });
      await expect
        .poll(() => target.evaluate(() => Reflect.get(window, 'restoredFromCache')))
        .toBe(true);
      await expect.poll(() => historyCount(`${origin}/initial`, 'segment')).toBeGreaterThan(before);
      await target.getByRole('button', { name: 'Record click', exact: true }).click();
      await expect
        .poll(() => historyCount(`${origin}/initial`, 'action'))
        .toBeGreaterThan(actionsBeforeReturn);
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
      await expect
        .poll(() => historyStates(gallery, String(active.recordingId)))
        .toEqual({ events: 'complete', cursor: 'complete' });
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
      releaseImage();
      if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
