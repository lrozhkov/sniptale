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
