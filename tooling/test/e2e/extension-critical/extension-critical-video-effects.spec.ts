import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { readNativeVideoProject } from '../support/native-video-project';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { checkInspectorLabels } from '../support/inspector-utilities';
import { test } from '../support/extension-fixture';
import {
  countPersistedEffectInstances,
  countResponsiveAnimationFrames,
  createTransitionE2eProject,
  LOTTIE_ANNOTATION_FIXTURE,
  importAndApplyEffect,
  applyBuiltinSourceFilter,
  chooseGlTransition,
  readAnimationFixtureSource,
  importEffectFile,
  importVideoInput,
  openEffectVideoEditorHarness,
  readPreviewCanvasSignature,
} from './extension-critical-video-effects.helpers';
import { VIDEO_EDITOR_PAUSE_LABEL, VIDEO_EDITOR_PLAY_LABEL } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

const VIDEO_EDITOR_PREVIEW_CACHE_LABEL = translate('videoEditor.stage.previewModeCache', 'ru');
const VIDEO_EDITOR_PREVIEW_CACHE_READY_LABEL = translate(
  'videoEditor.stage.previewCacheReady',
  'ru'
);

test('Lottie catalog enable toggle stays live in Chromium IndexedDB', async ({
  page,
  extensionId,
}) => {
  const hostOrigin = `chrome-extension://${extensionId}`;
  await page.goto(`${hostOrigin}/apps/extension/src/video-editor/index.html`);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page
    .getByRole('button', { name: translate('videoEditor.app.newProjectAction', 'en'), exact: true })
    .click();
  await importEffectFile(page, {
    documentId: 'e2e-title',
    fixturePath: LOTTIE_ANNOTATION_FIXTURE,
    locale: 'en',
  });

  const settings = await page.context().newPage();
  try {
    await settings.goto(
      `${hostOrigin}/apps/extension/src/settings/index.html?section=video-effects`
    );
    const row = settings
      .locator('[data-settings-collection-item]')
      .filter({ hasText: 'E2E e2e-title' });
    const toggle = row.getByRole('switch');
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.bringToFront();
    // Headless Chromium keeps both pages focused; deliver the real return-to-editor event.
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
    await expect(page.locator('[data-effect-document="e2e-title"]')).toHaveCount(0);
    await settings.bringToFront();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.bringToFront();
    // Headless Chromium keeps both pages focused; deliver the real return-to-editor event.
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
    await expect(page.locator('[data-effect-document="e2e-title"]')).toBeVisible();
  } finally {
    await settings.close();
  }
  expect(pageErrors).toEqual([]);
});

test('Lottie playback keeps the video editor responsive', async ({ page, hostOrigin }, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openEffectVideoEditorHarness(page, hostOrigin);
  await importAndApplyEffect(page, {
    documentId: 'e2e-title',
    fixturePath: LOTTIE_ANNOTATION_FIXTURE,
  });
  await verifyEffectInspector(page, info, 'annotation');
  await expect(page.locator('[data-playback-counter="true"]')).toContainText('0:03.0');

  const playButton = page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true });
  await expect(playButton).toBeEnabled();
  await playButton.click();

  await expect(page.locator('iframe[src*="effect-runtime-sandbox"]')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true })
  ).toBeVisible();
  expect(await countResponsiveAnimationFrames(page, 1_500)).toBeGreaterThan(1);

  await page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true }).click();
  expect(pageErrors.filter((message) => /EffectV1|effect runtime/iu.test(message))).toEqual([]);
});

test('cached Lottie preview prepares beyond the first frame and starts playback', async ({
  page,
  hostOrigin,
}) => {
  await openEffectVideoEditorHarness(page, hostOrigin);
  await importVideoInput(page);
  await importAndApplyEffect(page, {
    documentId: 'e2e-title',
    fixturePath: LOTTIE_ANNOTATION_FIXTURE,
  });
  await page.locator('[data-ui="video.preview.display-settings"]').click();
  await page.getByRole('radio', { name: '720p', exact: true }).check();
  await page.getByRole('radio', { name: VIDEO_EDITOR_PREVIEW_CACHE_LABEL, exact: true }).check();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();

  await expect(
    page.getByRole('status', { name: VIDEO_EDITOR_PREVIEW_CACHE_READY_LABEL, exact: true })
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true })
  ).toBeVisible();
});

test('source-filter playback keeps video input rendering responsive', async ({
  page,
  hostOrigin,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`${message.location().url}: ${message.text()}`);
    }
  });

  await page.setViewportSize({ height: 2160, width: 3840 });
  await openEffectVideoEditorHarness(page, hostOrigin);
  await importVideoInput(page);
  const visualInputSignature = await readPreviewCanvasSignature(page);
  const sandboxCount = await page.locator('iframe[src*="effect-runtime-sandbox"]').count();
  await applyBuiltinSourceFilter(page);
  await expect
    .poll(
      async () =>
        (await readNativeVideoProject(page))?.clips.flatMap((clip) =>
          clip.type === 'VIDEO' ? (clip.sourceFilters?.filters ?? []) : []
        ).length
    )
    .toBe(1);
  await expect.poll(() => countPersistedEffectInstances(page)).toBe(0);
  await expect
    .poll(() => readPreviewCanvasSignature(page), {
      message: `Source-filter preview did not change. Console errors: ${consoleErrors.join(' | ')}`,
    })
    .not.toBe(visualInputSignature);
  await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();
  await expect(page.locator('iframe[src*="effect-runtime-sandbox"]')).toHaveCount(sandboxCount);
  expect(await countResponsiveAnimationFrames(page, 2_000)).toBeGreaterThan(1);

  await page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true }).click();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors.filter((message) => /EffectV1|effect runtime/iu.test(message))).toEqual([]);
});

test('GL transition playback keeps the junction responsive', async ({ page, hostOrigin }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const project = createTransitionE2eProject();
  await page.setViewportSize({ height: 2160, width: 3840 });
  await openEffectVideoEditorHarness(page, hostOrigin, project);
  const sandboxCount = await page.locator('iframe[src*="effect-runtime-sandbox"]').count();
  const initial = (await readNativeVideoProject(page))?.transitions?.[0];
  if (!initial) throw new Error('Expected a canonical visual join');
  await chooseGlTransition(page);
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.transitions?.[0])
    .toMatchObject({ ...initial, kind: 'gl', selection: { name: 'CrossZoom' } });
  await expect.poll(() => countPersistedEffectInstances(page)).toBe(0);

  await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();
  await expect(page.locator('iframe[src*="effect-runtime-sandbox"]')).toHaveCount(sandboxCount);
  expect(await countResponsiveAnimationFrames(page, 1_500)).toBeGreaterThan(1);

  const pauseButton = page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true });
  if (await pauseButton.isVisible()) {
    await pauseButton.click();
  } else {
    await expect(
      page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true })
    ).toBeVisible();
  }
  expect(consoleErrors).toEqual([]);
});

async function verifyEffectInspector(page: Page, info: TestInfo, kind: string) {
  const panel = page.locator('[data-ui="video-editor.inspector.content"]');
  await expect(panel).toBeVisible();
  if (!(await panel.locator('[data-presentation="all"]').isVisible())) {
    await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
  }
  await expect(panel.locator('[data-effect-instance]').first()).toBeVisible();
  for (const width of [280, 420]) {
    await page
      .locator('[data-ui="video-editor.floating.context-inspector"]')
      .evaluate((node, value) => {
        if (node instanceof HTMLElement) node.style.width = `${value}px`;
      }, width);
    await checkInspectorLabels(panel);
    await expect
      .poll(() => panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
      .toBe(true);
    await page.screenshot({ path: info.outputPath(`${kind}-inspector-${width}.png`) });
    await panel.locator('[data-effect-instance]').first().scrollIntoViewIfNeeded();
    await panel.screenshot({ path: info.outputPath(`${kind}-parameters-${width}.png`) });
  }
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`applied Lottie survives catalog replacement ${viewport.name}`, async ({
    page,
    extensionId,
  }, info) => {
    test.setTimeout(90000);
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ ...viewport.size });
    const origin = `chrome-extension://${extensionId}`;
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const settings = await page.context().newPage();
    await settings.setViewportSize({ ...viewport.size });
    await page.bringToFront();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/apps/extension/src/video-editor/index.html`);
      await page
        .getByRole('button', {
          name: label('videoEditor.app.newProjectAction'),
          exact: true,
        })
        .click();
      await openNativeCatalog(page);
      await importEffectFile(page, {
        documentId: 'e2e-title',
        fixturePath: LOTTIE_ANNOTATION_FIXTURE,
        locale: 'en',
      });
      const document = page.locator('[data-effect-document="e2e-title"]');
      const apply = document.getByRole('button', {
        name: label('videoEditor.effectsLibrary.applyToScene'),
        exact: true,
      });
      await document.hover();
      await apply.click();
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      await expect
        .poll(async () => (await readCurrentCatalogProject(page))?.effectInstances?.length)
        .toBe(1);
      const before = (await readCurrentCatalogProject(page))!;
      const oldInstance = before.effectInstances![0]!;
      expect(oldInstance.controls['accent']).toBe('#5f7cff');
      const host = before.clips.find(
        (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === oldInstance.id
      )!;
      expect(host.transform.rotation).toBe(0);
      expect(host.transform.opacity).toBe(1);
      expect(host.transform.height).toBeGreaterThan(320);
      // Sample the opaque panel interior, away from text and animated foreground.
      const pixel = () =>
        page.locator('[data-preview-stage-canvas]').evaluate(
          (node: HTMLCanvasElement, point) => {
            const scale = Math.min(node.width / point.width, node.height / point.height);
            const x = (node.width - point.width * scale) / 2 + point.x * scale;
            const y = (node.height - point.height * scale) / 2 + point.y * scale;
            const sample = globalThis.document.createElement('canvas');
            sample.width = node.width;
            sample.height = node.height;
            const context = sample.getContext('2d')!;
            context.drawImage(node, 0, 0);
            return Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data);
          },
          {
            width: before.width,
            height: before.height,
            x: host.transform.x + 200,
            y: host.transform.y + 320,
          }
        );
      expect(before.width / before.height).toBe(16 / 9);
      await expect.poll(pixel).toEqual([16, 19, 29, 255]);
      const baselinePixel = await pixel();
      const baselineFrame = await readPreviewCanvasSignature(page);
      await settings.goto(`${origin}/apps/extension/src/settings/index.html?section=video-effects`);
      const row = settings
        .locator('[data-settings-collection-item]')
        .filter({ hasText: 'E2E e2e-title' });
      await expect(row).toHaveCount(1);
      await row
        .getByRole('button', { name: label('settings.collection.actions.delete'), exact: true })
        .click();
      const confirm = settings.getByRole('alertdialog');
      await confirm
        .getByRole('button', { name: label('common.actions.delete'), exact: true })
        .click();
      await expect(row).toHaveCount(0);
      await page.bringToFront();
      // Headless Chromium keeps both pages focused; use the existing catalog return event.
      await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
      expect(await readCurrentCatalogProject(page)).toEqual(before);
      await expect.poll(() => readPreviewCanvasSignature(page)).toBe(baselineFrame);
      await page.screenshot({
        path: info.outputPath('applied-after-catalog-delete.png'),
        fullPage: false,
      });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readCurrentCatalogProject(page)).toEqual(before);
      await expect.poll(pixel).toEqual(baselinePixel);
      await openNativeCatalog(page);
      const dock = page.locator('[data-ui="video-editor.effects-library.dock"]');
      const original = await readAnimationFixtureSource(LOTTIE_ANNOTATION_FIXTURE, 'e2e-title');
      const parsedReplacement = parseAnimationTemplateSource(original);
      if (!parsedReplacement.template) throw new Error('Invalid replacement animation');
      const changed = parsedReplacement.template;
      const accent = changed.controls.find((control) => control.id === 'accent');
      if (accent?.kind !== 'color') throw new Error('Replacement colour control unavailable');
      accent.defaultValue = '#00ff00';
      const panelColor = changed.controls.find((control) => control.id === 'panel');
      if (panelColor?.kind !== 'color') throw new Error('Replacement panel control unavailable');
      panelColor.defaultValue = '#ec4899';
      for (const preset of changed.controlPresets ?? [])
        if ('accent' in preset.values) preset.values.accent = '#00ff00';
      const replacement = JSON.stringify(changed);
      expect(replacement).not.toBe(original);
      const chooser = page.waitForEvent('filechooser');
      await dock
        .getByRole('button', { name: label('videoEditor.effectsLibrary.importPack'), exact: true })
        .click();
      await (
        await chooser
      ).setFiles({
        name: 'e2e-title.sniptale-animation.json',
        mimeType: 'application/json',
        buffer: Buffer.from(replacement),
      });
      await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
      await expect(document).toBeVisible();
      expect(await readCurrentCatalogProject(page)).toEqual(before);
      await expect.poll(pixel).toEqual(baselinePixel);
      await document.hover();
      await document.getByTitle(label('videoEditor.app.materialsAppend'), { exact: true }).click();
      await expect
        .poll(async () => (await readCurrentCatalogProject(page))?.effectInstances?.length)
        .toBe(2);
      const after = (await readCurrentCatalogProject(page))!;
      expect(after.effectInstances!.find(({ id }) => id === oldInstance.id)).toEqual(oldInstance);
      expect(after.effectSnapshots!.find(({ id }) => id === oldInstance.snapshotId)).toEqual(
        before.effectSnapshots!.find(({ id }) => id === oldInstance.snapshotId)
      );
      const added = after.effectInstances!.find(({ id }) => id !== oldInstance.id)!;
      expect(added.controls['accent']).toBe('#00ff00');
      expect(added.startTime).toBe(before.duration);
      expect(added.snapshotId).not.toBe(oldInstance.snapshotId);
      expect(after.effectSnapshots).toHaveLength(2);
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      await page.screenshot({
        path: info.outputPath('applied-after-catalog-reimport.png'),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    } finally {
      await settings.close();
    }
  });
}

async function openNativeCatalog(page: Page) {
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await page
    .locator(
      '[data-ui="video-editor.viewer.open-effects"], [data-ui="video-editor.library-tab.effects"]'
    )
    .first()
    .click();
  await expect(page.locator('[data-ui="video-editor.effects-library.dock"]')).toBeVisible();
  await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
}

async function readCurrentCatalogProject(page: Page) {
  const id = new URL(page.url()).searchParams.get('project');
  if (!id) throw new Error('The editor URL must identify the saved project.');
  const value = await page.evaluate(
    (projectId) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('video_projects')
            .objectStore('video_projects')
            .get(projectId);
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
        };
      }),
    id
  );
  return typeof value === 'object' && value !== null && 'project' in value
    ? parseHydratableVideoProject(value.project)
    : null;
}
