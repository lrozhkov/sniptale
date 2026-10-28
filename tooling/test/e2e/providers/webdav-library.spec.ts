import { expect, type Page } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';
import { parseSyncProductResponse } from '../../../../apps/extension/src/contracts/messaging/contracts/runtime/sync-product';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../support/effect-v1-corpus.test-support';

type Provider = Awaited<ReturnType<typeof openProvider>>;
const build = '.tmp/e2e-builds/security';
const firstTitle = 'Primary WebDAV project';
const secondTitle = 'Secondary WebDAV project';

async function connectionPage(browser: Provider, viewport: { width: number; height: number }) {
  await browser.page.setViewportSize(viewport);
  await browser.page.evaluate(() =>
    chrome.storage.local.set({
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': 'light',
    })
  );
  await browser.page.goto(
    `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html?section=saving&view=connection`
  );
  await expect(
    browser.page.getByRole('button', { name: 'Join workspace', exact: true })
  ).toBeVisible();
}

async function fillConnectionDraft(
  page: Page,
  input: {
    mode: 'create' | 'join';
    url: string;
    username: string;
    password: string;
  }
) {
  await page
    .getByRole('button', {
      name: input.mode === 'create' ? 'Create workspace' : 'Join workspace',
      exact: true,
    })
    .click();
  await page
    .getByLabel(input.mode === 'create' ? 'Parent folder URL' : 'Workspace URL', { exact: true })
    .fill(input.url);
  await page.getByLabel('Account', { exact: true }).fill(input.username);
  await page.getByLabel('Username', { exact: true }).fill(input.username);
  await page.getByLabel('Password', { exact: true }).fill(input.password);
}

async function connectWorkspace(
  page: Page,
  input: {
    mode: 'create' | 'join';
    url: string;
    username: string;
    password: string;
  }
) {
  await fillConnectionDraft(page, input);
  await page.getByRole('button', { name: 'Connect workspace', exact: true }).click();
  const finish = page.getByRole('button', { name: 'Finish connection', exact: true });
  await expect(finish).toBeEnabled({ timeout: 30_000 });
  await finish.click();
  await expect(page.getByText('Storage connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const status: unknown = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'SYNC_PRODUCT_COMMAND',
      requestId: crypto.randomUUID(),
      command: { kind: 'status' },
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    })
  );
  const parsed = parseSyncProductResponse(status);
  if (!parsed?.success || parsed.result.kind !== 'status' || !parsed.result.status.connection)
    throw new Error('Settings did not enroll a connection.');
  return parsed.result.status.connection.rootUrl;
}

async function harnessPage(browser: Provider) {
  const page = await browser.context.newPage();
  await page.goto(
    `chrome-extension://${browser.extensionId}/tooling/test/harness/webdav-transfer.html`
  );
  await page.waitForFunction(() => Boolean(window.webdavTransferHarness));
  return page;
}

async function openLibrary(browser: Provider, viewport: { width: number; height: number }) {
  await browser.page.setViewportSize(viewport);
  await browser.page.goto(
    `chrome-extension://${browser.extensionId}/apps/extension/src/gallery/index.html`
  );
  await expect(browser.page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await browser.page.evaluate(() => document.fonts.ready);
}

async function expectEditor(editor: Page, clipId: string) {
  await expect(editor.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await expect(editor.locator(`[data-project-timeline-clip="${clipId}"]`)).toBeVisible();
  await expect
    .poll(() =>
      editor.locator('[data-preview-stage-canvas]').evaluate((node) => {
        if (!(node instanceof HTMLCanvasElement))
          throw new Error('Editor preview is not a canvas.');
        const context = node.getContext('2d');
        if (!context) throw new Error('Editor preview is unavailable.');
        const pixels = [0.25, 0.75].map(
          (x) =>
            context.getImageData(Math.floor(node.width * x), Math.floor(node.height / 2), 1, 1).data
        );
        const [left, right] = pixels;
        return Boolean(
          left && right && left[0]! > 200 && left[1]! < 120 && right[1]! > 150 && right[0]! < 80
        );
      })
    )
    .toBe(true);
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`Settings and Library open only the selected remote project and reopen offline ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(300_000);
    const source = await openProvider(lab, info, 'library-source', false, build, { viewport });
    const specimen = EFFECT_BUNDLE_CORPUS.find(
      (item) => item.accepted && item.artifact.includes('asset-bearing-conformance')
    );
    if (!specimen) throw new Error('Asset-bearing corpus is unavailable.');
    let target: Provider | null = null;
    try {
      await connectionPage(source, viewport);
      const enrolledRootUrl = await connectWorkspace(source.page, {
        mode: 'create',
        url: lab.credentials.rootUrl,
        ...lab.credentials,
      });
      await source.page.screenshot({
        path: info.outputPath('settings-created.png'),
        fullPage: false,
      });
      const sourceProof = await harnessPage(source);
      const seeded = await sourceProof.evaluate(
        async ({ effectBundleBytes, rootUrl }) => {
          const connection = await window.webdavTransferHarness.connection.restore();
          const first = await window.webdavTransferHarness.portable.source(
            { effectBundleBytes },
            { useExistingProfile: true, name: 'Primary WebDAV project' }
          );
          const second = await window.webdavTransferHarness.portable.source(undefined, {
            useExistingProfile: true,
            name: 'Secondary WebDAV project',
          });
          const sent = [];
          for (const item of [first, second]) {
            const media = await window.webdavTransferHarness.portable.outgoing.sendHistory(
              item.mediaId
            );
            const project = await window.webdavTransferHarness.portable.outgoing.sendHistory(
              item.projectId,
              true
            );
            sent.push({
              ...item,
              objects: [...media, ...project].flatMap((operation) => operation.files),
            });
          }
          return {
            rootUrl,
            spaceId: connection.profile.spaceId,
            first: sent[0]!,
            second: sent[1]!,
          };
        },
        {
          effectBundleBytes: Array.from(readEffectBundleCorpusArchive(specimen)),
          rootUrl: enrolledRootUrl,
        }
      );
      const rootKey = new URL(seeded.rootUrl).pathname.slice(
        new URL(lab.credentials.rootUrl).pathname.length
      );
      for (const object of [...seeded.first.objects, ...seeded.second.objects]) {
        expect(await lab.externalProof(`${rootKey}${object.key}`)).toEqual({
          size: object.size,
          sha256: object.sha256,
        });
      }
      await source.context.close();
      const beforeCatalog = lab.proxy.counts.getKeys.length;
      target = await openProvider(lab, info, 'library-target', false, build, { viewport });
      await connectionPage(target, viewport);
      await connectWorkspace(target.page, {
        mode: 'join',
        url: seeded.rootUrl,
        ...lab.credentials,
      });
      await target.page.screenshot({
        path: info.outputPath('settings-joined.png'),
        fullPage: false,
      });
      await openLibrary(target, viewport);
      const first = target.page.getByRole('group', { name: firstTitle, exact: true });
      const second = target.page.getByRole('group', { name: secondTitle, exact: true });
      await expect(first).toBeVisible();
      await expect(second).toBeVisible();
      await expect(first.getByRole('img')).toBeVisible({ timeout: 30_000 });
      // Preview files may be fetched, but listing and cards cannot hydrate originals or exports.
      const originalDigests = new Set(
        [
          ...seeded.first.editing,
          ...seeded.second.editing,
          seeded.first.exported,
          seeded.second.exported,
        ].map((file) => file.sha256)
      );
      const originalKeys = new Set(
        [...seeded.first.objects, ...seeded.second.objects]
          .filter((object) => originalDigests.has(object.sha256))
          .map((object) => `${rootKey}${object.key}`)
      );
      expect(
        lab.proxy.counts.getKeys.slice(beforeCatalog).filter((key) => originalKeys.has(key))
      ).toEqual([]);
      const search = target.page.getByRole('textbox', { name: 'Search Library', exact: true });
      await search.fill(firstTitle);
      await expect(first).toBeVisible();
      await expect(second).toHaveCount(0);
      await search.fill('');
      await expect(second).toBeVisible();
      await expect(first.getByRole('img')).toBeVisible();
      await target.page.screenshot({
        path: info.outputPath('remote-library.png'),
        fullPage: false,
      });
      // Keyboard activation has the same preparation admission as the pointer action.
      await first.focus();
      await target.page.keyboard.press('Enter');
      const download = target.page
        .getByRole('dialog', { name: firstTitle, exact: true })
        .getByRole('button', { name: 'Download and open', exact: true });
      await expect(download).toBeVisible();
      const opened = target.context.waitForEvent('page');
      await download.click();
      const editor = await opened;
      await editor.setViewportSize(viewport);
      await expectEditor(editor, seeded.first.clipId);
      await editor.screenshot({
        path: info.outputPath('selected-native-editor.png'),
        fullPage: false,
      });
      const nativeProof = await harnessPage(target);
      const admitted = await nativeProof.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        seeded.first.projectId
      );
      expect(admitted.objects).toEqual(seeded.first.editing);
      expect(admitted.graph).toEqual(seeded.first.graph);
      expect(admitted.exportAbsent).toBe(true);
      const untouched = await nativeProof.evaluate(
        ({ spaceId, rootId }) =>
          window.webdavTransferHarness.portable.outgoing.nativeState(
            spaceId,
            'video-project',
            rootId
          ),
        { spaceId: seeded.spaceId, rootId: seeded.second.projectId }
      );
      expect(untouched.exists).toBe(false);
      const exportKeys = new Set(
        [...seeded.first.objects, ...seeded.second.objects]
          .filter(
            (object) =>
              object.sha256 === seeded.first.exported.sha256 ||
              object.sha256 === seeded.second.exported.sha256
          )
          .map((object) => `${rootKey}${object.key}`)
      );
      expect(
        lab.proxy.counts.getKeys.slice(beforeCatalog).filter((key) => exportKeys.has(key))
      ).toEqual([]);
      await target.context.close();
      // BrowserContext offline does not cover every MV3 offscreen network context.
      await lab.proxy.close();
      const beforeOffline = lab.proxy.counts.getKeys.length;
      target = await openProvider(lab, info, 'library-target', false, build, {
        viewport,
        offline: true,
      });
      await openLibrary(target, viewport);
      const localCard = target.page.getByRole('group', { name: firstTitle, exact: true });
      await expect(localCard).toBeVisible();
      const reopened = target.context.waitForEvent('page');
      await localCard.getByRole('button', { name: 'Open in editor', exact: true }).click();
      const offlineEditor = await reopened;
      await offlineEditor.setViewportSize(viewport);
      await expectEditor(offlineEditor, seeded.first.clipId);
      const clip = offlineEditor.locator(`[data-project-timeline-clip="${seeded.first.clipId}"]`);
      await clip.click();
      await offlineEditor.keyboard.press('Delete');
      await expect(clip).toHaveCount(0);
      const offlineProof = await harnessPage(target);
      await expect
        .poll(async () =>
          (
            await offlineProof.evaluate(
              (id) => window.webdavTransferHarness.portable.proof(id),
              seeded.first.projectId
            )
          ).clipIds.includes(seeded.first.clipId)
        )
        .toBe(false);
      await offlineEditor.keyboard.press('Control+z');
      await expect(clip).toBeVisible();
      await expect
        .poll(async () =>
          (
            await offlineProof.evaluate(
              (id) => window.webdavTransferHarness.portable.proof(id),
              seeded.first.projectId
            )
          ).clipIds.includes(seeded.first.clipId)
        )
        .toBe(true);
      await offlineEditor.screenshot({
        path: info.outputPath('restarted-offline-editor.png'),
        fullPage: false,
      });
      expect(lab.proxy.counts.getKeys.length).toBe(beforeOffline);
      await saveProof(info, {
        selectedProject: seeded.first.projectId,
        unselectedProject: seeded.second.projectId,
        metadataOnlyCatalog: true,
        independentOriginalsAndExports: true,
        actualSettingsCreateAndJoin: true,
        actualLibrarySelection: true,
        offlineRestartEditAndUndo: true,
        editingObjects: admitted.objects,
        viewport,
      });
    } finally {
      await source.context.close();
      await target?.context.close();
    }
  });
}

test('Settings abandons an uncertain setup locally and creates a different owned folder', async ({
  lab,
}, info) => {
  test.setTimeout(120_000);
  const viewport = { width: 1280, height: 560 };
  const browser = await openProvider(lab, info, 'setup-recovery', false, build, { viewport });
  try {
    await connectionPage(browser, viewport);
    await fillConnectionDraft(browser.page, {
      mode: 'create',
      url: lab.credentials.rootUrl,
      ...lab.credentials,
    });
    lab.proxy.armFault({ method: 'MKCOL', key: '*', kind: 'lost-response' });
    await browser.page.getByRole('button', { name: 'Connect workspace', exact: true }).click();
    await lab.proxy.waitForFault();
    await expect(browser.page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    const probe = await harnessPage(browser);
    const uncertain = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(uncertain?.phase).toBe('allocating');
    if (!uncertain) throw new Error('Uncertain setup is missing.');
    const requestsBefore = {
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      mkcols: lab.proxy.counts.mkcols,
      propfinds: lab.proxy.counts.propfinds,
    };
    await browser.page.getByLabel('Password', { exact: true }).fill('');
    await browser.page
      .getByRole('button', { name: 'Cancel connection setup', exact: true })
      .click();
    await expect(browser.page.getByLabel('Parent folder URL', { exact: true })).toBeEnabled();
    await expect(
      browser.page.getByRole('button', { name: 'Join workspace', exact: true })
    ).toBeEnabled();
    const retired = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(retired?.phase).toBe('abandoned');
    expect(retired?.identity.incarnation).toBe(uncertain.identity.incarnation);
    expect({
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      mkcols: lab.proxy.counts.mkcols,
      propfinds: lab.proxy.counts.propfinds,
    }).toEqual(requestsBefore);
    await browser.page.screenshot({
      path: info.outputPath('setup-cancelled.png'),
      fullPage: false,
    });
    const enrolledRootUrl = await connectWorkspace(browser.page, {
      mode: 'create',
      url: lab.credentials.rootUrl,
      ...lab.credentials,
    });
    expect(enrolledRootUrl).not.toBe(uncertain.rootUrl);
    await saveProof(info, {
      uncertainPhase: uncertain.phase,
      localAbandonment: true,
      noCancelNetwork: true,
      differentOwnedFolder: true,
      viewport,
    });
  } finally {
    await browser.context.close();
  }
});

test('Settings retries a checked MKCOL 423 and completes the same workspace in one browser', async ({
  lab,
}, info) => {
  test.setTimeout(120_000);
  const viewport = { width: 1280, height: 560 };
  const browser = await openProvider(lab, info, 'setup-423-retry', false, build, { viewport });
  try {
    await connectionPage(browser, viewport);
    await fillConnectionDraft(browser.page, {
      mode: 'create',
      url: lab.credentials.rootUrl,
      ...lab.credentials,
    });
    lab.proxy.armFault({ method: 'MKCOL', key: '*', kind: 'status', status: 423 });
    await browser.page.getByRole('button', { name: 'Connect workspace', exact: true }).click();
    await lab.proxy.waitForFault();
    await expect(browser.page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    const probe = await harnessPage(browser);
    const refused = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(refused?.phase).toBe('planned');
    if (!refused) throw new Error('Retryable workspace plan is missing.');
    const refusal = lab.proxy.counts.mkcolStatuses.find((item) => item.status === 423);
    expect(refusal).toBeDefined();
    await browser.page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await expect(
      browser.page.getByRole('button', { name: 'Finish connection', exact: true })
    ).toBeEnabled({ timeout: 30_000 });
    const ready = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(ready?.phase).toBe('ready');
    expect(ready?.identity.incarnation).toBe(refused.identity.incarnation);
    expect(ready?.rootUrl).toBe(refused.rootUrl);
    expect(
      lab.proxy.counts.mkcolStatuses
        .filter((item) => item.key === refusal?.key)
        .map((item) => item.status)
    ).toEqual([423, 201]);
    await browser.page.getByRole('button', { name: 'Finish connection', exact: true }).click();
    await expect(browser.page.getByText('Storage connected', { exact: true })).toBeVisible();
    await expect(browser.page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await browser.page.screenshot({
      path: info.outputPath('setup-423-recovered.png'),
      fullPage: false,
    });
    await saveProof(info, {
      checkedRefusal: 423,
      sameWorkspaceRetry: true,
      mkcolStatuses: [423, 201],
      completedEnrollment: true,
      viewport,
    });
  } finally {
    await browser.context.close();
  }
});
