import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

test('guide insertion does not force menu-sized vertical whitespace at HD', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 720 });
  const metrics = await page.locator('article#compare .guide-step-blocks').evaluate((node) => {
    const css = getComputedStyle(node);
    return {
      gap: parseFloat(css.rowGap),
      paddingTop: parseFloat(css.paddingTop),
      paddingBottom: parseFloat(css.paddingBottom),
    };
  });
  expect(metrics).toEqual({ gap: 20, paddingTop: 16, paddingBottom: 16 });
});

test('guide insertion opens across the row width without precise plus targeting at HD', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 720 });
  const insert = page.locator('.guide-insertion-item[data-insert-before="compare"]');
  await insert.locator('button').scrollIntoViewIfNeeded();
  const button = (await insert.locator('button').boundingBox())!;
  await page.mouse.move(button.x + button.width / 2 + 55, button.y + button.height / 2);
  await expect(page.locator('.guide-action-menu--insert')).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  for (const paper of ['White', 'Graphite'] as const) {
    test(`guide insertion overlays, hit zones and opaque actions at HD in ${theme}/${paper}`, async ({
      page,
      hostOrigin,
    }) => {
      await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 720 });
      await page
        .locator('.guide-page-header')
        .getByRole('button', { name: 'Appearance', exact: true })
        .click();
      const inspector = page.locator('#guide-inspector-panel');
      await inspector
        .getByRole('group', { name: 'Paper theme', exact: true })
        .getByRole('button', { name: paper, exact: true })
        .click();
      const step = page.locator('article#compare');
      await expect(step).toHaveCSS(
        'background-color',
        paper === 'White' ? 'rgb(255, 255, 255)' : 'rgb(36, 38, 43)'
      );
      for (const [density, gap] of [
        ['Compact', 12],
        ['Comfortable', 20],
        ['Spacious', 32],
      ] as const) {
        await page
          .locator('.guide-page-header')
          .getByRole('button', { name: 'Appearance', exact: true })
          .click();
        await inspector.getByRole('button', { name: 'Spacing', exact: true }).click();
        await page.getByRole('option', { name: density, exact: true }).click();
        await expect(step.locator('.guide-step-blocks')).toHaveCSS('row-gap', `${gap}px`);
        const insert = step.locator('.guide-insertion-block[data-insert-before="before"]');
        const trigger = insert.locator('button');
        await trigger.scrollIntoViewIfNeeded();
        await page.mouse.move(10, 10);
        const anchor = insert.locator('.guide-insert-anchor');
        const box = (await anchor.boundingBox())!;
        expect(box.height).toBeLessThanOrEqual(gap);
        const before = await step.evaluate((node) => ({
          height: node.getBoundingClientRect().height,
          blocks: [...node.querySelectorAll('.guide-block')].map((block) => {
            const rect = block.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
          scrollHeight: node.closest('.guide-document-scroll')!.scrollHeight,
        }));
        await expect(trigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(trigger).toHaveCSS('box-shadow', 'none');
        expect((await trigger.boundingBox())!.width).toBe(24);
        await page.mouse.move(box.x + 8, box.y + box.height / 2);
        const menu = page.locator('.guide-action-menu--insert');
        await expect(menu).toBeVisible();
        const row = (await menu.boundingBox())!;
        expect(Math.abs(row.width - box.width)).toBeLessThan(1);
        await page.mouse.move(row.x + row.width - 16, row.y + row.height / 2, { steps: 8 });
        await expect(menu).toBeVisible();
        const colors = await menu.locator('.guide-insert-actions > button').evaluateAll((buttons) =>
          buttons.map((button) => {
            const css = getComputedStyle(button);
            return { background: css.backgroundColor, color: css.color, radius: css.borderRadius };
          })
        );
        for (const color of colors) {
          expect(color.background).not.toMatch(/rgba\(|\/\s*0\./);
          expect(color.background).not.toBe(color.color);
          expect(color.radius).not.toBe('50%');
        }
        const contrasts = await menu
          .locator('.guide-insert-actions > button')
          .evaluateAll((buttons) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d')!;
            const rgba = (color: string) => {
              context.clearRect(0, 0, 1, 1);
              context.fillStyle = color;
              context.fillRect(0, 0, 1, 1);
              return [...context.getImageData(0, 0, 1, 1).data];
            };
            const luminance = (color: number[]) =>
              color
                .slice(0, 3)
                .map((channel) => {
                  const value = channel / 255;
                  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
                })
                .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
            return buttons.map((button) => {
              const css = getComputedStyle(button);
              const background = rgba(css.backgroundColor);
              const a = luminance(background),
                b = luminance(rgba(css.color));
              return {
                alpha: background[3],
                contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              };
            });
          });
        for (const color of contrasts) {
          expect(color.alpha).toBe(255);
          expect(color.contrast).toBeGreaterThanOrEqual(3);
        }
        expect(
          await step.evaluate((node) => ({
            height: node.getBoundingClientRect().height,
            blocks: [...node.querySelectorAll('.guide-block')].map((block) => {
              const rect = block.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }),
            scrollHeight: node.closest('.guide-document-scroll')!.scrollHeight,
          }))
        ).toEqual(before);
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(inspector.getByRole('button', { name: 'Spacing', exact: true })).toBeFocused();
        await trigger.focus();
        await page.keyboard.press('ArrowDown');
        await expect(menu.locator('button').first()).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(menu.locator('button').nth(1)).toBeFocused();
        await page.keyboard.press('Escape');
        // Click/tap the hit zone without waiting for hover; native button activation still works.
        await page.mouse.move(10, 10);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect(menu.locator('button').first()).toBeFocused();
        await page.keyboard.press('Escape');
      }
      // Unequal side-by-side blocks, including an anchor narrower than its five-action row.
      await step
        .locator('.guide-block[data-block-id="description"] textarea')
        .first()
        .fill('A long explanation\nSecond line\nThird line\nFourth line\nFifth line');
      for (const id of ['description', 'before']) {
        const width = step.locator(`[data-block-id="${id}"] .guide-block-width`);
        await width.focus();
        for (let count = 0; count < 7; count += 1) await page.keyboard.press('Shift+ArrowLeft');
        for (let count = 0; count < 5; count += 1) await page.keyboard.press('ArrowLeft');
      }
      const narrow = step.locator('[data-block-id="before"]');
      await expect(narrow).toHaveAttribute('data-width', '25');
      const bounds = (await narrow.boundingBox())!;
      expect(bounds.width).toBeLessThan(208);
      const sibling = (await step.locator('[data-block-id="description"]').boundingBox())!;
      expect(Math.abs(sibling.height - bounds.height)).toBeGreaterThan(10);
      const anchor = narrow.locator('.guide-insert-anchor');
      await anchor.scrollIntoViewIfNeeded();
      const hit = (await anchor.boundingBox())!;
      expect(hit.width).toBeLessThanOrEqual(bounds.width + 1);
      expect(
        await anchor.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          );
        })
      ).toBe(true);
      await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
      const narrowMenu = page.locator('.guide-action-menu--insert');
      await expect(narrowMenu).toBeVisible();
      const outer = (await narrowMenu.boundingBox())!;
      expect(outer.width).toBeGreaterThan(hit.width);
      await page.mouse.move(outer.x + outer.width - 8, outer.y + outer.height / 2);
      await narrowMenu.locator('button').last().focus();
      await page.keyboard.press('Escape');
      await expect(narrowMenu).toHaveCount(0);
      await page.mouse.move(10, 10);
      const returnedHit = (await anchor.boundingBox())!;
      await page.mouse.move(
        returnedHit.x + returnedHit.width / 2,
        returnedHit.y + returnedHit.height / 2
      );
      await expect(narrowMenu).toBeVisible();
      await page.keyboard.press('Escape');
      // The actual editable field remains the hit target, even near its top edge.
      const text = step.locator('[data-block-id="description"] textarea').first();
      expect(
        await text.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(rect.x + 12, rect.y + 4));
        })
      ).toBe(true);
      await text.focus();
      const chromeFree = await step.evaluate((node) => {
        const previous = node.getBoundingClientRect().height;
        const insertions = [...node.querySelectorAll<HTMLElement>('.guide-insertion')];
        for (const insertion of insertions) insertion.style.display = 'none';
        const without = node.getBoundingClientRect().height;
        for (const insertion of insertions) insertion.style.removeProperty('display');
        return { previous, without };
      });
      expect(chromeFree.without).toBe(chromeFree.previous);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
        true
      );
      await expect(page.getByRole('status').first()).toHaveText('Saved');
      await page.reload();
      await expect(page.locator('[data-block-id="before"]')).toHaveAttribute('data-width', '25');
      await expect(page.locator('article#compare')).toHaveCSS(
        'background-color',
        paper === 'White' ? 'rgb(255, 255, 255)' : 'rgb(36, 38, 43)'
      );
    });
  }
}

test('guide start, end and empty insertion rails leave text and neighboring points available at HD', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'dark', 'en', { width: 1280, height: 720 });
  const emptyStep = page.locator('article#text-only');
  await expect(emptyStep.locator('.guide-empty-step')).toBeVisible();
  await page.mouse.move(10, 10);
  const geometry = await page.locator('.guide-document').evaluate((document) => {
    const anchors = [...document.querySelectorAll('.guide-insert-anchor')].map((node) =>
      node.getBoundingClientRect()
    );
    const fields = [...document.querySelectorAll('textarea, [data-image-upload]')].map((node) =>
      node.getBoundingClientRect()
    );
    const overlap = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    return {
      anchorCount: anchors.length,
      textCollisions: anchors.filter((anchor) => fields.some((field) => overlap(anchor, field)))
        .length,
      railCollisions: anchors.filter((anchor, index) =>
        anchors.slice(index + 1).some((other) => overlap(anchor, other))
      ).length,
    };
  });
  expect(geometry.anchorCount).toBeGreaterThan(8);
  expect(geometry.textCollisions).toBe(0);
  expect(geometry.railCollisions).toBe(0);
  for (const selector of [
    '.guide-document > .guide-insertion-item:first-child',
    '.guide-document > .guide-insertion-item[data-end="true"]',
    'article#compare .guide-insertion-block[data-end="true"]',
    'article#text-only .guide-empty-step .guide-insertion-block',
  ]) {
    const boundary = page.locator(selector);
    const anchor = boundary.locator('.guide-insert-anchor');
    await anchor.scrollIntoViewIfNeeded();
    expect(
      await anchor.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        );
      })
    ).toBe(true);
    const trigger = anchor.locator('button');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.guide-action-menu--insert button').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});
