import { z } from 'zod';
import { expect, type BrowserContext, type Page } from '@playwright/test';

const runtimeReplySchema = z.object({
  error: z.unknown().optional(),
  id: z.number().optional(),
  result: z
    .object({
      exceptionDetails: z.unknown().optional(),
      result: z.object({ value: z.unknown().optional() }).optional(),
    })
    .optional(),
});

const POPUP_PATH = 'apps/extension/src/popup/index.html';

export function sendRuntimeMessage(page: Page, message: unknown): Promise<unknown> {
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

export async function openRealPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/${POPUP_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  await popup.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });
  return popup;
}

export async function triggerExtensionAction(
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

export async function sendRuntimeMessageInTarget(
  context: BrowserContext,
  targetId: string,
  message: unknown,
  awaitPromise = true
) {
  const serializedMessage = JSON.stringify(message);
  return evaluateInTarget(
    context,
    targetId,
    `(async () => chrome.runtime.sendMessage({ ...${serializedMessage}, ` +
      '__sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), ' +
      'nonce: crypto.randomUUID() } }))()',
    awaitPromise
  );
}

export async function evaluateInTarget(
  context: BrowserContext,
  targetId: string,
  expression: string,
  awaitPromise = false
): Promise<unknown> {
  const browser = context.browser();
  if (!browser) throw new Error('Extension context has no browser owner');
  const session = await browser.newBrowserCDPSession();
  let attachedSessionId: string | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const attached = (await session.send('Target.attachToTarget', {
      flatten: false,
      targetId,
    })) as { sessionId: string };
    attachedSessionId = attached.sessionId;
    const evaluationResponse = new Promise<{
      error?: unknown;
      result?: { exceptionDetails?: unknown; result?: { value?: unknown } };
    }>((resolve, reject) => {
      const onMessage = (event: { message: string; sessionId: string }) => {
        if (event.sessionId !== attached.sessionId) return;
        try {
          const raw: unknown = JSON.parse(event.message);
          const response = runtimeReplySchema.parse(raw);
          if (response.id !== 1) return;
          session.off('Target.receivedMessageFromTarget', onMessage);
          resolve(response);
        } catch (error) {
          session.off('Target.receivedMessageFromTarget', onMessage);
          reject(error);
        }
      };
      session.on('Target.receivedMessageFromTarget', onMessage);
    });
    await session.send('Target.sendMessageToTarget', {
      message: JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          awaitPromise,
          expression,
          returnByValue: true,
        },
      }),
      sessionId: attached.sessionId,
    });
    const evaluated = await Promise.race([
      evaluationResponse,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('CDP runtime reply timed out')), 10000);
      }),
    ]);
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
    clearTimeout(timeout);
    if (attachedSessionId) {
      await session
        .send('Target.detachFromTarget', { sessionId: attachedSessionId })
        .catch(() => undefined);
    }
    await session.detach().catch(() => undefined);
  }
}
