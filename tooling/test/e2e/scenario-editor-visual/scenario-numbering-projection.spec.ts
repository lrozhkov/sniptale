import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import {
  GALLERY_HARNESS_PATH,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

test('library preview uses the saved hidden and custom step numbers from the editor', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1600, height: 1000 });
  const id = `projection-${crypto.randomUUID()}`;
  const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
  url.searchParams.set('projectId', id);
  url.searchParams.set('locale', 'en');
  url.searchParams.set('stepId', 'compare');
  await page.goto(url.toString());
  await page.getByRole('textbox', { name: 'Scenario', exact: true }).fill(id);
  await page.getByRole('checkbox', { name: 'Show step number', exact: true }).uncheck();
  await page
    .locator('article#text-only')
    .getByRole('textbox', { name: 'Step title', exact: true })
    .focus();
  await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('A.1');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`);
  await page.getByRole('button', { name: id, exact: true }).first().click();
  await expect(page.getByText('Step A.1', { exact: true })).toBeVisible();
  await expect(page.getByText('Step 1', { exact: true })).toHaveCount(0);
  await testInfo.attach('gallery-numbering-light', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  issues.assertClean();
});
