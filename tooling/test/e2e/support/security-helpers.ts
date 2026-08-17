import type { BrowserContext, Page } from '@playwright/test';
import {
  expect,
  resolveExtensionServiceWorkerUrl,
  terminateExtensionServiceWorker,
} from './extension-fixture';

export type SecurityCheckpoint = 'persistence-before-commit' | 'popup-export-after-admission';

type SecurityControl = {
  readonly disconnected: boolean;
  pause(checkpoint: SecurityCheckpoint): Promise<{ ok: boolean }>;
  release(checkpoint: SecurityCheckpoint): Promise<{ ok: boolean }>;
  snapshot(): Promise<{ ok: boolean; paused: SecurityCheckpoint[]; reached: SecurityCheckpoint[] }>;
  waitUntilPaused(checkpoint: SecurityCheckpoint): Promise<{ ok: boolean }>;
};

declare global {
  interface Window {
    securityE2EControl?: SecurityControl;
  }
}

export async function openSecurityControl(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/tooling/test/harness/security-control.html`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('security-control-ready')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.securityE2EControl))).toBe(true);
  return page;
}

export function controlCheckpoint(
  page: Page,
  operation: 'pause' | 'release' | 'waitUntilPaused',
  checkpoint: SecurityCheckpoint
): Promise<{ ok: boolean }> {
  return page.evaluate(
    async ({ checkpoint: selected, operation: selectedOperation }) => {
      const control = window.securityE2EControl;
      if (!control) throw new Error('Security E2E control is unavailable');
      return control[selectedOperation](selected);
    },
    { checkpoint, operation }
  );
}

export async function restartExtensionServiceWorker(
  context: BrowserContext,
  extensionPage: Page
): Promise<void> {
  await terminateExtensionServiceWorker(context);
  await extensionPage.evaluate(async () => {
    await chrome.runtime
      .sendMessage({
        __sniptaleRuntimeFreshness: {
          issuedAtEpochMs: Date.now(),
          nonce: crypto.randomUUID(),
        },
        type: 'UNKNOWN_SECURITY_WAKE',
      })
      .catch(() => undefined);
  });
  await expect(resolveExtensionServiceWorkerUrl(context)).resolves.toContain('chrome-extension://');
}

export async function collectRetentionText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const storage = {
      local: await chrome.storage.local.get(null),
      session: await chrome.storage.session.get(null),
      sync: await chrome.storage.sync.get(null),
    };
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    const indexedDb: Record<string, unknown> = {};
    for (const descriptor of databases) {
      if (!descriptor.name) continue;
      indexedDb[descriptor.name] = await new Promise((resolve, reject) => {
        const request = indexedDB.open(descriptor.name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const storeNames = Array.from(database.objectStoreNames);
          if (storeNames.length === 0) {
            database.close();
            resolve({});
            return;
          }
          const transaction = database.transaction(storeNames, 'readonly');
          const result: Record<string, unknown[]> = {};
          let remaining = storeNames.length;
          for (const storeName of storeNames) {
            const values = transaction.objectStore(storeName).getAll();
            values.onerror = () => reject(values.error);
            values.onsuccess = () => {
              result[storeName] = values.result;
              remaining -= 1;
              if (remaining === 0) {
                database.close();
                resolve(result);
              }
            };
          }
        };
      });
    }
    return JSON.stringify({ indexedDb, storage });
  });
}
