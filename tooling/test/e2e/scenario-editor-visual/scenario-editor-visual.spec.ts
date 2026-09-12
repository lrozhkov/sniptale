import { expectLibraryDrawerPlacement } from '../extension-smoke/video-editor-layout.test-support';
import { expect, type Locator } from '@playwright/test';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
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
  test(`guide layouts and default appearance preserve images in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    await verifyGuideAppearance(page, testInfo);
    issues.assertClean();
  });
}

test('panel headers close panels and transparent dividers resize the workspace', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1920, height: 1080 });
  const header = page.locator('.guide-page-header');
  expect((await header.boundingBox())?.height).toBeLessThanOrEqual(52);
  expect((await page.locator('.guide-project-name').boundingBox())?.width).toBeLessThan(
    (await header.boundingBox())!.width
  );
  await expect(header.getByRole('button', { name: 'Outline', exact: true })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Inspector', exact: true })).toHaveCount(0);
  await expect(page.locator('.guide-workspace-bar')).toHaveCount(0);
  await page.locator('article#compare').focus();
  await expect(page.locator('article#compare')).toHaveCSS('outline-width', '1px');
  const divider = page.getByRole('separator', { name: 'Outline', exact: true });
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '304');
  expect((await page.locator('#guide-library-panel').boundingBox())?.width).toBeCloseTo(304, 0);
  await page
    .locator('#guide-library-panel')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(page.locator('#guide-library-panel')).toBeHidden();
  await header.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(divider).toHaveAttribute('aria-valuenow', '304');
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`project menu stays compact and keyboard accessible in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1024, height: 768 });
    const trigger = page.locator('.guide-page-header .guide-action-menu-anchor button');
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

test('document text fits its content while wrapping and resizing', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await openVisualHarness(page, hostOrigin, 'dark', 'en', { width: 1024, height: 768 });
  const title = page.locator('article#compare > header :is(input, textarea)');
  await title.fill(
    'A long step title that should wrap naturally across the document without hiding its ending'
  );
  await expect
    .poll(() => title.evaluate((field) => field.scrollWidth <= field.clientWidth + 1))
    .toBe(true);
  const body = page.locator('article#compare .guide-description');
  await body.fill('A detailed explanation stays visible in the document. '.repeat(35));
  await expect(body).toHaveCSS('outline-style', 'none');
  await expect
    .poll(() => body.evaluate((field) => field.scrollHeight <= field.clientHeight + 1))
    .toBe(true);
  await testInfo.attach('inline-text-narrow', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const narrowHeight = await body.evaluate((field) => field.clientHeight);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => body.evaluate((field) => field.clientHeight)).toBeLessThan(narrowHeight);
  await body.fill('Short explanation.');
  await expect.poll(() => body.evaluate((field) => field.clientHeight)).toBeLessThan(50);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
});

test('document tools are contextual and leave image geometry unchanged', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  await expect(page.locator('.guide-add-blocks')).toHaveCount(0);
  const image = page.locator('article#compare .guide-image-frame').first();
  const tools = page.locator('article#compare .guide-image-tools').first();
  await page.mouse.move(10, 10);
  await expect(tools).toHaveCSS('opacity', '0');
  const before = await image.boundingBox();
  await image.hover();
  await expect(tools).toHaveCSS('opacity', '1');
  expect(await image.boundingBox()).toEqual(before);
  const miniButton = tools.getByRole('button').first();
  await miniButton.hover();
  const buttonSurface = await miniButton.evaluate((button) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--sniptale-color-surface-canvas)';
    button.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  await expect(miniButton).toHaveCSS('background-color', buttonSurface);
  const insertion = page
    .locator('article#compare [data-insert-before="before"]')
    .getByRole('button', { name: 'Heading', exact: true });
  await expect(insertion).toHaveCount(1);
  await insertion.focus();
  await expect(insertion.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await testInfo.attach('direct-boundary-icons', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Enter');

  const heading = page.locator('article#compare .guide-block-heading');
  await expect(heading).toBeFocused();
  await expect(page.locator('article#compare .guide-block').nth(1)).toHaveAttribute(
    'data-kind',
    'heading'
  );
  await heading.fill('Inserted between text and image');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading).toHaveValue('');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(heading).toHaveCount(0);
  await page
    .locator('.guide-insertion-item[data-insert-before="compare"]')
    .getByRole('button', { name: 'Add step', exact: true })
    .focus();
  await page.keyboard.press('Enter');

  const insertedTitle = page.locator('.guide-step-title:focus');
  await expect(insertedTitle).toHaveCount(1);
  await insertedTitle.fill('Inserted before the illustrated step');
  await expect(page.locator('article').first().locator('.guide-step-title')).toHaveValue(
    'Inserted before the illustrated step'
  );
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.mouse.move(10, 10);
  await testInfo.attach('contextual-document-tools', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('main article')).toHaveCount(2);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
});

test('resources open in a wide drawer and return focus to their inspector', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await openVisualHarness(page, hostOrigin, 'dark', 'en', { width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Image library', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Resources', exact: true });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBeGreaterThan(900);
  await expect(
    page.locator('.guide-library-panel').getByRole('button', { name: 'Resources', exact: true })
  ).toBeVisible();
  await expect(drawer.getByRole('navigation', { name: 'Library sections' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Library screenshot.png', exact: true }).click();
  await expect(drawer.locator('.guide-library-preview img')).toBeVisible();
  await page.setViewportSize({ width: 640, height: 720 });
  const box = await drawer.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(640);
  await testInfo.attach('resources-drawer-narrow', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await testInfo.attach('resources-drawer-dark', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('workspace has three aligned surface headers and restores panels by section', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1440, height: 900 });
  await expect(page.locator('.guide-library-link')).toHaveCount(0);
  await expect(page.locator('.guide-center-panel > .guide-page-header')).toBeVisible();
  const headers = page.locator(
    '.guide-workspace > .guide-library-panel > .guide-panel-heading, .guide-center-panel > .guide-page-header, .guide-workspace > .guide-inspector-panel > .guide-panel-heading'
  );
  await expect(headers).toHaveCount(3);
  const boxes = await headers.evaluateAll((elements) =>
    elements.map((element) => ({
      top: element.getBoundingClientRect().top,
      height: element.getBoundingClientRect().height,
    }))
  );
  expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
  expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
  const center = page.locator('.guide-center-panel > .guide-page-header');
  await page
    .locator('#guide-library-panel')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(center.getByRole('button', { name: 'Outline', exact: true })).toBeVisible();
  await center.getByRole('button', { name: 'Resources', exact: true }).click();
  await expect(
    page.locator('#guide-library-panel').getByRole('button', { name: 'Image library', exact: true })
  ).toBeVisible();
  await expect(center.getByRole('button', { name: 'Resources', exact: true })).toHaveCount(0);
  await page
    .locator('#guide-inspector-panel')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await center.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(center.getByRole('button', { name: 'Inspector', exact: true })).toHaveCount(0);
  const divider = page.getByRole('separator', { name: 'Outline', exact: true });
  await divider.hover();
  await expect(divider).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('inline text highlights its own rounded edge and hides empty placeholders on focus', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1440, height: 900 });
  const title = page.locator('article#compare .guide-step-title');
  await title.focus();
  await expect(title).toHaveCSS('outline-style', 'none');
  await expect(title).toHaveCSS('border-top-width', '1px');
  const colors = await title.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sniptale-color-accent)';
    element.parentElement!.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return {
      actual: getComputedStyle(element).borderTopColor,
      expected,
      radius: parseFloat(getComputedStyle(element).borderTopLeftRadius),
      placeholder: getComputedStyle(element, '::placeholder').opacity,
    };
  });
  expect(colors.actual).toBe(colors.expected);
  expect(colors.radius).toBeGreaterThan(0);
  expect(colors.placeholder).toBe('0');
  await title.blur();
  expect(
    await title.evaluate((element) => getComputedStyle(element, '::placeholder').opacity)
  ).toBe('1');
});

test('project title expands within the center and history sits beside the outer menu', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1920, height: 1080 });
  const header = page.locator('.guide-page-header');
  const title = header.locator('input');
  const before = (await title.boundingBox())!.width;
  await title.focus();
  expect(await title.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
  expect((await title.boundingBox())!.width).toBeGreaterThan(before);
  const menu = header.locator('.guide-action-menu-anchor');
  const redo = header.getByRole('button', { name: 'Redo', exact: true });
  expect((await menu.boundingBox())!.x).toBeGreaterThan((await redo.boundingBox())!.x);
  expect((await title.boundingBox())!.x + (await title.boundingBox())!.width).toBeLessThan(
    (await redo.boundingBox())!.x
  );
  const divider = page.getByRole('separator', { name: 'Outline', exact: true });
  expect(await divider.getAttribute('aria-valuenow')).toBe(
    await divider.getAttribute('aria-valuemax')
  );
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`empty image slots fill from a file and undo after reopening in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const reopen = async () => {
      const url = new URL(page.url());
      url.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
      url.searchParams.set('theme', theme);
      url.searchParams.set('locale', 'en');
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    };
    const step = page.locator('article#compare');
    const count = await step.locator('.guide-block').count();
    const add = step
      .locator('.guide-insertion-block[data-end="true"]')
      .getByRole('button', { name: 'Image', exact: true });
    await add.focus();
    await add.click();
    const slot = step.locator('[data-kind="image-slot"]');
    await expect(slot.getByRole('button', { name: 'Upload image', exact: true })).toBeFocused();
    const id = await slot.getAttribute('data-block-id');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await reopen();
    await expect(slot).toHaveCount(1);
    await slot.locator('input[type="file"]').setInputFiles({
      name: 'invalid.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg/>'),
    });
    await expect(slot.getByRole('alert')).toBeVisible();
    const encoded = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#2767a5';
      context.fillRect(0, 0, 160, 90);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    await slot.locator('input[type="file"]').setInputFiles({
      name: 'slot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(encoded, 'base64'),
    });
    await expect(slot).toHaveCount(0);
    const filled = step.locator(`[data-block-id="${id}"]`);
    await expect(filled).toHaveAttribute('data-kind', 'image');
    await expect(filled.locator('img')).toBeVisible();
    await expect(step.locator('.guide-block')).toHaveCount(count + 1);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await reopen();
    await expect(filled.locator('img')).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(slot).toHaveCount(1);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        step
          .locator('img')
          .evaluateAll(
            (images) =>
              images.length === 2 &&
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
              )
          )
      )
      .toBe(true);
    await slot.scrollIntoViewIfNeeded();
    await testInfo.attach(`empty-image-slot-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(step.locator('.guide-block')).toHaveCount(count);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
  });
}

test('image drops append, replace and fill slots with one Undo per gesture', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const resource = page.locator('.guide-resource').first();
  const step = page.locator('article#compare');
  const count = await step.locator('.guide-block').count();
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await resource.dragTo(step.locator('.guide-step-title'));
  await expect(step.locator('.guide-block')).toHaveCount(count + 1);
  await undo.click();
  await expect(step.locator('.guide-block')).toHaveCount(count);
  const image = step.locator('[data-kind="image"]').last();
  const id = await image.getAttribute('data-block-id');
  const original = await image.locator('img').getAttribute('src');
  await resource.dragTo(image.locator('img'));
  await expect(step.locator('.guide-block')).toHaveCount(count);
  await expect(image).toHaveAttribute('data-block-id', id!);
  await expect(image.locator('img')).toHaveAttribute(
    'src',
    (await resource.locator('img').getAttribute('src')) ?? ''
  );
  await undo.click();
  await expect(image.locator('img')).toHaveAttribute('src', original!);
  const add = step
    .locator('.guide-insertion-block[data-end="true"]')
    .getByRole('button', { name: 'Image', exact: true });
  await add.focus();
  await add.click();
  const slot = step.locator('[data-kind="image-slot"]');
  const slotId = await slot.getAttribute('data-block-id');
  await resource.dragTo(slot.getByRole('button', { name: 'Upload image', exact: true }));
  await expect(slot).toHaveCount(0);
  await expect(step.locator(`[data-block-id="${slotId}"]`)).toHaveAttribute('data-kind', 'image');
  await undo.click();
  await expect(slot).toHaveCount(1);
  const transfer = await page.evaluateHandle(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#2767a5';
    context.fillRect(0, 0, 32, 32);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('No image'))),
        'image/png'
      )
    );
    const data = new DataTransfer();
    data.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
    return data;
  });
  await slot.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(slot).toHaveCount(0);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await undo.click();
  await expect(slot).toHaveCount(1);
  await undo.click();
  await expect(step.locator('.guide-block')).toHaveCount(count);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await transfer.dispose();
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`image slot selects a library image in ${theme}`, async ({ page, hostOrigin }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const step = page.locator('article#compare');
    const count = await step.locator('.guide-block').count();
    const add = step
      .locator('.guide-insertion-block[data-end="true"]')
      .getByRole('button', { name: 'Image', exact: true });
    await add.focus();
    await add.click();
    const slot = step.locator('[data-kind="image-slot"]');
    const id = await slot.getAttribute('data-block-id');
    const trigger = slot.getByRole('button', { name: 'Image library', exact: true });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Resources', exact: true });
    await expect(drawer.getByRole('group', { name: 'Add images' })).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Library screenshot.png', exact: true }).click();
    await expect(drawer.locator('.guide-library-preview img')).toBeVisible();
    await expect(
      drawer.getByRole('button', { name: 'Import selected', exact: true })
    ).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await testInfo.attach(`targeted-library-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await drawer.getByRole('button', { name: 'Library screenshot.png', exact: true }).click();
    await drawer.getByRole('button', { name: 'Import selected', exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(step.locator(`[data-block-id="${id}"]`)).toHaveAttribute('data-kind', 'image');
    await expect(step.locator('.guide-block')).toHaveCount(count + 1);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(slot).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(step.locator('.guide-block')).toHaveCount(count);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    const existing = step.locator('[data-block-id="before"]');
    const caption = await existing.locator('figcaption').textContent();
    await existing.hover();
    await existing.getByRole('button', { name: 'Replace image', exact: true }).click();
    await drawer.getByRole('textbox', { name: 'Search images' }).fill('missing image');
    await expect(drawer.locator('.guide-library-card')).toHaveCount(0);
    await drawer.getByRole('textbox', { name: 'Search images' }).fill('Library');
    await drawer.getByRole('button', { name: 'Library screenshot.png', exact: true }).click();
    await drawer.getByRole('button', { name: 'Import selected', exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(step.locator('.guide-block')).toHaveCount(count);
    await expect(existing.locator('figcaption')).toHaveText(caption ?? '');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('status').first()).toHaveText('Saved');
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`native library drag reaches the document and cancels cleanly in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    const trigger = page
      .locator('.guide-library-panel')
      .getByRole('button', { name: 'Image library', exact: true });
    const drawer = page.getByRole('dialog', { name: 'Resources', exact: true });
    const card = drawer.getByRole('button', { name: 'Library screenshot.png', exact: true });
    const dragToDocument = async (target: Locator) => {
      await card.hover();
      // The target is covered until dragstart yields the modal's hit testing.
      await card.dragTo(target, { force: true });
    };
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const empty = page.locator('article#text-only');
    const initial = await empty.locator('.guide-block').count();
    await empty.scrollIntoViewIfNeeded();
    await trigger.click();
    await dragToDocument(empty.locator('.guide-step-title'));
    await expect(drawer).toHaveCount(0);
    await expect(empty.locator('.guide-block')).toHaveCount(initial + 1);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await undo.click();
    await expect(empty.locator('.guide-block')).toHaveCount(initial);
    const step = page.locator('article#compare');
    const count = await step.locator('.guide-block').count();
    const existing = step.locator('[data-block-id="before"]');
    const caption = await existing.locator('figcaption').textContent();
    await existing.scrollIntoViewIfNeeded();
    await trigger.click();
    await dragToDocument(existing.locator('img'));
    await expect(drawer).toHaveCount(0);
    await expect(step.locator('.guide-block')).toHaveCount(count);
    await expect(existing.locator('figcaption')).toHaveText(caption ?? '');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await undo.click();
    const add = step
      .locator('.guide-insertion-block[data-end="true"]')
      .getByRole('button', { name: 'Image', exact: true });
    await add.focus();
    await add.click();
    const slot = step.locator('[data-kind="image-slot"]');
    await slot.scrollIntoViewIfNeeded();
    await trigger.click();
    await dragToDocument(slot);
    await expect(drawer).toHaveCount(0);
    await expect(slot).toHaveCount(0);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await undo.click();
    await expect(slot).toHaveCount(1);
    await undo.click();
    await expect(step.locator('.guide-block')).toHaveCount(count);
    await trigger.click();
    await card.hover();
    const point = await card.boundingBox();
    if (!point) throw new Error('Missing library card');
    await page.mouse.down();
    await page.mouse.move(point.x + point.width / 2 + 20, point.y + point.height / 2 + 20, {
      steps: 4,
    });
    await expect(page.locator('.guide-resource-dragging')).toHaveCount(1);
    await expect(card).toHaveCount(1);
    await testInfo.attach(`library-native-drag-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(step.locator('.guide-block')).toHaveCount(count);
    await trigger.click();
    await dragToDocument(page.locator('.guide-page-header'));
    await expect(drawer).toHaveCount(0);
    await expect(step.locator('.guide-block')).toHaveCount(count);
    await expect(empty.locator('.guide-block')).toHaveCount(initial);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`block width supports columns, gestures and narrow layouts in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    const step = page.locator('article#compare');
    const first = step.locator('[data-block-id="before"]');
    const second = step.locator('[data-block-id="after"]');
    const control = first.locator('.guide-block-width');
    await first.scrollIntoViewIfNeeded();
    await control.focus();
    await page.keyboard.press('Enter');
    await second.locator('.guide-block-width').focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('data-width', '50');
    await expect(second).toHaveAttribute('data-width', '50');
    const half = await first.boundingBox();
    const neighbor = await second.boundingBox();
    expect(half && neighbor && Math.abs(half.y - neighbor.y)).toBeLessThan(2);
    const firstWidth = await control.boundingBox();
    const secondGrip = await second.locator('.guide-block-grip').boundingBox();
    expect(firstWidth && secondGrip && firstWidth.x + firstWidth.width <= secondGrip.x).toBe(true);
    await control.click();
    await expect(first).toHaveAttribute('data-width', '100');
    const full = await first.boundingBox();
    expect(full && half && full.width / half.width).toBeGreaterThan(1.9);
    await control.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(first).toHaveAttribute('data-width', '99');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(first).toHaveAttribute('data-width', '89');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('data-width', '50');
    await page.setViewportSize({ width: 1024, height: 900 });
    const narrowFirst = await first.boundingBox();
    const narrowSecond = await second.boundingBox();
    expect(
      narrowFirst && narrowSecond && Math.abs(narrowFirst.width - narrowSecond.width)
    ).toBeLessThan(2);
    expect(narrowFirst && narrowSecond && Math.abs(narrowFirst.y - narrowSecond.y)).toBeLessThan(2);
    await testInfo.attach(`block-columns-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.reload();
    await expect(first).toHaveAttribute('data-width', '50');
    await expect(second).toHaveAttribute('data-width', '50');
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`block grip reorders with one Undo and cancels cleanly in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    const step = page.locator('article#compare');
    const blocks = step.locator('.guide-block');
    const order = () =>
      blocks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id')));
    const original = await order();
    const first = step.locator('[data-block-id="before"]');
    const last = step.locator('[data-block-id="after"]');
    const grip = first.locator('.guide-block-grip');
    const caption = await first.locator('figcaption').textContent();
    const width = await first.getAttribute('data-width');
    await grip.focus();
    await grip.hover();
    const start = await grip.boundingBox();
    if (!start) throw new Error('Missing reorder grip');
    const blockBox = await first.boundingBox();
    expect(blockBox && start.x + start.width <= blockBox.x).toBe(true);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 20, start.y + start.height / 2 + 20, {
      steps: 4,
    });
    await last.scrollIntoViewIfNeeded();
    const target = await last.boundingBox();
    if (!target) throw new Error('Missing reorder target');
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, {
      steps: 8,
    });
    await expect(page.locator('.guide-block-drag-preview')).toBeVisible();
    await expect(page.locator('.guide-block-drag-preview button')).toHaveCount(0);
    expect(await last.evaluate((node) => getComputedStyle(node).cursor)).toBe('grabbing');
    expect(await grip.evaluate((node) => getComputedStyle(node).opacity)).toBe('0');
    await testInfo.attach(`block-drag-preview-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.mouse.up();
    await expect(page.locator('.guide-block-drag-preview')).toHaveCount(0);
    await expect.poll(order).toEqual([...original.filter((id) => id !== 'before'), 'before']);
    await expect(first.locator('figcaption')).toHaveText(caption ?? '');
    await expect(first).toHaveAttribute('data-width', width!);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(order).toEqual(original);
    await grip.focus();
    await grip.hover();
    const point = await grip.boundingBox();
    if (!point) throw new Error('Missing block grip');
    await page.mouse.down();
    await page.mouse.move(point.x + point.width / 2 + 20, point.y + point.height / 2 + 20, {
      steps: 4,
    });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('html')).not.toHaveAttribute('data-guide-reordering');
    await expect(step.locator('[data-reorder]')).toHaveCount(0);
    await expect.poll(order).toEqual(original);
    await grip.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(order).toEqual([...original.filter((id) => id !== 'before'), 'before']);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(order).toEqual(original);
    await first.hover();
    const gripBox = await grip.boundingBox();
    const imageAction = await first.locator('.guide-image-tools > button').first().boundingBox();
    expect(gripBox && imageAction && gripBox.x + gripBox.width <= imageAction.x).toBe(true);
    await testInfo.attach(`block-grip-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await expect(page.getByRole('status').first()).toHaveText('Saved');
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`note callouts preserve tone, text and undo in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      { width: 1920, height: 1080 },
      'text-only'
    );
    const step = page.locator('article#text-only');
    const add = step
      .locator('.guide-insertion-block')
      .last()
      .getByRole('button', { name: 'Note', exact: true });
    await add.focus();
    await add.click();
    const block = step
      .locator('.guide-block')
      .filter({ has: page.locator('.guide-note-callout') })
      .last();
    const id = await block.getAttribute('data-block-id');
    const note = block.locator('.guide-note-callout');
    const text = note.getByRole('textbox', { name: 'Note text', exact: true });
    await text.fill('Keep this information with the step.');
    const select = async (label: string) => {
      await note.getByRole('button', { name: 'Note type', exact: true }).click();
      await page
        .locator('.guide-action-menu')
        .getByRole('button', { name: label, exact: true })
        .click();
    };
    for (const [label, tone] of [
      ['Note', 'neutral'],
      ['Information', 'info'],
      ['Warning', 'warning'],
      ['Error', 'error'],
    ]) {
      await select(label!);
      await expect(note).toHaveAttribute('data-tone', tone!);
      await expect(text).toHaveValue('Keep this information with the step.');
      await testInfo.attach(`note-${theme}-${tone}`, {
        body: await block.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(note).toHaveAttribute('data-tone', 'warning');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(note).toHaveAttribute('data-tone', 'error');
    await block.locator('.guide-block-width').focus();
    await page.keyboard.press('Enter');
    await expect(block).toHaveAttribute('data-width', '50');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    const url = new URL(page.url());
    url.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    url.searchParams.set('theme', theme);
    url.searchParams.set('locale', 'en');
    url.searchParams.set('stepId', 'text-only');
    await page.goto(url.toString());
    const restored = page.locator(`[data-block-id="${id}"]`);
    await expect(restored).toHaveAttribute('data-width', '50');
    await expect(restored.locator('.guide-note-callout')).toHaveAttribute('data-tone', 'error');
    await expect(restored.locator('textarea')).toHaveValue('Keep this information with the step.');
    await restored.getByRole('button', { name: 'Note type', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(restored.getByRole('button', { name: 'Note type', exact: true })).toBeFocused();
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

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`external grips leave text clear and stay reachable across the hover gutter in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1024, height: 640 });
    const step = page.locator('article#text-only');
    for (const [command, kind] of [
      ['Text', 'text'],
      ['Heading', 'heading'],
      ['Note', 'note'],
    ] as const) {
      const add = step
        .locator('.guide-insertion-block[data-end="true"]')
        .getByRole('button', { name: command, exact: true });
      await add.focus();
      await add.click();
      const block = step.locator(`.guide-block[data-kind="${kind}"]`).last();
      const field = block.getByRole('textbox').first();
      await field.fill(`Visible ${kind} content`);
      await field.blur();
      const inspector = page.locator('#guide-inspector-panel');
      if (await inspector.isVisible())
        await inspector.getByRole('button', { name: 'Close', exact: true }).click();
      await block.scrollIntoViewIfNeeded();
      await block.hover();
      const grip = block.locator('.guide-block-grip');
      const box = await block.boundingBox();
      const handle = await grip.boundingBox();
      if (!box || !handle) throw new Error('Missing block geometry');
      expect(handle.x + handle.width).toBeLessThanOrEqual(box.x);
      expect(handle.x).toBeGreaterThanOrEqual(0);
      const widthControl = block.locator('.guide-block-width');
      const widthBox = await widthControl.boundingBox();
      const actionBox = await block.locator('.guide-block-actions button').first().boundingBox();
      if (!widthBox || !actionBox) throw new Error('Missing block controls');
      expect(widthBox.x).toBeGreaterThanOrEqual(box.x + box.width);
      expect(widthBox.x + widthBox.width).toBeLessThanOrEqual(1024);
      expect(
        Math.abs(widthBox.y + widthBox.height / 2 - handle.y - handle.height / 2)
      ).toBeLessThan(1);
      expect(
        Math.abs(widthBox.y + widthBox.height / 2 - actionBox.y - actionBox.height / 2)
      ).toBeLessThan(1);
      expect(widthBox.width).toBe(widthBox.height);
      expect(await widthControl.evaluate((node) => getComputedStyle(node).borderRadius)).toBe(
        '50%'
      );
      await page.mouse.move((box.x + box.width + widthBox.x) / 2, widthBox.y + widthBox.height / 2);
      expect(await widthControl.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
      await widthControl.hover();
      expect(await widthControl.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
      await page.mouse.move((handle.x + handle.width + box.x) / 2, handle.y + handle.height / 2);
      expect(await grip.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      expect(await grip.evaluate((node) => getComputedStyle(node).cursor)).toBe('grab');
      expect(await grip.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
    }
    await testInfo.attach(`external-grips-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`dictation controls stay outside text and block actions in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 900 });
    const field = page.locator('article#compare textarea.guide-description').first();
    await field.focus();
    const wrapper = field.locator('..');
    const microphone = wrapper.locator('[data-ui="scenario.voice-input"]');
    await expect(microphone).toBeVisible();
    await expect(microphone).toHaveAttribute('title', 'Начать голосовой ввод');
    await microphone.click({ trial: true, timeout: 5000 });
    const geometry = await field.evaluate((node) => {
      const control = node.parentElement!.querySelector('[data-ui="scenario.voice-input"]')!;
      const text = node.getBoundingClientRect();
      const mic = control.getBoundingClientRect();
      const actions = node
        .closest('.guide-block')!
        .querySelector('.guide-block-actions')!
        .getBoundingClientRect();
      return {
        contentRight: text.right - parseFloat(getComputedStyle(node).paddingRight),
        micLeft: mic.left,
        micRight: mic.right,
        actionsLeft: actions.left,
      };
    });
    expect(geometry.contentRight).toBeLessThanOrEqual(geometry.micLeft);
    expect(geometry.micRight).toBeLessThanOrEqual(geometry.actionsLeft);
    await expect(field).toBeFocused();
    await testInfo.attach(`dictation-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.setViewportSize({ width: 1024, height: 640 });
    // At this width the existing inspector is an overlay; dismiss it before editing.
    await page.locator('.guide-inspector-panel .guide-panel-heading button').first().click();
    await field.focus();
    await microphone.click({ trial: true, timeout: 5000 });
    await expect
      .poll(() =>
        page.locator('.guide-workspace').evaluate((node) => node.scrollWidth <= node.clientWidth)
      )
      .toBe(true);
    issues.assertClean();
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`unified library shows a large viewer and seeks a decoded frame before Play in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    test.setTimeout(45000);
    const url = new URL(page.url());
    url.searchParams.set('videoFixture', '1');
    await page.goto(url.toString());
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    await page.getByRole('button', { name: 'Image library', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Resources', exact: true });
    await expect(drawer.locator('input[type="file"]')).toHaveCount(0);
    await expect(
      drawer.locator('.guide-resource-modes,.guide-resource-drawer-heading')
    ).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Library screenshot.png', exact: true }).click();
    await expect(drawer.locator('.guide-library-preview img')).toBeVisible();
    const widths = await drawer.evaluate((node) => ({
      grid: node.querySelector('.guide-library-content')!.getBoundingClientRect().width,
      preview: node.querySelector('.guide-library-preview')!.getBoundingClientRect().width,
      columns: getComputedStyle(
        node.querySelector('.guide-library-grid')!
      ).gridTemplateColumns.split(' ').length,
    }));
    expect(widths.preview).toBeGreaterThan(widths.grid);
    expect(widths.columns).toBe(3);
    await drawer.getByRole('button', { name: 'Video', exact: true }).click();
    await drawer.getByRole('button', { name: 'Library motion.webm', exact: true }).click();
    const video = drawer.locator('video');
    await expect
      .poll(() =>
        video.evaluate(
          (node) => node.readyState >= 2 && Number.isFinite(node.duration) && node.duration > 1.2
        )
      )
      .toBe(true);
    expect(await video.evaluate((node) => node.paused)).toBe(true);
    const position = drawer.getByRole('spinbutton', { name: 'Source position', exact: true });
    await position.fill('1.2');
    await expect
      .poll(() =>
        video.evaluate(
          (node) => !node.seeking && node.readyState >= 2 && Math.abs(node.currentTime - 1.2) < 0.03
        )
      )
      .toBe(true);
    expect(await video.evaluate((node) => node.paused)).toBe(true);
    await expect(
      drawer.getByRole('button', { name: 'Add frame as step', exact: true })
    ).toBeEnabled();
    await page.setViewportSize({ width: 1024, height: 640 });
    await drawer
      .getByRole('button', { name: 'Add frame as step', exact: true })
      .click({ trial: true, timeout: 5000 });
    expect((await video.boundingBox())?.height).toBeGreaterThan(140);
    await testInfo.attach(`library-viewer-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await drawer.getByRole('button', { name: 'Add frame as step', exact: true }).click();
    await expect(page.locator('main article')).toHaveCount(3);
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    const captured = page.locator('main article').last().locator('img');
    await expect(captured).toBeVisible();
    await expect
      .poll(() =>
        captured.evaluate((image) => {
          if (!image.complete || !image.naturalWidth) return false;
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0, 1, 1);
          const pixels = context.getImageData(0, 0, 1, 1).data;
          return pixels[2]! > pixels[0]! + 100;
        })
      )
      .toBe(true);
    issues.assertClean();
  });
}

test('shared library navigation stays aligned in the built video editor', async ({
  context,
  extensionId,
}, testInfo) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/video-editor/index.html`);
  await page.evaluate(() => chrome.storage.local.set({ 'sniptale-locale-preference': 'en' }));
  await expect(page.locator('[data-ui="video-editor.materials.library"]')).toBeVisible();
  await expectLibraryDrawerPlacement(page);
  await page.locator('[data-ui="video-editor.materials.library"]').click();
  await testInfo.attach('video-editor-shared-library', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.close();
});

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`right inspector keeps Russian controls and document scope clear in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1440, height: 900 });
    const inspector = page.locator('#guide-inspector-panel');
    const rightDivider = page.locator('.guide-panel-divider-right');
    await rightDivider.focus();
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
    await expect(rightDivider).toHaveAttribute('aria-valuenow', '260');
    await page.locator('.guide-page-header .guide-action-menu-anchor button').click();
    await page.getByRole('button', { name: 'Оформление сценария', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(inspector.getByText('Весь сценарий', { exact: true })).toBeVisible();
    await expect(inspector.getByRole('button', { name: 'Сценарий', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const clipped = await inspector.evaluate((node) =>
      [...node.querySelectorAll('button span, .guide-inspector-choice > span')]
        .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent)
    );
    expect(clipped).toEqual([]);
    await expect(inspector.locator('input[type="checkbox"]')).toHaveCount(0);
    await testInfo.attach(`inspector-document-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.locator('article#compare .guide-step-title').click();
    await expect(inspector.getByRole('button', { name: 'Выбранное', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(inspector.getByRole('button', { name: 'Макет шага', exact: true })).toBeVisible();
    await inspector.getByRole('switch', { name: 'Начать новый отсчёт', exact: true }).click();
    const start = inspector.getByRole('textbox', { name: 'Начать с', exact: true });
    await start.fill('12');
    await start.press('Enter');
    await expect(start).toHaveValue('12');
    await testInfo.attach(`inspector-step-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}
