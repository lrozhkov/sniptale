import { expect, test } from '../support/extension-fixture';
import type { Page, TestInfo } from '@playwright/test';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function expectScreenshotDelayIndicator(page: Page, info: TestInfo, orientation: string) {
  const trigger = page.locator('[data-ui="content.toolbar.timer-button"]');
  for (const [index, delay] of [
    [1, 3],
    [2, 5],
    [3, 10],
    [0, 0],
  ] as const) {
    await trigger.click();
    await page
      .locator('[data-ui="content.toolbar.timer-menu"] .sniptale-toolbar-menu-item')
      .nth(index)
      .click();
    const value = trigger.locator('[data-ui="content.toolbar.timer-value"]');
    if (delay === 0) {
      await expect(value).toHaveCount(0);
      await expect(trigger).toHaveAttribute('data-menu-indicator', 'true');
      continue;
    }
    await expect(value).toHaveText(String(delay));
    await expect(trigger).not.toHaveAttribute('data-menu-indicator');
    for (const size of [29, 30, 31]) {
      await trigger.evaluate(
        (node, size) => node.style.setProperty('--sniptale-toolbar-button-size', `${size}px`),
        size
      );
      const icon = trigger.locator('.sniptale-toolbar-delay-icon');
      if (size < 30) await expect(icon).toBeHidden();
      else await expect(icon).toBeVisible();
      await expect(value).toHaveCSS('position', size < 30 ? 'static' : 'absolute');
      await expect(value).toHaveCSS('font-size', size < 30 ? '13px' : '9px');
      if (delay === 10)
        await page.screenshot({
          path: info.outputPath(`timer-${orientation}-${size}.png`),
          fullPage: false,
        });
    }
    await trigger.evaluate((node) => node.style.removeProperty('--sniptale-toolbar-button-size'));
  }
}
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

for (const appearance of [
  { theme: 'dark', locale: 'en', width: 1280, height: 560 },
  { theme: 'light', locale: 'ru', width: 1280, height: 560 },
  { theme: 'dark', locale: 'ru', width: 1920, height: 900 },
  { theme: 'light', locale: 'en', width: 1920, height: 900 },
  { theme: 'dark', locale: 'en', width: 960, height: 560 },
] as const) {
  test(`toolbar menu text stays regular ${appearance.theme} ${appearance.locale} ${appearance.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const windowsRendering = appearance.locale === 'ru';
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(async ({ theme, locale }) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
    }, appearance);
    opened = await openDesignReview(context, extensionId, hostOrigin, appearance);
    const { page } = opened;
    if (windowsRendering) {
      await page.locator('.sniptale-toolbar').evaluate((element) => {
        const root = element.getRootNode();
        if (root instanceof ShadowRoot) root.host.setAttribute('data-ui-platform', 'windows');
      });
    }
    await page.addStyleTag({
      content:
        `body { background: ${appearance.theme === 'dark' ? '#222' : '#fff'}; } * { ` +
        `-webkit-text-stroke: 0.35px !important; }`,
    });
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
    await page.evaluate(() => document.fonts.ready);
    for (const compact of [false, true]) {
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      const toggle = page
        .locator('.sniptale-toolbar-menu-item')
        .filter({ hasText: /Compact menu view|Компактный вид меню/ });
      const selected = await toggle.evaluate((element) =>
        element.classList.contains('sniptale-popover-item-selected')
      );
      if (selected !== compact) await toggle.click();
      await page.keyboard.press('Escape');
      for (const name of ['mode-selector', 'settings', 'viewport']) {
        await page.locator(`[data-ui="content.toolbar.${name}-button"]`).click();
        const menu = page.locator('.sniptale-toolbar-menu:visible').last();
        await expect(menu).toBeVisible();
        expect(
          await menu.evaluate((element) =>
            element.classList.contains('sniptale-toolbar-menu--compact')
          )
        ).toBe(compact);
        const labels = menu.locator('.sniptale-toolbar-menu-item-label');
        expect(await labels.count()).toBeGreaterThan(0);
        const typography = await labels.evaluateAll((elements) =>
          elements.map((element) => {
            const style = getComputedStyle(element);
            return {
              weight: style.fontWeight,
              stroke: style.webkitTextStrokeWidth,
              family: style.fontFamily,
              fill: style.getPropertyValue('-webkit-text-fill-color'),
            };
          })
        );
        for (const style of typography) {
          expect(style.weight).toBe('400');
          expect(style.stroke).toBe('0px');
          expect(style.family).toContain('Sniptale Interface');
          if (appearance.theme === 'dark' && windowsRendering) {
            expect(style.fill).toContain('/ 0.82)');
          } else {
            expect(style.fill).not.toContain('/ 0.82)');
          }
        }
        const option = menu.getByRole('button').first();
        await option.hover();
        await expect(labels.first()).toHaveCSS('font-weight', '400');
        await option.focus();
        await expect(labels.first()).toHaveCSS('font-weight', '400');
        await expect(labels.first()).toHaveCSS('-webkit-text-stroke-width', '0px');
        if (compact || name === 'mode-selector') {
          await page.screenshot({
            path: info.outputPath(`${compact ? 'compact' : 'expanded'}-${name}.png`),
            fullPage: false,
          });
        }
        await page.keyboard.press('Escape');
      }
    }
    await expect(page.locator('h1').first()).toHaveCSS('-webkit-text-stroke-width', '0.35px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}
test.afterEach(async () => {
  await opened?.page.close();
  await opened?.popup.close();
  opened = null;
});

for (const appearance of [
  { theme: 'light', width: 1280, height: 560 },
  { theme: 'dark', width: 1280, height: 560 },
  { theme: 'light', width: 1920, height: 900 },
  { theme: 'dark', width: 1920, height: 900 },
] as const) {
  test(`settings menu trigger uses borderless property chrome ${appearance.theme} ${appearance.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(async (theme) => {
      await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
    }, appearance.theme);
    opened = await openDesignReview(context, extensionId, hostOrigin, appearance);
    const { page } = opened;
    const trigger = page.locator('[data-ui="content.toolbar.settings-button"]');
    for (const mode of ['cursor', 'video-recording', 'design-review']) {
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      if (mode === 'video-recording')
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.customize"] .tabler-eye-cog')
        ).toBeVisible();
      for (const orientation of ['horizontal', 'vertical']) {
        await trigger.click();
        const direction = page.getByRole('button', {
          name:
            orientation === 'horizontal'
              ? /Horizontal view|Горизонтальный вид/u
              : /Vertical view|Вертикальный вид/u,
        });
        if (!(await direction.isVisible()))
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        await direction.click();
        if ((await trigger.getAttribute('aria-expanded')) === 'true')
          await page.keyboard.press('Escape');
        await expect(page.locator('[data-ui="content.toolbar.root"]')).toHaveAttribute(
          'data-display-mode',
          orientation
        );
        await page.mouse.move(0, 0);
        await expect(trigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await trigger.hover();
        await expect(trigger).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
        await expect(trigger).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(trigger).toHaveAttribute('data-command-property', 'true');
        await expect(trigger).toHaveAttribute('data-menu-indicator', 'true');
        expect(
          await trigger.evaluate((element) => getComputedStyle(element, '::before').borderTopStyle)
        ).toBe('solid');
        await page.screenshot({
          path: info.outputPath(`${mode}-${orientation}-hover.png`),
          fullPage: false,
        });
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(trigger).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
        await page.keyboard.press('Escape');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        if (mode === 'cursor') await expectScreenshotDelayIndicator(page, info, orientation);
        if (mode === 'design-review') {
          if (
            !(await page
              .locator('[data-ui="content.toolbar.annotation-export-button"]')
              .isVisible())
          ) {
            await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
            await page.locator('[data-ui="content.toolbar.mode-option.design-review"]').click();
          }
          const exportTrigger = page.locator(
            '[data-ui="content.toolbar.annotation-export-button"]'
          );
          await page.mouse.move(0, 0);
          await expect(exportTrigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await exportTrigger.hover();
          await expect(exportTrigger).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(exportTrigger).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
          await expect(exportTrigger).toHaveAttribute('data-command-property', 'true');
          await expect(exportTrigger).toHaveAttribute('data-menu-indicator', 'true');
          await page.screenshot({
            path: info.outputPath(`export-${orientation}-hover.png`),
            fullPage: false,
          });
          await exportTrigger.click();
          await expect(exportTrigger).toHaveAttribute('aria-expanded', 'true');
          await page.keyboard.press('Escape');
          await expect(exportTrigger).toHaveAttribute('aria-expanded', 'false');
        }
      }
    }
  });
}

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
      await expect(toolbar).toHaveAttribute('data-menu-open', 'true');
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

for (const orientation of ['horizontal', 'vertical']) {
  for (const size of [
    { width: 1280, height: 560 },
    { width: 1920, height: 900 },
  ]) {
    test(`mode transitions keep one toolbar geometry ${orientation} ${size.width}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      page.setDefaultTimeout(10_000);
      if (orientation === 'vertical') {
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        const free = page.getByRole('button', {
          name: /Free toolbar placement|Свободное размещение панели/u,
        });
        if (!(await free.getAttribute('class'))?.includes('sniptale-popover-item-selected'))
          await free.click();
        await page.keyboard.press('Escape');
        if (
          (await page
            .locator('[data-ui="content.toolbar.root"]')
            .getAttribute('data-display-mode')) !== 'vertical'
        ) {
          await page.locator('[data-ui="content.toolbar.settings-button"]').click();
          await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).click();
        }
      }
      const toolbar = page.locator('[data-ui="content.toolbar.root"]');
      const modes = ['design-review', 'quick-edit', 'drawing', 'highlighter'];
      await page.evaluate(() => document.fonts.ready);
      const issues: string[] = [];
      const select = async (mode: string) => {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      };
      try {
        for (const from of modes) {
          for (const to of modes.filter((mode) => mode !== from)) {
            await select(from);
            await toolbar.evaluate(async (element) => {
              await Promise.all(
                element
                  .getAnimations()
                  .map((animation) => animation.finished.catch(() => undefined))
              );
            });
            const beforeBounds = (await toolbar.boundingBox())!;
            const before = orientation === 'vertical' ? beforeBounds.height : beforeBounds.width;
            await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
            const sampling = toolbar.evaluate(
              async (element, { direction, target }) => {
                const frames: Array<{ width: number; mixed: boolean }> = [];
                const sampled = new Set<Animation>();
                const capture = () =>
                  frames.push({
                    width:
                      direction === 'vertical'
                        ? element.getBoundingClientRect().height
                        : element.getBoundingClientRect().width,
                    mixed: Boolean(
                      element.querySelector('.sniptale-page-editing-mode-group') &&
                      element.querySelector('[data-ui="content.toolbar.annotation-export-button"]')
                    ),
                  });
                let settledFrames = 0;
                for (let index = 0; index < 180 && settledFrames < 15; index += 1) {
                  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                  for (const animation of element.getAnimations()) {
                    if (
                      animation.id !== 'sniptale-toolbar-mode-transition' ||
                      sampled.has(animation)
                    )
                      continue;
                    sampled.add(animation);
                    animation.pause();
                    const duration = Number(animation.effect!.getTiming().duration);
                    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
                      animation.currentTime = duration * progress;
                      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                      capture();
                    }
                    animation.finish();
                  }
                  capture();
                  if (element.getAttribute('data-page-mode') === target) settledFrames += 1;
                }
                return frames;
              },
              { direction: orientation, target: to }
            );
            await page.locator(`[data-ui="content.toolbar.mode-option.${to}"]`).click();
            const frames = await sampling;
            const afterBounds = (await toolbar.boundingBox())!;
            const after = orientation === 'vertical' ? afterBounds.height : afterBounds.width;
            const low = Math.min(before, after);
            const high = Math.max(before, after);
            if (
              frames.some((frame) => frame.width < low - 1 || frame.width > high + 1 || frame.mixed)
            )
              issues.push(
                `${from} -> ${to}: intermediate controls or size outside ${low}..${high}: ${JSON.stringify(frames)}`
              );
            const direction = Math.sign(after - before);
            if (
              frames.some(
                (frame, index) =>
                  index > 0 && (frame.width - frames[index - 1]!.width) * direction < -1
              )
            )
              issues.push(`${from} -> ${to}: reverses direction during the transition`);
            if (
              high - low > 4 &&
              !frames.some((frame) => frame.width > low + 1 && frame.width < high - 1)
            )
              issues.push(`${from} -> ${to}: no intermediate animation frame`);
          }
          await select(from);
          await toolbar.evaluate(async (element) => {
            await Promise.all(
              element.getAnimations().map((animation) => animation.finished.catch(() => undefined))
            );
          });
          await page.screenshot({ path: info.outputPath(`mode-${from}.png`), fullPage: false });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await select('quick-edit');
        expect(
          await toolbar.evaluate((element) =>
            element
              .getAnimations()
              .some(
                (animation) =>
                  animation.effect instanceof KeyframeEffect &&
                  animation.effect.getKeyframes().some((frame) => 'inlineSize' in frame)
              )
          )
        ).toBe(false);
        if (orientation === 'horizontal') {
          await page.setViewportSize({ width: 960, height: size.height });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
          await page.screenshot({ path: info.outputPath('narrow-960.png'), fullPage: false });
        }
        expect(issues).toEqual([]);
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const appearance of [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
] as const) {
  test(`capture menu digit choices ${appearance.width} ${appearance.locale}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(async ({ locale, theme }) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
    }, appearance);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, appearance);
    const ui = (name: string) => page.locator(`[data-ui="content.toolbar.${name}"]`);
    try {
      await ui('mode-selector-button').click();
      await ui('mode-option.cursor').click();
      for (const orientation of ['horizontal', 'vertical']) {
        await ui('settings-button').click();
        const direction = page.getByRole('button', {
          name:
            orientation === 'horizontal'
              ? /Horizontal view|Горизонтальный вид/u
              : /Vertical view|Вертикальный вид/u,
        });
        if (!(await direction.isVisible()))
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        await direction.click();
        if ((await ui('settings-button').getAttribute('aria-expanded')) === 'true')
          await page.keyboard.press('Escape');
        for (const compact of [false, true]) {
          await ui('settings-button').click();
          const toggle = page
            .locator('.sniptale-toolbar-menu-item')
            .filter({ hasText: /Compact menu view|Компактный вид меню/ });
          if (
            (await toggle.getAttribute('class'))?.includes('sniptale-popover-item-selected') !==
            compact
          )
            await toggle.click();
          await page.keyboard.press('Escape');
          const timer = ui('timer-button');
          for (const [key, delay] of [
            ['2', 3],
            ['3', 5],
            ['4', 10],
            ['1', 0],
          ] as const) {
            await timer.click();
            const menu = ui('timer-menu');
            await expect(menu.locator('.sniptale-toolbar-menu-shortcut')).toHaveText([
              '1',
              '2',
              '3',
              '4',
            ]);
            if (key === '2') {
              await page.screenshot({
                path: info.outputPath(`digits-timer-${orientation}-${compact}.png`),
                fullPage: false,
              });
              await page.keyboard.press('9');
              await expect(menu.locator('.sniptale-popover-menu')).toBeVisible();
              await page.evaluate(() =>
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))
              );
              await expect(menu.locator('.sniptale-popover-menu')).toBeVisible();
              await page.evaluate(() => {
                const host = document.createElement('section');
                host.id = 'digit-editable-proof';
                const input = document.createElement('input');
                host.attachShadow({ mode: 'open' }).append(input);
                document.body.append(host);
                input.focus();
              });
              await page.keyboard.type('2');
              await expect(page.locator('#digit-editable-proof input')).toHaveValue('2');
              await expect(menu.locator('.sniptale-popover-menu')).toBeVisible();
              await timer.focus();
              await page.evaluate(() => document.querySelector('#digit-editable-proof')?.remove());
            }
            await page.keyboard.press(key);
            await expect(menu).toHaveCount(0);
            if (delay)
              await expect(timer.locator('[data-ui="content.toolbar.timer-value"]')).toHaveText(
                String(delay)
              );
            else
              await expect(timer.locator('[data-ui="content.toolbar.timer-value"]')).toHaveCount(0);
            await expect(ui('root')).toHaveAttribute('data-page-mode', 'cursor');
            await expect(timer).toBeFocused();
          }
          await ui('capture-action-button').click();
          const menu = ui('capture-action-menu');
          const rows = menu.locator('.sniptale-toolbar-menu-item');
          const count = await rows.count();
          await expect(menu.locator('.sniptale-toolbar-menu-shortcut')).toHaveText(
            Array.from({ length: count }, (_, index) => String(index + 1))
          );
          const target = rows.nth(count - 1);
          const identity = await target.getAttribute('data-ui');
          const bounds = await menu.locator('.sniptale-popover-menu').boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(-0.5);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(appearance.width + 0.5);
          await target.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: info.outputPath(`digits-action-${orientation}-${compact}.png`),
            fullPage: false,
          });
          await page.keyboard.press(String(count));
          await expect(menu).toHaveCount(0);
          await expect(ui('capture-action-button')).toBeFocused();
          await expect(ui('root')).toHaveAttribute('data-page-mode', 'cursor');
          await ui('capture-action-button').click();
          await expect(page.locator(`[data-ui="${identity}"]`)).toHaveClass(
            /sniptale-popover-item-selected/
          );
          await page.keyboard.press('Escape');
        }
      }
      await page.setViewportSize({ width: 1024, height: 480 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    } finally {
      await page.close();
      await popup.close();
    }
  });
}
