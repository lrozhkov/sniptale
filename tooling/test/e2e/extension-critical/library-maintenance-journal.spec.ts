import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { createMaintenanceLogEntry } from '../../../../apps/extension/src/composition/persistence/library-lifecycle/maintenance-log-model';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, SETTINGS_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { width: 1280, height: 560, theme: 'dark', locale: 'ru' },
  { width: 1920, height: 900, theme: 'light', locale: 'en' },
  { width: 800, height: 560, theme: 'dark', locale: 'ru' },
  { width: 1023, height: 560, theme: 'dark', locale: 'ru' },
  { width: 1024, height: 560, theme: 'dark', locale: 'ru' },
  { width: 1025, height: 560, theme: 'dark', locale: 'ru' },
] as const) {
  test(`maintenance journal filters and JSONL at ${variant.width}x${variant.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.emulateMedia({ colorScheme: variant.theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const now = Date.now();
    const entries = Array.from({ length: 40 }, (_, index) =>
      createMaintenanceLogEntry(
        {
          operation: index % 2 ? 'physical-delete' : 'trash',
          code: index % 2 ? 'invalid' : 'expired',
          counts: index % 2 ? { retained: 3 } : { deleted: 2 },
          durationMs: 25,
        },
        now - index * 1000
      )
    );
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
          sniptale_library_maintenance_log: { version: 1, entries },
          sniptale_runtime_diagnostic_log: {
            version: 1,
            entries: [
              {
                schemaVersion: 1,
                time: new Date(now).toISOString(),
                lastTime: new Date(now).toISOString(),
                source: 'CaptureDiagnostics',
                context: 'background',
                level: 'debug',
                message: 'Preparing capture',
                repeats: 1,
                dropped: 0,
              },
            ],
          },
        },
      });
      await page.goto(
        `${host.origin}${SETTINGS_HARNESS_PATH}?section=events-logs&theme=${variant.theme}`
      );
      const dialog = page.getByRole('region', { name: label('settings.eventsLogs.title') });
      await expect.poll(() => dialog.locator('tbody tr').count()).toBeGreaterThanOrEqual(40);
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      if (variant.width >= 1024)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(variant.height + 1);
      const exportButton = dialog.getByRole('button', {
        name: label('settings.eventsLogs.export'),
      });
      if (variant.width < 1024) await exportButton.scrollIntoViewIfNeeded();
      await expect(exportButton).toBeInViewport();
      const body = dialog.locator('[data-ui="events.logs.rows"]');
      expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      if (variant.width === 800) {
        expect(await body.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await body.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
          node.scrollTop = node.scrollHeight;
        });
        await expect(exportButton).toBeInViewport();
      }
      await body.evaluate((node) => {
        node.scrollLeft = 0;
        node.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath('journal.png'), fullPage: false });
      await dialog.getByLabel(label('settings.eventsLogs.search'), { exact: true }).fill('invalid');
      await expect(dialog.locator('tbody tr')).toHaveCount(20);
      const downloadReady = page.waitForEvent('download');
      await exportButton.click();
      const download = await downloadReady;
      expect(download.suggestedFilename()).toMatch(/\.jsonl$/);
      const text = await readFile((await download.path())!, 'utf8');
      const lines = text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(lines).toHaveLength(20);
      expect(
        lines.every(
          (entry) =>
            entry.code === 'invalid' && entry.status === 'blocked' && entry.time.endsWith('Z')
        )
      ).toBe(true);
      await dialog.getByLabel(label('settings.eventsLogs.search'), { exact: true }).fill('expired');
      await dialog
        .getByRole('button', { name: label('settings.eventsLogs.status'), exact: true })
        .click();
      await page
        .getByRole('option', {
          name: label('settings.eventsLogs.statuses.completed'),
          exact: true,
        })
        .click();
      await expect(dialog.locator('tbody tr')).toHaveCount(20);
      await dialog
        .getByRole('button', { name: label('settings.eventsLogs.operation'), exact: true })
        .click();
      await page
        .getByRole('option', {
          name: label('settings.eventsLogs.operations.physical-delete'),
          exact: true,
        })
        .click();
      await expect(dialog.locator('tbody tr')).toHaveCount(0);
      await expect(exportButton).toBeDisabled();
      await dialog
        .getByRole('button', { name: label('settings.eventsLogs.operation'), exact: true })
        .click();
      await page.getByRole('option', { name: 'CaptureDiagnostics', exact: true }).click();
      await dialog
        .getByRole('button', { name: label('settings.eventsLogs.status'), exact: true })
        .click();
      await page.getByRole('option', { name: 'debug', exact: true }).click();
      await dialog
        .getByLabel(label('settings.eventsLogs.search'), { exact: true })
        .fill('Preparing capture');
      await expect(dialog.locator('tbody tr')).toHaveCount(1);
      const runtimeDownload = page.waitForEvent('download');
      await exportButton.click();
      const diagnostic = JSON.parse(
        await readFile((await (await runtimeDownload).path())!, 'utf8')
      );
      expect(diagnostic).toMatchObject({
        level: 'debug',
        context: 'background',
        source: 'CaptureDiagnostics',
      });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
