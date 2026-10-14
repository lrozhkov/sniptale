import { expect, type Page, type TestInfo } from '@playwright/test';
import { parseCameraFollowSettings } from '../../../../apps/extension/src/features/video/project/camera/cursor-policy';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { addReviewFocus } from './quick-editor-media-fixture';
import { readNativeReviewWorkspace } from './native-review-workspace';
import type { applyHarnessBootstrap } from '../extension-critical.helpers';

export async function applyCameraPolicyBootstrap(
  page: Page,
  bootstrap: Parameters<typeof applyHarnessBootstrap>[1]
) {
  await page.addInitScript((value) => {
    const query = new URL(location.href).searchParams;
    window.__sniptaleHarnessBootstrap = {
      ...value,
      storage: {
        ...value.storage,
        'sniptale-locale-preference': query.get('locale') === 'ru' ? 'ru' : 'en',
        'sniptale-theme-preference': query.get('theme') === 'dark' ? 'dark' : 'light',
      },
    };
  }, bootstrap);
  await page.addInitScript(() =>
    localStorage.setItem(
      'sniptale-locale-preference',
      new URL(location.href).searchParams.get('locale') === 'ru' ? 'ru' : 'en'
    )
  );
}

export async function openGalleryCursorScene(page: Page, locale: 'ru' | 'en' = 'en') {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  const dialog = page.locator('dialog');
  const advanced = dialog.getByRole('button', {
    name: label('gallery.videoReview.advancedEditing'),
    exact: true,
  });
  await expect(advanced).toBeVisible();
  if ((await advanced.getAttribute('aria-pressed')) !== 'true') await advanced.click();
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
    .click();
  return dialog;
}

export async function readReviewContent(page: Page, recordingId: string) {
  const workspace = await readNativeReviewWorkspace(page, `recording:${recordingId}`);
  return workspace
    ? replayReviewHistory(
        workspace.history,
        workspace.cursor,
        workspace.source,
        workspace.baseline ?? reviewAdvancedContentBaseline(workspace.advanced)
      ).advancedContent
    : undefined;
}

async function readProjectPolicy(page: Page, id: string) {
  const raw = await page.evaluate(
    async ({ databaseName, id }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const transaction = db.transaction('video_projects', 'readonly');
          const request = transaction.objectStore('video_projects').get(id);
          request.onsuccess = () => resolve(request.result?.project?.cameraFollowDefaults);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    { databaseName: betaV1Fixture.databaseName, id }
  );
  return parseCameraFollowSettings(raw);
}

export async function verifyGalleryCameraPolicy(page: Page, info: TestInfo, recordingId: string) {
  for (const variant of [
    { locale: 'en' as const, theme: 'light' },
    { locale: 'ru' as const, theme: 'dark' },
  ]) {
    const url = new URL(page.url());
    url.searchParams.set('locale', variant.locale);
    url.searchParams.set('theme', variant.theme);
    await page.goto(url.href);
    const policyDialog = await openGalleryCursorScene(page, variant.locale);
    const policyLabel = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const policy = policyDialog.locator(
      '[data-ui="cursorFocusPath.settings"] [data-ui="cameraFollow.settings"]'
    );
    const zone = policy.getByRole('textbox', {
      name: policyLabel('videoEditor.sidebar.cameraZoneSize'),
      exact: true,
    });
    await zone.fill('80');
    await zone.press('Enter');
    await policy
      .getByRole('button', {
        name: policyLabel('videoEditor.sidebar.cameraMovement'),
        exact: true,
      })
      .click();
    await page
      .getByRole('option', { name: policyLabel('videoEditor.sidebar.cameraCalm'), exact: true })
      .click();
    await expect
      .poll(async () => (await readReviewContent(page, recordingId))?.cameraFollowDefaults)
      .toMatchObject({ zoneSize: 0.8, transitionDuration: 0.65 });
    await policy.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`gallery-camera-defaults-${variant.locale}-${variant.theme}.png`),
      fullPage: false,
    });
    if ((await readReviewContent(page, recordingId))?.zoom.regions.length)
      await policyDialog
        .getByRole('button', {
          name: new RegExp('^' + policyLabel('gallery.videoReview.zoomRegionLabel') + ' '),
        })
        .last()
        .click();
    else await addReviewFocus(page);
    const local = policyDialog.locator(
      '[data-ui="gallery.videoReview.zoomInspector"] [data-ui="cameraFollow.settings"]'
    );
    await expect(local).toBeVisible();
    const localZone = local.getByRole('textbox', {
      name: policyLabel('videoEditor.sidebar.cameraZoneSize'),
      exact: true,
    });
    await localZone.fill('25');
    await localZone.press('Enter');
    await expect
      .poll(
        async () =>
          (await readReviewContent(page, recordingId))?.zoom.regions.at(-1)?.cameraFollow?.zoneSize
      )
      .toBe(0.25);
    await local
      .getByRole('button', {
        name: policyLabel('videoEditor.sidebar.cameraResetPolicy'),
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () => (await readReviewContent(page, recordingId))?.zoom.regions.at(-1)?.cameraFollow
      )
      .toBeUndefined();
    await expect(localZone).toHaveValue('80');
    await local.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`gallery-camera-inheritance-${variant.locale}-${variant.theme}.png`),
      fullPage: false,
    });
  }
}

export async function verifyMontageCameraPolicy(page: Page, info: TestInfo, projectId: string) {
  for (const variant of [
    { locale: 'en' as const, theme: 'light' },
    { locale: 'ru' as const, theme: 'dark' },
  ]) {
    const url = new URL(page.url());
    url.searchParams.set('locale', variant.locale);
    url.searchParams.set('theme', variant.theme);
    await page.goto(url.href);
    const policyLabel = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    await page.locator('[data-ui="video-editor.viewer.scene"]').click();
    await page
      .locator('nav')
      .getByRole('button', {
        name: policyLabel('videoEditor.sidebar.cursorFocusPathTitle'),
        exact: true,
      })
      .click();
    const policy = page.locator(
      '[data-ui="cursorFocusPath.settings"] [data-ui="cameraFollow.settings"]'
    );
    const zone = policy.getByRole('textbox', {
      name: policyLabel('videoEditor.sidebar.cameraZoneSize'),
      exact: true,
    });
    await zone.fill('80');
    await zone.press('Enter');
    await policy
      .getByRole('button', {
        name: policyLabel('videoEditor.sidebar.cameraMovement'),
        exact: true,
      })
      .click();
    await page
      .getByRole('option', { name: policyLabel('videoEditor.sidebar.cameraCalm'), exact: true })
      .click();
    await expect
      .poll(() => readProjectPolicy(page, projectId))
      .toMatchObject({ zoneSize: 0.8, transitionDuration: 0.65 });
    await policy.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`standalone-camera-defaults-${variant.locale}-${variant.theme}.png`),
      fullPage: false,
    });
    await page.reload();
    expect(await readProjectPolicy(page, projectId)).toMatchObject({
      zoneSize: 0.8,
      transitionDuration: 0.65,
    });
  }
}
