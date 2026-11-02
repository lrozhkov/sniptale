import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';
import { startHostServer } from '../support/host-server';
import {
  triggerExtensionAction,
  evaluateInTarget,
  sendRuntimeMessageInTarget,
} from '../support/recording-action';
import { parseSyncProductResponse } from '../../../../apps/extension/src/contracts/messaging/contracts/runtime/sync-product';

type Provider = Awaited<ReturnType<typeof openProvider>>;
const build = '.tmp/e2e-builds/security';
const settingsPath = 'apps/extension/src/settings/index.html';
const projectTitle = 'Popup checkpoint project';
const viewport = { width: 1280, height: 560 };

// Native action popups have no Playwright Page. Capture their CDP viewport without scrolling.
async function screenshot(
  context: BrowserContext,
  targetId: string,
  options: { path: string; fullPage: false; action?: string | readonly string[] }
) {
  if (options.action) await waitPopupAction(context, targetId, options.action);
  await evaluateInTarget(
    context,
    targetId,
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
    true
  );
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

async function nativeState(page: Page, rootId: string) {
  return page.evaluate(async (rootId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onupgradeneeded = () => {
        request.transaction?.abort();
        reject(new Error('Native database missing'));
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(['sync_capture', 'sync_outbox'], 'readonly');
      const all = (store: string) =>
        new Promise<unknown[]>((resolve, reject) => {
          const request = tx.objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [captures, queue] = await Promise.all([all('sync_capture'), all('sync_outbox')]);
      const operations = captures
        .flatMap((row) => {
          if (
            typeof row !== 'object' ||
            row === null ||
            !('kind' in row) ||
            row.kind !== 'sync-operation' ||
            !('rootId' in row) ||
            row.rootId !== rootId ||
            !('operationId' in row) ||
            typeof row.operationId !== 'string' ||
            !('generation' in row) ||
            typeof row.generation !== 'number' ||
            !('phase' in row) ||
            typeof row.phase !== 'string'
          )
            return [];
          return [{ operationId: row.operationId, generation: row.generation, phase: row.phase }];
        })
        .sort((a, b) => a.generation - b.generation);
      const ids = new Set(operations.map((row) => row.operationId));
      return {
        operations,
        scope: {
          unpublished: captures.filter(
            (row) =>
              typeof row === 'object' &&
              row !== null &&
              'kind' in row &&
              row.kind === 'sync-operation' &&
              'phase' in row &&
              row.phase !== 'published'
          ).length,
          pending: captures.filter(
            (row) =>
              typeof row === 'object' &&
              row !== null &&
              'kind' in row &&
              row.kind === 'pending-checkpoint'
          ).length,
        },
        pending: captures.filter(
          (row) =>
            typeof row === 'object' &&
            row !== null &&
            'kind' in row &&
            row.kind === 'pending-checkpoint' &&
            'rootId' in row &&
            row.rootId === rootId
        ).length,
        requested: captures.filter(
          (row) =>
            typeof row === 'object' &&
            row !== null &&
            'kind' in row &&
            row.kind === 'pending-checkpoint' &&
            'rootId' in row &&
            row.rootId === rootId &&
            'flushRequested' in row &&
            row.flushRequested === true
        ).length,
        queue: queue
          .flatMap((row) => {
            if (
              typeof row !== 'object' ||
              row === null ||
              !('operationId' in row) ||
              typeof row.operationId !== 'string' ||
              !ids.has(row.operationId) ||
              !('status' in row) ||
              typeof row.status !== 'string'
            )
              return [];
            return [
              {
                operationId: row.operationId,
                status: row.status,
                failureCode:
                  'failureCode' in row && typeof row.failureCode === 'string'
                    ? row.failureCode
                    : null,
              },
            ];
          })
          .sort(
            (a, b) =>
              operations.findIndex((row) => row.operationId === a.operationId) -
              operations.findIndex((row) => row.operationId === b.operationId)
          ),
      };
    } finally {
      db.close();
    }
  }, rootId);
}
async function popupStatus(browser: Provider, target: string) {
  const raw = await sendRuntimeMessageInTarget(browser.context, target, {
    type: 'SYNC_PRODUCT_COMMAND',
    requestId: crypto.randomUUID(),
    command: { kind: 'runtime-status' },
  });
  const parsed = parseSyncProductResponse(raw);
  if (!parsed?.success || parsed.result.kind !== 'runtime-status')
    throw new Error('Native popup status refused');
  return parsed.result.status;
}
async function waitPopupAction(
  context: BrowserContext,
  target: string,
  label: string | readonly string[]
) {
  const labels = typeof label === 'string' ? [label] : label;
  await expect
    .poll(() =>
      evaluateInTarget(
        context,
        target,
        `(() => {
    const button = [...document.querySelectorAll('[data-ui="popup.footer.sync-status"] button')].find(node => ${JSON.stringify(labels)}.includes(node.textContent.trim()));
    return button instanceof HTMLButtonElement && !button.disabled;
  })()`
      )
    )
    .toBe(true);
}
async function clickPopup(browser: Provider, target: string, label: string, twice = false) {
  await waitPopupAction(browser.context, target, label);
  await evaluateInTarget(
    browser.context,
    target,
    `(() => {
    const button = [...document.querySelectorAll('[data-ui="popup.footer.sync-status"] button')].find(node => node.textContent.trim() === ${JSON.stringify(label)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('Popup action unavailable');
    button.click(); ${twice ? 'button.click();' : ''} return true;
  })()`
  );
}
async function openPopup(browser: Provider, source: Page) {
  const target = await triggerExtensionAction(browser.context, browser.extensionId, source);
  await expect
    .poll(() =>
      evaluateInTarget(
        browser.context,
        target,
        `({width: innerWidth, height: innerHeight, ready: !!document.querySelector('[data-ui="popup.footer.sync-status"]')})`
      )
    )
    .toEqual({ width: 392, height: 560, ready: true });
  await evaluateInTarget(browser.context, target, 'document.fonts.ready.then(() => true)', true);
  return target;
}
async function prepareProject(browser: Provider) {
  const page = browser.page;
  await page.evaluate(() =>
    chrome.storage.local.set({
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': 'light',
      sniptale_popup_startup: {
        selection: 'menu',
        lastPage: 'menu',
        lastExportDestination: 'export',
      },
    })
  );
  await page.goto(
    `chrome-extension://${browser.extensionId}/${settingsPath}?section=saving&view=connection`
  );
  return page;
}
async function enroll(
  browser: Provider,
  credentials: { rootUrl: string; username: string; password: string }
) {
  const page = await prepareProject(browser);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await page.getByLabel('Parent folder URL', { exact: true }).fill(credentials.rootUrl);
  await page.getByLabel('Account', { exact: true }).fill(credentials.username);
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Create in selected folder', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'I confirm on-demand file storage on this device', exact: true })
    .check();
  await page.getByRole('button', { name: 'Finish connection', exact: true }).click();
  await expect(page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  const probe = await browser.context.newPage();
  await probe.goto(
    `chrome-extension://${browser.extensionId}/tooling/test/harness/webdav-transfer.html`
  );
  await probe.waitForFunction(() => Boolean(window.webdavTransferHarness));
  const seed = await probe.evaluate(
    async (name) =>
      window.webdavTransferHarness.portable.source(undefined, { useExistingProfile: true, name }),
    projectTitle
  );
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect
    .poll(async () => (await nativeState(page, seed.projectId)).operations.at(-1)?.phase, {
      timeout: 60000,
    })
    .toBe('published');
  await expect.poll(async () => (await nativeState(page, seed.projectId)).pending).toBe(0);
  await page.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
  await expect(page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  const original = await probe.evaluate(
    (id) => window.webdavTransferHarness.portable.projectState(id),
    seed.projectId
  );
  await page.goto(
    `chrome-extension://${browser.extensionId}/apps/extension/src/gallery/index.html`
  );
  const card = page.locator(`[data-gallery-keyboard-id="video-project:${seed.projectId}"]`);
  await expect(card).toBeVisible();
  const opened = browser.context.waitForEvent('page');
  await card.getByRole('button', { name: 'Open in editor', exact: true }).click();
  const editor = await opened;
  await editor.setViewportSize(viewport);
  await expect(editor.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  const title = editor.locator('[data-ui="video-editor.floating.document-bar"] input');
  await expect(title).toHaveValue(projectTitle);
  // The fixture contains independent Library roots as well as the selected project.
  await page.goto(
    `chrome-extension://${browser.extensionId}/${settingsPath}?section=saving&view=connection`
  );
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect
    .poll(async () => (await nativeState(page, seed.projectId)).scope, { timeout: 60000 })
    .toEqual({ unpublished: 0, pending: 0 });
  return { seed, probe, editor, title, original };
}
async function waitPublished(browser: Provider, rootId: string, expected: number, timeout = 60000) {
  await expect
    .poll(
      async () => {
        const state = await nativeState(browser.page, rootId);
        return {
          count: state.operations.length,
          phase: state.operations.at(-1)?.phase,
          pending: state.pending,
        };
      },
      { timeout }
    )
    .toEqual({ count: expected, phase: 'published', pending: 0 });
}
function recordPuts(lab: Parameters<typeof openProvider>[0], after: number) {
  return lab.proxy.counts.putBodies.slice(after).filter((item) => item.key.includes('/records/'));
}
async function changeAndWait(
  browser: Provider,
  project: Awaited<ReturnType<typeof enroll>>,
  title: string
) {
  await project.title.fill(title);
  await expect
    .poll(async () => (await nativeState(browser.page, project.seed.projectId)).pending)
    .toBe(1);
  await expect
    .poll(() =>
      project.probe.evaluate(
        (id) => window.webdavTransferHarness.portable.projectState(id),
        project.seed.projectId
      )
    )
    .toMatchObject({ name: title, objects: project.original.objects });
}

// Run only in the explicit Docker-backed provider configuration.
test('native enrolled popup flushes once and preserves pause and offline work', async ({
  lab,
}, info) => {
  test.setTimeout(240000);
  const browser = await openProvider(lab, info, 'popup-enrolled', false, build, {
    viewport,
    headlessScreen: { width: 1920, height: 1080 },
  });
  const host = await startHostServer();
  try {
    const project = await enroll(browser, lab.credentials);
    const source = await browser.context.newPage();
    await source.goto(host.origin);
    const before = await nativeState(browser.page, project.seed.projectId);
    const start = lab.proxy.counts.putBodies.length;
    await changeAndWait(browser, project, 'Popup manual edit');
    let target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({
        configuration: 'configured',
        localPublication: 'waiting',
        protection: 'not-enrolled',
      });
    const pending = await nativeState(browser.page, project.seed.projectId);
    for (let count = 0; count < 3; count++)
      expect((await popupStatus(browser, target)).localPublication).toBe('waiting');
    expect(await nativeState(browser.page, project.seed.projectId)).toEqual(pending);
    expect(recordPuts(lab, start)).toEqual([]);
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-waiting.png'),
      fullPage: false,
    });
    await clickPopup(browser, target, 'Sync now', true);
    await waitPublished(browser, project.seed.projectId, before.operations.length + 1);
    expect((await nativeState(browser.page, project.seed.projectId)).operations).toHaveLength(
      before.operations.length + 1
    );
    expect(recordPuts(lab, start)).toHaveLength(1);
    await closePopup(browser.context, target).catch(() => undefined);
    await browser.page.goto(
      `chrome-extension://${browser.extensionId}/${settingsPath}?section=saving&view=queue`
    );
    await browser.page.locator('[data-ui="sync-queue.control"]').click();
    await changeAndWait(browser, project, 'Popup paused edit');
    const pauseStart = lab.proxy.counts.putBodies.length;
    target = await openPopup(browser, source);
    await expect.poll(() => popupStatus(browser, target)).toMatchObject({ connection: 'paused' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-paused.png'),
      fullPage: false,
    });
    expect(recordPuts(lab, pauseStart)).toEqual([]);
    await clickPopup(browser, target, 'Details');
    await expect(browser.page).toHaveURL(/section=saving&view=queue/u);
    await expect(browser.page.locator('[data-ui="sync-queue.control"]')).toHaveText('Resume');
    await browser.page.locator('[data-ui="sync-queue.control"]').click();
    await browser.page.goto(
      `chrome-extension://${browser.extensionId}/${settingsPath}?section=saving&view=connection`
    );
    await browser.page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await waitPublished(browser, project.seed.projectId, before.operations.length + 2);
    expect(recordPuts(lab, pauseStart)).toHaveLength(1);
    await browser.context.setOffline(true);
    await changeAndWait(browser, project, 'Popup offline edit');
    target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ localPublication: 'waiting' });
    const offlineStart = lab.proxy.counts.putBodies.length;
    await clickPopup(browser, target, 'Sync now');
    await expect
      .poll(async () => {
        const state = await nativeState(browser.page, project.seed.projectId);
        return { operations: state.operations.length, pending: state.pending };
      })
      .toEqual({ operations: before.operations.length + 3, pending: 0 });
    const offlineOperation = (
      await nativeState(browser.page, project.seed.projectId)
    ).operations.at(-1);
    if (!offlineOperation) throw new Error('Offline checkpoint is missing.');
    expect(['native', 'prepared']).toContain(offlineOperation.phase);
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-offline.png'),
      fullPage: false,
    });
    expect(recordPuts(lab, offlineStart)).toEqual([]);
    await closePopup(browser.context, target).catch(() => undefined);
    await browser.context.setOffline(false);
    await browser.page.goto(
      `chrome-extension://${browser.extensionId}/${settingsPath}?section=saving&view=connection`
    );
    await browser.page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await waitPublished(browser, project.seed.projectId, before.operations.length + 3, 90000);
    expect(
      (await nativeState(browser.page, project.seed.projectId)).operations.at(-1)?.operationId
    ).toBe(offlineOperation.operationId);
    expect(recordPuts(lab, offlineStart)).toHaveLength(1);

    // A provider refusal is distinct from a browser that correctly defers while offline.
    lab.proxy.armFault({ method: 'PUT', key: '*', kind: 'status', status: 503, repeat: true });
    await changeAndWait(browser, project, 'Popup retry edit');
    target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ localPublication: 'waiting' });
    await clickPopup(browser, target, 'Sync now');
    await lab.proxy.waitForFault();
    await expect
      .poll(
        async () => (await nativeState(browser.page, project.seed.projectId)).queue.at(-1)?.status,
        { timeout: 30000 }
      )
      .toBe('failed');
    await expect.poll(async () => (await popupStatus(browser, target)).issue).not.toBeNull();
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-provider-retry.png'),
      fullPage: false,
      action: ['View uploads', 'Resolve'],
    });
    const issue = (await popupStatus(browser, target)).issue;
    await clickPopup(browser, target, issue === 'queue-problem' ? 'View uploads' : 'Resolve');
    await expect(browser.page).toHaveURL(/section=saving&view=queue&queueFilter=problems/u);
    lab.proxy.releaseFault();
    const failed = (await nativeState(browser.page, project.seed.projectId)).operations.at(-1);
    if (!failed) throw new Error('Failed native successor missing');
    const row = browser.page.locator(`[data-operation-id="${failed.operationId}"]`);
    await row.getByRole('button', { name: 'Retry', exact: true }).click();
    await waitPublished(browser, project.seed.projectId, before.operations.length + 4, 90000);
    const after = await nativeState(browser.page, project.seed.projectId);
    expect(after.operations).toHaveLength(before.operations.length + 4);
    expect(
      (
        await project.probe.evaluate(
          (id) => window.webdavTransferHarness.portable.projectState(id),
          project.seed.projectId
        )
      ).objects
    ).toEqual(project.original.objects);
    await saveProof(info, {
      nativePopup: true,
      actualEnrollment: true,
      readOnlyStatus: true,
      doubleClickSuccessors: 1,
      pausedPreserved: true,
      offlineRecovered: true,
      finiteProviderRetryAndRepair: true,
      recordPuts: recordPuts(lab, start).length,
      operationsBefore: before.operations.length,
      operationsAfter: after.operations.length,
    });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.setOffline(false).catch(() => undefined);
    await browser.context.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('native locked popup unlocks the shared session and consumes one forced sync', async ({
  lab,
}, info) => {
  test.setTimeout(180_000);
  const browser = await openProvider(lab, info, 'popup-locked', false, build, {
    viewport,
    headlessScreen: { width: 1920, height: 1080 },
  });
  const host = await startHostServer();
  const phrase = 'synthetic popup shared session phrase';
  try {
    const project = await enroll(browser, lab.credentials);
    await browser.page.goto(
      `chrome-extension://${browser.extensionId}/${settingsPath}?section=access-data&view=secret-protection`
    );
    await browser.page.getByRole('switch', { name: 'WebDAV credential', exact: true }).click();
    const enrollment = browser.page.getByRole('dialog');
    await expect(enrollment).toBeVisible();
    await enrollment.getByLabel('Passphrase', { exact: true }).fill(phrase);
    await enrollment.getByLabel('Confirm passphrase', { exact: true }).fill(phrase);
    await enrollment.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      browser.page.getByText('On, current session is unlocked.', { exact: true })
    ).toBeVisible();
    await browser.page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(
      browser.page.getByText('On, current session is locked.', { exact: true })
    ).toBeVisible();
    const before = await nativeState(browser.page, project.seed.projectId);
    const start = lab.proxy.counts.putBodies.length;
    await changeAndWait(browser, project, 'Popup protected edit');
    const source = await browser.context.newPage();
    await source.goto(host.origin);
    let target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({
        configuration: 'configured',
        protection: 'locked',
        localPublication: 'waiting',
      });
    const pending = await nativeState(browser.page, project.seed.projectId);
    expect(recordPuts(lab, start)).toEqual([]);
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-locked.png'),
      fullPage: false,
    });
    for (let index = 0; index < 3; index++)
      expect((await popupStatus(browser, target)).protection).toBe('locked');
    expect(await nativeState(browser.page, project.seed.projectId)).toEqual(pending);
    const unlockOpened = browser.context.waitForEvent('page');
    await clickPopup(browser, target, 'Unlock', true);
    const unlockPage = await unlockOpened;
    await expect(unlockPage).toHaveURL(/settings\/index.html\?aiUnlock=1&requestId=/u);
    await unlockPage.setViewportSize({ width: 440, height: 420 });
    const unlock = unlockPage.getByRole('dialog', { name: 'Unlock secrets', exact: true });
    await expect(unlock).toBeVisible();
    expect(recordPuts(lab, start)).toEqual([]);
    await unlock.getByLabel('Passphrase', { exact: true }).fill(phrase);
    const unlockClosed = unlockPage.waitForEvent('close');
    await unlock.getByRole('button', { name: 'Unlock', exact: true }).click();
    await unlockClosed;
    await waitPublished(browser, project.seed.projectId, before.operations.length + 1);
    const after = await nativeState(browser.page, project.seed.projectId);
    expect(after.operations).toHaveLength(before.operations.length + 1);
    expect(after.pending).toBe(0);
    expect(recordPuts(lab, start)).toHaveLength(1);
    await closePopup(browser.context, target).catch(() => undefined);
    target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ protection: 'unlocked', localPublication: 'published' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-unlocked-published.png'),
      fullPage: false,
      action: 'Sync now',
    });
    for (let index = 0; index < 3; index++) await popupStatus(browser, target);
    expect(await nativeState(browser.page, project.seed.projectId)).toEqual(after);
    expect(recordPuts(lab, start)).toHaveLength(1);
    expect(
      (
        await project.probe.evaluate(
          (id) => window.webdavTransferHarness.portable.projectState(id),
          project.seed.projectId
        )
      ).objects
    ).toEqual(project.original.objects);
    await saveProof(info, {
      nativePopup: true,
      actualEnrollment: true,
      actualSharedWebdavProtection: true,
      lockedReadsDidNotFlush: true,
      sharedDialogCompleted: true,
      duplicateClicks: 2,
      successorsAfterUnlock: after.operations.length - before.operations.length,
      immutableRecordPuts: recordPuts(lab, start).length,
      reopenedReadsDidNotFlush: true,
      originalBytesUnchanged: true,
    });
  } finally {
    await browser.context.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('native popup repairs server storage refusal through Problems and explicit retry', async ({
  lab,
}, info) => {
  test.setTimeout(180000);
  const browser = await openProvider(lab, info, 'popup-server-storage', false, build, {
    viewport,
    headlessScreen: { width: 1920, height: 1080 },
  });
  const host = await startHostServer();
  try {
    const project = await enroll(browser, lab.credentials);
    const before = await nativeState(browser.page, project.seed.projectId);
    const source = await browser.context.newPage();
    await source.goto(host.origin);
    lab.proxy.armFault({ method: 'PUT', key: '*', kind: 'status', status: 507, repeat: true });
    await changeAndWait(browser, project, 'Popup server quota edit');
    let target = await openPopup(browser, source);
    await clickPopup(browser, target, 'Sync now');
    await lab.proxy.waitForFault();
    await expect
      .poll(
        async () => (await nativeState(browser.page, project.seed.projectId)).queue.at(-1)?.status,
        { timeout: 30000 }
      )
      .toBe('failed');
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ issue: 'queue-problem', repair: 'queue-problems' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-server-storage-refused.png'),
      fullPage: false,
      action: 'View uploads',
    });
    const failedState = await nativeState(browser.page, project.seed.projectId);
    await clickPopup(browser, target, 'View uploads');
    await expect(browser.page).toHaveURL(/section=saving&view=queue&queueFilter=problems/u);
    const failed = failedState.operations.at(-1);
    if (!failed) throw new Error('Storage refusal successor missing');
    const row = browser.page.locator(`[data-operation-id="${failed.operationId}"]`);
    await expect(row.getByText('Server storage full', { exact: true })).toBeVisible();
    expect(await nativeState(browser.page, project.seed.projectId)).toEqual(failedState);
    // The provider administrator frees remote quota; Settings only retries retained work.
    lab.proxy.releaseFault();
    await row.getByRole('button', { name: 'Retry', exact: true }).click();
    await waitPublished(browser, project.seed.projectId, before.operations.length + 1, 90000);
    await closePopup(browser.context, target).catch(() => undefined);
    target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ issue: null, localPublication: 'published' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-server-storage-recovered.png'),
      fullPage: false,
      action: 'Sync now',
    });
    const after = await nativeState(browser.page, project.seed.projectId);
    expect(after.operations.at(-1)?.operationId).toBe(failed.operationId);
    expect(
      (
        await project.probe.evaluate(
          (id) => window.webdavTransferHarness.portable.projectState(id),
          project.seed.projectId
        )
      ).objects
    ).toEqual(project.original.objects);
    await saveProof(info, {
      nativePopup: true,
      actualEnrollment: true,
      controlledHttp507: true,
      route: 'queue-problems',
      externalQuotaRecovery: true,
      explicitRowRetry: true,
      retainedOperation: true,
      originalBytesUnchanged: true,
      updatedPopup: true,
    });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('native popup repairs real rejected credentials in the selected connection', async ({
  lab,
}, info) => {
  test.setTimeout(240000);
  const browser = await openProvider(lab, info, 'popup-credentials-repair', false, build, {
    viewport,
    headlessScreen: { width: 1920, height: 1080 },
  });
  const host = await startHostServer();
  try {
    const project = await enroll(browser, lab.credentials);
    const before = await nativeState(browser.page, project.seed.projectId);
    const source = await browser.context.newPage();
    await source.goto(host.origin);
    await browser.page
      .getByRole('button', { name: 'Update credentials', exact: true })
      .click({ timeout: 10000 });
    await browser.page
      .getByLabel('Password', { exact: true })
      .fill('synthetic-rejected-app-password');
    await browser.page.getByRole('button', { name: 'Save credentials', exact: true }).click();
    await expect(browser.page.getByLabel('Password', { exact: true })).toHaveCount(0);
    await expect(
      browser.page.getByRole('button', { name: 'Update credentials', exact: true })
    ).toBeVisible();
    await changeAndWait(browser, project, 'Popup credential repair edit');
    let target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target), { timeout: 30000 })
      .toMatchObject({ issue: 'authentication', repair: 'connection' });
    await writeFile(
      info.outputPath('credential-rejected-status.json'),
      JSON.stringify(await popupStatus(browser, target), null, 2)
    );
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-authentication-refused.png'),
      fullPage: false,
      action: 'Resolve',
    });
    const refused = await nativeState(browser.page, project.seed.projectId);
    await clickPopup(browser, target, 'Resolve');
    await expect(browser.page).toHaveURL(/section=saving&view=connection$/u);
    expect(await nativeState(browser.page, project.seed.projectId)).toEqual(refused);
    await browser.page
      .getByRole('button', { name: 'Update credentials', exact: true })
      .click({ timeout: 10000 });
    await expect(browser.page.getByLabel('Username', { exact: true })).toHaveValue(
      lab.credentials.username
    );
    await browser.page.getByLabel('Password', { exact: true }).fill(lab.credentials.password);
    await browser.page.getByRole('button', { name: 'Save credentials', exact: true }).click();
    await expect(browser.page.getByLabel('Password', { exact: true })).toHaveCount(0);
    await expect(
      browser.page.getByRole('button', { name: 'Update credentials', exact: true })
    ).toBeVisible();
    await browser.page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await closePopup(browser.context, target).catch(() => undefined);
    target = await openPopup(browser, source);
    try {
      await waitPublished(browser, project.seed.projectId, before.operations.length + 1, 90000);
    } catch (error) {
      await writeFile(
        info.outputPath('credential-retry-failure.json'),
        JSON.stringify(
          {
            popup: await popupStatus(browser, target),
            native: await nativeState(browser.page, project.seed.projectId),
          },
          null,
          2
        )
      );
      throw error;
    }
    await closePopup(browser.context, target).catch(() => undefined);
    target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ issue: null, localPublication: 'published' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-credentials-repaired.png'),
      fullPage: false,
      action: 'Sync now',
    });
    expect(
      (
        await project.probe.evaluate(
          (id) => window.webdavTransferHarness.portable.projectState(id),
          project.seed.projectId
        )
      ).objects
    ).toEqual(project.original.objects);
    await saveProof(info, {
      nativePopup: true,
      actualEnrollment: true,
      realRejectedCredential: true,
      selectedConnectionCorrection: true,
      explicitSync: true,
      originalBytesUnchanged: true,
      updatedPopup: true,
    });
  } finally {
    await browser.context.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('native popup repairs a revoked server host grant through Settings', async ({ lab }, info) => {
  test.setTimeout(180000);
  const browser = await openProvider(lab, info, 'popup-permission-repair', false, build, {
    viewport,
    headlessScreen: { width: 1920, height: 1080 },
  });
  const host = await startHostServer();
  try {
    const project = await enroll(browser, lab.credentials);
    const source = await browser.context.newPage();
    await source.goto(host.origin);
    const originPattern = new URL(lab.proxy.rootUrl).origin + '/*';
    expect(
      await browser.page.evaluate(
        (origin) => chrome.permissions.remove({ origins: [origin] }),
        originPattern
      )
    ).toBe(true);
    expect(
      await browser.page.evaluate(
        (origin) => chrome.permissions.contains({ origins: [origin] }),
        originPattern
      )
    ).toBe(false);
    let target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ issue: 'permission-required', repair: 'connection' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-host-permission-revoked.png'),
      fullPage: false,
      action: 'Resolve',
    });
    const before = await nativeState(browser.page, project.seed.projectId);
    await clickPopup(browser, target, 'Resolve');
    await expect(browser.page).toHaveURL(/section=saving&view=connection$/u);
    expect(await nativeState(browser.page, project.seed.projectId)).toEqual(before);
    const grantButton = browser.page.getByRole('button', {
      name: 'Grant server access',
      exact: true,
    });
    await grantButton.click({ timeout: 10000 });
    await expect
      .poll(
        async () =>
          (await browser.page.evaluate(
            (origin) => chrome.permissions.contains({ origins: [origin] }),
            originPattern
          )) || (await browser.page.getByRole('alert').count()) > 0
      )
      .toBe(true);
    const nativePromptAccepted = await browser.page.evaluate(
      (origin) => chrome.permissions.contains({ origins: [origin] }),
      originPattern
    );
    if (!nativePromptAccepted) {
      await expect(browser.page.getByRole('alert')).toContainText(
        'Access to the selected server was not granted.'
      );
      expect(await nativeState(browser.page, project.seed.projectId)).toEqual(before);
      await browser.page.screenshot({
        path: info.outputPath('permission-native-consent-refused.png'),
        fullPage: false,
      });
      target = await openPopup(browser, source);
      expect(await popupStatus(browser, target)).toMatchObject({
        connection: 'paused',
        issue: 'permission-required',
      });
      await closePopup(browser.context, target);
      // After native prompt refusal, Chrome Settings models external consent.
      // The extension permission API still reports the actual browser grant.
      const chromeSettings = await browser.context.newPage();
      try {
        await chromeSettings.goto('chrome://extensions/');
        await chromeSettings.waitForFunction('Boolean(chrome.developerPrivate?.addHostPermission)');
        const session = await browser.context.newCDPSession(chromeSettings);
        try {
          const result: unknown = await session.send('Runtime.evaluate', {
            expression: `new Promise((resolve,reject)=>chrome.developerPrivate.addHostPermission(${JSON.stringify(browser.extensionId)},${JSON.stringify(originPattern)},()=>chrome.runtime.lastError?reject(new Error('Origin grant refused')):resolve(true)))`,
            awaitPromise: true,
            returnByValue: true,
          });
          expect(
            z.object({ result: z.object({ value: z.literal(true) }) }).parse(result).result.value
          ).toBe(true);
        } finally {
          await session.detach();
        }
      } finally {
        await chromeSettings.close();
      }
      await browser.page.bringToFront();
      await grantButton.click({ timeout: 10000 });
    }
    await expect
      .poll(() =>
        browser.page.evaluate(
          (origin) => chrome.permissions.contains({ origins: [origin] }),
          originPattern
        )
      )
      .toBe(true);
    await closePopup(browser.context, target).catch(() => undefined);
    target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ issue: null, connection: 'paused', localPublication: 'discovering' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-host-permission-granted-still-paused.png'),
      fullPage: false,
      action: 'Details',
    });
    await closePopup(browser.context, target);
    await browser.page.bringToFront();
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      await browser.page.setViewportSize(size);
      await browser.page.goto(
        `chrome-extension://${browser.extensionId}/${settingsPath}?section=saving&view=connection`
      );
      const resume = browser.page.getByRole('button', { name: 'Resume connection', exact: true });
      await resume.scrollIntoViewIfNeeded();
      await expect(resume).toBeInViewport();
      await browser.page.screenshot({
        path: info.outputPath(`native-resume-connection-${size.width}.png`),
        fullPage: false,
      });
    }
    await browser.page
      .getByRole('button', { name: 'Resume connection', exact: true })
      .click({ timeout: 10000 });
    await expect(
      browser.page.getByRole('button', { name: 'Resume connection', exact: true })
    ).toHaveCount(0);
    await browser.page.getByRole('button', { name: 'Sync now', exact: true }).click();
    target = await openPopup(browser, source);
    await expect
      .poll(() => popupStatus(browser, target))
      .toMatchObject({ issue: null, connection: 'active', localPublication: 'published' });
    await screenshot(browser.context, target, {
      path: info.outputPath('popup-host-permission-repaired.png'),
      fullPage: false,
      action: 'Sync now',
    });
    expect(await nativeState(browser.page, project.seed.projectId)).toEqual(before);
    expect(
      (
        await project.probe.evaluate(
          (id) => window.webdavTransferHarness.portable.projectState(id),
          project.seed.projectId
        )
      ).objects
    ).toEqual(project.original.objects);
    await saveProof(info, {
      nativePopup: true,
      actualEnrollment: true,
      actualHostRevocation: true,
      explicitSettingsGrant: true,
      nativePromptAccepted,
      externalChromeConsentRequired: !nativePromptAccepted,
      grantPreservedPause: true,
      explicitNativeConnectionResume: true,
      originalBytesUnchanged: true,
      noNewCheckpoint: true,
      updatedPopup: true,
    });
  } finally {
    await browser.context.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('connected repair controls and credential form fit both primary Settings viewports', async ({
  lab,
}, info) => {
  test.setTimeout(180000);
  const browser = await openProvider(lab, info, 'popup-repair-form-viewports', false, build, {
    viewport,
    headlessScreen: { width: 1920, height: 1080 },
  });
  try {
    await enroll(browser, lab.credentials);
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      await browser.page.setViewportSize(size);
      await browser.page.goto(
        `chrome-extension://${browser.extensionId}/${settingsPath}?section=saving&view=connection`
      );
      const update = browser.page.getByRole('button', { name: 'Update credentials', exact: true });
      const grant = browser.page.getByRole('button', { name: 'Grant server access', exact: true });
      await expect(update).toBeVisible();
      await expect(grant).toBeVisible();
      await update.click({ timeout: 10000 });
      await expect(browser.page.getByLabel('Username', { exact: true })).toHaveValue(
        lab.credentials.username
      );
      await expect(browser.page.getByLabel('Password', { exact: true })).toHaveValue('');
      const save = browser.page.getByRole('button', { name: 'Save credentials', exact: true });
      const cancel = browser.page.getByRole('button', { name: 'Cancel', exact: true });
      await expect(save).toBeDisabled();
      await cancel.scrollIntoViewIfNeeded();
      await expect(cancel).toBeInViewport();
      await expect(save).toBeInViewport();
      expect(
        await browser.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      ).toBe(true);
      await browser.page.screenshot({
        path: info.outputPath(`credential-repair-form-${size.width}.png`),
        fullPage: false,
      });
      await cancel.click();
      await expect(update).toBeVisible();
    }
    await saveProof(info, {
      actualEnrollment: true,
      primaryViewports: ['1280x560', '1920x900'],
      credentialForm: true,
      passwordEmpty: true,
      cancelOperated: true,
      horizontalScroll: false,
    });
  } finally {
    await browser.context.close();
  }
});
