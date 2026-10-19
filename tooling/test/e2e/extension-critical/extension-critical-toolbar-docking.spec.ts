import { expect, test } from '../support/extension-fixture';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`toolbar menu indicators follow every dock and mode ${viewport.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
    const toolbar = page.locator('[data-ui="content.toolbar.root"]');
    try {
      for (const mode of [
        'cursor',
        'highlighter',
        'design-review',
        'quick-edit',
        'drawing',
        'video-recording',
      ]) {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
        if (mode === 'video-recording')
          await expect(toolbar).toHaveAttribute('data-video-recording', 'true');
        for (const [edge, horizontal, vertical, expectedX, expectedY] of [
          ['left', 20, viewport.height / 2, 1, 0],
          ['right', viewport.width - 20, viewport.height / 2, -1, 0],
          ['bottom', viewport.width / 2, viewport.height - 20, 0, -1],
          ['top', viewport.width / 2, 20, 0, 1],
        ] as const) {
          await test.step(`${mode} ${edge}`, async () => {
            const handle = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
            await handle.hover();
            const grip = (await handle.boundingBox())!;
            await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
            await page.mouse.down();
            await page.mouse.move(horizontal, vertical, { steps: 5 });
            await page.mouse.up();
            await expect(toolbar).toHaveAttribute(
              'data-display-mode',
              expectedX ? 'vertical' : 'horizontal'
            );
            await expect
              .poll(() =>
                popup.evaluate(async () => {
                  const stored = await chrome.storage.sync.get('sniptale_settings');
                  return stored['sniptale_settings']?.contentToolbar?.dockEdge;
                })
              )
              .toBe(edge);
            const indicators = toolbar.locator(
              '[data-menu-indicator="true"], .sniptale-full-page-chevron'
            );
            expect(await indicators.count()).toBeGreaterThan(0);
            for (const indicator of await indicators.all()) {
              const geometry = await indicator.evaluate((button) => {
                const small = button.matches('[data-menu-indicator="true"]');
                const style = getComputedStyle(
                  small ? button : button.querySelector('svg')!,
                  small ? '::before' : null
                );
                const matrix = new DOMMatrixReadOnly(
                  style.transform === 'none' ? undefined : style.transform
                );
                const pointsRight =
                  small &&
                  style.borderLeftColor !== 'rgba(0, 0, 0, 0)' &&
                  parseFloat(style.borderLeftWidth) > 0;
                const direction = matrix.transformPoint(
                  new DOMPoint(pointsRight ? 1 : 0, pointsRight ? 0 : 1)
                );
                return {
                  x: direction.x,
                  y: direction.y,
                  left: style.left,
                  right: style.right,
                  top: style.top,
                  bottom: style.bottom,
                  small,
                };
              });
              expect(
                geometry.x,
                `${mode} ${edge} ${await indicator.getAttribute('data-ui')}`
              ).toBeCloseTo(expectedX, 2);
              expect(geometry.y).toBeCloseTo(expectedY, 2);
              if (geometry.small) {
                expect(expectedX === -1 ? geometry.left : geometry.right).toBe('2px');
                expect(expectedY === -1 ? geometry.top : geometry.bottom).toBe('2px');
              }
            }
            await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
            await expect(
              page.locator('[data-ui="content.toolbar.mode-option.cursor"]')
            ).toBeVisible();
            const menu = (await toolbar
              .locator('.sniptale-popover-menu:visible')
              .filter({
                has: page.locator('[data-ui="content.toolbar.mode-option.cursor"]'),
              })
              .boundingBox())!;
            const anchor = (await page
              .locator('[data-ui="content.toolbar.mode-selector-button"]')
              .boundingBox())!;
            expect(
              expectedX === 1
                ? menu.x - anchor.x - anchor.width
                : expectedX === -1
                  ? anchor.x - menu.x - menu.width
                  : expectedY === 1
                    ? menu.y - anchor.y - anchor.height
                    : anchor.y - menu.y - menu.height
            ).toBeGreaterThan(0);
            await page.screenshot({
              path: info.outputPath(`${mode}-${edge}.png`),
              fullPage: false,
            });
            await page.keyboard.press('Escape');
          });
        }
      }
    } catch (error) {
      await page.screenshot({
        path: info.outputPath('failure-before-cleanup.png'),
        fullPage: false,
      });
      throw error;
    } finally {
      await page.close();
      await popup.close();
    }
  });
}

for (const width of [1280, 1920]) {
  for (const theme of ['light', 'dark']) {
    test(`toolbar corner docking and compact transfer ${width} ${theme}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(120_000);
      const height = width === 1280 ? 560 : 900;
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
        width,
        height,
      });
      try {
        await popup.evaluate(async (nextTheme) => {
          await chrome.storage.local.set({ 'sniptale-theme-preference': nextTheme });
        }, theme);
        await page.evaluate(() => {
          document.documentElement.style.overflowY = 'scroll';
          document.documentElement.style.scrollbarGutter = 'stable';
          document.body.style.minHeight = '2400px';
        });
        const toolbar = page.locator('[data-ui="content.toolbar.root"]');
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
        const pencil = page.locator('[data-ui="content.toolbar.drawing.pencil"]');
        await pencil.click();
        await expect(pencil).toHaveAttribute('data-active', 'true');
        const limits = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        }));
        const points = [
          ['top-left', 60, 20, 'horizontal'],
          ['left-top', 20, 60, 'vertical'],
          ['top-right', limits.width - 60, 20, 'horizontal'],
          ['right-top', limits.width - 20, 60, 'vertical'],
          ['bottom-left', 60, limits.height - 20, 'horizontal'],
          ['left-bottom', 20, limits.height - 60, 'vertical'],
          ['bottom-right', limits.width - 60, limits.height - 20, 'horizontal'],
          ['right-bottom', limits.width - 20, limits.height - 60, 'vertical'],
          ['top', limits.width / 2, 20, 'horizontal'],
          ['left', 20, limits.height / 2, 'vertical'],
          ['bottom', limits.width / 2, limits.height - 20, 'horizontal'],
          ['right', limits.width - 20, limits.height / 2, 'vertical'],
          ['right-bottom', limits.width - 20, limits.height - 60, 'vertical'],
        ] as const;
        for (const [edge, x, y, orientation] of points) {
          const handle = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
          const grip = await handle.boundingBox();
          if (!grip) throw new Error('Toolbar grip is not visible');
          await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
          await page.mouse.down();
          const guides = page.locator('[data-ui="content.toolbar.dock-guides"]');
          await expect(guides.locator('[data-active]')).toHaveCount(8);
          await expect(toolbar).toHaveAttribute('data-dock-dragging', 'true');
          await expect
            .poll(async () => (await toolbar.boundingBox())?.width)
            .toBeLessThanOrEqual(48);
          await page.mouse.move(x, y, { steps: 5 });
          await expect(guides.locator('[data-active="true"]')).toHaveCount(1);
          const movingGrip = await handle.boundingBox();
          if (!movingGrip) throw new Error('Moving grip is not visible');
          expect(Math.abs(movingGrip.x + movingGrip.width / 2 - x)).toBeLessThanOrEqual(28);
          expect(Math.abs(movingGrip.y + movingGrip.height / 2 - y)).toBeLessThanOrEqual(28);
          if (edge === 'top-right')
            await page.screenshot({
              path: info.outputPath('compact-transfer.png'),
              fullPage: false,
            });
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
          await expect(toolbar).toHaveAttribute('data-display-mode', orientation);
          await expect(toolbar).toHaveAttribute(
            'data-menu-side',
            orientation === 'vertical'
              ? edge.startsWith('right')
                ? 'left'
                : 'right'
              : edge.startsWith('bottom')
                ? 'up'
                : 'down'
          );
          await expect(pencil).toHaveAttribute('data-active', 'true');
          await expect(pencil).toBeVisible();
          await expect
            .poll(() =>
              page
                .locator('.sniptale-toolbar-positioner')
                .evaluate((node) => node.matches(':focus'))
            )
            .toBe(false);
          await expect
            .poll(async () => {
              const box = await toolbar.boundingBox();
              return box
                ? Math.max(
                    0,
                    -box.x,
                    -box.y,
                    box.x + box.width - limits.width + 19,
                    box.y + box.height - limits.height
                  )
                : 100;
            })
            .toBeLessThanOrEqual(1);
          await expect
            .poll(() =>
              popup.evaluate(async () => {
                const value = await chrome.storage.sync.get('sniptale_settings');
                return value['sniptale_settings']?.contentToolbar?.dockEdge;
              })
            )
            .toBe(edge);
          if (edge.includes('-')) {
            const left = edge.includes('left');
            const top = edge.includes('top');
            await expect
              .poll(async () => {
                const box = (await toolbar.boundingBox())!;
                return Math.abs(
                  (left ? box.x : limits.width - box.x - box.width) - (left ? 8 : 20)
                );
              })
              .toBeLessThanOrEqual(1);
            await expect
              .poll(async () => {
                const box = (await toolbar.boundingBox())!;
                return Math.abs((top ? box.y : limits.height - box.y - box.height) - 8);
              })
              .toBeLessThanOrEqual(1);
          }
          if (edge.includes('-'))
            await page.screenshot({ path: info.outputPath(`parked-${edge}.png`), fullPage: false });
        }
        // Cancelling a corner preview preserves the last accepted bottom-right dock.
        const handle = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
        const grip = (await handle.boundingBox())!;
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(60, 20);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(toolbar).toHaveAttribute('data-display-mode', 'vertical');
        await expect(pencil).toBeVisible();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await expect(page.locator('[data-ui="content.toolbar.mode-option.drawing"]')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.reload();
        const restored = await popup.evaluate(async (origin) => {
          const tab = (await chrome.tabs.query({})).find(
            (candidate) => candidate.url === `${origin}/`
          );
          if (tab?.id === undefined) throw new Error('Host tab not found after reload');
          const registered = await chrome.runtime.sendMessage({
            type: 'PAGE_ACCESS',
            operation: 'register-granted-site',
            tabId: tab.id,
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          });
          if (!registered?.success) throw new Error('Granted site was not registered after reload');
          return chrome.tabs.sendMessage(tab.id, {
            type: 'ENABLE_SCREENSHOT_MODE',
            workingMode: 'drawing',
          });
        }, hostOrigin);
        expect(restored).toMatchObject({ success: true });
        await page.evaluate(() => {
          document.documentElement.style.overflowY = 'scroll';
          document.documentElement.style.scrollbarGutter = 'stable';
          document.body.style.minHeight = '2400px';
        });
        await expect(toolbar).toHaveAttribute('data-display-mode', 'vertical');
        await expect(pencil).toBeVisible();
        await expect
          .poll(async () => {
            const box = (await toolbar.boundingBox())!;
            return Math.abs(limits.width - box.x - box.width - 20);
          })
          .toBeLessThanOrEqual(1);
        await page.screenshot({
          path: info.outputPath('restored-right-dock.png'),
          fullPage: false,
        });
        await page.setViewportSize({ width: 1024, height: 560 });
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth
            )
          )
          .toBeLessThanOrEqual(0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const positioner = page.locator('.sniptale-toolbar-positioner');
        await expect(positioner).toHaveCSS('transition-duration', '0s');
      } catch (error) {
        await page.screenshot({
          path: info.outputPath('failure-before-cleanup.png'),
          fullPage: false,
        });
        throw error;
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }
}
