import { expect, type Page } from '@playwright/test';
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
  await page.locator('main > label input').fill('Renamed independent guide');
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
  await expect(page.locator('main > label input')).toHaveValue('Renamed independent guide');
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
