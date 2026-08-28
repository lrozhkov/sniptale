import { join } from 'node:path';

const WEB_SNAPSHOT_CONSENT_STORAGE_KEY = 'sniptale_web_snapshot_local_consent';

export async function enableForTab(popup, target, tabId) {
  await popup.evaluate((id) => globalThis.chrome.tabs.update(id, { active: true }), tabId);
  const result = await popup.evaluate(async (id) => {
    return globalThis.chrome.runtime.sendMessage({
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      operation: 'register-granted-all-sites',
      tabId: id,
      type: 'PAGE_ACCESS',
    });
  }, tabId);
  if (!result?.success || !result?.status?.currentTabActive) {
    throw new Error(`Page access activation failed: ${JSON.stringify(result)}`);
  }
  await target.waitForTimeout(750);
}

export async function saveSnapshot(popup, tabId) {
  return popup.evaluate(
    async ({ id, jobId }) => {
      const withFreshness = (message) => ({
        ...message,
        __sniptaleRuntimeFreshness: {
          issuedAtEpochMs: Date.now(),
          nonce: crypto.randomUUID(),
        },
      });
      const started = await globalThis.chrome.runtime.sendMessage(
        withFreshness({
          includeWebCopy: true,
          intent: 'save',
          jobId,
          orderedTabs: [{ tabId: id, title: 'Smoke page' }],
          options: {
            includeBasicLogs: false,
            includeCssDiagnostics: false,
            includeFiles: false,
            includeFullPageScreenshot: true,
            includeImages: false,
            includeJson: false,
            includeMarkdown: false,
            includePageDiagnostics: false,
          },
          type: 'START_PAGE_PACKAGE_JOB',
          warnings: [],
        })
      );
      if (!started?.success) throw new Error(started?.error || 'Snapshot save did not start');

      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const response = await globalThis.chrome.runtime.sendMessage(
          withFreshness({ jobId, type: 'GET_PAGE_PACKAGE_JOB_STATUS' })
        );
        if (!response?.success) throw new Error(response?.error || 'Snapshot status failed');
        const status = response.status;
        if (status?.phase === 'completed') {
          const assetId = status.result?.snapshotIds?.[0];
          if (!assetId) throw new Error('Snapshot save completed without a Library asset');
          return {
            assetId,
            success: true,
            warnings: status.result?.warnings ?? status.warnings ?? [],
          };
        }
        if (status && ['cancelled', 'failed', 'interrupted'].includes(status.phase)) {
          throw new Error(status.result?.errors?.join('; ') || `Snapshot ${status.phase}`);
        }
        await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
      }
      throw new Error('Snapshot save timed out');
    },
    { id: tabId, jobId: crypto.randomUUID() }
  );
}

export async function saveSnapshotThroughPopup({
  context,
  out,
  popup,
  setupDialogGeometry,
  specName,
}) {
  await popup.reload();
  await popup.waitForTimeout(750);
  await popup.locator('button[data-page="export"]').click();
  await popup.waitForTimeout(750);
  const snapshotAction = popup.locator('[data-ui="popup.export.actions"] button').last();
  await snapshotAction.click();

  const progressObservations = [];
  const startedAt = Date.now();
  let lastState = null;
  let resultTitle = '';
  while (Date.now() - startedAt < 60_000) {
    const state = await popup.evaluate(() => {
      const action = globalThis.document.querySelector(
        '[data-ui="popup.export.actions"] button:last-child'
      );
      return {
        actionDisabled: action?.hasAttribute('disabled') ?? true,
        actionTitle: action?.getAttribute('title') ?? '',
        text: globalThis.document.body.innerText,
      };
    });
    lastState = state;
    const conciseText = state.text.replace(/\s+/g, ' ').trim();
    if (progressObservations.at(-1)?.text !== conciseText) {
      progressObservations.push({ atMs: Date.now() - startedAt, text: conciseText });
    }
    if (!state.actionDisabled && !/Save snapshot|Сохранить снимок/i.test(state.actionTitle)) {
      resultTitle = state.actionTitle;
      break;
    }
    await popup.waitForTimeout(50);
  }
  if (!resultTitle) {
    await popup.screenshot({ path: join(out, `${specName}-popup-failure.png`) });
    throw new Error(
      `Popup snapshot save did not expose its result action: ${JSON.stringify(lastState)}`
    );
  }
  await popup.screenshot({ path: join(out, `${specName}-popup-result.png`) });
  const openedPagePromise = context.waitForEvent('page');
  await snapshotAction.click();
  const openedPage = await openedPagePromise;
  await openedPage.waitForLoadState('domcontentloaded');
  const assetId = new URL(openedPage.url()).searchParams.get('snapshotId');
  await openedPage.close();
  if (!assetId) throw new Error(`Popup result action did not open a snapshot: ${resultTitle}`);
  return {
    assetId,
    popupProof: {
      progressObservations,
      resultTitle,
      setupDialogGeometry,
    },
    success: true,
    warnings: [],
  };
}

export async function verifyDisabledSetupDialog(popup, out) {
  await popup.reload();
  await popup.waitForTimeout(750);
  await popup.locator('button[data-page="export"]').click();
  await popup.waitForTimeout(750);
  await popup.locator('[data-ui="popup.export.actions"] button').last().click();
  const dialog = popup.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll('button')).map((button) => {
      const buttonRect = button.getBoundingClientRect();
      return {
        bottom: buttonRect.bottom,
        text: button.textContent?.trim() ?? '',
        top: buttonRect.top,
      };
    });
    return {
      bottom: rect.bottom,
      buttons,
      top: rect.top,
      viewportHeight: globalThis.innerHeight,
    };
  });
  await popup.screenshot({ path: join(out, 'popup-web-snapshot-setup.png') });
  await popup.getByRole('button', { name: /Close|Закрыть/i }).click();
  return geometry;
}

export async function enableWebSnapshotsForSmoke(popup) {
  await popup.evaluate(async (consentStorageKey) => {
    const stored = await globalThis.chrome.storage.sync.get('sniptale_settings');
    const syncedSettings = { ...(stored.sniptale_settings ?? {}) };
    delete syncedSettings.webSnapshotEnabled;
    await globalThis.chrome.storage.sync.set({
      sniptale_settings: {
        ...syncedSettings,
        anonymousCrossOriginSnapshotAssetsEnabled: true,
        authenticatedSnapshotAssetsEnabled: true,
      },
    });
    await globalThis.chrome.storage.local.set({ [consentStorageKey]: true });

    const [nextSync, nextLocal] = await Promise.all([
      globalThis.chrome.storage.sync.get('sniptale_settings'),
      globalThis.chrome.storage.local.get(consentStorageKey),
    ]);
    if ('webSnapshotEnabled' in (nextSync.sniptale_settings ?? {})) {
      throw new Error('Smoke setup leaked Web Snapshot consent into synchronized settings');
    }
    if (nextLocal[consentStorageKey] !== true) {
      throw new Error('Smoke setup did not commit profile-local Web Snapshot consent');
    }
  }, WEB_SNAPSHOT_CONSENT_STORAGE_KEY);
}
