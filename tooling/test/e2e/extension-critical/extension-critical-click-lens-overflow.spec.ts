import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { sanitizeStructuredDiagnosticExportData } from '../../../../packages/platform/src/observability/diagnostics/sanitizer';
import type { ClickLensOverflowReport } from '../../harness/click-lens-overflow';
import { startHostServer } from '../support/host-server';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';

enableGpuPreviewProof();
test.use({ trace: 'off', screenshot: 'off' });

test('click lenses cross video edges and retain projected overflow in both editors', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const host = await startHostServer();
  try {
    await page.goto(`${host.origin}/tooling/test/harness/gallery.html?clickLensOverflowFixture=1`);
    await expect
      .poll(() => page.evaluate(() => typeof window.clickLensOverflowFixture?.run))
      .toBe('function');
    const report: ClickLensOverflowReport = await page.evaluate(async () => {
      if (!window.clickLensOverflowFixture) throw new Error('E_LENS_FIXTURE_NOT_READY');
      return window.clickLensOverflowFixture.run();
    });
    const path = info.outputPath('click-lens-overflow.json');
    await writeFile(path, JSON.stringify(sanitizeStructuredDiagnosticExportData(report)));
    await info.attach('click-lens-overflow', { path, contentType: 'application/json' });
    expect(report.rows).toHaveLength(12);
    for (const editor of ['Gallery', 'Native'])
      for (const backend of ['legacy', 'gpu'])
        expect(
          report.rows
            .filter((row) => row.editor === editor && row.backend === backend)
            .map((row) => row.variant)
        ).toEqual(['edge', 'projected-overflow', 'cropped-header']);
    for (const row of report.rows) {
      expect(row.samples, `${row.editor}/${row.backend}/${row.variant} samples`).toBeGreaterThan(0);
      expect(
        row.changedOutside,
        `${row.editor}/${row.backend}/${row.variant} overflow`
      ).toBeGreaterThan(0);
      expect(row.maxDifference).toBeGreaterThan(12);
      if (row.editor === 'Gallery' && row.variant === 'edge') {
        expect(row.transparentSamples).toBe(25);
        expect(row.transparentDifference).toBeLessThanOrEqual(2);
      }
      expect({ width: row.width, height: row.height }).toEqual({ width: 1100, height: 720 });
    }
    for (const backend of ['legacy', 'gpu']) {
      await page
        .locator(`canvas[data-lens-overflow="Gallery-${backend}"]`)
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`gallery-${backend}-overflow.png`),
        fullPage: false,
      });
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
