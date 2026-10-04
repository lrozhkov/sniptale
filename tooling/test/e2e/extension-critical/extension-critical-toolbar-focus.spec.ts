import { expect, test } from '../support/extension-fixture';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
function readFocusPaint(element: Element) {
  const style = getComputedStyle(element);
  return {
    outline:
      style.outlineStyle === 'none' || style.outlineStyle === 'hidden'
        ? 'none'
        : `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
    shadow: style.boxShadow,
  };
}
let opened: Awaited<ReturnType<typeof openDesignReview>> | null = null;
test.afterEach(async () => {
  await opened?.page.close();
  await opened?.popup.close();
  opened = null;
});

test('pointer-open toolbar menu Escape preserves pointer paint at HD', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  opened = await openDesignReview(context, extensionId, hostOrigin);
  const { page } = opened;
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
  const trigger = page.locator('[data-ui="content.toolbar.auto-blur-button"]');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => trigger.evaluate(readFocusPaint))
    .toEqual({ outline: 'none', shadow: 'none' });
});

test('switching from Sensitive Data Blur keeps the new toolbar menu active at HD', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  opened = await openDesignReview(context, extensionId, hostOrigin);
  const { page } = opened;
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.highlighter"]').click();
  const oldTrigger = page.locator('[data-ui="content.toolbar.auto-blur-button"]');
  const nextTrigger = page.locator('[data-ui="content.toolbar.settings-button"]');
  await oldTrigger.click();
  await expect(oldTrigger).toHaveAttribute('aria-expanded', 'true');
  await nextTrigger.click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await expect(oldTrigger).not.toBeFocused();
  await expect(nextTrigger).toHaveAttribute('aria-expanded', 'true');
});

test('page editing menus preserve opening focus paint and AutoBlur transitions across modes at HD', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  opened = await openDesignReview(context, extensionId, hostOrigin);
  const { page } = opened;
  const toolbar = page.locator('[data-ui="content.toolbar.root"]');
  const visited = new Set<string>();
  for (const mode of ['highlighter', 'design-review', 'drawing']) {
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
    if (mode === 'highlighter') {
      const box = await page.locator('#measurement-target').boundingBox();
      if (!box) throw new Error('Annotation fixture is not visible');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    const ids = await toolbar
      .locator(
        "button.sniptale-btn:not(:disabled):not([data-ui^='content.toolbar.drawing.'])" +
          ":is([aria-haspopup='menu'],[aria-haspopup='dialog'],[data-menu-indicator='true'])"
      )
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-ui')));
    expect(ids.every((id) => id !== null)).toBe(true);
    for (const id of ids) {
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const trigger = toolbar.locator(`[data-ui="${id}"]`);
      await trigger.hover();
      await trigger.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      const pointerPaint = await trigger.evaluate(readFocusPaint);
      await trigger.click();
      await expect(toolbar).toHaveAttribute('data-menu-open', 'true');
      await page.keyboard.press('Escape');
      await expect(toolbar).not.toHaveAttribute('data-menu-open', 'true');
      await expect(trigger).toBeFocused();
      await expect.poll(() => trigger.evaluate(readFocusPaint)).toEqual(pointerPaint);
      // Navigation from outside the restored control must release pointer-only presentation.
      await page.keyboard.press('Tab');
      await trigger.focus();
      await trigger.press('Enter');
      await expect(toolbar).toHaveAttribute('data-menu-open', 'true');
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expect.poll(() => trigger.evaluate(readFocusPaint)).not.toEqual(pointerPaint);
      await expect
        .poll(() => trigger.evaluate((element) => element.matches(':focus-visible')))
        .toBe(true);
      await trigger.click();
      await page.keyboard.press('Escape');
      await expect.poll(() => trigger.evaluate(readFocusPaint)).toEqual(pointerPaint);
    }
    const oldTrigger = toolbar.locator('[data-ui="content.toolbar.auto-blur-button"]');
    if ((await oldTrigger.count()) === 0) continue;
    for (const id of ids) {
      if (!id || id === 'content.toolbar.auto-blur-button') continue;
      const next = toolbar.locator(`[data-ui="${id}"]`);
      for (const keyboard of [false, true]) {
        await oldTrigger.click();
        await expect(oldTrigger).toHaveAttribute('aria-expanded', 'true');
        if (keyboard) {
          await next.focus();
          await next.press('Enter');
        } else await next.click();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        await expect(oldTrigger).not.toBeFocused();
        await expect(toolbar).toHaveAttribute('data-menu-open', 'true');
        await page.keyboard.press('Escape');
        await expect(next).toBeFocused();
      }
    }
  }
  expect(visited).toContain('content.toolbar.auto-blur-button');
  expect(visited).toContain('content.toolbar.settings-button');
  expect(visited).toContain('content.toolbar.viewport-button');
  expect(visited).toContain('content.toolbar.timer-button');
  expect(visited).toContain('content.toolbar.mode-selector-button');
  expect(visited).toContain('content.toolbar.reset-all-button');
  expect(visited).toContain('content.toolbar.future-frame-style.menu');
  expect(visited).toContain('content.toolbar.future-frame-callout.menu');
  expect(visited).toContain('content.toolbar.future-frame-step-badge.menu');
  expect(visited).toContain('content.toolbar.annotation-export-button');
  expect(visited).toContain('content.toolbar.capture-full-settings-button');
  expect(visited).toContain('content.toolbar.capture-action-button');
});
