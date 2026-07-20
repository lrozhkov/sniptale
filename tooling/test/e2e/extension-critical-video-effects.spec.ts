import { expect } from '@playwright/test';
import { test } from './support/extension-fixture';
import {
  countPersistedEffectInstances,
  countResponsiveAnimationFrames,
  createTransitionE2eProject,
  EFFECT_V1_STANDALONE_FIXTURE,
  EFFECT_V1_TARGET_FIXTURE,
  EFFECT_V1_TRANSITION_FIXTURE,
  importAndApplyEffect,
  importEffectFile,
  importVideoInput,
  importVisualInput,
  openEffectVideoEditorHarness,
  readPreviewCanvasSignature,
} from './extension-critical-video-effects.helpers';
import {
  VIDEO_EDITOR_EFFECT_DISABLE_LABEL,
  VIDEO_EDITOR_EFFECT_ENABLE_LABEL,
  VIDEO_EDITOR_PAUSE_LABEL,
  VIDEO_EDITOR_PLAY_LABEL,
} from './extension-critical.helpers';
import { translate } from '../../../apps/extension/src/platform/i18n';

const VIDEO_EDITOR_PREVIEW_MODE_LABEL = translate('videoEditor.stage.previewMode', 'ru');
const VIDEO_EDITOR_PREVIEW_RASTER_LABEL = translate('videoEditor.stage.previewRaster', 'ru');
const VIDEO_EDITOR_PREVIEW_CACHE_LABEL = translate('videoEditor.stage.previewModeCache', 'ru');
const VIDEO_EDITOR_PREVIEW_CACHE_READY_LABEL = translate(
  'videoEditor.stage.previewCacheReady',
  'ru'
);

test('EffectV1 catalog enable toggle stays live in Chromium IndexedDB', async ({
  page,
  hostOrigin,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openEffectVideoEditorHarness(page, hostOrigin);
  await importEffectFile(page, {
    documentId: 'neutral-standalone',
    fixturePath: EFFECT_V1_STANDALONE_FIXTURE,
  });

  await page.getByRole('button', { name: VIDEO_EDITOR_EFFECT_DISABLE_LABEL, exact: true }).click();
  const enableButton = page.getByRole('button', {
    name: VIDEO_EDITOR_EFFECT_ENABLE_LABEL,
    exact: true,
  });
  await expect(enableButton).toBeVisible();
  await enableButton.click();
  await expect(page.getByText('neutral-standalone', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_EFFECT_DISABLE_LABEL, exact: true })
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('EffectV1 playback keeps the video editor responsive', async ({ page, hostOrigin }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openEffectVideoEditorHarness(page, hostOrigin);
  await importAndApplyEffect(page, {
    documentId: 'neutral-standalone',
    fixturePath: EFFECT_V1_STANDALONE_FIXTURE,
  });
  await expect(page.locator('[data-playback-counter="true"]')).toContainText('0:03.0');

  const playButton = page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true });
  await expect(playButton).toBeEnabled();
  await playButton.click();

  await expect(page.locator('iframe[src*="effect-runtime-sandbox"]')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true })
  ).toBeVisible();
  expect(await countResponsiveAnimationFrames(page, 1_500)).toBeGreaterThan(10);

  await page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true }).click();
  expect(pageErrors.filter((message) => /EffectV1|effect runtime/iu.test(message))).toEqual([]);
});

test('cached EffectV1 preview prepares beyond the first frame and starts playback', async ({
  page,
  hostOrigin,
}) => {
  await openEffectVideoEditorHarness(page, hostOrigin);
  await importVideoInput(page);
  await importAndApplyEffect(page, {
    documentId: 'neutral-standalone',
    fixturePath: EFFECT_V1_STANDALONE_FIXTURE,
  });
  await page.getByRole('button', { name: VIDEO_EDITOR_PREVIEW_RASTER_LABEL }).click();
  await page.getByRole('option', { name: '720p', exact: true }).click();
  await page.getByRole('button', { name: VIDEO_EDITOR_PREVIEW_MODE_LABEL }).click();
  await page.getByText(VIDEO_EDITOR_PREVIEW_CACHE_LABEL, { exact: true }).click();
  await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();

  await expect(page.getByText(VIDEO_EDITOR_PREVIEW_CACHE_READY_LABEL, { exact: true })).toBeVisible(
    {
      timeout: 30_000,
    }
  );
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true })
  ).toBeVisible();
});

test('target EffectV1 playback keeps visual input rendering responsive', async ({
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
  await importVisualInput(page);
  const visualInputSignature = await readPreviewCanvasSignature(page);
  await importAndApplyEffect(page, {
    documentId: 'demo-target-overlay',
    fixturePath: EFFECT_V1_TARGET_FIXTURE,
  });

  await expect.poll(() => countPersistedEffectInstances(page)).toBe(1);
  await expect
    .poll(() => readPreviewCanvasSignature(page), {
      message: `EffectV1 preview did not change. Console errors: ${consoleErrors.join(' | ')}`,
    })
    .not.toBe(visualInputSignature);
  await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();
  const runtimeSandbox = page.locator('iframe[src*="effect-runtime-sandbox"]');
  await expect(runtimeSandbox).toHaveCount(1);
  await runtimeSandbox.evaluate((iframe) =>
    iframe.setAttribute('data-e2e-runtime-owner', 'initial')
  );
  expect(await countResponsiveAnimationFrames(page, 2_000)).toBeGreaterThan(10);
  await expect(page.locator('iframe[data-e2e-runtime-owner="initial"]')).toHaveCount(1);

  await page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true }).click();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors.filter((message) => /EffectV1|effect runtime/iu.test(message))).toEqual([]);
});

test('transition EffectV1 playback keeps the junction runtime responsive', async ({
  page,
  hostOrigin,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const project = createTransitionE2eProject();
  await page.setViewportSize({ height: 2160, width: 3840 });
  await openEffectVideoEditorHarness(page, hostOrigin, project);
  await importAndApplyEffect(page, {
    documentId: 'neutral-transition',
    fixturePath: EFFECT_V1_TRANSITION_FIXTURE,
  });
  await expect.poll(() => countPersistedEffectInstances(page)).toBe(1);

  await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();
  await expect(page.locator('iframe[src*="effect-runtime-sandbox"]')).toHaveCount(1);
  expect(await countResponsiveAnimationFrames(page, 1_500)).toBeGreaterThan(10);

  await page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true }).click();
  expect(consoleErrors).toEqual([]);
});
