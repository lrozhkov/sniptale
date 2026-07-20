import { mkdir } from 'node:fs/promises';
import { type Locator, type Page, type TestInfo } from '@playwright/test';
import { SCENARIO_VISUAL_BASELINE_SLIDE_IDS } from '../../../apps/extension/src/scenario-editor/workspace/visual-baseline/fixtures';
import { translate } from '../../../apps/extension/src/platform/i18n';
import {
  assertAiPanelKeepsCompactHeight,
  assertCompactRangesSitOnRowBorder,
  assertFloatingPanelPlacement,
  assertInspectorPanelFitsContent,
  assertScenarioColorPaletteHasSwatches,
} from './scenario-editor-visual.floating-assertions';
import {
  assertVisualAcceptance,
  createPageIssueCollector,
  openVisualHarness,
  SCENARIO_VISUAL_VIEWPORTS,
  selectSurfaceMode,
  waitForScenarioVisualStability,
  type ThemeName,
  type VisualSurfaceCase,
} from './scenario-editor-visual.helpers';

const DESKTOP_VIEWPORT = SCENARIO_VISUAL_VIEWPORTS.find((viewport) => viewport.name === 'desktop')!;
type PageIssueCollector = ReturnType<typeof createPageIssueCollector>;

async function openDesktopEditorState(
  page: Page,
  hostOrigin: string,
  slideId: string
): Promise<void> {
  await openVisualHarness(page, hostOrigin, 'dark', DESKTOP_VIEWPORT.size, slideId);
  await selectSurfaceMode(page, 'editor');
  await waitForScenarioVisualStability(page);
}

async function assertCleanFloatingState(page: Page, issues: PageIssueCollector): Promise<void> {
  issues.assertClean();
  await assertFloatingPanelPlacement(page);
  await assertVisualAcceptance(page);
}

export async function verifyDefaultFloatingLayout(
  page: Page,
  hostOrigin: string,
  slideId: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, slideId);
  await assertCleanFloatingState(page, issues);
  await captureStateScreenshot(page, testInfo, 'default-floating-layout');
}

export async function verifyElementCompactControls(page: Page, testInfo: TestInfo): Promise<void> {
  await selectFirstInspectorLayer(page);
  await assertInspectorPanelFitsContent(page);
  await assertCompactRangesSitOnRowBorder(page);
  await assertVisualAcceptance(page);
  await captureStateScreenshot(page, testInfo, 'element-compact-controls');
}

export async function verifyElementColorPalette(page: Page, testInfo: TestInfo): Promise<void> {
  await page
    .locator('[data-ui="scenario.inspector.parameters"]')
    .locator('[data-ui="shared.ui.color-selector.palette-trigger"]')
    .first()
    .click();
  await page.locator('[data-ui="shared.ui.color-selector.expanded-layer"]').waitFor({
    state: 'visible',
  });
  await assertScenarioColorPaletteHasSwatches(page);
  await assertVisualAcceptance(page);
  await captureStateScreenshot(page, testInfo, 'element-color-palette-open');
}

export async function verifyInsertTextAction(
  page: Page,
  hostOrigin: string,
  slideId: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, slideId);
  await clickInsertPanelButton(page, translate('scenario.editor.insertText', 'ru'));
  await page.locator('[data-ui="scenario.inspector.parameters"] textarea').first().waitFor({
    state: 'visible',
  });
  await assertCleanFloatingState(page, issues);
  await captureStateScreenshot(page, testInfo, 'insert-text-action');
}

export async function verifyTemplatePickerOpen(
  page: Page,
  hostOrigin: string,
  slideId: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, slideId);
  await clickInsertPanelButton(page, translate('scenario.editor.layouts', 'ru'));
  await page.locator('[data-ui="scenario.templates.picker"]').waitFor({ state: 'visible' });
  await assertCleanFloatingState(page, issues);
  await captureStateScreenshot(page, testInfo, 'template-picker-open');
}

export async function verifyExportToolOpen(
  page: Page,
  hostOrigin: string,
  slideId: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, slideId);
  await clickDocumentBarButton(page, translate('scenario.editor.export', 'ru'));
  await page.locator('[data-ui="scenario.inspector.export-tool"]').waitFor({ state: 'visible' });
  await assertCleanFloatingState(page, issues);
  await captureStateScreenshot(page, testInfo, 'export-tool-open');
}

export async function verifyInspectorCollapsed(
  page: Page,
  hostOrigin: string,
  slideId: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, slideId);
  await page
    .getByRole('button', { exact: true, name: translate('editor.toolbar.collapseInspector', 'ru') })
    .click();
  await page
    .locator('[data-ui="scenario.floating.inspector.expand"]')
    .waitFor({ state: 'visible' });
  await assertCleanFloatingState(page, issues);
  await captureStateScreenshot(page, testInfo, 'inspector-collapsed');
}

export async function verifySplitResized(
  page: Page,
  hostOrigin: string,
  slideId: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, slideId);
  await resizeSlideLayerSplit(page);
  await assertCleanFloatingState(page, issues);
  await captureStateScreenshot(page, testInfo, 'slides-layers-split-resized');
}

export async function verifyEmptyViewportSlide(
  page: Page,
  hostOrigin: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, SCENARIO_VISUAL_BASELINE_SLIDE_IDS.emptyViewport);
  await assertCleanFloatingState(page, issues);
  await captureStateScreenshot(page, testInfo, 'empty-viewport-slide');
}

export async function verifyTextCompactControls(page: Page, testInfo: TestInfo): Promise<void> {
  await selectFirstInspectorLayer(page);
  await assertInspectorPanelFitsContent(page);
  await assertCompactRangesSitOnRowBorder(page);
  await assertVisualAcceptance(page);
  await captureStateScreenshot(page, testInfo, 'text-compact-controls');
}

export async function captureTextWeightRow(page: Page, testInfo: TestInfo): Promise<void> {
  const weightRange = page
    .locator('[data-ui="scenario.inspector.parameters"]')
    .locator(`input[aria-label="${translate('scenario.editor.weight', 'ru')} range"]`);
  const weightRow = weightRange.locator(
    'xpath=ancestor::*[@data-ui="shared.ui.compact-inspector.numeric-row"][1]'
  );

  await scrollWeightRowIntoView(weightRow);
  await captureLocatorScreenshot(weightRow, testInfo, 'desktop-dark-text-weight-row.png');
}

async function scrollWeightRowIntoView(weightRow: Locator): Promise<void> {
  await weightRow.evaluate((row) => {
    const scroller = row.closest<HTMLElement>('[data-ui="scenario.inspector.parameters"]');
    if (!scroller) {
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    scroller.scrollTop += rowRect.top - scrollerRect.top - 56;
    scroller.scrollLeft = 0;
  });
  await weightRow.waitFor({ state: 'visible' });
}

export async function verifyAiPanelOpen(
  page: Page,
  hostOrigin: string,
  slideId: string,
  testInfo: TestInfo,
  issues: PageIssueCollector
): Promise<void> {
  await openDesktopEditorState(page, hostOrigin, slideId);
  await clickDocumentBarButton(page, translate('scenario.editor.aiEditorTool', 'ru'));
  await page.locator('[data-ui="scenario.editor.ai-panel"]').waitFor({ state: 'visible' });
  issues.assertClean();
  await assertFloatingPanelPlacement(page);
  await assertAiPanelKeepsCompactHeight(page);
  await assertVisualAcceptance(page);
  await captureStateScreenshot(page, testInfo, 'ai-panel-open');
}

async function clickInsertPanelButton(page: Page, name: string): Promise<void> {
  await page
    .locator('[data-ui="scenario.floating.insert-panel"]')
    .getByRole('button', { exact: true, name })
    .click();
}

async function clickDocumentBarButton(page: Page, name: string): Promise<void> {
  await page
    .locator('[data-ui="scenario.floating.document-bar.surface"]')
    .getByRole('button', { exact: true, name })
    .click();
}

async function resizeSlideLayerSplit(page: Page): Promise<void> {
  await page
    .getByRole('button', { exact: true, name: translate('scenario.editor.layers', 'ru') })
    .press('ArrowDown');
  await page.locator('[data-ui="scenario.floating.layers-panel"]').waitFor({ state: 'visible' });
}

async function selectFirstInspectorLayer(page: Page): Promise<void> {
  await page.locator('[data-ui="scenario.inspector.layers"] button[aria-pressed]').first().click();
  await page.locator('[data-ui="scenario.inspector.parameters"]').waitFor({ state: 'visible' });
}

export async function captureShellScreenshot(
  page: Page,
  testInfo: TestInfo,
  viewportName: string
): Promise<void> {
  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`${viewportName}-light-editor-shell.png`),
  });
}

async function captureStateScreenshot(
  page: Page,
  testInfo: TestInfo,
  stateName: string
): Promise<void> {
  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`desktop-dark-${stateName}.png`),
  });
}

async function captureLocatorScreenshot(
  locator: Locator,
  testInfo: TestInfo,
  filename: string
): Promise<void> {
  await mkdir(testInfo.outputDir, { recursive: true });
  await locator.screenshot({ path: testInfo.outputPath(filename) });
}

export async function captureSurfaceScreenshot(
  page: Page,
  testInfo: TestInfo,
  theme: ThemeName,
  viewportName: string,
  surface: VisualSurfaceCase
): Promise<void> {
  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`${viewportName}-${theme}-${surface.screenshotName}.png`),
  });
}
