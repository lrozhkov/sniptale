import { mkdir } from 'node:fs/promises';
import { CONTENT_APP_CONTAINER_ID, CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { translate } from '../../../apps/extension/src/platform/i18n';
import { test, expect, resolveExtensionServiceWorkerUrl } from './support/extension-fixture';
import {
  captureDesignSystemScreenshot,
  expectFloatingPreviewContained,
  expectThemeSurfaceToggle,
} from './extension-smoke.helpers';

const SETTINGS_AI_LABEL = translate('settings.navigation.ai', 'ru');
const SETTINGS_AI_PROVIDERS_TITLE = translate('settings.aiProviders.providersTitle', 'ru');
const SETTINGS_AI_MODELS_TITLE = translate('settings.aiProviders.modelsTitle', 'ru');
const SETTINGS_AI_GLOBAL_PROMPT_TITLE = translate('settings.aiProviders.globalPromptTitle', 'ru');
const SETTINGS_AI_GLOBAL_PROMPT_DESCRIPTION = translate(
  'settings.aiProviders.globalPromptDescription',
  'ru'
);
const SETTINGS_AI_SAVE_PROMPT_LABEL = translate(
  'settings.aiProviders.globalPromptSaveButton',
  'ru'
);
const POPUP_HARNESS_PATH = '/tooling/test/harness/popup.html';
const POPUP_HOME_TAB_LABEL = translate('popup.tabs.home', 'ru');
const POPUP_VIDEO_TAB_LABEL = translate('popup.tabs.video', 'ru');
const POPUP_EXPORT_TAB_LABEL = translate('popup.tabs.export', 'ru');

const builtExtensionPages = [
  {
    name: 'popup',
    path: '/apps/extension/src/popup/index.html',
    selector: '[data-ui="popup.app.root"]',
    viewport: { width: 420, height: 760 },
  },
  {
    name: 'settings',
    path: '/apps/extension/src/settings/index.html',
    selector: '[data-ui="settings.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'gallery',
    path: '/apps/extension/src/gallery/index.html',
    selector: '[data-ui="gallery.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'editor',
    path: '/apps/extension/src/editor/index.html',
    selector: '[data-ui="editor.page.root"]',
    viewport: { width: 1600, height: 1100 },
  },
  {
    name: 'video-editor',
    path: '/apps/extension/src/video-editor/index.html',
    selector: '[data-ui="video-editor.workspace.root"]',
    viewport: { width: 1600, height: 1100 },
  },
  {
    name: 'scenario-editor',
    path: '/apps/extension/src/scenario-editor/index.html',
    selector: '[data-ui="scenario.editor.v3-page.root"]',
    viewport: { width: 1600, height: 1100 },
  },
] as const;

async function expectBuiltSurfaceLayout(
  page: import('@playwright/test').Page,
  selector: string,
  viewport: { width: number; height: number }
): Promise<void> {
  const root = page.locator(selector).first();
  await expect(root).toBeVisible();
  const bounds = await root.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(Math.min(380, viewport.width * 0.9));
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(Math.min(540, viewport.height * 0.9));
  await expect
    .poll(() => page.evaluate(() => document.styleSheets.length))
    .toBeGreaterThanOrEqual(1);
}

test('background service worker boots', async ({ context, extensionId }) => {
  const serviceWorkerUrl = await resolveExtensionServiceWorkerUrl(context);
  await expect(serviceWorkerUrl).toContain(extensionId);
});

for (const extensionPage of builtExtensionPages) {
  test(`built ${extensionPage.name} UI loads with owned layout`, async ({
    context,
    extensionId,
  }, testInfo) => {
    const page = await context.newPage();
    await page.setViewportSize(extensionPage.viewport);
    await page.goto(`chrome-extension://${extensionId}${extensionPage.path}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(
      (url) =>
        url.protocol === 'chrome-extension:' &&
        url.host === extensionId &&
        url.pathname === extensionPage.path
    );
    await expectBuiltSurfaceLayout(page, extensionPage.selector, extensionPage.viewport);
    await mkdir(testInfo.outputDir, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`built-${extensionPage.name}.png`),
    });
    await page.close();
  });
}

test('content runtime is not injected before explicit site access', async ({
  page,
  hostOrigin,
}) => {
  await page.goto(`${hostOrigin}/fixtures/host-page.html`);
  await expect(page.getByTestId('host-page-title')).toBeVisible();
  await expect(page.locator(`#${CONTENT_ROOT_ID}`)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        ({ appContainerId, contentRootId }) => {
          const root = document.getElementById(contentRootId);
          return Boolean(root?.shadowRoot?.getElementById(appContainerId));
        },
        { appContainerId: CONTENT_APP_CONTAINER_ID, contentRootId: CONTENT_ROOT_ID }
      )
    )
    .toBe(false);
});

const extensionPages = [
  {
    name: 'settings',
    path: '/tooling/test/harness/settings.html',
    selector: '[data-ui="settings.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'gallery',
    path: '/tooling/test/harness/gallery.html',
    selector: '[data-ui="gallery.page.root"]',
    viewport: { width: 1440, height: 1100 },
  },
  {
    name: 'editor',
    path: '/tooling/test/harness/editor.html',
    selector: '[data-ui="editor.page.root"]',
    viewport: { width: 1600, height: 1100 },
  },
] as const;

test('popup page renders an active or loading popup surface', async ({ page, hostOrigin }) => {
  await page.setViewportSize({ width: 420, height: 760 });
  await page.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });

  const popupSurface = page
    .locator('[data-ui="popup.app.root"], [data-ui="popup.app.loading"]')
    .first();
  await expect(popupSurface).toBeVisible();
});

test('popup video tab renders a non-default setup state and captures screenshot', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: POPUP_VIDEO_TAB_LABEL, exact: true }).click();
  await expect(page.locator('[data-ui="popup.video-setup.start-recording-button"]')).toBeVisible();
  await expect(page.locator('[data-ui="popup.video-setup.video-editor-button"]')).toBeVisible();

  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    path: testInfo.outputPath('popup-video-setup.png'),
    fullPage: true,
  });
});

test('popup home and export tabs render and capture screenshots', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: POPUP_HOME_TAB_LABEL, exact: true }).click();
  await expect(page.locator('[data-ui="popup.home.screenshot-prep-button"]')).toBeVisible();

  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    path: testInfo.outputPath('popup-home.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: POPUP_EXPORT_TAB_LABEL, exact: true }).click();
  await expect(page.locator('[data-ui="popup.export.export-button"]')).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath('popup-export.png'),
    fullPage: true,
  });
});

for (const extensionPage of extensionPages) {
  test(`${extensionPage.name} page renders and captures screenshot`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await page.setViewportSize(extensionPage.viewport);
    await page.goto(`${hostOrigin}${extensionPage.path}`, { waitUntil: 'domcontentloaded' });
    await page.locator(extensionPage.selector).first().waitFor({ state: 'visible' });

    await mkdir(testInfo.outputDir, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${extensionPage.name}.png`),
    });

    await expect(page.locator(extensionPage.selector).first()).toBeVisible();
  });
}

test('settings AI section renders provider, model, and global prompt surfaces', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${hostOrigin}/tooling/test/harness/settings.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="settings.page.root"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: SETTINGS_AI_LABEL, exact: true }).click();

  const settingsContent = page.locator('[data-ui="settings.page.content"]');
  await expect(settingsContent.getByText(SETTINGS_AI_LABEL, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: SETTINGS_AI_PROVIDERS_TITLE, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: SETTINGS_AI_MODELS_TITLE, exact: true })
  ).toBeVisible();

  const globalPromptToggle = page
    .locator('button')
    .filter({ hasText: SETTINGS_AI_GLOBAL_PROMPT_TITLE })
    .first();
  await expect(globalPromptToggle).toBeVisible();
  await globalPromptToggle.click();

  await expect(
    page.getByText(SETTINGS_AI_GLOBAL_PROMPT_DESCRIPTION, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: SETTINGS_AI_SAVE_PROMPT_LABEL, exact: true })
  ).toBeVisible();
});

test('design-system page keeps theme ownership local and contains floating previews', async ({
  context,
  extensionId,
}, testInfo) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/design-system/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="design-system.page.root"]').waitFor({ state: 'visible' });
  await expectThemeSurfaceToggle(page);

  await page.locator('input[type="search"]').fill('product.ui.toast');
  const toastCard = page.locator('article', { hasText: 'product.ui.toast' });
  const countdownContainer = toastCard.locator('.sniptale-countdown-toast-container');
  const previewFrame = countdownContainer.locator(
    'xpath=ancestor::*[@data-ui="design-system.preview-frame"]'
  );

  await expect(toastCard).toBeVisible();
  await expect(previewFrame).toBeVisible();
  await expect(countdownContainer).toBeVisible();
  await expectFloatingPreviewContained(countdownContainer);
  await captureDesignSystemScreenshot(page, testInfo);
});
