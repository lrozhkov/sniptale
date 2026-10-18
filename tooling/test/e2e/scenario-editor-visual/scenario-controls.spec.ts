import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import {
  openVisualHarness,
  createPageIssueCollector,
  SCENARIO_VISUAL_LOCALES,
} from './scenario-editor-visual.helpers';

const HEADER_LABELS = {
  ru: {
    appearance: 'Оформление',
    document: 'Весь сценарий',
    menu: 'Сценарий',
    menuAppearance: 'Оформление сценария',
    tour: 'Интерактивный тур',
    tourDocument: 'Оформление тура',
  },
  en: {
    appearance: 'Appearance',
    document: 'Entire guide',
    menu: 'Scenario',
    menuAppearance: 'Guide appearance',
    tour: 'Interactive tour',
    tourDocument: 'Tour appearance',
  },
} as const;

for (const locale of SCENARIO_VISUAL_LOCALES) {
  test(`scenario header exposes a persistent labeled appearance action in ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    const labels = HEADER_LABELS[locale];
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, 'light', locale, { width: 1280, height: 900 });
    const header = page.locator('.guide-page-header');
    const appearance = header.getByRole('button', { name: labels.appearance, exact: true });
    await expect(appearance).toBeVisible();
    await expect(appearance.locator('[data-command-caption]')).toHaveText(labels.appearance);
    await appearance.click();
    const panel = page.locator('#guide-inspector-panel');
    await expect(panel.locator('h2')).toHaveText(labels.document);
    await header.getByRole('button', { name: labels.menu, exact: true }).click();
    const menu = page.locator('.guide-action-menu');
    await expect(menu).toBeVisible();
    await expect(menu).not.toContainText(labels.menuAppearance);
    await page.keyboard.press('Escape');
    await header.getByRole('button', { name: labels.tour, exact: true }).click();
    await appearance.click();
    await expect(panel.locator('h2')).toHaveText(labels.tourDocument);
    issues.assertClean();
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`numeric inspector input focuses the full field without a nested outline in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 900 });
    const block = page.locator('.guide-block[data-kind="text"]').first();
    await block.locator('textarea').focus();
    const field = page
      .locator('#guide-inspector-panel')
      .locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
      .first();
    const input = field.locator('input').first();
    await input.focus();
    const outline = await input.evaluate((node) => {
      const style = getComputedStyle(node);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(
      outline,
      'nested numeric input must not render the squared accent outline'
    ).toMatchObject({ style: 'none' });
    await expect(field).toHaveAttribute('data-focus-appearance', 'accent-box');
    await expect(field).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    issues.assertClean();
  });
}

test('document dictation controls reserve a stable readable editing strip', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'ru', { width: 1280, height: 900 });
  const metrics = await page.evaluate(() => {
    const results: Record<string, Record<string, number>> = {};
    let index = 0;
    for (const field of document.querySelectorAll<HTMLElement>(
      '.guide-document .guide-voice-field'
    )) {
      const input = field.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!;
      input.focus();
      const control = field.querySelector<HTMLElement>('.guide-voice-control')!;
      const fieldRect = input.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      results[`${input.getAttribute('aria-label') ?? input.tagName}#${index++}`] = {
        rightInset: fieldRect.right - controlRect.right,
        paddingRight: parseFloat(getComputedStyle(input).paddingRight),
        paddingLeft: parseFloat(getComputedStyle(input).paddingLeft),
        prose: input.tagName === 'TEXTAREA' ? 1 : 0,
        controlWidth: controlRect.width,
        inside:
          controlRect.top >= fieldRect.top - 1 && controlRect.bottom <= fieldRect.bottom + 1
            ? 1
            : 0,
      };
      input.blur();
    }
    return results;
  });
  expect(Object.keys(metrics).length, 'document exposes voice fields').toBeGreaterThan(0);
  for (const [label, metric] of Object.entries(metrics)) {
    expect.soft(metric.inside, `${label}: controls stay inside the field`).toBe(1);
    expect
      .soft(metric.paddingRight, `${label}: text stays clear of both editing actions`)
      .toBeGreaterThanOrEqual(metric.controlWidth + metric.rightInset);
  }
  issues.assertClean();
});

test('tour inspector and canvas controls keep contextual geometry', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'ru', { width: 1280, height: 900 });
  const header = page.locator('.guide-page-header');
  await header.getByRole('button', { name: 'Интерактивный тур', exact: true }).click();
  await page.getByRole('button', { name: 'Из руководства', exact: true }).first().click();
  const review = page.locator('.tour-generation');
  const accept = review.getByRole('button', { name: 'Из руководства', exact: true });
  await expect(accept).toBeEnabled({ timeout: 30_000 });
  await accept.click();
  const slide = page.locator('.tour-slide-select:has(img)').first();
  await expect(slide).toBeVisible({ timeout: 10_000 });
  await slide.click();
  const panel = page.locator('#guide-inspector-panel');
  await expect(panel.locator('h2')).toBeVisible();

  // Contextual tour controls live in the central header between the title and the
  // representation switch instead of overlaying the slide canvas.
  const controls = header.locator('.tour-header-controls');
  await expect(controls).toBeVisible();
  await expect(
    controls.getByRole('button', { name: 'Просмотреть отсюда', exact: true })
  ).toBeVisible();
  const geometry = await page.evaluate(() => {
    const controls = document.querySelector('.tour-header-controls')!;
    const representation = document.querySelector('.tour-representation-switch')!;
    const title = document.querySelector('.guide-project-name')!;
    const stage = document.querySelector('.tour-stage-host')!;
    return {
      afterTitle: Boolean(
        title.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      beforeSwitch: Boolean(
        representation.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      controlsBottom: controls.getBoundingClientRect().bottom,
      stageTop: stage.getBoundingClientRect().top,
    };
  });
  expect.soft(geometry.afterTitle, 'tour controls follow the project title').toBe(true);
  expect.soft(geometry.beforeSwitch, 'representation switch precedes the project title').toBe(true);
  expect
    .soft(
      geometry.controlsBottom <= geometry.stageTop + 1,
      'header controls must not overlap the slide canvas'
    )
    .toBe(true);
  await expect(page.locator('.tour-camera-tools')).toHaveCount(0);

  // Clear and dictation controls hug the field edge without covering text.
  const voiceMetrics = await panel.evaluate((node) => {
    const metrics: Record<string, Record<string, number>> = {};
    let index = 0;
    for (const field of node.querySelectorAll<HTMLElement>('.guide-voice-field')) {
      const input = field.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!;
      input.focus();
      const control = field.querySelector<HTMLElement>('.guide-voice-control')!;
      const fieldRect = input.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      const clearRect = field.querySelector('.sniptale-field-clear')?.getBoundingClientRect();
      const stripRight = Math.max(controlRect.right, clearRect?.right ?? controlRect.right);
      const stripLeft = Math.min(controlRect.left, clearRect?.left ?? controlRect.left);
      metrics[`${input.getAttribute('aria-label') ?? input.tagName}#${index++}`] = {
        rightInset: fieldRect.right - stripRight,
        paddingRight: parseFloat(getComputedStyle(input).paddingRight),
        controlWidth: stripRight - stripLeft,
        inside:
          controlRect.top >= fieldRect.top - 1 && controlRect.bottom <= fieldRect.bottom + 1
            ? 1
            : 0,
      };
      input.blur();
    }
    return metrics;
  });
  for (const [label, metric] of Object.entries(voiceMetrics)) {
    expect.soft(metric.inside, `${label}: controls stay inside the field`).toBe(1);
    expect.soft(metric.rightInset, `${label}: controls hug the field edge`).toBeLessThanOrEqual(12);
    expect
      .soft(metric.paddingRight, `${label}: field padding reserves the control strip`)
      .toBeGreaterThanOrEqual(metric.controlWidth + metric.rightInset);
  }

  // Image editing is a header action, not an inspector or footer control.
  await expect
    .soft(controls.locator('[data-tour-edit-image]'), 'edit image belongs to the header controls')
    .toHaveCount(1);
  await expect.soft(panel.locator('[data-tour-edit-image]')).toHaveCount(0);

  // Object creation uses the heading-level Add menu once objects exist.
  await panel.getByRole('button', { name: 'Действия', exact: true }).click();
  const emptyActions = panel.locator('.tour-object-actions > button');
  if (await emptyActions.count()) {
    await emptyActions.filter({ hasText: 'Точка действия' }).click();
    await expect(emptyActions).toHaveCount(0);
  }
  const add = panel.getByRole('button', { name: 'Добавить', exact: true });
  await expect(add).toBeVisible();
  expect((await add.boundingBox())!.width).toBeLessThanOrEqual(32);
  await expect(add).toHaveText('');
  await add.click();
  for (const label of ['Точка действия', 'Текстовое действие']) {
    await expect
      .soft(
        page.locator('.guide-action-menu').getByRole('button', { name: label, exact: true }),
        `object option ${label}`
      )
      .toBeVisible();
  }
  await expect(
    page.locator('.guide-action-menu').getByRole('button', { name: 'Выделение', exact: true })
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  const objects = panel.locator('.tour-object-item');
  const count = await objects.count();
  await objects.first().hover();
  const remove = objects.first().locator('.tour-object-delete');
  await expect(remove).toBeVisible();
  await remove.hover();
  await expect
    .poll(() =>
      remove.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--sniptale-color-danger)';
        node.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        const actual = getComputedStyle(node).color;
        return actual === expected;
      })
    )
    .toBe(true);
  expect(await remove.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)'
  );
  await testInfo.attach('object-hover-actions', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await remove.click();
  await expect(objects).toHaveCount(count - 1);
  await header.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(objects).toHaveCount(count);

  // Nested numeric inputs leave focus decoration to the full field in the tour inspector too.
  await panel.getByRole('button', { name: 'Камера', exact: true }).click();
  await panel.getByRole('button', { name: 'Приближение', exact: true }).click();
  await page.getByRole('option', { name: 'Вручную', exact: true }).click();
  const zoom = panel.locator('input[aria-label="Масштаб"]');
  await zoom.focus();
  expect(await zoom.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');

  // Camera framing stays reachable from the header controls once a manual camera exists.
  const frame = controls.getByRole('button', { name: 'Область камеры', exact: true });
  await expect(frame).toBeVisible();
  await frame.click();
  const stage = page.locator('.tour-stage-host');
  await expect(stage).toHaveAttribute('data-view', 'frame');
  await expect(stage.locator('.tour-camera-frame')).toBeVisible();
  await testInfo.attach('tour-inspector-controls', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  issues.assertClean();
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1920, 1280]) {
    test(`scenario control geometry and pointer focus in ${theme} at ${width}`, async ({
      page,
      hostOrigin,
    }, testInfo) => {
      const issues = createPageIssueCollector(page);
      await openVisualHarness(page, hostOrigin, theme, 'ru', {
        width,
        height: width === 1280 ? 560 : 900,
      });
      await expect(page.locator('.guide-inspector-panel')).toBeVisible();
      const pane = page.locator('.guide-center-panel > .guide-document-scroll');
      await pane.evaluate((node) => {
        node.scrollTop = 0;
      });
      const insert = page.locator('.guide-document > .guide-insertion-item').first();
      await insert.locator('button').first().focus();
      const insertion = await insert
        .locator('button')
        .first()
        .evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const scroll = button.closest('.guide-document-scroll')!.getBoundingClientRect();
          return {
            clearance: rect.top - scroll.top,
            hit: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 2)),
          };
        });
      expect(insertion.clearance).toBeGreaterThanOrEqual(0);
      expect(insertion.hit).toBe(true);
      const step = page.locator('article#compare');
      for (const name of ['Подзаголовок', 'Примечание']) {
        const trigger = step.locator('.guide-insertion-block').last().locator('button');
        await trigger.focus();
        await page.keyboard.press('ArrowDown');
        await page
          .locator('.guide-action-menu--insert')
          .getByRole('button', { name, exact: true })
          .click();
      }
      const blocks = page.locator('.guide-document article .guide-block');
      for (const block of await blocks.all()) {
        await block.scrollIntoViewIfNeeded();
        await block.hover();
        const controls = await block.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          const selectors = [
            '.guide-block-grip',
            '.guide-block-width',
            '.guide-block-actions button',
          ];
          if (['text', 'heading', 'note'].includes(node.getAttribute('data-kind') ?? ''))
            selectors.push('.guide-voice-control button');
          return selectors.map((selector) => {
            const button = node.querySelector<HTMLElement>(selector)!;
            const rect = button.getBoundingClientRect();
            return {
              selector,
              width: rect.width,
              height: rect.height,
              top: rect.top - bounds.top,
              inside: rect.left >= bounds.left && rect.right <= bounds.right,
            };
          });
        });
        for (const control of controls) {
          expect(control.width, control.selector).toBe(24);
          expect(control.height, control.selector).toBe(24);
          expect(control.top, control.selector).toBe(6);
          if (control.selector.includes('actions')) expect(control.inside).toBe(true);
        }
      }
      const id = await step.locator('.guide-block').first().getAttribute('data-block-id');
      const block = step.locator(`[data-block-id="${id}"]`);
      await block.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await block.hover();
      const grip = block.locator('.guide-block-grip');
      await grip.click();
      await expect(grip).toBeFocused();
      await expect(grip).toHaveCSS('opacity', '1');
      await expect(page.locator('html')).not.toHaveAttribute('data-guide-reordering');
      const rect = await grip.boundingBox();
      if (!rect) throw new Error('Missing grip');
      await page.mouse.move(rect.x + 12, rect.y + 12);
      await page.mouse.down();
      // Scroll the target into the canvas while retaining the active drag.
      const target = step.locator('.guide-block').nth(1);
      await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      const destination = await step.locator('.guide-block').nth(1).boundingBox();
      if (!destination) throw new Error('Missing drop target');
      await page.mouse.move(
        destination.x + destination.width * 0.8,
        destination.y + destination.height * 0.7,
        { steps: 8 }
      );
      await expect(grip).toHaveCSS('opacity', '0');
      await page.mouse.up();
      await expect(step.locator('.guide-block').nth(1)).toHaveAttribute('data-block-id', id!);
      await expect(grip).not.toBeFocused();
      await expect(grip).toHaveCSS('opacity', '0');
      await block.hover();
      await expect(grip).toHaveCSS('opacity', '1');
      await expect(page.locator('html')).not.toHaveAttribute('data-guide-reordering');
      await testInfo.attach(`controls-${theme}-${width}`, {
        body: await page.screenshot({
          path: `tasks/scenario-control-alignment/controls-${theme}-${width}.png`,
        }),
        contentType: 'image/png',
      });
      issues.assertClean();
    });
  }
}

for (const locale of SCENARIO_VISUAL_LOCALES) {
  test(`scenario top-bar controls share the selected representation metrics in ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    const labels = HEADER_LABELS[locale];
    const issues = createPageIssueCollector(page);
    await openVisualHarness(
      page,
      hostOrigin,
      'light',
      locale,
      { width: 1280, height: 900 },
      'compare',
      { tourFixture: '1' }
    );
    const readMetrics = () =>
      page.evaluate(() => {
        const header = document.querySelector('.guide-page-header');
        const reference = header?.querySelector<HTMLElement>(
          '.tour-representation-switch .guide-section-tab[aria-pressed="true"]'
        );
        if (!header || !reference) return { missing: true } as const;
        const measure = (node: HTMLElement) => {
          const style = getComputedStyle(node.querySelector('span') ?? node);
          const boxStyle = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const icon = node.querySelector('svg')?.getBoundingClientRect();
          return {
            height: rect.height,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            borderRadius: boxStyle.borderTopLeftRadius,
            borderWidth: boxStyle.borderTopWidth,
            iconWidth: icon?.width ?? 0,
            iconHeight: icon?.height ?? 0,
          };
        };
        const name = (node: HTMLElement) =>
          (node.getAttribute('aria-label') ?? node.textContent ?? '').trim();
        const controls = [...header.querySelectorAll<HTMLElement>('button')]
          .filter((button) => !button.closest('.guide-project-name'))
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            const style = getComputedStyle(button);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
          })
          .map((button) => ({
            label: name(button),
            iconOnly: ![...button.childNodes].some(
              (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
            ),
            text: button.textContent?.trim() ?? '',
            metrics: measure(button),
          }));
        return {
          missing: false as const,
          reference: measure(reference),
          referenceLabel: name(reference),
          referenceHasText: Boolean(
            [...reference.querySelectorAll('span')].some(
              (span) => span.getBoundingClientRect().width > 0
            )
          ),
          controls,
        };
      });
    const assertUniform = async (phase: string) => {
      const report = await readMetrics();
      expect(report.missing, `${phase}: header and selected tab mount`).toBe(false);
      if (report.missing) return;
      expect(report.referenceHasText, `${phase}: selected tab keeps a text label`).toBe(true);
      expect(report.controls.length, `${phase}: top bar exposes controls`).toBeGreaterThan(4);
      for (const control of report.controls) {
        for (const key of [
          'height',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'borderRadius',
          'borderWidth',
          'iconWidth',
          'iconHeight',
        ] as const) {
          expect
            .soft(
              control.metrics[key],
              `${phase}: ${control.label || control.text} ${key} matches ${report.referenceLabel}`
            )
            .toBe(report.reference[key]);
        }
      }
      return report;
    };
    await assertUniform('guide');
    await page.getByRole('button', { name: labels.tour, exact: true }).click();
    await assertUniform('tour');
    await headerPreview();
    await assertUniform('tour preview');
    issues.assertClean();

    async function headerPreview() {
      await page
        .locator('.tour-header-controls')
        .getByRole('button', { name: locale === 'ru' ? 'Просмотр' : 'Preview', exact: true })
        .click();
    }
  });
}

test('scenario header undo and redo stay icon-only and accessible', async ({
  page,
  hostOrigin,
}) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  const header = page.locator('.guide-page-header');
  for (const name of ['Undo', 'Redo']) {
    const button = header.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button.locator('span')).toHaveCount(0);
    await expect(button.locator('svg')).toBeVisible();
  }
  issues.assertClean();
});

test('scenario title keeps available width across hover and editing', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1920, height: 900 });
  const header = page.locator('.guide-page-header');
  const title = header.locator('.guide-project-name');
  const input = title.locator('input');
  const width = async () => (await title.boundingBox())!.width;
  const compact = await width();
  await title.hover();
  expect(await width()).toBeCloseTo(compact, 0);
  await input.focus();
  expect(await width()).toBeCloseTo(compact, 0);
  await input.press('Tab');
  await header.getByRole('button', { name: 'Appearance', exact: true }).focus();
  expect(await width()).toBeCloseTo(compact, 0);
  const order = await header.evaluate((node) => {
    const representation = node.querySelector('.tour-representation-switch')!;
    const title = node.querySelector('.guide-project-name')!;
    return Boolean(
      representation.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  expect(order).toBe(true);
  const switcher = header.locator('.tour-representation-switch');
  expect(await switcher.evaluate((node) => getComputedStyle(node).borderInlineStartWidth)).toBe(
    '0px'
  );
  await page.locator('#guide-library-panel button[aria-controls="guide-library-panel"]').click();
  expect(await switcher.evaluate((node) => getComputedStyle(node).borderInlineStartWidth)).toBe(
    '1px'
  );
  await testInfo.attach('header-title-layout', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`third and quarter presets wrap blocks into columns in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 900 });
    const step = page.locator('article#compare');
    const text = step.locator('.guide-block[data-kind="text"]').first();
    await text.locator('textarea').focus();
    const inspector = page.locator('#guide-inspector-panel');
    await inspector.getByRole('button', { name: 'Third width', exact: true }).click();
    await expect(text).toHaveAttribute('data-width', '33');
    for (let index = 0; index < 2; index++) {
      await text.locator('.guide-block-actions button').focus();
      await text.locator('.guide-block-actions button').click();
      await page.getByRole('button', { name: 'Duplicate block', exact: true }).click();
    }
    const row = step.locator('.guide-block[data-kind="text"]');
    await expect(row).toHaveCount(3);
    const tops = () =>
      row.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    expect(new Set(await tops()).size).toBe(1);
    for (const block of await row.all()) {
      await block.locator('textarea').focus();
      await inspector.getByRole('button', { name: 'Quarter width', exact: true }).click();
      await expect(block).toHaveAttribute('data-width', '25');
    }
    await text.locator('.guide-block-actions button').focus();
    await text.locator('.guide-block-actions button').click();
    await page.getByRole('button', { name: 'Duplicate block', exact: true }).click();
    await expect(row).toHaveCount(4);
    expect(new Set(await tops()).size).toBe(1);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.reload();
    await expect(row).toHaveCount(4);
    for (const block of await row.all()) await expect(block).toHaveAttribute('data-width', '25');
    expect(new Set(await tops()).size).toBe(1);
  });
}

for (const [locale, theme] of [
  ['en', 'light'],
  ['ru', 'dark'],
] as const) {
  test(`resource preview and usage stay distinct and quiet in ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    const ru = locale === 'ru';
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      locale,
      { width: 1280, height: 560 },
      'compare',
      { tourFixture: '1' }
    );
    const library = page.locator('#guide-library-panel');
    await library.getByRole('button', { name: ru ? 'Ресурсы' : 'Resources', exact: true }).click();
    const guideActions = library.locator('.guide-resource-actions').first();
    const preview = guideActions.locator('button').first();
    const uses = guideActions.locator('button').nth(1);
    await expect(preview.locator('.lucide-expand')).toBeVisible();
    await expect(uses.locator('.lucide-arrow-right')).toBeVisible();
    await preview.hover();
    await expect(preview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(preview).toHaveCSS('box-shadow', 'none');
    await preview.click();
    await expect(page.locator('#guide-resource-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toBeFocused();
    await uses.click();
    await expect(uses).toHaveAttribute('aria-expanded', 'true');
    await expect(uses).toHaveCSS('box-shadow', 'none');
    await page.locator('.guide-action-menu').getByRole('button').first().click();
    await expect(page.locator('#guide-resource-preview')).toHaveCount(0);
    await expect(page.locator('article#compare .guide-image-frame').first()).toBeInViewport();
    await page
      .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
      .click();
    await library.getByRole('button', { name: ru ? 'Ресурсы' : 'Resources', exact: true }).click();
    const tourActions = library.locator('.guide-resource-actions').first();
    const tourPreview = tourActions.locator('button').first();
    const tourUses = tourActions.locator('button').nth(1);
    await expect(tourPreview.locator('.lucide-expand')).toBeVisible();
    await expect(tourUses.locator('.lucide-arrow-right')).toBeVisible();
    await tourPreview.hover();
    await expect(tourPreview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(tourPreview).toHaveCSS('box-shadow', 'none');
    expect((await tourPreview.boundingBox())!.width).toBe((await tourUses.boundingBox())!.width);
    await tourPreview.click();
    await expect(page.locator('#tour-resource-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tourPreview).toBeFocused();
    await tourUses.click();
    await expect(page.locator('#tour-resource-preview')).toHaveCount(0);
    await expect(page.locator('.tour-stage-host [data-tour-scene] img').first()).toBeVisible();
  });
}

test('unfocused project title shows all fitting text without requiring focus', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1920, height: 900 });
  const header = page.locator('.guide-page-header');
  const title = header.locator('.guide-project-name input');
  await title.fill('Project title fitting the available space W');
  await header.getByRole('button', { name: 'Appearance', exact: true }).focus();
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  const geometry = await title.evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing title input');
    const style = getComputedStyle(input);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = context.measureText(input.value).width;
    const rect = input.getBoundingClientRect();
    const actions = input
      .closest('.guide-page-header')!
      .querySelector('.guide-header-actions')!
      .getBoundingClientRect();
    const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    const borders =
      Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
    return {
      text,
      content: rect.width - padding - borders,
      available: actions.left - rect.left - padding - borders - 8,
    };
  });
  expect(geometry.available).toBeGreaterThan(geometry.text);
  expect(geometry.content).toBeGreaterThanOrEqual(geometry.text);
});

test('MV3 fixture applies the configured CSS viewport before application navigation', async ({
  page,
  hostOrigin,
  viewport,
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, 'initialLayoutViewport', {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    });
  });
  await openVisualHarness(page, hostOrigin, 'light', 'en');
  expect(await page.evaluate(() => Reflect.get(window, 'initialLayoutViewport'))).toEqual({
    ...viewport,
    dpr: 1,
  });
});

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      test(`voice and Clear stay aligned ${locale} ${theme} ${viewport.width}`, async ({
        page,
        hostOrigin,
      }, info) => {
        await openVisualHarness(page, hostOrigin, theme, locale, viewport);
        const name = page.locator('.guide-project-name .guide-voice-field');
        const prose = page.locator('.guide-document .guide-voice-field:has(textarea)').first();
        for (const [role, field] of [
          ['name', name],
          ['prose', prose],
        ] as const) {
          const input = field.locator('input, textarea');
          await input.scrollIntoViewIfNeeded();
          await input.fill('A readable example with text and two separate actions');
          await input.focus();
          const microphone = field.locator('.guide-voice-control');
          const clear = field.locator('.sniptale-field-clear');
          await expect(clear).toBeVisible();
          if (role === 'prose') {
            await expect
              .soft(microphone.locator('button').first())
              .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 500 });
            await clear.hover();
            const contrast = await clear.evaluate((node) => {
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d')!;
              const luminance = (color: string) => {
                context.fillStyle = color;
                context.fillRect(0, 0, 1, 1);
                return [...context.getImageData(0, 0, 1, 1).data]
                  .slice(0, 3)
                  .reduce((sum, channel, index) => {
                    const value = channel / 255;
                    return (
                      sum +
                      (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
                        [0.2126, 0.7152, 0.0722][index]!
                    );
                  }, 0);
              };
              const foreground = luminance(getComputedStyle(node).color);
              const paper = luminance(getComputedStyle(node).getPropertyValue('--guide-paper'));
              return (Math.max(foreground, paper) + 0.05) / (Math.min(foreground, paper) + 0.05);
            });
            expect
              .soft(contrast, 'Clear must remain visible on the authored paper')
              .toBeGreaterThanOrEqual(3);
          }

          const before = await microphone.boundingBox();
          const fieldBefore = (await input.boundingBox())!;
          const textBefore = await input.evaluate(
            (node) => getComputedStyle(node).paddingInlineEnd
          );
          const clearBox = (await clear.boundingBox())!;
          expect.soft(before!.x + before!.width).toBeLessThanOrEqual(clearBox.x - 1);
          await page.screenshot({ path: info.outputPath(`${role}-focused.png`), fullPage: false });
          await clear.click();
          await expect(input).toHaveValue('');
          if (role === 'name')
            await expect.soft(input).toHaveAttribute('placeholder', /.+/, { timeout: 500 });
          await expect(input).toBeFocused();
          const after = (await microphone.boundingBox())!;
          const fieldAfter = (await input.boundingBox())!;
          const insetBefore = fieldBefore.x + fieldBefore.width - before!.x - before!.width;
          const insetAfter = fieldAfter.x + fieldAfter.width - after.x - after.width;
          expect
            .soft(Math.abs(insetBefore - insetAfter), `${role}: microphone target stays in place`)
            .toBeLessThanOrEqual(1);
          expect
            .soft(
              await input.evaluate((node) => getComputedStyle(node).paddingInlineEnd),
              `${role}: text width stays stable`
            )
            .toBe(textBefore);
          await page.screenshot({ path: info.outputPath(`${role}-cleared.png`), fullPage: false });
        }
      });
    }
  }
}

test('voice header keeps text room at desktop minimum widths', async ({
  page,
  hostOrigin,
}, info) => {
  for (const width of [1100, 1279, 1280, 1281]) {
    await openVisualHarness(page, hostOrigin, 'light', 'en', { width, height: 560 });
    const header = page.locator('.guide-page-header');
    const input = header.locator('.guide-project-name input');
    const room = await input.evaluate((node) => {
      const style = getComputedStyle(node);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.font = style.font;
      return {
        available:
          node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        minimum: context.measureText('0').width * 8,
      };
    });
    expect(room.available, JSON.stringify(room)).toBeGreaterThanOrEqual(room.minimum - 1);
    for (const icon of await header.locator('button[data-icon-only="true"] svg').all())
      await expect(icon).toBeVisible();
    if (width < 1280) {
      const scrolled = await page.locator('.guide-page').evaluate((root) => {
        let owner: Element | null = root;
        while (owner) {
          if (owner.scrollWidth > owner.clientWidth) {
            owner.scrollLeft = owner.scrollWidth;
            if (owner.scrollLeft > 0) return true;
          }
          owner = owner.parentElement;
        }
        return false;
      });
      expect(scrolled, 'The minimum desktop workspace keeps an actual outer scroll owner').toBe(
        true
      );
    }
    await page.screenshot({ path: info.outputPath(`header-${width}.png`), fullPage: false });
  }
});

for (const locale of SCENARIO_VISUAL_LOCALES)
  for (const theme of ['light', 'dark'] as const)
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      test(`authored font and caret-only placeholder ${locale} ${theme} ${size.width}`, async ({
        page,
        hostOrigin,
      }, info) => {
        await openVisualHarness(page, hostOrigin, theme, locale, size);
        const name = page.locator('.guide-project-name input');
        const prose = page.locator('.guide-document textarea.guide-description').first();
        await expect(name).toHaveCSS('font-family', /Sniptale Text/);
        await expect(prose).toHaveCSS('font-family', /Sniptale Text/);
        await expect(page.locator('.guide-outline a').first()).toHaveCSS(
          'font-family',
          /Sniptale Interface/
        );
        const faces = await page.evaluate(async () => {
          const loaded = await document.fonts.load('400 16px "Sniptale Text"', 'Text Текст');
          return loaded.map((face) => ({ family: face.family, status: face.status }));
        });
        expect(faces).toContainEqual({ family: 'Sniptale Text', status: 'loaded' });
        await name.fill('');
        await name.press('Tab');
        await name.hover();
        await expect(name).not.toBeFocused();
        const before = (await name.boundingBox())!;
        const hover = await name.evaluate(
          (node) => getComputedStyle(node, '::placeholder').opacity
        );
        expect(Number(hover)).toBeGreaterThan(0);
        await page.screenshot({ path: info.outputPath('placeholder-hover.png'), fullPage: false });
        await name.click();
        await expect(name).toBeFocused();
        await expect
          .poll(() => name.evaluate((node) => getComputedStyle(node, '::placeholder').opacity))
          .toBe('0');
        const after = (await name.boundingBox())!;
        expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath('placeholder-caret.png'), fullPage: false });
        await name.fill(locale === 'ru' ? 'Проверка текста' : 'Authored text check');
        await expect(name).toHaveValue(locale === 'ru' ? 'Проверка текста' : 'Authored text check');
      });
    }
