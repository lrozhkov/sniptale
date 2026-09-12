import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`guide numbering stays consistent through custom labels, undo and reload in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
    url.searchParams.set('projectId', `numbering-${crypto.randomUUID()}`);
    url.searchParams.set('theme', theme);
    url.searchParams.set('locale', 'en');
    url.searchParams.set('stepId', 'compare');
    await page.goto(url.toString());
    const first = page.locator('article#compare');
    const second = page.locator('article#text-only');
    const firstNumber = first.locator('header > span');
    const secondNumber = second.locator('header > span');
    const outline = page.locator('.guide-outline-number');
    await expect(firstNumber).toHaveText('1');
    await page.getByRole('checkbox', { name: 'Show step number', exact: true }).uncheck();
    await expect(firstNumber).toHaveCount(0);
    await expect(secondNumber).toHaveText('1');
    await expect(outline.nth(1)).toHaveText('');
    await expect(outline.nth(2)).toHaveText('1');
    await page.getByRole('checkbox', { name: 'Show step number', exact: true }).check();
    await second.getByRole('textbox', { name: 'Step title', exact: true }).focus();
    await page.getByRole('checkbox', { name: 'Restart numbering', exact: true }).check();
    await expect(secondNumber).toHaveText('1');
    await page.getByRole('spinbutton', { name: 'Start at', exact: true }).fill('7');
    await expect(secondNumber).toHaveText('7');
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('A.1');
    await expect(secondNumber).toHaveText('A.1');
    await expect(outline.nth(2)).toHaveText('A.1');
    await expect(page.getByLabel('Next automatic number', { exact: true })).toHaveText('7');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(secondNumber).toHaveText('7');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(secondNumber).toHaveText('A.1');
    await testInfo.attach(`numbering-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('link', { name: 'Introduction', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Restart numbering', exact: true }).check();
    await page.getByRole('spinbutton', { name: 'Start at', exact: true }).fill('3');
    await expect(firstNumber).toHaveText('3');
    await expect(secondNumber).toHaveText('A.1');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(url.toString());
    await expect(firstNumber).toHaveText('3');
    await expect(secondNumber).toHaveText('A.1');
    await expect(outline.nth(1)).toHaveText('3');
    await expect(outline.nth(2)).toHaveText('A.1');
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('W'.repeat(32));
    await page.setViewportSize({ width: 1024, height: 640 });
    await first.locator('header').scrollIntoViewIfNeeded();
    const headerWidth = (await first.locator('header').boundingBox())!.width;
    expect((await firstNumber.boundingBox())!.width).toBeLessThanOrEqual(headerWidth * 0.41);
    await expect(firstNumber).toHaveText('W'.repeat(32));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('');
    await expect(firstNumber).toHaveText('3');
    await second.getByRole('textbox', { name: 'Step title', exact: true }).focus();
    await page.getByRole('checkbox', { name: 'Restart numbering', exact: true }).uncheck();
    await expect(secondNumber).toHaveText('A.1');
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('');
    await expect(secondNumber).toHaveText('4');
    await page.getByRole('link', { name: 'Introduction', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Restart numbering', exact: true }).uncheck();
    await expect(firstNumber).toHaveText('1');
    await expect(secondNumber).toHaveText('2');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(url.toString());
    await expect(firstNumber).toHaveText('1');
    await expect(secondNumber).toHaveText('2');
  });
}
