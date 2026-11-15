import { expect, test, type Page } from '@playwright/test';
import http from 'node:http';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import {
  evaluateInTarget,
  openRealPopup,
  sendRuntimeMessage,
  sendRuntimeMessageInTarget,
  triggerExtensionAction,
} from '../support/recording-action';

async function publication(page: Page, recordingId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (name: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    try {
      const [metadata, events] = await Promise.all([
        read('recording_telemetry'),
        read('recording_events'),
      ]);
      const rows = events.filter(
        (value): value is Record<string, unknown> =>
          typeof value === 'object' &&
          value !== null &&
          'recordingId' in value &&
          value.recordingId === id
      );
      return {
        metadata: metadata.some(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            'recordingId' in value &&
            value.recordingId === id &&
            'recordingEvents' in value
        ),
        finalized: rows.some((value) => value['kind'] === 'head' && value['finalized'] === true),
        facts: rows.filter((value) => value['kind'] === 'fact').length,
      };
    } finally {
      db.close();
    }
  }, recordingId);
}

test('first Library editor receives recording history published after its initial load', async ({}, info) => {
  test.setTimeout(90_000);
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(
      '<!doctype html><title>History publication</title><button style="margin:100px;width:200px;height:80px">Record click</button>'
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('History server is unavailable');
  let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
  let backgroundTarget: string | undefined;
  try {
    launched = await launchExtensionBrowser({ viewport: { width: 1280, height: 560 } });
    const { context, extensionId } = launched;
    const popup = await openRealPopup(context, extensionId);
    const browser = context.browser();
    if (!browser) throw new Error('Recording browser is unavailable');
    const session = await browser.newBrowserCDPSession();
    try {
      const targets = await session.send('Target.getTargets');
      backgroundTarget = targets.targetInfos.find(
        (target) =>
          target.type === 'service_worker' &&
          target.url.startsWith(`chrome-extension://${extensionId}/`)
      )?.targetId;
    } finally {
      await session.detach();
    }
    if (!backgroundTarget) throw new Error('Recording background is unavailable');
    await popup.evaluate(() => {
      Reflect.set(window, 'capturedActions', 0);
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'RECORDING_OBSERVATIONS' && message.eventPacket)
          Reflect.set(
            window,
            'capturedActions',
            Reflect.get(window, 'capturedActions') +
              message.eventPacket.records.filter(
                (record: { kind: string }) => record.kind === 'action'
              ).length
          );
        return false;
      });
    });
    const target = await context.newPage();
    await target.setViewportSize({ width: 1280, height: 560 });
    await target.goto(`http://127.0.0.1:${address.port}/`);
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
          webcamEnabled: false,
          systemAudioEnabled: false,
          controlledCursorCaptureEnabled: false,
          sourceCount: 1,
        },
      },
      false
    );
    await expect
      .poll(() => sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' }))
      .toMatchObject({ state: { status: 'RECORDING' } });
    await target.getByRole('button', { name: 'Record click' }).click();
    await expect
      .poll(() => popup.evaluate(() => Reflect.get(window, 'capturedActions')))
      .toBeGreaterThan(0);
    // Preserve real recording and finalization. Hold only delivery of the completed Stop response.
    await evaluateInTarget(
      context,
      backgroundTarget,
      `(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      const gate = new Promise(resolve => { globalThis.releaseHistoryAcknowledgement = resolve; });
      globalThis.historyAcknowledgementHeld = false;
      chrome.runtime.sendMessage = async (...args) => {
        const response = await original(...args);
        if (args[0]?.type === 'OFFSCREEN_STOP_RECORDING' && !args[0].discard && response?.success) {
          globalThis.historyAcknowledgementHeld = true;
          await gate;
        }
        return response;
      };
      return true;
    })()`
    );
    const active = await sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' });
    if (
      !active ||
      typeof active !== 'object' ||
      !('recordingId' in active) ||
      typeof active.recordingId !== 'string' ||
      !('controlToken' in active)
    )
      throw new Error('Recording capability is unavailable');
    const recordingId = active.recordingId;
    await popup.evaluate(
      (capability) => {
        void chrome.runtime
          .sendMessage({
            type: 'STOP_RECORDING',
            ...capability,
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          })
          .catch(() => undefined);
      },
      { recordingId, controlToken: active.controlToken }
    );
    await expect
      .poll(() =>
        evaluateInTarget(context, backgroundTarget!, 'globalThis.historyAcknowledgementHeld')
      )
      .toBe(true);
    expect(await publication(popup, recordingId)).toMatchObject({
      metadata: false,
      finalized: true,
    });
    expect((await publication(popup, recordingId)).facts).toBeGreaterThan(0);
    const gallery = await context.newPage();
    await gallery.setViewportSize({ width: 1280, height: 560 });
    await gallery.goto(
      `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html?recordingId=${encodeURIComponent(recordingId)}&mode=edit`
    );
    await gallery.getByRole('button', { name: 'Advanced editing', exact: true }).click();
    const markers = gallery.locator(
      '[data-ui="gallery.videoReview.historyStrip"] [data-history-family="mouse"] button'
    );
    await expect(markers).toHaveCount(0);
    await gallery.screenshot({
      path: info.outputPath('before-history-publication.png'),
      fullPage: false,
    });
    await evaluateInTarget(
      context,
      backgroundTarget,
      'globalThis.releaseHistoryAcknowledgement(); true'
    );
    await expect
      .poll(() => publication(popup, recordingId))
      .toMatchObject({ metadata: true, finalized: true });
    await expect(markers.first()).toBeVisible();
    await gallery.screenshot({
      path: info.outputPath('after-history-publication.png'),
      fullPage: false,
    });
  } finally {
    if (launched && backgroundTarget)
      await evaluateInTarget(
        launched.context,
        backgroundTarget,
        'globalThis.releaseHistoryAcknowledgement?.(); true'
      ).catch(() => undefined);
    if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
