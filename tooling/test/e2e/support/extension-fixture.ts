import {
  test as base,
  expect,
  type BrowserContext,
  type CDPSession,
  type Page,
  type ViewportSize,
} from '@playwright/test';
import { rm } from 'node:fs/promises';
import { dismissFirstRunPrompt, launchExtensionBrowser } from './extension-browser-launch';
import { startHostServer } from './host-server';

type ExtensionPageOptions = {
  viewport?: ViewportSize;
  waitForSelector?: string;
};

type BrowserTarget = {
  type?: string;
  url?: string;
};

type ExtensionFixture = {
  context: BrowserContext;
  extensionId: string;
  hostOrigin: string;
  launchedExtension: Awaited<ReturnType<typeof launchExtensionBrowser>>;
  openExtensionPage: (path: string, options?: ExtensionPageOptions) => Promise<Page>;
};

const EXTENSION_SERVICE_WORKER_PATH = '/service-worker-loader.js';

function buildExtensionUrl(extensionId: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `chrome-extension://${extensionId}/${normalizedPath}`;
}

async function removeWithRetry(targetPath: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : null;
      if (code !== 'ENOTEMPTY' && code !== 'EBUSY') {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

async function stopBrowserProcess(
  browserProcess: ReturnType<typeof launchExtensionBrowser> extends Promise<infer T>
    ? T['browserProcess']
    : never
): Promise<void> {
  if (browserProcess.exitCode !== null || browserProcess.killed) {
    return;
  }

  const exitPromise = new Promise<void>((resolve) => {
    browserProcess.once('exit', () => resolve());
  });

  browserProcess.kill('SIGKILL');
  await exitPromise;
}

async function closeConnectedBrowser(context: BrowserContext): Promise<void> {
  await context
    .browser()
    ?.close()
    .catch(() => undefined);
}

async function createBrowserSession(context: BrowserContext): Promise<CDPSession> {
  const browser = context.browser();
  if (!browser) {
    throw new Error('Extension browser context is not attached to a browser instance');
  }

  return browser.newBrowserCDPSession();
}

async function closeBrowserSession(session: CDPSession): Promise<void> {
  await session.detach().catch(() => undefined);
}

async function resolveExtensionServiceWorkerUrl(
  context: BrowserContext,
  timeoutMs = 15_000
): Promise<string> {
  const session = await createBrowserSession(context);
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const response = (await session.send('Target.getTargets')) as {
        targetInfos?: BrowserTarget[];
      };
      const serviceWorkerUrl = response.targetInfos?.find((target) => {
        return (
          target.type === 'service_worker' &&
          typeof target.url === 'string' &&
          target.url.endsWith(EXTENSION_SERVICE_WORKER_PATH)
        );
      })?.url;

      if (serviceWorkerUrl) {
        return serviceWorkerUrl;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error('Timed out waiting for extension service worker target');
  } finally {
    await closeBrowserSession(session);
  }
}

async function resolveExtensionId(context: BrowserContext): Promise<string> {
  return new URL(await resolveExtensionServiceWorkerUrl(context)).host;
}

export const test = base.extend<ExtensionFixture>({
  launchedExtension: [
    async ({}, use) => {
      const launched = await launchExtensionBrowser();

      try {
        await use(launched);
      } finally {
        await closeConnectedBrowser(launched.context);
        await stopBrowserProcess(launched.browserProcess);
        await removeWithRetry(launched.userDataDir);
      }
    },
    { scope: 'worker' },
  ],

  context: async ({ launchedExtension }, use) => {
    await use(launchedExtension.context);
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await dismissFirstRunPrompt(page);

    try {
      await use(page);
    } finally {
      await page.close().catch(() => undefined);
    }
  },

  extensionId: [
    async ({ launchedExtension }, use) => {
      const extensionId = await resolveExtensionId(launchedExtension.context);
      await use(extensionId);
    },
    { scope: 'worker' },
  ],

  openExtensionPage: async ({ context, extensionId }, use) => {
    await use(async (path, options = {}) => {
      const page = await context.newPage();
      await dismissFirstRunPrompt(page);
      const url = buildExtensionUrl(extensionId, path);

      if (options.viewport) {
        await page.setViewportSize(options.viewport);
      }

      await page.setContent(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>Extension Harness</title>
            <style>
              html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                background: #0b1020;
              }

              #extension-frame {
                display: block;
                width: 100vw;
                height: 100vh;
                border: 0;
                background: #fff;
              }
            </style>
          </head>
          <body>
            <iframe id="extension-frame" src="${url}" allow="clipboard-read; clipboard-write"></iframe>
          </body>
        </html>
      `);

      const frame = page.frameLocator('#extension-frame');

      if (options.waitForSelector) {
        await frame.locator(options.waitForSelector).waitFor({ state: 'visible' });
      }

      return page;
    });
  },

  hostOrigin: [
    async ({}, use) => {
      const { server, origin } = await startHostServer();

      try {
        await use(origin);
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    },
    { scope: 'worker' },
  ],
});

export { expect };
export { resolveExtensionServiceWorkerUrl };
