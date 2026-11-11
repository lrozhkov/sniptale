import type { Page } from '@playwright/test';

/** Installs a synthetic image provider. No network inference is performed. */
export async function installImageApiFixture(
  page: Page,
  echoInput = false,
  genericInitial = false
) {
  await page.evaluate(
    ({ echoInput, genericInitial }) => {
      const originalSend = chrome.runtime.sendMessage.bind(chrome.runtime);
      Reflect.set(window, 'imageAiRequests', []);
      Reflect.set(window, 'imageAiOpenedTabs', []);
      Reflect.set(chrome.tabs, 'create', async (options: chrome.tabs.CreateProperties) => {
        const opened: unknown = Reflect.get(window, 'imageAiOpenedTabs');
        if (Array.isArray(opened)) opened.push(options);
        return { id: 100, ...options };
      });
      Reflect.set(chrome.runtime, 'sendMessage', async (message: unknown) => {
        if (!message || typeof message !== 'object' || !('type' in message))
          throw new Error('Invalid fixture message');
        if (message.type === 'AI_SETTINGS_QUERY')
          return {
            success: true,
            scenarioSelection: null,
            modelSelection: {
              chromeAiEnabled: false,
              globalSystemPrompt: '',
              providers: [
                {
                  id: '10000000-0000-4000-8000-000000000002',
                  name: 'Synthetic provider',
                  createdAt: 1,
                  connectionType: 'openai-compatible',
                  hasStoredApiKey: true,
                  destinationKind: 'external',
                  destinationBinding: `sha256:${'a'.repeat(64)}`,
                  imageApi: 'routerai',
                },
              ],
              models: [
                ...(genericInitial
                  ? [
                      {
                        id: '10000000-0000-4000-8000-000000000004',
                        providerId: '10000000-0000-4000-8000-000000000002',
                        modelCode: 'aaa-generic-image',
                        displayName: 'Generic image test model',
                        capabilities: {
                          operations: {
                            'image-generation': 'supported',
                            'image-editing': 'supported',
                          },
                          input: { text: 'supported', image: 'supported' },
                          output: { image: 'supported' },
                          features: {},
                        },
                      },
                    ]
                  : []),
                {
                  id: '10000000-0000-4000-8000-000000000001',
                  providerId: '10000000-0000-4000-8000-000000000002',
                  modelCode: 'black-forest-labs/flux-3-image-klein',
                  displayName: 'Image model with a deliberately long descriptive name',
                  capabilities: {
                    operations: { 'image-generation': 'supported', 'image-editing': 'supported' },
                    input: { text: 'supported', image: 'supported' },
                    output: { image: 'supported' },
                    features: {},
                  },
                },
                {
                  id: '10000000-0000-4000-8000-000000000003',
                  providerId: '10000000-0000-4000-8000-000000000002',
                  modelCode: 'google/gemini-3.1-flash-lite-image',
                  displayName: 'Gemini image test model',
                  capabilities: {
                    operations: { 'image-generation': 'supported', 'image-editing': 'supported' },
                    input: { text: 'supported', image: 'supported' },
                    output: { image: 'supported' },
                    features: {},
                  },
                },
              ],
            },
          };
        if (message.type === 'AI_SETTINGS_MUTATION') return { success: true };
        if (message.type === 'REQUEST_LLM_SESSION')
          return { success: true, token: 'synthetic-approval' };
        return originalSend(message);
      });
      const originalConnect = chrome.runtime.connect.bind(chrome.runtime);
      Reflect.set(chrome.runtime, 'connect', (options: chrome.runtime.ConnectInfo) => {
        if (options.name !== 'sniptale-image-editor-ai') return originalConnect(options);
        const listeners = new Set<(message: unknown) => void>();
        const disconnected = new Set<() => void>();
        let closed = false;
        const port = {
          name: options.name,
          onMessage: {
            addListener: (fn: (message: unknown) => void) => listeners.add(fn),
            removeListener: (fn: (message: unknown) => void) => listeners.delete(fn),
          },
          onDisconnect: {
            addListener: (fn: () => void) => disconnected.add(fn),
            removeListener: (fn: () => void) => disconnected.delete(fn),
          },
          disconnect() {
            if (!closed) {
              closed = true;
              disconnected.forEach((fn) => fn());
            }
          },
          postMessage(message: unknown) {
            if (
              !message ||
              typeof message !== 'object' ||
              !('type' in message) ||
              message.type !== 'start' ||
              !('requestId' in message) ||
              !('context' in message)
            )
              return;
            const context = message.context;
            if (
              !context ||
              typeof context !== 'object' ||
              !('images' in context) ||
              !Array.isArray(context.images)
            )
              throw new Error('Invalid fixture context');
            const requests: unknown = Reflect.get(window, 'imageAiRequests');
            if (Array.isArray(requests)) requests.push(message);
            const input: unknown = context.images[0];
            let width = 768,
              height = 768;
            if (
              'parameters' in context &&
              context.parameters &&
              typeof context.parameters === 'object' &&
              'aspectRatio' in context.parameters &&
              context.parameters.aspectRatio === '16:9'
            ) {
              width = 1024;
              height = 576;
            }
            if (
              echoInput &&
              input &&
              typeof input === 'object' &&
              'width' in input &&
              typeof input.width === 'number' &&
              'height' in input &&
              typeof input.height === 'number'
            ) {
              width = input.width;
              height = input.height;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#00a040';
            ctx.fillRect(0, 0, width, height);
            const count =
              'parameters' in context &&
              context.parameters &&
              typeof context.parameters === 'object' &&
              'variants' in context.parameters &&
              typeof context.parameters.variants === 'number'
                ? Math.min(3, Math.max(1, context.parameters.variants))
                : 1;
            const images = Array.from({ length: count }, (_, index) => {
              ctx.fillStyle = ['#00a040', '#0040d0', '#d08000'][index]!;
              ctx.fillRect(0, 0, width, height);
              if ('intention' in context && context.intention === 'region') {
                ctx.fillStyle = '#d02020';
                for (let x = 13; x < width; x += 31) ctx.fillRect(x, 0, 3, height);
              }
              return {
                dataUrl:
                  echoInput &&
                  input &&
                  typeof input === 'object' &&
                  'dataUrl' in input &&
                  typeof input.dataUrl === 'string'
                    ? input.dataUrl
                    : canvas.toDataURL('image/png'),
                width,
                height,
              };
            });
            const complete = () => {
              if (closed) return;
              images.forEach((image, variant) =>
                listeners.forEach((fn) =>
                  fn({ type: 'image', requestId: message.requestId, variant, image })
                )
              );
              listeners.forEach((fn) =>
                fn({ type: 'complete', requestId: message.requestId, received: images.length })
              );
            };
            setTimeout(complete, 50);
          },
        };
        return port;
      });
    },
    { echoInput, genericInitial }
  );
}
