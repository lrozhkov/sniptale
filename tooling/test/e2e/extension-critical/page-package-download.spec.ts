import { expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';

for (const format of ['zip', 'html'] as const) {
  test(`cold offscreen completes Page Package ${format} download with native storage locks`, async ({}, info) => {
    const host = await startHostServer();
    const directory = await mkdtemp(join(process.cwd(), '.tmp/page-package-download-'));
    const extension = join(directory, 'extension');
    await cp(process.env.SNIPTALE_EXTENSION_BUILD_DIR ?? 'dist', extension, { recursive: true });
    const manifestPath = join(extension, 'manifest.json');
    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
      throw new Error('Invalid extension manifest');
    }
    // captureVisibleTab requires activeTab or the all-sites grant in this disposable browser.
    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, host_permissions: ['<all_urls>'] })
    );
    const launched = await launchExtensionBrowser({
      extensionBuildDir: extension.replace(`${process.cwd()}/`, ''),
    });
    const { context, extensionId } = launched;
    const logs: string[] = [];
    context.on('page', (target) => target.on('console', (message) => logs.push(message.text())));
    context.on('serviceworker', (target) =>
      target.on('console', (message) => logs.push(message.text()))
    );
    for (const target of context.serviceWorkers())
      target.on('console', (message) => logs.push(message.text()));
    await context.route(`${host.origin}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><title>Cold export</title></head><body><h1>Cold export</h1><p>Deterministic page export proof.</p></body></html>',
      })
    );
    const page = await context.newPage();
    await page.goto(host.origin);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    try {
      await popup.evaluate(async () => {
        if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
      });
      const tabId = await popup.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
        if (typeof tab?.id !== 'number') throw new Error('Host tab unavailable');
        return tab.id;
      }, page.url());
      const registered = await popup.evaluate(async (id) => {
        await chrome.tabs.update(id, { active: true });
        return chrome.runtime.sendMessage({
          type: 'PAGE_ACCESS',
          operation: 'register-granted-site',
          tabId: id,
          __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
        });
      }, tabId);
      expect(registered).toMatchObject({ success: true, result: 'registered' });
      const result = await popup.evaluate(
        async ({ tabId: id, format: outputFormat }) => {
          const freshness = () => ({ issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() });
          const jobId = crypto.randomUUID();
          const started = await chrome.runtime.sendMessage({
            type: 'START_PAGE_PACKAGE_JOB',
            __sniptaleRuntimeFreshness: freshness(),
            jobId,
            intent: 'export',
            locale: 'en',
            includeWebCopy: outputFormat === 'html',
            ...(outputFormat === 'html' ? { downloadFormat: 'html' } : {}),
            captureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 100 },
            sources: [{ kind: 'tab', tabId: id, title: 'Cold export proof' }],
            options: {
              includeBasicLogs: false,
              includeCssDiagnostics: false,
              includeFiles: false,
              includeFullPageScreenshot: outputFormat === 'html',
              includeImages: false,
              includeJson: outputFormat === 'zip',
              includeMarkdown: outputFormat === 'zip',
              includePageDiagnostics: false,
            },
            warnings: [],
          });
          if (started?.success !== true) throw new Error('Export admission failed');
          const deadline = Date.now() + 25_000;
          while (Date.now() < deadline) {
            const response = await chrome.runtime.sendMessage({
              type: 'GET_PAGE_PACKAGE_JOB_STATUS',
              jobId,
              __sniptaleRuntimeFreshness: freshness(),
            });
            const status = response.status;
            if (['completed', 'failed', 'cancelled', 'interrupted'].includes(status?.phase)) {
              const downloads = await chrome.downloads.search({});
              return {
                phase: status.phase,
                success: status.result?.success,
                status,
                downloads: downloads.map((download) => ({
                  state: download.state,
                  bytesReceived: download.bytesReceived,
                  filename: download.filename,
                })),
              };
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return { phase: 'timed-out', locks: await navigator.locks.query() };
        },
        { tabId, format }
      );
      await writeFile(info.outputPath('export-logs.json'), JSON.stringify(logs, null, 2));
      await writeFile(info.outputPath('export-result.json'), JSON.stringify(result, null, 2));
      await info.attach('export-result', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });
      expect(result).toMatchObject({ phase: 'completed', success: true });
      expect(result.downloads).toEqual([
        expect.objectContaining({
          state: 'complete',
        }),
      ]);
      expect(result.downloads?.[0]?.bytesReceived).toBeGreaterThan(0);
      expect(result.status?.result?.filename).toMatch(new RegExp(`\\.${format}$`));
      const unauthorized = await popup.evaluate(() =>
        chrome.runtime.sendMessage({
          type: 'OFFSCREEN_PREPARE_PAGE_PACKAGE_DOWNLOAD',
          capabilityToken: 'untrusted',
        })
      );
      expect(unauthorized).toMatchObject({
        success: false,
        error: 'Unauthorized offscreen command sender',
      });
    } finally {
      await closeExtensionBrowser(launched, { removeUserDataDir: true });
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
}
