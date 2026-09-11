import { expect } from '@playwright/test';
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
  await drawer.locator('button[aria-haspopup="listbox"]').click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(drawer).toBeVisible();
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

test('history cleanup preserves two-tab undo resources until sessions close', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  await verifyResourceRetention(page);
  issues.assertClean();
});
