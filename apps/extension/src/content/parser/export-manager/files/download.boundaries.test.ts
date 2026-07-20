// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import type { FileResource } from '@sniptale/runtime-contracts/export';
import { downloadFileResources } from './download';

const { getCurrentExportPageUrlMock } = vi.hoisted(() => ({
  getCurrentExportPageUrlMock: vi.fn(() => 'https://example.com/current-page'),
}));

vi.mock('../diagnostics/dom-driver', async () => {
  const actual = await vi.importActual<typeof import('../diagnostics/dom-driver')>(
    '../diagnostics/dom-driver'
  );
  return { ...actual, getCurrentExportPageUrl: getCurrentExportPageUrlMock };
});

function createResource(url: string, filename: string): FileResource {
  return { filename, source: 'direct', url };
}

function installFetchMock(handler: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request) => handler(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function listFileNames(result: Awaited<ReturnType<typeof downloadFileResources>>) {
  return [...result.files.keys()].sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('blocks unsafe credentialed URL variants before issuing requests', async () => {
  const fetchMock = installFetchMock(async () => {
    throw new Error('fetch should not be called for blocked urls');
  });

  const result = await downloadFileResources(
    [
      createResource('javascript:alert(1)', 'script.bin'),
      createResource('data:text/plain;base64,SGk=', 'data.bin'),
      createResource('https://user:secret@example.com/file.pdf', 'userinfo.pdf'),
    ],
    undefined,
    () => false,
    () => undefined
  );

  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.files.size).toBe(0);
  expect(result.errors).toEqual([
    'Failed to download script.bin: Blocked disallowed download URL',
    'Failed to download data.bin: Blocked disallowed download URL',
    'Failed to download userinfo.pdf: Blocked disallowed download URL',
  ]);
});

it('normalizes unsafe resource filenames before storing downloaded files', async () => {
  installFetchMock(
    async () =>
      new Response(new Blob(['pdf'], { type: 'application/pdf' }), {
        headers: { 'Content-Type': 'application/pdf' },
      })
  );

  const result = await downloadFileResources(
    [createResource('https://example.com/download?id=1', '..%2Fsecret\u0000report')],
    undefined,
    () => false,
    () => undefined
  );

  expect(listFileNames(result)).toEqual(['secret_report.pdf']);
  expect(result.errors).toEqual([]);
});

it('rejects oversized response bodies before saving downloaded files', async () => {
  installFetchMock(async () => {
    return new Response(new Blob(['small']), {
      headers: { 'Content-Length': String(100 * 1024 * 1024 + 1) },
      status: 200,
      statusText: 'OK',
    });
  });

  const result = await downloadFileResources(
    [createResource('https://example.com/large.bin', 'large.bin')],
    undefined,
    () => false,
    () => undefined
  );

  expect(result.files.size).toBe(0);
  expect(result.errors).toEqual(['Failed to download large.bin: Download response is too large']);
});
