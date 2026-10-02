import type { Locator, Page } from '@playwright/test';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { expect, test } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function pixels(canvas: Locator): Promise<string> {
  return canvas.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Drawing canvas unavailable');
    return element.toDataURL();
  });
}

async function stroke(page: Page, canvas: Locator, y: number, long: boolean) {
  await page.mouse.move(100, y);
  await page.mouse.down();
  for (let index = 1; index <= (long ? 90 : 12); index++) {
    await page.mouse.move(100 + index * (long ? 10 : 15), y + Math.sin(index / 3) * 35);
  }
  const live = await pixels(canvas);
  await page.mouse.up();
  expect(await pixels(canvas)).toBe(live);
  await page.mouse.move(1100, 600);
  expect(await pixels(canvas)).toBe(live);
  return live;
}

for (const locale of ['en', 'ru'] as const) {
  for (const mode of ['drawing', 'video-recording'] as const) {
    test(`${mode} ${locale} follows image-editor strokes and Shift-only arrows at HD`, async ({
      context,
      extensionId,
      hostOrigin,
    }, testInfo) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
      const previousLocale = await popup.evaluate(async () => {
        const value = (await chrome.storage.local.get('sniptale-locale-preference'))[
          'sniptale-locale-preference'
        ];
        return typeof value === 'string' ? value : null;
      });
      await popup.evaluate(
        async (locale) => chrome.storage.local.set({ 'sniptale-locale-preference': locale }),
        locale
      );
      await page.bringToFront();
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      if (mode === 'video-recording') {
        const browser = context.browser();
        if (!browser) throw new Error('Native extension browser unavailable');
        const cdp = await browser.newBrowserCDPSession();
        try {
          const targets = await cdp.send('Target.getTargets', {
            filter: [{ type: 'tab', exclude: false }, { exclude: true }],
          });
          const tab = targets.targetInfos.find((candidate) => candidate.url === page.url());
          if (!tab) throw new Error('Native drawing tab unavailable');
          await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
        } finally {
          await cdp.detach();
        }
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible(
          { timeout: 30_000 }
        );
      }
      const canvas = page.locator(
        '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
      );
      for (const [tool, y] of [
        ['pencil', 320],
        ['marker', 440],
      ] as const) {
        await page.locator(`[data-ui="content.toolbar.drawing.${tool}"]`).click();
        await expect(canvas).toHaveCSS('pointer-events', 'auto');
        await stroke(page, canvas, y, false);
        const committed = await stroke(page, canvas, y + 70, true);
        await page.mouse.move(100, 600);
        await page.mouse.down();
        await page.mouse.move(300, 650);
        await canvas.evaluate((element) =>
          element.dispatchEvent(
            new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
          )
        );
        await page.mouse.up();
        expect(await pixels(canvas)).toBe(committed);
        await stroke(page, canvas, y + 100, false);
      }
      const arrow = page.locator('[data-ui="content.toolbar.drawing.arrow"]');
      await expect(arrow).toHaveAccessibleDescription(
        locale === 'ru' ? 'Свободный угол; Shift — шаг 15°' : 'Free angle; Shift — 15° steps'
      );
      await arrow.click();
      await page.mouse.move(100, 250);
      await page.mouse.down();
      await page.mouse.move(400, 264);
      const free = await pixels(canvas);
      await page.keyboard.down('Shift');
      await page.mouse.move(401, 264);
      const snapped = await pixels(canvas);
      expect(snapped).not.toBe(free);
      await page.keyboard.up('Shift');
      await page.mouse.move(400, 264);
      expect(await pixels(canvas)).toBe(free);
      await page.mouse.up();
      expect(await pixels(canvas)).toBe(free);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-drawing-HD.png`) });
      if (mode === 'video-recording') {
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toHaveCount(
          0,
          { timeout: 30_000 }
        );
        await expect
          .poll(
            () =>
              popup.evaluate(
                async () =>
                  (
                    await chrome.runtime.sendMessage({
                      type: 'GET_RECORDING_STATE',
                      __sniptaleRuntimeFreshness: {
                        issuedAtEpochMs: Date.now(),
                        nonce: crypto.randomUUID(),
                      },
                    })
                  ).state.status
              ),
            { timeout: 30_000 }
          )
          .toBe(VideoRecordingStatus.IDLE);
        const recordingId = await popup.evaluate(async () => {
          const response = await chrome.runtime.sendMessage({
            type: 'GET_RECORDING_STATE',
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          });
          if (typeof response.postRecordResult?.recordingId !== 'string')
            throw new Error('Saved recording identity unavailable');
          return response.postRecordResult.recordingId;
        });
        expect(
          await popup.evaluate(
            async (recordingId) =>
              chrome.runtime.sendMessage({
                type: 'ACKNOWLEDGE_POST_RECORD_RESULT',
                recordingId,
                __sniptaleRuntimeFreshness: {
                  issuedAtEpochMs: Date.now(),
                  nonce: crypto.randomUUID(),
                },
              }),
            recordingId
          )
        ).toMatchObject({ success: true, result: 'acknowledged' });
      }
      await popup.evaluate(async (previous) => {
        if (previous === null) await chrome.storage.local.remove('sniptale-locale-preference');
        else await chrome.storage.local.set({ 'sniptale-locale-preference': previous });
      }, previousLocale);
      await popup.close();
      await page.close();
    });
  }
}

async function verifyFillControls(page: Page, editor: boolean) {
  for (const [tool, suffix, groupSuffix] of [
    ['shape', 'shape.fill-toggle', 'shape.fill'],
    ['text', 'text.background-none', 'text.background-group'],
  ]) {
    const trigger = editor
      ? `editor.floating.tool-rail.${tool}`
      : `content.toolbar.drawing.${tool}`;
    await page.locator(`[data-ui="${trigger}"]`).click();
    const toggle = page.locator(`[data-ui="content.toolbar.drawing-options.${suffix}"]`);
    const group = page.locator(`[data-ui="content.toolbar.drawing-options.${groupSuffix}"]`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await toggle.evaluate(async (node) => {
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        await Promise.allSettled(parent.getAnimations().map((animation) => animation.finished));
      }
    });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    const offColor = await toggle.evaluate((node) => getComputedStyle(node).color);
    const offSize = await toggle.boundingBox();
    await toggle.hover();
    await expect(toggle).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await toggle.evaluate((node) => {
      const options = node.closest(
        '[data-ui="editor.drawing.options"], .sniptale-drawing-options-menu'
      );
      const controls = Array.from(
        options!.querySelectorAll<HTMLElement>('button, input, select, [tabindex]')
      ).filter(
        (control) =>
          control.tabIndex >= 0 &&
          !control.matches(':disabled') &&
          control.getClientRects().length > 0
      );
      const previous = controls[controls.findIndex((control) => control === node) - 1];
      if (!previous) throw new Error('Fill toggle requires a preceding keyboard control');
      previous.focus();
    });
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await expect.poll(() => toggle.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    await expect(toggle).toHaveCSS('outline-style', 'solid');
    await toggle.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(toggle).not.toHaveCSS('color', offColor);
    const activeSize = await toggle.boundingBox();
    expect(activeSize!.width).toBe(offSize!.width);
    expect(activeSize!.height).toBe(offSize!.height);
    const color = group.locator('button[title="#60a5fa"]');
    await color.click();
    await expect(color).toHaveAttribute('aria-pressed', 'true');
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.press('Space');
    await expect(color).toHaveAttribute('aria-pressed', 'true');
    await toggle.hover();
    await expect(toggle).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(toggle).toBeInViewport();
  }
}

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`shared fill switch keeps state and geometry (${variant.locale}, ${variant.theme})`, async ({
    context,
    extensionId,
    hostOrigin,
  }) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
    await popup.evaluate(
      async ({ locale, theme }) =>
        chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        }),
      variant
    );
    await page.bringToFront();
    for (const mode of ['drawing', 'video-recording']) {
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      await verifyFillControls(page, false);
    }
    const editor = await context.newPage();
    await applyHarnessBootstrap(editor, {
      storage: {
        'sniptale-locale-preference': variant.locale,
        'sniptale-theme-preference': variant.theme,
      },
    });
    await editor.addInitScript(
      (locale) => localStorage.setItem('sniptale-locale-preference', locale),
      variant.locale
    );
    await editor.setViewportSize({ width: 1280, height: 720 });
    await editor.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await expect(editor.locator('html')).toHaveAttribute('data-theme', variant.theme);
    await verifyFillControls(editor, true);
    await editor.close();
    await popup.close();
    await page.close();
  });
}

async function verifyDrawingParameterOrder(page: Page, editor: boolean) {
  for (const [tool, lastParameter] of [
    ['pencil', '[data-ui*=".pencil.width-"]'],
    ['marker', '[data-ui*=".marker.opacity-"]'],
    ['shape', '[data-ui*=".shape.width-"]'],
    ['arrow', '[data-ui$=".arrow.from-tip"]'],
    ['text', '[data-ui*=".text.size-"]'],
  ] as const) {
    const trigger = page.locator(
      `[data-ui="${editor ? 'editor.floating.tool-rail' : 'content.toolbar.drawing'}.${tool}"]`
    );
    if (editor || (await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    const panel = page.locator(
      editor
        ? '[data-ui="editor.drawing.options"]'
        : `[data-ui="content.toolbar.drawing-options.${tool}"]`
    );
    await expect(panel).toBeVisible();
    const ordered = await panel.evaluate((root, selector) => {
      const parameters = root.querySelectorAll(selector);
      const last = parameters[parameters.length - 1];
      const color = root.querySelector('[data-ui="shared.ui.color-selector"]');
      return (
        !!last &&
        !!color &&
        !!(last.compareDocumentPosition(color) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    }, lastParameter);
    expect(ordered, `${tool} parameters precede color`).toBe(true);
  }
  await page
    .locator(`[data-ui="${editor ? 'editor.floating.tool-rail' : 'content.toolbar.drawing'}.blur"]`)
    .click();
  const blur = page.locator(
    editor
      ? '[data-ui="editor.drawing.options"]'
      : '[data-ui="content.toolbar.drawing-options.blur"]'
  );
  await expect(blur.locator('[data-ui="shared.ui.color-selector"]')).toHaveCount(0);
}

test('image drawing parameters precede color', async ({ page, hostOrigin }) => {
  await applyHarnessBootstrap(page, {});
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await verifyDrawingParameterOrder(page, true);
});

for (const mode of ['drawing', 'video-recording'] as const) {
  test(`${mode} selected layer actions follow toolbar orientation`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
    await verifyDrawingParameterOrder(page, false);
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    await page.getByRole('button', { name: /Vertical view|Вертикальный вид/ }).click();
    await page.locator('[data-ui="content.toolbar.drawing.shape"]').click();
    await page.mouse.move(450, 280);
    await page.mouse.down();
    await page.mouse.move(620, 400, { steps: 8 });
    await page.mouse.up();
    await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
    await page.mouse.click(500, 300);
    const actions = page.locator('[data-ui="drawing.selection.actions"]');
    await expect(actions).toBeVisible();
    const first = actions.locator('[data-ui="drawing.selection.actions.front"]');
    const second = actions.locator('[data-ui="drawing.selection.actions.forward"]');
    const a = (await first.boundingBox())!;
    const b = (await second.boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThan(a.y + a.height);
    const bounds = (await actions.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1280);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
    await page.screenshot({ path: info.outputPath('vertical-layer-actions.png') });
    const duplicate = actions.locator('[data-ui="drawing.selection.actions.duplicate"]');
    await duplicate.focus();
    await page.keyboard.press('Enter');
    await expect(first).toBeEnabled();
    await first.click();
    const handle = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
    const handleBox = (await handle.boundingBox())!;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(1240, 25, { steps: 8 });
    await page.mouse.up();
    await expect(actions).toBeVisible();
    const edge = (await actions.boundingBox())!;
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.x + edge.width).toBeLessThanOrEqual(1280);
    expect(edge.y + edge.height).toBeLessThanOrEqual(720);
    await page.screenshot({ path: info.outputPath('vertical-layer-actions-edge.png') });
    await page.setViewportSize({ width: 1280, height: 1080 });
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    await page.getByRole('button', { name: /Horizontal view|Горизонтальный вид/ }).click();
    await expect(actions).toBeVisible();
    const horizontalFirst = (await first.boundingBox())!;
    const horizontalSecond = (await second.boundingBox())!;
    expect(Math.abs(horizontalFirst.y - horizontalSecond.y)).toBeLessThanOrEqual(1);
    expect(horizontalSecond.x).toBeGreaterThan(horizontalFirst.x + horizontalFirst.width);
    await popup.close();
    await page.close();
  });
}
