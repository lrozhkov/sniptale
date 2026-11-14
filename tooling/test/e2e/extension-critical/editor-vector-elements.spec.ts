import type { Locator, Page } from '@playwright/test';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isEditorVectorInstance } from '../../../../apps/extension/src/features/editor/document/vector-element';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

test.use({ actionTimeout: 10_000 });

const multiSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="5" y="5" width="40" height="90" fill="#ff0000"/><path d="M55 5h40v90H55z" fill="#00ff00" stroke="#0000ff" stroke-width="2"/></svg>';
const monoSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v20H2z"/></svg>';
const unsafeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h24v24z"/></svg>';
const iconSet = {
  prefix: 'proof',
  width: 24,
  height: 24,
  icons: {
    heart: { body: '<path fill="currentColor" d="M2 2h20v20H2z"/>' },
    unsafe: { body: '<script>alert(1)</script><path d="M0 0h24v24z"/>' },
  },
};
const ui = (page: Page, suffix: string) => page.locator(`[data-ui="editor.elements.${suffix}"]`);
const property = (page: Page, suffix: string) =>
  page.locator(`[data-ui="editor.floating.tool-properties.group.vector-${suffix}"]`);
const history = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
const rendered = (page: Page) => page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
const visibleCanvas = (page: Page) =>
  page.locator('canvas.lower-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing visible canvas');
    return canvas.toDataURL('image/png');
  });
const canvasObjects = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
const vectorObjects = async (page: Page) =>
  (await canvasObjects(page)).filter((object) => object['sniptaleType'] === 'vector-element');
async function vectorState(page: Page) {
  const document = await page.evaluate(() => window.__sniptaleEditorHarness!.exportDocument());
  const canvas: unknown = JSON.parse(document.canvasJson);
  if (!isRecord(canvas) || !Array.isArray(canvas['objects']))
    throw new Error('Invalid canvas snapshot');
  const values: unknown[] = canvas['objects'];
  const objects = values.flatMap((value) => {
    if (!isRecord(value)) throw new Error('Invalid canvas object');
    if (value['sniptaleType'] !== 'vector-element') return [];
    const instance = value['sniptaleVectorElement'];
    if (!isEditorVectorInstance(instance)) throw new Error('Invalid vector instance snapshot');
    return [{ ...value, sniptaleVectorElement: instance }];
  });
  return {
    version: document.version,
    definitions: Object.keys(document.vectorDefinitions ?? {}),
    objects,
  };
}

async function openFixture(
  page: Page,
  hostOrigin: string,
  viewport: { width: number; height: number }
) {
  await page.setViewportSize(viewport);
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 480;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 900, 480);
    return canvas.toDataURL('image/png');
  });
  await page.addInitScript(
    ({ payload, storage }) => {
      const preserve = sessionStorage.getItem('vector-fixture-opened') === '1';
      sessionStorage.setItem('vector-fixture-opened', '1');
      window.__sniptaleHarnessBootstrap = {
        storage,
        editorBootstrapPayload: payload,
        preserveMediaLibrary: preserve,
        editorDispatchBootstrapPayload: !preserve,
      };
      localStorage.setItem('sniptale-locale-preference', 'en');
    },
    {
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': viewport.width === 1920 ? 'dark' : 'light',
      },
      payload: { dataUrl, title: 'Vector elements proof' },
    }
  );
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
  await expect(ui(page, 'panel')).toBeVisible();
}

async function ready(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
    )
    .toBe(true);
  await expect(page.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
}

async function saved(page: Page) {
  const label = `${translate('editor.documentActions.autosaveTitle', 'en')}: ${translate('common.states.saved', 'en')}`;
  await expect(
    page.locator('[data-ui="autosave-control"]').getByRole('button', { name: label, exact: true })
  ).toBeVisible();
}

async function importFiles(page: Page, mixed = false) {
  await ui(page, 'import-input').setInputFiles([
    { name: 'palette-proof.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(multiSvg) },
    ...(mixed
      ? [
          { name: 'mono-proof.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(monoSvg) },
          { name: 'unsafe-proof.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(unsafeSvg) },
          {
            name: 'proof-icons.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(iconSet)),
          },
        ]
      : []),
  ]);
  await expect(ui(page, 'management')).toBeVisible();
  await expect(ui(page, 'management')).toContainText('palette-proof.svg');
  if (mixed) {
    await expect(ui(page, 'management')).toContainText('unsafe-proof.svg');
    await expect(ui(page, 'management')).toContainText('proof-icons.json');
    await expect(ui(page, 'management')).toContainText('Declined: 1');
  }
  await page.getByRole('button', { name: 'Back to elements', exact: true }).click();
  await expect(ui(page, 'card')).toHaveCount(mixed ? 3 : 1);
  await expect(ui(page, 'card').locator('img')).toHaveCount(mixed ? 3 : 1);
}

async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function addPalette(page: Page) {
  await ui(page, 'card').filter({ hasText: 'palette-proof.svg' }).click();
  await ui(page, 'add').click();
  await expect.poll(() => vectorObjects(page).then((objects) => objects.length)).toBe(1);
  await expect(page.locator('[data-ui="editor.vector.properties"]')).toBeVisible();
}

async function colorPicker(page: Page, value: string) {
  if ((await property(page, 'palette').getAttribute('aria-expanded')) !== 'true')
    await property(page, 'palette').click();
  await page
    .locator('[data-ui="editor.floating.tool-properties.popover.vector-palette"]')
    .locator('[data-ui="shared.ui.color-selector"]')
    .first()
    .getByRole('button', {
      name: translate('shared.ui.colorSelectorChooseColor', 'en'),
      exact: true,
    })
    .click();
  const fullMode = page.getByRole('button', {
    name: translate('shared.ui.colorSelectorFullMode', 'en'),
    exact: true,
  });
  if (await fullMode.isVisible()) await fullMode.click();
  const hex = page.getByRole('textbox', {
    name: translate('shared.ui.colorSelectorHex', 'en'),
    exact: true,
  });
  await hex.fill(value);
  await hex.press('Tab');
}

async function vectorClientCenter(page: Page) {
  return page.evaluate(() => {
    const harness = window.__sniptaleEditorHarness!;
    const object = harness
      .getCanvasObjects()
      .find((value) => value['sniptaleType'] === 'vector-element');
    const projection = harness.getSceneProjection();
    const matrix = object?.['matrix'];
    if (
      !projection ||
      !Array.isArray(matrix) ||
      matrix.length !== 6 ||
      !matrix.every((value) => typeof value === 'number' && Number.isFinite(value))
    )
      throw new Error('Missing vector projection');
    const x: unknown = matrix[4],
      y: unknown = matrix[5];
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      throw new Error('Invalid vector center');
    if (
      projection.viewport.length !== 6 ||
      !projection.viewport.every((value) => Number.isFinite(value))
    )
      throw new Error('Invalid canvas viewport');
    const [a, b, c, d, e, f] = projection.viewport;
    return {
      x: projection.rect.left + ((a! * x + c! * y + e!) * projection.rect.width) / projection.width,
      y:
        projection.rect.top + ((b! * x + d! * y + f!) * projection.rect.height) / projection.height,
    };
  });
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`vector local imports Add Enter selection and library persistence ${viewport.name}`, async ({
    page,
    hostOrigin,
    context,
  }, info) => {
    await openFixture(page, hostOrigin, viewport.size);
    await ui(page, 'manage').click();
    await page
      .getByRole('textbox', { name: 'Collection name', exact: true })
      .fill('Proof collection');
    await page.getByRole('button', { name: 'Create collection', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'Collection name', exact: true }).nth(1)
    ).toHaveValue('Proof collection');
    await page.getByRole('button', { name: 'Back to elements', exact: true }).click();
    await choose(
      page,
      page.getByRole('button', { name: 'Import into collection', exact: true }),
      'Proof collection'
    );
    const baseline = await history(page);
    await importFiles(page, true);
    expect(await vectorObjects(page)).toHaveLength(0);
    expect(await history(page)).toBe(baseline);
    await addPalette(page);
    await expect.poll(() => history(page)).toBe(baseline + 1);
    const selected = (await vectorObjects(page))[0]!['sniptaleId'];
    await ui(page, 'card').filter({ hasText: 'mono-proof.svg' }).click();
    expect((await vectorObjects(page)).find((object) => object['active'])?.['sniptaleId']).toBe(
      selected
    );
    await ui(page, 'card').filter({ hasText: 'mono-proof.svg' }).press('Enter');
    await expect.poll(() => vectorObjects(page).then((objects) => objects.length)).toBe(2);
    const state = await vectorState(page);
    expect(state.version).toBe(4);
    expect(state.definitions).toHaveLength(2);
    const paletteItem = ui(page, 'grid')
      .getByRole('listitem')
      .filter({ hasText: 'palette-proof.svg' });
    await paletteItem.locator('[data-ui="editor.elements.favorite"]').click();
    await expect(paletteItem.locator('[data-ui="editor.elements.favorite"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath('local-imports-selected.png'), fullPage: false });
    await saved(page);
    await page.reload();
    await ready(page);
    await expect.poll(() => vectorState(page)).toEqual(state);
    await expect.poll(() => vectorObjects(page).then((objects) => objects.length)).toBe(2);
    await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expect(ui(page, 'card')).toHaveCount(1);
    await choose(page, ui(page, 'collection'), 'Proof collection');
    await expect(ui(page, 'card')).toHaveCount(1);
    await context.setOffline(true);
    try {
      await ui(page, 'card').first().click();
      await expect(ui(page, 'add')).toBeEnabled();
      await ui(page, 'card').first().press('Enter');
      await expect.poll(() => vectorObjects(page).then((objects) => objects.length)).toBe(3);
      const offlineDocument = await vectorState(page);
      const offlineImage = await rendered(page);
      await ui(page, 'manage').click();
      await ui(page, 'clear-cache').click();
      await page.getByRole('button', { name: 'Back to elements', exact: true }).click();
      await expect(ui(page, 'card')).toHaveCount(1);
      expect(await vectorState(page)).toEqual(offlineDocument);
      expect(await rendered(page)).toBe(offlineImage);
      await page.screenshot({
        path: info.outputPath('offline-library-retained.png'),
        fullPage: false,
      });
    } finally {
      await context.setOffline(false);
    }
  });

  test(`vector drag scene geometry Escape and outside cancellation ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openFixture(page, hostOrigin, viewport.size);
    await importFiles(page);
    const card = ui(page, 'card').first();
    const bounds = await card.boundingBox();
    const boundary = await page
      .locator('[data-ui="editor.canvas.document-boundary"]')
      .boundingBox();
    if (!bounds || !boundary) throw new Error('Missing visible card or document boundary');
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const target = {
      x: boundary.x + boundary.width * 0.35,
      y: boundary.y + boundary.height * 0.45,
    };
    const baseline = await history(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await vectorObjects(page)).toHaveLength(0);
    expect(await history(page)).toBe(baseline);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(5, 5, { steps: 8 });
    await page.mouse.up();
    expect(await vectorObjects(page)).toHaveLength(0);
    expect(await history(page)).toBe(baseline);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => vectorObjects(page).then((objects) => objects.length)).toBe(1);
    await expect.poll(() => history(page)).toBe(baseline + 1);
    const center = await vectorClientCenter(page);
    // This compares native Fabric matrices in CSS pixels, independently of placement helpers.
    expect(Math.abs(center.x - target.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(center.y - target.y)).toBeLessThanOrEqual(1);
    await noHorizontalScroll(page);
    await page.screenshot({ path: info.outputPath('drag-drop-exact-point.png'), fullPage: false });
  });

  test(`vector palette preview commit cancel reset Undo Redo and saved preset ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openFixture(page, hostOrigin, viewport.size);
    await importFiles(page);
    await addPalette(page);
    const original = await vectorState(page),
      originalImage = await rendered(page),
      baseline = await history(page);
    const originalCanvas = await visibleCanvas(page);
    await colorPicker(page, '#8040ff');
    expect(await vectorState(page)).toEqual(original);
    expect(await history(page)).toBe(baseline);
    await expect.poll(() => visibleCanvas(page)).not.toBe(originalCanvas);
    expect(await rendered(page)).toBe(originalImage);
    await page
      .getByRole('button', { name: translate('shared.ui.colorSelectorCancel', 'en'), exact: true })
      .click();
    expect(await rendered(page)).toBe(originalImage);
    await expect.poll(() => visibleCanvas(page)).toBe(originalCanvas);
    await colorPicker(page, '#8040ff');
    await page
      .getByRole('button', { name: translate('shared.ui.colorSelectorApply', 'en'), exact: true })
      .click();
    await expect.poll(() => history(page)).toBe(baseline + 1);
    const changed = await vectorState(page),
      changedImage = await rendered(page);
    expect(changed.objects[0]?.sniptaleVectorElement?.overrides.colors).toEqual({ c0: '#8040ff' });
    expect(changedImage).not.toBe(originalImage);
    await property(page, 'presets').click();
    await page.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Proof palette');
    await page.locator('[data-ui="editor.vector.save-preset"]').click();
    await expect(page.getByRole('textbox', { name: 'Preset name', exact: true })).toHaveValue('');
    expect(await history(page)).toBe(baseline + 1);
    await page.locator('[data-ui="editor.vector.reset"]').click();
    await expect.poll(() => history(page)).toBe(baseline + 2);
    expect((await vectorState(page)).objects[0]?.sniptaleVectorElement?.overrides.colors).toEqual(
      {}
    );
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect.poll(() => vectorState(page)).toEqual(changed);
    expect(await rendered(page)).toBe(changedImage);
    await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
    await expect.poll(() => rendered(page)).toBe(originalImage);
    const resetState = await vectorState(page);
    await saved(page);
    await page.reload();
    await ready(page);
    await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
    await page.getByRole('button', { name: 'My elements', exact: true }).click();
    await expect.poll(() => vectorState(page)).toEqual(resetState);
    expect(await vectorObjects(page)).toHaveLength(1);
    expect(await rendered(page)).toBe(originalImage);
    const restoredCenter = await vectorClientCenter(page);
    await page.mouse.click(restoredCenter.x, restoredCenter.y);
    await expect(page.locator('[data-ui="editor.vector.properties"]')).toBeVisible();
    await property(page, 'presets').click();
    await choose(
      page,
      page.getByRole('button', { name: 'Presets for this element', exact: true }),
      'Proof palette'
    );
    await expect.poll(() => rendered(page)).toBe(changedImage);
    await noHorizontalScroll(page);
    await page.screenshot({
      path: info.outputPath('persisted-palette-applied.png'),
      fullPage: false,
    });
  });
}
