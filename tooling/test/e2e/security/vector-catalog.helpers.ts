import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'node:net';
import { promisify } from 'node:util';
import { expect, type BrowserContext, type Page, type ViewportSize } from '@playwright/test';
import {
  acceptOptionalExtensionPermissionPrompt,
  denyOptionalExtensionPermissionPrompt,
} from '../support/native-permission-prompt';

const PREFIX = '/chosen/catalog/';
/** Real HTTPS fixture for a chosen source. It never intercepts or impersonates the public API. */
export async function startVectorCatalogSource(
  options: { downloadPair?: boolean; requestBudget?: boolean } = {}
) {
  const directory = await mkdtemp(join(tmpdir(), 'sniptale-vector-catalog-'));
  const key = join(directory, 'key.pem'),
    cert = join(directory, 'cert.pem');
  await promisify(execFile)('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
    '-keyout',
    key,
    '-out',
    cert,
  ]);
  const requests: { pathname: string; cookie: boolean; query: string }[] = [];
  const artworkRequests: string[][] = [];
  const artworkKeys: string[][] = [];
  const pendingArtwork: (() => void)[] = [];
  let holdArtwork = !!options.requestBudget;
  let activeArtwork = 0;
  let maxActiveArtwork = 0;
  const budgetNames = Array.from(
    { length: 64 },
    (_, index) => `item-${String(index).padStart(3, '0')}`
  );
  const budgetIds = budgetNames.map((name, index) => `${index % 2 ? 'other' : 'proof'}:${name}`);
  let secondArtworkSupported = false;
  const sockets = new Set<Socket>();
  const server = https.createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    (request, response) => {
      const url = new URL(request.url ?? '/', 'https://127.0.0.1');
      requests.push({
        pathname: url.pathname,
        cookie: !!request.headers.cookie,
        query: url.search,
      });
      response.setHeader('content-type', 'application/json');
      response.setHeader('access-control-allow-origin', '*');
      const info = {
        name: 'Proof elements',
        total: options.requestBudget ? 64 : options.downloadPair ? 2 : 1,
        author: { name: 'Test fixture' },
        license: { title: 'MIT', spdx: 'MIT' },
      };
      if (url.pathname === `${PREFIX}collections`)
        return response.end(
          JSON.stringify({
            proof: info,
            ...(options.requestBudget ? { other: { ...info, name: 'Other elements' } } : {}),
          })
        );
      if (url.pathname === `${PREFIX}search`)
        return response.end(
          JSON.stringify(
            options.requestBudget
              ? {
                  icons: budgetIds,
                  limit: 64,
                  start: 0,
                  total: 64,
                  collections: { proof: info, other: info },
                }
              : { icons: ['proof:heart'], limit: 32, start: 0, total: 1 }
          )
        );
      if (url.pathname === `${PREFIX}collection`)
        return response.end(
          JSON.stringify({
            prefix: url.searchParams.get('prefix') ?? 'proof',
            uncategorized: options.requestBudget
              ? budgetNames
              : options.downloadPair
                ? ['heart', 'repairable']
                : ['heart'],
            info,
          })
        );
      if (
        options.requestBudget &&
        (url.pathname === `${PREFIX}proof.json` || url.pathname === `${PREFIX}other.json`)
      ) {
        const prefix = url.pathname.endsWith('/other.json') ? 'other' : 'proof';
        const names = url.searchParams.get('icons')?.split(',') ?? [];
        artworkRequests.push(names);
        artworkKeys.push(names.map((name) => `${prefix}:${name}`));
        activeArtwork += 1;
        maxActiveArtwork = Math.max(maxActiveArtwork, activeArtwork);
        const complete = () => {
          activeArtwork -= 1;
          response.end(
            JSON.stringify({
              prefix,
              width: 24,
              height: 24,
              icons: Object.fromEntries(
                names.map((name) => [
                  name,
                  { body: '<path fill="currentColor" d="M2 2h20v20H2z"/>' },
                ])
              ),
            })
          );
        };
        if (holdArtwork) pendingArtwork.push(complete);
        else complete();
        return;
      }
      if (url.pathname === `${PREFIX}proof.json`) {
        const bodies: Record<string, { body: string }> = {
          heart: { body: '<path fill="currentColor" d="M2 2h20v20H2z"/>' },
          ...(options.downloadPair
            ? {
                repairable: {
                  body: secondArtworkSupported
                    ? '<path fill="#008000" d="M12 2L22 22H2z"/>'
                    : '<defs><linearGradient id="paint"/></defs><rect width="24" height="24" fill="url(#paint)"/>',
                },
              }
            : {}),
        };
        const names = url.searchParams.get('icons')?.split(',') ?? Object.keys(bodies);
        artworkRequests.push(names);
        return response.end(
          JSON.stringify({
            prefix: 'proof',
            width: 24,
            height: 24,
            icons: Object.fromEntries(
              names.filter((name) => name in bodies).map((name) => [name, bodies[name]])
            ),
          })
        );
      }
      response.writeHead(404).end('{}');
    }
  );
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Catalog fixture did not bind a TCP port');
  const origin = `https://127.0.0.1:${address.port}`;
  return {
    origin,
    baseUrl: `${origin}${PREFIX}`,
    requests,
    artworkRequests,
    artworkKeys,
    get maxActiveArtwork() {
      return maxActiveArtwork;
    },
    releaseArtwork() {
      holdArtwork = false;
      pendingArtwork.splice(0).forEach((complete) => complete());
    },
    makeSecondArtworkSupported() {
      secondArtworkSupported = true;
    },
    async close() {
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await rm(directory, { recursive: true, force: true });
    },
  };
}

/** The download proof explicitly selects English; do not match "Unsaved changes" as "Saved". */
export async function waitCatalogEditorAutosave(page: Page): Promise<string> {
  await expect(page.locator('[data-ui="autosave-control"] button')).toHaveAttribute(
    'aria-label',
    'Autosave: Saved'
  );
  await expect.poll(() => new URL(page.url()).searchParams.get('assetId')).toBeTruthy();
  return page.url();
}

/** Read-only evidence: advisory cache and accepted local resources share one native store. */
export async function readCatalogLibrarySnapshot(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const values: unknown[] = await new Promise((resolve, reject) => {
        const request = database
          .transaction('editor_vector_library', 'readonly')
          .objectStore('editor_vector_library')
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = values.filter(
        (value): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value)
      );
      const settings = rows.find((row) => row['kind'] === 'settings');
      return {
        baseUrl: typeof settings?.['baseUrl'] === 'string' ? settings['baseUrl'] : null,
        cacheCount: rows.filter((row) => row['kind'] === 'cache').length,
        acceptedRows: rows
          .filter((row) => row['kind'] !== 'cache')
          .map((row) => JSON.stringify(row))
          .sort(),
        acceptedRowsWithoutSettings: rows
          .filter((row) => row['kind'] !== 'cache' && row['kind'] !== 'settings')
          .map((row) => JSON.stringify(row))
          .sort(),
      };
    } finally {
      database.close();
    }
  });
}

export async function openCatalogEditor(
  context: BrowserContext,
  extensionId: string,
  viewport: ViewportSize = { width: 1280, height: 560 }
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/editor/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  const buffer = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing fixture canvas');
      context.fillStyle = '#e5e7eb';
      context.fillRect(0, 0, 800, 600);
      return canvas.toDataURL('image/png').split(',')[1]!;
    }),
    'base64'
  );
  await page
    .locator('input[type="file"][accept="image/*"]')
    .first()
    .setInputFiles({ name: 'catalog-source.png', mimeType: 'image/png', buffer });
  await expect(page.locator('[data-ui="editor.canvas.document-boundary"]')).toBeVisible();
  await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
  await expect(page.locator('[data-ui="editor.elements.panel"]')).toBeVisible();
  await page.locator('[data-ui="editor.elements.manage"]').click();
  await expect(page.locator('[data-ui="editor.elements.enable-network"]')).toBeDisabled();
  return page;
}

/** Uses the actual product click and Chromium's native host permission decision. */
export async function enableCatalogSource(
  page: Page,
  baseUrl: string,
  decision: 'accept' | 'deny'
): Promise<void> {
  await page.locator('[data-ui="editor.elements.source-url"]').fill(baseUrl);
  await page.locator('[data-ui="editor.elements.consent"]').check();
  await expect(page.locator('[data-ui="editor.elements.enable-network"]')).toBeEnabled();
  await page.bringToFront();
  await page.locator('[data-ui="editor.elements.enable-network"]').click();
  // The native browser-owned prompt does not expose a Playwright DOM target.
  await page.waitForTimeout(250);
  if (decision === 'accept') acceptOptionalExtensionPermissionPrompt();
  else denyOptionalExtensionPermissionPrompt();
}

export async function searchCatalogFromUi(page: Page, query: string): Promise<void> {
  const management = page.locator('[data-ui="editor.elements.management"]');
  if (await management.isVisible())
    await management.getByRole('button', { name: /Back|Назад/u }).click();
  const search = page
    .locator('[data-ui="editor.elements.panel"]')
    .getByRole('searchbox', { name: /Search|Поиск/u });
  await search.fill(query);
  await search.press('Enter');
}
