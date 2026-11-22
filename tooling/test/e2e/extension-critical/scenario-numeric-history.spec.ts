import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Scenario numeric holds preserve separate history actions ${viewport.name}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize(viewport.size);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(
        `${host.origin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}?projectId=numeric-history&locale=en&tourFixture=1`
      );
      const title = page.getByRole('textbox', { name: 'Scenario', exact: true });
      const originalTitle = await title.inputValue();
      await title.fill(`${originalTitle} A`);
      await title.click();
      await title.fill(`${originalTitle} AB`);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(title).toHaveValue(originalTitle);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect(title).toHaveValue(`${originalTitle} AB`);
      await page.getByRole('link', { name: 'Compare two images', exact: true }).click();
      await page.getByRole('button', { name: 'Numbering', exact: true }).click();
      await page.getByRole('switch', { name: 'Restart numbering', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'Start at', exact: true });
      const increase = page.getByRole('button', { name: 'Start at increase', exact: true });
      const undo = page.getByRole('button', { name: 'Undo', exact: true });
      const redo = page.getByRole('button', { name: 'Redo', exact: true });
      await expect(input).toHaveValue('1');
      await input.hover();
      await increase.hover();
      await page.mouse.down();
      await expect.poll(async () => Number(await input.inputValue())).toBeGreaterThanOrEqual(4);
      await page.mouse.up();
      const first = Number(await input.inputValue());
      await input.hover();
      await increase.hover();
      await page.mouse.down();
      await page.mouse.up();
      await expect(input).toHaveValue(String(first + 1));
      await undo.click();
      await expect(input).toHaveValue(String(first));
      await undo.click();
      await expect(input).toHaveValue('1');
      await redo.click();
      await expect(input).toHaveValue(String(first));
      await redo.click();
      await expect(input).toHaveValue(String(first + 1));
      await input.hover();
      await increase.hover();
      await page.mouse.down();
      await expect.poll(async () => Number(await input.inputValue())).toBeGreaterThan(first + 2);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(input).toHaveValue(String(first + 1));
      await undo.click();
      await expect(input).toHaveValue(String(first));
      await input.hover();
      await increase.hover();
      await page.mouse.down();
      await page.mouse.up();
      await expect(input).toHaveValue(String(first + 1));
      await expect(redo).toBeDisabled();
      await undo.click();
      await expect(input).toHaveValue(String(first));
      await page.screenshot({
        path: info.outputPath('scenario-numeric-history.png'),
        fullPage: false,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
