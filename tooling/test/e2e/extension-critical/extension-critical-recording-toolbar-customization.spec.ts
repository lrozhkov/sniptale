import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { RECORDING_TOOLBAR_CONTROLS } from '../../../../apps/extension/src/contracts/settings';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';

test.setTimeout(120000);
test.use({ actionTimeout: 10000 });

for (const { name, size, orientation } of PRIMARY_BROWSER_VIEWPORTS.flatMap((viewport) =>
  (['horizontal', 'vertical'] as const).map((orientation) => ({ ...viewport, orientation }))
)) {
  test(`recording cursor compact parameters ${name} ${orientation}`, async ({}, info) => {
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: size });
    try {
      const { page, popup } = await openDesignReview(
        launched.context,
        launched.extensionId,
        host.origin,
        size
      );
      await popup.evaluate(
        async (theme) => {
          await chrome.storage.local.set({
            'sniptale-theme-preference': theme,
            'sniptale-locale-preference': theme === 'dark' ? 'ru' : 'en',
          });
        },
        size.width === 1920 ? 'dark' : 'light'
      );
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      if (orientation === 'vertical') {
        await openRecordingToolbarSettings(page);
        const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
        if (!(await vertical.isVisible()))
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        await vertical.click();
        await page.keyboard.press('Escape');
      }
      await page.locator('[data-ui="content.toolbar.video-recording.cursor-settings"]').click();
      const panel = page.locator('[data-ui="content.toolbar.video-recording.cursor-panel"]');
      const toggle = panel.getByRole('switch');
      if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
      const value = panel.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      await value.click();
      const input = panel.locator('[data-ui="shared.ui.color-selector.value-editor"] input');
      await input.fill('#123456');
      await panel.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await expect(panel).toBeVisible();
      await expect(picker).toBeVisible();
      await expect(picker.locator('input[type="text"]').first()).toHaveValue('#123456');
      await page.screenshot({ path: info.outputPath('color-edit-picker.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(panel).toBeVisible();
      await value.click();
      await input.fill('#654321');
      await panel.locator('[data-ui="shared.categorized-inspector.section-heading"]').click();
      await expect(panel).toBeVisible();
      await expect(value).toContainText('#654321');
      await value.click();
      await expect(input).toHaveCSS('outline-style', 'none');
      await expect(panel.locator('[data-ui="shared.ui.color-selector.trigger"]')).toHaveCSS(
        'outline-style',
        'none'
      );
      await input.press('Escape');
      await expect(panel).toBeVisible();
      await toggle.click();
      await expect(
        panel.locator('[data-ui="shared.ui.compact-inspector.color-field"]')
      ).toHaveCount(0);
      await expect(
        panel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
      ).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('disabled-effect.png'), fullPage: false });
      await toggle.click();
      await expect(value).toContainText('#654321');
      await selectCursorChoice(page, panel, /^(Effect|Эффект)$/u, /^(Press|Нажатие)$/u);
      await selectCursorChoice(page, panel, /^(Easing|Плавность)$/u, /^(Linear|Линейная)$/u);
      expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(360);
      await page.screenshot({ path: info.outputPath('compact-parameters.png'), fullPage: false });
      await page.setViewportSize({ width: 1000, height: size.height });
      await page.locator('[data-ui="content.toolbar.video-recording.cursor-settings"]').click();
      await expect(panel).toBeVisible();
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1000);
    } finally {
      await closeExtensionBrowser(launched);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });

  test(`recording media selection feedback ${name} ${orientation}`, async ({}, info) => {
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: size, fakeMediaDevices: true });
    const diagnostics: string[] = [];
    launched.context.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        diagnostics.push(message.text());
    });
    try {
      const { page, popup } = await openDesignReview(
        launched.context,
        launched.extensionId,
        host.origin,
        size
      );
      await popup.evaluate(
        async ({ defaults, theme }) => {
          await chrome.storage.local.set({
            sniptale_video_settings: {
              ...defaults,
              microphoneEnabled: false,
              webcamEnabled: false,
              warnWithoutMicrophone: false,
              webcamPresentation: { ...defaults.webcamPresentation!, mode: 'embedded' },
            },
            'sniptale-theme-preference': theme,
          });
        },
        { defaults: DEFAULT_VIDEO_SETTINGS, theme: size.width === 1920 ? 'dark' : 'light' }
      );
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      const action = await triggerExtensionAction(launched.context, launched.extensionId, page);
      await evaluateInTarget(launched.context, action, 'window.close()').catch(() => undefined);
      await page.bringToFront();
      if (orientation === 'vertical') {
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
        if (!(await vertical.isVisible()))
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        await vertical.click();
        await page.keyboard.press('Escape');
      }
      await expect(page.locator('[data-ui="content.toolbar.root"]')).toHaveAttribute(
        'data-display-mode',
        orientation
      );
      for (const kind of ['microphone', 'camera', 'cursor'] as const)
        await expectRecordingSplitChrome(page, info, kind);
      for (const kind of ['microphone', 'camera']) {
        if (kind === 'camera') {
          const toggle = page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]');
          if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
          await expect(toggle).toHaveAttribute('aria-pressed', 'true');
          const video = page.locator('[data-ui="content.video-recording.embedded-camera"] video');
          await expect
            .poll(() =>
              video.evaluate(
                (element) => element instanceof HTMLVideoElement && element.readyState >= 2
              )
            )
            .toBe(true);
        }
        const trigger = page.locator(`[data-ui="content.toolbar.video-recording.${kind}.menu"]`);
        const menu = page.locator(`[data-ui="content.toolbar.video-recording.${kind}.dropdown"]`);
        await trigger.click();
        const device = menu.locator('.sniptale-toolbar-menu-item:not([disabled])').first();
        await expect(device).toBeVisible();
        const label = await device.innerText();
        await device.click();
        await expect(menu).toHaveCount(0);
        await trigger.click();
        const selected = menu.getByRole('button', { name: label, exact: true });
        await expect(selected.locator('svg.lucide-check')).toHaveCount(1);
        await expect(menu.locator('svg.lucide-check')).toHaveCount(1);
        if (kind === 'camera') {
          const placement = menu.locator(
            '[data-ui="content.toolbar.video-recording.camera.placement"]'
          );
          for (let change = 0; change < 2; change++) {
            await observeStablePendingControls(menu);
            const next = placement.locator('button[aria-pressed="false"]');
            const nextLabel = await next.innerText();
            await next.click();
            await expect(
              placement.getByRole('button', { name: nextLabel, exact: true })
            ).toHaveAttribute('aria-pressed', 'true');
            await expect(menu).toHaveAttribute('data-stability-result', '[]');
          }
        }
        await page.screenshot({
          path: info.outputPath(`${kind}-selected-check.png`),
          fullPage: false,
        });
        await trigger.click();
      }
    } finally {
      await info.attach('media-diagnostics.json', {
        body: JSON.stringify(diagnostics),
        contentType: 'application/json',
      });
      await closeExtensionBrowser(launched);
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function expectStableSplitFill(group: Locator, destination: Locator) {
  const recording = group.evaluate(async (element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const primary = element.querySelector('.sniptale-split-action-start')!;
    const sample = () => {
      context.clearRect(0, 0, 1, 1);
      for (const node of [element, primary]) {
        context.fillStyle = getComputedStyle(node).backgroundColor;
        context.fillRect(0, 0, 1, 1);
      }
      return context.getImageData(0, 0, 1, 1).data[3]!;
    };
    const samples = [sample()];
    for (let frame = 0; frame < 20; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(sample());
    }
    return samples;
  });
  await destination.hover();
  const samples = await recording;
  expect(Math.max(...samples) - Math.min(...samples), JSON.stringify(samples)).toBeLessThanOrEqual(
    1
  );
}

async function drawingCanvasHasInk(canvas: Locator) {
  return canvas.evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) throw new Error('Expected drawing canvas');
    const context = node.getContext('2d')!;
    const pixels = context.getImageData(0, 0, node.width, node.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]! > 0) return true;
    return false;
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`recording ring icon and action border ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      try {
        const worker =
          launched.context.serviceWorkers()[0] ??
          (await launched.context.waitForEvent('serviceworker'));
        await worker.evaluate(
          async (theme) => {
            await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
          },
          size.width === 1920 ? 'dark' : 'light'
        );
        const { page, popup } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        if (orientation === 'vertical') {
          await openRecordingToolbarSettings(page);
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
          await page.keyboard.press('Escape');
        }
        const start = page.locator('[data-ui="content.toolbar.video-recording.start"]');
        await expect(start).toBeEnabled();
        await expect(start).toHaveAccessibleName(/\S/u);
        const icon = start.locator('svg[data-icon="recording"]');
        await expect(icon.locator('circle')).toHaveCount(2);
        await expect(icon.locator('circle').first()).toHaveCSS('fill', 'none');
        await page.mouse.move(0, 0);
        const bounds = (await start.boundingBox())!;
        const borderAlpha = () =>
          start.evaluate((button) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d')!;
            context.fillStyle = getComputedStyle(button).borderTopColor;
            context.fillRect(0, 0, 1, 1);
            return context.getImageData(0, 0, 1, 1).data[3];
          });
        await expect.poll(borderAlpha).toBe(0);
        await page.screenshot({ path: info.outputPath('rec-idle.png'), fullPage: false });
        await start.hover();
        await expect.poll(borderAlpha).toBeGreaterThan(0);
        const hovered = (await start.boundingBox())!;
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(Math.abs(hovered[key] - bounds[key])).toBeLessThanOrEqual(0.1);
        await page.screenshot({ path: info.outputPath('rec-hover.png'), fullPage: false });
        await popup.evaluate(async () => {
          await chrome.storage.local.set({
            sniptale_popup_startup: {
              selection: 'video',
              lastPage: 'video',
              lastExportDestination: 'export',
            },
          });
        });
        const target = await triggerExtensionAction(launched.context, launched.extensionId, page);
        const popupIconSelector =
          '[data-ui="popup.video-setup.start-recording-button"] svg[data-icon="recording"]';
        await expect
          .poll(() =>
            evaluateInTarget(
              launched.context,
              target,
              `Boolean(document.querySelector(${JSON.stringify(popupIconSelector)}))`
            )
          )
          .toBe(true);
        expect(
          await evaluateInTarget(
            launched.context,
            target,
            `(() => {
          const button = document.querySelector('[data-ui="popup.video-setup.start-recording-button"]');
          const circles = button.querySelectorAll('circle');
          return { radii: [...circles].map(circle => circle.getAttribute('r')),
            outerFill: getComputedStyle(circles[0]).fill, named: Boolean(button.textContent.trim()) };
        })()`
          )
        ).toEqual({ radii: ['10', '7'], outerFill: 'none', named: true });
        await evaluateInTarget(launched.context, target, 'window.close()').catch(() => undefined);
        await popup.setViewportSize({ width: 392, height: 560 });
        await popup.reload();
        await expect(
          popup.locator(
            '[data-ui="popup.video-setup.start-recording-button"] svg[data-icon="recording"]'
          )
        ).toBeVisible();
        await popup.screenshot({ path: info.outputPath('popup-rec-icon.png'), fullPage: false });
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });

    test(`embedded camera corner docking ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size, fakeMediaDevices: true });
      try {
        const worker =
          launched.context.serviceWorkers()[0] ??
          (await launched.context.waitForEvent('serviceworker'));
        await worker.evaluate(
          async ({ defaults, theme, shape }) => {
            await chrome.storage.local.set({
              'sniptale-theme-preference': theme,
              sniptale_video_settings: {
                ...defaults,
                webcamEnabled: true,
                webcamPresentation: { ...defaults.webcamPresentation!, mode: 'embedded', shape },
              },
            });
          },
          {
            defaults: DEFAULT_VIDEO_SETTINGS,
            theme: size.width === 1920 ? 'dark' : 'light',
            shape: orientation === 'vertical' ? 'rectangle' : 'circle',
          }
        );
        const { page } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        if (orientation === 'vertical') {
          await openRecordingToolbarSettings(page);
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
          await page.keyboard.press('Escape');
        }
        const camera = page.locator('[data-ui="content.video-recording.embedded-camera"]');
        await expect(camera).toBeVisible();
        await expect
          .poll(() =>
            camera
              .locator('video')
              .evaluate((video) => video instanceof HTMLVideoElement && video.readyState >= 2)
          )
          .toBe(true);
        const guides = page.locator('[data-ui="content.video-recording.camera-dock-guides"]');
        const bounds = async () => (await camera.boundingBox())!;
        for (const corner of [
          'nw',
          'n25',
          'n',
          'n75',
          'ne',
          'e',
          'sw',
          's25',
          's',
          's75',
          'w',
          'se',
        ]) {
          const along = corner.endsWith('25') ? 0.25 : corner.endsWith('75') ? 0.75 : 0.5;
          const before = await bounds();
          await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
          await page.mouse.down();
          await expect(guides).toBeVisible();
          const held = await bounds();
          expect(Math.abs(held.x - before.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(held.y - before.y)).toBeLessThanOrEqual(1);
          await page.mouse.move(
            corner.includes('w') ? 80 : corner.includes('e') ? size.width - 80 : size.width * along,
            corner.includes('n')
              ? 80
              : corner.includes('s')
                ? size.height - 80
                : size.height * along,
            { steps: 4 }
          );
          await expect(
            page.locator(`[data-ui="content.video-recording.camera-dock.${corner}"]`)
          ).toHaveAttribute('data-active', 'true');
          await page.screenshot({
            path: info.outputPath(`camera-docking-${corner}.png`),
            fullPage: false,
          });
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
          await expect
            .poll(async () => {
              const box = await bounds();
              const horizontal = corner.includes('w')
                ? box.x - 12
                : corner.includes('e')
                  ? size.width - box.x - box.width - 12
                  : box.x + box.width / 2 - size.width * along;
              const vertical = corner.includes('n')
                ? box.y - 12
                : corner.includes('s')
                  ? size.height - box.y - box.height - 12
                  : box.y + box.height / 2 - size.height * along;
              return Math.max(Math.abs(horizontal), Math.abs(vertical));
            })
            .toBeLessThanOrEqual(1);
        }
        await page.setViewportSize({ width: size.width - 100, height: size.height - 40 });
        await expect
          .poll(async () => {
            const box = await bounds();
            return Math.max(
              Math.abs(size.width - 100 - box.x - box.width - 12),
              Math.abs(size.height - 40 - box.y - box.height - 12)
            );
          })
          .toBeLessThanOrEqual(1);
        const beforeResize = await bounds();
        await page.mouse.move(
          beforeResize.x + beforeResize.width / 2,
          beforeResize.y + beforeResize.height / 2
        );
        const handle = camera.locator('[data-resize="true"]');
        await expect(handle).toHaveAttribute('data-corner', 'nw');
        const handleBounds = (await handle.boundingBox())!;
        await page.mouse.move(handleBounds.x + 12, handleBounds.y + 12);
        await page.mouse.down();
        await page.mouse.move(handleBounds.x - 28, handleBounds.y - 28, { steps: 4 });
        await page.mouse.up();
        await expect
          .poll(async () => (await bounds()).width)
          .toBeGreaterThan(beforeResize.width + 20);
        const resized = await bounds();
        expect(Math.abs(size.width - 100 - resized.x - resized.width - 12)).toBeLessThanOrEqual(1);
        expect(Math.abs(size.height - 40 - resized.y - resized.height - 12)).toBeLessThanOrEqual(1);
        await page.mouse.move(resized.x - 10, resized.y + resized.height / 2);
        await expect(handle).toHaveCSS('opacity', '1');
        await page.mouse.move(resized.x - 20, resized.y + resized.height / 2);
        await expect(handle).toHaveCSS('opacity', '0');
        await page.locator('[data-ui="content.toolbar.video-recording.camera.menu"]').click();
        const free = page.locator(
          '[data-ui="content.toolbar.video-recording.camera.free-placement"]'
        );
        await expect(free).toHaveAttribute('aria-pressed', 'false');
        await free.click();
        await expect(free).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Escape');
        const beforeFree = await bounds();
        await page.mouse.move(
          beforeFree.x + beforeFree.width / 2,
          beforeFree.y + beforeFree.height / 2
        );
        await page.mouse.down();
        await expect(guides).toHaveCount(0);
        await page.mouse.move(size.width / 2, size.height / 2, { steps: 4 });
        await page.mouse.up();
        await expect.poll(async () => (await bounds()).x).toBeLessThan(beforeFree.x - 100);
        await expect
          .poll(() =>
            camera
              .locator('video')
              .evaluate((video) => video instanceof HTMLVideoElement && video.readyState >= 2)
          )
          .toBe(true);
        await page.screenshot({
          path: info.outputPath('camera-free-placement.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="content.toolbar.video-recording.camera.menu"]').click();
        await free.click();
        await expect(free).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 480, height: 900 });
        const portrait = await bounds();
        await page.mouse.move(portrait.x + portrait.width / 2, portrait.y + portrait.height / 2);
        await page.mouse.down();
        await expect(
          guides.locator('[data-ui^="content.video-recording.camera-dock."]')
        ).toHaveCount(12);
        await expect(
          guides.locator('[data-ui="content.video-recording.camera-dock.n25"]')
        ).toHaveCount(0);
        await page.mouse.move(80, 225, { steps: 4 });
        await expect(
          guides.locator('[data-ui="content.video-recording.camera-dock.w25"]')
        ).toHaveAttribute('data-active', 'true');
        await page.screenshot({
          path: info.outputPath('camera-portrait-quarter-guides.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await expect.poll(async () => Math.abs((await bounds()).x - 12)).toBeLessThanOrEqual(1);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });

    test(`recording click effects exclude extension UI ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      try {
        const worker =
          launched.context.serviceWorkers()[0] ??
          (await launched.context.waitForEvent('serviceworker'));
        await worker.evaluate(
          async (theme) => {
            await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
          },
          size.width === 1920 ? 'dark' : 'light'
        );
        const { page } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        if (orientation === 'vertical') {
          await openRecordingToolbarSettings(page);
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
          await page.keyboard.press('Escape');
        }
        await page.locator('[data-ui="content.toolbar.video-recording.spotlight"]').click();
        await page.locator('[data-ui="content.toolbar.video-recording.spotlight-click"]').click();
        await page.keyboard.press('Escape');
        const animation = page.locator('[data-ui="content.video-recording.spotlight-click"]');
        await expect(animation).toHaveCount(0);
        const surface = page.locator('[data-ui="content.video-recording.spotlight"]');
        await surface.evaluate((element) => {
          element.setAttribute('data-test-click-count', '0');
          new MutationObserver((records) => {
            const added = records
              .flatMap((record) => [...record.addedNodes])
              .filter(
                (node) =>
                  node instanceof Element &&
                  node.matches('[data-ui="content.video-recording.spotlight-click"]')
              ).length;
            if (added)
              element.setAttribute(
                'data-test-click-count',
                String(Number(element.getAttribute('data-test-click-count')) + added)
              );
          }).observe(element, { childList: true });
        });
        const panel = page.locator('[data-ui="content.toolbar.video-recording.cursor-panel"]');
        for (const [effect, label] of [
          ['press', /^(Press|Нажатие)$/u],
          ['glow', /^(Glow|Свечение)$/u],
          ['ripple', /^(Ripple|Расходящееся кольцо)$/u],
        ] as const) {
          await page.locator('[data-ui="content.toolbar.video-recording.cursor-settings"]').click();
          await panel.locator('nav button').first().click();
          await selectCursorChoice(page, panel, /^(Effect|Эффект)$/u, label);
          await page.screenshot({
            path: info.outputPath(`ui-no-click-${effect}.png`),
            fullPage: false,
          });
          await page.keyboard.press('Escape');
          await openRecordingToolbarSettings(page);
          await page.keyboard.press('Escape');
          await expect(surface).toHaveAttribute('data-test-click-count', '0');
          await page.getByRole('button', { name: 'Host action', exact: true }).click();
          await expect(animation).toHaveAttribute('data-effect', effect);
          await expect(surface).toHaveAttribute('data-test-click-count', '1');
          await expect(animation).toHaveCount(0);
          await surface.evaluate((element) => element.setAttribute('data-test-click-count', '0'));
        }
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });

    test(`recording eraser cursor and Escape ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      try {
        const worker =
          launched.context.serviceWorkers()[0] ??
          (await launched.context.waitForEvent('serviceworker'));
        await worker.evaluate(
          async (theme) => {
            await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
          },
          size.width === 1920 ? 'dark' : 'light'
        );
        const { page } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        if (orientation === 'vertical') {
          await openRecordingToolbarSettings(page);
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
          await page.keyboard.press('Escape');
        }
        const canvas = page.locator('.sniptale-drawing-canvas').first();
        const eraser = page.locator('[data-ui="content.toolbar.video-recording.eraser"]');
        const navigation = page.locator('[data-ui="content.toolbar.video-recording.navigation"]');
        let pencilCursor = '';
        for (const tool of ['pencil', 'text', 'arrow']) {
          await page.locator(`[data-ui="content.toolbar.drawing.${tool}"]`).click();
          await expect(canvas).toHaveCSS('pointer-events', 'auto');
          const previousCursor = await canvas.evaluate((node) => getComputedStyle(node).cursor);
          if (tool === 'pencil') pencilCursor = previousCursor;
          await eraser.click();
          await expect(canvas).not.toHaveCSS('cursor', previousCursor);
          await expect(eraser).toHaveAttribute('data-active', 'true');
          await page.screenshot({
            path: info.outputPath(`eraser-after-${tool}.png`),
            fullPage: false,
          });
          await page.keyboard.press('Escape');
          await expect(navigation).toHaveAttribute('data-active', 'true');
          await expect(canvas).toHaveCSS('pointer-events', 'none');
          await expect(page.locator('.sniptale-toolbar-positioner')).not.toBeFocused();
        }
        await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
        await page.mouse.move(500, 300);
        await page.mouse.down();
        await page.mouse.move(560, 320, { steps: 6 });
        await page.mouse.up();
        await expect.poll(() => drawingCanvasHasInk(canvas)).toBe(true);
        await eraser.click();
        await page.mouse.move(500, 300);
        await page.mouse.down();
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(navigation).toHaveAttribute('data-active', 'true');
        await expect.poll(() => drawingCanvasHasInk(canvas)).toBe(true);
        await eraser.click();
        await page.mouse.move(500, 300);
        await page.mouse.down();
        await page.mouse.move(560, 320, { steps: 6 });
        await page.mouse.up();
        await expect.poll(() => drawingCanvasHasInk(canvas)).toBe(false);
        await page.locator('[data-ui="content.toolbar.video-recording.auto-hide"]').click();
        await page.keyboard.press('Escape');
        await expect(eraser).toHaveAttribute('data-active', 'true');
        await page.keyboard.press('Escape');
        await expect(navigation).toHaveAttribute('data-active', 'true');
        await page.screenshot({ path: info.outputPath('eraser-navigation.png'), fullPage: false });
        await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
        await expect(canvas).toHaveCSS('cursor', pencilCursor);
        await page.screenshot({
          path: info.outputPath('pencil-cursor-restored.png'),
          fullPage: false,
        });
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

async function expectRecordingSplitChrome(
  page: Page,
  info: TestInfo,
  kind: 'microphone' | 'camera' | 'cursor'
) {
  const primary = page.locator(
    `[data-ui="content.toolbar.video-recording.${kind === 'cursor' ? 'spotlight' : `${kind}.toggle`}"]`
  );
  const arrow = page.locator(
    `[data-ui="content.toolbar.video-recording.${kind === 'cursor' ? 'cursor-settings' : `${kind}.menu`}"]`
  );
  const group = primary.locator('..');
  const surface = async () =>
    group.evaluate((element) => {
      const primary = element.querySelector('.sniptale-split-action-start')!;
      const arrow = element.querySelector('.sniptale-split-action-end')!;
      const style = getComputedStyle(primary);
      return {
        radius: style.getPropertyValue('--sniptale-radius-sm').trim(),
        corners: [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ],
        group: getComputedStyle(element).backgroundColor,
        primary: style.backgroundColor,
        arrow: getComputedStyle(arrow).backgroundColor,
      };
    });
  for (const active of [false, true]) {
    if (active) {
      await primary.click();
      if (kind === 'cursor') {
        await page.locator('[data-ui="content.toolbar.video-recording.spotlight-halo"]').click();
        await page.keyboard.press('Escape');
      }
    }
    if (active) await expect(primary).toHaveAttribute('data-active', 'true');
    else await expect(primary).not.toHaveAttribute('data-active', 'true');
    await page.mouse.move(0, 0);
    await expect
      .poll(async () => {
        const appearance = await surface();
        return appearance.corners.every((corner) => corner === appearance.radius);
      })
      .toBe(true);
    await expect.poll(async () => (await surface()).group).toBe('rgba(0, 0, 0, 0)');
    if (active)
      await expect.poll(async () => (await surface()).primary).not.toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({ path: info.outputPath(`${kind}-${active}-idle.png`), fullPage: false });
    await primary.hover();
    if (active) await expect.poll(async () => (await surface()).group).toBe('rgba(0, 0, 0, 0)');
    if (active) await expectStableSplitFill(group, arrow);
    else await arrow.hover();
    await expect.poll(async () => (await surface()).group).not.toBe('rgba(0, 0, 0, 0)');
    await expect.poll(async () => (await surface()).primary).toBe('rgba(0, 0, 0, 0)');
    await expect.poll(async () => (await surface()).arrow).toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({
      path: info.outputPath(`${kind}-${active}-arrow-hover.png`),
      fullPage: false,
    });
    if (active) {
      await expectStableSplitFill(group, primary);
      await arrow.hover();
    }
    await page.mouse.down();
    await expect.poll(async () => (await surface()).primary).toBe('rgba(0, 0, 0, 0)');
    await page.mouse.up();
    await expect(arrow).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await surface()).group).not.toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(arrow).toHaveAttribute('aria-expanded', 'false');
    await primary.focus();
    await page.keyboard.press('Tab');
    await expect(arrow).toBeFocused();
    await expect.poll(async () => (await surface()).group).not.toBe('rgba(0, 0, 0, 0)');
    await page.mouse.click(0, 0);
  }
}

async function openRecordingToolbarSettings(page: Page) {
  const trigger = page.locator('[data-ui="content.toolbar.settings-button"]');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

async function observeStablePendingControls(surface: Locator) {
  await surface.evaluate((element) => {
    element.setAttribute('data-stability-result', 'pending');
    const group = element.closest('.sniptale-recording-media-control')!;
    const controlsRoot = element.matches('[data-ui="shared.categorized-inspector.section-heading"]')
      ? element
      : group;
    const controls = [...controlsRoot.querySelectorAll('button, input')];
    const opacity = controls.map((control) => getComputedStyle(control).opacity);
    const violations: string[] = [];
    let pending = false;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'disabled') violations.push('disabled');
        if (
          record.attributeName === 'class' &&
          /opacity-50|cursor-not-allowed/u.test(record.oldValue ?? '')
        )
          violations.push('disabled-style');
        if (record.attributeName === 'aria-busy' && record.oldValue === 'false') pending = true;
      }
      if (!element.isConnected || controls.some((control) => !group.contains(control)))
        violations.push('remounted');
      if (
        controls.some(
          (control, index) =>
            control.matches(':disabled') ||
            getComputedStyle(control).cursor === 'not-allowed' ||
            getComputedStyle(control).opacity !== opacity[index]
        )
      )
        violations.push('dimmed-or-forbidden');
      if (pending && group.getAttribute('aria-busy') === 'false') {
        observer.disconnect();
        element.setAttribute('data-stability-result', JSON.stringify(violations));
      }
    });
    observer.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'disabled', 'aria-busy'],
    });
  });
}

async function expectCursorSettings(page: Page, popup: Page, info: TestInfo) {
  const trigger = page.locator('[data-ui="content.toolbar.video-recording.cursor-settings"]');
  const panel = page.locator('[data-ui="content.toolbar.video-recording.cursor-panel"]');
  const open = async () => {
    if (!(await panel.isVisible())) await trigger.click();
    await expect(panel).toBeVisible();
  };
  const quick = page.locator('[data-ui="content.toolbar.video-recording.spotlight"]');
  await quick.click();
  await expect(
    page.locator('[data-ui="content.toolbar.video-recording.spotlight-halo"]')
  ).toBeVisible();
  await expect(panel).toHaveCount(0);
  await open();
  expect(
    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('sniptale_video_settings');
      return stored.sniptale_video_settings.recordingSurface?.cursorEffects ?? null;
    })
  ).toBeNull();
  await quick.click();
  await expect(panel).toHaveCount(0);
  const quickMenu = page.locator('[data-ui="content.toolbar.video-recording.spotlight-menu"]');
  expect(
    await quickMenu
      .locator('[data-ui^="content.toolbar.video-recording.spotlight-"]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-ui')))
  ).toEqual(
    ['click', 'halo', 'dimming'].map(
      (effect) => `content.toolbar.video-recording.spotlight-${effect}`
    )
  );
  for (const effect of ['halo', 'dimming', 'click']) {
    const choice = quickMenu.locator(
      `[data-ui="content.toolbar.video-recording.spotlight-${effect}"]`
    );
    const previous = await choice.getAttribute('aria-pressed');
    await quickMenu.evaluate((menu) => {
      menu.setAttribute('data-stability-result', 'pending');
      const group = menu.parentElement!;
      const choices = [...menu.querySelectorAll('button')];
      const violations: string[] = [];
      let pending = false;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.attributeName === 'disabled') violations.push('disabled');
          if (
            record.attributeName === 'class' &&
            /opacity-50|cursor-not-allowed/u.test(record.oldValue ?? '')
          )
            violations.push('disabled-style');
          if (record.attributeName === 'aria-busy' && record.oldValue === 'false') pending = true;
        }
        if (!menu.isConnected || choices.some((choice) => !menu.contains(choice)))
          violations.push('remounted');
        if (
          choices.some(
            (choice) =>
              choice.disabled ||
              getComputedStyle(choice).cursor === 'not-allowed' ||
              Number(getComputedStyle(choice).opacity) < 1
          )
        )
          violations.push('dimmed-or-forbidden');
        if (pending && group.getAttribute('aria-busy') === 'false') {
          observer.disconnect();
          menu.setAttribute('data-stability-result', JSON.stringify(violations));
        }
      });
      observer.observe(group, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class', 'disabled', 'aria-busy'],
      });
    });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', previous === 'true' ? 'false' : 'true');
    await expect(choice.locator('svg.lucide-check')).toHaveCount(previous === 'true' ? 0 : 1);
    await expect(quickMenu).toHaveAttribute('data-stability-result', '[]');
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', previous!);
    await expect(choice.locator('svg.lucide-check')).toHaveCount(previous === 'true' ? 1 : 0);
    await expect(quick.locator('..')).toHaveAttribute('aria-busy', 'false');
  }
  await page.screenshot({ path: info.outputPath('stable-cursor-quick-menu.png'), fullPage: false });
  const cursorChevron = (await trigger.boundingBox())!;
  const mediaChevron = (await page
    .locator('[data-ui="content.toolbar.video-recording.camera.menu"]')
    .boundingBox())!;
  expect(cursorChevron.width).toBeCloseTo(mediaChevron.width, 1);
  expect(cursorChevron.height).toBeCloseTo(mediaChevron.height, 1);
  await open();
  await expect(panel.locator('nav button')).toHaveCount(4);
  if ((await panel.getByRole('switch').getAttribute('aria-checked')) !== 'true')
    await panel.getByRole('switch').click();
  await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible();
  expect(await trigger.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
  const viewport = page.viewportSize()!;
  const bounds = (await panel.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(340);
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  const rows = await panel
    .locator('.sniptale-parameter-row[data-layout="inline"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const label = element.firstElementChild!.getBoundingClientRect();
        const control = element
          .querySelector<HTMLElement>(
            'input[type="text"], button[role="switch"], button[aria-haspopup="listbox"], [data-ui="shared.ui.color-selector.value-trigger"]'
          )!
          .getBoundingClientRect();
        return {
          centerDifference: Math.abs(label.y + label.height / 2 - control.y - control.height / 2),
          height: element.getBoundingClientRect().height,
        };
      })
    );
  expect(rows.length).toBeGreaterThanOrEqual(4);
  for (const row of rows) {
    expect(row.centerDifference).toBeLessThanOrEqual(1);
    expect(row.height).toBeCloseTo(40, 0);
  }
  const categories = panel.locator('nav button');
  const iconAlignment = await categories.evaluateAll((buttons) =>
    buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      const icon = button.querySelector('svg')!.getBoundingClientRect();
      const nav = button.closest('nav')!.getBoundingClientRect();
      return {
        horizontal: Math.abs(bounds.x + bounds.width / 2 - icon.x - icon.width / 2),
        vertical: Math.abs(bounds.y + bounds.height / 2 - icon.y - icon.height / 2),
        insets: Math.abs(bounds.x - nav.x - (nav.right - bounds.right)),
      };
    })
  );
  for (const icon of iconAlignment) {
    expect(icon.horizontal).toBeLessThanOrEqual(1);
    expect(icon.vertical).toBeLessThanOrEqual(1);
    expect(icon.insets).toBeLessThanOrEqual(1);
  }
  const closeAlignment = await panel
    .locator('[data-settings-action="close"]')
    .evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const icon = button.querySelector('svg')!.getBoundingClientRect();
      return {
        horizontal: Math.abs(bounds.x + bounds.width / 2 - icon.x - icon.width / 2),
        vertical: Math.abs(bounds.y + bounds.height / 2 - icon.y - icon.height / 2),
      };
    });
  expect(closeAlignment.horizontal).toBeLessThanOrEqual(1);
  expect(closeAlignment.vertical).toBeLessThanOrEqual(1);
  await categories.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(panel).toHaveAttribute('data-focus-modality', 'keyboard');
  await expect(categories.nth(1)).toBeFocused();
  await expect(categories.nth(1)).toHaveCSS('outline-width', '1px');
  await categories.first().click();
  await expect(panel).toHaveAttribute('data-focus-modality', 'pointer');
  await expect(categories.first()).toHaveCSS('outline-style', 'none');
  await expect(categories.first()).toHaveCSS('box-shadow', 'none');
  const choices = [
    {
      section: 1,
      fields: ['haloSize', 'haloStroke', 'haloGlow'],
      values: ['66', '3', '12'],
      colorKey: 'haloColor',
      color: '#2563eb',
    },
    {
      section: 2,
      fields: ['dimmingRadius', 'dimmingOpacity'],
      values: ['90', '45'],
      colorKey: 'dimmingColor',
      color: '#112233',
    },
    {
      section: 0,
      fields: ['clickSize', 'clickDuration', 'clickStroke', 'clickPulses'],
      values: ['60', '0.65', '4', '2'],
      colorKey: 'clickColor',
      color: '#ef4444',
    },
  ] as const;
  for (const choice of choices) {
    await open();
    await panel.locator('nav button').nth(choice.section).click();
    const colorField = panel.locator('[data-ui="shared.ui.compact-inspector.color-field"]');
    if (choice.section === 1) {
      const accent = await panel.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--sniptale-color-accent').trim().toUpperCase()
      );
      await expect(
        colorField.locator('[data-ui="shared.ui.color-selector.value-trigger"]')
      ).toHaveAttribute('title', accent);
      await colorField.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await expect(picker).toBeVisible();
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill('#abcdef');
      const pickerBounds = (await picker.boundingBox())!;
      expect(pickerBounds.x).toBeGreaterThanOrEqual(-1);
      expect(pickerBounds.y).toBeGreaterThanOrEqual(-1);
      expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(pickerBounds.y + pickerBounds.height).toBeLessThanOrEqual(viewport.height + 1);
      const panelBounds = (await panel.boundingBox())!;
      expect(pickerBounds.x).toBeLessThan(panelBounds.x + panelBounds.width);
      expect(pickerBounds.x + pickerBounds.width).toBeGreaterThan(panelBounds.x);
      await page.screenshot({ path: info.outputPath('cursor-color-picker.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(panel).toBeVisible();
      await expect(
        colorField.locator('[data-ui="shared.ui.color-selector.value-trigger"]')
      ).toHaveAttribute('title', accent);
      await colorField.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill(choice.color);
      const alpha = picker
        .locator('[data-ui="shared.ui.color-selector.opacity"]')
        .getByRole('textbox');
      await alpha.fill('70');
      await alpha.press('Enter');
      await picker.getByRole('button', { name: /^(Apply|Применить)$/u }).click();
    } else if (choice.section === 0) {
      await colorField.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill(choice.color);
      const alpha = picker
        .locator('[data-ui="shared.ui.color-selector.opacity"]')
        .getByRole('textbox');
      await alpha.fill('40');
      await alpha.press('Enter');
      await picker.getByRole('button', { name: /^(Apply|Применить)$/u }).click();
    } else {
      await colorField.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
      await page.screenshot({ path: info.outputPath('cursor-inline-color.png'), fullPage: false });
      const colorInput = colorField.getByRole('textbox');
      await colorInput.fill(choice.color);
      await colorInput.press('Enter');
    }
    await expect
      .poll(() =>
        popup.evaluate(async (key) => {
          const stored = await chrome.storage.local.get('sniptale_video_settings');
          return stored.sniptale_video_settings.recordingSurface.cursorEffects?.[key];
        }, choice.colorKey)
      )
      .toBe(choice.section === 1 ? '#2563ebb3' : choice.section === 0 ? '#ef444466' : choice.color);
    await open();
    await panel.locator('nav button').nth(choice.section).click();
    await expect(panel.locator('nav button').nth(choice.section)).toHaveCSS(
      'outline-style',
      'none'
    );
    const toggle = panel.getByRole('switch');
    if ((await toggle.getAttribute('aria-checked')) === 'true') await toggle.click();
    await expect(
      panel.locator('[data-ui="shared.categorized-inspector.section-heading"]').getByRole('switch')
    ).toHaveCount(1);
    expect(
      await toggle.evaluate((element) => {
        const heading = element.parentElement!;
        const label = heading.querySelector('span')!.getBoundingClientRect();
        const control = element.getBoundingClientRect();
        return Math.abs(label.y + label.height / 2 - control.y - control.height / 2);
      })
    ).toBeLessThanOrEqual(1);
    for (const enabled of [true, false, true]) {
      const heading = panel.locator('[data-ui="shared.categorized-inspector.section-heading"]');
      await observeStablePendingControls(heading);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', String(enabled));
      await expect(heading).toHaveAttribute('data-stability-result', '[]');
    }
    if (choice.section === 1) {
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect(toggle).toBeEnabled();
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
    for (const [index, field] of choice.fields.entries()) {
      await open();
      await panel.locator('nav button').nth(choice.section).click();
      const input = panel.locator('input[type="text"]').nth(index);
      await input.fill(choice.values[index]!);
      await observeStablePendingControls(panel);
      await input.press('Enter');
      await expect(panel).toHaveAttribute('data-stability-result', '[]');
      const expected = Number(choice.values[index]) * (field === 'clickDuration' ? 1000 : 1);
      await expect
        .poll(() =>
          popup.evaluate(async (key) => {
            const stored = await chrome.storage.local.get('sniptale_video_settings');
            return stored.sniptale_video_settings.recordingSurface.cursorEffects?.[key];
          }, field)
        )
        .toBe(expected);
    }
    await open();
    await panel.locator('nav button').nth(choice.section).click();
    await page.screenshot({
      path: info.outputPath(`cursor-settings-${choice.section}.png`),
      fullPage: false,
    });
  }
  await panel.locator('nav button').nth(3).click();
  await expect(
    panel.locator('[data-ui="content.toolbar.video-recording.native-cursor"]')
  ).toBeVisible();
  await expect(panel.locator('input')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.move(viewport.width - 80, viewport.height - 80);
  const halo = page.locator('[data-ui="content.video-recording.spotlight-halo"]');
  await expect(halo).toHaveCSS('width', '66px');
  await expect(halo).toHaveCSS('opacity', '1');
  await expect(halo).toHaveCSS('border-top-color', 'rgba(37, 99, 235, 0.7)');
  const dimming = page.locator('[data-ui="content.video-recording.spotlight-dimming"]');
  await expect(dimming).toHaveCSS('opacity', '0.45');
  await expect(dimming).toHaveCSS('background-color', 'rgb(17, 34, 51)');
  await expect(dimming).toHaveCSS('mask-image', /(?:circle )?90px at/u);
  await page.getByRole('button', { name: 'Host action', exact: true }).click();
  const ripple = page.locator('[data-ui="content.video-recording.spotlight-click"]');
  await expect(ripple).toHaveCSS('width', '60px');
  await expect(ripple).toHaveCSS('animation-duration', '0.325s');
  await expect(ripple).toHaveCSS('animation-iteration-count', '2');
  await expect(ripple).toHaveCSS('border-top-color', 'rgba(239, 68, 68, 0.4)');
  await open();
  await panel.locator('nav button').nth(1).click();
  await expect(panel.locator('input[type="text"]').first()).toHaveValue('66');
  await page.keyboard.press('Escape');
  await expectLiveClickModes(page, popup, info);
}

async function expectLiveClickModes(page: Page, popup: Page, info: TestInfo) {
  const panel = page.locator('[data-ui="content.toolbar.video-recording.cursor-panel"]');
  const trigger = page.locator('[data-ui="content.toolbar.video-recording.cursor-settings"]');
  for (const [effect, label] of [
    ['press', /^(Press|Нажатие)$/u],
    ['glow', /^(Glow|Свечение)$/u],
    ['ripple', /^(Ripple|Расходящееся кольцо)$/u],
  ] as const) {
    await trigger.click();
    await panel.locator('nav button').first().click();
    await selectCursorChoice(page, panel, /^(Effect|Эффект)$/u, label);
    await expect
      .poll(() =>
        popup.evaluate(async () => {
          const stored = await chrome.storage.local.get('sniptale_video_settings');
          return stored.sniptale_video_settings.recordingSurface.cursorEffects.clickEffect;
        })
      )
      .toBe(effect);
    await selectCursorChoice(page, panel, /^(Easing|Плавность)$/u, /^(Linear|Линейная)$/u);
    await page.screenshot({
      path: info.outputPath(`live-click-${effect}-settings.png`),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Host action', exact: true }).click();
    const animation = page.locator('[data-ui="content.video-recording.spotlight-click"]');
    await expect(animation).toHaveAttribute('data-effect', effect);
    await expect(animation).toHaveCSS('animation-timing-function', 'linear');
    if (effect === 'ripple') await expect(animation).toHaveCSS('border-top-width', '4px');
    else await expect(animation).toHaveCSS('background-color', 'rgba(239, 68, 68, 0.4)');
    if (effect === 'glow') await expect(animation).not.toHaveCSS('box-shadow', 'none');
    await expect(animation).toHaveCount(0);
  }
  await trigger.click();
  const effect = panel.getByRole('group', { name: /^(Effect|Эффект)$/u });
  if (await effect.isVisible())
    await expect(
      effect.getByRole('button', { name: /Ripple|Расходящееся кольцо/u })
    ).toHaveAttribute('aria-pressed', 'true');
  else
    await expect(panel.getByRole('button', { name: /^(Effect|Эффект)$/u })).toHaveText(
      /Ripple|Расходящееся кольцо/u
    );
  await page.keyboard.press('Escape');
}

async function selectCursorChoice(page: Page, panel: Locator, name: RegExp, option: RegExp) {
  const group = panel.getByRole('group', { name });
  if (await group.isVisible())
    await group.getByRole('button', { name: option, exact: true }).click();
  else {
    await panel.getByRole('button', { name }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
}

async function expectAutomaticRecordingFade(page: Page, info: TestInfo) {
  const toolbar = page.locator('[data-ui="content.toolbar.root"]');
  const opacity = () => toolbar.evaluate((element) => Number(getComputedStyle(element).opacity));
  await expect(toolbar).toHaveAttribute('data-recording-fade', 'true');
  await toolbar.hover();
  await expect.poll(opacity).toBe(1);
  const before = (await toolbar.boundingBox())!;
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width - 4, viewport.height - 4);
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  await expect(toolbar).toHaveCSS('transition-property', 'opacity');
  await expect(toolbar).toHaveCSS('transition-duration', '0.25s');
  const after = (await toolbar.boundingBox())!;
  for (const dimension of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(after[dimension] - before[dimension])).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: info.outputPath('faded-recording-controls.png'), fullPage: false });
  await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
  const drawingOptions = toolbar.locator('.sniptale-drawing-options-popover');
  await expect(drawingOptions).toBeVisible();
  await page.mouse.move(viewport.width - 4, viewport.height - 4);
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  const optionsOpacity = () =>
    drawingOptions.evaluate((element) => {
      let opacity = 1;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        opacity *= Number(getComputedStyle(ancestor).opacity);
      }
      return opacity;
    });
  await expect.poll(optionsOpacity).toBeCloseTo(0.2, 2);
  await page.screenshot({ path: info.outputPath('faded-recording-drawing.png'), fullPage: false });
  await drawingOptions.hover();
  await expect.poll(opacity).toBe(1);
  await expect.poll(optionsOpacity).toBe(1);
  await page.mouse.move(viewport.width - 4, viewport.height - 4);
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  await page.locator('[data-ui="content.toolbar.video-recording.navigation"]').click();
  await page.locator('[data-ui="content.toolbar.video-recording.navigation"]').focus();
  await page.keyboard.press('Tab');
  expect(await toolbar.evaluate((element) => element.matches(':focus-within'))).toBe(true);
  await expect.poll(opacity).toBe(1);
  await page.getByRole('button', { name: 'Host action', exact: true }).click();
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  await page.locator('[data-ui="content.toolbar.video-recording.spotlight"]').click();
  await page.locator('[data-ui="content.toolbar.video-recording.spotlight-halo"]').hover();
  await expect(toolbar).toHaveAttribute('data-menu-open', 'true');
  await expect.poll(opacity).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Host action', exact: true }).click();
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(toolbar).toHaveCSS('transition-property', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const grip = (await toolbar.locator('.sniptale-drag-handle').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 16, grip.y + grip.height / 2 + 16, { steps: 3 });
  await expect(toolbar).toHaveClass(/sniptale-toolbar-dragging/u);
  await expect.poll(opacity).toBe(1);
  await page.mouse.up();
  await toolbar.hover();
  await expect.poll(opacity).toBe(1);
}

async function expectRecordingControlOrder(
  page: Page,
  orientation: 'horizontal' | 'vertical',
  phase: 'idle' | 'recording' | 'paused',
  compact = false
) {
  const recordingPrefix = 'content.toolbar.video-recording.';
  const tools = ['select', 'pencil', 'marker', 'text', 'shape', 'arrow', 'blur'].map(
    (tool) => `content.toolbar.drawing.${tool}`
  );
  const lifecycle =
    phase === 'idle' ? ['start'] : [phase === 'paused' ? 'resume' : 'pause', 'stop'];
  const expected = [
    ...(phase === 'idle'
      ? [
          'content.toolbar.mode-selector-button',
          'content.toolbar.settings-button',
          `${recordingPrefix}customize`,
        ]
      : []),
    `${recordingPrefix}navigation`,
    ...(!compact
      ? [
          ...tools,
          ...(phase === 'idle' ? [`${recordingPrefix}auto-hide`] : []),
          ...[
            'eraser',
            'clear',
            'spotlight',
            'cursor-settings',
            'microphone.toggle',
            'microphone.menu',
            'camera.toggle',
            'camera.menu',
          ].map((control) => `${recordingPrefix}${control}`),
        ]
      : []),
    ...lifecycle.map((control) => `${recordingPrefix}${control}`),
  ];
  const toolbar = page.locator('[data-ui="content.toolbar.root"]');
  await expect
    .poll(() =>
      toolbar
        .locator('button[data-ui]')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-ui')))
    )
    .toEqual(expected);
  const landmarks = compact
    ? [`${recordingPrefix}navigation`, `${recordingPrefix}lifecycle`]
    : [
        `${recordingPrefix}navigation`,
        'content.toolbar.drawing.blur',
        `${recordingPrefix}spotlight`,
        `${recordingPrefix}camera.toggle`,
        `${recordingPrefix}lifecycle`,
      ];
  const boxes = [];
  for (const landmark of landmarks) {
    const bounds = await toolbar.locator(`[data-ui="${landmark}"]`).boundingBox();
    expect(bounds).not.toBeNull();
    boxes.push(bounds!);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1]!;
    const current = boxes[index]!;
    expect(
      orientation === 'vertical' ? previous.y + previous.height : previous.x + previous.width
    ).toBeLessThanOrEqual((orientation === 'vertical' ? current.y : current.x) + 1);
  }
}

async function expectAutoHideValue(trigger: Locator, delay: number) {
  const icon = trigger.locator('svg.lucide-broom-sparkles');
  const value = trigger.locator('[data-ui="content.toolbar.video-recording.auto-hide-value"]');
  const compressed = await trigger
    .locator('.sniptale-toolbar-delay')
    .evaluate((node) => node.clientWidth < 28 || node.clientHeight < 28);
  if (delay === 0) {
    await expect(trigger).toHaveAttribute('data-menu-indicator', 'true');
    await expect(value).toHaveCount(0);
    await expect(icon).toBeVisible();
  } else {
    if (compressed) await expect(icon).toBeHidden();
    else await expect(icon).toBeVisible();
    await expect(value).toHaveText(String(delay));
    await expect(value).toHaveCSS('font-size', compressed ? '13px' : '9px');
    await expect(trigger).not.toHaveAttribute('data-menu-indicator');
  }
  const center = await (delay === 0 || !compressed ? icon : value).evaluate((node) => {
    const icon = node.getBoundingClientRect();
    const button = node.closest('button')!.getBoundingClientRect();
    const content = node.closest('.sniptale-command-content');
    const transform = content ? getComputedStyle(content).transform : 'none';
    const press = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
    return {
      x: icon.x + icon.width / 2 - (button.x + button.width / 2) - press.m41,
      y: icon.y + icon.height / 2 - (button.y + button.height / 2) - press.m42,
    };
  });
  expect(Math.abs(center.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(center.y)).toBeLessThanOrEqual(0.5);
  return center;
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`recording auto-hide value presentation ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      try {
        const worker =
          launched.context.serviceWorkers()[0] ??
          (await launched.context.waitForEvent('serviceworker'));
        await worker.evaluate(
          async (theme) => {
            await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
          },
          size.width === 1920 ? 'dark' : 'light'
        );
        const { page } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        if (orientation === 'vertical') {
          await openRecordingToolbarSettings(page);
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
          await page.keyboard.press('Escape');
        }
        const trigger = page.locator('[data-ui="content.toolbar.video-recording.auto-hide"]');
        for (const delay of [0, 3, 5, 10, 30, 0]) {
          await trigger.click();
          await page
            .locator(`[data-ui="content.toolbar.video-recording.auto-hide-${delay}"]`)
            .click();
          await expectAutoHideValue(trigger, delay);
          await page.screenshot({ path: info.outputPath(`delay-${delay}.png`), fullPage: false });
        }
        await trigger.click();
        await page.locator('[data-ui="content.toolbar.video-recording.auto-hide-30"]').click();
        for (const size of [29, 30, 31]) {
          await trigger.evaluate(
            (node, size) => node.style.setProperty('--sniptale-toolbar-button-size', `${size}px`),
            size
          );
          await expectAutoHideValue(trigger, 30);
          await page.screenshot({ path: info.outputPath(`button-${size}.png`), fullPage: false });
        }
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

for (const { name, size } of [
  ...PRIMARY_BROWSER_VIEWPORTS,
  { name: '960x560', size: { width: 960, height: 560 } },
]) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    if (size.width < 1280 && orientation === 'vertical') continue;
    test(`recording controls customization ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      const diagnostics: string[] = [];
      launched.context.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          diagnostics.push(message.text().slice(0, 2000));
        }
      });
      try {
        const { page, popup } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await popup.evaluate(
          async ({ defaults, dark }) => {
            await chrome.storage.local.set({
              sniptale_video_settings: {
                ...defaults,
                microphoneEnabled: false,
                webcamEnabled: false,
                systemAudioEnabled: false,
                warnWithoutMicrophone: false,
                countdownSeconds: 0,
                qualityProfileId: null,
                outputProfile: defaults.outputProfile,
              },
              'sniptale-theme-preference': dark ? 'dark' : 'light',
              'sniptale-locale-preference': dark ? 'ru' : 'en',
            });
          },
          {
            defaults: {
              ...DEFAULT_VIDEO_SETTINGS,
              outputProfile: {
                ...DEFAULT_VIDEO_SETTINGS.outputProfile,
                resolution: VideoResolutionPreset.P240,
              },
            },
            dark: size.width === 1920,
          }
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        const action = await triggerExtensionAction(launched.context, launched.extensionId, page);
        await evaluateInTarget(launched.context, action, 'window.close()').catch(() => undefined);
        await page.bringToFront();
        const toolbar = page.locator('[data-ui="content.toolbar.root"]');
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        if (
          !(await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).isVisible())
        ) {
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        }
        await page
          .getByRole('button', {
            name:
              orientation === 'vertical'
                ? /Vertical view|Вертикальный вид/u
                : /Horizontal view|Горизонтальный вид/u,
          })
          .click();
        await page.keyboard.press('Escape');
        await expect(toolbar).toHaveAttribute('data-display-mode', orientation);
        await expectRecordingControlOrder(page, orientation, 'idle');
        await expectCursorSettings(page, popup, info);
        for (const delay of [0, 3, 5, 10, 30, 0]) {
          const trigger = page.locator('[data-ui="content.toolbar.video-recording.auto-hide"]');
          const menu = page.locator('[data-ui="content.toolbar.video-recording.auto-hide-menu"]');
          await trigger.click();
          const choice = menu.locator(
            `[data-ui="content.toolbar.video-recording.auto-hide-${delay}"]`
          );
          if ((await choice.locator('svg.lucide-check').count()) === 0) {
            await choice.click();
            await trigger.click();
          }
          await expect(choice.locator('svg.lucide-check')).toHaveCount(1);
          await expect(menu.locator('svg.lucide-check')).toHaveCount(1);
          const offset = await expectAutoHideValue(trigger, delay);
          if (delay === 3)
            await page.screenshot({
              path: info.outputPath('auto-hide-selected-check.png'),
              fullPage: false,
            });
          if (delay === 30) {
            await trigger.hover();
            await page.mouse.down();
            const pressedOffset = await expectAutoHideValue(trigger, delay);
            expect(pressedOffset!.x).toBeCloseTo(offset!.x, 1);
            expect(pressedOffset!.y).toBeCloseTo(offset!.y, 1);
            await page.mouse.up();
            await expect(menu).toHaveCount(0);
            await page.screenshot({
              path: info.outputPath('auto-hide-corner-value.png'),
              fullPage: false,
            });
            continue;
          }
          await trigger.click();
        }
        const bounds = await toolbar.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.y).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);
        const customize = page.locator('[data-ui="content.toolbar.video-recording.customize"]');
        await expect(customize).toBeEnabled();
        const fadeSetting = page.locator('[data-ui="content.toolbar.settings.recording-fade"]');
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'true');
        await page.screenshot({
          path: info.outputPath('recording-fade-setting.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible(
          { timeout: 30000 }
        );
        await expectRecordingControlOrder(page, orientation, 'recording');
        await expectAutomaticRecordingFade(page, info);
        await page.screenshot({
          path: info.outputPath('full-recording-controls.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="content.toolbar.video-recording.pause"]').click();
        await expectRecordingControlOrder(page, orientation, 'paused');
        await page.mouse.move(size.width - 4, size.height - 4);
        await expect(toolbar).toHaveCSS('opacity', '1');
        await page.locator('[data-ui="content.toolbar.video-recording.resume"]').click();
        await expectRecordingControlOrder(page, orientation, 'recording');
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible(
          { timeout: 30000 }
        );
        await expectRecordingControlOrder(page, orientation, 'idle');
        const readResult = async () =>
          parseRuntimeResponseForMessage(
            VideoMessageType.GET_RECORDING_STATE,
            await sendRuntimeMessage(popup, { type: VideoMessageType.GET_RECORDING_STATE })
          );
        await expect
          .poll(async () => (await readResult()).postRecordResult?.recordingId ?? null)
          .not.toBeNull();
        const previousResult = (await readResult()).postRecordResult;
        if (!previousResult) throw new Error('Saved recording result is unavailable');
        expect(
          parseRuntimeResponseForMessage(
            VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
            await sendRuntimeMessage(popup, {
              type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
              recordingId: previousResult.recordingId,
            })
          )
        ).toMatchObject({ success: true, result: 'acknowledged' });
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        await fadeSetting.click();
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                  .contentToolbar.fadeDuringRecording
            )
          )
          .toBe(false);
        await openRecordingToolbarSettings(page);
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Escape');
        await customize.click();
        await expect(customize).toHaveAttribute('aria-pressed', 'true');
        await expect(
          page.locator('[data-ui="content.toolbar.mode-selector-button"]')
        ).toBeDisabled();
        for (const control of RECORDING_TOOLBAR_CONTROLS) {
          const toggle = page.locator(
            `[data-ui="content.toolbar.video-recording.visibility.${control}"]`
          );
          await expect(toggle).toHaveAttribute('aria-pressed', 'true');
          const indicator = toggle.locator('svg.lucide-eye, svg.lucide-eye-off');
          const before = (await indicator.boundingBox())!;
          await toggle.hover();
          await page.mouse.down();
          try {
            await expect(toggle).toHaveAttribute('data-pressing', 'true');
            await expect
              .poll(async () => Math.abs((await indicator.boundingBox())!.x - before.x))
              .toBeLessThanOrEqual(0.5);
            await expect
              .poll(async () => Math.abs((await indicator.boundingBox())!.y - before.y))
              .toBeLessThanOrEqual(1.25);
            if (control === 'pencil')
              await page.screenshot({
                path: info.outputPath('visibility-eye-held.png'),
                fullPage: false,
              });
          } finally {
            await page.mouse.up();
          }
          await expect(toggle).toHaveAttribute('aria-pressed', 'false');
          await expect(indicator).toHaveClass(/lucide-eye-off/u);
          await expect
            .poll(async () => Math.abs((await indicator.boundingBox())!.x - before.x))
            .toBeLessThanOrEqual(0.5);
          await expect
            .poll(async () => Math.abs((await indicator.boundingBox())!.y - before.y))
            .toBeLessThanOrEqual(1.25);
          expect(await toggle.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
        }
        await page.evaluate(async () => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath('customizing-controls.png'),
          fullPage: false,
        });
        await customize.click();
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toBeVisible();
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]')
        ).toBeVisible();
        const saved = await popup.evaluate(async () => {
          const stored = await chrome.storage.sync.get('sniptale_settings');
          return stored['sniptale_settings'].contentToolbar.recordingControls;
        });
        expect(saved).toEqual(
          Object.fromEntries(RECORDING_TOOLBAR_CONTROLS.map((control) => [control, false]))
        );
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        const pause = page.locator('[data-ui="content.toolbar.video-recording.pause"]');
        try {
          await expect(pause).toBeVisible({ timeout: 30000 });
        } catch (error) {
          await info.attach('recording-start-diagnostics', {
            body: JSON.stringify(
              {
                state: await sendRuntimeMessage(popup, {
                  type: VideoMessageType.GET_RECORDING_STATE,
                }),
                diagnostics,
              },
              null,
              2
            ),
            contentType: 'application/json',
          });
          throw error;
        }
        await expect(customize).toHaveCount(0);
        await expectRecordingControlOrder(page, orientation, 'recording', true);
        await page.mouse.move(size.width - 4, size.height - 4);
        await expect(toolbar).toHaveCSS('opacity', '1');
        expect(await toolbar.getAttribute('data-recording-fade')).toBeNull();
        await expect(page.locator('[data-ui="content.toolbar.mode-selector-button"]')).toHaveCount(
          0
        );
        await expect(page.locator('[data-ui="content.toolbar.settings-button"]')).toHaveCount(0);
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.microphone.toggle"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.auto-hide"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.navigation"]')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('compact-recording-controls.png'),
          fullPage: false,
        });
        await pause.click();
        const resume = page.locator('[data-ui="content.toolbar.video-recording.resume"]');
        await expect(resume).toBeVisible();
        await expectRecordingControlOrder(page, orientation, 'paused', true);
        await resume.click();
        await expect(pause).toBeVisible();
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible(
          { timeout: 30000 }
        );
        await expect(customize).toBeVisible();
        await expectRecordingControlOrder(page, orientation, 'idle');
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toBeVisible();
        await expect(page.locator('[data-ui="content.toolbar.settings-button"]')).toBeVisible();
        await page.screenshot({
          path: info.outputPath('restored-idle-controls.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        await expect(customize).toBeEnabled();
        await customize.click();
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.visibility.pencil"]')
        ).toHaveAttribute('aria-pressed', 'false');
        const text = page.locator('[data-ui="content.toolbar.video-recording.visibility.text"]');
        await text.focus();
        await page.keyboard.press('Enter');
        await expect(text).toHaveAttribute('aria-pressed', 'true');
        await customize.click();
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'false');
        await fadeSetting.focus();
        await page.keyboard.press('Enter');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                  .contentToolbar.fadeDuringRecording
            )
          )
          .toBe(true);
        await openRecordingToolbarSettings(page);
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'true');
        await fadeSetting.focus();
        await page.keyboard.press('Space');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                  .contentToolbar.fadeDuringRecording
            )
          )
          .toBe(false);
        await openRecordingToolbarSettings(page);
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Escape');
        const media = await popup.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_video_settings'))['sniptale_video_settings']
        );
        expect(media.microphoneEnabled).toBe(false);
        expect(media.webcamEnabled).toBe(false);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
