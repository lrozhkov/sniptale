import { writeFile } from 'node:fs/promises';
import { test, expect, type BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  triggerExtensionAction,
  evaluateInTarget,
  sendRuntimeMessageInTarget,
  sendRuntimeMessage,
} from '../support/recording-action';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

const popupPath = 'apps/extension/src/popup/index.html';
const settingsPath = 'apps/extension/src/settings/index.html';
const statusCommand = () => ({
  type: 'SYNC_PRODUCT_COMMAND',
  requestId: crypto.randomUUID(),
  command: { kind: 'runtime-status' },
});

// Native action popups have no Playwright Page. Capture their CDP viewport without scrolling.
async function screenshot(
  context: BrowserContext,
  targetId: string,
  options: { path: string; fullPage: false }
) {
  const browser = context.browser();
  if (!browser) throw new Error('Native popup browser unavailable');
  const session = await browser.newBrowserCDPSession();
  const attached = await session.send('Target.attachToTarget', { targetId, flatten: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = new Promise<string>((resolve, reject) => {
      session.on('Target.receivedMessageFromTarget', (event) => {
        if (event.sessionId !== attached.sessionId) return;
        try {
          const value = z
            .object({
              id: z.number().optional(),
              result: z.object({ data: z.string() }).optional(),
              error: z.unknown().optional(),
            })
            .parse(JSON.parse(event.message));
          if (value.id !== 71) return;
          if (value.error || !value.result) reject(new Error('Native popup screenshot refused'));
          else resolve(value.result.data);
        } catch {
          reject(new Error('Native popup screenshot response invalid'));
        }
      });
      timer = setTimeout(() => reject(new Error('Native popup screenshot timed out')), 10000);
    });
    await session.send('Target.sendMessageToTarget', {
      sessionId: attached.sessionId,
      message: JSON.stringify({
        id: 71,
        method: 'Page.captureScreenshot',
        params: { format: 'png', captureBeyondViewport: options.fullPage, fromSurface: true },
      }),
    });
    await writeFile(options.path, Buffer.from(await result, 'base64'));
  } finally {
    clearTimeout(timer);
    await session
      .send('Target.detachFromTarget', { sessionId: attached.sessionId })
      .catch(() => undefined);
    await session.detach();
  }
}
async function closePopup(context: BrowserContext, targetId: string) {
  const browser = context.browser();
  if (!browser) throw new Error('Native popup browser unavailable');
  const session = await browser.newBrowserCDPSession();
  try {
    await session.send('Target.closeTarget', { targetId });
  } finally {
    await session.detach();
  }
}

for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const) {
    const viewport = PRIMARY_BROWSER_VIEWPORTS[theme === 'light' ? 0 : 1];
    test(`native popup sync authority and repair ${locale} ${theme} ${viewport.size.width}x${viewport.size.height}`, async ({}, info) => {
      const host = await startHostServer();
      let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | null = null;
      try {
        launched = await launchExtensionBrowser({
          viewport: viewport.size,
          headlessScreen: { width: 1920, height: 1080 },
        });
        const { context, extensionId } = launched;
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
        await worker.evaluate(
          async ({ locale, theme }) =>
            chrome.storage.local.set({
              'sniptale-locale-preference': locale,
              'sniptale-theme-preference': theme,
              sniptale_popup_startup: {
                selection: 'menu',
                lastPage: 'menu',
                lastExportDestination: 'export',
              },
            }),
          { locale, theme }
        );
        const settings = await context.newPage();
        await settings.goto(
          `chrome-extension://${extensionId}/${settingsPath}?section=saving&view=connection`
        );
        await expect(settings.locator('main')).toBeVisible();
        await expect
          .poll(() =>
            settings.evaluate(async () =>
              (await indexedDB.databases()).some((db) => db.name === 'sniptale-db')
            )
          )
          .toBe(true);
        const nativeCounts = () =>
          settings.evaluate(async () => {
            const request = indexedDB.open('sniptale-db');
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              return await Promise.all(
                ['sync_capture', 'sync_connection', 'sync_outbox'].map(
                  (name) =>
                    new Promise<number>((resolve, reject) => {
                      const count = db.transaction(name, 'readonly').objectStore(name).count();
                      count.onsuccess = () => resolve(count.result);
                      count.onerror = () => reject(count.error);
                    })
                )
              );
            } finally {
              db.close();
            }
          });
        const before = await nativeCounts();
        const impostor = await context.newPage();
        await impostor.goto(`chrome-extension://${extensionId}/${popupPath}`);
        expect(await sendRuntimeMessage(impostor, statusCommand())).toMatchObject({
          success: false,
        });
        await impostor.close();
        const source = await context.newPage();
        await source.goto(host.origin);
        const httpMethods: string[] = [];
        const davRequests: string[] = [];
        context.on('request', (request) => {
          if (request.url().startsWith('http')) httpMethods.push(request.method());
          if (request.url().startsWith('https://dav.example.test/'))
            davRequests.push(request.method());
        });
        let target = await triggerExtensionAction(context, extensionId, source);
        const first = await sendRuntimeMessageInTarget(context, target, statusCommand());
        expect(first).toMatchObject({
          success: true,
          result: { kind: 'runtime-status', status: { configuration: 'unconfigured' } },
        });
        for (let i = 0; i < 3; i++)
          expect(await sendRuntimeMessageInTarget(context, target, statusCommand())).toEqual(first);
        for (const kind of ['status', 'checkpoint-policy']) {
          expect(
            await sendRuntimeMessageInTarget(context, target, {
              type: 'SYNC_PRODUCT_COMMAND',
              requestId: crypto.randomUUID(),
              command: { kind },
            })
          ).toMatchObject({ success: false });
        }
        await expect
          .poll(() =>
            evaluateInTarget(
              context,
              target,
              `({
                width: innerWidth,
                height: innerHeight,
                status: !!document.querySelector('[data-ui="popup.footer.sync-status"]')
              })`
            )
          )
          .toEqual({ width: 392, height: 560, status: false });
        await evaluateInTarget(context, target, 'document.fonts.ready.then(() => true)', true);
        await screenshot(context, target, {
          path: info.outputPath('unconfigured-popup.png'),
          fullPage: false,
        });
        expect(await nativeCounts()).toEqual(before);
        expect(httpMethods).not.toContain('PUT');
        await closePopup(context, target);
        target = await triggerExtensionAction(context, extensionId, source);
        expect(await sendRuntimeMessageInTarget(context, target, statusCommand())).toEqual(first);
        expect(await nativeCounts()).toEqual(before);
        await closePopup(context, target);

        // Controlled native auth-update snapshot proves presentation and navigation, not enrollment.
        await settings.evaluate(async () => {
          const request = indexedDB.open('sniptale-db');
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const tx = db.transaction(['sync_capture', 'sync_connection'], 'readwrite');
            tx.objectStore('sync_capture').put({
              version: 1,
              kind: 'profile',
              key: 'profile',
              enabled: true,
              createdAt: 1,
              spaceId: 'native-popup-proof',
              connectionGeneration: 1,
            });
            tx.objectStore('sync_connection').put({
              version: 1,
              kind: 'sync-connection',
              key: 'connection',
              binding: {
                provider: 'webdav',
                rootUrl: 'https://dav.example.test/native-popup/',
                accountId: 'synthetic',
                spaceId: 'native-popup-proof',
                connectionGeneration: 1,
                profileCreatedAt: 1,
              },
              identity: { incarnation: crypto.randomUUID(), revision: 1 },
              phase: 'updating-auth',
              updateNonce: crypto.randomUUID(),
              credentialId: null,
            });
            await new Promise<void>((resolve, reject) => {
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
              tx.onerror = () => reject(tx.error);
            });
          } finally {
            db.close();
          }
        });
        await settings.goto(
          `chrome-extension://${extensionId}/${settingsPath}?section=saving&view=queue`
        );
        await expect(settings).toHaveURL(/view=queue$/u);
        const authUpdateCounts = await nativeCounts();
        target = await triggerExtensionAction(context, extensionId, source);
        await expect
          .poll(() => sendRuntimeMessageInTarget(context, target, statusCommand()))
          .toMatchObject({
            success: true,
            result: {
              status: {
                configuration: 'configured',
                connection: 'updating-auth',
                repair: 'connection',
              },
            },
          });
        await expect
          .poll(() =>
            evaluateInTarget(
              context,
              target,
              `(() => {
          const footer = document.querySelector('[data-ui="shared.ui.popup-footer"]');
          const control = document.querySelector('[data-ui="popup.footer.sync-status"]');
          return { rows: footer?.children.length, inActions: !!control?.closest('[data-ui="popup.footer.actions"]'), height: footer?.getBoundingClientRect().height };
        })()`
            )
          )
          .toEqual({ rows: 1, inActions: true, height: 44 });
        const safe = await sendRuntimeMessageInTarget(context, target, statusCommand());
        for (const privateKey of ['credentialId', 'authorization', 'workspaceFingerprint', 'scope'])
          expect(JSON.stringify(safe)).not.toContain(privateKey);
        await screenshot(context, target, {
          path: info.outputPath('connection-repair-popup.png'),
          fullPage: false,
        });
        const visibility = () =>
          evaluateInTarget(
            context,
            target,
            `(() => {
          const owner = document.querySelector('[data-ui="popup.menu.content"]');
          const bounds = owner.getBoundingClientRect();
          return {
            scrollHeight: owner.scrollHeight,
            clientHeight: owner.clientHeight,
            scrollTop: owner.scrollTop,
            pageScrollTop: document.documentElement.scrollTop,
            labels: Array.from(
              document.querySelectorAll('[data-ui="popup.menu.workspace"] button span')
            ).map(label => {
              const box = label.getBoundingClientRect();
              return {
                text: label.textContent,
                clipped: label.scrollHeight > label.clientHeight + 1,
                visible: box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1
              };
            })
          };
        })()`
          );
        await writeFile(
          info.outputPath('menu-visibility-before.json'),
          JSON.stringify(await visibility(), null, 2)
        );
        await evaluateInTarget(
          context,
          target,
          `document.querySelector('[data-ui="popup.menu.content"]').scrollTo({ top: 100000, behavior: 'instant' })`
        );
        await expect
          .poll(async () => {
            const value = z
              .object({
                pageScrollTop: z.number(),
                labels: z.array(z.object({ visible: z.boolean(), clipped: z.boolean() })),
              })
              .parse(await visibility());
            return (
              value.pageScrollTop === 0 &&
              value.labels.length === 4 &&
              value.labels.every((label) => label.visible && !label.clipped)
            );
          })
          .toBe(true);
        await writeFile(
          info.outputPath('menu-visibility-after.json'),
          JSON.stringify(await visibility(), null, 2)
        );
        await screenshot(context, target, {
          path: info.outputPath('connection-repair-workspace-popup.png'),
          fullPage: false,
        });

        await evaluateInTarget(
          context,
          target,
          `document.querySelector('[data-ui="popup.footer.sync-status"] button').click()`
        );
        await expect
          .poll(() =>
            evaluateInTarget(
              context,
              target,
              `document.querySelector('[data-ui="popup.footer.sync-action"]')?.textContent?.trim()`
            )
          )
          .toBe(locale === 'ru' ? 'Исправить' : 'Resolve');
        await expect
          .poll(() =>
            evaluateInTarget(
              context,
              target,
              `(() => {
          const rect = document.querySelector('[data-ui="popup.footer.sync-popover"]')?.getBoundingClientRect();
          return !!rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
        })()`
            )
          )
          .toBe(true);
        await expect
          .poll(() =>
            evaluateInTarget(
              context,
              target,
              `(() => {
          const panel = document.querySelector('[data-ui="popup.footer.sync-popover"]');
          if (!panel) return false;
          const color = getComputedStyle(panel).backgroundColor;
          return color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent';
        })()`
            )
          )
          .toBe(true);
        await evaluateInTarget(
          context,
          target,
          `Promise.all(document.querySelector('[data-ui="popup.footer.sync-popover"]').getAnimations({ subtree: true }).map(animation => animation.finished)).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))`,
          true
        );
        await screenshot(context, target, {
          path: info.outputPath('sync-disclosure.png'),
          fullPage: false,
        });
        await evaluateInTarget(
          context,
          target,
          `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
        );
        await expect
          .poll(() =>
            evaluateInTarget(
              context,
              target,
              `({ closed: !document.querySelector('[role="dialog"]'), focused: document.activeElement === document.querySelector('[data-ui="popup.footer.sync-status"] button') })`
            )
          )
          .toEqual({ closed: true, focused: true });
        await evaluateInTarget(context, target, `document.activeElement.click()`);
        await evaluateInTarget(
          context,
          target,
          `document.querySelector('[data-ui="popup.footer.sync-action"]').click()`
        );
        await expect(settings).toHaveURL(
          `chrome-extension://${extensionId}/${settingsPath}?section=saving&view=connection`
        );
        expect(await nativeCounts()).toEqual(authUpdateCounts);
        expect(httpMethods).not.toContain('PUT');
        expect(httpMethods.filter((method) => method !== 'GET')).toEqual([]);
        expect(davRequests).toEqual([]);
      } finally {
        if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
