import { expect, test, chromium, type Browser, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { resolveBrowserViewport } from '../support/browser-viewport';
import type * as RecoveryProbe from '../support/recording-recovery-probe';

type ProbeWindow = typeof window & { recordingRecoveryProbe: typeof RecoveryProbe };

async function bundleProbe() {
  const bundled = await build({
    entryPoints: ['tooling/test/e2e/support/recording-recovery-probe.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'recordingRecoveryProbe',
    write: false,
    platform: 'browser',
  });
  return bundled.outputFiles[0]!.text;
}

async function attachProbe(page: Page, code: string) {
  await page.evaluate(
    `${code}\nReflect.set(globalThis, 'recordingRecoveryProbe', recordingRecoveryProbe);`
  );
}

async function killBrowser(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = once(child, 'exit');
  process.kill(-child.pid, 'SIGKILL');
  await exited;
}

async function launchCrashBrowser(profile: string) {
  await rm(join(profile, 'DevToolsActivePort'), { force: true });
  const child = spawn(
    chromium.executablePath(),
    [
      '--headless=new',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--enable-unsafe-extension-debugging',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' }
  );
  let browser: Browser | undefined;
  try {
    let port: string | undefined;
    await expect
      .poll(async () => {
        try {
          port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
          return Boolean(port);
        } catch {
          return false;
        }
      })
      .toBe(true);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0]!;
    const session = await browser.newBrowserCDPSession();
    const loaded: { id?: unknown } = await session.send('Extensions.loadUnpacked', {
      path: resolve(process.env.SNIPTALE_EXTENSION_BUILD_DIR ?? 'dist'),
    });
    await session.detach();
    if (typeof loaded.id !== 'string') throw new Error('Recovery proof extension did not load.');
    const page = await context.newPage();
    await page.setViewportSize(resolveBrowserViewport());
    await page.goto(`chrome-extension://${loaded.id}/apps/extension/src/gallery/index.html`);
    await page.bringToFront();
    return { child, browser, page };
  } catch (error) {
    await killBrowser(child);
    throw error;
  }
}

for (const container of ['mp4', 'webm'] as const) {
  test(`acknowledged ${container} survives SIGKILL and produces a playable recovery without consuming originals`, async ({}, info) => {
    test.setTimeout(120000);
    const code = await bundleProbe();
    const profile = await mkdtemp(join(tmpdir(), 'sniptale-recovery-proof-'));
    let running: Awaited<ReturnType<typeof launchCrashBrowser>> | undefined;
    try {
      running = await launchCrashBrowser(profile);
      await attachProbe(running.page, code);
      const id = await running.page.evaluate(
        async (container) =>
          (window as ProbeWindow).recordingRecoveryProbe.startRecording(container),
        container
      );
      await expect
        .poll(
          () =>
            running!.page.evaluate(() =>
              (window as ProbeWindow).recordingRecoveryProbe.observedFrames()
            ),
          { timeout: 20000 }
        )
        .toBeGreaterThanOrEqual(90);
      await expect
        .poll(
          () =>
            running!.page.evaluate(
              async (id) => (window as ProbeWindow).recordingRecoveryProbe.progress(id),
              id
            ),
          { timeout: 20000 }
        )
        .toMatchObject({ count: expect.any(Number) });
      await expect
        .poll(
          async () => {
            const progress = await running!.page.evaluate(
              async (id) => (window as ProbeWindow).recordingRecoveryProbe.progress(id),
              id
            );
            return progress.count;
          },
          { timeout: 20000 }
        )
        .toBeGreaterThanOrEqual(3);
      const count = (
        await running.page.evaluate(
          async (id) => (window as ProbeWindow).recordingRecoveryProbe.progress(id),
          id
        )
      ).count;
      const before = await running.page.evaluate(
        async ({ id, count }) =>
          (window as ProbeWindow).recordingRecoveryProbe.committedDigest(id, count),
        { id, count }
      );
      const observedSourceSeconds = await running.page.evaluate(() =>
        (window as ProbeWindow).recordingRecoveryProbe.observedRecordingDuration()
      );
      await killBrowser(running.child);
      running = await launchCrashBrowser(profile);
      await attachProbe(running.page, code);
      const after = await running.page.evaluate(
        async ({ id, count }) =>
          (window as ProbeWindow).recordingRecoveryProbe.committedDigest(id, count),
        { id, count }
      );
      expect(after).toEqual(before);
      await running.page.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.appendIncompleteSuffix(id),
        id
      );
      const rawBefore = await running.page.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.rawDigest(id),
        id
      );
      const recovered = await running.page.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.restoreAndDecode(id),
        id
      );
      expect(recovered.frames).toBeGreaterThan(10);
      expect(recovered.duration).toBeGreaterThan(0.5);
      const rawAfter = await running.page.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.rawDigest(id),
        id
      );
      expect(rawAfter).toEqual(rawBefore);
      const proofPath = info.outputPath('recovery-proof.json');
      await writeFile(
        proofPath,
        JSON.stringify(
          {
            container,
            before,
            after,
            recovered,
            originalRetained: rawAfter,
            observedSourceSeconds,
            observedUnsavedTailSeconds: Math.max(0, observedSourceSeconds - recovered.duration),
          },
          null,
          2
        )
      );
      await info.attach('recovery-proof', { path: proofPath, contentType: 'application/json' });
    } finally {
      if (running) await killBrowser(running.child);
      await rm(profile, { recursive: true, force: true });
    }
  });
}

test('Gallery exposes only interrupted video, retains downloads, and removes completed recovery', async ({}, info) => {
  test.setTimeout(90000);
  const launched = await launchExtensionBrowser({ viewport: resolveBrowserViewport() });
  try {
    const page = await launched.context.newPage();
    await page.goto(
      `chrome-extension://${launched.extensionId}/apps/extension/src/gallery/index.html`
    );
    await attachProbe(page, await bundleProbe());
    const id = await page.evaluate(async () =>
      (window as ProbeWindow).recordingRecoveryProbe.startRecording('webm', 'media-recorder')
    );
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(
              async (id) => (window as ProbeWindow).recordingRecoveryProbe.progress(id),
              id
            )
          ).count,
        { timeout: 20000 }
      )
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(async () => (window as ProbeWindow).recordingRecoveryProbe.failRecording());
    await page.reload();
    const panel = page.locator('[data-ui="gallery.recording-recovery"]');
    await expect(panel).toBeVisible();
    const summary = panel.locator('summary');
    await summary.click();
    await expect(
      panel.getByRole('button', { name: /Recover to library|Восстановить в библиотеку/ })
    ).toBeHidden();
    await summary.press('Enter');
    await expect(panel.getByText('Recovery webm.webm', { exact: true })).toBeVisible();
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 1000, height: 560 });
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    if (viewport) await page.setViewportSize(viewport);
    await page.screenshot({ path: info.outputPath('interrupted-recording.png'), fullPage: false });
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: /Download original|Скачать исходные/i }).click();
    const downloaded = await download;
    expect(await downloaded.failure()).toBeNull();
    await expect(panel.getByText('Recovery webm.webm', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: /^Delete recording$|^Удалить запись$/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.evaluate(async (element) => {
      await Promise.all(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished)
      );
    });
    await page.screenshot({ path: info.outputPath('delete-confirmation.png'), fullPage: false });
    await dialog.getByRole('button', { name: /^Cancel$|^Отмена$/ }).click();
    await expect(panel.getByText('Recovery webm.webm', { exact: true })).toBeVisible();
    await panel
      .getByRole('button', { name: /Recover to library|Восстановить в библиотеку/ })
      .click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText('Your Library is empty');
    await page.reload();
    await expect(
      page.getByRole('main').getByRole('group', { name: 'Recovery webm.webm', exact: true })
    ).toBeVisible();
    await expect(panel).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('completed-recovery.png'), fullPage: false });
    await attachProbe(page, await bundleProbe());
    await recordNativeVideo(page);
    await page.evaluate(async () => (window as ProbeWindow).recordingRecoveryProbe.failRecording());
    await page.reload();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /^Delete recording$|^Удалить запись$/ }).click();
    await dialog.getByRole('button', { name: /^Delete recording$|^Удалить запись$/ }).click();
    await expect(panel).toHaveCount(0);
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});

async function recordNativeVideo(page: Page) {
  const id = await page.evaluate(async () =>
    (window as ProbeWindow).recordingRecoveryProbe.startRecording('webm', 'media-recorder')
  );
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(
            async (id) => (window as ProbeWindow).recordingRecoveryProbe.progress(id),
            id
          )
        ).count,
      { timeout: 20000 }
    )
    .toBeGreaterThanOrEqual(2);
  return id;
}

for (const fault of ['missing', 'truncated'] as const) {
  test(`successful recording needs no cleanup and survives a ${fault} canonical file`, async ({}, info) => {
    test.setTimeout(90000);
    const launched = await launchExtensionBrowser({ viewport: resolveBrowserViewport() });
    try {
      const page = await launched.context.newPage();
      await page.goto(
        `chrome-extension://${launched.extensionId}/apps/extension/src/gallery/index.html`
      );
      const code = await bundleProbe();
      await attachProbe(page, code);
      const id = await recordNativeVideo(page);
      await page.evaluate(async () =>
        (window as ProbeWindow).recordingRecoveryProbe.saveActiveRecording()
      );
      const before = await page.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.rawDigest(id),
        id
      );
      expect(before.size).toBeGreaterThan(0);
      expect(
        await page.evaluate(() =>
          (window as ProbeWindow).recordingRecoveryProbe.listRecoverableRecordings()
        )
      ).toEqual([]);
      await page.reload();
      const panel = page.locator('[data-ui="gallery.recording-recovery"]');
      await expect(
        page.getByRole('main').getByRole('group', { name: 'Recovery webm.webm', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('main')).not.toContainText('Your Library is empty');
      await expect(panel).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('successful-recording.png'), fullPage: false });
      await attachProbe(page, code);
      expect(
        await page.evaluate(
          async (id) => (window as ProbeWindow).recordingRecoveryProbe.rawDigest(id),
          id
        )
      ).toEqual(before);
      expect(
        await page.evaluate(
          async ({ id, fault }) =>
            (window as ProbeWindow).recordingRecoveryProbe.damageCanonicalRecording(id, fault),
          { id, fault }
        )
      ).toBe(true);
      await page.reload();
      await expect(panel).toBeVisible();
      await attachProbe(page, code);
      const recovered = await page.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.restoreAndDecode(id),
        id
      );
      expect(recovered.frames).toBeGreaterThan(10);
      expect(
        await page.evaluate(
          async (id) => (window as ProbeWindow).recordingRecoveryProbe.rawDigest(id),
          id
        )
      ).toEqual(before);
      await page.reload();
      await expect(panel).toHaveCount(0);
    } finally {
      await closeExtensionBrowser(launched, { removeUserDataDir: true });
    }
  });
}

test('ordinary saved recording deletion removes its internal safety bytes without extra cleanup', async () => {
  const launched = await launchExtensionBrowser({ viewport: resolveBrowserViewport() });
  try {
    const page = await launched.context.newPage();
    await page.goto(
      `chrome-extension://${launched.extensionId}/apps/extension/src/gallery/index.html`
    );
    await attachProbe(page, await bundleProbe());
    const id = await recordNativeVideo(page);
    await page.evaluate(async () =>
      (window as ProbeWindow).recordingRecoveryProbe.saveActiveRecording()
    );
    expect(
      await page.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.deleteSavedRecording(id),
        id
      )
    ).toEqual({ canonicalMissing: true, headerMissing: true, remainingBlocks: 0 });
    await page.reload();
    await expect(page.locator('[data-ui="gallery.recording-recovery"]')).toHaveCount(0);
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});

test('an opening in another context cannot recreate recording data after erasure', async () => {
  const launched = await launchExtensionBrowser({ viewport: resolveBrowserViewport() });
  try {
    const code = await bundleProbe();
    const first = await launched.context.newPage();
    const second = await launched.context.newPage();
    const url = `chrome-extension://${launched.extensionId}/apps/extension/src/gallery/index.html`;
    await first.goto(url);
    await second.goto(url);
    await attachProbe(first, code);
    await attachProbe(second, code);
    const id = 'delayed-opening-before-erasure';
    await second.evaluate(
      async (id) => (window as ProbeWindow).recordingRecoveryProbe.holdIdentity(id),
      id
    );
    await first.evaluate(
      async (id) => (window as ProbeWindow).recordingRecoveryProbe.beginDelayedOpening(id),
      id
    );
    await second.evaluate(async () =>
      (window as ProbeWindow).recordingRecoveryProbe.eraseAndReinitialize()
    );
    await second.evaluate(async () =>
      (window as ProbeWindow).recordingRecoveryProbe.releaseIdentity()
    );
    const outcome = await first.evaluate(async () =>
      (window as ProbeWindow).recordingRecoveryProbe.finishDelayedOpening()
    );
    expect(outcome).toContain('stale');
    expect(
      await second.evaluate(
        async (id) => (window as ProbeWindow).recordingRecoveryProbe.progress(id),
        id
      )
    ).toEqual({ size: 0, count: 0 });
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});

test('recovery finishes when cold admission queues behind its active transition', async () => {
  const launched = await launchExtensionBrowser({ viewport: resolveBrowserViewport() });
  try {
    const page = await launched.context.newPage();
    await page.goto(
      `chrome-extension://${launched.extensionId}/apps/extension/src/gallery/index.html`
    );
    await attachProbe(page, await bundleProbe());
    const id = await page.evaluate(async () =>
      (window as ProbeWindow).recordingRecoveryProbe.startRecording('webm', 'media-recorder')
    );
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(
              async (id) => (window as ProbeWindow).recordingRecoveryProbe.progress(id),
              id
            )
          ).count,
        { timeout: 20000 }
      )
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(async () => (window as ProbeWindow).recordingRecoveryProbe.failRecording());
    await page.evaluate(
      async (id) => (window as ProbeWindow).recordingRecoveryProbe.startContendedRecovery(id),
      id
    );
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as ProbeWindow).recordingRecoveryProbe.contendedRecoveryOutcome()
          ),
        { timeout: 5000 }
      )
      .toEqual({ settled: true, error: null });
  } finally {
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});
