import { writeFile } from 'node:fs/promises';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { readNativeVideoProject } from '../support/native-video-project';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
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

for (const viewport of [
  { width: 1920, height: 900 },
  { width: 1280, height: 560 },
]) {
  test(`native project application preserves Library sources through editor save and restart ${viewport.width}`, async ({}, info) => {
    test.setTimeout(120_000);
    const host = await startHostServer();
    const profile = info.outputPath('application-profile');
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, {
        viewport,
        deviceScaleFactor: 1,
        headless: true,
      });
      const page = await context.newPage();
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
      await page.waitForFunction(() => Boolean(window.syncCaptureHarness));
      const applied = await page.evaluate(() => window.syncCaptureHarness.applicationProof());
      expect(applied).toMatchObject({
        rollback: true,
        retry: true,
        noEcho: true,
        parallel: true,
        causalFence: true,
      });
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${applied.projectId}&theme=light`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const pixels = async () =>
        page.locator('[data-preview-stage-canvas]').evaluate((node) => {
          if (!(node instanceof HTMLCanvasElement))
            throw new Error('The editor preview is not a canvas.');
          const context = node.getContext('2d');
          if (!context) throw new Error('The editor preview context is unavailable.');
          return [0.25, 0.75].map((x) =>
            Array.from(
              context.getImageData(Math.floor(node.width * x), Math.floor(node.height / 2), 1, 1)
                .data
            )
          );
        });
      await expect
        .poll(async () => {
          const [privatePixel, borrowedPixel] = await pixels();
          return (
            privatePixel![0]! > 200 &&
            privatePixel![1]! < 120 &&
            borrowedPixel![1]! > 150 &&
            borrowedPixel![0]! < 80
          );
        })
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('native-applied-editor.png'),
        fullPage: false,
      });
      const clip = page.locator(`[data-project-timeline-clip="${applied.clipId}"]`);
      await clip.click();
      await page.keyboard.press('Delete');
      await expect(clip).toHaveCount(0);
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.some((item) => item.id === applied.clipId)
        )
        .toBe(false);
      await page.keyboard.press('Control+z');
      await expect(clip).toHaveCount(1);
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.some((item) => item.id === applied.clipId)
        )
        .toBe(true);
      const proofPage = await context.newPage();
      await applyHarnessBootstrap(proofPage, { preserveMediaLibrary: true });
      await proofPage.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
      await proofPage.waitForFunction(() => Boolean(window.syncCaptureHarness));
      const after = await proofPage.evaluate(
        ({ projectId, mediaId }) =>
          window.syncCaptureHarness.applicationAfterEditorProof(projectId, mediaId),
        applied
      );
      expect(after).toMatchObject({
        captured: true,
        usage: true,
        cascade: true,
        delayedWriterRefused: true,
      });
      expect(after.backupHashes).toEqual(expect.arrayContaining(applied.expectedHashes));
      const persisted = await proofPage.evaluate(() => window.syncCaptureHarness.changes());
      await context.close();
      context = await chromium.launchPersistentContext(profile, {
        viewport,
        deviceScaleFactor: 1,
        headless: true,
      });
      const restarted = await context.newPage();
      await applyHarnessBootstrap(restarted, { preserveMediaLibrary: true });
      await restarted.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
      await restarted.waitForFunction(() => Boolean(window.syncCaptureHarness));
      expect(await restarted.evaluate(() => window.syncCaptureHarness.changes())).toEqual(
        persisted
      );
      expect(
        await restarted.evaluate(
          (projectId) => window.syncCaptureHarness.verifyAppliedSourcePersistence(projectId),
          applied.projectId
        )
      ).toEqual(expect.arrayContaining(applied.expectedHashes));
      await writeFile(
        info.outputPath('application-proof.json'),
        JSON.stringify({ applied, after, fullBrowserRestart: true }, null, 2)
      );
    } finally {
      await context?.close();
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('native media source revision crosses isolated browser profiles and survives restart', async ({}, info) => {
  test.setTimeout(120_000);
  const host = await startHostServer();
  let context: BrowserContext | undefined;
  const targetProfile = info.outputPath('media-target-profile');
  const options = { viewport: { width: 1920, height: 900 }, deviceScaleFactor: 1, headless: true };
  try {
    context = await chromium.launchPersistentContext(
      info.outputPath('media-source-profile'),
      options
    );
    const source = await context.newPage();
    await applyHarnessBootstrap(source, { preserveMediaLibrary: true });
    await source.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
    await source.waitForFunction(() => Boolean(window.syncCaptureHarness));
    const payload = await source.evaluate(() => window.syncCaptureHarness.mediaSourceProof());
    await context.close();
    context = await chromium.launchPersistentContext(targetProfile, options);
    const target = await context.newPage();
    await applyHarnessBootstrap(target, { preserveMediaLibrary: true });
    await target.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
    await target.waitForFunction(() => Boolean(window.syncCaptureHarness));
    const admitted = await target.evaluate(
      (payload) => window.syncCaptureHarness.mediaReplicaProof(payload),
      payload
    );
    expect(admitted).toMatchObject({
      rollback: true,
      parallel: true,
      duplicate: true,
      noEcho: true,
      actualNativeSource: true,
    });
    expect(admitted.hash).toBe(payload.hash);
    await context.close();
    context = await chromium.launchPersistentContext(targetProfile, options);
    const restarted = await context.newPage();
    await applyHarnessBootstrap(restarted, { preserveMediaLibrary: true });
    await restarted.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
    await restarted.waitForFunction(() => Boolean(window.syncCaptureHarness));
    const persisted = await restarted.evaluate(
      (id) => window.syncCaptureHarness.verifyMediaReplicaPersistence(id),
      admitted.mediaId
    );
    expect(persisted.hash).toBe(payload.hash);
    expect(persisted.basis).toHaveLength(1);
    await writeFile(
      info.outputPath('media-replica-proof.json'),
      JSON.stringify({ admitted, persisted, isolatedProfiles: true }, null, 2)
    );
  } finally {
    await context?.close();
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('prepared replica recovery survives restart before and after native commit', async ({}, info) => {
  test.setTimeout(120_000);
  const host = await startHostServer();
  let context: BrowserContext | undefined;
  const options = { viewport: { width: 1920, height: 900 }, deviceScaleFactor: 1, headless: true };
  try {
    context = await chromium.launchPersistentContext(
      info.outputPath('recovery-source-profile'),
      options
    );
    const source = await context.newPage();
    await applyHarnessBootstrap(source, { preserveMediaLibrary: true });
    await source.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
    await source.waitForFunction(() => Boolean(window.syncCaptureHarness));
    const payload = await source.evaluate(() => window.syncCaptureHarness.mediaSourceProof());
    await context.close();
    const results = [];
    for (const commitBeforeRestart of [false, true]) {
      const profile = info.outputPath(
        commitBeforeRestart ? 'recovery-committed-profile' : 'recovery-prepared-profile'
      );
      context = await chromium.launchPersistentContext(profile, options);
      const page = await context.newPage();
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
      await page.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
      await page.waitForFunction(() => Boolean(window.syncCaptureHarness));
      const staged = await page.evaluate(
        ({ payload, commitBeforeRestart }) =>
          window.syncCaptureHarness.stageMediaReplicaForRecovery(payload, commitBeforeRestart),
        { payload, commitBeforeRestart }
      );
      await context.close();
      context = await chromium.launchPersistentContext(profile, options);
      const restarted = await context.newPage();
      await applyHarnessBootstrap(restarted, { preserveMediaLibrary: true });
      await restarted.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
      await restarted.waitForFunction(() => Boolean(window.syncCaptureHarness));
      const recovered = await restarted.evaluate(
        ({ mediaId, journalId }) =>
          window.syncCaptureHarness.recoverMediaReplicaProof(mediaId, journalId),
        staged
      );
      expect(recovered).toMatchObject({
        hash: payload.hash,
        noEcho: true,
        stableReplay: true,
        journalSettled: true,
        cleanupWithHeldPermit: true,
      });
      expect(recovered.basis).toEqual([payload.capture.operationId]);
      results.push({ staged, recovered, fullBrowserRestart: true });
      await context.close();
    }
    await writeFile(
      info.outputPath('replica-recovery-proof.json'),
      JSON.stringify(results, null, 2)
    );
  } finally {
    await context?.close();
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('native outgoing bytes survive concurrent preparation, recreation and restart', async ({}, info) => {
  test.setTimeout(120_000);
  const host = await startHostServer();
  const profile = info.outputPath('outgoing-profile');
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
    const source = await page.evaluate(() => window.syncCaptureHarness.mediaSourceProof());
    const left = await page.evaluate(
      (capture) => window.syncCaptureHarness.outgoing.draft(capture, 'left'),
      source.capture
    );
    const right = await page.evaluate(
      (capture) => window.syncCaptureHarness.outgoing.draft(capture, 'right'),
      source.capture
    );
    const peer = await context.newPage();
    await applyHarnessBootstrap(peer, { preserveMediaLibrary: true });
    await peer.goto(`${host.origin}/tooling/test/harness/sync-capture.html`);
    await peer.waitForFunction(() => Boolean(window.syncCaptureHarness));
    const [first, second] = await Promise.all([
      page.evaluate(
        ({ capture, draft }) => window.syncCaptureHarness.outgoing.commit(capture, draft),
        { capture: source.capture, draft: left }
      ),
      peer.evaluate(
        ({ capture, draft }) => window.syncCaptureHarness.outgoing.commit(capture, draft),
        { capture: source.capture, draft: right }
      ),
    ]);
    expect(second).toEqual(first);
    expect([left.recordText, right.recordText]).toContain(first.recordText);
    const recreated = await page.evaluate(
      (capture) => window.syncCaptureHarness.outgoing.recreate(capture),
      source.capture
    );
    const late = await page.evaluate(
      (capture) => window.syncCaptureHarness.outgoing.draft(capture, 'late'),
      source.capture
    );
    expect(
      await page.evaluate(
        ({ capture, draft }) => window.syncCaptureHarness.outgoing.commit(capture, draft),
        { capture: source.capture, draft: late }
      )
    ).toEqual(first);
    const newDraft = await page.evaluate(
      (capture) => window.syncCaptureHarness.outgoing.draft(capture, 'recreated'),
      recreated
    );
    const newRecord = await page.evaluate(
      ({ capture, draft }) => window.syncCaptureHarness.outgoing.commit(capture, draft),
      { capture: recreated, draft: newDraft }
    );
    expect(newRecord.operationId).not.toBe(first.operationId);
    expect(newRecord.generation).toBeGreaterThan(first.generation);
    expect(newRecord.objects[0]!.ref.assetId).not.toBe(first.objects[0]!.ref.assetId);
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
    const restored = await restarted.evaluate(
      ({ spaceId, operationId }) => window.syncCaptureHarness.outgoing.verify(spaceId, operationId),
      first
    );
    const restoredNew = await restarted.evaluate(
      ({ spaceId, operationId }) => window.syncCaptureHarness.outgoing.verify(spaceId, operationId),
      newRecord
    );
    expect(restored.record).toEqual(first);
    expect(restoredNew.record).toEqual(newRecord);
    expect(restored.files).toEqual([{ size: source.bytes.length, sha256: source.hash }]);
    expect(restoredNew.files).toEqual(restored.files);
    await writeFile(
      info.outputPath('outgoing-proof.json'),
      JSON.stringify(
        { first, newRecord, restored, restoredNew, parallel: true, fullBrowserRestart: true },
        null,
        2
      )
    );
  } finally {
    await context?.close();
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
