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
