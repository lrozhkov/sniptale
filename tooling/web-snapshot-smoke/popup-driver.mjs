import { join } from 'node:path';

const configuredTimeoutMs = Number(process.env.SNAPSHOT_SMOKE_TIMEOUT_MS);
const packageTimeoutMs =
  Number.isSafeInteger(configuredTimeoutMs) && configuredTimeoutMs >= 10_000
    ? configuredTimeoutMs
    : 90_000;

export async function enableForTab(popup, target, tabId) {
  await popup.evaluate((id) => globalThis.chrome.tabs.update(id, { active: true }), tabId);
  const result = await popup.evaluate(async (id) => {
    return globalThis.chrome.runtime.sendMessage({
      __sniptaleRuntimeFreshness: {
        issuedAtEpochMs: Date.now(),
        nonce: crypto.randomUUID(),
      },
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
    async ({ id, jobId, timeoutMs }) => {
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

      const deadline = Date.now() + timeoutMs;
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
        await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
      }
      throw new Error('Snapshot save timed out');
    },
    { id: tabId, jobId: crypto.randomUUID(), timeoutMs: packageTimeoutMs }
  );
}

export async function downloadSnapshotPackage(popup, tabId) {
  return popup.evaluate(
    async ({ id, jobId, richPackage, timeoutMs }) => {
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
          intent: 'export',
          jobId,
          orderedTabs: [{ tabId: id, title: 'Smoke page' }],
          options: {
            includeBasicLogs: richPackage,
            includeCssDiagnostics: richPackage,
            includeFiles: richPackage,
            includeFullPageScreenshot: true,
            includeImages: richPackage,
            includeJson: richPackage,
            includeMarkdown: richPackage,
            includePageDiagnostics: richPackage,
          },
          type: 'START_PAGE_PACKAGE_JOB',
          warnings: [],
        })
      );
      if (!started?.success) throw new Error(started?.error || 'Package export did not start');

      const deadline = Date.now() + timeoutMs;
      let lastStatus = null;
      while (Date.now() < deadline) {
        const response = await globalThis.chrome.runtime.sendMessage(
          withFreshness({ jobId, type: 'GET_PAGE_PACKAGE_JOB_STATUS' })
        );
        if (!response?.success) throw new Error(response?.error || 'Package status failed');
        const status = response.status;
        lastStatus = status;
        if (status?.phase === 'completed') {
          if (!status.result?.filename) throw new Error('Package export completed without a file');
          return {
            downloadProof: { filename: status.result.filename },
            success: true,
            warnings: status.result?.warnings ?? status.warnings ?? [],
          };
        }
        if (status && ['cancelled', 'failed', 'interrupted'].includes(status.phase)) {
          throw new Error(status.result?.errors?.join('; ') || `Package ${status.phase}`);
        }
        await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
      }
      throw new Error(
        `Package export timed out: ${JSON.stringify({
          phase: lastStatus?.phase ?? null,
          progress: lastStatus?.progress ?? null,
          revision: lastStatus?.revision ?? null,
        })}`
      );
    },
    {
      id: tabId,
      jobId: crypto.randomUUID(),
      richPackage: process.env.SNAPSHOT_SMOKE_RICH_PACKAGE === '1',
      timeoutMs: packageTimeoutMs,
    }
  );
}

async function selectOnlyCurrentPage(popup) {
  const pagesTrigger = popup
    .locator('[data-ui="popup.export.selection-trigger"]')
    .filter({ hasText: /Pages|Страницы/i })
    .first();
  await pagesTrigger.click();
  const pagesDialog = popup.getByRole('dialog');
  const clearAll = pagesDialog.getByRole('button', {
    name: /Clear all|Снять всё/i,
  });
  if ((await clearAll.count()) > 0) await clearAll.click();
  const currentPage = pagesDialog
    .locator('label')
    .filter({ hasText: /Current|Текущ/i })
    .first();
  const currentCheckbox = currentPage.locator('input[type="checkbox"]');
  if ((await currentCheckbox.count()) !== 1) {
    throw new Error('Popup Pages curtain did not identify the active smoke tab');
  }
  await currentCheckbox.check();
  await pagesDialog.locator('[data-ui="popup.inline-curtain.header"] button').click();
}

async function startLibraryExportFromPopup(popup) {
  await popup.reload();
  await popup.waitForTimeout(750);
  await popup.locator('button[data-page="export"]').click();
  await popup.waitForTimeout(750);
  await popup.getByRole('button', { name: /To Library|В библиотеку/i }).click();
  await selectOnlyCurrentPage(popup);
  if (process.env.SNAPSHOT_SMOKE_RICH_PACKAGE === '1') {
    await popup.locator('[data-ui="popup.export.selection-trigger"]').first().click();
    const selectionDialog = popup.getByRole('dialog');
    await selectionDialog.getByRole('button', { name: /Data and files|Данные и файлы/i }).click();
    await selectionDialog.locator('[data-ui="popup.inline-curtain.header"] button').click();
  }
  const primaryAction = popup.locator('[data-ui="popup.export.export-button"]');
  await primaryAction.click();
  return primaryAction;
}

async function readStoredJobId(popup) {
  return popup.evaluate(() =>
    globalThis.chrome.storage.session
      .get('sniptale_page_package_job')
      .then((stored) => stored.sniptale_page_package_job?.status?.jobId ?? null)
  );
}

async function waitForPrimaryAction(popup, pattern, options = {}) {
  await popup.waitForFunction(
    ({ enabled, source }) => {
      const action = globalThis.document.querySelector('[data-ui="popup.export.export-button"]');
      return (
        (enabled !== true || !action?.hasAttribute('disabled')) &&
        new RegExp(source, 'i').test(
          `${action?.textContent ?? ''} ${action?.getAttribute('title') ?? ''}`
        )
      );
    },
    { enabled: options.enabled === true, source: pattern.source }
  );
}

async function cancelAndRestartPopupExport(popup, primaryAction) {
  const firstJobId = await readStoredJobId(popup);
  await waitForPrimaryAction(popup, /Cancel|Остановить/);
  await primaryAction.click();
  await waitForPrimaryAction(popup, /Done|Готово/, { enabled: true });
  const cancellationText = await popup.locator('body').innerText();
  if (!/export cancelled|экспорт отменён/i.test(cancellationText)) {
    throw new Error('Popup did not identify a manual cancellation as a distinct terminal outcome');
  }
  await primaryAction.click();
  await waitForPrimaryAction(popup, /Export|Экспортировать/, { enabled: true });
  await primaryAction.click();
  await waitForPrimaryAction(popup, /Cancel|Остановить/);

  const restartDeadline = Date.now() + 5_000;
  while (Date.now() < restartDeadline) {
    const restartedJobId = await readStoredJobId(popup);
    if (restartedJobId && restartedJobId !== firstJobId) return restartedJobId;
    await popup.waitForTimeout(50);
  }
  throw new Error(`Popup cancellation did not admit a distinct restart job: ${firstJobId}`);
}

async function readPopupProgressState(popup) {
  return popup.evaluate(async () => {
    const action = globalThis.document.querySelector('[data-ui="popup.export.export-button"]');
    const stored = await globalThis.chrome.storage.session.get('sniptale_page_package_job');
    const status = stored.sniptale_page_package_job?.status ?? null;
    return {
      actionDisabled: action?.hasAttribute('disabled') ?? true,
      actionTitle: action?.getAttribute('title') ?? '',
      steps: Array.from(
        globalThis.document.querySelectorAll('[data-ui="popup.export.progress-step"]')
      ).map((step) => ({
        key: step.getAttribute('data-step-key') ?? '',
        status: step.getAttribute('data-status') ?? '',
      })),
      storedProgress: status
        ? {
            jobId: status.jobId,
            progress: status.progress,
            revision: status.revision,
          }
        : null,
      text: globalThis.document.body.innerText,
    };
  });
}

async function waitForPopupExportResult(popup) {
  const progressObservations = [];
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < packageTimeoutMs) {
    const state = await readPopupProgressState(popup);
    lastState = state;
    const conciseText = state.text.replace(/\s+/g, ' ').trim();
    if (progressObservations.at(-1)?.text !== conciseText) {
      progressObservations.push({
        atMs: Date.now() - startedAt,
        steps: state.steps,
        storedProgress: state.storedProgress,
        text: conciseText,
      });
    }
    if (!state.actionDisabled && /Done|Готово/i.test(state.actionTitle)) {
      const resultTitle = await popup.evaluate(() => {
        const actions = Array.from(globalThis.document.querySelectorAll('button'));
        const openResult = actions.find((button) =>
          /Open Web Snapshot|Открыть веб-снимок/i.test(
            `${button.textContent ?? ''} ${button.getAttribute('title') ?? ''}`
          )
        );
        return openResult?.getAttribute('title') ?? openResult?.textContent?.trim() ?? '';
      });
      return { progressObservations, resultTitle };
    }
    await popup.waitForTimeout(50);
  }
  throw new Error(
    `Popup snapshot save did not expose its result action after ${Date.now() - startedAt} ms: ${JSON.stringify(lastState)}`
  );
}

export async function saveSnapshotThroughPopup({ out, popup, selectionCurtainGeometry, specName }) {
  const primaryAction = await startLibraryExportFromPopup(popup);
  await cancelAndRestartPopupExport(popup, primaryAction);
  let popupResult;
  try {
    popupResult = await waitForPopupExportResult(popup);
  } catch (error) {
    await popup.screenshot({
      path: join(out, `${specName}-popup-failure.png`),
    });
    throw error;
  }
  const { progressObservations, resultTitle } = popupResult;
  await popup.screenshot({ path: join(out, `${specName}-popup-result.png`) });
  const assetId = await readStoredLibraryAssetId(popup);
  if (!assetId) throw new Error(`Popup result did not retain a Library snapshot: ${resultTitle}`);
  return {
    assetId,
    popupProof: { progressObservations, resultTitle, selectionCurtainGeometry },
    success: true,
    warnings: [],
  };
}

async function readStoredLibraryAssetId(popup) {
  return popup.evaluate(async () => {
    const stored = await globalThis.chrome.storage.session.get('sniptale_page_package_job');
    return stored.sniptale_page_package_job?.status?.result?.snapshotIds?.[0] ?? null;
  });
}

export async function verifyPackageContentsCurtain(popup, out) {
  await popup.reload();
  await popup.waitForTimeout(750);
  await popup.locator('button[data-page="export"]').click();
  await popup.waitForTimeout(750);
  await popup.locator('[data-ui="popup.export.selection-trigger"]').first().click();
  const dialog = popup.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll('button')).map((button) => {
      const buttonRect = button.getBoundingClientRect();
      return {
        ariaLabel: button.getAttribute('aria-label') ?? '',
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
  await popup.screenshot({
    path: join(out, 'popup-package-contents-curtain.png'),
  });
  if (process.env.SNAPSHOT_SMOKE_RICH_PACKAGE === '1') {
    await dialog.getByRole('button', { name: /Data and files|Данные и файлы/i }).click();
  }
  await dialog.locator('[data-ui="popup.inline-curtain.header"] button').click();
  return geometry;
}

export async function enableWebSnapshotsForSmoke(popup) {
  await popup.evaluate(async () => {
    const stored = await globalThis.chrome.storage.sync.get('sniptale_settings');
    const syncedSettings = { ...(stored.sniptale_settings ?? {}) };
    await globalThis.chrome.storage.sync.set({
      sniptale_settings: {
        ...syncedSettings,
        anonymousCrossOriginSnapshotAssetsEnabled: true,
        authenticatedSnapshotAssetsEnabled: true,
        externalSnapshotLinksEnabled: true,
      },
    });
  });
}
