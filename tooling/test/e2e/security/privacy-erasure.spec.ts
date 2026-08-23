import { test, expect } from '../support/extension-fixture';
import {
  collectRetentionText,
  controlCheckpoint,
  openSecurityControl,
  restartExtensionServiceWorker,
} from '../support/security-helpers';
import {
  EMPTY_EXPORT_OPTIONS,
  openRealExtensionPage,
  POPUP_PATH,
  sendRuntimeMessage,
  SETTINGS_PATH,
} from './support';

const ERASURE_MODES = [
  {
    label: 'preserve-preferences',
    preservePreferences: true,
    providerId: '369401e1-2e9b-4a5d-9d9b-c33057d2921f',
  },
  {
    label: 'factory-reset',
    preservePreferences: false,
    providerId: 'f16ec583-7da9-4f55-91cb-221d612bf450',
  },
] as const;

for (const mode of ERASURE_MODES) {
  test(`privacy erasure (${mode.label}) waits for a write and prevents late recreation`, async ({
    context,
    extensionId,
  }) => {
    const control = await openSecurityControl(context, extensionId);
    const writer = await openRealExtensionPage(context, extensionId, SETTINGS_PATH);
    const eraser = await openRealExtensionPage(context, extensionId, SETTINGS_PATH);
    await eraser.evaluate(() =>
      localStorage.setItem('sniptale-theme-preference', 'security-preserved-theme')
    );
    await controlCheckpoint(control, 'pause', 'persistence-before-commit');

    await writer.evaluate((providerId) => {
      Object.assign(window, {
        securityWriter: chrome.runtime.sendMessage({
          __sniptaleRuntimeFreshness: {
            issuedAtEpochMs: Date.now(),
            nonce: crypto.randomUUID(),
          },
          operation: 'add-provider',
          provider: {
            apiKey: `race-secret-${providerId}`,
            baseUrl: 'https://example.test/v1',
            connectionType: 'openai-compatible',
            createdAt: Date.now(),
            id: providerId,
            name: 'Race provider',
          },
          type: 'AI_SETTINGS_MUTATION',
        }),
      });
    }, mode.providerId);
    await controlCheckpoint(control, 'waitUntilPaused', 'persistence-before-commit');

    await eraser.evaluate((preservePreferences) => {
      Object.assign(window, {
        securityErasureSettled: false,
        securityErasure: chrome.runtime
          .sendMessage({
            __sniptaleRuntimeFreshness: {
              issuedAtEpochMs: Date.now(),
              nonce: crypto.randomUUID(),
            },
            includeAiProviderSecrets: true,
            preservePreferences,
            type: 'ERASE_LOCAL_EXTENSION_DATA',
          })
          .finally(() => Object.assign(window, { securityErasureSettled: true })),
      });
    }, mode.preservePreferences);
    await expect
      .poll(() =>
        eraser.evaluate(
          () =>
            (window as typeof window & { securityErasureSettled?: boolean }).securityErasureSettled
        )
      )
      .toBe(false);
    await controlCheckpoint(control, 'release', 'persistence-before-commit');
    const erasure = await eraser.evaluate(
      () => (window as typeof window & { securityErasure: Promise<unknown> }).securityErasure
    );
    if (
      !erasure ||
      typeof erasure !== 'object' ||
      !('success' in erasure) ||
      erasure.success !== true
    ) {
      throw new Error(`Privacy erasure failed: ${JSON.stringify(erasure)}`);
    }
    const writerResult = await writer.evaluate(
      () => (window as typeof window & { securityWriter: Promise<unknown> }).securityWriter
    );
    expect(writerResult).toMatchObject({ success: true });
    await new Promise((resolve) => setTimeout(resolve, 750));
    await restartExtensionServiceWorker(context, eraser);
    const runtimeData = await sendRuntimeMessage(eraser, {
      operation: 'read-settings-page-runtime-data',
      type: 'AI_SETTINGS_QUERY',
    });
    expect(JSON.stringify(runtimeData)).not.toContain(mode.providerId);
    expect(await collectRetentionText(eraser)).not.toContain(mode.providerId);
    expect(await collectRetentionText(eraser)).not.toContain(`race-secret-${mode.providerId}`);
    expect(await eraser.evaluate(() => localStorage.getItem('sniptale-theme-preference'))).toBe(
      mode.preservePreferences ? 'security-preserved-theme' : null
    );

    await writer.close();
    await eraser.close();
    await control.close();
  });
}

test('worker termination during queued erasure remains retryable without late recreation', async ({
  context,
  extensionId,
}) => {
  const providerId = 'fe2f8878-3b33-449d-b680-a648466e69d4';
  const secretCanary = `worker-erasure-secret-${providerId}`;
  const control = await openSecurityControl(context, extensionId);
  const writer = await openRealExtensionPage(context, extensionId, SETTINGS_PATH);
  const eraser = await openRealExtensionPage(context, extensionId, SETTINGS_PATH);
  await controlCheckpoint(control, 'pause', 'persistence-before-commit');

  await writer.evaluate(
    ({ apiKey, id }) => {
      Object.assign(window, {
        interruptedWriter: chrome.runtime
          .sendMessage({
            __sniptaleRuntimeFreshness: {
              issuedAtEpochMs: Date.now(),
              nonce: crypto.randomUUID(),
            },
            operation: 'add-provider',
            provider: {
              apiKey,
              baseUrl: 'https://example.test/v1',
              connectionType: 'openai-compatible',
              createdAt: Date.now(),
              id,
              name: 'Interrupted erasure provider',
            },
            type: 'AI_SETTINGS_MUTATION',
          })
          .catch((error: unknown) => ({ interrupted: true, message: String(error) })),
      });
    },
    { apiKey: secretCanary, id: providerId }
  );
  await controlCheckpoint(control, 'waitUntilPaused', 'persistence-before-commit');
  await eraser.evaluate(() => {
    Object.assign(window, {
      interruptedErasure: chrome.runtime
        .sendMessage({
          __sniptaleRuntimeFreshness: {
            issuedAtEpochMs: Date.now(),
            nonce: crypto.randomUUID(),
          },
          includeAiProviderSecrets: true,
          preservePreferences: false,
          type: 'ERASE_LOCAL_EXTENSION_DATA',
        })
        .catch((error: unknown) => ({ interrupted: true, message: String(error) })),
    });
  });

  await restartExtensionServiceWorker(context, eraser);
  await writer.evaluate(
    () => (window as typeof window & { interruptedWriter: Promise<unknown> }).interruptedWriter
  );
  await eraser.evaluate(
    () => (window as typeof window & { interruptedErasure: Promise<unknown> }).interruptedErasure
  );

  const retry = await sendRuntimeMessage(eraser, {
    includeAiProviderSecrets: true,
    preservePreferences: false,
    type: 'ERASE_LOCAL_EXTENSION_DATA',
  });
  expect(retry).toMatchObject({ success: true });
  await restartExtensionServiceWorker(context, eraser);
  expect(await collectRetentionText(eraser)).not.toContain(providerId);
  expect(await collectRetentionText(eraser)).not.toContain(secretCanary);
  expect(
    JSON.stringify(
      await sendRuntimeMessage(eraser, {
        operation: 'read-settings-page-runtime-data',
        type: 'AI_SETTINGS_QUERY',
      })
    )
  ).not.toContain(providerId);

  await eraser.close();
  await writer.close();
  await control.close();
});

test('factory reset cancels an export admitted before its first publication', async ({
  context,
  extensionId,
}) => {
  const control = await openSecurityControl(context, extensionId);
  const popup = await openRealExtensionPage(context, extensionId, POPUP_PATH);
  const settings = await openRealExtensionPage(context, extensionId, SETTINGS_PATH);
  const tab = await context.newPage();
  await tab.goto('data:text/html,<title>Security export target</title><main>Target</main>');
  const tabId = await popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find((candidate) => candidate.title === 'Security export target');
    if (target?.id === undefined) throw new Error('Security export target tab is unavailable');
    return target.id;
  });
  const downloadsBefore = await popup.evaluate(async () =>
    (await chrome.downloads.search({})).map((download) => download.id)
  );

  await controlCheckpoint(control, 'pause', 'popup-export-after-admission');
  await popup.evaluate(
    ({ options, selectedTabId }) => {
      Object.assign(window, {
        securityExport: chrome.runtime.sendMessage({
          __sniptaleRuntimeFreshness: {
            issuedAtEpochMs: Date.now(),
            nonce: crypto.randomUUID(),
          },
          jobId: 'security-erasure-export',
          options,
          orderedTabs: [{ tabId: selectedTabId, title: 'Security export' }],
          type: 'START_POPUP_EXPORT_JOB',
          warnings: [],
        }),
      });
    },
    { options: EMPTY_EXPORT_OPTIONS, selectedTabId: tabId }
  );
  await controlCheckpoint(control, 'waitUntilPaused', 'popup-export-after-admission');
  const erasurePromise = sendRuntimeMessage(settings, {
    includeAiProviderSecrets: true,
    preservePreferences: false,
    type: 'ERASE_LOCAL_EXTENSION_DATA',
  });
  await controlCheckpoint(control, 'release', 'popup-export-after-admission');
  const erasure = await erasurePromise;
  if (
    !erasure ||
    typeof erasure !== 'object' ||
    !('success' in erasure) ||
    erasure.success !== true
  ) {
    throw new Error(`Export erasure failed: ${JSON.stringify(erasure)}`);
  }
  await popup.evaluate(
    () => (window as typeof window & { securityExport: Promise<unknown> }).securityExport
  );
  await new Promise((resolve) => setTimeout(resolve, 750));
  await restartExtensionServiceWorker(context, popup);
  const status = await sendRuntimeMessage(popup, {
    jobId: 'security-erasure-export',
    type: 'GET_POPUP_EXPORT_JOB_STATUS',
  });
  expect(status).toMatchObject({ success: true, status: null });
  expect(await collectRetentionText(popup)).not.toContain('security-erasure-export');
  const downloadsAfter = await popup.evaluate(async () =>
    (await chrome.downloads.search({})).map((download) => download.id)
  );
  expect(downloadsAfter).toEqual(downloadsBefore);
  await tab.close();
  await popup.close();
  await settings.close();
  await control.close();
});
