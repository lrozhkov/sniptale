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
  const networkMaterial: Array<{
    headers: Record<string, string>;
    postData: string | null;
    url: string;
    method: string;
  }> = [];
  const browserMessages: string[] = [];
  const downloads: string[] = [];
  context.on('request', (request) =>
    networkMaterial.push({
      headers: request.headers(),
      postData: request.postData(),
      url: request.url(),
      method: request.method(),
    })
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
  await expect(settings).toHaveURL(
    `chrome-extension://${extensionId}/${SETTINGS_PATH}?section=access-data&view=secret-protection`
  );
  await expect(
    settings.getByRole('heading', { name: /^(Secret protection|Защита секретов)$/u })
  ).toBeVisible();
  const aiProtection = settings.getByRole('switch', {
    name: /^(AI provider API keys|API-ключи провайдеров AI)$/u,
  });
  const webdavProtection = settings.getByRole('switch', {
    name: /^(WebDAV credential|Учётные данные WebDAV)$/u,
  });
  await expect(aiProtection).toBeEnabled();
  await expect(aiProtection).not.toBeChecked();
  await expect(webdavProtection).not.toBeChecked();
  await aiProtection.click();
  const protectionDialog = settings.getByRole('dialog');
  await expect(protectionDialog.locator('.sniptale-modal-title-sm')).toContainText(
    /^(Enable passphrase protection: AI provider API keys|Включить защиту фразой: API-ключи провайдеров AI)$/u
  );
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
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: true,
      mode: 'passphrase',
      participants: { ai: true, webdav: false },
    },
    success: true,
  });

  await expect(aiProtection).toBeChecked();
  await expect(webdavProtection).not.toBeChecked();
  await settings.getByRole('button', { name: /^(Reset|Сбросить)$/u, exact: true }).click();
  const resetDialog = settings.getByRole('dialog');
  await expect(resetDialog).toContainText(
    /Reset deletes all enrolled AI provider API keys and the WebDAV credential\.|Сброс удалит все защищённые общей фразой API-ключи провайдеров AI и учётные данные WebDAV\./u
  );
  await expect(resetDialog).toContainText(
    /Projects, remote files and credentials outside this protection remain\.|Проекты, удалённые файлы и секреты вне этой защиты сохранятся\./u
  );
  await expect(resetDialog).toContainText(
    /Enter the WebDAV password again to reconnect\.|Для подключения WebDAV потребуется снова ввести пароль\./u
  );
  const cancelReset = resetDialog.getByRole('button', {
    name: /^(Cancel|Отмена)$/u,
    exact: true,
  });
  await expect(cancelReset).toBeFocused();
  await cancelReset.scrollIntoViewIfNeeded();
  await expect(cancelReset).toBeInViewport({ ratio: 1 });
  await cancelReset.click();
  await expect(resetDialog).toHaveCount(0);
  await expect(aiProtection).toBeChecked();
  await expect(webdavProtection).not.toBeChecked();
  expect(
    await sendRuntimeMessage(settings, {
      operation: 'read-secret-protection-status',
      type: 'AI_SETTINGS_MUTATION',
    })
  ).toMatchObject({
    secretProtectionStatus: { participants: { ai: true, webdav: false } },
    success: true,
  });

  await restartExtensionServiceWorker(context, settings);
  const relocked = await sendRuntimeMessage(settings, {
    operation: 'read-secret-protection-status',
    type: 'AI_SETTINGS_MUTATION',
  });
  expect(relocked).toMatchObject({
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase',
      participants: { ai: true, webdav: false },
    },
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
  const lockedNetworkOffset = networkMaterial.length;
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
  // Saving the enabled connection explicitly refreshes this exact provider's model catalog.
  // Its Authorization header is the intended sink. Every other field and destination stays closed.
  const providerModelsUrl = new URL('/provider/v1/models', hostOrigin).href;
  let intendedProviderRequests = 0;
  for (const request of networkMaterial) {
    expect(request.url).not.toContain(API_KEY_CANARY);
    expect(request.postData ?? '').not.toContain(API_KEY_CANARY);
    const { authorization, ...otherHeaders } = request.headers;
    expect(JSON.stringify(otherHeaders)).not.toContain(API_KEY_CANARY);
    if (authorization?.includes(API_KEY_CANARY)) {
      expect(request.url).toBe(providerModelsUrl);
      expect(request.method).toBe('GET');
      expect(authorization).toBe(`Bearer ${API_KEY_CANARY}`);
      intendedProviderRequests++;
    }
    expect(JSON.stringify(request)).not.toContain(PASSPHRASE_CANARY);
  }
  expect(intendedProviderRequests).toBeGreaterThan(0);
  expect(JSON.stringify(networkMaterial.slice(lockedNetworkOffset))).not.toContain(API_KEY_CANARY);
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

for (const first of ['ai', 'webdav'] as const) {
  test(`Chrome profile roundtrip retains one session with ${first} first and accepts its legacy WebDAV binding`, async ({
    context,
    extensionId,
    hostOrigin,
  }) => {
    const settings = await openRealExtensionPage(
      context,
      extensionId,
      `${SETTINGS_PATH}?section=access-data&view=secret-protection`
    );
    try {
      // The worker fixture is shared. Prior erasure removes AI schema readiness metadata.
      // Cold startup initializes this independent scenario through the production owner.
      await restartExtensionServiceWorker(context, settings);
      await settings.waitForFunction(async () => {
        const stored = await chrome.storage.local.get([
          'sniptale_ai_storage_version',
          'sniptale_ai_storage_reset_phase',
        ]);
        return (
          stored['sniptale_ai_storage_version'] === 4 &&
          stored['sniptale_ai_storage_reset_phase'] === undefined
        );
      });
      await expect(
        settings.getByRole('heading', { name: /^(Secret protection|Защита секретов)$/u })
      ).toBeVisible();
      expect(
        await sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'read-secret-protection-status',
        })
      ).toMatchObject({ success: true });
      await settings.goto(
        `chrome-extension://${extensionId}/${SETTINGS_PATH}?section=ai-connections`
      );
      const providers = settings.getByRole('region', { name: /^(Providers|Провайдеры)$/u });
      await providers.getByRole('button', { name: /^(Add|Добавить)$/u }).click();
      const providerDialog = settings.getByRole('dialog');
      const providerInputs = providerDialog.locator('input');
      await providerInputs.nth(0).fill('Roundtrip encrypted provider');
      await providerInputs.nth(1).fill(`${hostOrigin}/roundtrip-provider/v1`);
      await providerInputs.nth(2).fill(API_KEY_CANARY);
      await providerDialog.getByRole('button', { name: /^(Add|Добавить)$/u }).click();
      await expect(providers).toContainText('Roundtrip encrypted provider');
      const aiReady = await settings.evaluate(async () => {
        const value = await chrome.storage.local.get([
          'sniptale_ai_storage_version',
          'sniptale_ai_storage_reset_phase',
          'sniptale_ai_provider_secrets',
        ]);
        const secrets: unknown = value['sniptale_ai_provider_secrets'];
        return {
          version: value['sniptale_ai_storage_version'],
          resetting: value['sniptale_ai_storage_reset_phase'] !== undefined,
          hasEncryptedSecret:
            typeof secrets === 'object' && secrets !== null && Object.keys(secrets).length > 0,
        };
      });
      expect(aiReady).toEqual({ version: 4, resetting: false, hasEncryptedSecret: true });
      await settings.goto(
        `chrome-extension://${extensionId}/${SETTINGS_PATH}?section=access-data&view=secret-protection`
      );
      await expect(
        settings.getByRole('heading', { name: /^(Secret protection|Защита секретов)$/u })
      ).toBeVisible();
      // A paused native connection exercises credential crypto without granting network authority.
      await settings.evaluate(async () => {
        const request = indexedDB.open('sniptale-db');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
            'encrypt',
            'decrypt',
          ]);
          const credentialId = crypto.randomUUID();
          const incarnation = crypto.randomUUID();
          const scope = {
            spaceId: 'chrome-profile-binding',
            connectionGeneration: 1,
            profileCreatedAt: 1,
          };
          const binding = {
            provider: 'webdav',
            rootUrl: 'https://dav.example.test/profile-binding/',
            accountId: 'alice',
            ...scope,
          };
          const metadata = {
            version: 1,
            kind: 'sync-connection',
            key: 'connection',
            binding,
            identity: { incarnation, revision: 1 },
            phase: 'paused',
            updateNonce: null,
            credentialId,
          };
          const additionalData = {
            version: 'sync-connection-secret:v1',
            provider: binding.provider,
            rootUrl: binding.rootUrl,
            accountId: binding.accountId,
            spaceId: scope.spaceId,
            connectionGeneration: '1',
            profileCreatedAt: '1',
            incarnation,
            credentialId,
          };
          const encoded = new TextEncoder().encode(
            JSON.stringify(
              Object.fromEntries(
                Object.entries(additionalData).sort(([left], [right]) => left.localeCompare(right))
              )
            )
          );
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: encoded },
            key,
            new TextEncoder().encode(
              JSON.stringify({
                kind: 'basic',
                username: 'alice',
                password: 'synthetic-roundtrip-password',
              })
            )
          );
          const base64 = (bytes: Uint8Array) =>
            btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
          const tx = db.transaction(['sync_capture', 'sync_connection'], 'readwrite');
          tx.objectStore('sync_capture').put({
            version: 1,
            kind: 'profile',
            key: 'profile',
            enabled: true,
            createdAt: 1,
            spaceId: scope.spaceId,
            connectionGeneration: 1,
          });
          tx.objectStore('sync_connection').put(metadata);
          tx.objectStore('sync_connection').put({
            version: 1,
            kind: 'sync-connection-credential',
            key: 'credential',
            credentialId,
            cryptoKey: key,
            envelope: {
              algorithm: 'AES-GCM',
              iv: base64(iv),
              ciphertext: base64(new Uint8Array(ciphertext)),
              additionalData,
              version: 2,
            },
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
      expect(
        await sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'enable-secret-passphrase-protection',
          participant: first,
          passphrase: PASSPHRASE_CANARY,
        })
      ).toMatchObject({ success: true });
      const status = () =>
        sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'read-secret-protection-status',
        });
      expect(await status()).toMatchObject({
        success: true,
        secretProtectionStatus: { isUnlocked: true },
      });
      expect(
        await sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'enable-secret-passphrase-protection',
          participant: first === 'ai' ? 'webdav' : 'ai',
        })
      ).toMatchObject({ success: true });
      expect(await status()).toMatchObject({
        success: true,
        secretProtectionStatus: { isUnlocked: true, participants: { ai: true, webdav: true } },
      });
      const legacyOnly = await settings.evaluate(async () => {
        const record = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        const stored = await chrome.storage.local.get('sniptale_ai_secret_protection');
        const profile: unknown = stored['sniptale_ai_secret_protection'];
        if (!record(profile) || !record(profile['verifier']) || !record(profile['kdf']))
          throw new Error('Native profile missing');
        const verifier = profile['verifier'];
        const kdf = profile['kdf'];
        const historical = {
          version: profile['version'],
          mode: profile['mode'],
          kdf: {
            algorithm: kdf['algorithm'],
            hash: kdf['hash'],
            iterations: kdf['iterations'],
            keyLengthBits: kdf['keyLengthBits'],
            salt: kdf['salt'],
          },
          verifier: {
            algorithm: verifier['algorithm'],
            iv: verifier['iv'],
            ciphertext: verifier['ciphertext'],
            version: verifier['version'],
          },
          enabledAt: profile['enabledAt'],
          updatedAt: profile['updatedAt'],
        };
        const bytes = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(historical))
        );
        const legacy = Array.from(new Uint8Array(bytes), (byte) =>
          byte.toString(16).padStart(2, '0')
        ).join('');
        const request = indexedDB.open('sniptale-db');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const tx = db.transaction('sync_connection', 'readwrite');
          const get = tx.objectStore('sync_connection').get('credential');
          let changed = false;
          get.onsuccess = () => {
            const credential: unknown = get.result;
            if (
              !record(credential) ||
              credential['version'] !== 2 ||
              !record(credential['protection'])
            ) {
              tx.abort();
              return;
            }
            changed = credential['protection']['profileBinding'] !== legacy;
            tx.objectStore('sync_connection').put({
              ...credential,
              protection: { mode: 'passphrase', profileBinding: legacy },
            });
          };
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error ?? new Error('Legacy fixture refused'));
            tx.onerror = () => reject(tx.error);
          });
          return changed;
        } finally {
          db.close();
        }
      });
      expect(legacyOnly).toBe(true);
      await restartExtensionServiceWorker(context, settings);
      expect(await status()).toMatchObject({
        success: true,
        secretProtectionStatus: { isUnlocked: false, participants: { ai: true, webdav: true } },
      });
      expect(
        await sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'unlock-secret-passphrase-protection',
          passphrase: 'wrong synthetic phrase',
        })
      ).toMatchObject({ success: false });
      expect(await status()).toMatchObject({
        success: true,
        secretProtectionStatus: { isUnlocked: false, participants: { ai: true, webdav: true } },
      });
      expect(
        await sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'unlock-secret-passphrase-protection',
          passphrase: PASSPHRASE_CANARY,
        })
      ).toMatchObject({ success: true });
      expect(await status()).toMatchObject({
        success: true,
        secretProtectionStatus: { isUnlocked: true, participants: { ai: true, webdav: true } },
      });
      // This production transition must decrypt the unchanged legacy-bound ciphertext first.
      expect(
        await sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'disable-secret-passphrase-protection',
          participant: 'webdav',
        })
      ).toMatchObject({ success: true });
      expect(await status()).toMatchObject({
        success: true,
        secretProtectionStatus: { isUnlocked: true, participants: { ai: true, webdav: false } },
      });
      // The restarted common session must also decrypt the nonempty AI participant target.
      expect(
        await sendRuntimeMessage(settings, {
          type: 'AI_SETTINGS_MUTATION',
          operation: 'disable-secret-passphrase-protection',
          participant: 'ai',
        })
      ).toMatchObject({ success: true });
      expect(await status()).toMatchObject({
        success: true,
        secretProtectionStatus: { isUnlocked: true, participants: { ai: false, webdav: false } },
      });
    } finally {
      await sendRuntimeMessage(settings, {
        type: 'ERASE_LOCAL_EXTENSION_DATA',
        includeAiProviderSecrets: true,
        preservePreferences: false,
      });
      await settings.close();
    }
  });
}
