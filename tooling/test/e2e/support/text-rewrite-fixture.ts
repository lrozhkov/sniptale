import type { Page } from '@playwright/test';
import {
  REVIEW_TEXT_PORT_NAME,
  parseReviewTextClientMessage,
  type ReviewTextClientMessage,
} from '../../../../apps/extension/src/contracts/ai/review-text';
import { aiSettingsQueryResponseSchema } from '../../../../apps/extension/src/contracts/messaging/contracts/ai-settings-schemas';
import { speechModelResponse } from './voiceover-speech-fixture';

export const textModelResponse = aiSettingsQueryResponseSchema.parse({
  ...speechModelResponse,
  modelSelection: {
    ...speechModelResponse.modelSelection,
    providers: speechModelResponse.modelSelection!.providers.map((provider) => ({
      ...provider,
      destinationBinding: `sha256:${'a'.repeat(64)}`,
    })),
    models: [
      ...speechModelResponse.modelSelection!.models,
      {
        id: '00000000-0000-4000-8000-000000000104',
        providerId: '00000000-0000-4000-8000-000000000101',
        modelCode: 'fixture-text',
        displayName: 'Fixture text',
        operation: 'text',
      },
    ],
  },
});

/** The default delay preserves the Gallery sequence. Held responses use an explicit release. */
export async function installTextPortFixture(page: Page, hold = false) {
  await page.evaluate(
    ({ name, hold }) => {
      const original = chrome.runtime.connect.bind(chrome.runtime);
      const requests: unknown[] = [];
      const pending: Array<() => void> = [];
      let holding = hold;
      Object.assign(window, {
        textRewriteFixtureRequests: requests,
        releaseTextRewriteFixture: () => {
          holding = false;
          pending.splice(0).forEach((release) => release());
        },
      });
      chrome.runtime.connect = ((options: chrome.runtime.ConnectInfo) => {
        if (options.name !== name) return original(options);
        const listeners = new Set<(message: unknown) => void>();
        const disconnects = new Set<() => void>();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let closed = false;
        return {
          name,
          onMessage: {
            addListener: (listener: (message: unknown) => void) => listeners.add(listener),
            removeListener: (listener: (message: unknown) => void) => listeners.delete(listener),
          },
          onDisconnect: {
            addListener: (listener: () => void) => disconnects.add(listener),
            removeListener: (listener: () => void) => disconnects.delete(listener),
          },
          disconnect() {
            closed = true;
            clearTimeout(timer);
            disconnects.forEach((listener) => listener());
          },
          postMessage(message: ReviewTextClientMessage) {
            if (message.type !== 'start' || closed) return;
            requests.push(structuredClone(message));
            const respond = () => {
              const fragments = message.context.resegment
                ? [
                    {
                      fromIds: message.context.fragments.map((fragment) => fragment.id),
                      text: `AI: ${message.context.fragments.map((fragment) => fragment.text).join(' ')}`,
                      ...message.context.window,
                    },
                  ]
                : message.context.fragments.map((fragment) => ({
                    fromIds: [fragment.id],
                    text: `AI: ${fragment.text}`,
                    ...(message.context.changeIntervals
                      ? { start: fragment.start, end: fragment.end }
                      : {}),
                  }));
              if (!closed)
                listeners.forEach((listener) =>
                  listener({
                    type: 'proposal',
                    requestId: message.requestId,
                    proposal: { version: 1, fragments },
                  })
                );
            };
            if (holding) pending.push(respond);
            else timer = setTimeout(respond, 750);
          },
        } as unknown as chrome.runtime.Port;
      }) as typeof chrome.runtime.connect;
    },
    { name: REVIEW_TEXT_PORT_NAME, hold }
  );
}

export async function textRewriteRequests(page: Page) {
  const values: unknown = await page.evaluate(() =>
    Reflect.get(window, 'textRewriteFixtureRequests')
  );
  if (!Array.isArray(values)) throw new Error('Text fixture is not installed');
  return values.map((value: unknown) => {
    const parsed = parseReviewTextClientMessage(value);
    if (!parsed || parsed.type !== 'start') throw new Error('Invalid captured text request');
    return parsed;
  });
}

export async function releaseTextRewrite(page: Page) {
  await page.evaluate(() => {
    const release: unknown = Reflect.get(window, 'releaseTextRewriteFixture');
    if (typeof release !== 'function') throw new Error('Text fixture release is unavailable');
    release();
  });
}
