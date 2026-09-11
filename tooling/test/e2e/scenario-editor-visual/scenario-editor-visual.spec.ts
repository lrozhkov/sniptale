import { expect } from '@playwright/test';
import { verifyGuideAppearance } from './scenario-editor-visual.appearance-steps';
import { test } from '../support/extension-fixture';
import { assertVisualAcceptance } from './scenario-editor-visual.assertions';
import {
  createPageIssueCollector,
  openVisualHarness,
  SCENARIO_VISUAL_THEMES,
  SCENARIO_VISUAL_LOCALES,
  SCENARIO_VISUAL_VIEWPORTS,
} from './scenario-editor-visual.helpers';
import {
  verifyImageImport,
  verifySavedVersionHistory,
  verifyResourceRetention,
  verifyImageEditorRoundtrip,
  verifyImageFraming,
  verifyIndependentProjectCopy,
  verifyGuideComposition,
  verifySaveAndReopen,
  verifyStepNavigation,
  verifyWorkspacePanelsAndFocus,
} from './scenario-editor-visual.state-steps';

test.setTimeout(180_000);

for (const theme of SCENARIO_VISUAL_THEMES)
  for (const locale of SCENARIO_VISUAL_LOCALES) {
    test(`local guide renders ordered blocks in ${theme} theme and ${locale} locale`, async ({
      page,
      hostOrigin,
    }, testInfo) => {
      const issues = createPageIssueCollector(page);
      for (const viewport of SCENARIO_VISUAL_VIEWPORTS) {
        await openVisualHarness(page, hostOrigin, theme, locale, viewport.size);
        await assertVisualAcceptance(page);
        await testInfo.attach(`guide-${theme}-${locale}-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        issues.assertClean();
      }
    });
  }

test('guide navigation and edits survive a real local save and reopen', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 720 });
  await verifyStepNavigation(page);
  await verifySaveAndReopen(page);
  await assertVisualAcceptance(page);
  issues.assertClean();
});

test('workspace navigation preserves field focus and primary actions at enlarged text', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1024, height: 640 });
  await verifyWorkspacePanelsAndFocus(page);
  issues.assertClean();
});

test('project copies preserve unsaved content and images after deleting the original', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 720 });
  await verifyIndependentProjectCopy(page);
  issues.assertClean();
});

test('guide blocks, sections and reversible structural edits survive saving and reopening', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  await verifyGuideComposition(page);
  issues.assertClean();
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`ordered local image import remains undoable in ${theme} theme`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    await verifyImageImport(page, testInfo);
    issues.assertClean();
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`image geometry survives pointer editing and reopening in ${theme} theme`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1024, height: 640 });
    await verifyImageFraming(page, testInfo);
    issues.assertClean();
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`image editor apply and cancel preserve a local guide through a real extension iframe in ${theme}`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, `chrome-extension://${extensionId}`, theme, 'en', {
      width: 1280,
      height: 900,
    });
    await verifyImageEditorRoundtrip(page, testInfo);
    issues.assertClean();
  });
}

test('ordinary undo reopens previous saved states and publishes reversibly', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  await verifySavedVersionHistory(page, testInfo);
  issues.assertClean();
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`guide layouts and portable appearance templates preserve images in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    await verifyGuideAppearance(page, testInfo);
    issues.assertClean();
  });
}

test('compact header owns panel toggles and dividers resize the workspace', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1920, height: 1080 });
  const header = page.locator('.guide-page-header');
  expect((await header.boundingBox())?.height).toBeLessThanOrEqual(52);
  expect((await page.locator('.guide-project-name').boundingBox())?.width).toBeLessThanOrEqual(280);
  await expect(header.getByRole('button', { name: 'Outline', exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Inspector', exact: true })).toBeVisible();
  await expect(page.locator('.guide-workspace-bar')).toHaveCount(0);
  await page.locator('article#compare').focus();
  await expect(page.locator('article#compare')).toHaveCSS('outline-width', '1px');
  const divider = page.getByRole('separator', { name: 'Outline', exact: true });
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '240');
  expect((await page.locator('#guide-library-panel').boundingBox())?.width).toBeCloseTo(240, 0);
  await header.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(page.locator('#guide-library-panel')).toBeHidden();
  await header.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(divider).toHaveAttribute('aria-valuenow', '240');
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`project menu stays compact and keyboard accessible in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1024, height: 768 });
    const trigger = page.locator('.guide-action-menu-anchor button');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.locator('.guide-action-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('data-theme', theme);
    await expect(
      menu.getByRole('button', { name: 'Duplicate project', exact: true })
    ).toBeFocused();
    const box = await menu.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(240);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1024);
    await testInfo.attach(`project-menu-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('history cleanup preserves two-tab undo resources until sessions close', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  await verifyResourceRetention(page);
  issues.assertClean();
});
