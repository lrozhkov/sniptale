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
      const [metadata, events, media, cursor] = await Promise.all([
        read('recording_telemetry'),
        read('recording_events'),
        read('recordings'),
        read('recording_cursor_trajectories'),
      ]);
      const rows = events.filter(
        (value): value is Record<string, unknown> =>
          typeof value === 'object' &&
          value !== null &&
          'recordingId' in value &&
          value.recordingId === id
      );
      return {
        mediaReady: media.some(
          (value) => typeof value === 'object' && value !== null && 'id' in value && value.id === id
        ),
        historyState: rows.find((value) => value['kind'] === 'head')?.['state'],
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
        cursorRows: cursor.filter(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            'recordingId' in value &&
            value.recordingId === id
        ),
        factRecords: rows
          .filter((value) => value['kind'] === 'fact')
          .map((value) => value['record']),
      };
    } finally {
      db.close();
    }
  }, recordingId);
}

for (const phase of ['stop-ack', 'terminal-source'] as const) {
  test(`first Library editor receives history after ${phase} delivery`, async ({}, info) => {
    test.setTimeout(90_000);
    const server = http.createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<!doctype html><title>History publication</title>' +
          '<button style="margin:100px;width:200px;height:80px">Record click</button>'
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('History server is unavailable');
    let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
    let backgroundTarget: string | undefined;
    let releaseTerminal: (() => Promise<void>) | undefined;
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
      await expect
        .poll(() =>
          evaluateInTarget(
            context,
            actionTarget,
            `!!document.querySelector('[data-ui="popup.menu.route"]')`
          )
        )
        .toBe(true);
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

      if (phase === 'terminal-source') {
        if (typeof tabId !== 'number') throw new Error('Recording tab is unavailable');
        await popup.evaluate(async (id) => {
          await chrome.scripting.executeScript({
            target: { tabId: id, frameIds: [0] },
            func: () => {
              const original = chrome.runtime.sendMessage;
              const gate = new Promise<void>((resolve) =>
                Reflect.set(globalThis, 'releaseTerminalHistory', resolve)
              );
              Reflect.set(globalThis, 'terminalHistoryHeld', 0);
              const isStop = (value: unknown) =>
                typeof value === 'object' &&
                value !== null &&
                'records' in value &&
                Array.isArray(value.records) &&
                value.records.some(
                  (record: unknown) =>
                    typeof record === 'object' &&
                    record !== null &&
                    'kind' in record &&
                    record.kind === 'boundary' &&
                    'reason' in record &&
                    record.reason === 'stop'
                );
              Reflect.set(chrome.runtime, 'sendMessage', async (...args: unknown[]) => {
                const message = args[0];
                if (
                  typeof message === 'object' &&
                  message !== null &&
                  'type' in message &&
                  message.type === 'RECORDING_OBSERVATIONS' &&
                  (isStop('eventPacket' in message ? message.eventPacket : null) ||
                    isStop('cursorPacket' in message ? message.cursorPacket : null) ||
                    ('eventPackets' in message &&
                      Array.isArray(message.eventPackets) &&
                      message.eventPackets.some(isStop)) ||
                    ('cursorPackets' in message &&
                      Array.isArray(message.cursorPackets) &&
                      message.cursorPackets.some(isStop)))
                ) {
                  Reflect.set(
                    globalThis,
                    'terminalHistoryHeld',
                    Reflect.get(globalThis, 'terminalHistoryHeld') + 1
                  );
                  await gate;
                }
                return Reflect.apply(original, chrome.runtime, args);
              });
            },
          });
        }, tabId);
        releaseTerminal = async () => {
          await popup.evaluate(async (id) => {
            await chrome.scripting.executeScript({
              target: { tabId: id, frameIds: [0] },
              func: () => {
                Reflect.get(globalThis, 'releaseTerminalHistory')?.();
              },
            });
          }, tabId);
        };
      }
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
              __sniptaleRuntimeFreshness: {
                issuedAtEpochMs: Date.now(),
                nonce: crypto.randomUUID(),
              },
            })
            .catch(() => undefined);
        },
        { recordingId, controlToken: active.controlToken }
      );

      if (phase === 'terminal-source') {
        if (typeof tabId !== 'number') throw new Error('Recording tab is unavailable');
        await expect
          .poll(
            async () =>
              (
                await popup.evaluate(
                  (id) =>
                    chrome.scripting.executeScript({
                      target: { tabId: id, frameIds: [0] },
                      func: () => Reflect.get(globalThis, 'terminalHistoryHeld'),
                    }),
                  tabId
                )
              )[0]?.result
          )
          .toBe(2);
        await expect
          .poll(() => publication(popup, recordingId))
          .toMatchObject({ mediaReady: true });
        await releaseTerminal?.();
      }
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
      if (phase === 'terminal-source')
        expect((await publication(popup, recordingId)).historyState).toBe('complete');
      const gallery = await context.newPage();
      await gallery.setViewportSize({ width: 1280, height: 560 });
      const galleryUrl = `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`;
      await gallery.goto(`${galleryUrl}?recordingId=${encodeURIComponent(recordingId)}&mode=edit`);
      await gallery.getByRole('button', { name: 'Advanced editing', exact: true }).click();
      const markers = gallery.locator(
        '[data-ui="gallery.videoReview.historyStrip"] [data-history-family="mouse"] button'
      );
      await expect(markers).toHaveCount(0);
      await gallery.evaluate(() => {
        const channel = new BroadcastChannel('sniptale-media-hub');
        Reflect.set(window, 'publicationEvents', []);
        Reflect.set(window, 'publicationChannel', channel);
        channel.onmessage = (event) => Reflect.get(window, 'publicationEvents').push(event.data);
      });
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
      try {
        await expect(markers.first()).toBeVisible();
      } catch (error) {
        await (async () => {
          await info.attach('history-publication-state', {
            body: JSON.stringify(
              {
                publication: await publication(popup, recordingId),
                events: await gallery.evaluate(() => Reflect.get(window, 'publicationEvents')),
              },
              null,
              2
            ),
            contentType: 'application/json',
          });
          await gallery.reload();
          await gallery.getByRole('button', { name: 'Advanced editing', exact: true }).click();
          await info.attach('history-after-reload', {
            body: JSON.stringify({ markers: await markers.count() }),
            contentType: 'application/json',
          });
        })().catch(() => undefined);
        throw error;
      }
      await gallery.screenshot({
        path: info.outputPath('after-history-publication.png'),
        fullPage: false,
      });
    } finally {
      await releaseTerminal?.().catch(() => undefined);
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
}
