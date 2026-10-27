import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const ui = (page: Page, name: string) => page.locator(`[data-ui="content.toolbar.${name}"]`);
async function switchMode(page: Page, mode: string) {
  await ui(page, 'mode-selector-button').click();
  await ui(page, `mode-option.${mode}`).click();
  await expect(ui(page, `mode-option.${mode}`)).toHaveCount(0);
  await ui(page, 'root').evaluate(async (node) => {
    await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
  });
}

async function measureTransition(page: Page, mode: string, edge: 'top' | 'left' | 'free') {
  await ui(page, 'mode-selector-button').click();
  const option = ui(page, `mode-option.${mode}`);
  await option.evaluate((button) => {
    button.addEventListener(
      'click',
      () => {
        const root = button.getRootNode();
        const toolbar = root.querySelector<HTMLElement>('[data-ui="content.toolbar.root"]')!;
        const start = performance.now();
        const frames: { x: number; y: number; width: number; height: number }[] = [];
        Reflect.set(
          toolbar,
          '__modeFrames',
          new Promise((resolve) => {
            const sample = () => {
              const rect = toolbar.getBoundingClientRect();
              const frame = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                parentTop: toolbar.parentElement?.style.top,
                animations: toolbar.getAnimations().map((animation) => ({
                  id: animation.id,
                  time: animation.currentTime,
                  frames:
                    animation.effect instanceof KeyframeEffect
                      ? animation.effect.getKeyframes()
                      : [],
                })),
              };
              frames.push(frame);
              if (performance.now() - start < 400) requestAnimationFrame(sample);
              else resolve(frames);
            };
            sample();
          })
        );
      },
      { capture: true, once: true }
    );
  });
  await option.click();
  const frames = await ui(page, 'root').evaluate(async (node) => {
    const value: unknown = await Reflect.get(node, '__modeFrames');
    if (!Array.isArray(value)) throw new Error('Mode frame proof is missing');
    return value.map((frame: { x: number; y: number; width: number; height: number }) => frame);
  });
  await test.info().attach(`mode-frames-${mode}`, {
    body: JSON.stringify(frames),
    contentType: 'application/json',
  });
  await writeFile(
    test.info().outputPath(`mode-frames-${mode}-${edge}.json`),
    JSON.stringify(frames)
  );
  const anchors = frames.map((frame) =>
    edge === 'free'
      ? frame.x
      : edge === 'top'
        ? frame.x + frame.width / 2
        : frame.y + frame.height / 2
  );
  expect(frames.length).toBeGreaterThan(3);
  expect(Math.max(...anchors) - Math.min(...anchors)).toBeLessThanOrEqual(0.5);
  await expect(ui(page, 'capture-visible-button')).toBeVisible();
  expect((await ui(page, 'capture-visible-button').boundingBox())!.width).toBeGreaterThanOrEqual(
    24
  );
  return frames;
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const edge of ['top', 'left'] as const) {
    test(`page toolbar coherent mode geometry ${name} ${edge}`, async ({}, info) => {
      test.setTimeout(120000);
      const host = await startHostServer();
      const browser = await launchExtensionBrowser({ viewport: size });
      try {
        const { page } = await openDesignReview(
          browser.context,
          browser.extensionId,
          host.origin,
          size
        );
        await switchMode(page, 'drawing');
        if (edge === 'left') {
          const handle = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(8, size.height / 2, { steps: 8 });
          await page.mouse.up();
          await expect(ui(page, 'root')).toHaveAttribute('data-display-mode', 'vertical');
          await ui(page, 'root').evaluate(async (node) => {
            await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
          });
        }
        const frames = await measureTransition(page, 'highlighter', edge);
        await info.attach('mode-frames', {
          body: JSON.stringify(frames),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath('annotation-settled.png'), fullPage: false });
        await measureTransition(page, 'drawing', edge);
        if (edge === 'top' && size.width === 1920) {
          await ui(page, 'mode-selector-button').click();
          await ui(page, 'mode-option.highlighter').click();
          await measureTransition(page, 'drawing', edge);
          await ui(page, 'settings-button').click();
          await page.getByRole('button', { name: /Free toolbar placement/u }).click();
          await page.keyboard.press('Escape');
          await measureTransition(page, 'highlighter', 'free');
        }

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await switchMode(page, 'highlighter');
        expect(
          await ui(page, 'root').evaluate((node) =>
            node
              .getAnimations()
              .some((animation) => animation.id === 'sniptale-toolbar-mode-transition')
          )
        ).toBe(false);
        await page.setViewportSize({ width: 1000, height: size.height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      } finally {
        await closeExtensionBrowser(browser);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

for (const { name, size, locale } of PRIMARY_BROWSER_VIEWPORTS.flatMap(({ name, size }) =>
  ['en', 'ru'].map((locale) => ({ name: `${name}-${locale}`, size, locale }))
)) {
  test(`page toolbar digit modes preserve input ownership ${name}`, async ({}, info) => {
    test.setTimeout(120000);
    const host = await startHostServer();
    const browser = await launchExtensionBrowser({ viewport: size });
    try {
      const worker =
        browser.context.serviceWorkers()[0] ??
        (await browser.context.waitForEvent('serviceworker'));
      await worker.evaluate(async (locale) => {
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': locale === 'ru' ? 'dark' : 'light',
        });
      }, locale);
      const { page } = await openDesignReview(
        browser.context,
        browser.extensionId,
        host.origin,
        size
      );
      const trigger = ui(page, 'mode-selector-button');
      const checkMenuBounds = async () => {
        const menu = page.locator('.sniptale-toolbar-menu:visible');
        const bounds = (await menu.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height + 0.5);
        await menu.hover();
        await page.mouse.wheel(0, 10000);
        await expect
          .poll(async () => {
            const last = (await ui(page, 'mode-option.video-recording').boundingBox())!;
            return last.y >= bounds.y && last.y + last.height <= bounds.y + bounds.height + 0.5;
          })
          .toBe(true);
      };
      await trigger.click();
      const modes = [
        'cursor',
        'drawing',
        'highlighter',
        'quick-edit',
        'design-review',
        'video-recording',
      ];
      const labels: string[] = [];
      for (const [index, mode] of modes.entries()) {
        const option = ui(page, `mode-option.${mode}`);
        await expect(option.locator('kbd')).toHaveText(String(index + 1));
        await expect(option.locator('svg').first()).toBeVisible();
        labels.push(await option.locator('.sniptale-toolbar-menu-item-label').innerText());
      }
      await checkMenuBounds();
      await page.screenshot({ path: info.outputPath('mode-digit-menu.png'), fullPage: false });
      await page.keyboard.press('1');
      await expect(ui(page, 'mode-option.cursor')).toHaveCount(0);
      await expect(ui(page, 'root')).toHaveAttribute('data-page-mode', 'cursor');
      await expect(trigger.locator('.sniptale-mode-selector-label')).toHaveText(labels[0]!);
      await expect(trigger.locator('.sniptale-mode-selector-label')).toBeVisible();
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
        const input = document.createElement('input');
        input.id = 'digit-input-proof';
        input.style.cssText = 'position:fixed;left:20px;top:200px';
        document.body.append(input);
        const shadowHost = document.createElement('div');
        shadowHost.id = 'digit-shadow-proof';
        shadowHost.style.cssText = 'position:fixed;left:20px;top:240px';
        document.body.append(shadowHost);
        shadowHost.attachShadow({ mode: 'open' }).append(document.createElement('input'));
      });
      await expect(ui(page, 'root')).toHaveAttribute('data-page-mode', 'cursor');
      for (const selector of ['#digit-input-proof', '#digit-shadow-proof input']) {
        const input = page.locator(selector);
        await input.focus();
        await page.keyboard.type('23456');
        await expect(input).toHaveValue('23456');
        await expect(ui(page, 'root')).toHaveAttribute('data-page-mode', 'cursor');
        await input.evaluate((node) => node.blur());
      }
      await ui(page, 'settings-button').click();
      await page.keyboard.press('2');
      await expect(ui(page, 'root')).toHaveAttribute('data-page-mode', 'cursor');
      await expect(ui(page, 'settings-button')).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      for (const [index, mode] of modes.entries()) {
        await page.keyboard.press(String(index + 1));
        if (mode === 'video-recording')
          await expect(ui(page, 'root')).toHaveAttribute('data-video-recording', 'true');
        else await expect(ui(page, 'root')).toHaveAttribute('data-page-mode', mode);
        await expect(trigger).toHaveAttribute('aria-label', labels[index]!);
        await expect(trigger.locator('.sniptale-mode-selector-label')).toBeVisible();
        await expect(trigger).toBeEnabled();
      }
      await page.keyboard.press('6');
      await expect(ui(page, 'root')).toHaveAttribute('data-video-recording', 'true');
      const customize = ui(page, 'video-recording.customize');
      await customize.click();
      await expect(customize).toHaveAttribute('aria-pressed', 'true');
      await expect(trigger).toBeDisabled();
      await page.keyboard.press('2');
      await expect(ui(page, 'root')).toHaveAttribute('data-video-recording', 'true');
      await expect(customize).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({
        path: info.outputPath('recording-customization-shortcut-ignored.png'),
        fullPage: false,
      });
      await customize.click();
      await expect(trigger).toBeEnabled();
      await page.keyboard.press('2');
      await expect(ui(page, 'root')).not.toHaveAttribute('data-video-recording');
      await expect(ui(page, 'root')).toHaveAttribute('data-page-mode', 'drawing');
      await page.screenshot({ path: info.outputPath('mode-digit-caption.png'), fullPage: false });
      const stress = await trigger.evaluate((button) => {
        const label = button.querySelector<HTMLElement>('.sniptale-mode-selector-label')!;
        const original = label.textContent!;
        const expanded = `${original} ${original} — ${original}`;
        label.textContent = expanded;
        button.setAttribute('aria-label', expanded);
        button.title = expanded;
        return { original, expanded };
      });
      await expect(trigger).toHaveAttribute('aria-label', stress.expanded);
      await expect(trigger).toHaveAttribute('title', stress.expanded);
      await expect
        .poll(() =>
          trigger
            .locator('.sniptale-mode-selector-label')
            .evaluate((node) => node.scrollWidth > node.clientWidth)
        )
        .toBe(true);
      expect((await trigger.boundingBox())!.width).toBeLessThanOrEqual(180);
      await page.screenshot({
        path: info.outputPath('mode-digit-expanded-label.png'),
        fullPage: false,
      });
      await trigger.evaluate((button) => {
        button.style.fontSize = '26px';
      });
      await expect(trigger).toHaveCSS('font-size', '26px');
      await expect(trigger.locator('svg')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width
      );
      await page.screenshot({ path: info.outputPath('mode-digit-text-zoom.png'), fullPage: false });
      await trigger.evaluate((button, original) => {
        button.querySelector('.sniptale-mode-selector-label')!.textContent = original;
        button.setAttribute('aria-label', original);
        button.title = original;
        button.style.fontSize = '';
      }, stress.original);

      const grip = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
      const box = (await grip.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(8, size.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect(ui(page, 'root')).toHaveAttribute('data-display-mode', 'vertical');
      await expect(trigger.locator('.sniptale-mode-selector-label')).toBeHidden();
      await page.keyboard.press('3');
      await expect(ui(page, 'root')).toHaveAttribute('data-page-mode', 'highlighter');
      await expect(trigger).toHaveAttribute('aria-label', labels[2]!);
      await ui(page, 'root').evaluate(async (node) => {
        await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
      });
      await trigger.click();
      await checkMenuBounds();
      await page.screenshot({
        path: info.outputPath('mode-digit-vertical-menu.png'),
        fullPage: false,
      });
      await page.keyboard.press('3');
      await page.screenshot({ path: info.outputPath('mode-digit-vertical.png'), fullPage: false });
      await page.setViewportSize({ width: 1024, height: 480 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        1024
      );
      await expect(trigger).toBeVisible();
    } finally {
      await closeExtensionBrowser(browser);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
