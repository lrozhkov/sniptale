import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`block inspector follows text and note selection in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
    url.searchParams.set('projectId', `blocks-${crypto.randomUUID()}`);
    url.searchParams.set('theme', theme);
    url.searchParams.set('locale', 'en');
    url.searchParams.set('stepId', 'compare');
    await page.goto(url.toString());
    const step = page.locator('article#compare');
    const block = step.locator('.guide-block[data-kind="text"]').first();
    const inspector = page.locator('#guide-inspector-panel');
    await block.locator('textarea').focus();
    await inspector.getByRole('button', { name: 'Half width', exact: true }).click();
    await expect(block).toHaveAttribute('data-width', '50');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(block).toHaveAttribute('data-width', '100');
    const add = step
      .locator('.guide-insertion-block')
      .last()
      .getByRole('button', { name: 'Note', exact: true });
    await add.focus();
    await add.click();
    const note = step.locator('.guide-block[data-kind="note"]').last();
    await note.locator('textarea').fill('Keep this note.');
    await inspector.getByRole('button', { name: 'Note type', exact: true }).click();
    await page.getByRole('option', { name: 'Warning', exact: true }).click();
    await expect(note.locator('aside')).toHaveAttribute('data-tone', 'warning');
    await inspector.getByRole('button', { name: 'Half width', exact: true }).click();
    await expect(note).toHaveAttribute('data-width', '50');
    await inspector
      .getByRole('group', { name: 'Text size', exact: true })
      .getByRole('button', { name: 'Large', exact: true })
      .click();
    await inspector.getByRole('button', { name: 'Center', exact: true }).click();
    await expect(note.locator('textarea')).toHaveCSS('font-size', '20px');
    await expect(note.locator('textarea')).toHaveCSS('text-align', 'center');
    await inspector.getByRole('button', { name: 'Reset text appearance', exact: true }).click();
    await expect(note.locator('textarea')).toHaveCSS('font-size', '16px');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(note.locator('textarea')).toHaveCSS('font-size', '20px');
    await expect(note.locator('textarea')).toHaveCSS('text-align', 'center');
    await expect
      .poll(() =>
        page
          .locator('main img')
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
    await expect(
      inspector.getByRole('button', { name: 'Half width', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await page.locator('main img').last().scrollIntoViewIfNeeded();
    await testInfo.attach(`block-inspector-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await inspector.getByRole('button', { name: 'Step settings', exact: true }).click();
    await expect(step.getByRole('textbox', { name: 'Step title', exact: true })).toBeFocused();
    await expect(
      inspector
        .getByRole('region', { name: 'Step layout', exact: true })
        .getByRole('button', { name: 'Step layout', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(url.toString());
    await expect(note.locator('aside')).toHaveAttribute('data-tone', 'warning');
    await expect(note).toHaveAttribute('data-width', '50');
    await expect(note.locator('textarea')).toHaveValue('Keep this note.');
    await expect(note.locator('textarea')).toHaveCSS('font-size', '20px');
    await expect(note.locator('textarea')).toHaveCSS('text-align', 'center');
    await expect(
      inspector
        .getByRole('region', { name: 'Step layout', exact: true })
        .getByRole('button', { name: 'Step layout', exact: true })
    ).toBeVisible();
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`heading presets are compact and reversible in ${theme} ${locale}`, async ({
      page,
      hostOrigin,
    }, testInfo) => {
      await openVisualHarness(page, hostOrigin, theme, locale, { width: 1024, height: 640 });
      const add = page
        .locator('article#compare .guide-insertion-block')
        .last()
        .getByRole('button', { name: locale === 'ru' ? 'Подзаголовок' : 'Heading', exact: true });
      await add.focus();
      await add.click();
      const block = page.locator('.guide-block[data-kind="heading"]').first();
      const field = block.locator('input,textarea').first();
      await field.fill(locale === 'ru' ? 'Подзаголовок раздела' : 'Section heading');
      const inspector = page.locator('#guide-inspector-panel');
      if (!(await inspector.isVisible()))
        await page
          .locator('.guide-page-header')
          .getByRole('button', { name: locale === 'ru' ? 'Настройки' : 'Inspector', exact: true })
          .click();
      const group = inspector.getByRole('group', {
        name: locale === 'ru' ? 'Размер текста' : 'Text size',
        exact: true,
      });
      const buttons = group.getByRole('button');
      await expect(buttons).toHaveCount(3);
      await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
      const boxes = await buttons.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            clipped: node.scrollWidth > node.clientWidth + 1,
          };
        })
      );
      expect(boxes.every((box) => Math.abs(box.top - boxes[0]!.top) < 1 && !box.clipped)).toBe(
        true
      );
      for (const [index, size] of ['18px', '20px', '22px'].entries()) {
        await buttons.nth(index).click();
        await expect(field).toHaveCSS('font-size', size);
      }
      await page
        .getByRole('button', { name: locale === 'ru' ? 'Отменить' : 'Undo', exact: true })
        .click();
      await expect(field).toHaveCSS('font-size', '20px');
      await testInfo.attach(`heading-presets-${theme}-${locale}`, {
        body: await page.screenshot({
          path: `tasks/scenario-production-polish/heading-${theme}-${locale}.png`,
        }),
        contentType: 'image/png',
      });
    });
  }
}
