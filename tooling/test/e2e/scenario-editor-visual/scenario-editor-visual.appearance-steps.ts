import { readFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';

async function chooseAppearance(page: Page, field: string, option: string) {
  await page.getByRole('button', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Actual grid geometry, portable file exchange and saved appearance share the user path. */
export async function verifyGuideAppearance(page: Page, testInfo: TestInfo): Promise<void> {
  const step = page.locator('article#compare');
  const frames = step.locator('.guide-image-frame');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  const inherited = page.getByRole('button', { name: 'Use guide appearance', exact: true });
  if (await inherited.count()) await inherited.click();
  await chooseAppearance(page, 'Step layout', 'Side by side');
  await expect(step).toHaveAttribute('data-layout', 'side-by-side');
  await expect(frames).toHaveCount(2);
  await chooseAppearance(page, 'Step layout', 'Comparison');
  await expect(step).toHaveAttribute('data-layout', 'comparison');
  const first = await frames.nth(0).boundingBox();
  const second = await frames.nth(1).boundingBox();
  if (!first || !second) throw new Error('Missing comparison images');
  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(Math.abs(second.y - first.y)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Whole guide', exact: true }).click();
  await chooseAppearance(page, 'Paper theme', 'Graphite');
  await chooseAppearance(page, 'Font', 'Serif');
  await chooseAppearance(page, 'Spacing', 'Compact');
  await chooseAppearance(page, 'Content width', 'Wide');
  await chooseAppearance(page, 'Image border', 'Strong');
  await chooseAppearance(page, 'Number style', 'Plain');
  await expect(step).toHaveCSS('background-color', 'rgb(36, 38, 43)');
  await expect(step).toHaveCSS('font-family', /Georgia/);
  await page.getByRole('button', { name: 'This step', exact: true }).click();
  await page.getByRole('button', { name: 'Customize this step', exact: true }).click();
  await chooseAppearance(page, 'Paper theme', 'Warm');
  await testInfo.attach('guide-appearance-controls', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page
    .getByRole('textbox', { name: 'Template name', exact: true })
    .fill('Reusable appearance');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download template', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  if (!path) throw new Error('Missing downloaded template');
  const bytes = await readFile(path);
  const portable = JSON.parse(bytes.toString('utf8'));
  expect(Object.keys(portable).sort()).toEqual([
    'format',
    'layout',
    'name',
    'showNumber',
    'style',
    'version',
  ]);
  expect(portable).toMatchObject({
    format: 'sniptale-guide-template',
    version: 1,
    name: 'Reusable appearance',
    layout: 'comparison',
  });
  expect(Object.keys(portable.style).sort()).toEqual([
    'accentColor',
    'contentWidth',
    'density',
    'font',
    'imageBorder',
    'numberStyle',
    'theme',
  ]);
  expect(bytes.toString('utf8')).not.toContain('Compare two images');
  expect(bytes.toString('utf8')).not.toContain('assetId');
  await chooseAppearance(page, 'Step layout', 'Text focused');
  await expect(frames).toHaveCount(2);
  await page.getByRole('button', { name: 'Use guide appearance', exact: true }).click();
  await expect(step).toHaveCSS('background-color', 'rgb(36, 38, 43)');
  await page
    .locator('.guide-template-files input[type="file"]')
    .setInputFiles({ name: 'look.json', mimeType: 'application/json', buffer: bytes });
  await expect(step).toHaveAttribute('data-layout', 'comparison');
  await expect(step).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(step).toHaveAttribute('data-layout', 'text');
  await expect(step).toHaveCSS('background-color', 'rgb(36, 38, 43)');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(step).toHaveAttribute('data-layout', 'comparison');
  await expect(frames.first()).toHaveCSS('border-top-width', '3px');
  await testInfo.attach('guide-comparison-appearance', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  const inspectorDivider = page.getByRole('separator', { name: 'Inspector', exact: true });
  await inspectorDivider.focus();
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowLeft');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect
    .poll(async () => {
      const a = await frames.nth(0).boundingBox();
      const b = await frames.nth(1).boundingBox();
      return (
        !!a && !!b && Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 2 && b.y >= a.y + a.height
      );
    })
    .toBe(true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const url = new URL(page.url());
  url.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await expect(step).toHaveAttribute('data-layout', 'comparison');
  await expect(step).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await expect(frames).toHaveCount(2);
  await testInfo.attach('guide-appearance-reflow', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}
