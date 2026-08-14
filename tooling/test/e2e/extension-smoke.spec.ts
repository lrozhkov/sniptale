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
const SETTINGS_AI_NAV_LABEL = translate('settings.navigation.aiConnections', 'ru');
const SETTINGS_AI_PROMPTS_NAV_LABEL = translate('settings.navigation.aiPrompts', 'ru');
const SETTINGS_AI_PROVIDERS_TITLE = translate('settings.aiProviders.providersTitle', 'ru');
const SETTINGS_AI_MODELS_TITLE = translate('settings.aiProviders.modelsTitle', 'ru');
const SETTINGS_AI_PROMPTS_TITLE = translate('settings.navigation.templates', 'ru');
const SETTINGS_AI_SAVED_PROMPTS_LABEL = translate('templates.section.savedLabel', 'ru');
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

  const homeTab = page.getByRole('button', { name: POPUP_HOME_TAB_LABEL, exact: true });
  await homeTab.click();
  await expect(homeTab).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-ui="popup.app.content"]')).not.toBeEmpty();

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

test('built popup restores the correct first tab and never empties content on cold route changes', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const popupUrl = `chrome-extension://${extensionId}/apps/extension/src/popup/index.html`;
  await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      sniptale_popup_startup: { selection: 'remember-last', lastPage: 'video' },
    });
  });

  await page.addInitScript(() => {
    const probe = { activeTabIndexes: [] as number[] };
    Object.assign(window, { __sniptalePopupRouteProbe: probe });
    const sample = () => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[data-active]')
      );
      const activeIndex = buttons.findIndex((button) => button.dataset['active'] === 'true');
      if (activeIndex >= 0 && probe.activeTabIndexes.at(-1) !== activeIndex) {
        probe.activeTabIndexes.push(activeIndex);
      }
    };
    new MutationObserver(sample).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-active'],
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ui="popup.video-setup.start-recording-button"]')).toBeVisible();

  const firstActiveTabIndexes = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __sniptalePopupRouteProbe: { activeTabIndexes: number[] };
        }
      ).__sniptalePopupRouteProbe.activeTabIndexes
  );
  expect(firstActiveTabIndexes).toEqual([1]);

  await page.evaluate(() => {
    const content = document.querySelector('[data-ui="popup.app.content"]');
    if (!content) throw new Error('Popup content container is unavailable');
    const probe = { empty: false };
    Object.assign(window, { __sniptalePopupContentProbe: probe });
    const sample = () => {
      if (content.childElementCount === 0) probe.empty = true;
    };
    new MutationObserver(sample).observe(content, { childList: true, subtree: false });
    sample();
  });

  const topTabs = page.locator('button[data-active]').first().locator('xpath=..').locator('button');
  await topTabs.nth(0).click();
  await expect(topTabs.nth(0)).toHaveAttribute('data-active', 'true');
  await topTabs.nth(1).click();
  await expect(page.locator('[data-ui="popup.video-setup.start-recording-button"]')).toBeVisible();
  await topTabs.nth(2).click();
  await expect(page.locator('[data-ui="popup.export.export-button"]')).toBeVisible();

  const observedEmptyContent = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __sniptalePopupContentProbe: { empty: boolean };
        }
      ).__sniptalePopupContentProbe.empty
  );
  expect(observedEmptyContent).toBe(false);
  await page.close();
});

test('built popup paints the themed startup shell before loading application styles', async ({
  context,
  extensionId,
}, testInfo) => {
  const frozenFirstPaintPage = await context.newPage();
  await frozenFirstPaintPage.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await frozenFirstPaintPage.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
  });
  await frozenFirstPaintPage.goto(
    `chrome-extension://${extensionId}/apps/extension/src/popup/index.html`,
    { waitUntil: 'domcontentloaded' }
  );
  const frozenStartup = frozenFirstPaintPage.locator('[data-ui="popup.app.startup-shell"]');
  await expect(frozenStartup).toBeVisible();
  await expect(frozenStartup).toHaveCSS('background-color', 'rgb(246, 242, 237)');
  await mkdir(testInfo.outputDir, { recursive: true });
  await frozenFirstPaintPage.screenshot({
    path: testInfo.outputPath('popup-startup-light.png'),
  });

  await frozenFirstPaintPage.emulateMedia({
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  await expect(frozenStartup).toHaveCSS('background-color', 'rgb(9, 9, 11)');
  await frozenFirstPaintPage.screenshot({
    path: testInfo.outputPath('popup-startup-dark.png'),
  });
  await frozenFirstPaintPage.close();

  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const probe = { phases: [] as string[] };
    Object.assign(window, { __sniptalePopupPaintProbe: probe });
    const sample = () => {
      if (
        document.querySelector('[data-ui="popup.app.startup-shell"]') &&
        !probe.phases.includes('startup')
      ) {
        probe.phases.push('startup');
      }
      if (document.querySelector('[data-ui="popup.app.root"]') && !probe.phases.includes('react')) {
        probe.phases.push('react');
      }
    };
    new MutationObserver(sample).observe(document, { childList: true, subtree: true });
  });

  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });
  await expect(page.locator('[data-ui="popup.app.startup-shell"]')).toHaveCSS('opacity', '0');

  const proof = await page.evaluate(() => {
    const startup = document.querySelector<HTMLElement>('[data-ui="popup.app.startup-shell"]');
    const root = document.querySelector<HTMLElement>('[data-ui="popup.app.root"]');
    const firstPaint = performance
      .getEntriesByType('paint')
      .find((entry) => entry.name === 'first-paint');
    const entryMark = performance.getEntriesByName('sniptale-popup-entry-evaluated').at(-1);

    return {
      entryMarkAt: entryMark?.startTime ?? null,
      entryMarkCount: performance.getEntriesByName('sniptale-popup-entry-evaluated').length,
      firstPaintAt: firstPaint?.startTime ?? null,
      phases: (
        window as typeof window & {
          __sniptalePopupPaintProbe: { phases: string[] };
        }
      ).__sniptalePopupPaintProbe.phases,
      rootBackground: root ? getComputedStyle(root).backgroundColor : null,
      startupBackground: startup ? getComputedStyle(startup).backgroundColor : null,
      startupOpacity: startup ? getComputedStyle(startup).opacity : null,
      startupState: startup?.dataset['state'] ?? null,
      styleSheetHrefs: Array.from(document.styleSheets, (styleSheet) => styleSheet.href),
      transitionDuration: startup ? getComputedStyle(startup).transitionDuration : null,
    };
  });

  expect(proof.phases.slice(0, 2)).toEqual(['startup', 'react']);
  expect(proof.entryMarkCount).toBe(1);
  expect(proof.firstPaintAt).not.toBeNull();
  expect(proof.entryMarkAt).not.toBeNull();
  expect(proof.firstPaintAt ?? 0).toBeGreaterThanOrEqual(proof.entryMarkAt ?? 0);
  expect(proof.styleSheetHrefs).toHaveLength(4);
  expect(proof.styleSheetHrefs[0]).toContain('/assets/index.css');
  expect(proof.startupState).toBe('exiting');
  expect(proof.startupOpacity).toBe('0');
  expect(proof.startupBackground).toBe(proof.rootBackground);
  expect(proof.transitionDuration).toContain('0.14s');

  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });
  await expect(page.locator('[data-ui="popup.app.startup-shell"]')).toHaveCSS(
    'transition-duration',
    '0s'
  );
  await page.close();
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

test('settings AI sections render provider, model, and prompt template surfaces', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${hostOrigin}/tooling/test/harness/settings.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="settings.page.root"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: SETTINGS_AI_NAV_LABEL, exact: true }).click();

  const settingsContent = page.locator('[data-ui="settings.page.content"]');
  await expect(settingsContent.getByText(SETTINGS_AI_LABEL, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: SETTINGS_AI_PROVIDERS_TITLE, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: SETTINGS_AI_MODELS_TITLE, exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: SETTINGS_AI_PROMPTS_NAV_LABEL, exact: true }).click();
  await expect(settingsContent.getByText(SETTINGS_AI_PROMPTS_TITLE, { exact: true })).toBeVisible();
  await expect(
    settingsContent.getByText(SETTINGS_AI_SAVED_PROMPTS_LABEL, { exact: true })
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
