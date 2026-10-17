import { writeFile } from 'node:fs/promises';
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  openRealPopup,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';

const primarySizes = [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
];
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
type Composition = { locale: AppLocale; theme: 'light' | 'dark' };
const tr = (c: Composition, key: TranslationKey) => translate(key, c.locale);
const projectName = (c: Composition) =>
  c.locale === 'ru'
    ? 'Длинное название проекта — проверка полного имени и компактной панели записи'
    : 'Long reference project name — complete accessible text and compact recorder composition';

test.use({ actionTimeout: 10_000 });
test.setTimeout(180_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('.sniptale-toast')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function configure(context: BrowserContext, extensionId: string, c: Composition) {
  const settings = await context.newPage();
  await settings.setViewportSize(primarySizes[0]!);
  try {
    await settings.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html` +
        '?section=interface-browser&view=interface'
    );
    const language = settings.locator('#settings-interface-language');
    await expect(language).toBeEnabled();
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe('string');
    await language.click();
    await settings
      .getByRole('option', {
        name: c.locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe(c.locale);
    await settings.evaluate(async (theme) => {
      await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
      localStorage.setItem('sniptale-theme-preference', theme);
    }, c.theme);
  } finally {
    await settings.close();
  }
}

async function nativeAction(context: BrowserContext, extensionId: string, page: Page) {
  const browser = context.browser();
  if (!browser) throw new Error('Native recording browser missing');
  const session = await browser.newBrowserCDPSession();
  try {
    const targets = await session.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }, { exclude: true }],
    });
    const target = targets.targetInfos.find((candidate) => candidate.url === page.url());
    if (!target) throw new Error('Native recording host target missing');
    await session.send('Extensions.triggerAction', { id: extensionId, targetId: target.targetId });
  } finally {
    await session.detach();
  }
}

async function admit(context: BrowserContext, extensionId: string, origin: string) {
  const page = await context.newPage();
  await page.setViewportSize(primarySizes[0]!);
  await page.goto(origin);
  const popup = await openRealPopup(context, extensionId);
  await popup.evaluate((host) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant synthetic recorder host';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${host}/*`] })
      );
    };
    document.body.append(grant);
  }, origin);
  const grant = popup.getByRole('button', { name: 'Grant synthetic recorder host', exact: true });
  await grant.click();
  await expect(grant).toHaveAttribute('data-granted', 'true');
  const tabId = await popup.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    if (tab?.id === undefined) throw new Error('Synthetic host tab missing');
    return tab.id;
  }, page.url());
  await page.reload();
  expect(
    await sendRuntimeMessage(popup, {
      type: 'PAGE_ACCESS',
      operation: 'register-granted-site',
      tabId,
    })
  ).toMatchObject({ success: true, result: 'registered' });
  expect(
    await popup.evaluate(
      (id) =>
        chrome.tabs.sendMessage(id, {
          type: 'ENABLE_SCREENSHOT_MODE',
          workingMode: 'design-review',
        }),
      tabId
    )
  ).toMatchObject({ success: true });
  await page.bringToFront();
  await expect(ui(page, 'content.toolbar.root')).toBeVisible();
  return { page, popup, tabId };
}

async function inside(target: Locator, page: Page) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Actual UI surface has no visible bounds');
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
}

async function interfaceFont(root: Locator) {
  const family = await root.evaluate(async (node) => {
    await node.ownerDocument.fonts.ready;
    const probe = node.ownerDocument.createElement('span');
    probe.style.fontFamily = 'var(--sniptale-font-interface)';
    node.append(probe);
    const resolved = getComputedStyle(probe).fontFamily;
    probe.remove();
    return resolved;
  });
  await expect(root).toHaveCSS('font-family', family);
  expect(
    await root.evaluate((node, resolved) => {
      const alias = resolved.split(',')[0]!.replaceAll(/["']/gu, '').trim();
      return Array.from(node.ownerDocument.fonts).some(
        (face) => face.family.replaceAll(/["']/gu, '') === alias && face.status === 'loaded'
      );
    }, family)
  ).toBe(true);
}

async function canonicalCommand(target: Locator) {
  await target.page().mouse.move(0, 0);
  await expect(target).toHaveCSS('height', '32px');
  await expect(target).toHaveCSS('border-radius', '4px');
  await expect(target).toHaveCSS('font-size', '13px');
  await expect(target).toHaveCSS('line-height', '18px');
  await expect(target).toHaveCSS(
    'font-weight',
    (await target.getAttribute('data-command-active')) === 'true' ? '500' : '400'
  );
}

async function keyboardPaint(target: Locator) {
  await expect(target).toBeFocused();
  expect(await target.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
  await expect(target).toHaveCSS('outline-width', '2px');
  await expect(target).toHaveCSS('outline-style', 'solid');
  const accent = await target.evaluate((node) => {
    const probe = node.ownerDocument.createElement('span');
    probe.style.color = 'var(--sniptale-color-accent)';
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(target).toHaveCSS('outline-color', accent);
}

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 45; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((node) => node.matches(':focus'))) break;
  }
  await keyboardPaint(target);
}

async function movePointer(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Command pointer target unavailable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function createProject(page: Page, c: Composition, info: TestInfo) {
  await ui(page, 'content.scenario.sidebar.project-button').click();
  const picker = ui(page, 'content.scenario.sidebar.project-picker');
  const input = picker.getByRole('textbox');
  await input.fill('Query to clear without creating a project');
  await picker.getByRole('button', { name: /Clear|Очистить/u }).click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(ui(page, 'content.scenario.sidebar.project-picker.create-button')).toHaveCount(0);
  await input.fill(projectName(c));
  await canonicalCommand(ui(page, 'content.scenario.sidebar.project-picker.create-button'));
  await capture(page, info, 'project-choice');
  await ui(page, 'content.scenario.sidebar.project-picker.create-button').click();
  await expect(picker).toHaveCount(0);
  const trigger = ui(page, 'content.scenario.sidebar.project-button');
  await expect(trigger).toHaveAttribute('title', projectName(c));
  await expect(trigger).toHaveAccessibleName(tr(c, 'scenario.content.projectButton'));
  await trigger.click();
  const row = ui(page, 'content.scenario.sidebar.project-picker.project');
  await expect(row).toHaveAccessibleName(projectName(c));
  await expect(row).toHaveAttribute('title', projectName(c));
  await row.click();
  await expect(picker).toHaveCount(0);
}

async function scenarioOverlays(page: Page, c: Composition, info: TestInfo) {
  const card = ui(page, 'content.scenario.sidebar.step').first();
  await card.hover();
  await card.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  await capture(page, info, 'step-card-expanded');
  const preview = card.locator('[data-ui="content.scenario.sidebar.step-preview-button"]');
  await expect(preview).toHaveAccessibleName(new RegExp(tr(c, 'gallery.keyboard.open')));
  await preview.click();
  const layer = ui(page, 'content.scenario.sidebar.floating-preview');
  const close = ui(page, 'content.scenario.sidebar.floating-preview-close');
  await expect(layer).toHaveAttribute('role', 'dialog');
  await expect(close).toBeFocused();
  await expect(layer.locator(':scope > div')).toHaveCSS('border-radius', '8px');
  await page.keyboard.press('Tab');
  await keyboardPaint(close);
  await capture(page, info, 'step-preview-keyboard');
  await page.keyboard.press('Escape');
  await expect(layer).toHaveCount(0);
  await expect(preview).toBeFocused();
  await preview.press('Enter');
  await close.click();
  await expect(preview).toBeFocused();
  const metadataTrigger = card.locator('[data-ui="content.scenario.sidebar.step-info"]');
  await metadataTrigger.click();
  const metadata = page.getByRole('dialog');
  const metadataClose = metadata.getByRole('button', {
    name: tr(c, 'common.actions.close'),
    exact: true,
  });
  await expect(metadataClose).toBeFocused();
  await expect(metadata).toHaveCSS('border-radius', '8px');
  const name = metadata.locator('dt').first();
  const value = metadata.locator('dd').first();
  await expect(name).toHaveCSS('font-size', '13px');
  await expect(name).toHaveCSS('line-height', '18px');
  await expect.soft(name).toHaveCSS('font-weight', '400', { timeout: 500 });
  await expect(name).toHaveCSS('user-select', 'none');
  await expect(value).toHaveCSS('user-select', 'text');
  const valueTextPoint = await value.evaluate((node) => {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return {
      x: text.left - box.left + Math.min(3, text.width / 2),
      y: text.top - box.top + text.height / 2,
    };
  });
  await value.dblclick({ position: valueTextPoint });
  const selectedValue = await value.evaluate((node) => ({
    selected: node.ownerDocument.getSelection()?.toString().trim() ?? '',
    value: node.textContent ?? '',
  }));
  expect(selectedValue.selected.length).toBeGreaterThan(0);
  expect(selectedValue.value).toContain(selectedValue.selected);
  await page.keyboard.press('Tab');
  await keyboardPaint(metadataClose);
  await capture(page, info, 'step-metadata-keyboard');
  await page.keyboard.press('Escape');
  await expect(metadata).toHaveCount(0);
  await expect(metadataTrigger).toBeFocused();
  await metadataTrigger.press('Enter');
  await metadataClose.click();
  await expect(metadataTrigger).toBeFocused();
}

async function scenarioSteps(page: Page, c: Composition, info: TestInfo) {
  const captureVisible = ui(page, 'content.scenario.sidebar.capture-visible');
  await page.evaluate(() => {
    document.title = 'Manual capture — synthetic reference page';
  });
  await captureVisible.click();
  const cards = ui(page, 'content.scenario.sidebar.step');
  await expect(cards).toHaveCount(1);
  await ui(page, 'content.scenario.sidebar.capture-mode.by-click').click();
  await expect(ui(page, 'content.scenario.sidebar.capture-mode.by-click')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'Host action', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await ui(page, 'content.scenario.sidebar.capture-mode.manual').click();
  await expect(ui(page, 'content.scenario.sidebar.capture-mode.manual')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await cards.first().hover();
  const initial = await cards.locator('div[title]').allTextContents();
  await cards.first().locator('[data-ui="content.scenario.sidebar.step-move-down"]').click();
  await expect
    .poll(() => cards.locator('div[title]').allTextContents())
    .toEqual([...initial].reverse());
  await scenarioOverlays(page, c, info);
  const last = cards.last();
  await last.hover();
  await last.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  await last.locator('[data-ui="content.scenario.sidebar.step-delete"]').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: tr(c, 'common.actions.cancel'), exact: true }).click();
  await expect(cards).toHaveCount(2);
  await last.hover();
  await last.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  await last.locator('[data-ui="content.scenario.sidebar.step-delete"]').click();
  await dialog.getByRole('button', { name: tr(c, 'common.actions.delete'), exact: true }).click();
  await expect(cards).toHaveCount(1);
}

async function sidebarGeometry(page: Page) {
  const sidebar = ui(page, 'content.scenario.sidebar');
  await inside(sidebar, page);
  await expect(sidebar).toHaveCSS('width', '336px');
  await expect(sidebar).toHaveCSS('border-radius', '4px');
  await interfaceFont(sidebar);
  await canonicalCommand(ui(page, 'content.scenario.sidebar.project-button'));
  await canonicalCommand(ui(page, 'content.scenario.sidebar.finish'));
  await canonicalCommand(ui(page, 'content.scenario.sidebar.capture-mode.manual'));
  const name = ui(page, 'content.scenario.sidebar.capture-mode').locator('legend');
  await expect(name).toHaveCSS('font-size', '13px');
  await expect(name).toHaveCSS('line-height', '18px');
  await expect.soft(name).toHaveCSS('font-weight', '400', { timeout: 500 });
  await inside(ui(page, 'content.scenario.sidebar.finish'), page);
}

async function scenario(
  page: Page,
  popup: Page,
  context: BrowserContext,
  extensionId: string,
  c: Composition,
  info: TestInfo
) {
  await triggerExtensionAction(context, extensionId, page);
  await page.bringToFront();
  await ui(page, 'content.toolbar.mode-selector-button').click();
  await ui(page, 'content.toolbar.mode-option.cursor').click();
  await ui(page, 'content.toolbar.capture-action-button').click();
  await ui(page, 'content.toolbar.capture-action-option.scenario').click();
  await expect(ui(page, 'content.scenario.sidebar')).toBeVisible();
  await createProject(page, c, info);
  await scenarioSteps(page, c, info);
  for (const size of primarySizes) {
    await page.setViewportSize(size);
    await sidebarGeometry(page);
    await capture(page, info, `scenario-${size.width}x${size.height}`);
  }
  await page.setViewportSize(primarySizes[0]!);
  const handle = ui(page, 'content.scenario.sidebar.drag-handle');
  const before = await ui(page, 'content.scenario.sidebar').boundingBox();
  await movePointer(page, handle);
  await page.mouse.down();
  await page.mouse.move(before!.x - 45, before!.y + 25, { steps: 8 });
  await page.mouse.up();
  expect((await ui(page, 'content.scenario.sidebar').boundingBox())!.x).toBeLessThan(
    before!.x - 20
  );
  await ui(page, 'content.scenario.sidebar.collapse').click();
  await expect(ui(page, 'content.scenario.sidebar')).toBeHidden();
  const restore = ui(page, 'content.scenario.sidebar.restore');
  await canonicalCommand(restore);
  await restore.click();
  await expect(ui(page, 'content.scenario.sidebar')).toBeVisible();
  if (c.locale === 'ru' && c.theme === 'dark') {
    await page.setViewportSize({ width: 960, height: 560 });
    await sidebarGeometry(page);
    await capture(page, info, 'scenario-960x560');
    await page.setViewportSize(primarySizes[0]!);
  }
  const retained = await ui(page, 'content.scenario.sidebar.step')
    .locator('div[title]')
    .innerText();
  const editorPromise = context.waitForEvent('page');
  await ui(page, 'content.scenario.sidebar.finish').click();
  const editor = await editorPromise;
  await expect(editor.locator('#guide-inspector-panel')).toBeVisible();
  await expect(
    editor.getByRole('textbox', { name: c.locale === 'ru' ? 'Сценарий' : 'Scenario', exact: true })
  ).toHaveValue(projectName(c));
  await expect(
    editor.getByRole('textbox', {
      name: c.locale === 'ru' ? 'Заголовок шага' : 'Step title',
      exact: true,
    })
  ).toHaveValue(retained);
  await editor.reload();
  await expect(editor.locator('article figure')).toHaveCount(1);
  await expect(ui(page, 'content.scenario.sidebar')).toBeHidden();
  await editor.close();
  await expect(popup.locator('[data-ui="popup.app.root"]')).toBeAttached();
}

async function menu(page: Page, id: string, info: TestInfo, name: string, expectedTitle: string) {
  const wrapper = ui(page, id);
  await expect(wrapper).toBeAttached();
  const surface = wrapper.locator('.sniptale-toolbar-menu');
  await expect(surface).toBeVisible();
  await inside(surface, page);
  await expect(surface).toHaveCSS('border-radius', '4px');
  const title = surface.locator('.sniptale-toolbar-menu-title');
  await expect(title).toHaveText(expectedTitle);
  await expect(title).toHaveCSS('font-size', '12px');
  await expect(title).toHaveCSS('line-height', '16px');
  await expect(title).toHaveCSS('font-weight', '500');
  await expect(title).toHaveCSS('text-transform', 'none');
  await expect(title).toHaveCSS('letter-spacing', 'normal');
  const item = surface.locator('.sniptale-toolbar-menu-item').first();
  await expect(item).toHaveCSS('font-size', '13px');
  await surface.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished)
    );
  });
  const metrics = await surface.evaluate((element) => ({
    padding: getComputedStyle(element).padding,
    gap: getComputedStyle(element.querySelector('.sniptale-toolbar-menu-list')!).gap,
    rows: Array.from(element.querySelectorAll('.sniptale-toolbar-menu-item')).map((row) => ({
      height: row.getBoundingClientRect().height,
      minimum: getComputedStyle(row).minHeight,
      padding: getComputedStyle(row).padding,
      glyph: row.querySelector('svg')?.getBoundingClientRect().width,
    })),
  }));
  const path = info.outputPath(`${name}-geometry.json`);
  await writeFile(path, JSON.stringify(metrics, null, 2));
  await info.attach(`${name}-geometry`, { path, contentType: 'application/json' });
  expect.soft(metrics.padding).toBe('5px');
  expect.soft(metrics.gap).toBe('2px');
  for (const row of metrics.rows) {
    expect.soft(row.minimum).toBe('32px');
    expect.soft(row.padding).toBe('6px 8px');
    if (row.glyph !== undefined) expect.soft(row.glyph).toBeCloseTo(16, 0);
  }
  await capture(page, info, name);
  return surface;
}

async function recordingStart(
  page: Page,
  context: BrowserContext,
  extensionId: string,
  info: TestInfo
) {
  await ui(page, 'content.toolbar.mode-selector-button').click();
  await ui(page, 'content.toolbar.mode-option.video-recording').click();
  await nativeAction(context, extensionId, page);
  await page.bringToFront();
  const start = ui(page, 'content.toolbar.video-recording.start');
  await capture(page, info, 'recording-start-target');
  await expect.soft(start).toHaveCSS('width', '32px');
  await expect.soft(start).toHaveCSS('height', '32px');
  await movePointer(page, start);
  await page.mouse.down();
  await expect(start).toHaveAttribute('data-pressing', 'true');
  await expect(ui(page, 'content.toolbar.video-recording.pause')).toHaveCount(0);
  await page.mouse.move(1, 400);
  await page.mouse.up();
  await expect(start).toBeEnabled();
  await expect(start).not.toHaveAttribute('data-pressing', 'true');
  await movePointer(page, start);
  await page.mouse.down();
  await expect(ui(page, 'content.toolbar.video-recording.pause')).toHaveCount(0);
  await page.mouse.up();
  await expect(ui(page, 'content.toolbar.video-recording.pause')).toBeVisible({ timeout: 30_000 });
}

async function recordingMenus(page: Page, c: Composition, info: TestInfo) {
  await ui(page, 'content.toolbar.video-recording.microphone.menu').click();
  const devices = await menu(
    page,
    'content.toolbar.video-recording.microphone.dropdown',
    info,
    'recording-media',
    tr(c, 'content.toolbar.videoRecordingMicrophone')
  );
  await expect(devices.locator('button').first()).toBeDisabled();
  await page.keyboard.press('Escape');
  await ui(page, 'content.toolbar.video-recording.spotlight').click();
  await menu(
    page,
    'content.toolbar.video-recording.spotlight-menu',
    info,
    'recording-spotlight',
    tr(c, 'content.toolbar.videoRecordingSpotlight')
  );
  const halo = ui(page, 'content.toolbar.video-recording.spotlight-halo');
  await halo.click();
  await expect(halo).toHaveClass(/sniptale-popover-item-selected/u);
  await halo.click();
  await page.keyboard.press('Escape');
  await ui(page, 'content.toolbar.video-recording.auto-hide').click();
  await menu(
    page,
    'content.toolbar.video-recording.auto-hide-menu',
    info,
    'recording-auto-hide',
    tr(c, 'content.toolbar.recordingDrawingAutoHide')
  );
  await ui(page, 'content.toolbar.video-recording.auto-hide-5').click();
  await expect(ui(page, 'content.toolbar.video-recording.auto-hide')).toHaveAttribute(
    'data-active',
    'true'
  );
  await expect(ui(page, 'content.toolbar.video-recording.auto-hide')).toHaveAttribute(
    'data-command-property',
    'true'
  );
  await expect(ui(page, 'content.toolbar.video-recording.auto-hide')).toHaveCSS(
    'border-color',
    'rgba(0, 0, 0, 0)'
  );
  await ui(page, 'content.toolbar.video-recording.auto-hide').click();
  await ui(page, 'content.toolbar.video-recording.auto-hide-0').click();
  await expect(ui(page, 'content.toolbar.video-recording.auto-hide')).not.toHaveAttribute(
    'data-active',
    'true'
  );
}

async function drawing(page: Page, info: TestInfo) {
  await ui(page, 'content.toolbar.drawing.pencil').click();
  const options = ui(page, 'content.toolbar.drawing-options.pencil');
  await expect(options).toBeVisible();
  await inside(options, page);
  await capture(page, info, 'recording-drawing');
  const canvas = page.locator(
    '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
  );
  await page.mouse.move(420, 320);
  await page.mouse.down();
  await page.mouse.move(550, 360, { steps: 8 });
  await page.mouse.up();
  const painted = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await ui(page, 'content.toolbar.video-recording.eraser').click();
  await expect(ui(page, 'content.toolbar.video-recording.eraser')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.mouse.move(485, 340);
  await page.mouse.down();
  await page.mouse.move(550, 360, { steps: 6 });
  await page.mouse.up();
  expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(painted);
  await ui(page, 'content.toolbar.video-recording.navigation').click();
  await expect(ui(page, 'content.toolbar.video-recording.navigation')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
}

async function recordingAdaptation(
  page: Page,
  popup: Page,
  tabId: number,
  c: Composition,
  info: TestInfo
) {
  await page.setViewportSize({ width: 960, height: 560 });
  await capture(page, info, 'recording-960x560');
  await ui(page, 'content.toolbar.settings-button').click();
  const free = page.getByRole('button', {
    name: /Free toolbar placement|Свободное размещение панели/u,
  });
  if (!(await free.evaluate((node) => node.classList.contains('sniptale-popover-item-selected'))))
    await free.click();
  await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).click();
  await ui(page, 'content.toolbar.video-recording.microphone.menu').click();
  await menu(
    page,
    'content.toolbar.video-recording.microphone.dropdown',
    info,
    'recording-vertical-media',
    tr(c, 'content.toolbar.videoRecordingMicrophone')
  );
  await page.keyboard.press('Escape');
  await ui(page, 'content.toolbar.video-recording.auto-hide').click();
  await menu(
    page,
    'content.toolbar.video-recording.auto-hide-menu',
    info,
    'recording-vertical-auto-hide',
    tr(c, 'content.toolbar.recordingDrawingAutoHide')
  );
  await page.keyboard.press('Escape');
  await popup.evaluate((id) => chrome.tabs.setZoom(id, 1.25), tabId);
  expect(await popup.evaluate((id) => chrome.tabs.getZoom(id), tabId)).toBe(1.25);
  await capture(page, info, 'recording-browser-zoom-125');
  await popup.evaluate((id) => chrome.tabs.setZoom(id, 1), tabId);
  await page.setViewportSize(primarySizes[0]!);
}

async function recording(
  page: Page,
  popup: Page,
  context: BrowserContext,
  extensionId: string,
  tabId: number,
  c: Composition,
  info: TestInfo
) {
  await recordingStart(page, context, extensionId, info);
  const status = ui(page, 'content.toolbar.video-recording.status');
  const initial = await status.innerText();
  await expect.poll(() => status.innerText()).not.toBe(initial);
  const toolbar = ui(page, 'content.toolbar.root');
  await interfaceFont(toolbar);
  for (const size of primarySizes) {
    await page.setViewportSize(size);
    await inside(toolbar, page);
    await capture(page, info, `recording-${size.width}x${size.height}`);
  }
  await page.setViewportSize(primarySizes[0]!);
  const pause = ui(page, 'content.toolbar.video-recording.pause');
  await canonicalCommand(pause);
  await expect.soft(pause).toHaveCSS('width', '32px');
  await pause.click();
  const resume = ui(page, 'content.toolbar.video-recording.resume');
  await expect(resume).toBeVisible();
  await expect.soft(resume).toHaveCSS('width', '32px');
  await expect.soft(resume).toHaveCSS('height', '32px');
  expect(await resume.evaluate((node) => node.matches(':focus-visible'))).toBe(false);
  await tabTo(page, resume);
  await page.keyboard.press('Tab');
  await keyboardPaint(ui(page, 'content.toolbar.video-recording.stop'));
  await page.keyboard.press('Shift+Tab');
  await keyboardPaint(resume);
  await capture(page, info, 'recording-keyboard-focus');
  await resume.press('Space');
  await expect(pause).toBeVisible();
  await recordingMenus(page, c, info);
  await drawing(page, info);
  if (c.locale === 'ru' && c.theme === 'dark')
    await recordingAdaptation(page, popup, tabId, c, info);
  await ui(page, 'content.toolbar.video-recording.stop').click();
  await expect(pause).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() =>
      popup.evaluate(async () => {
        const result = await chrome.runtime.sendMessage({
          type: 'GET_RECORDING_STATE',
          __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
        });
        return {
          status: result.state?.status,
          saved: typeof result.postRecordResult?.recordingId === 'string',
        };
      })
    )
    .toEqual({ status: 'IDLE', saved: true });
}

for (const family of ['scenario', 'video'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      const c = { locale, theme };
      test(`content recorder ${family} ${locale} ${theme} compositions`, async ({}, info) => {
        const host = await startHostServer();
        let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
        let source: Page | undefined;
        try {
          launched = await launchExtensionBrowser({ viewport: primarySizes[0]! });
          launched.context.setDefaultTimeout(10_000);
          await configure(launched.context, launched.extensionId, c);
          const opened = await admit(launched.context, launched.extensionId, host.origin);
          source = opened.page;
          const authored = await source.locator('h1').evaluate((node) => {
            const css = getComputedStyle(node);
            return { font: css.fontFamily, size: css.fontSize, line: css.lineHeight };
          });
          if (family === 'scenario')
            await scenario(source, opened.popup, launched.context, launched.extensionId, c, info);
          else
            await recording(
              source,
              opened.popup,
              launched.context,
              launched.extensionId,
              opened.tabId,
              c,
              info
            );
          expect(
            await source.locator('h1').evaluate((node) => {
              const css = getComputedStyle(node);
              return { font: css.fontFamily, size: css.fontSize, line: css.lineHeight };
            })
          ).toEqual(authored);
        } catch (error) {
          if (source && !source.isClosed()) {
            await source
              .screenshot({ path: info.outputPath('failure-ui.png'), fullPage: false })
              .catch(() => undefined);
            await writeFile(
              info.outputPath('failure-focus.json'),
              JSON.stringify(
                await source.evaluate(() => {
                  let node = document.activeElement;
                  while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
                  return {
                    tag: node?.tagName,
                    label: node?.getAttribute('aria-label'),
                    text: node?.textContent?.trim(),
                  };
                }),
                null,
                2
              )
            );
          }
          throw error;
        } finally {
          if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
          await new Promise<void>((resolve, reject) =>
            host.server.close((error) => (error ? reject(error) : resolve()))
          );
        }
      });
    }
  }
}
