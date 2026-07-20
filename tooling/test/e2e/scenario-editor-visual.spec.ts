import { SCENARIO_VISUAL_BASELINE_SLIDE_IDS } from '../../../apps/extension/src/scenario-editor/workspace/visual-baseline/fixtures';
import { test } from './support/extension-fixture';
import {
  assertVisualAcceptance,
  createPageIssueCollector,
  openVisualHarness,
  SCENARIO_VISUAL_SURFACES,
  SCENARIO_VISUAL_THEMES,
  SCENARIO_VISUAL_VIEWPORTS,
  selectSurfaceMode,
  waitForScenarioVisualStability,
} from './scenario-editor-visual.helpers';
import {
  captureShellScreenshot,
  captureSurfaceScreenshot,
  captureTextWeightRow,
  verifyAiPanelOpen,
  verifyDefaultFloatingLayout,
  verifyElementColorPalette,
  verifyElementCompactControls,
  verifyEmptyViewportSlide,
  verifyExportToolOpen,
  verifyInspectorCollapsed,
  verifyInsertTextAction,
  verifySplitResized,
  verifyTemplatePickerOpen,
  verifyTextCompactControls,
} from './scenario-editor-visual.state-steps';

test.setTimeout(180_000);

test('scenario editor shell visual harness captures editor layout at required viewports', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);

  for (const viewport of SCENARIO_VISUAL_VIEWPORTS) {
    await openVisualHarness(
      page,
      hostOrigin,
      'light',
      viewport.size,
      SCENARIO_VISUAL_SURFACES[0]!.slideId
    );
    await selectSurfaceMode(page, 'editor');
    await page.locator('[data-ui="scenario.inspector.panel"]').waitFor({ state: 'visible' });
    await page.locator('[data-ui="scenario.canvas.stage"]').waitFor({ state: 'visible' });
    await page.locator('[data-ui="scenario.slide-rail.panel"]').waitFor({ state: 'visible' });
    issues.assertClean();
    await captureShellScreenshot(page, testInfo, viewport.name);
  }
});

test('scenario editor visual states cover floating panel layout controls', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  const slideId = SCENARIO_VISUAL_BASELINE_SLIDE_IDS.capturedApp;

  await verifyDefaultFloatingLayout(page, hostOrigin, slideId, testInfo, issues);
  await verifyElementCompactControls(page, testInfo);
  await verifyElementColorPalette(page, testInfo);
  await verifyInsertTextAction(page, hostOrigin, slideId, testInfo, issues);
  await verifyTemplatePickerOpen(page, hostOrigin, slideId, testInfo, issues);
  await verifyExportToolOpen(page, hostOrigin, slideId, testInfo, issues);
  await verifyInspectorCollapsed(page, hostOrigin, slideId, testInfo, issues);
  await verifySplitResized(page, hostOrigin, slideId, testInfo, issues);
  await verifyEmptyViewportSlide(page, hostOrigin, testInfo, issues);
  await verifyTextCompactControls(page, testInfo);
  await captureTextWeightRow(page, testInfo);
  await verifyAiPanelOpen(page, hostOrigin, slideId, testInfo, issues);
});

test('scenario editor visual baseline captures editor, play, presenter, and overview states', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);

  for (const viewport of SCENARIO_VISUAL_VIEWPORTS) {
    for (const theme of SCENARIO_VISUAL_THEMES) {
      for (const surface of SCENARIO_VISUAL_SURFACES) {
        await openVisualHarness(page, hostOrigin, theme, viewport.size, surface.slideId);
        await selectSurfaceMode(page, surface.name);
        await waitForScenarioVisualStability(page);
        issues.assertClean();
        await assertVisualAcceptance(page);
        await captureSurfaceScreenshot(page, testInfo, theme, viewport.name, surface);
      }
    }
  }
});
