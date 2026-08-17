import { test, expect } from '../support/extension-fixture';
import type { Page } from '@playwright/test';
import { collectRetentionText, restartExtensionServiceWorker } from '../support/security-helpers';
import {
  grantAllSitesAccessFromSettings,
  openRealExtensionPage,
  revokeAllSitesAccessFromSettings,
  sendRuntimeMessage,
  SETTINGS_PATH,
} from './support';

const API_KEY_CANARY = 'sk-security-e2e-canary-never-retain';
const PASSPHRASE_CANARY = 'security-e2e-passphrase-never-retain';

test('provider secrets stay encrypted and passphrase protection relocks after worker restart', async ({
  context,
  extensionId,
  hostOrigin,
  hostRequests,
}) => {
  const networkMaterial: string[] = [];
  const browserMessages: string[] = [];
  const downloads: string[] = [];
  context.on('request', (request) =>
    networkMaterial.push(
      JSON.stringify({
        headers: request.headers(),
        postData: request.postData(),
        url: request.url(),
      })
    )
  );
  const observePage = (page: Page) => {
    page.on('console', (message) => browserMessages.push(message.text()));
    page.on('pageerror', (error) => browserMessages.push(error.message));
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
  };
  context.pages().forEach(observePage);
  context.on('page', observePage);
  const settings = await openRealExtensionPage(
    context,
    extensionId,
    `${SETTINGS_PATH}?section=ai-connections`
  );
  const consoleMessages: string[] = [];
  settings.on('console', (message) => consoleMessages.push(message.text()));
  const providers = settings.getByRole('region', { name: /^(Providers|Провайдеры)$/u });
  await providers.getByRole('button', { name: /^(Add|Добавить)$/u }).click();
  const providerDialog = settings.getByRole('dialog');
  const providerInputs = providerDialog.locator('input');
  await providerInputs.nth(0).fill('Security E2E provider');
  await providerInputs.nth(1).fill(`${hostOrigin}/provider/v1`);
  await providerInputs.nth(2).fill(API_KEY_CANARY);
  await providerDialog.getByRole('button', { name: /^(Add|Добавить)$/u }).click();
  await expect(providers).toContainText('Security E2E provider');

  await settings.goto(
    `chrome-extension://${extensionId}/${SETTINGS_PATH}?section=ai-connections&view=security`
  );
  await settings.getByRole('switch', { name: /^(AI key protection|Защита ключей AI)$/u }).click();
  const protectionDialog = settings.getByRole('dialog');
  await protectionDialog.locator('input').nth(0).fill(PASSPHRASE_CANARY);
  await protectionDialog.locator('input').nth(1).fill(PASSPHRASE_CANARY);
  await protectionDialog.getByRole('button', { name: /^(Save|Сохранить)$/u }).click();
  await expect(
    settings.getByText(
      /^(On, current session is unlocked\.|Включено, текущая сессия разблокирована\.)$/u
    )
  ).toBeVisible();

  const retained = await collectRetentionText(settings);
  expect(retained).not.toContain(API_KEY_CANARY);
  expect(retained).not.toContain(PASSPHRASE_CANARY);
  expect(await settings.locator('body').innerText()).not.toContain(API_KEY_CANARY);
  expect(consoleMessages.join('\n')).not.toContain(API_KEY_CANARY);

  const runtimeData = (await sendRuntimeMessage(settings, {
    operation: 'read-settings-page-runtime-data',
    type: 'AI_SETTINGS_QUERY',
  })) as { data?: unknown };
  expect(JSON.stringify(runtimeData)).not.toContain(API_KEY_CANARY);
  expect(JSON.stringify(runtimeData)).toContain('hasStoredApiKey');

  const unlocked = await sendRuntimeMessage(settings, {
    operation: 'read-secret-protection-status',
    type: 'AI_SETTINGS_MUTATION',
  });
  expect(unlocked).toMatchObject({
    secretProtectionStatus: { isEnabled: true, isUnlocked: true, mode: 'passphrase' },
    success: true,
  });

  await restartExtensionServiceWorker(context, settings);
  const relocked = await sendRuntimeMessage(settings, {
    operation: 'read-secret-protection-status',
    type: 'AI_SETTINGS_MUTATION',
  });
  expect(relocked).toMatchObject({
    secretProtectionStatus: { isEnabled: true, isUnlocked: false, mode: 'passphrase' },
    success: true,
  });
  expect(await collectRetentionText(settings)).not.toContain(API_KEY_CANARY);

  const accessSettings = await openRealExtensionPage(
    context,
    extensionId,
    `${SETTINGS_PATH}?section=access-data`
  );
  await grantAllSitesAccessFromSettings(accessSettings);
  const content = await context.newPage();
  await content.goto(`${hostOrigin}/fixtures/host-page.html?locked-provider=1`);
  const tabId = await settings.evaluate(async (targetUrl) => {
    const target = (await chrome.tabs.query({})).find((tab) => tab.url === targetUrl);
    if (target?.id === undefined) throw new Error('Locked provider target tab is unavailable');
    return target.id;
  }, content.url());
  const requestOffset = hostRequests.length;
  const [lockedAdmission] = await settings.evaluate(async (targetTabId) => {
    return chrome.scripting.executeScript({
      target: { frameIds: [0], tabId: targetTabId },
      func: async () =>
        chrome.runtime.sendMessage({
          __sniptaleRuntimeFreshness: {
            issuedAtEpochMs: Date.now(),
            nonce: crypto.randomUUID(),
          },
          egressAuthority: {
            captureMode: 'selected_editable',
            contractVersion: 1,
            payloadHash: `sha256:${'0'.repeat(64)}`,
            purpose: 'content-ai-pick',
            riskClass: 'form_text',
          },
          purpose: 'content-ai-pick',
          type: 'REQUEST_LLM_SESSION',
        }),
    });
  }, tabId);
  expect(lockedAdmission?.result).toEqual({
    error: 'AI provider secrets are locked',
    reason: 'ai-secrets-locked',
    success: false,
  });
  expect(hostRequests.slice(requestOffset).some((path) => path.includes('/provider/'))).toBe(false);
  expect(await content.locator('body').innerText()).not.toContain(API_KEY_CANARY);
  expect(networkMaterial.join('\n')).not.toContain(API_KEY_CANARY);
  expect(networkMaterial.join('\n')).not.toContain(PASSPHRASE_CANARY);
  expect(browserMessages.join('\n')).not.toContain(API_KEY_CANARY);
  expect(browserMessages.join('\n')).not.toContain(PASSPHRASE_CANARY);
  expect(JSON.stringify(lockedAdmission)).not.toContain(API_KEY_CANARY);
  expect(downloads).toEqual([]);
  expect(
    await settings.evaluate(async () =>
      (await chrome.downloads.search({})).some((download) =>
        JSON.stringify(download).includes('security-e2e-canary')
      )
    )
  ).toBe(false);

  await revokeAllSitesAccessFromSettings(accessSettings);
  const cleanup = await sendRuntimeMessage(settings, {
    includeAiProviderSecrets: true,
    preservePreferences: false,
    type: 'ERASE_LOCAL_EXTENSION_DATA',
  });
  expect(cleanup).toMatchObject({ success: true });
  await content.close();
  await accessSettings.close();
  await settings.close();
});
