import { rm } from 'node:fs/promises';
import { test as base, expect, type BrowserContext } from '@playwright/test';
import {
  launchExtensionBrowser,
  closeExtensionBrowser,
  dismissFirstRunPrompt,
} from '../support/extension-browser-launch';
import { clearLivePasswords, cleanupLiveProviders } from './provider-ui';

/** Every scenario owns its temporary browser, preferences, projects, and media bytes. */
export const test = base.extend<{
  liveExtension: Awaited<ReturnType<typeof launchExtensionBrowser>>;
  context: BrowserContext;
  extensionId: string;
  liveCleanup: void;
}>({
  liveExtension: async ({}, use) => {
    const launched = await launchExtensionBrowser();
    try {
      await use(launched);
    } finally {
      await closeExtensionBrowser(launched);
      await rm(launched.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
  context: async ({ liveExtension }, use) => {
    await use(liveExtension.context);
  },
  extensionId: async ({ liveExtension }, use) => {
    await use(liveExtension.extensionId);
  },
  page: async ({ context, viewport }, use) => {
    const page = await context.newPage();
    if (viewport) await page.setViewportSize(viewport);
    await dismissFirstRunPrompt(page);
    try {
      await use(page);
    } finally {
      await page.close();
    }
  },
  liveCleanup: [
    async ({ page, context }, use) => {
      try {
        await use();
      } finally {
        for (const current of context.pages())
          await clearLivePasswords(current).catch(() => undefined);
        await cleanupLiveProviders(page);
      }
    },
    { auto: true },
  ],
});
export { expect };
