import { expect, type Page, type TestInfo, type Locator } from '@playwright/test';
import {
  applyHarnessBootstrap,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';

async function documentCommand(
  page: Page,
  scope: Locator,
  command: string,
  kind: 'item' | 'block' | 'insert'
) {
  const selector =
    kind === 'insert'
      ? '.guide-insertion-block[data-end="true"] button'
      : kind === 'item'
        ? '.guide-item-actions button'
        : '.guide-block-actions button';
  const trigger = scope.locator(selector).first();
  await trigger.focus();
  await trigger.click();
  await page
    .locator('.guide-action-menu')
    .getByRole('button', { name: command, exact: true })
    .click();
}

export async function verifyStepNavigation(page: Page): Promise<void> {
  await expect(page.locator('article#compare')).toBeFocused();
  await page.getByRole('link', { name: 'Text-only step', exact: true }).click();
  await expect(page.locator('article#text-only')).toBeFocused();
  await expect(page).toHaveURL(/stepId=text-only/);
}

export async function verifySaveAndReopen(page: Page): Promise<void> {
  const title = page.locator('article#text-only .guide-step-title');
  await title.fill('Saved local step');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const reopen = new URL(page.url());
  reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  reopen.searchParams.set('locale', 'en');
  await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('article#text-only .guide-step-title')).toHaveValue('Saved local step');
  await expect(page.locator('article#text-only')).toBeFocused();
}

export async function verifyIndependentProjectCopy(page: Page): Promise<void> {
  const original = new URL(page.url());
  original.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  original.searchParams.set('locale', 'en');
  const originalId = original.searchParams.get('projectId');
  const originalTitle = await page.locator('article#text-only .guide-step-title').inputValue();
  await page.locator('article#text-only .guide-step-title').fill('Unsaved content copied');
  await page.locator('.guide-page-header .guide-action-menu-anchor button').click();
  await page.getByRole('button', { name: 'Duplicate project', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('projectId')).not.toBe(originalId);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await expect(page.locator('article .guide-step-title').nth(1)).toHaveValue(
    'Unsaved content copied'
  );
  await page
    .getByRole('textbox', { name: 'Scenario', exact: true })
    .fill('Renamed independent guide');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const copied = new URL(page.url());
  copied.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  copied.searchParams.set('locale', 'en');
  await page.goto(original.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('article#text-only .guide-step-title')).toHaveValue(originalTitle);
  await page.locator('.guide-page-header .guide-action-menu-anchor button').click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(2);
  await page.locator('.guide-page-header .guide-action-menu-anchor button').click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('projectId')).toBeNull();
  await page.goto(copied.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(
    'Renamed independent guide'
  );
  await expect(page.locator('article .guide-step-title').nth(1)).toHaveValue(
    'Unsaved content copied'
  );
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
  await expect(page.locator('article#compare .guide-step-title')).toBeFocused();
  await page.locator('article#text-only .guide-step-title').focus();
  await expect(page.locator('article#text-only .guide-step-title')).toBeFocused();
  await expect(page.locator('article#text-only')).toHaveAttribute('data-selected', 'true');
  await page
    .locator('#guide-library-panel')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  const inspector = page.locator('#guide-inspector-panel');
  if (await inspector.isVisible())
    await inspector.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#guide-library-panel')).toBeHidden();
  await expect(page.locator('#guide-inspector-panel')).toBeHidden();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const save = page
    .locator('.guide-page-header')
    .getByRole('button', { name: 'Inspector', exact: true });
  await expect(save).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page
    .locator('.guide-page-header')
    .getByRole('button', { name: 'Outline', exact: true })
    .click();
  await expect(page.locator('#guide-library-panel')).toBeVisible();
  await expect(save).toBeInViewport();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
}

export async function verifyGuideComposition(page: Page): Promise<void> {
  const step = page.locator('article#text-only');
  await step.getByRole('textbox', { name: 'Step title', exact: true }).fill('Flexible step');
  await documentCommand(page, step, 'Text', 'insert');
  await documentCommand(page, step, 'Text', 'insert');
  await documentCommand(page, step, 'Heading', 'insert');
  await documentCommand(page, step, 'Note', 'insert');
  await step.locator('.guide-description').nth(0).fill('First explanation');
  await step.locator('.guide-description').nth(1).fill('Second explanation');
  await step.getByRole('textbox', { name: 'Heading', exact: true }).fill('Detail');
  await step.getByRole('textbox', { name: 'Note text', exact: true }).fill('Remember this');
  await page.getByRole('checkbox', { name: 'Show step number', exact: true }).uncheck();
  await expect(step.locator('header span')).toHaveCount(0);
  await step.locator('.guide-block').first().hover();
  await documentCommand(page, step.locator('.guide-block').first(), 'Duplicate block', 'block');
  await expect(step.locator('.guide-block')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(step.locator('.guide-block')).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(step.locator('.guide-block')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const heading = step
    .locator('.guide-block')
    .filter({ has: page.getByRole('textbox', { name: 'Heading', exact: true }) });
  await heading.hover();
  await documentCommand(page, heading, 'Move up', 'block');
  await heading.hover();
  await documentCommand(page, heading, 'Split step here', 'block');
  await expect(page.locator('article')).toHaveCount(3);
  await expect(step.locator('.guide-block')).toHaveCount(1);
  await page.getByRole('link', { name: 'Flexible step', exact: true }).click();
  await documentCommand(
    page,
    page.locator('.guide-document > [data-selected="true"]'),
    'Merge with next step',
    'item'
  );
  await expect(page.locator('article')).toHaveCount(2);
  await expect(step.locator('.guide-block')).toHaveCount(4);
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByRole('textbox', { name: 'Section title', exact: true }).last().fill('Finish');
  await documentCommand(
    page,
    page.locator('.guide-document > [data-selected="true"]'),
    'Move up',
    'item'
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const reopen = new URL(page.url());
  reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  reopen.searchParams.set('locale', 'en');
  await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.guide-section-title').last()).toHaveValue('Finish');
  await expect(page.locator('article#text-only .guide-block')).toHaveCount(4);
  await expect(page.locator('article#text-only .guide-description').first()).toHaveValue(
    'First explanation'
  );
  await expect(page.locator('article#text-only .guide-block-heading')).toHaveValue('Detail');
  await expect(page.locator('article#text-only header span')).toHaveCount(0);
  await expect(page.locator('.guide-document img')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
}

export async function verifyImageImport(page: Page, testInfo: TestInfo): Promise<void> {
  const before = await page.locator('article').count();
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await page.getByRole('button', { name: 'Image library', exact: true }).click();
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
  await page
    .getByRole('dialog', { name: 'Resources', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(page.locator('article').nth(before).locator('header .guide-step-title')).toHaveValue(
    'second-import.png'
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
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
  await page.locator('.guide-page-header .guide-action-menu-anchor button').click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(0);
}

export async function verifyImageFraming(page: Page, testInfo: TestInfo): Promise<void> {
  const figure = page.locator('article#compare figure').first();
  await figure.hover();
  await figure.getByRole('button', { name: 'Frame and image', exact: true }).click();
  await figure.getByRole('button', { name: 'Center image', exact: true }).click();
  await figure.getByRole('button', { name: 'Fill', exact: true }).click();
  await figure.getByRole('spinbutton', { name: 'Frame width', exact: true }).fill('500');
  await figure.getByRole('spinbutton', { name: 'Frame height', exact: true }).fill('320');
  await figure.getByRole('spinbutton', { name: 'Zoom, %', exact: true }).fill('150');
  await figure.getByRole('textbox', { name: 'Caption', exact: true }).fill('Framed screenshot');
  await figure
    .getByRole('textbox', { name: 'Alternative text', exact: true })
    .fill('A framed interface');
  const frame = figure.locator('.guide-image-frame');
  await frame.scrollIntoViewIfNeeded();
  const rect = await frame.boundingBox();
  if (!rect) throw new Error('Missing image frame');
  await page.mouse.move(rect.x + 80, rect.y + 80);
  await page.mouse.down();
  await page.mouse.move(rect.x + 120, rect.y + 100);
  await page.mouse.up();
  await expect
    .poll(() =>
      figure
        .locator('img')
        .evaluate((image) => getComputedStyle(image).translate.split(' ').map(Number.parseFloat))
    )
    .toEqual([expect.closeTo(4000 / rect.width, 3), expect.closeTo(2000 / rect.height, 3)]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(figure.locator('img')).toHaveCSS('translate', /^(0%|0px)( (0%|0px))?$/);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(() =>
      figure
        .locator('img')
        .evaluate((image) => getComputedStyle(image).translate.split(' ').map(Number.parseFloat))
    )
    .toEqual([expect.closeTo(4000 / rect.width, 3), expect.closeTo(2000 / rect.height, 3)]);
  await testInfo.attach('image-framing', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await figure.locator('.guide-image-controls').scrollIntoViewIfNeeded();
  await testInfo.attach('image-framing-controls', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1024, height: 640 });
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const reopen = new URL(page.url());
  reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  reopen.searchParams.set('locale', 'en');
  await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
  await expect(figure.locator('figcaption')).toHaveText('Framed screenshot');
  await expect(figure.locator('img')).toHaveAttribute('alt', 'A framed interface');
  await expect
    .poll(() =>
      figure
        .locator('img')
        .evaluate((image) => getComputedStyle(image).translate.split(' ').map(Number.parseFloat))
    )
    .toEqual([expect.closeTo(4000 / rect.width, 3), expect.closeTo(2000 / rect.height, 3)]);
  await expect(figure.locator('img')).toHaveCSS('scale', '1.5');
  await expect(figure.locator('img')).toHaveCSS('object-fit', 'cover');
  await expect(frame).toHaveAttribute('style', /width: min\(100%, 500px\)/);
  expect((await frame.boundingBox())?.width).toBeLessThanOrEqual(500);
}

export async function verifyImageEditorRoundtrip(page: Page, testInfo: TestInfo): Promise<void> {
  const launch = page.locator('[data-edit-image]').first();
  const title = page.locator('article#compare > header .guide-step-title');
  await title.fill('Unsaved title retained through annotations');
  const originalImage = await page.locator('.guide-image-frame img').first().getAttribute('src');
  await page.locator('article#compare figure').first().hover();
  await launch.click();
  const child = page.frameLocator('.guide-image-editor iframe');
  const apply = child.locator('[data-ui="editor.floating.document-bar.save-for-slide-button"]');
  await expect(apply).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 640 });
  await expect(apply).toBeVisible();
  await testInfo.attach('guide-image-editor-local-frame', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Back without applying' }).click();
  await expect(launch).toBeFocused();
  await expect(title).toHaveValue('Unsaved title retained through annotations');
  await expect(page.locator('.guide-image-frame img').first()).toHaveAttribute(
    'src',
    originalImage ?? ''
  );
  await page.locator('article#compare figure').first().hover();
  await launch.click();
  await expect(apply).toBeVisible();
  await child.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
  const canvas = child.locator('canvas.upper-canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing editor canvas');
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  await apply.click();
  await expect(page.locator('.guide-image-editor')).toHaveCount(0);
  await expect(launch).toBeFocused();
  await expect(title).toHaveValue('Unsaved title retained through annotations');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const firstPublication = await readImageEditProof(page);
  expect(firstPublication.annotations).toBeGreaterThan(0);
  expect(firstPublication.standaloneWorkspaces).toBe(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveValue('Unsaved title retained through annotations');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.reload();
  await expect(title).toHaveValue('Unsaved title retained through annotations');
  await page.locator('article#compare figure').first().hover();
  await launch.click();
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(page.locator('.guide-image-editor')).toHaveCount(0);
  const reopened = await readImageEditProof(page);
  expect(reopened.annotations).toBe(firstPublication.annotations);
  expect(reopened.standaloneWorkspaces).toBe(0);
  await page.locator('article#compare figure').first().hover();
  await launch.click();
  await expect(apply).toBeVisible();
  await child.locator('[data-ui="editor.floating.document-bar.close-scenario-button"]').click();
  await expect(launch).toBeFocused();
}

async function readImageEditProof(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(['scenario_step_editor_documents', 'image_workspaces'], 'readonly');
      const documents = await new Promise<Array<{ document: { canvasJson: string } }>>(
        (resolve, reject) => {
          const request = tx.objectStore('scenario_step_editor_documents').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
      const standaloneWorkspaces = await new Promise<number>((resolve, reject) => {
        const request = tx.objectStore('image_workspaces').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return {
        annotations: Math.max(
          0,
          ...documents.map((entry) => {
            const canvas = JSON.parse(entry.document.canvasJson) as {
              objects?: Array<{ type?: string }>;
            };
            return (
              canvas.objects?.filter((object) => object.type?.toLowerCase() === 'path').length ?? 0
            );
          })
        ),
        standaloneWorkspaces,
      };
    } finally {
      db.close();
    }
  });
}

export async function verifySavedVersionHistory(page: Page, testInfo: TestInfo): Promise<void> {
  const title = page.locator('article#compare > header .guide-step-title');
  await title.fill('Historical version A');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await title.fill('Historical version B');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const url = new URL(page.url());
  url.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  url.searchParams.set('locale', 'en');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await expect(title).toHaveValue('Historical version B');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveValue('Historical version A');
  await expect(page.locator('.guide-image-frame img')).toHaveCount(2);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await testInfo.attach('persisted-undo', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(title).toHaveValue('Historical version B');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await expect(title).toHaveValue('Historical version B');
}

export async function verifyResourceRetention(page: Page): Promise<void> {
  const reopen = new URL(page.url());
  reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  reopen.searchParams.set('locale', 'en');
  const originalAssetCount = await readProjectAssetCount(page);
  const second = await page.context().newPage();
  try {
    await applyHarnessBootstrap(second, { preserveMediaLibrary: true });
    await second.goto(reopen.toString());
    await expect(second.locator('.guide-image-frame img')).toHaveCount(2);
    await documentCommand(page, page.locator('article#compare'), 'Remove item', 'item');
    await expect(page.locator('article#compare')).toHaveCount(0);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.guide-image-frame img')).toHaveCount(2);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    const retentionUrl = new URL(reopen);
    retentionUrl.searchParams.set('clearHistory', '1');
    await page.goto(retentionUrl.toString());
    await expect(page.locator('article#text-only')).toBeVisible();
    expect(await readProjectAssetCount(page)).toBe(originalAssetCount);
    await expect(second.locator('.guide-image-frame img')).toHaveCount(2);
    await expect
      .poll(() =>
        second
          .locator('.guide-image-frame img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
            )
          )
      )
      .toBe(true);
    await page.goto(reopen.toString());
    await expect(page.locator('article#text-only')).toBeVisible();
    expect(await readProjectAssetCount(page)).toBe(originalAssetCount);
    await second.close();
    await page.goto('about:blank');
    await page.goto(reopen.toString());
    await expect(page.locator('article#text-only')).toBeVisible();
    await expect.poll(() => readProjectAssetCount(page)).toBe(0);
    await expect(page.locator('article#compare')).toHaveCount(0);
  } finally {
    if (!second.isClosed()) await second.close();
  }
}

async function readProjectAssetCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const id = new URL(location.href).searchParams.get('projectId');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db
          .transaction('scenario_assets', 'readonly')
          .objectStore('scenario_assets')
          .index('projectId')
          .count(id ?? '');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
