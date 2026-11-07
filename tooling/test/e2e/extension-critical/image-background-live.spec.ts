import { writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
} from '../extension-critical.helpers';

declare global {
  interface Window {
    __backgroundPreviewMetrics?: {
      running: boolean;
      frames: number[];
      tasks: number[];
      values: string[];
    };
  }
}

async function historyIndex(page: Page) {
  return page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
}

async function canvasFingerprint(page: Page) {
  return page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>(
      '[data-ui="editor.canvas.layer"] canvas.lower-canvas'
    );
    if (!source) throw new Error('Editor canvas missing');
    const sample = document.createElement('canvas');
    sample.width = 160;
    sample.height = 100;
    const context = sample.getContext('2d')!;
    context.drawImage(source, 0, 0, 160, 100);
    const pixels = context.getImageData(0, 0, 160, 100).data;
    let hash = 2166136261;
    for (const channel of pixels) hash = Math.imul(hash ^ channel, 16777619);
    return hash;
  });
}

async function startMetrics(range: Locator) {
  await range.evaluate((node) => {
    const metrics = {
      running: true,
      frames: [] as number[],
      tasks: [] as number[],
      values: [] as string[],
    };
    window.__backgroundPreviewMetrics = metrics;
    const sample = (time: number) => {
      if (!metrics.running) return;
      metrics.frames.push(time);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    node.addEventListener('input', (event) => {
      if (metrics.running && event.target instanceof HTMLInputElement)
        metrics.values.push(event.target.value);
    });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const observer = new PerformanceObserver((entries) => {
        if (!metrics.running) {
          observer.disconnect();
          return;
        }
        metrics.tasks.push(...entries.getEntries().map((entry) => entry.duration));
      });
      observer.observe({ type: 'longtask' });
    }
  });
}

async function stopMetrics(page: Page) {
  return page.evaluate(() => {
    const metrics = window.__backgroundPreviewMetrics!;
    metrics.running = false;
    const gaps = metrics.frames
      .slice(1)
      .map((time, index) => time - metrics.frames[index]!)
      .sort((a, b) => a - b);
    return {
      samples: metrics.values.length,
      distinct: new Set(metrics.values).size,
      frames: metrics.frames.length,
      p95: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
      max: gaps.at(-1) ?? 0,
      longTasks: metrics.tasks,
    };
  });
}

async function revealRange(section: Locator) {
  const row = section.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  const range = row.locator('input[type="range"]');
  await expect(range).toBeVisible();
  return range;
}

for (const { name, size } of [
  ...PRIMARY_BROWSER_VIEWPORTS,
  { name: '1100x560', size: { width: 1100, height: 560 } },
]) {
  test(`Background previews large-image sliders and transactional colors ${name}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize(size);
      await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
      const source = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 6000;
        canvas.height = 4000;
        const context = canvas.getContext('2d')!;
        const gradient = context.createLinearGradient(0, 0, 6000, 4000);
        gradient.addColorStop(0, '#80aaff');
        gradient.addColorStop(1, '#ffca80');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 6000, 4000);
        context.fillStyle = '#ffffffe0';
        context.fillRect(900, 800, 4200, 2400);
        return canvas.toDataURL('image/jpeg', 0.9);
      });
      await applyHarnessBootstrap(page, {
        apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
        editorBootstrapPayload: { dataUrl: source, title: 'Background preview proof' },
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': size.width === 1280 ? 'dark' : 'light',
        },
      });
      await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
        )
        .toBe(true);
      await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
      const kinds = page.locator('[data-ui="editor.frame.background-mode"]');
      const fillMode = kinds.getByRole('button').nth(1);
      if ((await fillMode.getAttribute('aria-pressed')) !== 'true') {
        await fillMode.click();
        await expect(fillMode).toHaveAttribute('aria-pressed', 'true');
      }
      const glow = page.locator('[data-ui="editor.frame.source-glow"]');
      const range = await revealRange(glow);
      const before = await canvasFingerprint(page);
      const acceptedHistory = await historyIndex(page);
      const box = (await range.boundingBox())!;
      await startMetrics(range);
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 24 });
      const metrics = await stopMetrics(page);
      await writeFile(
        info.outputPath('glow-gesture-metrics.json'),
        JSON.stringify(metrics, null, 2)
      );
      await info.attach('glow-gesture-metrics', {
        path: info.outputPath('glow-gesture-metrics.json'),
        contentType: 'application/json',
      });
      expect(metrics.distinct).toBeGreaterThan(8);
      await expect.poll(() => canvasFingerprint(page)).not.toBe(before);
      expect(await historyIndex(page)).toBe(acceptedHistory);
      await page.screenshot({ path: info.outputPath('glow-before-release.png'), fullPage: false });
      await page.mouse.up();
      await writeFile(
        info.outputPath('after-release-state.json'),
        JSON.stringify(
          await page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState()),
          null,
          2
        )
      );
      await expect.poll(() => historyIndex(page)).toBe(acceptedHistory + 1);
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(() => canvasFingerprint(page)).toBe(before);
      await page.getByRole('button', { name: /^Redo/ }).click();
      await expect.poll(() => canvasFingerprint(page)).not.toBe(before);

      const beforeColor = await canvasFingerprint(page);
      const colorHistory = await historyIndex(page);
      const trigger = glow.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      const plane = picker.locator('.sniptale-color-plane');
      await plane.click({ position: { x: 80, y: 50 } });
      await expect.poll(() => canvasFingerprint(page)).not.toBe(beforeColor);
      expect(await historyIndex(page)).toBe(colorHistory);
      await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect.poll(() => canvasFingerprint(page)).toBe(beforeColor);
      expect(await historyIndex(page)).toBe(colorHistory);
      await trigger.click();
      await plane.click({ position: { x: 80, y: 50 } });
      await picker.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect.poll(() => historyIndex(page)).toBe(colorHistory + 1);
      await page.screenshot({ path: info.outputPath('shadow-color-applied.png'), fullPage: false });
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(() => canvasFingerprint(page)).toBe(beforeColor);
      await kinds.getByRole('button').nth(2).click();
      await page.locator('[data-ui="editor.frame-panel"] input[type="file"]').setInputFiles({
        name: 'background.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from(source.split(',')[1]!, 'base64'),
      });
      await expect
        .poll(() =>
          page.evaluate(
            () => !!window.__sniptaleEditorHarness!.getInteractionState().frame.backgroundImageData
          )
        )
        .toBe(true);
      const blurRow = page
        .locator(
          '[data-ui="editor.frame-panel"] [data-ui="shared.ui.compact-inspector.numeric-row"]'
        )
        .filter({
          has: page.getByRole('textbox', {
            name: translate('editor.scene.backgroundBlurAmount', 'en'),
            exact: true,
          }),
        });
      await blurRow.scrollIntoViewIfNeeded();
      await blurRow.hover();
      const blurRange = blurRow.locator('input[type="range"]');
      const blurBefore = await canvasFingerprint(page);
      const blurHistory = await historyIndex(page);
      const blurBox = (await blurRange.boundingBox())!;
      await startMetrics(blurRange);
      await page.mouse.move(blurBox.x + 4, blurBox.y + blurBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(blurBox.x + blurBox.width * 0.7, blurBox.y + blurBox.height / 2, {
        steps: 24,
      });
      const blurMetrics = await stopMetrics(page);
      await writeFile(
        info.outputPath('blur-gesture-metrics.json'),
        JSON.stringify(blurMetrics, null, 2)
      );
      await info.attach('blur-gesture-metrics', {
        path: info.outputPath('blur-gesture-metrics.json'),
        contentType: 'application/json',
      });
      expect(blurMetrics.distinct).toBeGreaterThan(8);
      await expect.poll(() => canvasFingerprint(page)).not.toBe(blurBefore);
      expect(await historyIndex(page)).toBe(blurHistory);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Number(
              window
                .__sniptaleEditorHarness!.getCanvasObjects()
                .find((object) => object['sniptaleType'] === 'background')?.['width']
            )
          )
        )
        .toBeLessThanOrEqual(768);
      await page.screenshot({
        path: info.outputPath('background-blur-before-release.png'),
        fullPage: false,
      });
      await page.mouse.up();
      await expect.poll(() => historyIndex(page)).toBe(blurHistory + 1);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Number(
              window
                .__sniptaleEditorHarness!.getCanvasObjects()
                .find((object) => object['sniptaleType'] === 'background')?.['width']
            )
          )
        )
        .toBe(2048);
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(() => canvasFingerprint(page)).toBe(blurBefore);
      await page
        .locator('[data-ui="editor.frame.actions"]')
        .getByRole('button', { name: 'Reset', exact: true })
        .click();
      await expect(kinds.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-ui="editor.frame.padding-fields"]')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
