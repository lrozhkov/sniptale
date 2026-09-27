import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';

test('timed selection freezes a busy large page and leaves annotation frames responsive', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(hostOrigin);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  const tabId = await popup.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url === `${origin}/`);
    if (tab?.id === undefined) throw new Error('Host tab not found');
    return tab.id;
  }, hostOrigin);

  await popup.evaluate((origin) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant test origin';
    grant.onclick = async () => {
      (window as typeof window & { testGrant?: boolean }).testGrant =
        await chrome.permissions.request({ origins: [`${origin}/*`] });
    };
    document.body.append(grant);
  }, hostOrigin);
  await popup.getByRole('button', { name: 'Grant test origin' }).click();
  expect(
    await popup.evaluate(() => (window as typeof window & { testGrant?: boolean }).testGrant)
  ).toBe(true);
  await page.reload();
  await popup.reload();
  await popup.evaluate(
    async (targetTabId) => chrome.tabs.update(targetTabId, { active: true }),
    tabId
  );
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      '#frozen-menu { position: fixed; left: 100px; top: 120px; width: 180px; height: 120px; background: red; z-index: 1 }';
    document.head.append(style);
    const menu = document.createElement('button');
    menu.id = 'frozen-menu';
    menu.textContent = 'Frozen menu';
    document.body.append(menu);
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 6_000; index += 1) {
      const item = document.createElement('span');
      item.textContent = `item ${index}`;
      fragment.append(item);
    }
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position: absolute; top: 2000px';
    offscreen.append(fragment);
    document.body.append(offscreen);
    let tick = 0;
    window.setInterval(() => {
      menu.title = `tooltip ${++tick}`;
      menu.setAttribute('aria-label', `menu ${tick}`);
    }, 20);
  });

  const registration = await popup.evaluate(
    async (targetTabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId: targetTabId,
        __sniptaleRuntimeFreshness: {
          issuedAtEpochMs: Date.now(),
          nonce: crypto.randomUUID(),
        },
      }),
    tabId
  );
  expect(registration).toMatchObject({ success: true, result: 'registered' });
  const enableMode = async (workingMode?: 'highlighter') =>
    popup.evaluate(
      async ({ targetTabId, mode }) =>
        chrome.tabs.sendMessage(targetTabId, {
          type: 'ENABLE_SCREENSHOT_MODE',
          ...(mode ? { workingMode: mode } : {}),
        }),
      { targetTabId: tabId, mode: workingMode }
    );
  expect(await enableMode()).toMatchObject({ success: true });
  await popup.evaluate(
    async (targetTabId) => chrome.tabs.update(targetTabId, { active: true }),
    tabId
  );

  const chooseTimer = async () => {
    await page.locator('[data-ui="content.toolbar.timer-button"]').click();
    await page
      .locator('[data-ui="content.toolbar.timer-menu"]')
      .getByText('3 seconds', { exact: true })
      .click();
  };
  const capture = async (withAnimatedPopup = false) => {
    await chooseTimer();
    await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
    if (withAnimatedPopup) {
      await page.waitForTimeout(1_500);
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent =
          '@keyframes popup-fade-in { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }' +
          '@keyframes popup-background { from { background-color: white } to { background-color: gold } }' +
          '.mwe-popups-fade-in-up { animation: popup-fade-in 8s linear both, popup-background .5s 1.5s linear forwards }';
        document.head.append(style);
        const popup = document.createElement('div');
        popup.className =
          'mwe-popups mwe-popups-type-page mwe-popups-fade-in-up mwe-popups-no-image-pointer mwe-popups-is-tall';
        popup.style.cssText =
          'position:fixed;left:614px;top:535px;width:300px;height:140px;background:white;z-index:10000';
        const link = document.createElement('a');
        link.href = '/wiki/Satire_(film_and_television)';
        link.textContent = 'Satire is a television and film genre';
        popup.append(link);
        document.body.append(popup);
      });
    }
    await expect(page.locator('.sniptale-selection-frozen-frame')).toBeAttached({
      timeout: 15_000,
    });
  };

  await capture(true);
  await expect(page.locator('.sniptale-selection-frozen-frame')).toHaveCSS('cursor', /crosshair/u);
  await expect(page.locator('.sniptale-selection-cancel-button')).toHaveCSS('cursor', 'pointer');
  await expect(page.locator('.sniptale-selection-area-only-hint')).toHaveCount(0);
  await page.mouse.move(650, 550);
  await expect(page.locator('.sniptale-selection-hover-size')).toBeVisible();
  await page.evaluate(() => document.querySelector('#frozen-menu')?.remove());
  await page.mouse.click(150, 170);
  await expect(page.locator('.sniptale-selection-size-confirm-button')).toBeVisible();
  await expect(page.locator('.sniptale-selection-hover-size')).toContainText('180 × 120');
  await page.locator('.sniptale-selection-size-confirm-button').click();
  await expect(page.locator('.sniptale-selection-frozen-frame')).toHaveCount(0);
  await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);

  await page.evaluate(() => {
    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position: absolute; top: 2500px';
    document.body.append(offscreen);
    window.setInterval(() => offscreen.classList.toggle('pulse'), 20);
  });
  expect(await enableMode()).toMatchObject({ success: true });
  await capture();
  await expect(page.locator('.sniptale-selection-frozen-frame')).toHaveCSS('cursor', /crosshair/u);
  await expect(page.locator('.sniptale-selection-area-only-hint')).toBeVisible();
  await expect(page.locator('.sniptale-selection-area-only-hint')).toContainText(
    /(?:Drag to select an area|Потяните, чтобы выделить область)/u
  );
  await page.mouse.move(160, 180);
  await expect(page.locator('.sniptale-selection-hover-size')).toBeHidden();
  await page.mouse.click(160, 180);
  await expect(page.locator('.sniptale-selection-size-confirm-button')).toHaveCount(0);
  await page.mouse.move(120, 140);
  await page.mouse.down();
  await page.mouse.move(320, 260, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.sniptale-selection-size-confirm-button')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sniptale-selection-frozen-frame')).toHaveCount(0);
  await expect(page.locator('.sniptale-selection-area-only-hint')).toHaveCount(0);
  await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);

  expect(await enableMode()).toMatchObject({ success: true });
  await capture();
  await page.mouse.move(120, 140);
  await page.mouse.down();
  await page.mouse.move(320, 260, { steps: 4 });
  await page.mouse.up();
  await page.locator('.sniptale-selection-size-confirm-button').click();
  await expect(page.locator('.sniptale-selection-frozen-frame')).toHaveCount(0);
  await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);

  expect(await enableMode('highlighter')).toMatchObject({ success: true });
  await expect(page.locator('[data-ui="content.toolbar.future-frame-style"]')).toBeAttached();
  const hostButton = await page.getByRole('button', { name: 'Host action' }).boundingBox();
  if (!hostButton) throw new Error('Host action position unavailable');
  await page.mouse.click(hostButton.x + hostButton.width / 2, hostButton.y + hostButton.height / 2);
  await expect(page.locator('.sniptale-frame-container').first()).toBeAttached();
  await popup.close();
  await page.close();
});
