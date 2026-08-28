import type { BrowserContext, Page } from '@playwright/test';
import { acceptOptionalExtensionPermissionPrompt } from '../support/native-permission-prompt';

export async function openRealExtensionPage(
  context: BrowserContext,
  extensionId: string,
  path: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${path.replace(/^\//u, '')}`, {
    waitUntil: 'domcontentloaded',
  });
  return page;
}

export function sendRuntimeMessage(page: Page, message: unknown): Promise<unknown> {
  return page.evaluate(async (payload) => {
    try {
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
      return await chrome.runtime.sendMessage(runtimePayload);
    } catch (error) {
      return {
        transportError: error instanceof Error ? error.message : String(error),
      };
    }
  }, message);
}

export async function grantAllSitesAccessFromSettings(settings: Page): Promise<void> {
  const granted = await settings.evaluate(() =>
    chrome.permissions.contains({ origins: ['<all_urls>'] })
  );
  if (granted) return;

  const allSites = settings.getByRole('button', { name: /^(All sites|Все сайты)$/u });
  await allSites.waitFor({ state: 'visible' });
  await allSites.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  acceptOptionalExtensionPermissionPrompt();
  await settings.waitForFunction(() => chrome.permissions.contains({ origins: ['<all_urls>'] }));
  await settings.waitForFunction(async () =>
    (await chrome.scripting.getRegisteredContentScripts()).some(
      (entry) => entry.id === 'sniptale-page-access-all-sites'
    )
  );
  await allSites.waitFor({ state: 'attached' });
  if (await allSites.isEnabled()) {
    await settings.waitForFunction(() =>
      Array.from(document.querySelectorAll('button')).some(
        (button) =>
          ['All sites', 'Все сайты'].includes(button.textContent?.trim() ?? '') && button.disabled
      )
    );
  }
}

export async function revokeAllSitesAccessFromSettings(settings: Page): Promise<void> {
  const granted = await settings.evaluate(() =>
    chrome.permissions.contains({ origins: ['<all_urls>'] })
  );
  if (!granted) return;
  await settings.getByRole('button', { name: /^(Ask per site|Спрашивать)$/u }).click();
  await settings.waitForFunction(
    async () => !(await chrome.permissions.contains({ origins: ['<all_urls>'] }))
  );
}

export async function issuePopupTabRouteCapability(args: {
  operation: string;
  popup: Page;
  requestId: string;
  tabId: number;
}): Promise<string> {
  const response = (await sendRuntimeMessage(args.popup, {
    operation: args.operation,
    requestId: args.requestId,
    tabId: args.tabId,
    type: 'REQUEST_POPUP_TAB_ROUTE_CAPABILITY',
  })) as { capabilityToken?: unknown; success?: unknown };
  if (response.success !== true || typeof response.capabilityToken !== 'string') {
    throw new Error(`Popup tab-route capability was not issued: ${JSON.stringify(response)}`);
  }
  return response.capabilityToken;
}

export async function saveWebSnapshotThroughPopup(args: {
  popup: Page;
  requestId: string;
  tabId: number;
}): Promise<unknown> {
  await args.popup.evaluate(async () => {
    await chrome.storage.local.set({ sniptale_web_snapshot_local_consent: true });
  });
  const started = (await startPagePackageSave(args)) as { error?: string; success?: boolean };
  if (started.success !== true) return started;
  return waitForPagePackageSave(args.popup, args.requestId);
}

export function startPagePackageSave(args: {
  popup: Page;
  requestId: string;
  tabId: number;
}): Promise<unknown> {
  return sendRuntimeMessage(args.popup, {
    includeWebCopy: true,
    intent: 'save',
    jobId: args.requestId,
    orderedTabs: [{ tabId: args.tabId, title: 'Security fixture' }],
    options: { ...EMPTY_EXPORT_OPTIONS, includeFullPageScreenshot: true },
    type: 'START_PAGE_PACKAGE_JOB',
    warnings: [],
  });
}

export async function waitForPagePackageSave(popup: Page, jobId: string): Promise<unknown> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const response = (await sendRuntimeMessage(popup, {
      jobId,
      type: 'GET_PAGE_PACKAGE_JOB_STATUS',
    })) as {
      error?: string;
      status?: {
        phase?: string;
        result?: { errors?: string[]; snapshotIds?: string[]; warnings?: string[] };
        warnings?: string[];
      };
      success?: boolean;
    };
    if (response.success !== true) return response;
    if (response.status?.phase === 'completed') {
      return {
        assetId: response.status.result?.snapshotIds?.[0],
        success: true,
        warnings: response.status.result?.warnings ?? response.status.warnings ?? [],
      };
    }
    if (
      response.status?.phase &&
      ['cancelled', 'failed', 'interrupted'].includes(response.status.phase)
    ) {
      return {
        error: response.status.result?.errors?.join('; ') || `Snapshot ${response.status.phase}`,
        success: false,
      };
    }
    await popup.waitForTimeout(50);
  }
  return { error: 'Snapshot save timed out', success: false };
}

export const SETTINGS_PATH = 'apps/extension/src/settings/index.html';
export const POPUP_PATH = 'apps/extension/src/popup/index.html';

export const EMPTY_EXPORT_OPTIONS = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: false,
  includeFullPageScreenshot: false,
  includeImages: false,
  includeJson: false,
  includeMarkdown: false,
  includePageDiagnostics: false,
};
