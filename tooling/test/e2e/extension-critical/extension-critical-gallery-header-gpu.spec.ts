import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { sanitizeStructuredDiagnosticExportData } from '../../../../packages/platform/src/observability/diagnostics/sanitizer';
import type { GpuWindowJoinReport } from '../../harness/gpu-window-join';
import { startHostServer } from '../support/host-server';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';

enableGpuPreviewProof();
test.use({ trace: 'off', screenshot: 'off' });

test('GPU header joins remain opaque under fractional 3D projection in both editors', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.goto(`${host.origin}/tooling/test/harness/gallery.html?gpuWindowJoinFixture=1`);
    await expect
      .poll(() => page.evaluate(() => typeof window.gpuWindowJoinFixture?.run))
      .toBe('function');
    const report: GpuWindowJoinReport = await page.evaluate(async () => {
      const fixture = window.gpuWindowJoinFixture;
      if (!fixture) throw new Error('E_JOIN_FIXTURE_NOT_READY');
      return fixture.run();
    });
    const metricsPath = info.outputPath('gpu-window-join-metrics.json');
    await writeFile(metricsPath, JSON.stringify(sanitizeStructuredDiagnosticExportData(report)));
    await info.attach('gpu-window-join-metrics', {
      contentType: 'application/json',
      path: metricsPath,
    });
    expect(report.rows.map((row) => `${row.editor}:${row.variant}`)).toEqual([
      'Gallery:direct',
      'Native:direct',
      'Native:orientation',
      'Native:depth',
      'Native:crop-orientation',
      'Native:crop-inner',
    ]);
    for (const row of report.rows) {
      expect(row.headerAlpha.samples).toBeGreaterThan(0);
      if (row.editor === 'Native') {
        expect(row.headerUploads).toBeGreaterThan(0);
        expect(row.maxHeaderSourcesPerRender).toBe(1);
        expect(row.uploadedHeaderAlpha?.samples).toBeGreaterThan(0);
        expect(row.uploadedHeaderAlpha?.joinMinimum).toBe(row.headerAlpha.joinMinimum);
        expect(row.uploadedHeaderAlpha?.joinMaximum).toBe(row.headerAlpha.joinMaximum);
        expect(row.activeDepth).toBe(row.variant === 'depth');
        expect(row.activeCrop).toBe(
          row.variant === 'crop-orientation' || row.variant === 'crop-inner'
        );
        expect(row.activeOrientation).toBe(
          row.variant === 'orientation' || row.variant === 'crop-orientation'
        );
        expect(row.activeInnerTransform).toBe(row.variant === 'crop-inner');
      }
      const needsColor = row.variant === 'crop-orientation' || row.variant === 'crop-inner';
      expect(row.colors.map((color) => color.name)).toEqual(
        needsColor ? ['header-source-invariance', 'video-color', 'alternate-video-color'] : []
      );
      for (const color of row.colors) {
        expect(color.pixels, `${row.variant} ${color.name} samples`).toBeGreaterThan(0);
        expect(
          color.maxExpectedDifference,
          `${row.variant} ${color.name} error`
        ).toBeLessThanOrEqual(1);
        expect(color.wrongPixels).toBe(0);
      }
      expect(row.metrics.map((metric) => metric.name)).toEqual([
        'internal-join',
        'header-interior',
        'video-interior',
      ]);
      for (const metric of row.metrics) {
        expect(metric.pixels, `${row.editor} ${metric.name} sample count`).toBeGreaterThan(0);
        expect(
          metric.maxBackdropDifference,
          `${row.editor} ${metric.name} backdrop delta`
        ).toBeLessThanOrEqual(1);
        expect(metric.changedPixels, `${row.editor} ${metric.name} contaminated pixels`).toBe(0);
      }
    }
    expect(report.sampler.map((row) => row.filtered)).toEqual([false, true]);
    for (const row of report.sampler) {
      expect(row.edgeDifference).toBeLessThanOrEqual(1);
      expect(row.interiorAlpha).toBeGreaterThanOrEqual(127);
      expect(row.interiorAlpha).toBeLessThanOrEqual(129);
      expect(row.edgeAlpha).toBeGreaterThanOrEqual(127);
      expect(row.edgeAlpha).toBeLessThanOrEqual(129);
      expect(row.exteriorAlpha).toBe(0);
      expect(row.clippedAlpha).toBe(0);
      expect(row.hardClipAlpha).toBeGreaterThanOrEqual(127);
      expect(row.hardClipAlpha).toBeLessThanOrEqual(129);
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
