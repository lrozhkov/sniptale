import type { BrowserContext, Page } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { expect, terminateExtensionServiceWorker, test } from '../support/extension-fixture';

const POPUP_PATH = 'apps/extension/src/popup/index.html';
const RECORDING_LEASE_KEY = 'video-active-recording-lease';

function sendRuntimeMessage(page: Page, message: unknown): Promise<unknown> {
  return page.evaluate(async (payload) => {
    const runtimePayload =
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? {
            ...payload,
            __sniptaleRuntimeFreshness: {
              issuedAtEpochMs: Date.now(),
              nonce: crypto.randomUUID(),
            },
          }
        : payload;
    return chrome.runtime.sendMessage(runtimePayload);
  }, message);
}

async function openRealPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/${POPUP_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  await popup.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });
  return popup;
}

async function triggerExtensionAction(
  context: BrowserContext,
  extensionId: string,
  targetPage: Page
): Promise<string> {
  const browser = context.browser();
  if (!browser) throw new Error('Extension context has no browser owner');
  const session = await browser.newBrowserCDPSession();
  try {
    const tabTargets = (await session.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }, { exclude: true }],
    })) as { targetInfos?: { targetId?: string; type?: string; url?: string }[] };
    const targetId = tabTargets.targetInfos?.find(
      (candidate) => candidate.type === 'tab' && candidate.url === targetPage.url()
    )?.targetId;
    if (!targetId) throw new Error('Action target tab is unavailable');
    const existingTargets = (await session.send('Target.getTargets')) as {
      targetInfos?: { targetId?: string }[];
    };
    const existingTargetIds = new Set(
      existingTargets.targetInfos?.flatMap((candidate) =>
        candidate.targetId ? [candidate.targetId] : []
      ) ?? []
    );

    await session.send('Extensions.triggerAction', { id: extensionId, targetId });
    const popupUrl = `chrome-extension://${extensionId}/${POPUP_PATH}`;
    await expect
      .poll(async () => {
        const actionTargets = (await session.send('Target.getTargets')) as {
          targetInfos?: { targetId?: string; type?: string; url?: string }[];
        };
        return (
          actionTargets.targetInfos?.find(
            (candidate) =>
              candidate.type === 'page' &&
              candidate.url === popupUrl &&
              candidate.targetId !== undefined &&
              !existingTargetIds.has(candidate.targetId)
          )?.targetId ?? null
        );
      })
      .not.toBeNull();
    const actionTargets = (await session.send('Target.getTargets')) as {
      targetInfos?: { targetId?: string; type?: string; url?: string }[];
    };
    const actionPopupTargetId = actionTargets.targetInfos?.find(
      (candidate) =>
        candidate.type === 'page' &&
        candidate.url === popupUrl &&
        candidate.targetId !== undefined &&
        !existingTargetIds.has(candidate.targetId)
    )?.targetId;
    if (!actionPopupTargetId) throw new Error('Triggered action popup target is unavailable');
    return actionPopupTargetId;
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function closeBrowserTarget(context: BrowserContext, targetId: string): Promise<void> {
  const browser = context.browser();
  if (!browser) throw new Error('Extension context has no browser owner');
  const session = await browser.newBrowserCDPSession();
  try {
    await session.send('Target.closeTarget', { targetId });
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function sendRuntimeMessageInTarget(
  context: BrowserContext,
  targetId: string,
  message: unknown
): Promise<unknown> {
  const browser = context.browser();
  if (!browser) throw new Error('Extension context has no browser owner');
  const session = await browser.newBrowserCDPSession();
  let attachedSessionId: string | null = null;
  try {
    const attached = (await session.send('Target.attachToTarget', {
      flatten: false,
      targetId,
    })) as { sessionId: string };
    attachedSessionId = attached.sessionId;
    const evaluationResponse = new Promise<{
      error?: unknown;
      result?: { exceptionDetails?: unknown; result?: { value?: unknown } };
    }>((resolve) => {
      const onMessage = (event: { message: string; sessionId: string }) => {
        if (event.sessionId !== attached.sessionId) return;
        const response = JSON.parse(event.message) as {
          error?: unknown;
          id?: number;
          result?: { exceptionDetails?: unknown; result?: { value?: unknown } };
        };
        if (response.id !== 1) return;
        session.off('Target.receivedMessageFromTarget', onMessage);
        resolve(response);
      };
      session.on('Target.receivedMessageFromTarget', onMessage);
    });
    const serializedMessage = JSON.stringify(message);
    await session.send('Target.sendMessageToTarget', {
      message: JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          awaitPromise: true,
          expression:
            `(async () => chrome.runtime.sendMessage({ ...${serializedMessage}, ` +
            '__sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), ' +
            'nonce: crypto.randomUUID() } }))()',
          returnByValue: true,
        },
      }),
      sessionId: attached.sessionId,
    });
    const evaluated = await evaluationResponse;
    if (evaluated.error) {
      throw new Error(`Action popup CDP evaluation failed: ${JSON.stringify(evaluated.error)}`);
    }
    if (evaluated.result?.exceptionDetails) {
      throw new Error(
        `Action popup runtime message failed: ${JSON.stringify(evaluated.result.exceptionDetails)}`
      );
    }
    return evaluated.result?.result?.value;
  } finally {
    if (attachedSessionId) {
      await session
        .send('Target.detachFromTarget', { sessionId: attachedSessionId })
        .catch(() => undefined);
    }
    await session.detach().catch(() => undefined);
  }
}

async function countDurableRecordings(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === 'sniptale-db')) return 0;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = database
        .transaction('recordings', 'readonly')
        .objectStore('recordings')
        .count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return count;
  });
}

for (const initialState of ['active', 'paused'] as const) {
  test(`${initialState} recording stops and finalizes once after a real worker restart`, async ({
    context,
    extensionId,
    hostOrigin,
  }) => {
    let popup: Page | null = null;
    let recoveredPopup: Page | null = null;
    let target: Page | null = null;
    let actionPopupTargetId: string | null = null;
    try {
      popup = await openRealPopup(context, extensionId);
      expect(
        await sendRuntimeMessage(popup, {
          operation: 'register-granted-all-sites',
          type: 'PAGE_ACCESS',
        })
      ).toMatchObject({ success: true });
      await expect
        .poll(() =>
          popup?.evaluate(async () =>
            (await chrome.scripting.getRegisteredContentScripts()).some(
              (entry) => entry.id === 'sniptale-page-access-all-sites'
            )
          )
        )
        .toBe(true);
      const recordingsBefore = await countDurableRecordings(popup);
      target = await context.newPage();
      await target.goto(
        `${hostOrigin}/fixtures/host-page.html?recording-worker-restart=${initialState}`
      );
      await target.bringToFront();
      actionPopupTargetId = await triggerExtensionAction(context, extensionId, target);
      const tabId = await popup.evaluate(async (targetUrl) => {
        const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === targetUrl);
        if (tab?.id === undefined) throw new Error('Recording target tab is unavailable');
        return tab.id;
      }, target.url());
      expect(
        await sendRuntimeMessage(popup, {
          operation: 'register-granted-all-sites',
          tabId,
          type: 'PAGE_ACCESS',
        })
      ).toMatchObject({ success: true });
      await expect
        .poll(() =>
          sendRuntimeMessage(popup as Page, {
            operation: 'read-status',
            tabId,
            type: 'PAGE_ACCESS',
          })
        )
        .toMatchObject({
          status: { allSitesGranted: true, currentTabActive: true, supported: true },
          success: true,
        });
      expect(
        await sendRuntimeMessageInTarget(context, actionPopupTargetId, {
          captureMode: CaptureMode.TAB,
          settings: {
            ...DEFAULT_VIDEO_SETTINGS,
            controlledCursorCaptureEnabled: false,
            countdownSeconds: 0,
            microphoneEnabled: false,
            sourceCount: 1,
            systemAudioEnabled: false,
            webcamEnabled: false,
          },
          tabId,
          type: 'START_RECORDING',
          viewportPresetId: null,
        })
      ).toMatchObject({ result: 'accepted' });
      await closeBrowserTarget(context, actionPopupTargetId);
      actionPopupTargetId = null;
      await expect
        .poll(() => popup?.evaluate((key) => chrome.storage.session.get(key), RECORDING_LEASE_KEY))
        .toMatchObject({ [RECORDING_LEASE_KEY]: { phase: 'active' } });
      await expect
        .poll(() => sendRuntimeMessage(popup as Page, { type: 'GET_RECORDING_STATE' }))
        .toMatchObject({ state: { status: VideoRecordingStatus.RECORDING }, success: true });
      const activeState = (await sendRuntimeMessage(popup, {
        type: 'GET_RECORDING_STATE',
      })) as { controlToken?: unknown; recordingId?: unknown; state?: { status?: unknown } };
      expect(activeState).toMatchObject({
        controlToken: expect.any(String),
        recordingId: expect.any(String),
        state: { status: VideoRecordingStatus.RECORDING },
      });

      if (initialState === 'paused') {
        expect(
          await sendRuntimeMessage(popup, {
            controlToken: activeState.controlToken,
            recordingId: activeState.recordingId,
            type: 'PAUSE_RECORDING',
          })
        ).toMatchObject({ result: 'accepted', success: true });
        await expect
          .poll(() => sendRuntimeMessage(popup as Page, { type: 'GET_RECORDING_STATE' }))
          .toMatchObject({ state: { status: VideoRecordingStatus.PAUSED }, success: true });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await sendRuntimeMessage(popup, { type: 'GET_RECORDING_STATE' })).toMatchObject({
        state: {
          status:
            initialState === 'paused'
              ? VideoRecordingStatus.PAUSED
              : VideoRecordingStatus.RECORDING,
        },
        success: true,
      });
      await popup.close();
      popup = null;
      await terminateExtensionServiceWorker(context);

      recoveredPopup = await openRealPopup(context, extensionId);
      const recoveredState = (await sendRuntimeMessage(recoveredPopup, {
        type: 'GET_RECORDING_STATE',
      })) as { controlToken?: unknown; recordingId?: unknown };
      expect(recoveredState).toMatchObject({
        controlToken: expect.any(String),
        recordingId: expect.any(String),
        state: { status: VideoRecordingStatus.RECORDING },
        success: true,
      });
      const stop = recoveredPopup.locator('[data-ui="popup.video-active.stop-button"]');
      await expect(stop).toBeEnabled();
      await target.bringToFront();
      actionPopupTargetId = await triggerExtensionAction(context, extensionId, target);
      const stopResponse = sendRuntimeMessageInTarget(context, actionPopupTargetId, {
        controlToken: recoveredState.controlToken,
        recordingId: recoveredState.recordingId,
        type: 'STOP_RECORDING',
      });
      await expect
        .poll(() => countDurableRecordings(recoveredPopup as Page), { timeout: 30_000 })
        .toBe(recordingsBefore + 1);
      expect(await stopResponse).toMatchObject({ result: 'accepted', success: true });
      await closeBrowserTarget(context, actionPopupTargetId);
      actionPopupTargetId = null;
      await expect
        .poll(
          () =>
            recoveredPopup?.evaluate((key) => chrome.storage.session.get(key), RECORDING_LEASE_KEY),
          { timeout: 30_000 }
        )
        .toEqual({});
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(await countDurableRecordings(recoveredPopup)).toBe(recordingsBefore + 1);
      expect(
        await sendRuntimeMessage(recoveredPopup, { type: 'GET_RECORDING_STATE' })
      ).toMatchObject({ state: { status: VideoRecordingStatus.IDLE }, success: true });
      expect(typeof recoveredState.recordingId).toBe('string');
      expect(
        await sendRuntimeMessage(recoveredPopup, {
          recordingId: recoveredState.recordingId,
          type: 'ACKNOWLEDGE_POST_RECORD_RESULT',
        })
      ).toMatchObject({ result: 'acknowledged', success: true });
    } finally {
      if (actionPopupTargetId) {
        await closeBrowserTarget(context, actionPopupTargetId).catch(() => undefined);
      }
      await recoveredPopup?.close().catch(() => undefined);
      await popup?.close().catch(() => undefined);
      await target?.close().catch(() => undefined);
    }
  });
}
