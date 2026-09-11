import { expect, type Page, type TestInfo } from '@playwright/test';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';

export async function verifyStepNavigation(page: Page): Promise<void> {
  await expect(page.locator('article#compare')).toBeFocused();
  await page.getByRole('link', { name: 'Text-only step', exact: true }).click();
  await expect(page.locator('article#text-only')).toBeFocused();
  await expect(page).toHaveURL(/stepId=text-only/);
}

export async function verifySaveAndReopen(page: Page): Promise<void> {
  const title = page.locator('article#text-only input');
  await title.fill('Saved local step');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const reopen = new URL(page.url());
  reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  reopen.searchParams.set('locale', 'en');
  await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('article#text-only input')).toHaveValue('Saved local step');
  await expect(page.locator('article#text-only')).toBeFocused();
}

export async function verifyIndependentProjectCopy(page: Page): Promise<void> {
  const original = new URL(page.url());
  original.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  original.searchParams.set('locale', 'en');
  const originalId = original.searchParams.get('projectId');
  const originalTitle = await page.locator('article#text-only input').inputValue();
  await page.locator('article#text-only input').fill('Unsaved content copied');
  await page.getByRole('button', { name: 'Duplicate project', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('projectId')).not.toBe(originalId);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await expect(page.locator('article input').nth(1)).toHaveValue('Unsaved content copied');
  await page
    .getByRole('textbox', { name: 'Scenario', exact: true })
    .fill('Renamed independent guide');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const copied = new URL(page.url());
  copied.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  copied.searchParams.set('locale', 'en');
  await page.goto(original.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('article#text-only input')).toHaveValue(originalTitle);
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('projectId')).toBeNull();
  await page.goto(copied.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    'Renamed independent guide'
  );
  await expect(page.locator('article input').nth(1)).toHaveValue('Unsaved content copied');
  await expect(page.locator('main img')).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator('main img')
        .evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
          )
        )
    )
    .toBe(true);
}

export async function verifyWorkspacePanelsAndFocus(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const resource = page.locator('.guide-resource').first();
  await resource.click();
  await expect(page.locator('article#compare')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('article#compare input')).toBeFocused();
  await page.locator('article#text-only input').focus();
  await expect(page.locator('article#text-only input')).toBeFocused();
  await expect(page.locator('.guide-selection-label')).toContainText('step');
  await page.locator('button[aria-controls="guide-library-panel"]').click();
  await page.locator('button[aria-controls="guide-inspector-panel"]').click();
  await expect(page.locator('#guide-library-panel')).toBeHidden();
  await expect(page.locator('#guide-inspector-panel')).toBeHidden();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator('button[aria-controls="guide-library-panel"]').click();
  await expect(page.locator('#guide-library-panel')).toBeVisible();
  await expect(save).toBeInViewport();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
}

export async function verifyGuideComposition(page: Page): Promise<void> {
  const step = page.locator('article#text-only');
  await step.getByRole('textbox', { name: 'Step title', exact: true }).fill('Flexible step');
  await step.getByRole('button', { name: '+ Text', exact: true }).click();
  await step.getByRole('button', { name: '+ Text', exact: true }).click();
  await step.getByRole('button', { name: '+ Heading', exact: true }).click();
  await step.getByRole('button', { name: '+ Note', exact: true }).click();
  await step.locator('textarea').nth(0).fill('First explanation');
  await step.locator('textarea').nth(1).fill('Second explanation');
  await step.getByRole('textbox', { name: 'Heading', exact: true }).fill('Detail');
  await step.getByRole('textbox', { name: 'Note text', exact: true }).fill('Remember this');
  await page.getByRole('checkbox', { name: 'Show step number', exact: true }).uncheck();
  await expect(step.locator('header span')).toHaveCount(0);
  await step
    .locator('.guide-block')
    .first()
    .getByRole('button', { name: 'Duplicate block', exact: true })
    .click();
  await expect(step.locator('.guide-block')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(step.locator('.guide-block')).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(step.locator('.guide-block')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const heading = step
    .locator('.guide-block')
    .filter({ has: page.getByRole('textbox', { name: 'Heading', exact: true }) });
  await heading.getByRole('button', { name: 'Move up', exact: true }).click();
  await heading.getByRole('button', { name: 'Split step here', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(3);
  await expect(step.locator('.guide-block')).toHaveCount(1);
  await page.getByRole('link', { name: 'Flexible step', exact: true }).click();
  await page
    .locator('.guide-step-actions')
    .getByRole('button', { name: 'Merge with next step', exact: true })
    .click();
  await expect(page.locator('article')).toHaveCount(2);
  await expect(step.locator('.guide-block')).toHaveCount(4);
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByRole('textbox', { name: 'Section title', exact: true }).fill('Finish');
  await page
    .locator('.guide-step-actions')
    .getByRole('button', { name: 'Move up', exact: true })
    .click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const reopen = new URL(page.url());
  reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  reopen.searchParams.set('locale', 'en');
  await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.guide-document section h2').last()).toHaveText('Finish');
  await expect(page.locator('article#text-only .guide-block')).toHaveCount(4);
  await expect(page.locator('article#text-only textarea').first()).toHaveValue('First explanation');
  await expect(page.locator('article#text-only input.guide-block-heading')).toHaveValue('Detail');
  await expect(page.locator('article#text-only header span')).toHaveCount(0);
  await expect(page.locator('.guide-document img')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
}

export async function verifyImageImport(page: Page, testInfo: TestInfo): Promise<void> {
  const before = await page.locator('article').count();
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#2767a5';
    context.fillRect(0, 0, 300, 200);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const image = Buffer.from(encoded, 'base64');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'first-import.png', mimeType: 'image/png', buffer: image },
    { name: 'second-import.png', mimeType: 'image/png', buffer: image },
  ]);
  await page
    .getByRole('list', { name: 'Import order' })
    .locator('li')
    .nth(1)
    .getByRole('button', { name: 'Move up', exact: true })
    .click();
  await testInfo.attach('image-import-selection', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Import selected', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await expect(page.locator('article')).toHaveCount(before + 2);
  await expect(page.locator('article').nth(before).locator('header input')).toHaveValue(
    'second-import.png'
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const reopen = new URL(page.url());
  reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  reopen.searchParams.set('locale', 'en');
  await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('article')).toHaveCount(before + 2);
  const raster = page.locator('article').nth(before).locator('img');
  await expect(raster).toBeVisible();
  await expect
    .poll(() =>
      raster.evaluate(
        (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0
      )
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(0);
}
