import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';

async function chooseAppearance(scope: Page | Locator, field: string, option: string) {
  const select = scope
    .getByRole('button', { name: field, exact: true })
    .and(scope.locator('[aria-haspopup="listbox"]'));
  if (await select.count()) {
    await select.click();
    const page = 'page' in scope ? scope.page() : scope;
    await page.getByRole('option', { name: option, exact: true }).click();
  } else
    await scope
      .getByRole('group', { name: field, exact: true })
      .getByRole('button', { name: option, exact: true })
      .click();
}

async function openDefaults(page: Page) {
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.locator('.guide-page-header .guide-action-menu-anchor button').click();
  await page.getByRole('button', { name: 'Guide appearance', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return page.locator('#guide-inspector-panel');
}

/** Defaults are one reversible edit; step overrides retain untouched inheritance. */
export async function verifyGuideAppearance(page: Page, testInfo: TestInfo): Promise<void> {
  const step = page.locator('article#compare');
  const frames = step.locator('.guide-image-frame');
  await page.getByRole('button', { name: 'Show all settings', exact: true }).click();
  const inherited = page.getByRole('button', { name: 'Use guide appearance', exact: true });
  if (await inherited.isEnabled()) await inherited.click();
  await chooseAppearance(page, 'Step layout', 'Side by side');
  await expect(step).toHaveAttribute('data-layout', 'side-by-side');
  await chooseAppearance(page, 'Step layout', 'Comparison');
  await expect(frames).toHaveCount(2);
  const first = await frames.nth(0).boundingBox();
  const second = await frames.nth(1).boundingBox();
  if (!first || !second) throw new Error('Missing comparison images');
  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(Math.abs(second.y - first.y)).toBeLessThan(2);
  let dialog = await openDefaults(page);
  await chooseAppearance(dialog, 'Paper theme', 'Graphite');
  await expect(step).toHaveCSS('background-color', 'rgb(36, 38, 43)');
  await chooseAppearance(dialog, 'Font', 'Serif');
  await chooseAppearance(dialog, 'Spacing', 'Compact');
  await chooseAppearance(dialog, 'Content width', 'Wide');
  await chooseAppearance(dialog, 'Image border', 'Strong');
  await chooseAppearance(dialog, 'Number style', 'Plain');
  await testInfo.attach('guide-default-appearance', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await expect(step).toHaveCSS('background-color', 'rgb(36, 38, 43)');
  await expect(step).toHaveCSS('font-family', /Georgia/);
  await step.locator('.guide-step-title').focus();
  await chooseAppearance(page, 'Paper theme', 'Warm');
  dialog = await openDefaults(page);
  await dialog.getByRole('button', { name: 'Apply to all steps', exact: true }).click();
  await expect(step).toHaveCSS('background-color', 'rgb(36, 38, 43)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(step).toHaveCSS('background-color', 'rgb(255, 250, 240)');
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
      return !!a && !!b && b.x >= a.x + a.width && Math.abs(a.y - b.y) < 2;
    })
    .toBe(true);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const url = new URL(page.url());
  url.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await expect(step).toHaveAttribute('data-layout', 'comparison');
  await expect(step).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await expect(frames).toHaveCount(2);
}
