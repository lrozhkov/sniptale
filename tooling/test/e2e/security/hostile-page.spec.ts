import { test, expect } from '../support/extension-fixture';
import {
  grantAllSitesAccessFromSettings,
  openRealExtensionPage,
  POPUP_PATH,
  revokeAllSitesAccessFromSettings,
  saveWebSnapshotThroughPopup,
  SETTINGS_PATH,
} from './support';

test('hostile markup stays inert through capture, persistence, and the real viewer', async ({
  context,
  extensionId,
  hostOrigin,
  hostRequests,
}) => {
  const dialogs: string[] = [];
  context.on('page', (opened) =>
    opened.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    })
  );
  const settings = await openRealExtensionPage(
    context,
    extensionId,
    `${SETTINGS_PATH}?section=access-data`
  );
  await grantAllSitesAccessFromSettings(settings);

  const hostile = await context.newPage();
  await hostile.goto(`${hostOrigin}/fixtures/hostile-page.html`);
  hostile.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const requestOffset = hostRequests.length;
  await expect(hostile.getByTestId('hostile-page')).toContainText('Safe retained text');

  const popup = await openRealExtensionPage(context, extensionId, POPUP_PATH);
  const tabId = await popup.evaluate(async (targetUrl) => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find((candidate) => candidate.url === targetUrl);
    if (target?.id === undefined) throw new Error('Hostile target tab is unavailable');
    return target.id;
  }, hostile.url());
  const result = (await saveWebSnapshotThroughPopup({
    popup,
    requestId: 'security-hostile-snapshot',
    tabId,
  })) as { assetId?: unknown; success?: unknown };
  expect(result.success).toBe(true);
  expect(typeof result.assetId).toBe('string');

  const viewer = await openRealExtensionPage(
    context,
    extensionId,
    `apps/extension/src/web-snapshot-viewer/index.html?snapshotId=${encodeURIComponent(
      result.assetId as string
    )}`
  );
  viewer.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const snapshot = viewer.frameLocator('iframe');
  await expect(snapshot.locator('body')).toContainText('Safe retained text');
  await expect(snapshot.locator('script, iframe')).toHaveCount(0);
  await expect(snapshot.locator('[onerror], [onload], [onclick], [srcdoc]')).toHaveCount(0);
  await expect(snapshot.locator('form')).not.toHaveAttribute('action', /\S/u);
  await expect(
    snapshot.locator('#javascript-link, #data-link, #blob-link, #file-link')
  ).toHaveCount(4);
  for (const selector of ['#javascript-link', '#data-link', '#blob-link', '#file-link']) {
    await expect(snapshot.locator(selector)).not.toHaveAttribute(
      'href',
      /^(?:blob|data|file|javascript):/u
    );
  }
  await expect(snapshot.locator('#safe-link, #redirect-link')).toHaveCount(2);
  await expect(snapshot.locator('#safe-link')).not.toHaveAttribute('href', /\S/u);
  await expect(snapshot.locator('#redirect-link')).not.toHaveAttribute('href', /\S/u);
  const frameUrlBeforeClick = viewer
    .frames()
    .find((frame) => frame !== viewer.mainFrame())
    ?.url();
  const pageCountBeforeClick = context.pages().length;
  await snapshot.locator('form button').click();
  await snapshot.locator('#safe-link').click();
  await snapshot.locator('#redirect-link').click();
  expect(
    viewer
      .frames()
      .find((frame) => frame !== viewer.mainFrame())
      ?.url()
  ).toBe(frameUrlBeforeClick);
  expect(await hostile.evaluate(() => '__sniptaleXssSentinel' in globalThis)).toBe(false);
  expect(await viewer.evaluate(() => '__sniptaleXssSentinel' in globalThis)).toBe(false);
  expect(dialogs).toEqual([]);
  expect(hostRequests.slice(requestOffset).some((path) => path.includes('/xss-beacon'))).toBe(
    false
  );
  expect(
    hostRequests.slice(requestOffset).some((path) => path.includes('/redirect-to-hostile-origin'))
  ).toBe(false);
  expect(context.pages()).toHaveLength(pageCountBeforeClick);

  await revokeAllSitesAccessFromSettings(settings);
  await viewer.close();
  await popup.close();
  await hostile.close();
  await settings.close();
});
