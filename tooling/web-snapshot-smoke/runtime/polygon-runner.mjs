import { chromium } from 'playwright';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectExternalTargets } from '../support/external-targets.mjs';
import { SmokeTargetSkippedError } from '../support/page-preparation.mjs';
import { verifyExternalTarget } from '../assertions/polygon-verification.mjs';
import { enableWebSnapshotsForSmoke } from './popup-driver.mjs';

const args = process.argv.slice(2);
if (args.includes('--fixtures')) {
  const { runFixtureSmoke } = await import('./runner.mjs');
  await runFixtureSmoke();
} else {
  const optionValue = (name) => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return value;
  };
  const unknown = args.filter(
    (value, index) =>
      value !== '--extended' && value !== '--target' && args[index - 1] !== '--target'
  );
  if (unknown.length > 0) throw new Error(`Unknown smoke option: ${unknown.join(', ')}`);

  const root = process.cwd();
  const out = join(root, '.tmp/web-snapshot-smoke/results');
  await rm(out, { force: true, recursive: true });
  await mkdir(out, { recursive: true });
  const targets = selectExternalTargets({
    extended: args.includes('--extended'),
    targetId: optionValue('--target'),
  });
  const userDataDir = await mkdtemp(join(tmpdir(), 'sniptale-web-copy-polygon-profile-'));
  const unpackedDir = await mkdtemp(join(tmpdir(), 'sniptale-web-copy-polygon-extension-'));
  await cp(join(root, 'dist'), unpackedDir, { recursive: true });
  const manifestPath = join(unpackedDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), '<all_urls>'])];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--enable-unsafe-extension-debugging',
    ],
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { height: 800, width: 1280 },
  });
  const report = { generatedAt: new Date().toISOString(), results: [] };
  try {
    const session = await context.browser().newBrowserCDPSession();
    const loaded = await session.send('Extensions.loadUnpacked', { path: unpackedDir });
    await session.detach();
    const popup = await context.newPage();
    await popup.setViewportSize({ height: 560, width: 392 });
    await popup.goto(`chrome-extension://${loaded.id}/apps/extension/src/popup/index.html`);
    await enableWebSnapshotsForSmoke(popup);

    for (const descriptor of targets) {
      const startedAt = Date.now();
      try {
        const metrics = await verifyExternalTarget({
          context,
          descriptor,
          extensionId: loaded.id,
          out,
          popup,
        });
        const result = { durationMs: Date.now() - startedAt, id: descriptor.id, ...metrics };
        report.results.push(result);
        const label = metrics.status === 'passed' ? 'PASS' : 'FAIL';
        const detail =
          metrics.status === 'passed'
            ? `diff ${(metrics.pixel.changedPixelRatio * 100).toFixed(1)}%`
            : metrics.failures.join(', ');
        process.stdout.write(`${label} ${descriptor.id.padEnd(29)} ${detail}\n`);
      } catch (error) {
        const skipped = error instanceof SmokeTargetSkippedError;
        const result = {
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
          id: descriptor.id,
          status: skipped ? 'skipped' : 'failed',
          url: descriptor.url,
        };
        report.results.push(result);
        const targetOut = join(out, descriptor.id);
        await mkdir(targetOut, { recursive: true });
        await writeFile(join(targetOut, 'metrics.json'), `${JSON.stringify(result, null, 2)}\n`);
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(
          `${skipped ? 'SKIP' : 'FAIL'} ${descriptor.id.padEnd(29)} ${message}\n`
        );
      }
    }
    await popup.close();
  } finally {
    await writeFile(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await context.close();
    await rm(userDataDir, { force: true, recursive: true });
    await rm(unpackedDir, { force: true, recursive: true });
  }
  const failures = report.results.filter((result) => result.status === 'failed');
  if (failures.length > 0) process.exitCode = 1;
  process.stdout.write(`Report: ${join(out, 'report.json')}\n`);
}
