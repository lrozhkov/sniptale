import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { test as base, expect, type TestInfo } from '@playwright/test';
import { launchExtensionBrowser } from '../support/extension-browser-launch';
import { startWebdavLabProxy } from './webdav-server';

async function createLab() {
  const endpoint = process.env['SNIPTALE_WEBDAV_TEST_URL'];
  const secretFile = process.env['SNIPTALE_WEBDAV_TEST_SECRET_FILE'];
  const username = process.env['SNIPTALE_WEBDAV_TEST_USERNAME'];
  if (!endpoint || !secretFile || !username) {
    throw new Error('Set the explicit loopback WebDAV test URL, username and secret file.');
  }
  const base = new URL(endpoint);
  if (
    base.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !base.pathname.endsWith('/')
  ) {
    throw new Error('WebDAV provider tests require a loopback lab collection.');
  }
  const password = (await readFile(secretFile, 'utf8')).trim();
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const root = new URL(`sniptale-provider-${randomUUID()}/`, base);
  const created = await fetch(root, {
    method: 'MKCOL',
    headers: { authorization },
    redirect: 'error',
  });
  await created.body?.cancel();
  if (created.status !== 201)
    throw new Error(`Lab collection creation failed (${created.status}).`);
  const proxy = await startWebdavLabProxy(root.href);
  return {
    proxy,
    credentials: { rootUrl: proxy.rootUrl, username, password },
    async externalProof(key: string) {
      const response = await fetch(
        new URL(key.split('/').map(encodeURIComponent).join('/'), root),
        {
          headers: { authorization },
          redirect: 'error',
        }
      );
      if (!response.ok || !response.body)
        throw new Error(`External lab read failed (${response.status}).`);
      const reader = response.body.getReader();
      const hash = createHash('sha256');
      let bytes = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        hash.update(part.value);
      }
      return { size: bytes, sha256: hash.digest('hex') };
    },
    async corruptFile(key: string) {
      if (!key.startsWith('Files/'))
        throw new Error('Only a synthetic media file can be corrupted.');
      const url = new URL(key.split('/').map(encodeURIComponent).join('/'), root);
      const response = await fetch(url, { headers: { authorization }, redirect: 'error' });
      const size = Number(response.headers.get('content-length'));
      if (!response.ok || !Number.isSafeInteger(size) || size < 1 || size > 1024 * 1024) {
        await response.body?.cancel();
        throw new Error('Synthetic corruption fixture is outside its byte budget.');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== size) throw new Error('Synthetic file response size differs.');
      bytes[0] = bytes[0]! ^ 255;
      const changed = await fetch(url, {
        method: 'PUT',
        headers: { authorization },
        body: bytes,
        redirect: 'error',
      });
      await changed.body?.cancel();
      if (!changed.ok) throw new Error('Synthetic external modification failed.');
      return { size, sha256: createHash('sha256').update(bytes).digest('hex') };
    },
    async close() {
      await proxy.close();
      const removed = await fetch(root, {
        method: 'DELETE',
        headers: { authorization },
        redirect: 'error',
      });
      await removed.body?.cancel();
      if (![204, 404].includes(removed.status))
        throw new Error(`Lab cleanup failed (${removed.status}).`);
    },
  };
}

type Lab = Awaited<ReturnType<typeof createLab>>;
export const test = base.extend<{ lab: Lab }>({
  lab: async ({}, use) => {
    const lab = await createLab();
    try {
      await use(lab);
    } finally {
      await lab.close();
    }
  },
});

export async function openProvider(lab: Lab, info: TestInfo, name: string) {
  const loaded = await launchExtensionBrowser({
    extensionBuildDir: process.env['SNIPTALE_EXTENSION_BUILD_DIR'] ?? '.tmp/e2e-builds/test',
    userDataDir: info.outputPath(name),
    viewport: { width: 1280, height: 560 },
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await loaded.context.newPage();
    await page.goto(
      `chrome-extension://${loaded.extensionId}/tooling/test/harness/webdav-transfer.html`
    );
    await page.waitForFunction(() => Boolean(window.webdavTransferHarness));
    await page.evaluate((origin) => {
      const button = document.createElement('button');
      button.textContent = 'Grant provider test origin';
      button.onclick = async () => {
        button.dataset['granted'] = String(
          await chrome.permissions.request({ origins: [`${origin}/*`] })
        );
      };
      document.body.append(button);
    }, new URL(lab.proxy.rootUrl).origin);
    const grant = page.getByRole('button', { name: 'Grant provider test origin', exact: true });
    await grant.click();
    await expect(grant).toHaveAttribute('data-granted', 'true');
    await page.evaluate(
      (credentials) => window.webdavTransferHarness.connect(credentials),
      lab.credentials
    );
    return { ...loaded, page };
  } catch (error) {
    await loaded.context.close();
    throw error;
  }
}

export async function saveProof(info: TestInfo, value: unknown) {
  await writeFile(
    info.outputPath('provider-proof.json'),
    JSON.stringify(
      {
        profile: process.env['SNIPTALE_WEBDAV_TEST_PROFILE'] ?? 'unspecified',
        proof: value,
      },
      null,
      2
    )
  );
}
