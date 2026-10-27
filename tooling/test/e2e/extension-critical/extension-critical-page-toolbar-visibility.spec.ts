import { expect, test, type Page, type Locator, type TestInfo } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const ui = (page: Page, name: string) => page.locator(`[data-ui="content.toolbar.${name}"]`);
async function customize(page: Page) {
  const originalIcons = await captureIcons(page);
  await ui(page, 'settings-button').click();
  await expect(
    page.getByText(/Reorder buttons, choose visibility|Переставьте кнопки, выберите видимые/u)
  ).toBeVisible();
  await ui(page, 'settings.customize-buttons').click();
  await expect(ui(page, 'customize-done')).toBeVisible();
  await expect(ui(page, 'settings-button')).toBeDisabled();
  await expect(ui(page, 'mode-selector-button')).toBeEnabled();
  const customizingIcons = await captureIcons(page);
  for (const [name, icon] of Object.entries(originalIcons))
    expect(customizingIcons[name]).toBe(icon);
}
async function hide(page: Page, control: string) {
  const button = ui(page, `visibility.${control}`);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.scrollIntoViewIfNeeded();
  const indicator = button.locator('svg').last();
  const before = await indicator.boundingBox();
  await ui(page, 'root').evaluate((root) => {
    const buttons = [
      ...root.querySelectorAll<HTMLButtonElement>('[data-ui^="content.toolbar.visibility."]'),
    ];
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ['disabled'] });
    Reflect.set(root, '__visibilityProof', { buttons, changes, observer });
  });
  await button.hover();
  await page.mouse.down();
  await expect(button).toHaveAttribute('data-pressing', 'true');
  await expect(button.locator(':scope > .sniptale-command-content')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 1)'
  );
  await expect
    .poll(async () => {
      const pressed = (await indicator.boundingBox())!;
      return Math.abs(pressed.x - before!.x) <= 0.5 && Math.abs(pressed.y - before!.y) <= 1.1;
    })
    .toBe(true);
  await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toBeEnabled();
  await expect(button.locator(':scope > .sniptale-command-content')).toHaveCSS('transform', 'none');
  const after = await indicator.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(0.5);
  expect(
    await ui(page, 'root').evaluate((root) => {
      const proof = Reflect.get(root, '__visibilityProof');
      proof.observer.disconnect();
      return {
        disabledChanges: proof.changes.map((record: MutationRecord) =>
          record.target instanceof HTMLElement ? record.target.getAttribute('data-ui') : null
        ),
        unavailable: proof.buttons
          .filter((button: HTMLButtonElement) => !button.isConnected || button.disabled)
          .map((button: HTMLButtonElement) => ({
            id: button.getAttribute('data-ui'),
            connected: button.isConnected,
            disabled: button.disabled,
          })),
      };
    })
  ).toEqual({ disabledChanges: [], unavailable: [] });
}

async function captureIcons(page: Page) {
  const icons: Record<string, string> = {};
  for (const name of [
    'auto-blur-button',
    'capture-visible-button',
    'capture-selection-button',
    'capture-full-button',
    'viewport-button',
    'timer-button',
    'drawing.select',
    'drawing.pencil',
    'drawing.marker',
    'drawing.shape',
    'future-frame-style',
    'future-frame-callout',
    'future-frame-step-badge',
    'page-editing-mode.block-selection',
    'page-editing-mode.direct-text',
    'design-review-panel-button',
  ]) {
    const icon = ui(page, name).locator('svg').first();
    if (await icon.count()) icons[name] = await icon.evaluate((element) => element.outerHTML);
  }
  return icons;
}

async function verifyOverrideReset(page: Page) {
  await customize(page);
  await ui(page, 'visibility.capture-full').click();
  await expect(ui(page, 'visibility.capture-full')).toHaveAttribute('aria-pressed', 'true');
  await hide(page, 'capture-full');
  await ui(page, 'customize-done').click();
  await mode(page, 'drawing');
  await expect(ui(page, 'capture-full-button')).toBeVisible();
  await ui(page, 'settings-button').click();
  await ui(page, 'settings.inherit-buttons').click();
  await expect(ui(page, 'settings.inherit-buttons')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(ui(page, 'capture-full-button')).toHaveCount(0);
  await expect(ui(page, 'drawing.marker')).toHaveCount(0);
  await mode(page, 'highlighter');
  await expect(ui(page, 'future-frame-callout')).toHaveCount(0);
  await mode(page, 'cursor');
}
async function mode(page: Page, name: string) {
  await ui(page, 'mode-selector-button').click();
  await ui(page, `mode-option.${name}`).click();
  await expect(ui(page, `mode-option.${name}`)).toHaveCount(0);
}
async function expectSeparators(page: Page) {
  const dividers = ui(page, 'root').locator('.sniptale-divider');
  for (const divider of await dividers.all()) await expect(divider).toBeVisible();
}

async function enableOptionalToolbarControls(popup: Page) {
  await popup.evaluate(async () => {
    const stored = await chrome.storage.sync.get('sniptale_settings');
    const settings = stored.sniptale_settings ?? {};
    await chrome.storage.sync.set({
      sniptale_settings: {
        ...settings,
        contentToolbar: {
          ...settings.contentToolbar,
          pageControls: {
            ...settings.contentToolbar?.pageControls,
            'after-capture': true,
            'capture-delay': true,
            'capture-size': true,
            'quick-actions': true,
            'scenario-panel': true,
            'auto-blur': true,
          },
        },
      },
    });
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`page toolbar visibility ${name} ${orientation}`, async ({}, info) => {
      test.setTimeout(120000);
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      const { context, extensionId } = launched;
      const hostOrigin = host.origin;
      try {
        const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
        await enableOptionalToolbarControls(popup);
        await popup.evaluate(
          async (theme) =>
            chrome.storage.local.set({
              'sniptale-theme-preference': theme,
              'sniptale-locale-preference': theme === 'dark' ? 'ru' : 'en',
            }),
          size.width === 1920 ? 'dark' : 'light'
        );
        await reopenToolbarAfterReload(page, popup, hostOrigin);
        await page.bringToFront();
        if (orientation === 'vertical') {
          await ui(page, 'settings-button').click();
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
        }
        await mode(page, 'cursor');
        await customize(page);
        await expect(ui(page, 'settings-button')).toBeDisabled();
        await expect(ui(page, 'navigation.pin-to-tab')).toBeDisabled();
        await expect(ui(page, 'navigation.collapse')).toBeDisabled();
        await ui(page, 'customize-done').click();
        await ui(page, 'settings-button').click();
        await expect(ui(page, 'settings.show-hidden-buttons')).toHaveCount(0);
        await expect(ui(page, 'settings.inherit-buttons')).toHaveCount(0);
        expect(
          await ui(page, 'settings.customize-buttons').evaluate((element) =>
            element.previousElementSibling?.classList.contains('sniptale-popover-divider')
          )
        ).toBe(true);
        await expect(ui(page, 'customize-done')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await customize(page);
        await page.setViewportSize({ width: 1000, height: size.height });
        await expect
          .poll(() =>
            ui(page, 'root').evaluate((element) => {
              const box = element.getBoundingClientRect();
              return (
                box.left >= -1 &&
                box.right <= innerWidth + 1 &&
                document.documentElement.scrollWidth <= innerWidth
              );
            })
          )
          .toBe(true);
        await page.setViewportSize(size);
        for (const control of [
          'auto-blur',
          'capture-visible',
          'capture-selection',
          'capture-full',
          'after-capture',
          'capture-delay',
          'capture-size',
        ]) {
          if (await ui(page, `visibility.${control}`).count()) await hide(page, control);
        }
        await mode(page, 'design-review');
        await expect(ui(page, 'customize-done')).toBeVisible();
        for (const control of [
          'review-comment',
          'review-inspect',
          'review-compare',
          'review-move',
          'review-check',
          'review-panel',
          'review-measurements',
          'review-layout-guides',
          'review-export',
        ])
          await hide(page, control);
        await page.screenshot({ path: info.outputPath('customizing-review.png'), fullPage: false });
        await ui(page, 'customize-done').focus();
        await page.keyboard.press('Enter');
        await expect(ui(page, 'settings-button')).toBeFocused();
        await expect(ui(page, 'capture-visible-button')).toHaveCount(0);
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect(ui(page, 'design-review-panel-button')).toHaveCount(0);
        await expect(ui(page, 'reset-all-button')).toBeVisible();
        await expectSeparators(page);
        await mode(page, 'drawing');
        await expect(ui(page, 'drawing.select')).toBeVisible();
        await customize(page);
        await expect(ui(page, 'drawing.select')).toBeDisabled();
        await expect(ui(page, 'drawing.pencil')).toBeDisabled();
        await expect(ui(page, 'visibility.drawing-pencil')).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath('drawing-required-pencil.png'),
          fullPage: false,
        });
        await expect(ui(page, 'visibility.drawing-select')).toHaveCount(0);
        await expect(ui(page, 'visibility.capture-full')).toHaveAttribute('aria-pressed', 'false');
        await ui(page, 'visibility.capture-full').click();
        await expect(ui(page, 'visibility.capture-full')).toHaveAttribute('aria-pressed', 'true');
        await expect(
          ui(page, 'visibility.capture-full').locator(
            '[data-ui="content.toolbar.visibility-override"]'
          )
        ).toBeVisible();
        await hide(page, 'drawing-marker');
        await expect(
          ui(page, 'visibility.drawing-marker').locator(
            '[data-ui="content.toolbar.visibility-override"]'
          )
        ).toHaveCount(0);
        await ui(page, 'customize-done').click();
        await expect(ui(page, 'drawing.marker')).toHaveCount(0);
        await expect(ui(page, 'drawing.pencil')).toBeVisible();
        await expect(ui(page, 'drawing.pencil')).toBeEnabled();
        await ui(page, 'drawing.pencil').click();
        await expect(ui(page, 'drawing.pencil')).toHaveAttribute('aria-pressed', 'true');
        await expect(ui(page, 'drawing.select')).toBeVisible();
        await expect(ui(page, 'capture-full-button')).toBeVisible();
        await mode(page, 'highlighter');
        await customize(page);
        await expect(ui(page, 'future-frame-style')).toBeVisible();
        await expect(ui(page, 'future-frame-style')).toBeDisabled();
        await hide(page, 'annotation-callout');
        await ui(page, 'customize-done').click();
        await expect(ui(page, 'future-frame-callout')).toHaveCount(0);
        await expect(ui(page, 'future-frame-style')).toBeVisible();
        await mode(page, 'quick-edit');
        await customize(page);
        await expect(ui(page, 'page-editing-mode.block-selection')).toBeVisible();
        await expect(ui(page, 'page-editing-mode.block-selection')).toBeDisabled();
        await hide(page, 'editing-direct-text');
        await hide(page, 'editing-marker');
        await hide(page, 'editing-ai-text');
        await ui(page, 'customize-done').click();
        await expect(ui(page, 'page-editing-mode.direct-text')).toHaveCount(0);
        await expect(ui(page, 'text-marker')).toHaveCount(0);
        await expect(ui(page, 'ai-text')).toHaveCount(0);
        await expect(ui(page, 'page-editing-mode.block-selection')).toBeVisible();
        await mode(page, 'cursor');
        await expect(ui(page, 'navigation.pin-to-tab')).toBeVisible();
        await expect(ui(page, 'navigation.collapse')).toBeVisible();
        await verifyOverrideReset(page);
        await expectSeparators(page);
        await ui(page, 'settings-button').click();
        await ui(page, 'settings.show-hidden-buttons').focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        await expect(ui(page, 'timer-button')).toBeVisible();
        await ui(page, 'timer-button').click();
        await page
          .locator('[data-ui="content.toolbar.timer-menu"] .sniptale-toolbar-menu-item')
          .nth(1)
          .click();
        await expect(ui(page, 'timer-value')).toHaveText('3');
        await page.screenshot({
          path: info.outputPath('temporarily-revealed.png'),
          fullPage: false,
        });
        await ui(page, 'navigation.collapse').click();
        await page.locator('[data-ui="content.collapsed-panels.restore-toolbar"]').click();
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect(ui(page, 'customize-done')).toHaveCount(0);
        await customize(page);
        await expect(ui(page, 'visibility.capture-delay')).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Escape');
        await expect(ui(page, 'customize-done')).toHaveCount(0);
        await expect(ui(page, 'settings-button')).toBeFocused();
        await page.screenshot({
          path: info.outputPath('hidden-after-reopen.png'),
          fullPage: false,
        });
        await ui(page, 'settings-button').click();
        await ui(page, 'settings.show-hidden-buttons').click();
        await page.keyboard.press('Escape');
        await expect(ui(page, 'timer-button')).toBeVisible();
        await page.reload();
        await expect
          .poll(() =>
            popup.evaluate(async (origin) => {
              const tabs = await chrome.tabs.query({});
              const target = tabs.find((tab) => tab.url === `${origin}/`);
              if (target?.id === undefined) return false;
              await chrome.runtime.sendMessage({
                type: 'PAGE_ACCESS',
                operation: 'register-granted-site',
                tabId: target.id,
                __sniptaleRuntimeFreshness: {
                  issuedAtEpochMs: Date.now(),
                  nonce: crypto.randomUUID(),
                },
              });
              const response = await chrome.tabs
                .sendMessage(target.id, { type: 'ENABLE_SCREENSHOT_MODE', workingMode: 'cursor' })
                .catch(() => null);
              return response?.success === true;
            }, hostOrigin)
          )
          .toBe(true);
        await expect(ui(page, 'settings-button')).toBeVisible();
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings')).sniptale_settings
                  ?.contentToolbar?.pageControlOverrides?.highlighter?.['annotation-callout']
            )
          )
          .toBe(false);
        await mode(page, 'video-recording');
        await expect(ui(page, 'video-recording.customize')).toBeVisible();
        await expect(ui(page, 'customize-done')).toHaveCount(0);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

async function reopenToolbarAfterReload(page: Page, popup: Page, origin: string) {
  await page.reload();
  await expect
    .poll(() =>
      popup.evaluate(async (origin) => {
        const target = (await chrome.tabs.query({})).find((tab) => tab.url === `${origin}/`);
        if (target?.id === undefined) return false;
        await chrome.runtime.sendMessage({
          type: 'PAGE_ACCESS',
          operation: 'register-granted-site',
          tabId: target.id,
          __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
        });
        return (
          (
            await chrome.tabs
              .sendMessage(target.id, { type: 'ENABLE_SCREENSHOT_MODE', workingMode: 'drawing' })
              .catch(() => null)
          )?.success === true
        );
      }, origin)
    )
    .toBe(true);
  await page.bringToFront();
}

async function verifyNativePageLayoutFocus(page: Page) {
  const root = ui(page, 'root');
  const expected = await root.evaluate((root) =>
    [...root.children]
      .sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order))
      .flatMap((item) =>
        item instanceof HTMLButtonElement
          ? [item]
          : [...item.querySelectorAll<HTMLButtonElement>('button')]
      )
      .filter(
        (button) =>
          !button.disabled &&
          button.tabIndex >= 0 &&
          !button.closest('[inert]') &&
          button.getClientRects().length > 0
      )
      .map((button) => button.getAttribute('data-ui'))
  );
  expect(expected.length).toBeGreaterThan(5);
  await root.locator(`[data-ui="${expected[0]}"]`).focus();
  const actual = [];
  for (let index = 0; index < expected.length; index++) {
    actual.push(
      await root.evaluate((node) => {
        const tree = node.getRootNode();
        const active =
          tree instanceof ShadowRoot ? tree.activeElement : node.ownerDocument.activeElement;
        return active?.getAttribute('data-ui');
      })
    );
    if (index + 1 < expected.length) await page.keyboard.press('Tab');
  }
  expect(actual).toEqual(expected);
}

async function savedDrawingOrder(popup: Page): Promise<string[]> {
  return popup.evaluate(async () => {
    const value: unknown = (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
      ?.contentToolbar?.pageLayouts?.drawing;
    if (!Array.isArray(value)) throw new Error('Saved drawing layout missing');
    return value.map((item: unknown) => {
      if (typeof item !== 'string') throw new Error('Invalid saved layout identity');
      return item;
    });
  });
}
async function startDividerPointer(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded();
  const rect = (await source.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await expect(ui(page, 'root')).toHaveAttribute('data-page-reordering', 'true');
}
async function pointDividerAt(page: Page, target: Locator, before: boolean) {
  const toolbar = ui(page, 'root');
  const vertical = (await toolbar.getAttribute('data-display-mode')) === 'vertical';
  await toolbar.evaluate(async (node) => {
    await Promise.allSettled(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  const revealTarget = async () => {
    if (vertical) {
      const root = (await toolbar.boundingBox())!;
      const rect = (await target.boundingBox())!;
      const delta =
        rect.y < root.y
          ? rect.y - root.y - 8
          : rect.y + rect.height > root.y + root.height
            ? rect.y + rect.height - root.y - root.height + 8
            : 0;
      if (delta) {
        await page.mouse.move(root.x + root.width / 2, root.y + root.height / 2);
        await toolbar.evaluate(async (node) => {
          await Promise.allSettled(
            node.getAnimations({ subtree: true }).map((animation) => animation.finished)
          );
        });
        const current = (await target.boundingBox())!;
        const scrollDelta =
          current.y < root.y
            ? current.y - root.y - 8
            : current.y + current.height > root.y + root.height
              ? current.y + current.height - root.y - root.height + 8
              : 0;
        await page.mouse.wheel(0, scrollDelta);
        await expect
          .poll(async () => {
            const box = (await target.boundingBox())!;
            return box.y >= root.y && box.y + box.height <= root.y + root.height;
          })
          .toBe(true);
      }
    }
  };
  await revealTarget();
  const rect = (await target.boundingBox())!;
  await page.mouse.move(
    rect.x + rect.width * (vertical ? 0.5 : before ? 0.25 : 0.75),
    rect.y + rect.height * (vertical ? (before ? 0.25 : 0.75) : 0.5),
    { steps: 8 }
  );
  await toolbar.evaluate(async (node) => {
    await Promise.allSettled(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  await revealTarget();
  const settled = (await target.boundingBox())!;
  await page.mouse.move(
    settled.x + settled.width * (vertical ? 0.5 : before ? 0.25 : 0.75),
    settled.y + settled.height * (vertical ? (before ? 0.25 : 0.75) : 0.5),
    { steps: 1 }
  );
}
async function verifyDividerDragEditing(page: Page, popup: Page, info: TestInfo) {
  const toolbar = ui(page, 'root');
  const source = ui(page, 'customize-add-divider');
  const dividerIds = () =>
    toolbar
      .locator('[data-page-toolbar-divider]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-page-toolbar-item')));
  const item = (id: string) => toolbar.locator(`[data-page-toolbar-item="${id}"] > button`);
  await expect(source).not.toHaveAttribute('aria-disabled', 'true');
  const original = await dividerIds();
  await source.click();
  await expect(toolbar.locator('[data-page-toolbar-divider]')).toHaveCount(original.length);
  const copies: string[] = [];
  for (const target of ['drawing-marker', 'drawing-arrow']) {
    const before = await dividerIds();
    const saved = await savedDrawingOrder(popup);
    await startDividerPointer(page, source);
    await pointDividerAt(page, ui(page, `visibility.${target}`), false);
    await expect(toolbar.locator('[data-page-toolbar-divider]')).toHaveCount(before.length + 1);
    expect(await savedDrawingOrder(popup)).toEqual(saved);
    const id = (await dividerIds()).find((id) => id && !before.includes(id));
    if (!id) throw new Error('Provisional divider missing');
    copies.push(id);
    await expect(toolbar).toHaveAttribute('data-page-drop-invalid', 'false');
    await page.screenshot({ path: info.outputPath(`divider-copy-${target}.png`), fullPage: false });
    await page.mouse.up();
    await expect.poll(() => savedDrawingOrder(popup)).toContain(id);
    await expect(source).not.toHaveAttribute('aria-disabled', 'true');
    await expect(toolbar.locator('[data-page-toolbar-divider]')).toHaveCount(before.length + 1);
  }
  const first = copies[0]!;
  const second = copies[1]!;
  const accepted = await savedDrawingOrder(popup);
  await startDividerPointer(page, item(first));
  await pointDividerAt(page, item(second), false);
  const invalid = toolbar.locator('[data-page-toolbar-invalid="true"]');
  await expect(invalid).toHaveCount(1);
  await expect(invalid).toHaveCSS('outline-style', 'dashed');
  await expect(item(first)).toHaveCSS('cursor', 'not-allowed');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Cannot place this divider|Здесь нельзя разместить разделитель/u })
  ).toHaveCount(1);
  expect(await savedDrawingOrder(popup)).toEqual(accepted);
  await page.screenshot({ path: info.outputPath('divider-invalid-position.png'), fullPage: false });
  await page.mouse.up();
  await expect(invalid).toHaveCount(0);
  expect(await savedDrawingOrder(popup)).toEqual(accepted);
  await expect(item(first)).toHaveCount(1);
  await startDividerPointer(page, item(first));
  await pointDividerAt(page, item(second), false);
  await expect(invalid).toHaveCount(1);
  await pointDividerAt(page, ui(page, 'visibility.capture-selection'), true);
  await expect(invalid).toHaveCount(0);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const order = await savedDrawingOrder(popup);
      return (
        order.indexOf(first) > order.indexOf(second) &&
        order.indexOf(first) + 1 === order.indexOf('capture-selection')
      );
    })
    .toBe(true);
  await expect(source).not.toHaveAttribute('aria-disabled', 'true');
  const restored = await savedDrawingOrder(popup);
  await startDividerPointer(page, source);
  await pointDividerAt(page, item('drawing-pencil'), false);
  await expect(toolbar.locator('[data-page-toolbar-divider]')).toHaveCount(original.length + 3);
  await page.mouse.move(1, page.viewportSize()!.height - 1);
  await page.mouse.up();
  await expect(toolbar.locator('[data-page-toolbar-divider]')).toHaveCount(original.length + 2);
  expect(await savedDrawingOrder(popup)).toEqual(restored);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`page toolbar order dividers and unified reset ${name} ${orientation}`, async ({}, info) => {
      test.setTimeout(120000);
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      try {
        const { page, popup } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        page.setDefaultTimeout(10000);
        await enableOptionalToolbarControls(popup);
        await popup.evaluate(
          async (dark) =>
            chrome.storage.local.set({
              'sniptale-theme-preference': dark ? 'dark' : 'light',
              'sniptale-locale-preference': dark ? 'ru' : 'en',
            }),
          size.width === 1920
        );
        if (orientation === 'vertical') {
          await ui(page, 'settings-button').click();
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
        }
        await mode(page, 'drawing');
        await customize(page);
        const root = ui(page, 'root');
        const item = (id: string) => root.locator(`[data-page-toolbar-item="${id}"]`);
        const source = ui(page, 'visibility.capture-visible');
        const target = ui(page, 'visibility.drawing-marker');
        await source.scrollIntoViewIfNeeded();
        const a = (await source.boundingBox())!;
        const b = (await target.boundingBox())!;
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 4, b.y + b.height / 4, { steps: 10 });
        await expect(source).toHaveCSS('cursor', 'grabbing');
        await expect(root.locator('[data-page-toolbar-drop]')).toHaveCount(0);
        await expect
          .poll(
            async () =>
              Number(
                await item('capture-visible').evaluate((node) => getComputedStyle(node).order)
              ) -
              Number(await item('drawing-marker').evaluate((node) => getComputedStyle(node).order))
          )
          .toBe(-1);
        await root.evaluate(async (node) => {
          await Promise.allSettled(
            node.getAnimations({ subtree: true }).map((animation) => animation.finished)
          );
        });
        const grip = (await source.locator('svg').first().boundingBox())!;
        const slot = (await source.boundingBox())!;
        expect(grip.x - slot.x).toBeLessThanOrEqual(3);
        expect(grip.y - slot.y).toBeLessThanOrEqual(3);
        await page.screenshot({
          path: info.outputPath('page-toolbar-drop-target.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await expect
          .poll(
            async () =>
              Number(
                await item('capture-visible').evaluate((node) => getComputedStyle(node).order)
              ) -
              Number(await item('drawing-marker').evaluate((node) => getComputedStyle(node).order))
          )
          .toBe(-1);
        await expect(source).toHaveAttribute('aria-pressed', 'true');
        await source.focus();
        await source.press(orientation === 'vertical' ? 'Alt+ArrowDown' : 'Alt+ArrowRight');
        await expect
          .poll(
            async () =>
              Number(
                await item('capture-visible').evaluate((node) => getComputedStyle(node).order)
              ) -
              Number(await item('drawing-marker').evaluate((node) => getComputedStyle(node).order))
          )
          .toBe(1);
        await expect(source).toBeFocused();
        const fixed = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
        await expect(fixed).not.toHaveAttribute('data-page-toolbar-item', /.+/);
        expect(await fixed.evaluate((node) => Number(getComputedStyle(node).order))).toBeLessThan(
          0
        );
        await ui(page, 'visibility.capture-full').click();
        await expect(ui(page, 'visibility.capture-full')).toHaveAttribute('aria-pressed', 'false');
        await verifyDividerDragEditing(page, popup, info);
        const before = await root
          .locator('[data-page-toolbar-divider]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-page-toolbar-item')));
        await ui(page, 'customize-add-divider').focus();
        await page.keyboard.press('Enter');
        await expect(root.locator('[data-page-toolbar-divider]')).toHaveCount(before.length + 1);
        const ids = await root
          .locator('[data-page-toolbar-divider]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-page-toolbar-item')));
        const added = ids.find((id) => id && !before.includes(id))!;
        const divider = item(added).locator(':scope > button');
        const oldOrder = Number(await item(added).evaluate((node) => getComputedStyle(node).order));
        await divider.focus();
        await divider.press(orientation === 'vertical' ? 'Alt+ArrowDown' : 'Alt+ArrowRight');
        await expect
          .poll(async () =>
            Number(await item(added).evaluate((node) => getComputedStyle(node).order))
          )
          .toBeGreaterThan(oldOrder);
        await item('separator:capture').locator(':scope > button').click();
        await expect(item('separator:capture')).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath('page-toolbar-customized.png'),
          fullPage: false,
        });
        await ui(page, 'customize-done').click();
        await expect(ui(page, 'capture-full-button')).toHaveCount(0);
        await verifyNativePageLayoutFocus(page);
        await page.screenshot({
          path: info.outputPath('page-toolbar-saved-layout.png'),
          fullPage: false,
        });
        await mode(page, 'cursor');
        await customize(page);
        await ui(page, 'visibility.capture-delay').click();
        await expect(ui(page, 'visibility.capture-delay')).toHaveAttribute('aria-pressed', 'false');
        await ui(page, 'customize-done').click();
        await mode(page, 'drawing');
        await reopenToolbarAfterReload(page, popup, host.origin);
        await expect(root).toHaveAttribute('data-page-layout', 'true');
        await expect(ui(page, 'capture-full-button')).toHaveCount(0);
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect(item(added)).toBeVisible();
        await expect(item('separator:capture')).toHaveCount(0);
        await ui(page, 'settings-button').click();
        await expect(ui(page, 'settings.reset-page-toolbar')).toBeEnabled();
        await ui(page, 'settings.reset-page-toolbar').click();
        await expect(ui(page, 'settings.reset-page-toolbar')).toBeDisabled();
        await expect(root).not.toHaveAttribute('data-page-layout', 'true');
        await page.keyboard.press('Escape');
        await expect(ui(page, 'capture-full-button')).toBeVisible();
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect(root.locator('[data-page-toolbar-item]')).toHaveCount(0);
        await expect(ui(page, 'capture-leading-divider')).toBeVisible();
        await mode(page, 'cursor');
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await page.setViewportSize({ width: 1000, height: size.height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({ path: info.outputPath('page-toolbar-reset.png'), fullPage: false });
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page toolbar optional defaults reset and recording transition ${name}`, async ({}, info) => {
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: size });
    try {
      const { page, popup } = await openDesignReview(
        launched.context,
        launched.extensionId,
        host.origin,
        size
      );
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await mode(page, 'cursor');
      const optional = {
        'after-capture': '[data-ui="content.toolbar.capture-action-button"]',
        'capture-delay': '[data-ui="content.toolbar.timer-button"]',
        'capture-size': '[data-ui="content.toolbar.viewport-button"]',
        'quick-actions': '[data-ui="content.quick-actions.trigger"]',
        'scenario-panel': '[data-ui="content.toolbar.scenario-panel-button"]',
        'auto-blur': '[data-ui="content.toolbar.auto-blur-button"]',
      };
      for (const selector of Object.values(optional))
        await expect(page.locator(selector)).toHaveCount(0);
      const separators = ui(page, 'root').locator('.sniptale-divider');
      const count = await separators.count();
      expect(count).toBeGreaterThanOrEqual(4);
      await expectSeparators(page);
      await page.screenshot({
        path: info.outputPath('fresh-toolbar-defaults.png'),
        fullPage: false,
      });
      await customize(page);
      for (const control of Object.keys(optional)) {
        const choice = ui(page, `visibility.${control}`);
        await expect(choice).toHaveAttribute('aria-pressed', 'false');
        await choice.click();
        await expect(choice).toHaveAttribute('aria-pressed', 'true');
      }
      await ui(page, 'customize-done').click();
      for (const selector of Object.values(optional))
        await expect(page.locator(selector)).toBeVisible();
      await page.locator(optional['quick-actions']).click();
      await expect(
        page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu')
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await page.screenshot({
        path: info.outputPath('optional-buttons-enabled.png'),
        fullPage: false,
      });
      await ui(page, 'settings-button').click();
      await ui(page, 'settings.reset-page-toolbar').click();
      await expect(ui(page, 'settings.reset-page-toolbar')).toBeDisabled();
      await page.keyboard.press('Escape');
      for (const selector of Object.values(optional))
        await expect(page.locator(selector)).toHaveCount(0);
      await expect(separators).toHaveCount(count);
      await expectSeparators(page);
      await page.screenshot({
        path: info.outputPath('reset-toolbar-defaults.png'),
        fullPage: false,
      });
      await customize(page);
      await mode(page, 'video-recording');
      await expect(ui(page, 'root')).toHaveAttribute('data-video-recording', 'true');
      await expect(ui(page, 'video-recording.quality.menu')).toBeVisible();
      expect(errors).toEqual([]);
      await page.screenshot({
        path: info.outputPath('recording-from-page-customization.png'),
        fullPage: false,
      });
      await popup.close();
      await page.close();
    } finally {
      await closeExtensionBrowser(launched);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
