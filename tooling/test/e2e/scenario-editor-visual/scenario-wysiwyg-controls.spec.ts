import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`guide controls stay outside content flow in ${theme} at HD`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 720 });
    const step = page.locator('article#compare');
    const text = step.locator('.guide-block[data-kind="text"]').first();
    const image = step.locator('.guide-image-surface').first();
    const report = await text.evaluate((node) => {
      const field = node.querySelector('textarea')!;
      return {
        paddingTop: getComputedStyle(node).paddingTop,
        fieldOffset: field.getBoundingClientRect().top - node.getBoundingClientRect().top,
        paddingRight: getComputedStyle(field).paddingRight,
        paddingLeft: getComputedStyle(field).paddingLeft,
      };
    });
    expect.soft(report.paddingTop, 'block has no editor header reserve').toBe('0px');
    expect.soft(report.fieldOffset, 'prose starts at block top').toBeLessThan(1);
    expect
      .soft(report.paddingRight, 'voice control does not narrow prose')
      .toBe(report.paddingLeft);
    const imageOffset = await image.evaluate((node) => {
      const frame = node.querySelector('.guide-image-frame')!;
      return frame.getBoundingClientRect().top - node.getBoundingClientRect().top;
    });
    expect.soft(imageOffset, 'image tools do not reserve a header').toBeLessThan(1);
    const geometry = () =>
      text.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const parent = node.closest('article')!.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          x: box.left - parent.left,
          y: box.top - parent.top,
        };
      });
    const before = await geometry();
    await text.locator('textarea').focus();
    await expect(text.locator('.guide-block-actions')).toHaveCSS('opacity', '1');
    await expect(text.locator('.guide-voice-control')).toHaveCSS('opacity', '1');
    expect(await geometry()).toEqual(before);
    await image.hover();
    await expect(image.locator('.guide-image-tools')).toHaveCSS('pointer-events', 'auto');
    expect(await geometry()).toEqual(before);
    const tools = image.locator('.guide-image-tools');
    const contained = await tools.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const image = node.parentElement!.getBoundingClientRect();
      return (
        box.left >= image.left &&
        box.right <= image.right &&
        box.top >= image.top &&
        box.bottom <= image.bottom
      );
    });
    expect.soft(contained, 'image toolbar stays inside the image block').toBe(true);
    const button = tools.locator('button').first();
    await expect.soft(button).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect.soft(button).toHaveCSS('border-width', '1px');
    // Resolve computed color mixes through canvas, then verify non-text contrast.
    const contrast = async () =>
      button.evaluate((node) => {
        const style = getComputedStyle(node);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const color = (value: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data];
        };
        const luminance = (rgb: number[]) =>
          rgb
            .slice(0, 3)
            .map((c) => {
              const value = c / 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const background = color(style.backgroundColor);
        const ratio = (value: string) => {
          const a = luminance(color(value));
          const b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        return {
          alpha: background[3],
          icon: ratio(style.color),
          border: ratio(style.borderTopColor),
        };
      });
    await button.hover();
    let colors = await contrast();
    expect(colors.alpha).toBe(255);
    expect(colors.icon).toBeGreaterThanOrEqual(3);
    expect(colors.border).toBeGreaterThanOrEqual(3);
    await button.focus();
    await expect(button).toHaveCSS('outline-style', 'solid');
    colors = await contrast();
    expect(colors.alpha).toBe(255);
    expect(colors.icon).toBeGreaterThanOrEqual(3);
    expect(colors.border).toBeGreaterThanOrEqual(3);
    await testInfo.attach(`guide-controls-${theme}`, {
      body: await page.screenshot({ path: `.tmp/guide-controls/guide-${theme}.png` }),
      contentType: 'image/png',
    });
    issues.assertClean();
  });
}

test('short quarter blocks retain separate controls at HD with compact spacing', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'dark', 'en', { width: 1280, height: 720 });
  const step = page.locator('article#compare');
  const text = step.locator('.guide-block[data-kind="text"]').first();
  await text.locator('textarea').fill('A');
  await page
    .locator('#guide-inspector-panel')
    .getByRole('button', { name: 'Quarter width', exact: true })
    .click();
  for (let index = 0; index < 3; index++) {
    await text.locator('.guide-block-actions button').focus();
    await text.locator('.guide-block-actions button').click();
    await page.getByRole('button', { name: 'Duplicate block', exact: true }).click();
  }
  await page
    .locator('.guide-page-header')
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  const inspector = page.locator('#guide-inspector-panel');
  for (const [field, option] of [
    ['Spacing', 'Compact'],
    ['Paper theme', 'Graphite'],
  ]) {
    const select = inspector
      .getByRole('button', { name: field, exact: true })
      .and(inspector.locator('[aria-haspopup="listbox"]'));
    if (await select.count()) {
      await select.click();
      await page.getByRole('option', { name: option, exact: true }).click();
    } else {
      await inspector
        .getByRole('group', { name: field, exact: true })
        .getByRole('button', { name: option, exact: true })
        .click();
    }
  }
  const blocks = step.locator('.guide-block[data-kind="text"]');
  await expect(blocks).toHaveCount(4);
  await blocks.first().scrollIntoViewIfNeeded();
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
  const report = await blocks.evaluateAll((nodes) => {
    const controls = nodes
      .flatMap((node) => [
        ...node.querySelectorAll<HTMLElement>(
          [
            '.guide-block-grip',
            '.guide-block-width',
            '.guide-block-height',
            '.guide-block-actions button',
            '.guide-voice-control button',
          ].join(', ')
        ),
      ])
      .filter((node) => getComputedStyle(node).display !== 'none');
    const boxes = controls.map((node) => node.getBoundingClientRect());
    return {
      tops: nodes.map((node) => node.getBoundingClientRect().top),
      overlaps: boxes.flatMap((a, i) =>
        boxes
          .slice(i + 1)
          .filter(
            (b) =>
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
          )
      ).length,
      controls: controls.map((node, i) => ({ name: node.className, box: boxes[i].toJSON() })),
      reachable: controls.every((node, i) => {
        const box = boxes[i];
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit === node || (!!hit && node.contains(hit));
      }),
    };
  });
  expect(new Set(report.tops).size).toBe(1);
  expect(report.overlaps, JSON.stringify(report)).toBe(0);
  expect(report.reachable).toBe(true);
  await session.detach();
});

test('narrow image overlay leaves pan and resize reachable while framing', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 720 });
  const block = page.locator('article#compare .guide-block[data-kind="image"]').first();
  const width = block.locator('.guide-block-width');
  await width.focus();
  for (let index = 0; index < 7; index++) await width.press('Shift+ArrowLeft');
  for (let index = 0; index < 5; index++) await width.press('ArrowLeft');
  await expect(block).toHaveAttribute('data-width', '25');
  await block.hover();
  await block.getByRole('button', { name: 'Frame and image', exact: true }).click();
  const frame = block.locator('.guide-image-frame');
  await frame.scrollIntoViewIfNeeded();
  const report = await frame.evaluate((node) => {
    const tools = node.querySelector<HTMLElement>('.guide-image-tools')!;
    const resize = node.querySelector<HTMLElement>('.guide-image-resize')!;
    const a = tools.getBoundingClientRect();
    const b = resize.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return {
      contained:
        a.left >= box.left && a.right <= box.right && a.top >= box.top && a.bottom <= box.bottom,
      overlap:
        Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
        Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top),
      resizeReachable: hit === resize || (!!hit && resize.contains(hit)),
      panReachable:
        document.elementFromPoint(box.x + 4, box.bottom - 4) === node ||
        document.elementFromPoint(box.x + 4, box.bottom - 4)?.tagName === 'IMG',
      scrolls: tools.scrollWidth > tools.clientWidth,
    };
  });
  expect(report).toEqual({
    contained: true,
    overlap: false,
    resizeReachable: true,
    panReachable: true,
    scrolls: true,
  });
  await block.getByRole('button', { name: 'Done', exact: true }).focus();
  const done = block.getByRole('button', { name: 'Done', exact: true });
  await done.click();
  await expect(frame).toHaveAttribute('data-editing', 'false');
});
