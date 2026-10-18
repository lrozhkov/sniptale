import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from '../support/extension-fixture';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
  createTourDocument,
  createTourImageSlide,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import { translate } from '../../../../apps/extension/src/platform/i18n';

test.use({ actionTimeout: 10_000 });

type Locale = 'ru' | 'en';
type Theme = 'light' | 'dark';

function nativeProject(font: 'sans' | 'serif' = 'sans') {
  const project = createGuideProject(
    'Scenario composition baseline',
    'scenario-design-proof',
    1000
  );
  project.style.font = font;
  const first = createGuideStep(
    'Prepare the application and verify the selected workspace before recording',
    'first'
  );
  first.blocks = [
    {
      id: 'authored-text',
      kind: 'text',
      paragraphs: createGuideParagraphs(
        'Authored document text retains its own appearance.\nA second paragraph makes ' +
          'the editable content distinct from interface labels.'
      ),
    },
  ];
  const second = createGuideStep(
    'Review the result and continue to the next part of the instruction',
    'second'
  );
  second.blocks = [
    {
      id: 'second-text',
      kind: 'text',
      paragraphs: createGuideParagraphs(
        'Second step content remains available through navigation.'
      ),
    },
  ];
  project.items = [first, second];
  const tour = createTourDocument('scenario-design-tour');
  tour.slides = [
    {
      id: 'navigation-slide',
      kind: 'navigation',
      title: 'Choose the next section',
      description: 'Authored tour explanation',
      background: { color: '#111827', image: null },
      narration: null,
      timing: createTourImageSlide().timing,
      buttons: [
        { id: 'continue-action', label: 'Continue to the next section', action: { kind: 'none' } },
      ],
    },
  ];
  project.tour = tour;
  return project;
}

async function openNativeScenario(
  page: Page,
  extensionId: string,
  locale: Locale,
  theme: Theme,
  font: 'sans' | 'serif' = 'sans'
) {
  const project = nativeProject(font);
  project.id = `scenario-design-proof-${randomUUID()}`;
  const base = `chrome-extension://${extensionId}/apps/extension/src`;
  await page.goto(`${base}/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const value: unknown = (await chrome.storage.local.get('sniptale-locale-preference'))[
          'sniptale-locale-preference'
        ];
        return value === 'ru' || value === 'en';
      })
    )
    .toBe(true);
  await page.evaluate(
    async ({ project, locale, theme }) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
      localStorage.setItem('sniptale-locale-preference', locale);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('scenario_projects', 'readwrite');
      tx.objectStore('scenario_projects').put({
        id: project.id,
        project,
        createdAt: 1000,
        updatedAt: 1000,
        workspaceRevision: 1,
        lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { project, locale, theme }
  );
  await page.goto(`${base}/scenario-editor/index.html?projectId=${project.id}`);
  await expect(page.locator('.guide-document article')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
}

async function recordRoles(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });

  const roles = await page
    .locator(
      '.guide-page, .guide-page-header, .guide-project-name input, ' +
        '#guide-inspector-panel, .guide-document, .guide-document textarea, ' +
        '.tour-stage-host'
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          className: node.className,
          id: node.id,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          color: style.color,
          background: style.backgroundColor,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      })
    );
  await writeFile(info.outputPath(`${name}-roles.json`), JSON.stringify(roles, null, 2));
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);

async function authoredStyle(page: Page) {
  return page.locator('article#first textarea.guide-description').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      family: style.fontFamily,
      size: style.fontSize,
      lineHeight: style.lineHeight,
      weight: style.fontWeight,
    };
  });
}

async function assertAuthoredFontIndependent(page: Page) {
  const before = await authoredStyle(page);
  const title = page.locator('.guide-project-name input');
  const chrome = page.locator('.guide-history-controls button').first();
  const interfaceBefore = await chrome.evaluate((node) => getComputedStyle(node).fontFamily);
  const titleBefore = await title.evaluate((node) => getComputedStyle(node).fontFamily);
  await page.locator('.guide-editor-viewport').evaluate((node: HTMLElement) => {
    node.style.setProperty('--sniptale-font-interface', 'monospace');
  });
  await expect(chrome).not.toHaveCSS('font-family', interfaceBefore);
  await expect(title).toHaveCSS('font-family', titleBefore);
  await expect.poll(() => authoredStyle(page)).toEqual(before);
  await page.locator('.guide-editor-viewport').evaluate((node: HTMLElement) => {
    node.style.removeProperty('--sniptale-font-interface');
  });
  await expect(chrome).toHaveCSS('font-family', interfaceBefore);
}

async function readSaved(page: Page) {
  return page.evaluate(async () => {
    const projectId = new URL(location.href).searchParams.get('projectId');
    if (!projectId) throw new Error('Missing native scenario project identity.');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['scenario_projects', 'scenario_project_units']);
    const [row, units]: unknown[] = await Promise.all([
      new Promise((resolve, reject) => {
        const request = tx.objectStore('scenario_projects').get(projectId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
      new Promise((resolve, reject) => {
        const request = tx.objectStore('scenario_project_units').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    ]);
    db.close();
    if (typeof row !== 'object' || row === null || !('project' in row)) return null;
    const project = row.project;
    if (
      typeof project !== 'object' ||
      project === null ||
      !('items' in project) ||
      !Array.isArray(project.items)
    )
      return null;
    const first = project.items[0];
    if (
      typeof first !== 'object' ||
      first === null ||
      !('unitId' in first) ||
      !('revision' in first)
    )
      return null;
    if (
      typeof first.unitId !== 'string' ||
      typeof first.revision !== 'number' ||
      !Array.isArray(units)
    )
      return null;
    const currentUnit = units.find(
      (unit: unknown) =>
        typeof unit === 'object' &&
        unit !== null &&
        'projectId' in unit &&
        unit.projectId === projectId &&
        'unitId' in unit &&
        unit.unitId === first.unitId &&
        'revision' in unit &&
        unit.revision === first.revision
    );
    return JSON.stringify({ project, currentUnit });
  });
}

async function canonicalInspector(page: Page) {
  const panel = page.locator('#guide-inspector-panel');
  for (const selected of await panel
    .locator('[data-ui="scenario-editor.inspector-categories"] > nav button[aria-pressed="true"]')
    .all()) {
    await page.mouse.move(0, 550);
    const neutral = await selected.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.background = 'var(--sniptale-color-surface-hover)';
      node.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    await expect(selected).toHaveCSS('background-color', neutral);
    await selected.hover();
    await expect(selected).toHaveCSS('background-color', neutral);
  }
  const names = panel.locator('.sniptale-parameter-name:visible');
  expect(await names.count()).toBeGreaterThan(0);
  for (const name of await names.all()) {
    await expect(name).toHaveCSS('font-family', /Sniptale Interface/);
    await expect(name).toHaveCSS('font-size', '13px');
    await expect(name).toHaveCSS('line-height', '18px');
    await expect(name).toHaveCSS('font-weight', '400');
  }
  const headings = panel.locator(
    '[data-ui="shared.categorized-inspector.section-heading"]:visible'
  );
  if (await headings.count()) {
    await expect(headings.first()).toHaveCSS('font-size', '14px');
    await expect(headings.first()).toHaveCSS('line-height', '20px');
    await expect.soft(headings.first()).toHaveCSS('font-weight', '500', { timeout: 500 });
  }
  const stacks = panel.locator('.sniptale-parameter-stack:visible');
  for (const stack of await stacks.all()) {
    await expect(stack).toHaveCSS('row-gap', '4px');
  }
  const rows = panel.locator('.sniptale-parameter-row:visible');
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(31.5);
    const rowName = row.locator('.sniptale-parameter-name').first();
    const rowValue = row.locator('.sniptale-parameter-value').first();
    if ((await rowName.count()) && (await rowValue.count())) {
      expect(await rowName.evaluate((node) => getComputedStyle(node).color)).not.toBe(
        await rowValue.evaluate((node) => getComputedStyle(node).color)
      );
    }
  }
  expect(await panel.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
    1
  );
}

async function chromeFeedback(page: Page, info: TestInfo) {
  const field = page.locator('.guide-project-name .guide-voice-field');
  const input = field.locator('input');
  const clear = field.locator(':scope > .sniptale-field-clear');
  const voice = field.locator('.guide-voice-control');
  await page.mouse.move(0, 550);
  await input.blur();
  await expect(clear).toHaveCSS('opacity', '0');
  await expect(voice).toHaveCSS('opacity', '0');
  await recordRoles(page, info, 'guide-chrome-idle');
  expect(
    await input.evaluate((node) => parseFloat(getComputedStyle(node).paddingInlineEnd))
  ).toBeLessThanOrEqual(8);
  const idleWidth = (await input.boundingBox())!.width;
  await input.hover();
  expect((await input.boundingBox())!.width).toBeCloseTo(idleWidth, 0);
  const budget = await input.evaluate((node) => {
    const css = getComputedStyle(node);
    const canvas = document.createElement('canvas').getContext('2d')!;
    canvas.font = css.font;
    return {
      available:
        node.clientWidth - parseFloat(css.paddingInlineStart) - parseFloat(css.paddingInlineEnd),
      required: canvas.measureText('12345678').width,
    };
  });
  expect(budget.available).toBeGreaterThanOrEqual(budget.required - 1);
  await expect(clear).toHaveCSS('opacity', '1');
  await expect(voice).toHaveCSS('opacity', '1');
  await expect(clear).toHaveCSS('cursor', 'pointer');
  expect(
    await input.evaluate((node) => parseFloat(getComputedStyle(node).paddingInlineEnd))
  ).toBeGreaterThanOrEqual(64);
  const clearBox = await clear.boundingBox();
  const voiceBox = await voice.boundingBox();
  expect(
    Math.abs(clearBox!.y + clearBox!.height / 2 - voiceBox!.y - voiceBox!.height / 2)
  ).toBeLessThanOrEqual(1);
  await recordRoles(page, info, 'guide-chrome-accessories');
  await input.focus();
  await page.mouse.move(0, 550);
  await expect(clear).toHaveCSS('opacity', '1');
  await input.blur();
  const multiline = page.locator('article#first textarea.guide-description');
  const padding = await multiline.evaluate((node) => getComputedStyle(node).paddingInlineEnd);
  await multiline.hover();
  await expect(multiline).toHaveCSS('padding-inline-end', padding);
  const left = page.locator('.guide-left-navigation button[aria-pressed="true"]');
  await expect(left).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await left.hover();
  await expect(left).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const active = page.locator('.tour-representation-switch button[aria-pressed="true"]');
  await expect(active).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const marker = () =>
    active.evaluate((node) => {
      const css = getComputedStyle(node, '::before');
      return { height: css.height, transform: css.transform, bottom: css.bottom };
    });
  await expect.poll(marker).toMatchObject({ height: '2px', bottom: '0px' });
  await active.hover();
  const before = await marker();
  await page.mouse.down();
  expect(await marker()).toEqual(before);
  await page.mouse.move(0, 550);
  await page.mouse.up();
  await recordRoles(page, info, 'guide-chrome-navigation');
}

async function exerciseNative(page: Page, locale: Locale, info: TestInfo) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const title = page.getByRole('textbox', { name: t('scenario.editor.projectLabel'), exact: true });
  const text = page.locator('article#first textarea.guide-description');
  const authoredBefore = await authoredStyle(page);
  expect(authoredBefore.family).toContain('Sniptale Text');
  expect(authoredBefore.size).toBe('16px');
  expect(authoredBefore.lineHeight).toBe('26.4px');
  expect(authoredBefore.weight).toBe('400');
  await assertAuthoredFontIndependent(page);
  await chromeFeedback(page, info);
  await recordRoles(page, info, 'guide-workspace');
  await title.fill('Edited scenario composition');
  await text.click();
  await expect.poll(() => readSaved(page)).toContain('Edited scenario composition');
  await text.fill('Edited authored body remains available after reopening.');
  await title.focus();
  await expect.poll(() => readSaved(page)).toContain('Edited authored body');
  const history = page.locator('.guide-history-controls');
  await history.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await expect(text).toHaveValue(/Authored document text/);
  await history.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
  await expect(text).toHaveValue('Edited authored body remains available after reopening.');
  await page.locator('.guide-outline a').last().click();
  await expect(page.locator('article#second')).toBeInViewport();
  await page.locator('.guide-outline a').first().click();
  await text.click();
  await recordRoles(page, info, 'guide-selected-text');
  const selectionPanel = page.locator('#guide-inspector-panel');
  await selectionPanel
    .getByRole('button', { name: t('scenario.editor.guideHalfWidth'), exact: true })
    .click();
  await selectionPanel
    .getByRole('button', { name: t('scenario.editor.guideFullWidth'), exact: true })
    .click();
  await selectionPanel
    .getByRole('navigation')
    .getByRole('button', { name: t('scenario.editor.guideAddText'), exact: true })
    .click();
  await selectionPanel
    .getByRole('button', { name: t('scenario.editor.guideTextCenter'), exact: true })
    .click();
  await expect(text).toHaveCSS('text-align', 'center');
  await selectionPanel
    .getByRole('button', { name: t('scenario.editor.guideTextStart'), exact: true })
    .click();
  const appearance = page
    .locator('.guide-page-header')
    .getByRole('button', { name: t('scenario.editor.appearance'), exact: true });
  await expect(appearance).toHaveCSS('font-size', '13px');
  await expect(appearance).toHaveCSS('line-height', '18px');
  await expect(appearance).toHaveCSS('height', '32px');
  for (const caption of await page
    .locator('.guide-page-header [data-command-caption]:visible')
    .all()) {
    const bounds = await caption.evaluate((node) => {
      const child = node.getBoundingClientRect();
      const parent = node.closest('button')!.getBoundingClientRect();
      return {
        left: child.left,
        right: child.right,
        parentLeft: parent.left,
        parentRight: parent.right,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft - 1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight + 1);
  }
  await appearance.click();
  await canonicalInspector(page);
  const panel = page.locator('#guide-inspector-panel');
  const accentTrigger = panel.locator(
    '.guide-style-accent [data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  await accentTrigger.click();
  await expect(ui(page, 'shared.ui.color-selector.picker')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('appearance-color-open.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(ui(page, 'shared.ui.color-selector.picker')).toHaveCount(0);
  await expect(accentTrigger).toBeFocused();
  await expect.poll(() => authoredStyle(page)).toEqual(authoredBefore);
  const library = page.locator('#guide-library-panel');
  await library
    .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true })
    .click();
  const resourceTrigger = library.getByRole('button', {
    name: t('scenario.editor.guideOpenImageLibrary'),
    exact: true,
  });
  await resourceTrigger.click();
  const drawer = page.getByRole('dialog', {
    name: t('scenario.editor.guideResources'),
    exact: true,
  });
  await expect(drawer).toBeVisible();
  const drawerHeading = drawer.locator('.guide-resource-drawer-close strong');
  await expect.soft(drawerHeading).toHaveCSS('font-family', /Sniptale Interface/);
  await expect.soft(drawerHeading).toHaveCSS('font-weight', '500', { timeout: 500 });
  await page.screenshot({
    path: info.outputPath('resource-drawer.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(resourceTrigger).toBeFocused();
  await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
  const action = page.locator('.tour-stage-host [data-tour-object-id="continue-action"]');
  await action.click();
  await expect(action).toHaveAttribute('data-selected', 'true');
  await canonicalInspector(page);
  const actionText = page.locator('#guide-inspector-panel input').first();
  const textRow = actionText.locator(
    'xpath=ancestor::*[contains(@class,"sniptale-parameter-row")][1]'
  );
  const actionValue = panel.locator('.tour-action-field button[aria-haspopup="listbox"] .truncate');
  const fitEvidence = await panel.evaluate((node) => {
    const describe = (element: Element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        className: element.className,
        text: element.textContent,
        width: bounds.width,
        height: bounds.height,
        layout: element.getAttribute('data-layout'),
        maxWidth: style.maxWidth,
        gridTemplateColumns: style.gridTemplateColumns,
        whiteSpace: style.whiteSpace,
        overflowWrap: style.overflowWrap,
        lineHeight: style.lineHeight,
      };
    };
    return Array.from(
      node.querySelectorAll(
        '.sniptale-parameter-row, .sniptale-parameter-value, input, ' +
          '.tour-action-field, .tour-action-field button[aria-haspopup="listbox"] span, ' +
          'button[aria-haspopup="listbox"]'
      )
    )
      .flatMap((element) => [element, ...(element.parentElement ? [element.parentElement] : [])])
      .map(describe);
  });
  await writeFile(info.outputPath('tour-field-fit.json'), JSON.stringify(fitEvidence, null, 2));
  if ((await panel.boundingBox())!.width < 300) {
    await expect
      .soft(textRow, 'Long editable tour text needs the available full row')
      .toHaveAttribute('data-layout', 'stacked');
  }
  const longestWordFit = await actionValue.evaluate((node) => {
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = getComputedStyle(node).font;
    const longest = Math.max(
      ...(node.textContent ?? '').split(/\s+/).map((word) => context.measureText(word).width)
    );
    return { longest, available: node.getBoundingClientRect().width };
  });
  expect
    .soft(longestWordFit.available, 'The selected tour action must fit its longest word')
    .toBeGreaterThanOrEqual(longestWordFit.longest - 1);
  const actionFont = await action.evaluate((node) => getComputedStyle(node).fontFamily);
  await page
    .locator('.guide-editor-viewport')
    .evaluate((node: HTMLElement) =>
      node.style.setProperty('--sniptale-font-interface', 'monospace')
    );
  await expect(action).toHaveCSS('font-family', actionFont);
  await page
    .locator('.guide-editor-viewport')
    .evaluate((node: HTMLElement) => node.style.removeProperty('--sniptale-font-interface'));
  await recordRoles(page, info, 'tour-selected-action');
  const preview = page
    .locator('.tour-header-controls')
    .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true });
  await preview.click();
  const back = page
    .locator('.tour-header-controls')
    .getByRole('button', { name: t('scenario.editor.tourReturnToEditing'), exact: true });
  await expect(back).toBeFocused();
  await back.click();
  await expect(preview).toBeFocused();
  await expect(action).toHaveAttribute('data-selected', 'true');
  await page.getByRole('button', { name: t('scenario.editor.referenceMode'), exact: true }).click();
  const exportTrigger = page
    .locator('.guide-page-header')
    .getByRole('button', { name: t('scenario.editor.guideReaderOpen'), exact: true });
  await exportTrigger.click();
  const output = page.locator('main.guide-export-workspace');
  await expect(output).toBeVisible();
  await expect
    .soft(output.getByText(t('scenario.editor.guideReaderMode'), { exact: true }))
    .toHaveCount(1, { timeout: 500 });
  const outputBack = output.getByRole('button', {
    name: t('scenario.editor.guideReaderBack'),
    exact: true,
  });
  await outputBack.scrollIntoViewIfNeeded();
  await expect(outputBack).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: info.outputPath('export-workspace.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await outputBack.click();
  await expect(output).toHaveCount(0);
  await expect(exportTrigger).toBeFocused();
  await expect.poll(() => readSaved(page)).toContain('Edited authored body');
  await page.reload();
  await expect(title).toHaveValue('Edited scenario composition');
  await expect(text).toHaveValue('Edited authored body remains available after reopening.');
  await expect.poll(() => authoredStyle(page)).toEqual(authoredBefore);
}

for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      test(`native scenario composition ${locale} ${theme} ${size.width}x${size.height}`, async ({
        page,
        extensionId,
      }, info) => {
        await page.setViewportSize(size);
        await openNativeScenario(page, extensionId, locale, theme);
        await exerciseNative(page, locale, info);
      });
    }

test('native authored serif remains independent from interface family', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await openNativeScenario(page, extensionId, 'en', 'light', 'serif');
  expect((await authoredStyle(page)).family).toContain('Georgia');
  await assertAuthoredFontIndependent(page);
  await recordRoles(page, info, 'authored-serif');
});

test('native scenario panel widths and below-minimum horizontal scroll', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await openNativeScenario(page, extensionId, 'en', 'light');
  const divider = page.getByRole('separator', { name: 'Inspector', exact: true });
  await divider.focus();
  const panel = page.locator('#guide-inspector-panel');
  for (const target of [301, 300, 299, 281, 280, 279]) {
    const actual = (await panel.boundingBox())!.width;
    const box = (await divider.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + actual - target, y);
    await page.mouse.up();
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeCloseTo(target, 0);
    expect(
      await page
        .locator('.guide-page-header')
        .evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1);
  }
  await page.screenshot({
    path: info.outputPath('inspector-resized.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1100, height: 560 });
  const viewport = page.locator('.guide-editor-viewport');
  expect(await viewport.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
  await viewport.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  expect(await viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath('below-desktop-minimum.png'),
    fullPage: false,
    animations: 'disabled',
  });
});
