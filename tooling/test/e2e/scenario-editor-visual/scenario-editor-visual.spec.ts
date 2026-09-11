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
