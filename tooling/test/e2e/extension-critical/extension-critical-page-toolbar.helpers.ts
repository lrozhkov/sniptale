import { expect } from '../support/extension-fixture';
import type { BrowserContext } from '@playwright/test';

export async function openDesignReview(
  context: BrowserContext,
  extensionId: string,
  hostOrigin: string
) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
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
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${origin}/*`] })
      );
    };
    document.body.append(grant);
  }, hostOrigin);
  await popup.getByRole('button', { name: 'Grant test origin' }).click();
  await expect(popup.getByRole('button', { name: 'Grant test origin' })).toHaveAttribute(
    'data-granted',
    'true'
  );
  await page.reload();
  const registered = await popup.evaluate(
    async (targetTabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId: targetTabId,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      }),
    tabId
  );
  expect(registered).toMatchObject({ success: true, result: 'registered' });
  const enabled = await popup.evaluate(
    async (targetTabId) =>
      chrome.tabs.sendMessage(targetTabId, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode: 'design-review',
      }),
    tabId
  );
  expect(enabled).toMatchObject({ success: true });
  await page.bringToFront();
  await page.evaluate(() => {
    const parent = document.createElement('section');
    parent.style.cssText = 'position:absolute;left:100px;top:300px;width:400px;height:240px';
    const target = document.createElement('button');
    target.id = 'measurement-target';
    target.textContent = 'Measure this';
    target.style.cssText = 'position:absolute;left:40px;top:50px;width:100px;height:40px';
    const sibling = document.createElement('div');
    sibling.textContent = 'Neighbor';
    sibling.style.cssText = 'position:absolute;left:200px;top:50px;width:100px;height:40px';
    parent.append(target, sibling);
    document.body.append(parent);
  });
  return { page, popup };
}
