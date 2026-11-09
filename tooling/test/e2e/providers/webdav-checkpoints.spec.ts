import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';
import { parseSyncProductResponse } from '../../../../apps/extension/src/contracts/messaging/contracts/runtime/sync-product';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import type { NativeEditingRoot } from '../../../../apps/extension/src/composition/persistence/assets/editing-resources';
import { ASSET_ROOT_DIRECTORY_NAME } from '../../../../apps/extension/src/composition/persistence/assets/opfs-store';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { addReviewFocus } from '../support/quick-editor-media-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

type Provider = Awaited<ReturnType<typeof openProvider>>;
type Lab = Parameters<typeof openProvider>[0];
type Kind = 'image' | 'review' | 'montage' | 'scenario';
type Fixture = { root: NativeEditingRoot; title: string; clipId?: string };
type Edit = { name: string; apply(): Promise<void> };
const build = '.tmp/e2e-builds/security';
const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
const appUrl = (browser: Provider, path: string) =>
  `chrome-extension://${browser.extensionId}/apps/extension/src/${path}`;

async function connection(page: Page, credentials: Lab['credentials'], mode: 'create' | 'join') {
  await page.evaluate(() =>
    chrome.storage.local.set({
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': 'light',
    })
  );
  const url = new URL(page.url());
  url.pathname = '/apps/extension/src/settings/index.html';
  url.search = '?section=saving&view=connection';
  await page.goto(url.href);
  await page
    .getByRole('button', {
      name: mode === 'create' ? 'Create workspace' : 'Join workspace',
      exact: true,
    })
    .click();
  await page
    .getByLabel(mode === 'create' ? 'Parent folder URL' : 'Search folder URL', { exact: true })
    .fill(credentials.rootUrl);
  await page.getByLabel('Account', { exact: true }).fill(credentials.username);
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  if (mode === 'create')
    await page.getByRole('button', { name: 'Create in selected folder', exact: true }).click();
  else {
    await page.getByRole('button', { name: 'Find workspaces', exact: true }).click();
    const results = page.locator('[data-ui="settings.sync-discovery"]');
    await expect(results.getByRole('radio')).toHaveCount(1, { timeout: 30_000 });
    await results.getByRole('radio').check();
    await page.getByRole('button', { name: 'Select workspace', exact: true }).click();
  }
  await page
    .getByRole('checkbox', { name: 'I confirm on-demand file storage on this device', exact: true })
    .check();
  await page.getByRole('button', { name: 'Finish connection', exact: true }).click();
  await expect(page.getByText('Storage connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const raw: unknown = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'SYNC_PRODUCT_COMMAND',
      requestId: crypto.randomUUID(),
      command: { kind: 'status' },
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    })
  );
  const status = parseSyncProductResponse(raw);
  if (!status?.success || status.result.kind !== 'status' || !status.result.status.connection)
    throw new Error('Actual Settings enrollment is unavailable.');
  return status.result.status.connection.rootUrl;
}

async function proofPage(browser: Provider) {
  const page = await browser.context.newPage();
  await page.goto(
    `chrome-extension://${browser.extensionId}/tooling/test/harness/webdav-transfer.html`
  );
  await page.waitForFunction(() => Boolean(window.webdavTransferHarness));
  return page;
}
function native(probe: Page, root: NativeEditingRoot) {
  return probe.evaluate((root) => window.webdavTransferHarness.checkpoints.proof(root), root);
}
function physicalOriginals(objects: Awaited<ReturnType<typeof native>>['objects']) {
  const distinct = new Map(
    objects.map((object) => [object.objectKey ?? `inline:${object.assetId}`, object])
  );
  return [...distinct.values()]
    .map(({ size, sha256 }) => ({ size, sha256 }))
    .sort((a, b) => a.sha256.localeCompare(b.sha256) || a.size - b.size);
}

async function physicalFiles(probe: Page) {
  return probe.evaluate(async (assetRootName) => {
    const totals = {
      nativeObjects: { files: 0, fileContentBytes: 0 },
      nativeAuxiliary: { files: 0, fileContentBytes: 0 },
      otherNamespaces: { files: 0, fileContentBytes: 0 },
      disappearedDuringScan: 0,
    };
    const nativeFiles: { objectKey: string; size: number; sha256: string }[] = [];
    const auxiliaryFiles: { path: string; size: number }[] = [];
    async function walk(directory: FileSystemDirectoryHandle, segments: string[]) {
      for await (const [name, handle] of directory.entries()) {
        const path = [...segments, name];
        if (handle.kind === 'directory') {
          await walk(handle, path);
          continue;
        }
        try {
          const file = await handle.getFile();
          const group =
            path[0] !== assetRootName
              ? totals.otherNamespaces
              : path[1] === 'objects'
                ? totals.nativeObjects
                : totals.nativeAuxiliary;
          group.files++;
          group.fileContentBytes += file.size;
          if (group === totals.nativeObjects) {
            const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            nativeFiles.push({
              objectKey: path.slice(1).join('/'),
              size: file.size,
              sha256: [...new Uint8Array(digest)]
                .map((value) => value.toString(16).padStart(2, '0'))
                .join(''),
            });
          } else if (group === totals.nativeAuxiliary) {
            auxiliaryFiles.push({ path: path.slice(1).join('/'), size: file.size });
          }
        } catch (error) {
          if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
          totals.disappearedDuringScan++;
        }
      }
    }
    await walk(await navigator.storage.getDirectory(), []);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onupgradeneeded = () => {
        request.transaction?.abort();
        reject(new Error('Native database missing during physical proof.'));
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(['asset_refs', 'asset_owners'], 'readonly');
      const count = (name: string) =>
        new Promise<number>((resolve, reject) => {
          const request = tx.objectStore(name).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [refs, owners] = await Promise.all([count('asset_refs'), count('asset_owners')]);
      const locks = await navigator.locks.query();
      return {
        ...totals,
        nativeFiles: nativeFiles.sort((a, b) => a.objectKey.localeCompare(b.objectKey)),
        auxiliaryFiles: auxiliaryFiles.sort((a, b) => a.path.localeCompare(b.path)),
        resourceReaders: (locks.held ?? [])
          .filter((lock) => lock.name === 'sniptale:assets:resource-readers')
          .map((lock) => ({ mode: lock.mode ?? null })),
        refs,
        owners,
        scope: 'Whole origin OPFS file contents and separate native metadata row counts.',
        limitation:
          'Non-atomic observation. File content bytes are not Chrome disk allocation. ' +
          'Other namespaces are not assumed to be transport copies.',
      };
    } finally {
      db.close();
    }
  }, ASSET_ROOT_DIRECTORY_NAME);
}

async function importedImageMetadata(probe: Page, rootId: string) {
  return probe.evaluate(async (rootId) => {
    const record = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    const scalar = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : null;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = database.transaction(
        ['media_library', 'image_workspaces', 'project_assets', 'asset_refs', 'sync_capture'],
        'readonly'
      );
      const read = (store: string, key: IDBValidKey) =>
        new Promise<unknown>((resolve, reject) => {
          const request = tx.objectStore(store).get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [media, workspace, profile] = await Promise.all([
        read('media_library', rootId),
        read('image_workspaces', rootId),
        read('sync_capture', 'profile'),
      ]);
      const source = record(media) && record(media['source']) ? media['source'] : null;
      const projectAssetId =
        source && typeof source['projectAssetId'] === 'string' ? source['projectAssetId'] : null;
      const child = projectAssetId ? await read('project_assets', projectAssetId) : null;
      const assetId =
        record(child) && typeof child['assetId'] === 'string' ? child['assetId'] : null;
      const ref = assetId ? await read('asset_refs', assetId) : null;
      const document =
        record(workspace) && record(workspace['document']) ? workspace['document'] : null;
      const sourceImage =
        document && record(document['sourceImage']) ? document['sourceImage'] : null;
      return {
        media: record(media)
          ? {
              id: scalar(media['id']),
              kind: scalar(media['kind']),
              sourceKind: source ? scalar(source['kind']) : null,
              projectAssetId,
              workspaceRevision: scalar(media['workspaceRevision']),
              size: scalar(media['size']),
              mimeType: scalar(media['mimeType']),
            }
          : null,
        workspace: record(workspace)
          ? {
              aggregateId: scalar(workspace['aggregateId']),
              revision: scalar(workspace['revision']),
              sourceImageAssetId: sourceImage ? scalar(sourceImage['assetId']) : null,
            }
          : null,
        projectAsset: record(child)
          ? {
              id: scalar(child['id']),
              assetId: scalar(child['assetId']),
              size: scalar(child['size']),
              mimeType: scalar(child['mimeType']),
              originMediaId: scalar(child['originMediaId']),
            }
          : null,
        originalRef: record(ref)
          ? {
              assetId: scalar(ref['assetId']),
              size: scalar(ref['size']),
              mimeType: scalar(ref['mimeType']),
              sha256: scalar(ref['sha256']),
            }
          : null,
        profile: record(profile)
          ? {
              enabled: scalar(profile['enabled']),
              spaceId: scalar(profile['spaceId']),
              connectionGeneration: scalar(profile['connectionGeneration']),
              checkpointIntervalMs: scalar(profile['checkpointIntervalMs']),
            }
          : null,
      };
    } finally {
      database.close();
    }
  }, rootId);
}
async function uploadInterval(
  settings: Page,
  choice: 'After 1 hour' | 'After 1 minute' = 'After 1 hour'
) {
  await settings.getByRole('button', { name: 'Upload changes', exact: true }).click();
  await settings.getByRole('option', { name: choice, exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Upload changes', exact: true })).toContainText(
    choice
  );
}
async function flush(settings: Page) {
  await settings.getByRole('button', { name: 'Sync now', exact: true }).click();
}
async function published(probe: Page, root: NativeEditingRoot) {
  await expect
    .poll(
      async () => {
        const value = await native(probe, root);
        return {
          pending: value.pending.length,
          captures: value.captures.length > 0,
          completed: value.allOperations.every((operation) => operation.phase === 'published'),
        };
      },
      { timeout: 90_000 }
    )
    .toEqual({ pending: 0, captures: true, completed: true });
  return native(probe, root);
}
async function png(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 48;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Fixture image unavailable.');
    context.fillStyle = '#336699';
    context.fillRect(0, 0, 96, 48);
    context.fillStyle = '#e8b532';
    context.fillRect(24, 12, 32, 20);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  if (!data) throw new Error('Fixture image encoding unavailable.');
  return Buffer.from(data, 'base64');
}
async function seed(browser: Provider, probe: Page, kind: Kind, image: Buffer): Promise<Fixture> {
  switch (kind) {
    case 'image': {
      await browser.page.goto(appUrl(browser, 'gallery/index.html'));
      await expect(browser.page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await browser.page
        .locator('input[type="file"][multiple]')
        .setInputFiles({ name: 'Checkpoint Image.png', mimeType: 'image/png', buffer: image });
      await expect(
        browser.page.getByRole('group', { name: 'Checkpoint Image.png', exact: true })
      ).toBeVisible();
      const id = await probe.evaluate(() =>
        window.webdavTransferHarness.checkpoints.mediaId('Checkpoint Image.png')
      );
      return { root: { rootKind: 'media', rootId: id }, title: 'Checkpoint Image.png' };
    }
    case 'review': {
      const bytes = Array.from(
        await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
      );
      const value = await probe.evaluate(
        (bytes) =>
          window.webdavTransferHarness.review.seed(bytes, 'project-asset', {
            useExistingProfile: true,
          }),
        bytes
      );
      return {
        root: { rootKind: 'video-review', rootId: value.mediaId },
        title: 'Renamed review original.webm',
      };
    }
    case 'montage': {
      const value = await probe.evaluate(() =>
        window.webdavTransferHarness.portable.source(undefined, {
          useExistingProfile: true,
          name: 'Checkpoint Montage',
        })
      );
      return {
        root: { rootKind: 'video-project', rootId: value.projectId },
        title: 'Checkpoint Montage',
        clipId: value.clipId,
      };
    }
    case 'scenario': {
      const value = await probe.evaluate(
        (bytes) => window.webdavTransferHarness.checkpoints.seedScenario(bytes),
        Array.from(image)
      );
      return { root: value.root, title: 'Checkpoint Scenario' };
    }
  }
}
async function sourceEditor(browser: Provider, fixture: Fixture, kind: Kind) {
  if (kind === 'review') {
    await browser.page.goto(appUrl(browser, 'gallery/index.html'));
    await expect(browser.page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    const card = browser.page.locator(
      `[data-gallery-keyboard-id=${JSON.stringify(fixture.root.rootId)}]`
    );
    await card.focus();
    await browser.page.keyboard.press('Enter');
    await browser.page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await expect(browser.page.locator('[data-ui="gallery.videoReview.dialog"]')).toBeVisible();
    const choice = browser.page.locator('[data-ui="gallery.videoReview.modeChoice.advanced"]');
    const scene = browser.page
      .locator('[data-ui="gallery.videoReview.dialog"]')
      .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true });
    await expect(choice.or(scene)).toBeVisible({ timeout: 30_000 });
    if (await choice.isVisible()) await choice.click();
    await expect(scene).toBeVisible();
    return browser.page;
  }
  const editor = await browser.context.newPage();
  const path =
    kind === 'image'
      ? `editor/index.html?assetId=${encodeURIComponent(fixture.root.rootId)}`
      : kind === 'montage'
        ? `video-editor/index.html?project=${encodeURIComponent(fixture.root.rootId)}`
        : `scenario-editor/index.html?projectId=${encodeURIComponent(fixture.root.rootId)}`;
  await editor.goto(appUrl(browser, path));
  await expect(
    editor.locator(
      kind === 'image'
        ? '[data-ui="editor.page.root"]'
        : kind === 'montage'
          ? '[data-ui="video-editor.timeline.surface"]'
          : '.guide-page-header'
    )
  ).toBeVisible();
  return editor;
}
async function number(owner: Page | Locator, key: Parameters<typeof translate>[0], value: string) {
  const field = owner.getByRole('textbox', { name: label(key), exact: true });
  await field.fill(value);
  await field.press('Enter');
  await expect(field).toHaveValue(value);
}
async function disclosure(page: Page, key: Parameters<typeof translate>[0]) {
  const summary = page.locator('summary').filter({ hasText: label(key) });
  if (await summary.count()) {
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  }
}
async function category(page: Page, key: Parameters<typeof translate>[0]) {
  const button = page
    .locator('[data-ui="video-editor.inspector.categories"] nav')
    .getByRole('button', { name: label(key), exact: true });
  if (await button.count()) await button.click();
  else await disclosure(page, key);
}
async function imageControls(page: Page) {
  await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
  const panel = page.locator('[data-ui="editor.frame-panel"]');
  await chooseInspectorValue(
    page,
    panel.locator('[data-ui="editor.frame.background-mode"]'),
    label('editor.scene.backgroundTypeSection'),
    label('editor.compact.frameBackgroundModeColor')
  );
  await expect(panel.locator('[data-ui="editor.frame.source-basics"]')).toBeVisible();
  await disclosure(page, 'editor.scene.sourceShadow');
  await disclosure(page, 'editor.scene.borderAdvanced');
  const padding = panel.locator('[data-ui="editor.frame.padding-fields"]');
  for (const axis of ['all', 'horizontal', 'vertical']) {
    const toggle = padding.locator(`[data-padding-link="${axis}"]`);
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  }
  await expect(
    panel.getByRole('textbox', { name: label('highlighter.editor.paddingRight'), exact: true })
  ).toBeVisible();
  return panel;
}
function imageEdits(page: Page): Edit[] {
  const owner = page.locator('[data-ui="editor.frame-panel"]');
  return (
    [
      ['highlighter.editor.paddingTop', '8'],
      ['highlighter.editor.paddingTop', '12'],
      ['highlighter.editor.paddingRight', '14'],
      ['highlighter.editor.paddingBottom', '16'],
      ['highlighter.editor.paddingLeft', '18'],
      ['editor.compact.cornerRadius', '4'],
      ['editor.compact.cornerRadius', '6'],
      ['editor.compact.size', '25'],
      ['editor.compact.size', '40'],
      ['editor.compact.blurStrokeWidth', '2'],
    ] as const
  ).map(([key, value]) => ({ name: `${key}:${value}`, apply: () => number(owner, key, value) }));
}
function reviewEdits(page: Page): Edit[] {
  const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const scene = async () => {
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
      .click();
    const background = dialog
      .locator('[data-ui="gallery.videoReview.inspectorCategories"] nav')
      .getByRole('button', { name: label('gallery.videoReview.background'), exact: true });
    if (await background.count()) await background.click();
  };
  return [
    {
      name: 'background:color',
      apply: async () => {
        await scene();
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.backgroundSolid'), exact: true })
          .click();
        await dialog
          .locator('[data-ui="gallery.videoReview.gradientPresets"] button[aria-pressed="false"]')
          .first()
          .click();
      },
    },
    ...(
      [
        ['gallery.videoReview.backgroundPadding', '8'],
        ['gallery.videoReview.backgroundPadding', '12'],
        ['gallery.videoReview.backgroundCornerRadius', '10'],
        ['gallery.videoReview.backgroundShadow', '40'],
      ] as const
    ).map(([key, value]) => ({ name: `${key}:${value}`, apply: () => number(dialog, key, value) })),
    { name: 'focus:insert', apply: () => addReviewFocus(page) },
    {
      name: 'focus:rotation:15',
      apply: async () => {
        await dialog
          .locator('[data-ui="gallery.videoReview.spatialTools"]')
          .getByRole('button', {
            name: label('gallery.videoReview.spatialToolRotation'),
            exact: true,
          })
          .click();
        await number(dialog, 'gallery.videoReview.perspectiveZ', '15');
      },
    },
    {
      name: 'cut:original',
      apply: async () => {
        const sourceTrack = dialog
          .locator('[data-review-header-track="source"]')
          .getByRole('button', { name: label('gallery.videoReview.sourceVideo'), exact: true });
        await sourceTrack.click();
        await expect(sourceTrack).toHaveAttribute('aria-pressed', 'true');
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.cutMode'), exact: true })
          .click();
        const lane = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
        await lane.scrollIntoViewIfNeeded();
        const box = await lane.boundingBox();
        if (!box) throw new Error('Actual source lane unavailable.');
        const duration = Number(
          await dialog
            .locator('[data-ui="gallery.videoReview.timePlane"]')
            .getAttribute('aria-valuemax')
        );
        await page.mouse.move(box.x + (box.width * 2.1) / duration, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + (box.width * 4.1) / duration, box.y + box.height / 2, {
          steps: 8,
        });
        await page.mouse.up();
      },
    },
    {
      name: 'cut:dissolve',
      apply: async () => {
        await disclosure(page, 'gallery.videoReview.cutTransition');
        const owner = dialog.locator('[data-ui="gallery.videoReview.cutTransition"]');
        await owner
          .getByRole('button', {
            name: label('gallery.videoReview.zoomTransitionType'),
            exact: true,
          })
          .click();
        await page
          .getByRole('option', { name: label('gallery.videoReview.cutDissolve'), exact: true })
          .click();
      },
    },
    {
      name: 'cut:blend-duration:0.6',
      apply: () =>
        number(
          dialog.locator('[data-ui="gallery.videoReview.cutTransition"]'),
          'gallery.videoReview.zoomTransitionDuration',
          '0.6'
        ),
    },
  ];
}
function montageEdits(page: Page, clipId: string): Edit[] {
  const clip = () => page.locator(`[data-project-timeline-clip="${clipId}"]`).click();
  const framing = async () => {
    await clip();
    await category(page, 'videoEditor.sidebar.inspectorGroupFraming');
  };
  const transform = async () => {
    await clip();
    await category(page, 'videoEditor.sidebar.inspectorGroupTransform');
  };
  return [
    {
      name: 'scene:gradient',
      apply: async () => {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await category(page, 'videoEditor.sidebar.inspectorGroupBackground');
        await chooseInspectorValue(
          page,
          page.locator('[data-ui="video-editor.scene-background"]'),
          label('videoEditor.sidebar.sceneBackgroundTypeLabel'),
          label('videoEditor.sidebar.sceneBackgroundGradient')
        );
      },
    },
    ...(
      [
        ['gallery.videoReview.backgroundPadding', '8'],
        ['gallery.videoReview.backgroundPadding', '12'],
      ] as const
    ).map(([key, value]) => ({
      name: `${key}:${value}`,
      apply: async () => {
        await framing();
        await number(page, key, value);
      },
    })),
    {
      name: 'frame:radius:10',
      apply: async () => {
        await framing();
        await disclosure(page, 'videoEditor.sidebar.inspectorGroupAppearance');
        await number(page, 'gallery.videoReview.backgroundCornerRadius', '10');
      },
    },
    {
      name: 'frame:shadow:40',
      apply: () => number(page, 'videoEditor.sidebar.mediaShadowIntensityLabel', '40'),
    },
    ...(['15', '25'] as const).map((value) => ({
      name: `rotation:${value}`,
      apply: async () => {
        await transform();
        await number(page, 'videoEditor.sidebar.rotationLabel', value);
      },
    })),
    ...(['80', '60'] as const).map((value) => ({
      name: `alpha-compositing:${value}`,
      apply: async () => {
        await transform();
        await number(page, 'videoEditor.sidebar.opacityLabel', value);
      },
    })),
    {
      name: 'position:x:300',
      apply: async () => {
        await transform();
        await disclosure(page, 'videoEditor.sidebar.inspectorExactPlacement');
        const x = page.getByRole('textbox', { name: 'X', exact: true });
        await x.fill('300');
        await x.press('Enter');
        await expect(x).toHaveValue('300');
      },
    },
  ];
}
function scenarioEdits(page: Page): Edit[] {
  const choose = async (field: string, option: string) => {
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await chooseInspectorValue(page, page.locator('#guide-inspector-panel'), field, option);
  };
  return [
    {
      name: 'name',
      apply: async () => {
        const field = page.getByRole('textbox', { name: 'Scenario', exact: true });
        await field.fill('Checkpoint Scenario final');
        await field.press('Tab');
      },
    },
    {
      name: 'step:title',
      apply: async () => {
        const field = page.getByRole('textbox', { name: 'Step title', exact: true });
        await field.fill('Final checkpoint step');
        await field.press('Tab');
      },
    },
    {
      name: 'step:explanation',
      apply: async () => {
        const field = page.locator('[data-block-id="checkpoint-text"] textarea');
        await field.fill('Final durable explanation');
        await field.press('Tab');
      },
    },
    ...(
      [
        ['Paper theme', 'Graphite'],
        ['Font', 'Serif'],
        ['Spacing', 'Compact'],
        ['Content width', 'Wide'],
        ['Image border', 'Strong'],
        ['Number style', 'Plain'],
        ['Paper theme', 'Warm'],
      ] as const
    ).map(([field, value]) => ({ name: `${field}:${value}`, apply: () => choose(field, value) })),
  ];
}

async function receiverEditor(browser: Provider, fixture: Fixture, kind: Kind) {
  await browser.page.goto(appUrl(browser, 'gallery/index.html'));
  await expect(browser.page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  const selectedItem = () =>
    browser.page.locator('[data-gallery-keyboard-id]').evaluateAll((nodes, root) => {
      for (const node of nodes) {
        const id = node.getAttribute('data-gallery-keyboard-id');
        if (!id) continue;
        let value: unknown;
        try {
          value = JSON.parse(id);
        } catch {
          continue;
        }
        if (
          Array.isArray(value) &&
          value[0] === 'remote' &&
          value[1] === root.rootKind &&
          value[2] === root.rootId
        )
          return id;
      }
      return null;
    }, fixture.root);
  await expect.poll(selectedItem, { timeout: 30_000 }).not.toBeNull();
  const itemId = await selectedItem();
  if (!itemId) throw new Error('Selected remote checkpoint card unavailable.');
  const card = browser.page.locator(`[data-gallery-keyboard-id=${JSON.stringify(itemId)}]`);
  await card.focus();
  await browser.page.keyboard.press('Enter');
  const download = browser.page
    .getByRole('dialog')
    .getByRole('button', { name: 'Download and open', exact: true });
  await expect(download).toBeVisible();
  const opened = browser.context.waitForEvent('page', { timeout: 60_000 });
  await download.click();
  const editor = await opened;
  if (kind === 'review') {
    await expect(editor.locator('[data-ui="gallery.videoReview.dialog"]')).toBeVisible({
      timeout: 60_000,
    });
    const choice = editor.locator('[data-ui="gallery.videoReview.modeChoice.advanced"]');
    const scene = editor
      .locator('[data-ui="gallery.videoReview.dialog"]')
      .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true });
    await expect(choice.or(scene)).toBeVisible({ timeout: 30_000 });
    if (await choice.isVisible()) await choice.click();
    await expect(scene).toBeVisible();
    return editor;
  }
  await expect(
    editor.locator(
      kind === 'image'
        ? '[data-ui="editor.page.root"]'
        : kind === 'montage'
          ? '[data-ui="video-editor.timeline.surface"]'
          : '.guide-page-header'
    )
  ).toBeVisible({ timeout: 60_000 });
  return editor;
}
async function verifyControls(page: Page, fixture: Fixture, kind: Kind) {
  if (kind === 'image') {
    const owner = await imageControls(page);
    await expect(
      owner.getByRole('textbox', { name: label('editor.compact.cornerRadius'), exact: true })
    ).toHaveValue('6');
    await expect(
      owner.getByRole('textbox', { name: label('editor.compact.size'), exact: true })
    ).toHaveValue('40');
    await expect(
      owner.getByRole('textbox', { name: label('editor.compact.blurStrokeWidth'), exact: true })
    ).toHaveValue('2');
  } else if (kind === 'review') {
    const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
      .click();
    const background = dialog
      .locator('[data-ui="gallery.videoReview.inspectorCategories"] nav')
      .getByRole('button', { name: label('gallery.videoReview.background'), exact: true });
    if (await background.count()) await background.click();
    await expect(
      dialog.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundPadding'),
        exact: true,
      })
    ).toHaveValue('12');
    await expect(
      dialog.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundShadow'),
        exact: true,
      })
    ).toHaveValue('40');
    await dialog
      .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
      .first()
      .click();
    await dialog
      .locator('[data-ui="gallery.videoReview.spatialTools"]')
      .getByRole('button', { name: label('gallery.videoReview.spatialToolRotation'), exact: true })
      .click();
    await expect(
      dialog.getByRole('textbox', { name: label('gallery.videoReview.perspectiveZ'), exact: true })
    ).toHaveValue('15');
  } else if (kind === 'montage') {
    if (!fixture.clipId) throw new Error('Montage clip identity unavailable.');
    await page.locator(`[data-project-timeline-clip="${fixture.clipId}"]`).click();
    await category(page, 'videoEditor.sidebar.inspectorGroupTransform');
    await expect(
      page.getByRole('textbox', { name: label('videoEditor.sidebar.rotationLabel'), exact: true })
    ).toHaveValue('25');
    await expect(
      page.getByRole('textbox', { name: label('videoEditor.sidebar.opacityLabel'), exact: true })
    ).toHaveValue('60');
  } else {
    await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
      'Checkpoint Scenario final'
    );
    await expect(page.getByRole('textbox', { name: 'Step title', exact: true })).toHaveValue(
      'Final checkpoint step'
    );
    await expect(page.locator('[data-block-id="checkpoint-text"] textarea')).toHaveValue(
      'Final durable explanation'
    );
    await expect(page.locator('article#checkpoint-step')).toHaveCSS(
      'background-color',
      'rgb(255, 250, 240)'
    );
  }
}
function transferSummary(lab: Lab, putIndex: number, getIndex: number) {
  const puts = lab.proxy.counts.putBodies.slice(putIndex);
  const gets = structuredClone(lab.proxy.counts.getBodies.slice(getIndex));
  const objects = (key: string) => key.startsWith('Files/') || key.includes('/Files/');
  return {
    classRule:
      'Protocol metadata is outside Files/. Object totals include declared structured history objects.',
    puts,
    gets,
    metadataPutBytes: puts
      .filter((row) => !objects(row.key))
      .reduce((sum, row) => sum + row.bytes, 0),
    objectPutBytes: puts.filter((row) => objects(row.key)).reduce((sum, row) => sum + row.bytes, 0),
    metadataGetBytes: gets
      .filter((row) => !objects(row.key))
      .reduce((sum, row) => sum + row.forwardedBytes, 0),
    objectGetBytes: gets
      .filter((row) => objects(row.key))
      .reduce((sum, row) => sum + row.forwardedBytes, 0),
  };
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS)
  for (const kind of ['image', 'review', 'montage', 'scenario'] as const) {
    test(`actual ${kind} ten mixed edits coalesce through WebDAV ${viewport.size.width}`, async ({
      lab,
    }, info) => {
      test.setTimeout(300_000);
      const sender = await openProvider(lab, info, 'checkpoint-source', false, build, {
        harness: false,
        viewport: viewport.size,
      });
      let receiver: Provider | null = null;
      const errors: string[] = [];
      for (const page of sender.context.pages())
        page.on('pageerror', (error) => errors.push(error.message));
      sender.context.on('page', (page) =>
        page.on('pageerror', (error) => errors.push(error.message))
      );
      try {
        const workspaceUrl = await connection(sender.page, lab.credentials, 'create');
        const settings = await sender.context.newPage();
        await settings.goto(appUrl(sender, 'settings/index.html?section=saving&view=connection'));
        const naturalDeadline = kind === 'image' && viewport.size.width === 1920;
        await uploadInterval(settings, naturalDeadline ? 'After 1 minute' : 'After 1 hour');
        const probe = await proofPage(sender);
        const image = await png(sender.page);
        const fixture = await test.step(
          'Seed one root under the current enrolled profile',
          () => seed(sender, probe, kind, image),
          { timeout: 90_000 }
        );
        const editor = await test.step(
          'Open the actual source editor',
          () => sourceEditor(sender, fixture, kind),
          { timeout: 90_000 }
        );
        await editor.setViewportSize(viewport.size);
        if (kind === 'image') await imageControls(editor);
        await editor.screenshot({
          path: info.outputPath(`${kind}-source-editor-ready.png`),
          fullPage: false,
        });
        await test.step('Publish the baseline through Settings', () => flush(settings), {
          timeout: 90_000,
        });
        const before = await test.step(
          'Read the published baseline and native original hashes',
          async () => {
            try {
              return await published(probe, fixture.root);
            } catch (error) {
              await saveProof(info, {
                stage: 'baseline-publication',
                root: fixture.root,
                observed: await native(probe, fixture.root),
                transfers: transferSummary(lab, 0, 0),
                localPhysicalFiles: await physicalFiles(probe),
                pageErrors: errors,
              });
              throw error;
            }
          },
          { timeout: 95_000 }
        );
        const localPhysicalBefore = await physicalFiles(probe);
        const baselineTransfers = transferSummary(lab, 0, 0);
        const putIndex = lab.proxy.counts.putBodies.length;
        const getIndex = lab.proxy.counts.getBodies.length;
        const edits =
          kind === 'image'
            ? imageEdits(editor)
            : kind === 'review'
              ? reviewEdits(editor)
              : kind === 'montage' && fixture.clipId
                ? montageEdits(editor, fixture.clipId)
                : scenarioEdits(editor);
        expect(edits).toHaveLength(10);
        const durable = [];
        let previous = before.logicalSha256;
        for (const edit of edits) {
          await editor.bringToFront();
          await test.step(`Commit actual UI edit: ${edit.name}`, () => edit.apply(), {
            timeout: 45_000,
          });
          try {
            await expect
              .poll(async () => (await native(probe, fixture.root)).logicalSha256, {
                message: `Durable actual UI change: ${edit.name}`,
              })
              .not.toBe(previous);
          } catch (error) {
            await editor.screenshot({
              path: info.outputPath(`${kind}-uncommitted-edit.png`),
              fullPage: false,
            });
            await saveProof(info, {
              stage: 'actual-ui-change-not-durable',
              edit: edit.name,
              before,
              observed: await native(probe, fixture.root),
              pageErrors: errors,
            });
            throw error;
          }
          const saved = await native(probe, fixture.root);
          previous = saved.logicalSha256;
          expect(saved.captures).toEqual(before.captures);
          if (kind === 'image' && saved.pending.length === 0) {
            await writeFile(
              info.outputPath('imported-image-checkpoint-metadata.json'),
              JSON.stringify(await importedImageMetadata(probe, fixture.root.rootId), null, 2)
            );
          }
          expect(saved.pending).toHaveLength(1);
          expect(
            lab.proxy.counts.putBodies
              .slice(putIndex)
              .filter((row) => row.key.includes('/records/'))
          ).toHaveLength(0);
          durable.push({
            edit: edit.name,
            revision: saved.revision,
            logicalSha256: saved.logicalSha256,
            pendingRevision: saved.pending[0]?.revision,
            immutableCaptures: saved.captures.length,
            queueOperations: saved.queue.length,
            transfers: transferSummary(lab, putIndex, getIndex),
          });
        }
        const finalLocal = await native(probe, fixture.root);
        const localPhysicalDirty = await physicalFiles(probe);
        expect(finalLocal.objects.map(({ size, sha256 }) => ({ size, sha256 }))).toEqual(
          before.objects.map(({ size, sha256 }) => ({ size, sha256 }))
        );
        expect(finalLocal.physicalBytes).toBe(before.physicalBytes);
        expect(finalLocal.physicalObjects).toBe(before.physicalObjects);
        await editor.screenshot({
          path: info.outputPath(`${kind}-durable-before-publication.png`),
          fullPage: false,
        });
        const trigger = naturalDeadline
          ? 'automatic-1-minute'
          : kind === 'review'
            ? 'editor-exit'
            : kind === 'montage'
              ? 'new-project-exit'
              : 'settings-sync-now';
        let createdProjectId: string | null = null;
        if (trigger === 'settings-sync-now') await flush(settings);
        else if (trigger === 'editor-exit')
          await editor
            .locator('[data-ui="gallery.videoReview.dialog"]')
            .getByRole('button', { name: label('common.actions.close'), exact: true })
            .click();
        else if (trigger === 'new-project-exit') {
          await editor.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
          await editor
            .getByRole('button', { name: label('videoEditor.app.newProjectAction'), exact: true })
            .click();
          const create = editor.locator('[data-ui="video-editor.project-name-dialog"]');
          await create.getByRole('textbox').fill('Checkpoint next project');
          await create
            .getByRole('button', { name: label('videoEditor.app.newProjectAction'), exact: true })
            .click();
          await expect(create).toBeHidden();
          await expect
            .poll(() => new URL(editor.url()).searchParams.get('project'))
            .not.toBe(fixture.root.rootId);
          createdProjectId = new URL(editor.url()).searchParams.get('project');
          expect(createdProjectId).toBeTruthy();
        }
        // The one-minute case keeps the editor open and issues no wake, flush or clock override.

        const sent = await published(probe, fixture.root);
        const localPhysicalSent = await physicalFiles(probe);
        expect(sent.captures).toHaveLength(before.captures.length + 1);
        expect(sent.logicalSha256).toBe(finalLocal.logicalSha256);
        const successors = sent.allOperations.filter(
          (operation) =>
            !before.allOperations.some((previous) => previous.operationId === operation.operationId)
        );
        const editedRootKey = JSON.stringify([
          sent.scope.spaceId,
          fixture.root.rootKind,
          fixture.root.rootId,
        ]);
        const createdRootKey = createdProjectId
          ? JSON.stringify([sent.scope.spaceId, 'video-project', createdProjectId])
          : null;
        expect(successors.filter((operation) => operation.rootKey === editedRootKey)).toHaveLength(
          1
        );
        const createdOperations = successors.filter(
          (operation) => createdRootKey !== null && operation.rootKey === createdRootKey
        );
        expect(createdOperations.length).toBeLessThanOrEqual(1);
        expect(
          successors.filter(
            (operation) =>
              operation.rootKey !== editedRootKey && operation.rootKey !== createdRootKey
          )
        ).toHaveLength(0);
        const outgoing = transferSummary(lab, putIndex, getIndex);
        const records = outgoing.puts.filter((row) => row.key.includes('/records/'));
        expect(records).toHaveLength(1 + createdOperations.length);
        expect(
          outgoing.puts.filter((row) =>
            before.objects.some(
              (object) => object.sha256 === row.sha256 && object.size === row.bytes
            )
          )
        ).toHaveLength(0);
        for (const row of outgoing.puts)
          expect(await lab.externalProof(row.key)).toEqual({ size: row.bytes, sha256: row.sha256 });
        receiver = await openProvider(lab, info, 'checkpoint-receiver', false, build, {
          harness: false,
          viewport: viewport.size,
        });
        for (const page of receiver.context.pages())
          page.on('pageerror', (error) => errors.push(error.message));
        receiver.context.on('page', (page) =>
          page.on('pageerror', (error) => errors.push(error.message))
        );
        const receivePuts = lab.proxy.counts.putBodies.length;
        const receiveGets = lab.proxy.counts.getBodies.length;
        await connection(receiver.page, { ...lab.credentials, rootUrl: workspaceUrl }, 'join');
        const receivedEditor = await receiverEditor(receiver, fixture, kind);
        await receivedEditor.setViewportSize(viewport.size);
        await verifyControls(receivedEditor, fixture, kind);
        const receiverProbe = await proofPage(receiver);
        const received = await native(receiverProbe, fixture.root);
        const receiverPhysicalFiles = await physicalFiles(receiverProbe);
        expect(received.logicalSha256).toBe(finalLocal.logicalSha256);
        await saveProof(info, {
          stage: 'independent-receiver-readback',
          before,
          finalLocal,
          sent,
          received,
          outgoing,
          localPhysicalBefore,
          localPhysicalDirty,
          localPhysicalSent,
          receiverPhysicalFiles,
          baselineTransfers,
        });
        expect(physicalOriginals(received.objects)).toEqual(physicalOriginals(before.objects));
        expect(received.physicalObjects).toBe(before.physicalObjects);
        expect(received.physicalBytes).toBe(before.physicalBytes);
        await receivedEditor.screenshot({
          path: info.outputPath(`${kind}-independent-restored-editor.png`),
          fullPage: false,
        });
        expect(errors).toEqual([]);
        let retirementProof = null;
        if (kind === 'image' && viewport.size.width === 1280) {
          const retained = await native(probe, fixture.root);
          const physicalRetained = await physicalFiles(probe);
          const originalKeys = new Set(
            retained.objects.map((object) => object.objectKey).filter((key) => key !== null)
          );
          const outputPins = retained.publishedObjects.filter(
            (object) => object.pinned && !originalKeys.has(object.objectKey)
          );
          const knownKeys = new Set([
            ...originalKeys,
            ...outputPins.map((object) => object.objectKey),
          ]);
          expect(physicalRetained.nativeFiles.map((file) => file.objectKey).sort()).toEqual(
            [...knownKeys].sort()
          );
          for (const output of outputPins)
            expect(physicalRetained.nativeFiles).toContainEqual({
              objectKey: output.objectKey,
              size: output.size,
              sha256: output.sha256,
            });
          const cleanupPuts = lab.proxy.counts.putBodies.length;
          const cleanupGets = lab.proxy.counts.getBodies.length;
          try {
            // Closing the media views releases browser-owned reader locks. No GC test API is called.
            await editor.close();
            await sender.page.close();
            await expect
              .poll(async () => (await physicalFiles(probe)).resourceReaders.length)
              .toBe(0);
            await flush(settings);
            await expect
              .poll(
                async () => {
                  const current = await native(probe, fixture.root);
                  const keys = new Set(outputPins.map((object) => object.objectKey));
                  return current.publishedObjects.filter(
                    (object) => object.pinned && keys.has(object.objectKey)
                  ).length;
                },
                { timeout: 30_000 }
              )
              .toBe(0);
            await expect
              .poll(async () => (await physicalFiles(probe)).nativeObjects.files, {
                timeout: 30_000,
              })
              .toBe(retained.physicalObjects);
            const after = await native(probe, fixture.root);
            const physicalAfter = await physicalFiles(probe);
            expect(after.captures).toEqual(retained.captures);
            expect(after.pending).toHaveLength(0);
            expect(physicalOriginals(after.objects)).toEqual(physicalOriginals(retained.objects));
            expect(physicalAfter.refs).toBe(physicalRetained.refs);
            expect(physicalAfter.owners).toBe(physicalRetained.owners);
            expect(lab.proxy.counts.putBodies.slice(cleanupPuts)).toHaveLength(0);
            const transfers = transferSummary(lab, cleanupPuts, cleanupGets);
            const expectedVerificationKeys = outputPins.map((output) => {
              const publication = lab.proxy.counts.putBodies
                .slice(0, cleanupPuts)
                .findLast(
                  (row) =>
                    row.key.includes('/Files/') &&
                    row.complete &&
                    row.bytes === output.size &&
                    row.sha256 === output.sha256
                );
              expect(publication).toBeDefined();
              if (!publication) throw new Error('Published output has no verified upload.');
              return publication.key;
            });
            expect(
              transfers.gets
                .filter((row) => row.key.includes('/Files/'))
                .map((row) => row.key)
                .sort()
            ).toEqual(expectedVerificationKeys.sort());
            expect(transfers.objectGetBytes).toBe(
              outputPins.reduce((total, output) => total + output.size, 0)
            );
            retirementProof = {
              outputPins,
              before: physicalRetained,
              after: physicalAfter,
              nativeAfter: after,
              transfers,
            };
          } catch (error) {
            await saveProof(info, {
              stage: 'published-output-retirement',
              retained,
              physicalRetained,
              outputPins,
              observed: await native(probe, fixture.root).catch(() => ({ available: false })),
              physicalObserved: await physicalFiles(probe),
              transfers: transferSummary(lab, cleanupPuts, cleanupGets),
            });
            throw error;
          }
        }
        expect(errors).toEqual([]);
        await saveProof(info, {
          kind,
          retirementProof,
          viewport: viewport.size,
          trigger,
          createdProject: createdProjectId
            ? { id: createdProjectId, initialOperations: createdOperations.length }
            : null,
          actualEditorChanges: durable,
          immutableDelta: 1,
          unrelatedImmutableRootsChanged: 0,
          before,
          finalLocal,
          sent,
          received,
          localPhysicalBefore,
          localPhysicalDirty,
          localPhysicalSent,
          receiverPhysicalFiles,
          baselineTransfers,
          outgoing,
          incoming: transferSummary(lab, receivePuts, receiveGets),
          generatedImageSha256: createHash('sha256').update(image).digest('hex'),
        });
      } finally {
        await receiver?.context.close();
        await sender.context.close();
      }
    });
  }

test('Scenario editing leaves historical HTML remote and one saved artifact hydrates exactly', async ({
  lab,
}, info) => {
  test.setTimeout(240_000);
  const viewport = PRIMARY_BROWSER_VIEWPORTS[0].size;
  const source = await openProvider(lab, info, 'scenario-html-source', false, build, { viewport });
  let target: Provider | null = null;
  try {
    const rootUrl = await connection(source.page, lab.credentials, 'create');
    await uploadInterval(source.page);
    const sourceProbe = await proofPage(source);
    const image = await png(sourceProbe);
    const fixture = await sourceProbe.evaluate(
      (bytes) => window.webdavTransferHarness.checkpoints.seedScenario(bytes, { savedHtml: true }),
      Array.from(image)
    );
    await flush(source.page);
    const sourceState = await published(sourceProbe, fixture.root);
    expect(fixture.artifacts).toHaveLength(2);
    const htmlKeys = new Set(
      lab.proxy.counts.putBodies
        .filter((body) =>
          fixture.artifacts.some((artifact) => body.key.endsWith('/' + artifact.filename))
        )
        .map((body) => body.key)
    );
    expect(htmlKeys.size).toBeGreaterThanOrEqual(2);
    target = await openProvider(lab, info, 'scenario-html-target', false, build, { viewport });
    const beforeJoinGets = lab.proxy.counts.getKeys.length;
    await connection(target.page, { ...lab.credentials, rootUrl }, 'join');
    expect(
      lab.proxy.counts.getKeys.slice(beforeJoinGets).filter((key) => htmlKeys.has(key))
    ).toEqual([]);
    const editor = await receiverEditor(
      target,
      { root: fixture.root, title: 'Checkpoint Scenario' },
      'scenario'
    );
    await expect(editor.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
      'Checkpoint Scenario'
    );
    await expect(editor.locator('article#checkpoint-step img').first()).toBeVisible();
    const targetProbe = await proofPage(target);
    const editing = await native(targetProbe, fixture.root);
    expect(editing.logicalSha256).toBe(sourceState.logicalSha256);
    expect(
      editing.objects
        .map((object) => ({ size: object.size, sha256: object.sha256 }))
        .sort((a, b) => a.sha256.localeCompare(b.sha256))
    ).toEqual(
      sourceState.objects
        .map((object) => ({ size: object.size, sha256: object.sha256 }))
        .sort((a, b) => a.sha256.localeCompare(b.sha256))
    );
    const beforeArtifacts = await targetProbe.evaluate(
      (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
      fixture.projectId
    );
    expect(beforeArtifacts).toHaveLength(2);
    expect(
      beforeArtifacts.every((artifact) => !artifact.resident && artifact.sha256 === null)
    ).toBe(true);
    expect(
      lab.proxy.counts.getKeys.slice(beforeJoinGets).filter((key) => htmlKeys.has(key))
    ).toEqual([]);
    await editor.screenshot({
      path: info.outputPath('scenario-editing-with-remote-html.png'),
      fullPage: false,
    });

    const selected = fixture.artifacts[0];
    const sibling = fixture.artifacts[1];
    if (!selected || !sibling) throw new Error('Historical artifact fixture missing');
    await target.page.goto(appUrl(target, 'gallery/index.html'));
    await target.page
      .locator(`[data-gallery-keyboard-id="scenario-export:${selected.exportId}"]`)
      .getByRole('button', { name: selected.filename, exact: true })
      .first()
      .click();
    const renamedStem = 'Renamed historical artifact';
    const renamed = `${renamedStem}.html`;
    await target.page.getByRole('textbox', { name: 'Filename', exact: true }).fill(renamedStem);
    const downloadReady = target.page.waitForEvent('download');
    const beforeArtifactGets = lab.proxy.counts.getKeys.length;
    await target.page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toBe(renamed);
    const path = await download.path();
    if (!path) throw new Error('Saved artifact download missing');
    const bytes = await readFile(path);
    expect(bytes.byteLength).toBe(selected.size);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(selected.sha256);
    const artifactGets = lab.proxy.counts.getKeys
      .slice(beforeArtifactGets)
      .filter((key) => htmlKeys.has(key));
    expect(artifactGets).toHaveLength(1);
    expect(artifactGets[0]?.endsWith('/' + selected.filename)).toBe(true);
    const afterArtifacts = await targetProbe.evaluate(
      (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
      fixture.projectId
    );
    expect(
      afterArtifacts.find((artifact) => artifact.exportId === selected.exportId)
    ).toMatchObject({ filename: renamed, resident: true, sha256: selected.sha256 });
    expect(afterArtifacts.find((artifact) => artifact.exportId === sibling.exportId)).toMatchObject(
      { resident: false, sha256: null }
    );
    await target.page.screenshot({
      path: info.outputPath('scenario-one-historical-artifact.png'),
      fullPage: false,
    });
    await target.page.keyboard.press('Escape');
    const beforeOutgoingGets = lab.proxy.counts.getKeys.length;
    await target.page.goto(appUrl(target, 'settings/index.html?section=saving&view=connection'));
    await flush(target.page);
    const renamedState = await published(targetProbe, fixture.root);
    expect(
      lab.proxy.counts.getKeys.slice(beforeOutgoingGets).filter((key) => htmlKeys.has(key))
    ).toEqual([]);
    expect(
      (
        await targetProbe.evaluate(
          (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
          fixture.projectId
        )
      ).find((artifact) => artifact.exportId === sibling.exportId)?.resident
    ).toBe(false);
    await editor.close();
    await target.context.close();
    const beforeRestartGets = lab.proxy.counts.getKeys.length;
    target = await openProvider(lab, info, 'scenario-html-target', false, build, { viewport });
    const restartedProbe = await proofPage(target);
    const afterRestart = await restartedProbe.evaluate(
      (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
      fixture.projectId
    );
    expect(afterRestart.find((artifact) => artifact.exportId === selected.exportId)).toMatchObject({
      filename: renamed,
      resident: true,
      sha256: selected.sha256,
    });
    expect(afterRestart.find((artifact) => artifact.exportId === sibling.exportId)).toMatchObject({
      resident: false,
      sha256: null,
    });
    expect(
      lab.proxy.counts.getKeys.slice(beforeRestartGets).filter((key) => htmlKeys.has(key))
    ).toEqual([]);
    await saveProof(info, {
      actualScenarioEditing: true,
      historicalArtifactCount: fixture.artifacts.length,
      editingHtmlGets: 0,
      selectedArtifactGets: artifactGets.length,
      historicalSha256: selected.sha256,
      historicalBytes: selected.size,
      renamedArtifactPreserved: true,
      siblingStayedRemote: true,
      outgoingHtmlGets: 0,
      restartDidNotHydrate: true,
      editingPhysicalObjects: editing.physicalObjects,
      editingPhysicalBytes: editing.physicalBytes,
      localPublicationOperations: renamedState.captures.length,
    });
  } finally {
    await source.context.close();
    await target?.context.close();
  }
});

async function backupProductJobs(page: Page) {
  const raw: unknown = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'SYNC_PRODUCT_COMMAND',
      requestId: crypto.randomUUID(),
      command: { kind: 'status' },
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    })
  );
  const response = parseSyncProductResponse(raw);
  if (!response?.success || response.result.kind !== 'status')
    throw new Error('Gallery backup status is unavailable.');
  return response.result.status.products;
}

async function inspectBackupFile(page: Page, filename: string) {
  return page.evaluate(
    (filename) => window.webdavTransferHarness.checkpoints.inspectBackup(filename),
    filename
  );
}

for (const scope of ['all', 'selected'] as const) {
  test(
    `Library ${scope} backup prepares one bounded action after confirmation ` +
      'and preserves exact deferred files',
    async ({ lab }, info) => {
      test.setTimeout(300_000);
      const viewport =
        scope === 'selected'
          ? PRIMARY_BROWSER_VIEWPORTS[0].size
          : PRIMARY_BROWSER_VIEWPORTS[1].size;
      const source = await openProvider(lab, info, `backup-${scope}-source`, false, build, {
        viewport,
      });
      let target: Provider | null = null;
      const editors: Page[] = [];
      try {
        const rootUrl = await connection(source.page, lab.credentials, 'create');
        await uploadInterval(source.page);
        const sourceProbe = await proofPage(source);
        const fixtures = [];
        for (const [index, name] of [
          'Backup selected A',
          'Backup selected B',
          'Backup unrelated Library',
        ].entries()) {
          const bytes = await sourceProbe.evaluate(async (index) => {
            const canvas = document.createElement('canvas');
            canvas.width = 24;
            canvas.height = 24;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Backup fixture canvas is unavailable.');
            ctx.fillStyle = ['#ab2438', '#23ad57', '#346bd1', '#cba331'][index] ?? '#222222';
            ctx.fillRect(0, 0, 24, 24);
            const blob = await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob(
                (value) =>
                  value ? resolve(value) : reject(new Error('Backup fixture PNG is unavailable.')),
                'image/png'
              )
            );
            return Array.from(new Uint8Array(await blob.arrayBuffer()));
          }, index);
          const value = await sourceProbe.evaluate(
            ({ bytes, name }) =>
              window.webdavTransferHarness.checkpoints.seedScenario(bytes, {
                name,
                savedHtml: true,
              }),
            { bytes, name }
          );
          fixtures.push({ ...value, title: name });
        }
        await flush(source.page);
        const fixtureStates = await Promise.all(
          fixtures.map((item) => published(sourceProbe, item.root))
        );
        const allDigests = new Set([
          ...fixtureStates.flatMap((state) => state.objects.map((item) => item.sha256)),
          ...fixtures.flatMap((item) => item.artifacts.map((artifact) => artifact.sha256)),
        ]);
        const protectedKeys = new Set(
          lab.proxy.counts.putBodies
            .filter((item) => item.complete && allDigests.has(item.sha256))
            .map((item) => item.key)
        );
        const chosen = fixtures.slice(0, 2);
        const unrelated = fixtures[2];
        const first = chosen[0];
        if (!unrelated || !first) throw new Error('Backup fixture root is missing.');
        target = await openProvider(lab, info, `backup-${scope}-target`, false, build, {
          viewport,
        });
        const beforeJoin = lab.proxy.counts.getKeys.length;
        await connection(target.page, { ...lab.credentials, rootUrl }, 'join');
        await uploadInterval(target.page);
        expect(
          lab.proxy.counts.getKeys.slice(beforeJoin).filter((key) => protectedKeys.has(key))
        ).toEqual([]);
        const targetProbe = await proofPage(target);
        const draftBytes = await targetProbe.evaluate(async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 24;
          canvas.height = 24;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Draft fixture canvas is unavailable.');
          context.fillStyle = '#cba331';
          context.fillRect(0, 0, 24, 24);
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) =>
                value ? resolve(value) : reject(new Error('Draft fixture PNG is unavailable.')),
              'image/png'
            )
          );
          return Array.from(new Uint8Array(await blob.arrayBuffer()));
        });
        const draft = await targetProbe.evaluate(
          (bytes) => window.webdavTransferHarness.checkpoints.seedTemporaryScreenshot(bytes),
          draftBytes
        );
        expect(draft.root.rootKind).toBe('media');
        expect(draft.lifecycle.storageClass).toBe('temporary');
        expect(draft.captureCount).toBe(0);
        expect(draft.pendingCount).toBe(0);
        expect(draft.original).toEqual({
          size: draftBytes.length,
          sha256: createHash('sha256').update(Uint8Array.from(draftBytes)).digest('hex'),
        });
        expect(
          new Set(fixtures.flatMap((item) => item.artifacts.map((artifact) => artifact.sha256)))
            .size
        ).toBe(6);

        for (const item of scope === 'selected' ? chosen : [first]) {
          const editor = await receiverEditor(
            target,
            { root: item.root, title: item.title },
            'scenario'
          );
          editors.push(editor);
          await expect(editor.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
            item.title
          );
        }
        const localEditor = editors[0];
        if (!localEditor) throw new Error('Local backup editor is missing.');
        const keptName = 'Locally preserved backup A';
        await localEditor.getByRole('textbox', { name: 'Scenario', exact: true }).fill(keptName);
        await localEditor.getByRole('textbox', { name: 'Scenario', exact: true }).press('Tab');
        await expect
          .poll(async () => JSON.stringify((await native(targetProbe, first.root)).logical), {
            timeout: 30_000,
          })
          .toContain(keptName);
        const localBefore = await native(targetProbe, first.root);
        for (const item of chosen) {
          if (scope === 'selected')
            expect(
              (
                await targetProbe.evaluate(
                  (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
                  item.projectId
                )
              ).every((artifact) => !artifact.resident)
            ).toBe(true);
        }
        await target.page.goto(appUrl(target, 'gallery/index.html'));
        await expect(target.page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
        if (scope === 'selected') {
          for (const item of chosen) {
            const card = target.page.locator(
              `[data-gallery-keyboard-id="scenario:${item.projectId}"]`
            );
            await expect(card).toBeVisible();
            await card.getByRole('button', { name: 'Select item', exact: true }).click();
          }
        }
        const filename = `backup-${scope}-proof.zip`;
        await target.page.evaluate((filename) => {
          document.documentElement.dataset['backupPickerCalls'] = '0';
          Object.defineProperty(window, 'showSaveFilePicker', {
            configurable: true,
            value: async () => {
              document.documentElement.dataset['backupPickerCalls'] = String(
                Number(document.documentElement.dataset['backupPickerCalls'] ?? '0') + 1
              );
              return (await navigator.storage.getDirectory()).getFileHandle(filename, {
                create: true,
              });
            },
          });
        }, filename);
        const beforeJobs = await backupProductJobs(target.page);
        const baselineIds = new Set(beforeJobs.map((job) => job.requestId));
        const beforeConfirm = lab.proxy.counts.getKeys.length;
        const openDialog = async () => {
          if (!target) throw new Error('Backup target is unavailable.');
          await target.page.locator('[data-ui="gallery.header.storage"] > button').click();
          await target.page.getByRole('menuitem', { name: 'Create backup', exact: true }).click();
          const dialog = target.page.getByRole('dialog').filter({
            has: target.page.getByRole('button', {
              name: 'Download and create backup',
              exact: true,
            }),
          });
          await expect(dialog).toBeVisible();
          return dialog;
        };
        let dialog = await openDialog();
        const includeDrafts = dialog.getByRole('checkbox', {
          name: label('gallery.backupExportModal.includeDrafts'),
          exact: false,
        });
        await includeDrafts.check();
        await includeDrafts.uncheck();
        await dialog
          .getByRole('checkbox', {
            name: label('gallery.backupExportModal.includeWebSnapshots'),
            exact: false,
          })
          .uncheck();
        expect(
          lab.proxy.counts.getKeys.slice(beforeConfirm).filter((key) => protectedKeys.has(key))
        ).toEqual([]);
        expect(
          (await backupProductJobs(target.page)).filter(
            (job) => !baselineIds.has(job.requestId) && job.kind === 'library-backup-prepare'
          )
        ).toEqual([]);
        await target.page.screenshot({
          path: info.outputPath(`backup-${scope}-confirmation-no-download.png`),
          fullPage: false,
        });
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(await target.page.locator('html').getAttribute('data-backup-picker-calls')).toBe(
          '0'
        );
        expect(
          lab.proxy.counts.getKeys.slice(beforeConfirm).filter((key) => protectedKeys.has(key))
        ).toEqual([]);
        dialog = await openDialog();
        await dialog
          .getByRole('checkbox', {
            name: label('gallery.backupExportModal.includeDrafts'),
            exact: false,
          })
          .uncheck();
        await dialog
          .getByRole('checkbox', {
            name: label('gallery.backupExportModal.includeWebSnapshots'),
            exact: false,
          })
          .uncheck();
        let cancelledJobs = 0;
        if (scope === 'selected') {
          const ordered = [...chosen].sort((a, b) => a.projectId.localeCompare(b.projectId));
          const completed = ordered[0];
          const held = ordered[1];
          const heldArtifact = held?.artifacts[0];
          if (!completed || !held || !heldArtifact)
            throw new Error('Cancellation backup fixture is missing.');
          const targetArtifact = (
            await targetProbe.evaluate(
              (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
              held.projectId
            )
          ).find((artifact) => artifact.exportId === heldArtifact.exportId);
          if (!targetArtifact || targetArtifact.resident)
            throw new Error('Target historical backup body is not deferred.');
          const heldKey = await targetProbe.evaluate(
            async (input) => {
              const record = (value: unknown): value is Record<string, unknown> =>
                typeof value === 'object' && value !== null && !Array.isArray(value);
              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('sniptale-db');
                request.onupgradeneeded = () => {
                  request.transaction?.abort();
                  reject(new Error('Existing backup database is unavailable.'));
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              try {
                const copy: unknown = await new Promise((resolve, reject) => {
                  const request = db
                    .transaction('asset_residency', 'readonly')
                    .objectStore('asset_residency')
                    .get(JSON.stringify(['copy', 'opfs', input.assetId]));
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });
                const target = record(copy) ? copy['target'] : null;
                const remote = record(copy) ? copy['remote'] : null;
                const ref = record(target) ? target['ref'] : null;
                if (
                  !record(copy) ||
                  copy['phase'] !== 'unloaded' ||
                  !record(target) ||
                  target['kind'] !== 'opfs' ||
                  !record(ref) ||
                  ref['assetId'] !== input.assetId ||
                  ref['size'] !== input.size ||
                  !record(remote) ||
                  remote['sha256'] !== input.sha256 ||
                  typeof remote['key'] !== 'string'
                )
                  throw new Error('Exact deferred backup copy is unavailable.');
                return remote['key'];
              } finally {
                db.close();
              }
            },
            {
              assetId: targetArtifact.assetId,
              size: targetArtifact.size,
              sha256: heldArtifact.sha256,
            }
          );
          const workspacePrefix = new URL(rootUrl).pathname.slice(
            new URL(lab.credentials.rootUrl).pathname.length
          );
          const heldProxyKey = workspacePrefix + heldKey;
          expect(protectedKeys.has(heldProxyKey)).toBe(true);
          lab.proxy.armFault({ method: 'GET', key: heldProxyKey, kind: 'hold-response-body' });
          await dialog
            .getByRole('button', { name: 'Download and create backup', exact: true })
            .click();
          await test.step(
            'Observe the held second-root artifact GET after the first root settles',
            async () => {
              await lab.proxy.waitForFault();
            },
            { timeout: 60_000 }
          );
          await expect
            .poll(
              async () =>
                await targetProbe.evaluate(
                  (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
                  completed.projectId
                )
            )
            .toEqual(
              expect.arrayContaining(
                completed.artifacts.map((artifact) =>
                  expect.objectContaining({
                    exportId: artifact.exportId,
                    resident: true,
                    sha256: artifact.sha256,
                  })
                )
              )
            );
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          await expect(dialog).toHaveCount(0);
          await expect
            .poll(
              async () =>
                (await backupProductJobs(target!.page))
                  .filter(
                    (job) =>
                      !baselineIds.has(job.requestId) && job.kind === 'library-backup-prepare'
                  )
                  .map((job) => job.state),
              { timeout: 30_000 }
            )
            .toEqual(['interrupted']);
          lab.proxy.releaseFault();
          const retained = await targetProbe.evaluate(
            (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
            completed.projectId
          );
          expect(
            retained.every(
              (artifact) =>
                artifact.resident &&
                completed.artifacts.some(
                  (original) =>
                    original.exportId === artifact.exportId && original.sha256 === artifact.sha256
                )
            )
          ).toBe(true);
          expect(
            (
              await targetProbe.evaluate(
                (id) => window.webdavTransferHarness.checkpoints.artifacts(id),
                held.projectId
              )
            ).find((artifact) => artifact.exportId === heldArtifact.exportId)?.resident
          ).toBe(false);
          expect(await target.page.locator('html').getAttribute('data-backup-picker-calls')).toBe(
            '0'
          );
          expect((await native(targetProbe, first.root)).logicalSha256).toBe(
            localBefore.logicalSha256
          );
          cancelledJobs = 1;
          dialog = await openDialog();
          await dialog
            .getByRole('checkbox', {
              name: label('gallery.backupExportModal.includeDrafts'),
              exact: false,
            })
            .uncheck();
          await dialog
            .getByRole('checkbox', {
              name: label('gallery.backupExportModal.includeWebSnapshots'),
              exact: false,
            })
            .uncheck();
        }
        await dialog
          .getByRole('button', { name: 'Download and create backup', exact: true })
          .click();
        try {
          await expect(dialog).toHaveCount(0, { timeout: 90_000 });
        } catch (error) {
          await target.page.screenshot({
            path: info.outputPath('backup-failed.png'),
            fullPage: false,
          });
          const safeErrorKeys = [
            'gallery.app.backupSyncNotReady',
            'gallery.app.backupMetadataLimit',
            'gallery.app.backupWriteFailed',
            'gallery.app.backupInvalidMetadata',
            'gallery.app.actionFailed',
          ] as const;
          const exportErrors = [];
          for (const key of safeErrorKeys) {
            const text = label(key);
            if (await target.page.getByText(text, { exact: true }).first().isVisible())
              exportErrors.push({ key, text });
          }
          const currentNative = await native(targetProbe, first.root).then(
            (value) => ({
              available: true,
              root: value.root,
              revision: value.revision,
              logicalSha256: value.logicalSha256,
              captures: value.captures,
              pending: value.pending,
              queue: value.queue,
            }),
            () => ({ available: false })
          );
          const productJobs = await backupProductJobs(target.page).then(
            (jobs) => jobs.filter((job) => !baselineIds.has(job.requestId)),
            () => null
          );
          const picker = await target.page.evaluate(async (filename) => {
            const calls = Number(document.documentElement.dataset['backupPickerCalls'] ?? '0');
            try {
              const handle = await (await navigator.storage.getDirectory()).getFileHandle(filename);
              const file = await handle.getFile();
              return { calls, filePresent: true, size: file.size };
            } catch {
              return { calls, filePresent: false, size: null };
            }
          }, filename);
          await saveProof(info, {
            phase: 'backup-final-confirmation',
            scope,
            productJobs,
            currentNative,
            exportErrors,
            picker,
            transfers: transferSummary(lab, 0, beforeConfirm),
          });
          throw error;
        }
        await expect
          .poll(
            async () => await target!.page.locator('html').getAttribute('data-backup-picker-calls')
          )
          .toBe('1');
        const jobs = (await backupProductJobs(target.page)).filter(
          (job) => !baselineIds.has(job.requestId)
        );
        expect(
          jobs.filter((job) => job.kind === 'library-backup-prepare' && job.state === 'ready')
        ).toHaveLength(1);
        expect(jobs.filter((job) => job.kind === 'library-backup-prepare')).toHaveLength(
          1 + cancelledJobs
        );
        expect(
          jobs.filter(
            (job) =>
              job.kind === 'backup-prepare' ||
              job.kind === 'replica-prepare' ||
              job.kind === 'native-prepare'
          )
        ).toEqual([]);
        const archive = await inspectBackupFile(targetProbe, filename);
        const admitted = scope === 'selected' ? chosen : fixtures.slice(0, 3);
        expect([...archive.rootIds].sort()).toEqual(admitted.map((item) => item.projectId).sort());
        for (const item of admitted) {
          for (const artifact of item.artifacts)
            expect(archive.files).toContainEqual({ size: artifact.size, sha256: artifact.sha256 });
          for (const original of fixtureStates[fixtures.indexOf(item)]!.objects)
            expect(archive.files).toContainEqual({ size: original.size, sha256: original.sha256 });
        }
        const excluded = scope === 'selected' ? [unrelated] : [];
        expect(archive.roots).not.toContainEqual(draft.root);
        expect(archive.files).not.toContainEqual(draft.original);
        const excludedDigests = new Set([
          draft.original.sha256,
          ...excluded.flatMap((item) => [
            ...item.artifacts.map((artifact) => artifact.sha256),
            ...fixtureStates[fixtures.indexOf(item)]!.objects.map((object) => object.sha256),
          ]),
        ]);
        expect(
          lab.proxy.counts.putBodies.some((item) => item.sha256 === draft.original.sha256)
        ).toBe(false);
        const excludedKeys = new Set(
          lab.proxy.counts.putBodies
            .filter((item) => excludedDigests.has(item.sha256))
            .map((item) => item.key)
        );
        expect(archive.files.some((item) => excludedDigests.has(item.sha256))).toBe(false);
        expect(
          lab.proxy.counts.getKeys.slice(beforeConfirm).filter((key) => excludedKeys.has(key))
        ).toEqual([]);
        for (const item of excluded) {
          expect(archive.rootIds).not.toContain(item.projectId);
          for (const artifact of item.artifacts)
            expect(archive.files).not.toContainEqual({
              size: artifact.size,
              sha256: artifact.sha256,
            });
        }
        expect(archive.scenarios.find((item) => item.id === first.projectId)?.name).toBe(keptName);
        expect((await native(targetProbe, first.root)).logicalSha256).toBe(
          localBefore.logicalSha256
        );
        await target.page.screenshot({
          path: info.outputPath(`backup-${scope}-completed.png`),
          fullPage: false,
        });
        await saveProof(info, {
          scope,
          admittedScenarioRoots: admitted.length,
          excludedScenarioRoots: excluded.length,
          excludedTemporaryMediaRoots: 1,
          temporaryScreenshot: { root: draft.root, original: draft.original },
          actualLibraryActions: jobs.filter((job) => job.kind === 'library-backup-prepare').length,
          cancelledJobs,
          preConfirmationOriginalGets: 0,
          excludedOriginalGets: 0,
          historicalBodies: admitted
            .flatMap((item) => item.artifacts)
            .map((artifact) => ({ size: artifact.size, sha256: artifact.sha256 })),
          localEditPreserved: true,
          archiveRoots: archive.roots,
        });
      } finally {
        lab.proxy.releaseFault();
        for (const editor of editors) await editor.close().catch(() => undefined);
        await source.context.close();
        await target?.context.close();
      }
    }
  );
}
