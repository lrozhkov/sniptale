import { writeFile } from 'node:fs/promises';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap } from '../extension-critical.helpers';
import type {} from '../../harness/sync-capture';

test('native capture commits accepted revisions and retains frozen source bytes', async ({}, info) => {
  test.setTimeout(120_000);
  const host = await startHostServer();
  const profile = info.outputPath('browser-profile');
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, {
      viewport: { width: 1920, height: 900 },
      deviceScaleFactor: 1,
      headless: true,
    });
    const page = await context.newPage();
    await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
    await page.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
    await page.waitForFunction(() => Boolean(window.syncCaptureHarness));
    const saved = await page.evaluate(() => window.syncCaptureHarness.saveProof());
    expect(saved).toMatchObject({ rollback: true, parallel: true, recreation: true });
    const exported = await page.evaluate(() => window.syncCaptureHarness.exportProof());
    expect(exported).toEqual({ replay: true, frozen: true });
    const cascade = await page.evaluate(() => window.syncCaptureHarness.cascadeProof());
    expect(cascade).toEqual({ rollback: true, detach: true, tombstone: true });
    const frozen = await page.evaluate(() => window.syncCaptureHarness.frozenProof());
    expect(frozen.metadata).toContain('Frozen revision N');
    expect(frozen.hashes).toContain(frozen.sourceHash);
    const provenance = await page.evaluate(() => window.syncCaptureHarness.provenanceProof());
    expect(provenance).toEqual({ rollback: true, noEcho: true, retry: true, basis: true });
    const restore = await page.evaluate(() => window.syncCaptureHarness.restoreProof());
    expect(restore).toMatchObject({
      checkpointAtomic: true,
      localCapture: true,
      skipNoCapture: true,
    });
    const persisted = await page.evaluate(() => window.syncCaptureHarness.changes());
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      viewport: { width: 1920, height: 900 },
      deviceScaleFactor: 1,
      headless: true,
    });
    const restarted = await context.newPage();
    await applyHarnessBootstrap(restarted, { preserveMediaLibrary: true });
    await restarted.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
    await restarted.waitForFunction(() => Boolean(window.syncCaptureHarness));
    expect(await restarted.evaluate(() => window.syncCaptureHarness.changes())).toEqual(persisted);
    expect(
      await restarted.evaluate(
        (rootId) => window.syncCaptureHarness.verifyFrozenPersistence(rootId),
        frozen.projectId
      )
    ).toEqual({ metadata: frozen.metadata, hashes: frozen.hashes });
    await writeFile(
      info.outputPath('capture-proof.json'),
      JSON.stringify(
        { saved, exported, cascade, frozen, provenance, restore, fullBrowserRestart: true },
        null,
        2
      )
    );
    // Preserve the identical-restore observation before applying the scope's stale-writer criterion.
    expect(restore.oldWriterAccepted, 'The old editor must not inherit a restored identity').toBe(
      false
    );
  } finally {
    await context?.close();
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
