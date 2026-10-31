import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { chooseInspectorValue, checkInspectorLabels } from '../support/inspector-utilities';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

async function addAnnotation(
  page: Page,
  dialog: Locator,
  label: (key: Parameters<typeof translate>[0]) => string,
  title: string
) {
  await dialog
    .locator('[data-review-header-track="annotationEffects"] [data-review-track-select]')
    .click();
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.annotationEffectsAdd'), exact: true })
    .click();
  await dialog
    .getByRole('button', {
      name: label('gallery.videoReview.annotationEffectsChoose'),
      exact: true,
    })
    .click();
  await page.getByRole('option', { name: title, exact: true }).click();
  const lane = dialog.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
  await lane.scrollIntoViewIfNeeded();
  const box = await lane.boundingBox();
  if (!box) throw new Error('Missing annotation lane');
  await page.mouse.move(box.x + box.width / 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.pointerTool'), exact: true })
    .click();
  await dialog.locator('[data-annotation-effect-id]').last().click();
}

async function checkGalleryParameters(
  page: Page,
  dialog: Locator,
  locale: 'ru' | 'en',
  info: TestInfo
) {
  const entryLabel = locale === 'ru' ? 'Длительность входа' : 'Entrance duration';
  const traceLabel = locale === 'ru' ? 'Прорисовка линии' : 'Line tracing';
  const orderLabel = locale === 'ru' ? 'Порядок появления' : 'Entrance order';
  const entry = dialog.getByRole('textbox', { name: entryLabel, exact: true });
  await expect(entry).toHaveValue('24');
  await expect(dialog.locator('[data-effect-control-id="entry"]')).toContainText('%');
  await entry.fill('30');
  await entry.press('Enter');
  await expect(entry).toHaveValue('30');
  const tracing = dialog
    .locator('summary')
    .filter({ has: page.getByRole('heading', { name: traceLabel, exact: true }) });
  await tracing.focus();
  await tracing.press('Enter');
  await expect(dialog.locator('[data-effect-control-id="traceShare"]')).toBeHidden();
  await tracing.press('Enter');
  await chooseInspectorValue(
    page,
    dialog,
    orderLabel,
    locale === 'ru' ? 'Одновременно' : 'Together'
  );
  await checkInspectorLabels(dialog);
  const position = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
  await position.focus();
  await position.press('Home');
  for (let frame = 0; frame < 20; frame++) await position.press('ArrowRight');
  await expect
    .poll(async () => Number(await position.getAttribute('aria-valuenow')))
    .toBeCloseTo(2, 5);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath('gallery-annotation-animation.png'),
    fullPage: false,
  });
}

async function checkNativeParameters(
  page: Page,
  origin: string,
  locale: 'ru' | 'en',
  info: TestInfo
) {
  const animation = translate('videoEditor.effectsLibrary.effectAnimation', locale);
  const entryLabel = locale === 'ru' ? 'Длительность входа' : 'Entrance duration';
  const project = await readNativeVideoProject(page);
  const clip = project?.clips.find((item) => item.type === 'EFFECT');
  if (!project || clip?.type !== 'EFFECT') throw new Error('Missing transferred effect');
  const snapshot = project.effectSnapshots?.[0];
  const document = parseEffectV1Source(snapshot?.source ?? '').document;
  expect(document?.controlGroups?.[0]?.id).toBe('tracing');
  expect(document?.controls.find((control) => control.id === 'entry')?.unit).toBe('percent');
  expect(project.effectInstances?.[0]?.controls['entry']).toBe(30);
  await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
  if (!(await page.getByRole('textbox', { name: entryLabel, exact: true }).isVisible()))
    await page.getByRole('button', { name: animation, exact: true }).click();
  const nativeEntry = page.getByRole('textbox', { name: entryLabel, exact: true });
  await expect(nativeEntry).toHaveValue('30');
  await nativeEntry.fill('35');
  await nativeEntry.press('Enter');
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.effectInstances?.[0]?.controls['entry'])
    .toBe(35);
  const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
  await playhead.press('Home');
  for (let frame = 0; frame < 60; frame++) await playhead.press('ArrowRight');
  await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.effectInstances?.[0]?.controls['entry'])
    .toBe(30);
  await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.effectInstances?.[0]?.controls['entry'])
    .toBe(35);
  await page.screenshot({
    path: info.outputPath('native-annotation-animation.png'),
    fullPage: false,
  });
  await page.goto(
    `${origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${encodeURIComponent(project.id)}`
  );
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
  if (!(await page.getByRole('textbox', { name: entryLabel, exact: true }).isVisible()))
    await page.getByRole('button', { name: animation, exact: true }).click();
  await expect(page.getByRole('textbox', { name: entryLabel, exact: true })).toHaveValue('35');
  expect((await readNativeVideoProject(page))?.effectSnapshots?.[0]?.source).toBe(snapshot?.source);
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`annotation metadata stays usable in Gallery and Native ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'ru' : 'en';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await addAnnotation(
        page,
        dialog,
        label,
        locale === 'ru' ? 'Пояснение с указателем' : 'Pointer callout'
      );
      await checkGalleryParameters(page, dialog, locale, info);
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const tab = (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []))[0];
      if (!tab?.url) throw new Error('Missing editor tab');
      const nativeUrl = `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?${new URL(tab.url).searchParams}`;
      await page.goto(nativeUrl);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await checkNativeParameters(page, host.origin, locale, info);
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
