import type { BrowserContext, Locator, Page, TestInfo, ViewportSize } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { expect, test } from '../support/extension-fixture';

test.use({ actionTimeout: 10_000 });

type Locale = 'ru' | 'en';
type Theme = 'light' | 'dark';
type Kind = 'frame' | 'callout' | 'step-badge';
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
const menuIds: Record<Kind, string> = {
  frame: 'content.toolbar.future-frame-style.menu',
  callout: 'content.toolbar.future-frame-callout.menu',
  'step-badge': 'content.toolbar.future-frame-step-badge.menu',
};
const visiblePanel = (page: Page) =>
  page.locator('.sniptale-content-popover--toolbar-menu:visible').filter({
    has: page.locator('.sniptale-settings-popover-header'),
  });

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  await visiblePanel(page)
    .locator('.sniptale-settings-popover-header .sniptale-toolbar-menu-title')
    .hover();
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function assertHeader(panel: Locator, element: boolean) {
  const header = panel.locator('.sniptale-settings-popover-header');
  await expect(header).toBeVisible();
  await expect(header.locator('[data-settings-action="close"]')).toHaveCount(element ? 1 : 0);
  const geometry = await header.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      viewport: { width: innerWidth, height: innerHeight },
      overflow: node.scrollWidth - node.clientWidth,
      actions: Array.from(node.querySelectorAll<HTMLElement>('[data-settings-action]')).map(
        (action) => {
          const box = action.getBoundingClientRect();
          const style = getComputedStyle(action);
          return {
            action: action.dataset['settingsAction'],
            width: box.width,
            height: box.height,
            center: box.top + box.height / 2,
            text: action.textContent?.trim(),
            label: action.getAttribute('aria-label'),
            title: action.title,
            background: style.backgroundColor,
            shadow: style.boxShadow,
            icon: action.querySelector('svg') !== null,
          };
        }
      ),
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport.height);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  for (const action of geometry.actions) {
    expect(action.icon).toBe(true);
    expect(action.text).toBe('');
    expect(action.label).toBeTruthy();
    expect(action.title).toBeTruthy();
    expect(Math.abs(action.width - action.height)).toBeLessThanOrEqual(1 / 64);
    expect(action.height).toBeGreaterThanOrEqual(24);
    expect(action.height).toBeLessThanOrEqual(32);
    expect(action.background).toBe('rgba(0, 0, 0, 0)');
    expect(action.shadow).toBe('none');
    expect(Math.abs(action.center - geometry.actions[0]!.center)).toBeLessThanOrEqual(1);
  }
  for (const action of await header.locator('[data-settings-action]').all()) {
    await header.locator('.sniptale-toolbar-menu-title').hover();
    const idleColor = await action.evaluate((node) => getComputedStyle(node).color);
    await action.hover();
    await expect
      .poll(() => action.evaluate((node) => getComputedStyle(node).color))
      .not.toBe(idleColor);
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(action).toHaveCSS('box-shadow', 'none');
    await expect(action).toHaveCSS('cursor', 'pointer');
  }
  await header.locator('.sniptale-toolbar-menu-title').hover();
}

async function sourceChoice(panel: Locator, kind: Exclude<Kind, 'frame'>, locale: Locale) {
  const source = panel.locator('[data-ui="shared.annotation-template-source"]');
  await expect(source).toBeVisible();
  const prefix = kind === 'callout' ? 'content.callout' : 'content.stepBadge';
  const frame = source.getByTitle(translate(`${prefix}.templateSourceFrameHint`, locale), {
    exact: true,
  });
  const forced = source.getByTitle(translate(`${prefix}.templateSourceForcedHint`, locale), {
    exact: true,
  });
  await expect(frame).toHaveText(locale === 'ru' ? 'Рамка' : 'Frame');
  await expect(forced).toHaveText(locale === 'ru' ? 'По умолчанию' : 'Default');
  await forced.click();
  await expect(forced).toHaveAttribute('aria-pressed', 'true');
  await expect(frame).toHaveAttribute('aria-pressed', 'false');
  await expect(forced).toHaveCSS('outline-style', 'none');
  await forced.click();
  await expect(forced).toHaveAttribute('aria-pressed', 'true');
  await expect(source).toHaveCount(1);
  await frame.click();
  await expect(frame).toHaveAttribute('aria-pressed', 'true');
  await expect(forced).toHaveAttribute('aria-pressed', 'false');
  await frame.press('Tab');
  await expect(forced).toBeFocused();
  await expect(forced).toHaveCSS('outline-style', 'solid');
}

async function temporaryWorkflow(
  page: Page,
  panel: Locator,
  locale: Locale,
  element: boolean,
  info: TestInfo,
  name: string
) {
  const fork = panel.locator('[data-template-fork-source]').first();
  await expect
    .poll(
      async () =>
        (await fork.count()) +
        (await panel.locator('[data-settings-action="back-to-templates"]').count())
    )
    .toBeGreaterThan(0);
  if (await fork.count()) {
    await fork.focus();
    await fork.press('Enter');
  }
  const back = panel.locator('[data-settings-action="back-to-templates"]');
  await expect(back).toBeVisible();
  await assertHeader(panel, element);
  const title = panel.locator('.sniptale-settings-popover-header .sniptale-toolbar-menu-title');
  const backBox = (await back.boundingBox())!;
  const titleBox = (await title.boundingBox())!;
  expect(backBox.x + backBox.width).toBeLessThanOrEqual(titleBox.x + 1);
  await capture(page, info, `${name}-temporary`);
  await back.click();
  await expect(back).toHaveCSS('outline-style', 'none');
  const guard = panel.locator('[data-ui="content.template-fork.return-guard"]');
  await expect(guard).toBeVisible();
  const continueEditing = guard.getByRole('button', {
    name: translate('content.templateFork.continueEditing', locale),
    exact: true,
  });
  await continueEditing.scrollIntoViewIfNeeded();
  await expect(continueEditing).toBeInViewport({ ratio: 1 });
  await continueEditing.click();
  await expect(back).toBeVisible();
  await back.click();
  const discard = guard.getByRole('button', {
    name: translate('content.templateFork.discard', locale),
    exact: true,
  });
  await discard.scrollIntoViewIfNeeded();
  await discard.click();
  await expect(back).toHaveCount(0);
  await expect(panel.locator('[data-template-fork-source]').first()).toBeVisible();
}

async function toolbarWorkflow(page: Page, locale: Locale, info: TestInfo, sourceControls = true) {
  for (const kind of ['frame', 'callout', 'step-badge'] as const) {
    const menu = ui(page, menuIds[kind]);
    await menu.click();
    const panel = visiblePanel(page);
    await expect(panel).toHaveCount(1);
    await assertHeader(panel, false);
    if (kind !== 'frame' && sourceControls) await sourceChoice(panel, kind, locale);
    await capture(page, info, `toolbar-${kind}-templates`);
    await temporaryWorkflow(page, panel, locale, false, info, `toolbar-${kind}`);
    await menu.click();
    await expect(panel).toHaveCount(0);
  }
}

async function contentHost(
  context: BrowserContext,
  extensionId: string,
  viewport: ViewportSize,
  locale: Locale,
  theme: Theme
) {
  const origin = 'http://sniptale-annotation-header.test';
  await context.route(`${origin}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><html><head><title>Annotation header host</title><style>' +
        'body{margin:0;background:#283646;color:white;font:20px ' +
        'Georgia}#target{position:absolute;left:140px;top:270px;width:160px;' +
        'height:70px}</style></head><body><button id="target">Annotation target</' +
        'button></body></html>',
    })
  );
  const popup = await context.newPage();
  await popup.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=interface-browser&view=interface`
  );
  await expect(popup.locator('#settings-interface-language')).toBeEnabled();
  await popup.evaluate(async (settings) => chrome.storage.local.set(settings), {
    'sniptale-locale-preference': locale,
    'sniptale-theme-preference': theme,
  });
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(origin);
  const tabId = await popup.evaluate(async (origin) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === `${origin}/`);
    if (tab?.id === undefined) throw new Error('Annotation header host tab not found');
    return tab.id;
  }, origin);
  await popup.evaluate((origin) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant annotation host';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${origin}/*`] })
      );
    };
    document.body.append(grant);
  }, origin);
  await popup.getByRole('button', { name: 'Grant annotation host', exact: true }).click();
  await expect(
    popup.getByRole('button', { name: 'Grant annotation host', exact: true })
  ).toHaveAttribute('data-granted', 'true');
  await page.reload();
  const registered = await popup.evaluate(
    async (tabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      }),
    tabId
  );
  expect(registered).toMatchObject({ success: true, result: 'registered' });
  const enabled = await popup.evaluate(
    async (tabId) =>
      chrome.tabs.sendMessage(tabId, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode: 'highlighter',
      }),
    tabId
  );
  expect(enabled).toMatchObject({ success: true });
  await page.bringToFront();
  await expect(ui(page, 'content.toolbar.root')).toBeVisible();
  return { page, popup };
}

async function contentElementWorkflow(
  page: Page,
  locale: Locale,
  info: TestInfo,
  numberOnly = false
) {
  for (const mode of ['design-review', 'highlighter']) {
    await ui(page, 'content.toolbar.mode-selector-button').click();
    await ui(page, `content.toolbar.mode-option.${mode}`).click();
  }
  const target = (await page.locator('#target').boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
  await expect
    .poll(async () => {
      await page.mouse.move(target.x - 3, target.y + 10);
      return page.locator('.sniptale-frame-toolbar-trigger').isVisible();
    })
    .toBe(true);
  await page.locator('.sniptale-frame-toolbar-trigger').click();
  if (numberOnly) {
    const toolbar = page.locator('.sniptale-action-toolbar:visible');
    if (!(await page.locator('.sniptale-step-badge').count())) {
      await toolbar
        .getByRole('button', {
          name: translate('content.interactiveFrame.stepBadgeEnable', locale),
          exact: true,
        })
        .click();
    }
    await toolbar
      .getByRole('button', {
        name: translate('content.interactiveFrame.stepBadgeEnabled', locale),
        exact: true,
      })
      .click();
    const numberPanel = visiblePanel(page);
    await temporaryWorkflow(page, numberPanel, locale, true, info, 'element-step-badge');
    await numberPanel.locator('[data-settings-action="disable"]').click();
    await expect(page.locator('.sniptale-step-badge')).toHaveCount(0);
    await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
    return;
  }
  await page
    .locator('.sniptale-action-toolbar:visible')
    .getByRole('button', {
      name: translate('content.interactiveFrame.effectBorder', locale),
      exact: true,
    })
    .click();
  let panel = visiblePanel(page);
  await temporaryWorkflow(page, panel, locale, true, info, 'element-frame');
  await panel.locator('[data-settings-action="close"]').click();
  const frameBounds = (await page.locator('.sniptale-frame-container').boundingBox())!;
  await page.mouse.move(frameBounds.x + 1, frameBounds.y + frameBounds.height / 2);
  await page.screenshot({ path: info.outputPath('element-after-close.png'), fullPage: false });
  await page.locator('.sniptale-frame-toolbar-trigger').click();
  await page
    .getByRole('button', {
      name: translate('content.interactiveFrame.calloutAdd', locale),
      exact: true,
    })
    .first()
    .click();
  const editable = page.locator('.sniptale-callout [contenteditable="true"]').last();
  await editable.fill('Annotation header authored content');
  await editable.press('Escape');
  await page.locator('.sniptale-callout').last().hover();
  await page.locator('.sniptale-callout-settings-handle').last().click();
  panel = visiblePanel(page);
  await temporaryWorkflow(page, panel, locale, true, info, 'element-callout');
  await expect(page.locator('.sniptale-callout')).toContainText(
    'Annotation header authored content'
  );
  await panel.locator('[data-settings-action="disable"]').click();
  await expect(page.locator('.sniptale-callout')).toHaveCount(0);
  await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
}

async function editorElementWorkflow(page: Page, locale: Locale, info: TestInfo) {
  const plane = (await ui(page, 'editor.frame-annotation-plane').boundingBox())!;
  const start = { x: plane.x + plane.width / 2 - 80, y: plane.y + plane.height / 2 - 50 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 160, start.y + 100, { steps: 4 });
  await page.mouse.up();
  const toolbar = page.locator('.sniptale-action-toolbar:visible');
  await toolbar
    .getByRole('button', {
      name: translate('content.interactiveFrame.effectBorder', locale),
      exact: true,
    })
    .click();
  let panel = visiblePanel(page);
  await temporaryWorkflow(page, panel, locale, true, info, 'element-frame');
  await panel.locator('[data-settings-action="close"]').click();
  await toolbar
    .getByRole('button', {
      name: translate('content.interactiveFrame.calloutAdd', locale),
      exact: true,
    })
    .click();
  const editable = page.locator('.sniptale-callout [contenteditable="true"]').last();
  await editable.fill('Annotation header authored content');
  await editable.press('Escape');
  await page.locator('.sniptale-callout').last().hover();
  await page.locator('.sniptale-callout-settings-handle').last().click();
  panel = visiblePanel(page);
  await temporaryWorkflow(page, panel, locale, true, info, 'element-callout');
  await expect(page.locator('.sniptale-callout')).toContainText(
    'Annotation header authored content'
  );
  await panel.locator('[data-settings-action="disable"]').click();
  await expect(page.locator('.sniptale-callout')).toHaveCount(0);
  await toolbar
    .getByRole('button', {
      name: translate('content.interactiveFrame.stepBadgeEnable', locale),
      exact: true,
    })
    .click();
  panel = visiblePanel(page);
  await temporaryWorkflow(page, panel, locale, true, info, 'element-step-badge');
  await panel.locator('[data-settings-action="disable"]').click();
  await expect(page.locator('.sniptale-step-badge')).toHaveCount(0);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const locale of ['ru', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`native annotation headers ${locale} ${theme} ${viewport.name}`, async ({
        context,
        extensionId,
      }, info) => {
        test.setTimeout(120_000);
        let { page, popup } = await contentHost(context, extensionId, viewport.size, locale, theme);
        try {
          await toolbarWorkflow(page, locale, info);
          if (viewport.name === '1280x560' && locale === 'ru' && theme === 'light') {
            await page.setViewportSize({ width: 1100, height: 560 });
            await ui(page, menuIds.callout).click();
            await assertHeader(visiblePanel(page), false);
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
            ).toBeLessThanOrEqual(1);
            await capture(page, info, 'toolbar-callout-1100');
            await ui(page, menuIds.callout).click();
            await page.setViewportSize(viewport.size);
          }
          await contentElementWorkflow(page, locale, info);
          await page.close();
          await popup.close();
          ({ page, popup } = await contentHost(context, extensionId, viewport.size, locale, theme));
          await contentElementWorkflow(page, locale, info, true);
        } finally {
          await page.close();
          await popup.close();
        }
      });
      if ((locale === 'ru' && theme === 'light') || (locale === 'en' && theme === 'dark'))
        test(`editor annotation headers ${locale} ${theme} ${viewport.name}`, async ({
          page,
          hostOrigin,
        }, info) => {
          test.setTimeout(120_000);
          await page.setViewportSize(viewport.size);
          await page.emulateMedia({ colorScheme: theme });
          await applyHarnessBootstrap(page, {
            storage: {
              'sniptale-locale-preference': locale,
              'sniptale-theme-preference': theme,
            },
          });
          await page.addInitScript((value) => {
            localStorage.setItem('sniptale-locale-preference', value);
          }, locale);
          await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
          await expect(ui(page, 'editor.page.root')).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
            )
            .toBeGreaterThan(0);
          await ui(page, 'content.toolbar.future-frame-style').click();
          await toolbarWorkflow(page, locale, info, false);
          await editorElementWorkflow(page, locale, info);
        });
    }
  }
}
