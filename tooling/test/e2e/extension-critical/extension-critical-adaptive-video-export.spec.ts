import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, OFFSCREEN_HARNESS_PATH } from '../extension-critical.helpers';

for (const editor of ['quick', 'full'] as const)
  for (const format of ['mp4', 'webm'] as const) {
    test(`${editor} adaptive ${format} preserves pulse, motion, audio and selected tail`, async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const host = await startHostServer();
      try {
        await applyHarnessBootstrap(page);
        await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
        await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
        for (const fragment of [false, true]) {
          const result = await page.evaluate(
            async ({ editor, format, fragment }) =>
              window.__sniptaleOffscreenHarness!.adaptiveExportProof(
                editor,
                format,
                fragment,
                fragment
              ),
            { editor, format, fragment }
          );
          await info.attach(
            `${editor}-${format}-${fragment ? 'fragment-audio' : 'whole-silent'}.json`,
            { body: JSON.stringify(result, null, 2), contentType: 'application/json' }
          );
          await writeFile(
            info.outputPath(`${editor}-${format}-${fragment}.json`),
            JSON.stringify(result, null, 2)
          );
          const { adaptive, constant } = result;
          expect(adaptive.packets.length).toBeLessThan(constant.packets.length * 0.8);
          const expectedEnd = 2.223 - (fragment ? 0.137 : 0);
          if (format === 'webm' && fragment) {
            // Opus ends on codec blocks; compare unchanged audio/container padding to CFR.
            expect(Math.abs(adaptive.metadataDuration! - constant.metadataDuration!)).toBeLessThan(
              0.0021
            );
            expect(Math.abs(adaptive.metadataDuration! - expectedEnd)).toBeLessThan(0.0201);
          } else {
            expect(
              Math.abs(
                (format === 'webm' ? adaptive.metadataDuration! : adaptive.videoDuration) -
                  expectedEnd
              )
            ).toBeLessThan(format === 'webm' ? 0.0021 : 0.00003);
          }
          expect(adaptive.packets[0]!.timestamp).toBe(0);
          const gaps = adaptive.packets
            .slice(1)
            .map((packet, i) => packet.timestamp - adaptive.packets[i]!.timestamp);
          expect(Math.max(...gaps)).toBeLessThanOrEqual(0.201);
          expect(Math.max(...gaps)).toBeGreaterThan(0.15);
          expect(Math.min(...gaps)).toBeGreaterThan(0);
          expect(gaps.some((gap) => gap < 0.018)).toBe(true);
          // An overlay-only pulse in full editor and a one-frame source pulse in quick editor.
          expect(adaptive.colors[1]![0]).toBeGreaterThan(180);
          expect(adaptive.colors[0]![0]! - adaptive.colors[0]![1]!).toBeLessThan(20);
          expect(adaptive.colors[2]![0]! - adaptive.colors[2]![1]!).toBeLessThan(20);
          for (let i = 0; i < adaptive.colors.length; i++)
            expect(Math.abs(adaptive.colors[i]![0]! - constant.colors[i]![0]!)).toBeLessThan(15);
          if (fragment)
            expect(Math.abs(adaptive.audioDuration! - constant.audioDuration!)).toBeLessThan(
              0.0021
            );
        }
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }

test('4K readback benchmark distinguishes still and changing frames', async ({ page }, info) => {
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page);
    await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
    await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
    const rows = await page.evaluate(() =>
      window.__sniptaleOffscreenHarness!.adaptiveReadbackProof()
    );
    await writeFile(info.outputPath('4k-readback.json'), JSON.stringify(rows, null, 2));
    await info.attach('4k-readback.json', {
      body: JSON.stringify(rows),
      contentType: 'application/json',
    });
    expect(rows[0]!.emitted).toBeGreaterThanOrEqual(5);
    expect(rows[0]!.emitted).toBeLessThanOrEqual(60);
    expect(rows[1]!.emitted).toBe(60);
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

for (const editor of ['quick', 'full'] as const)
  test(`${editor} adaptive export performance at desktop resolutions`, async ({ page }, info) => {
    test.setTimeout(240_000);
    const host = await startHostServer();
    try {
      await applyHarnessBootstrap(page);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const rows = [];
      for (const [width, height] of [
        [1920, 1172],
        [3840, 2160],
      ] as const) {
        const result = await page.evaluate(
          async ({ editor, width, height }) =>
            window.__sniptaleOffscreenHarness!.adaptiveExportProof(
              editor,
              'mp4',
              false,
              false,
              width,
              height
            ),
          { editor, width, height }
        );
        expect(result.adaptive.packets.length).toBeLessThanOrEqual(result.constant.packets.length);
        for (let i = 0; i < result.adaptive.colors.length; i++)
          expect(
            Math.abs(result.adaptive.colors[i]![0]! - result.constant.colors[i]![0]!)
          ).toBeLessThan(15);
        rows.push({ width, height, adaptiveMs: result.adaptiveMs, constantMs: result.constantMs });
      }
      await writeFile(info.outputPath('performance.json'), JSON.stringify(rows, null, 2));
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
