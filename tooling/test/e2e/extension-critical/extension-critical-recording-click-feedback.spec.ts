import { expect, test } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test.setTimeout(60000);

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`recording click feedback excludes selection and drag ${name}`, async ({}, info) => {
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: size });
    try {
      const { page, popup } = await openDesignReview(
        launched.context,
        launched.extensionId,
        host.origin,
        size
      );
      await popup.evaluate(
        async ({ defaults, dark }) => {
          await chrome.storage.local.set({
            sniptale_video_settings: {
              ...defaults,
              microphoneEnabled: false,
              webcamEnabled: false,
              countdownSeconds: 0,
            },
            'sniptale-theme-preference': dark ? 'dark' : 'light',
          });
        },
        { defaults: DEFAULT_VIDEO_SETTINGS, dark: size.width === 1920 }
      );
      await page.bringToFront();
      await page.evaluate(() => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:24px;position:fixed;right:24px;bottom:24px';
        for (const id of ['drag-source', 'drag-target']) {
          const element = document.createElement('div');
          element.id = id;
          element.textContent = id;
          element.style.cssText = 'padding:16px;border:1px solid gray';
          row.append(element);
        }
        const source = row.firstElementChild;
        const target = row.lastElementChild;
        if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement))
          throw new Error('Missing drag fixture');
        source.draggable = true;
        source.addEventListener('dragstart', (event) =>
          event.dataTransfer?.setData('text/plain', 'item')
        );
        target.addEventListener('dragover', (event) => event.preventDefault());
        target.addEventListener('drop', (event) => {
          event.preventDefault();
          target.textContent = 'Dropped';
        });
        document.body.append(row);
      });
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      await page.locator('[data-ui="content.toolbar.video-recording.spotlight"]').click();
      await page.locator('[data-ui="content.toolbar.video-recording.spotlight-click"]').click();
      await page.keyboard.press('Escape');
      const action = page.getByRole('button', { name: 'Host action', exact: true });
      const ripple = page.locator('[data-ui="content.video-recording.spotlight-click"]');
      await action.click();
      await expect(ripple).toHaveCount(1);
      const firstClick = (await ripple.elementHandle())!;
      const title = (await page.getByTestId('host-page-title').boundingBox())!;
      await page.mouse.move(title.x + 2, title.y + title.height / 2);
      await page.mouse.down();
      await page.mouse.move(title.x + 150, title.y + title.height / 2, { steps: 8 });
      await page.mouse.up();
      expect(await page.evaluate(() => document.getSelection()?.toString())).toBeTruthy();
      expect(await firstClick.evaluate((element) => element.isConnected)).toBe(true);
      await expect
        .poll(() =>
          ripple.evaluate((element) =>
            element.getAnimations().every((animation) => animation.playState === 'finished')
          )
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('selection-without-click-ripple.png'),
        fullPage: false,
      });
      await action.click();
      await expect.poll(() => firstClick.evaluate((element) => element.isConnected)).toBe(false);
      const beforeDrag = (await ripple.elementHandle())!;
      expect(
        await page.locator('#drag-target').evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return (
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element
          );
        })
      ).toBe(true);
      await page.locator('#drag-source').dragTo(page.locator('#drag-target'));
      await expect(page.locator('#drag-target')).toHaveText('Dropped');
      expect(await beforeDrag.evaluate((element) => element.isConnected)).toBe(true);
      await action.click();
      await expect.poll(() => beforeDrag.evaluate((element) => element.isConnected)).toBe(false);
      await expect(page.getByTestId('host-action-status')).toHaveText('Clicked 3 times');
    } finally {
      await closeExtensionBrowser(launched);
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
