import { expect, type Page } from '@playwright/test';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { test } from '../support/extension-fixture';
import {
  applyHarnessBootstrap,
  getRuntimeMessagesByType,
  EDITOR_HARNESS_PATH,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  GALLERY_HARNESS_PATH,
} from '../extension-critical.helpers';
import { createExactBrowserFrameHarnessPayload } from '../../harness/editor/scenarios/browser-frame-exact';

const EVIDENCE_DIR = '/tmp';

function editorHarnessUrl(hostOrigin: string, assetId: string): string {
  return `${hostOrigin}${EDITOR_HARNESS_PATH}?assetId=${assetId}`;
}

async function seedImageAssetBootstrap(
  page: Page,
  asset: { id: string; filename: string; createdAt: number }
) {
  await page.addInitScript((value) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#2f5fd0';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#f4c542';
      context.fillRect(40, 40, 120, 70);
      context.fillStyle = '#ffffff';
      context.fillRect(200, 110, 80, 40);
    }
    const dataUrl = canvas.toDataURL('image/png');
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: 'image/png' });
    window.__sniptaleHarnessBootstrap = {
      ...(window.__sniptaleHarnessBootstrap ?? {}),
      editorDispatchBootstrapPayload: false,
      mediaLibrary: [
        {
          entry: {
            id: value.id,
            kind: 'screenshot',
            source: { kind: 'screenshot' },
            filename: value.filename,
            originalFilename: value.filename,
            createdAt: value.createdAt,
            updatedAt: value.createdAt,
            size: blob.size,
            mimeType: 'image/png',
            width: 320,
            height: 180,
            duration: null,
            sourceUrl: 'https://example.com/two-tab-source',
            sourceTitle: 'Two-tab persistence seed',
            sourceFavicon: null,
            tags: ['e2e'],
            lifecycle: {
              savedAt: value.createdAt,
              storageClass: 'library',
              updatedAt: value.createdAt,
            },
            blob,
          },
        },
      ],
      preserveMediaLibrary: true,
    };
  }, asset);
}

async function preserveMediaLibraryBootstrap(page: Page) {
  await page.addInitScript(() => {
    window.__sniptaleHarnessBootstrap = {
      ...(window.__sniptaleHarnessBootstrap ?? {}),
      editorDispatchBootstrapPayload: false,
      preserveMediaLibrary: true,
    };
  });
}

async function waitForEditorReady(page: Page) {
  await page.locator('[data-ui="editor.page.root"]').waitFor({ state: 'visible' });
  await expect
    .poll(async () => {
      return page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0);
    })
    .toBeGreaterThan(0);
}

async function readImageWorkspaceRecord(
  page: Page,
  aggregateId: string
): Promise<{
  browserFrameTitle: string | null;
  revision: number | null;
  displayName: string | null;
  sourceName: string | null;
  sourceTitle: string | null;
}> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = db
          .transaction('image_workspaces', 'readonly')
          .objectStore('image_workspaces')
          .get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const workspaceDocument = record?.['document'] as Record<string, unknown> | undefined;
      const browserFrame = workspaceDocument?.['browserFrame'] as
        | Record<string, unknown>
        | undefined;
      return {
        displayName:
          typeof workspaceDocument?.['displayName'] === 'string'
            ? workspaceDocument['displayName']
            : null,
        sourceName:
          typeof workspaceDocument?.['sourceName'] === 'string'
            ? workspaceDocument['sourceName']
            : null,
        sourceTitle: typeof record?.['sourceTitle'] === 'string' ? record['sourceTitle'] : null,
        browserFrameTitle:
          typeof browserFrame?.['title'] === 'string' ? browserFrame['title'] : null,
        revision: typeof record?.['revision'] === 'number' ? record['revision'] : null,
      };
    } finally {
      db.close();
    }
  }, aggregateId);
}

async function readImageWorkspaceRevision(page: Page, aggregateId: string): Promise<number | null> {
  return (await readImageWorkspaceRecord(page, aggregateId)).revision;
}

async function verifySaveErrorPopover(page: Page) {
  const trigger = page.locator('[data-ui="editor.floating.document-bar.error-trigger"]');
  const popup = page.locator('[data-ui="editor.floating.document-bar.save-error"]');
  const toolbar = page.locator('[data-ui="editor.floating.document-bar"]');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('Изображение изменено в другой вкладке');
  const expandedBar = await toolbar.boundingBox();
  const expandedPopup = await popup.boundingBox();
  expect(expandedPopup!.y).toBeGreaterThanOrEqual(expandedBar!.y + expandedBar!.height + 8);
  await popup.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(popup).toHaveCount(0);
  expect((await toolbar.boundingBox())!.height).toBe(expandedBar!.height);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.setViewportSize({ width: 740, height: 600 });
  await expect(popup).toBeInViewport();
  const narrow = await popup.boundingBox();
  expect(narrow!.x).toBeGreaterThanOrEqual(0);
  expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(740);
  await popup.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({ path: `${EVIDENCE_DIR}/editor-save-error-narrow.png` });
  await page.evaluate(async () => {
    await chrome.storage.local.set({ 'sniptale-theme-preference': 'dark' });
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(popup.getByRole('button', { name: 'Сохранить копию', exact: true })).toHaveCSS(
    'color',
    'rgb(250, 250, 250)'
  );
  await page.screenshot({ path: `${EVIDENCE_DIR}/editor-save-error-dark.png` });
}

test('same image in two tabs rejects the stale publication and keeps the winner', async ({
  context,
  hostOrigin,
}, testInfo) => {
  const assetId = 'e2e-two-tab-image';
  const createdAt = Date.now();

  const pageA = await context.newPage();
  await seedImageAssetBootstrap(pageA, { id: assetId, filename: 'two-tab.png', createdAt });
  await pageA.goto(editorHarnessUrl(hostOrigin, assetId), { waitUntil: 'domcontentloaded' });
  await waitForEditorReady(pageA);
  await expect(
    pageA.locator('[data-ui="editor.floating.document-bar"] [data-state="saved"]')
  ).toBeVisible();
  await expect.poll(() => readImageWorkspaceRevision(pageA, assetId)).toBe(1);

  const pageB = await context.newPage();
  await preserveMediaLibraryBootstrap(pageB);
  await pageB.goto(editorHarnessUrl(hostOrigin, assetId), { waitUntil: 'domcontentloaded' });
  await waitForEditorReady(pageB);
  await expect(
    pageB.locator('[data-ui="editor.floating.document-bar"] [data-state="saved"]')
  ).toBeVisible();
  await expect.poll(() => readImageWorkspaceRevision(pageB, assetId)).toBe(2);

  await pageB.evaluate(() => window.__sniptaleEditorHarness?.applyBrowserFrameMutation());
  await expect(
    pageB.locator('[data-ui="editor.floating.document-bar"] [data-state="saved"]')
  ).toBeVisible();
  await expect.poll(() => readImageWorkspaceRevision(pageB, assetId)).toBe(3);

  await pageA.evaluate(() => window.__sniptaleEditorHarness?.applyBrowserFrameMutation());
  await expect(
    pageA.locator('[data-ui="editor.floating.document-bar"] [data-state="error"]')
  ).toBeVisible();
  await expect.poll(() => readImageWorkspaceRevision(pageA, assetId)).toBe(3);

  await verifySaveErrorPopover(pageA);

  const staleScreenshot = testInfo.outputPath('two-tab-stale-rejected.png');
  await pageA.screenshot({ path: staleScreenshot });
  await pageA.screenshot({ path: `${EVIDENCE_DIR}/sniptale-e2e-two-tab-stale.png` });

  const galleryPage = await context.newPage();
  await preserveMediaLibraryBootstrap(galleryPage);
  await galleryPage.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  // Admission must settle out of the "Checking storage" busy state into real content.
  await galleryPage.locator('[data-ui="gallery.page.root"]').waitFor({ state: 'visible' });
  await expect(galleryPage.locator('main[aria-busy="true"]')).toHaveCount(0);
  await expect(galleryPage.locator('[data-ui="gallery.content.surface"]')).toBeVisible();
  await galleryPage.screenshot({ path: `${EVIDENCE_DIR}/sniptale-e2e-gallery-settled.png` });

  const persistedBeforeReopen = await readImageWorkspaceRecord(pageA, assetId);
  expect(persistedBeforeReopen.browserFrameTitle).toContain('change-');

  const pageReopen = await context.newPage();
  await preserveMediaLibraryBootstrap(pageReopen);
  await pageReopen.goto(editorHarnessUrl(hostOrigin, assetId), { waitUntil: 'domcontentloaded' });
  await waitForEditorReady(pageReopen);
  await expect(
    pageReopen.locator('[data-ui="editor.floating.document-bar"] [data-state="saved"]')
  ).toBeVisible();
  await expect.poll(() => readImageWorkspaceRevision(pageReopen, assetId)).toBe(4);
  // The reopened editor must show the winner's persisted document state, not a
  // fresh bootstrap: the live browser-frame title matches the stored record.
  await pageReopen.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
  await expect(
    pageReopen.getByRole('textbox', { name: /Заголовок вкладки|Tab title/ })
  ).toHaveValue(persistedBeforeReopen.browserFrameTitle ?? '');
  await pageReopen.screenshot({ path: `${EVIDENCE_DIR}/sniptale-e2e-reopen-latest.png` });

  await pageA.close();
  await pageB.close();
  await galleryPage.close();
  await pageReopen.close();
});

test('floating inspector shows focused rail content with styled grouped sections', async ({
  context,
  hostOrigin,
}, testInfo) => {
  const assetId = 'e2e-inspector-css-image';
  const createdAt = Date.now();

  const page = await context.newPage();
  await seedImageAssetBootstrap(page, { id: assetId, filename: 'inspector.png', createdAt });
  await page.goto(editorHarnessUrl(hostOrigin, assetId), { waitUntil: 'domcontentloaded' });
  await waitForEditorReady(page);

  await page.locator('[data-ui="editor.floating.layers.mode.image-size"]').click();

  // The selected rail category renders only its own section — no sibling
  // navigation or disclosure headers for the other document categories.
  const imageSizeSection = page.locator('[data-section="image-size"]');
  await expect(imageSizeSection).toBeVisible();
  await expect(
    imageSizeSection.locator('[data-ui="editor.inspector.section-heading"]')
  ).toHaveCount(1);
  await expect(page.locator('[data-section="browser-frame"]')).toHaveCount(0);
  await expect(page.locator('[data-section="meta"]')).toHaveCount(0);
  await expect(page.locator('[data-section="canvas-size"]')).toHaveCount(0);
  const fields = imageSizeSection.locator('[data-ui="shared.ui.compact-inspector.select-field"]');
  await expect
    .poll(async () =>
      fields.evaluateAll((nodes) =>
        nodes.every((node) => {
          const style = getComputedStyle(node);
          return style.borderTopWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)';
        })
      )
    )
    .toBe(true);
  await page.screenshot({ path: `${EVIDENCE_DIR}/sniptale-e2e-inspector-focused.png` });
  await page.screenshot({ path: testInfo.outputPath('inspector-focused-image-size.png') });

  // Disclosure styling still applies where disclosures exist: the frame rail's
  // grouped scene sections keep open and closed states.
  await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
  const disclosures = page.locator('[data-ui="editor.inspector.disclosure"]');
  await expect(disclosures.first()).toBeVisible();
  await disclosures.first().locator('summary').first().click();
  await expect.poll(async () => disclosures.count()).toBeGreaterThanOrEqual(2);

  const loadedRules = await page.evaluate(() => {
    const texts: string[] = [];
    const collect = (rules: CSSRuleList) => {
      for (const rule of rules) {
        texts.push(rule.cssText);
        const nested = (rule as CSSGroupingRule).cssRules;
        if (nested) collect(nested);
      }
    };
    for (const sheet of document.styleSheets) {
      collect(sheet.cssRules);
    }
    return {
      disclosureSummaryRule: texts.some(
        (text) =>
          text.includes('editor.inspector.disclosure') &&
          text.includes('summary') &&
          text.includes('flex')
      ),
      markerRule: texts.some(
        (text) =>
          text.includes('editor.inspector.disclosure') &&
          text.includes('-webkit-details-marker') &&
          text.includes('none')
      ),
      selectMenuRule: texts.some((text) => text.includes('editor-inspector-select-menu')),
    };
  });
  expect(loadedRules).toEqual({
    disclosureSummaryRule: true,
    markerRule: true,
    selectMenuRule: true,
  });

  const disclosureStyles = await page.evaluate(() => {
    const details = [...document.querySelectorAll('[data-ui="editor.inspector.disclosure"]')];
    return details.map((detail) => {
      const summary = detail.querySelector('summary');
      if (!summary) return null;
      const computed = getComputedStyle(summary);
      return {
        display: computed.display,
        listStyleType: computed.listStyleType,
        open: (detail as HTMLDetailsElement).open,
      };
    });
  });

  const summaries = disclosureStyles.flatMap((style) => (style ? [style] : []));
  expect(summaries.length).toBeGreaterThanOrEqual(2);
  for (const summary of summaries) {
    expect(summary.display).toBe('flex');
    expect(summary.listStyleType).toBe('none');
  }
  expect(summaries.some((summary) => summary.open)).toBe(true);
  expect(summaries.some((summary) => !summary.open)).toBe(true);

  await page.screenshot({ path: `${EVIDENCE_DIR}/sniptale-e2e-inspector-open-closed.png` });
  await page.screenshot({ path: testInfo.outputPath('inspector-disclosure-open-closed.png') });

  await page.setViewportSize({ width: 740, height: 600 });
  await expect(disclosures.first()).toBeVisible();
  const constrainedStyles = await page.evaluate(() => {
    const details = [...document.querySelectorAll('[data-ui="editor.inspector.disclosure"]')];
    const summary = details[0]?.querySelector('summary');
    return summary ? getComputedStyle(summary).display : null;
  });
  expect(constrainedStyles).toBe('flex');
  await page.screenshot({ path: `${EVIDENCE_DIR}/sniptale-e2e-inspector-constrained.png` });
  await page.screenshot({ path: testInfo.outputPath('inspector-disclosure-constrained.png') });

  await page.locator('[data-ui="editor.floating.layers.mode.image-size"]').click();
  await expect(imageSizeSection).toBeVisible();
  await expect(page.locator('[data-section="browser-frame"]')).toHaveCount(0);
  await page.screenshot({ path: `${EVIDENCE_DIR}/sniptale-e2e-inspector-focused-constrained.png` });
  await page.close();
});

test('draft document controls leave the frame tool reachable at desktop and narrow widths', async ({
  context,
  hostOrigin,
}) => {
  const page = await context.newPage();
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await waitForEditorReady(page);
  for (const width of [1440, 1280, 740]) {
    await page.setViewportSize({ width, height: 900 });
    const frameTool = page.getByRole('button', { name: 'Рамка', exact: true }).first();
    await frameTool.click({ timeout: 3000 });
    await expect(frameTool).toBeVisible();
  }
  await page.close();
});

test('autosave presentation does not finish an active frame drag', async ({ page, hostOrigin }) => {
  await page.setViewportSize({ width: 1680, height: 1200 });
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    editorAutoApplyBrowserFrame: true,
    editorBootstrapPayload: createExactBrowserFrameHarnessPayload(),
  });
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await waitForEditorReady(page);
  await page.locator('[data-ui="content.toolbar.future-frame-style"]').click();

  const plane = await page.locator('[data-ui="editor.frame-annotation-plane"]').boundingBox();
  expect(plane).not.toBeNull();
  const start = { x: plane!.x + plane!.width / 2 - 70, y: plane!.y + plane!.height / 2 - 40 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 140, start.y + 80, { steps: 4 });
  await page.mouse.up();

  const frame = page
    .locator('[data-frame-id]')
    .filter({ has: page.locator('.sniptale-interactive-frame-fill') })
    .first();
  await expect(frame).toBeVisible();
  const initial = await frame.boundingBox();
  expect(initial).not.toBeNull();
  const from = { x: initial!.x + initial!.width / 2, y: initial!.y + initial!.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 10);
  const firstMove = await frame.boundingBox();
  expect(firstMove).not.toBeNull();

  await page.waitForTimeout(1500);
  await page.mouse.move(from.x + 80, from.y + 35, { steps: 3 });
  const secondMove = await frame.boundingBox();
  await page.mouse.up();
  expect(secondMove).not.toBeNull();
  expect(secondMove!.x - firstMove!.x).toBeGreaterThan(30);
});

test('inspector numeric and paint controls retain shared hover, focus and Escape behavior', async ({
  context,
  hostOrigin,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await waitForEditorReady(page);
  await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
  const framePanel = page.locator('[data-ui="editor.frame-panel"]');
  const categoryRail = framePanel.locator('nav');
  await expect(categoryRail.locator('button')).toHaveCount(2);
  await expect(framePanel.locator('[data-section="background"]')).toBeVisible();
  await expect(framePanel.locator('[data-ui="editor.frame.quick-colors"] button')).toHaveCount(8);
  const panelBounds = await framePanel.boundingBox();
  const railBounds = await categoryRail.boundingBox();
  expect(panelBounds).not.toBeNull();
  expect(railBounds).not.toBeNull();
  expect(railBounds!.x).toBe(panelBounds!.x);
  const firstNavButtonBounds = await categoryRail.locator('button').first().boundingBox();
  expect(firstNavButtonBounds).not.toBeNull();
  const leftRailInset = firstNavButtonBounds!.x - railBounds!.x;
  const rightRailInset =
    railBounds!.x + railBounds!.width - firstNavButtonBounds!.x - firstNavButtonBounds!.width;
  expect(Math.abs(leftRailInset - rightRailInset)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${EVIDENCE_DIR}/editor-frame-background-panel.png` });
  const actions = page.locator('[data-ui="editor.frame-panel"] > [data-ui="editor.frame.actions"]');
  const actionBounds = await actions.boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(actionBounds!.y).toBeGreaterThan(railBounds!.y);
  const field = page.getByRole('textbox', { name: 'Скругление углов', exact: true });
  const row = page
    .locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
    .filter({ has: field });
  const range = row.locator('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]');
  await expect(row).toHaveAttribute('data-appearance', 'plain');
  await expect(range).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(range).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `${EVIDENCE_DIR}/editor-shared-range-hover.png` });
  await field.focus();
  const shell = row.locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]');
  await expect(shell).toHaveAttribute('data-focus-appearance', 'accent-box');
  await expect(shell).toHaveCSS('border-radius', '7px');
  // Shared numeric inputs retain the browser's native text-input cursor.
  await expect(field).toHaveCSS('cursor', 'auto');
  await field.fill('7');
  await field.press('Enter');
  await expect(field).toHaveValue('7');
  await field.fill('9');
  await field.press('Escape');
  await expect(field).toHaveValue('7');
  await field.focus();
  await page.screenshot({ path: `${EVIDENCE_DIR}/editor-shared-input-focus.png` });
  const trigger = page.locator('[data-ui="shared.ui.paint-selector.trigger"]');
  await trigger.click();
  await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE_DIR}/editor-shared-paint-picker.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="shared.ui.paint-selector.popup"]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await categoryRail.locator('button').nth(1).click();
  await expect(framePanel.locator('[data-section="background"]')).toHaveCount(0);
  await expect(framePanel.locator('[data-section="additional"] details')).toHaveCount(2);
  await page.screenshot({ path: `${EVIDENCE_DIR}/editor-frame-additional-panel.png` });
  await page.close();
});

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`image caption history drives save filenames (${variant.locale}, ${variant.theme})`, async ({
    context,
    hostOrigin,
  }) => {
    const page = await context.newPage();
    const assetId = `e2e-caption-history-${variant.locale}`;
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: {
        'sniptale-locale-preference': variant.locale,
        'sniptale-theme-preference': variant.theme,
      },
    });
    await page.addInitScript(
      (locale) => localStorage.setItem('sniptale-locale-preference', locale),
      variant.locale
    );
    await seedImageAssetBootstrap(page, {
      id: assetId,
      filename: 'source-original.png',
      createdAt: Date.now(),
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(editorHarnessUrl(hostOrigin, assetId));
    await waitForEditorReady(page);
    const title = page.locator('[data-ui="editor.floating.document-bar.title"]');
    const oldTitle = (await title.textContent())!.trim();
    const rename = page.getByRole('textbox', {
      name: translate('editor.page.renameImage', variant.locale),
      exact: true,
    });
    await title.click();
    await rename.fill('  Схема.png  ');
    await rename.press('Enter');
    await expect(rename).toHaveCount(0);
    await expect(title).toContainText('Схема.png');
    await expect
      .poll(async () => (await readImageWorkspaceRecord(page, assetId)).displayName)
      .toBe('Схема.png');
    const sourceName = (await readImageWorkspaceRecord(page, assetId)).sourceName;
    const undo = page.locator('[data-ui="editor.floating.tool-rail.history.undo"]');
    const redo = page.locator('[data-ui="editor.floating.tool-rail.history.redo"]');
    await undo.click();
    await expect(title).toContainText(oldTitle);
    await expect
      .poll(async () => (await readImageWorkspaceRecord(page, assetId)).sourceTitle)
      .toBe(oldTitle);
    await expect(undo).toBeDisabled();
    await redo.click();
    await expect(title).toContainText('Схема.png');
    await page.evaluate(() => window.__sniptaleEditorHarness?.applyBrowserFrameMutation());
    await undo.click();
    await expect(title).toContainText('Схема.png');
    await undo.click();
    await expect(title).toContainText(oldTitle);
    await redo.click();
    await redo.click();
    await expect(title).toContainText('Схема.png');
    for (const [control, actionType] of [
      ['save-button', 'download_default'],
      ['save-as-button', 'ask_system'],
    ]) {
      const before = (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).length;
      await page.locator(`[data-ui="editor.floating.document-bar.${control}"]`).click();
      await expect
        .poll(async () => (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).length)
        .toBe(before + 1);
      const message = (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).at(-1)!;
      expect(message.actionType).toBe(actionType);
      expect(message).toHaveProperty('filename', expect.stringMatching(/^Схема\.(png|jpg|webp)$/u));
    }
    await expect
      .poll(async () => (await readImageWorkspaceRecord(page, assetId)).sourceTitle)
      .toBe('Схема.png');
    expect((await readImageWorkspaceRecord(page, assetId)).sourceName).toBe(sourceName);
    const reopened = await context.newPage();
    await applyHarnessBootstrap(reopened, {
      preserveMediaLibrary: true,
      storage: {
        'sniptale-locale-preference': variant.locale,
        'sniptale-theme-preference': variant.theme,
      },
    });
    await reopened.addInitScript(
      (locale) => localStorage.setItem('sniptale-locale-preference', locale),
      variant.locale
    );
    await preserveMediaLibraryBootstrap(reopened);
    await reopened.setViewportSize({ width: 1280, height: 720 });
    await reopened.goto(editorHarnessUrl(hostOrigin, assetId));
    await waitForEditorReady(reopened);
    await expect(reopened.locator('[data-ui="editor.floating.document-bar.title"]')).toContainText(
      'Схема.png'
    );
    expect((await readImageWorkspaceRecord(reopened, assetId)).sourceTitle).toBe('Схема.png');
    await reopened.close();
    await page.close();
  });
}
