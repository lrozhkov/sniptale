import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { resolveExtensionServiceWorkerUrl } from '../support/extension-fixture';
import { startHostServer } from '../support/host-server';

const FORBIDDEN_RELEASE_MARKERS = [
  '__SNIPTALE_SECURITY_E2E__',
  'sniptale:security-e2e-control:v1',
  'persistence-before-commit',
  'popup-export-after-admission',
  'tooling/test/harness/security-control',
] as const;

async function collectArtifactText(root: string, relativePath = ''): Promise<string> {
  const entries = await readdir(join(root, relativePath), { withFileTypes: true });
  const chunks: string[] = [];
  for (const entry of entries) {
    const child = join(relativePath, entry.name);
    if (entry.isDirectory()) {
      chunks.push(await collectArtifactText(root, child));
    } else if (/\.(?:css|html|js|json|mjs)$/u.test(entry.name)) {
      chunks.push(await readFile(join(root, child), 'utf8'));
    }
  }
  return chunks.join('\n');
}

test('production artifact exposes no security harness or internal web surface', async () => {
  const buildRoot = join(process.cwd(), 'dist-release-e2e');
  const manifest = JSON.parse(await readFile(join(buildRoot, 'manifest.json'), 'utf8')) as {
    content_scripts?: unknown[];
    externally_connectable?: unknown;
    web_accessible_resources?: { resources?: string[] }[];
  };
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect(manifest.externally_connectable).toBeUndefined();
  expect(
    (manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? [])
  ).toEqual(expect.arrayContaining([expect.stringMatching(/^fonts\//u)]));
  expect(
    (manifest.web_accessible_resources ?? [])
      .flatMap((entry) => entry.resources ?? [])
      .some((resource) => /\.(?:html?|js|mjs)$/u.test(resource))
  ).toBe(false);
  const artifactText = await collectArtifactText(buildRoot);
  for (const marker of FORBIDDEN_RELEASE_MARKERS) expect(artifactText).not.toContain(marker);

  const launched = await launchExtensionBrowser({ extensionBuildDir: 'dist-release-e2e' });
  const hostServer = await startHostServer();
  try {
    const extensionId = new URL(await resolveExtensionServiceWorkerUrl(launched.context)).host;
    const host = await launched.context.newPage();
    await host.goto(`${hostServer.origin}/fixtures/host-page.html?production-surface=1`);
    const fetchResults = await host.evaluate(
      async ({ extensionId: id }) => {
        const paths = [
          'apps/extension/src/settings/index.html',
          'apps/extension/src/popup/index.html',
          'tooling/test/harness/security-control.html',
        ];
        return Promise.all(
          paths.map(async (path) => {
            try {
              const response = await fetch(`chrome-extension://${id}/${path}`);
              return { ok: response.ok, path };
            } catch {
              return { ok: false, path };
            }
          })
        );
      },
      { extensionId }
    );
    expect(fetchResults.every((result) => result.ok === false)).toBe(true);

    const missing = await launched.context.newPage();
    let navigationError = '';
    await missing
      .goto(`chrome-extension://${extensionId}/tooling/test/harness/security-control.html`)
      .catch((error: unknown) => {
        navigationError = error instanceof Error ? error.message : String(error);
      });
    expect(navigationError).toContain('ERR_FILE_NOT_FOUND');
    await missing.close();
    await host.close();
  } finally {
    await new Promise<void>((resolve, reject) =>
      hostServer.server.close((error) => (error ? reject(error) : resolve()))
    );
    await closeExtensionBrowser(launched, { removeUserDataDir: true });
  }
});
