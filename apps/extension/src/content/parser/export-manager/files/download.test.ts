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

  return {
    ...actual,
    getCurrentExportPageUrl: getCurrentExportPageUrlMock,
  };
});

function createResource(url: string, filename: string): FileResource {
  return {
    url,
    filename,
    source: 'direct',
  };
}

function createResponse(
  body: BlobPart,
  options?: {
    contentDisposition?: string;
    contentType?: string;
    status?: number;
    statusText?: string;
  }
) {
  const headers = new Headers();

  if (options?.contentDisposition) {
    headers.set('Content-Disposition', options.contentDisposition);
  }

  if (options?.contentType) {
    headers.set('Content-Type', options.contentType);
  }

  return new Response(new Blob([body], { type: options?.contentType ?? '' }), {
    status: options?.status ?? 200,
    statusText: options?.statusText ?? 'OK',
    headers,
  });
}

function installFetchMock(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    return handler(String(input), init);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function listFileNames(result: Awaited<ReturnType<typeof downloadFileResources>>) {
  return [...result.files.keys()].sort();
}

function listUuidMappings(result: Awaited<ReturnType<typeof downloadFileResources>>) {
  return [...result.urlUuidToFilename.entries()];
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('downloads files, deduplicates inferred filenames, and tracks available uuids', async () => {
  const firstResource = createResource('https://example.com/download?uuid=file$1', 'export');
  const secondResource = createResource('https://example.com/files/report.pdf', 'export');
  const progress = vi.fn();
  const fetchMock = installFetchMock(async (url, init) => {
    if (url === firstResource.url) {
      expect(init).toEqual({
        credentials: 'include',
        signal: undefined,
      });

      return createResponse('alpha', {
        contentType: 'application/pdf',
      });
    }

    if (url === secondResource.url) {
      await new Promise((resolve) => setTimeout(resolve, 0));

      return createResponse('beta');
    }

    throw new Error(`Unexpected url: ${url}`);
  });

  const result = await downloadFileResources(
    [firstResource, secondResource],
    undefined,
    () => false,
    progress
  );

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(listFileNames(result)).toEqual(['export.pdf', 'export_1.pdf']);
  expect(listUuidMappings(result)).toEqual([['file_1', 'export.pdf']]);
  expect(result.errors).toEqual([]);
  expect(progress.mock.calls).toEqual([
    [1, 2],
    [2, 2],
  ]);
});

it('falls back to binary extensions and forwards the abort signal', async () => {
  const controller = new AbortController();
  const imageResource = createResource('https://example.com/image-preview', 'preview');
  const rawResource = createResource('https://example.com/raw-download', 'archive');

  installFetchMock(async (url, init) => {
    expect(init).toEqual({
      credentials: 'include',
      signal: controller.signal,
    });

    if (url === imageResource.url) {
      return createResponse('image-bytes');
    }

    if (url === rawResource.url) {
      return createResponse('binary-bytes');
    }

    throw new Error(`Unexpected url: ${url}`);
  });

  const result = await downloadFileResources(
    [imageResource, rawResource],
    controller.signal,
    () => false,
    () => undefined
  );

  expect(listFileNames(result)).toEqual(['archive.bin', 'preview.bin']);
  expect(result.errors).toEqual([]);
});

it('records HTTP and non-Error failures while continuing the remaining downloads', async () => {
  const okResource = createResource('https://example.com/notes.txt', 'notes.txt');
  const httpFailure = createResource('https://example.com/missing', 'missing.txt');
  const thrownFailure = createResource('https://example.com/boom', 'boom.txt');
  const progress = vi.fn();

  installFetchMock(async (url) => {
    if (url === okResource.url) {
      return createResponse('ok-bytes');
    }

    if (url === httpFailure.url) {
      return createResponse('', {
        status: 404,
        statusText: 'Not Found',
      });
    }

    if (url === thrownFailure.url) {
      throw 'boom';
    }

    throw new Error(`Unexpected url: ${url}`);
  });

  const result = await downloadFileResources(
    [okResource, httpFailure, thrownFailure],
    undefined,
    () => false,
    progress
  );

  expect(listFileNames(result)).toEqual(['notes.txt']);
  expect(result.errors).toEqual([
    'Failed to download missing.txt: HTTP 404: Not Found',
    'Failed to download boom.txt: Unknown error',
  ]);
  expect(progress).toHaveBeenCalledTimes(3);
});

it('rejects same-origin intermediary HTML page responses instead of saving them as files', async () => {
  installFetchMock(async () => {
    return createResponse('<html><title>Download as PDF</title></html>', {
      contentType: 'text/html; charset=UTF-8',
    });
  });

  const result = await downloadFileResources(
    [
      createResource(
        'https://example.com/w/index.php?title=Special:DownloadAsPdf&page=Web&action=show-download-screen',
        'index.php'
      ),
    ],
    undefined,
    () => false,
    () => undefined
  );

  expect(result.files.size).toBe(0);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toContain('Skipped intermediary HTML page');
});

it('blocks cross-origin credentialed downloads before issuing the request', async () => {
  const fetchMock = installFetchMock(async () => {
    throw new Error('fetch should not be called for blocked urls');
  });

  const result = await downloadFileResources(
    [createResource('https://other.example/download?id=1', 'blocked.bin')],
    undefined,
    () => false,
    () => undefined
  );

  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.files.size).toBe(0);
  expect(result.errors).toEqual([
    'Failed to download blocked.bin: Blocked disallowed download URL',
  ]);
});

it('returns empty collections when the input queue is empty', async () => {
  const progress = vi.fn();

  const result = await downloadFileResources([], undefined, () => false, progress);

  expect(result).toEqual({
    files: new Map(),
    errors: [],
    urlUuidToFilename: new Map(),
  });
  expect(progress).not.toHaveBeenCalled();
});

it('does not start a new queued download after cancellation flips in flight', async () => {
  let cancelled = false;
  const firstResource = createResource('https://example.com/first', 'first.txt');
  const secondResource = createResource('https://example.com/second', 'second.txt');
  const thirdResource = createResource('https://example.com/third', 'third.txt');
  const fourthResource = createResource('https://example.com/fourth', 'fourth.txt');
  const progress = vi.fn((current: number) => {
    if (current === 1) {
      cancelled = true;
    }
  });

  const fetchMock = installFetchMock(async (url) => {
    if (url === firstResource.url) {
      return createResponse('first');
    }

    if (url === secondResource.url) {
      return createResponse('second');
    }

    if (url === thirdResource.url) {
      return createResponse('third');
    }

    throw new Error(`Unexpected url: ${url}`);
  });

  const result = await downloadFileResources(
    [firstResource, secondResource, thirdResource, fourthResource],
    undefined,
    () => cancelled,
    progress
  );

  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).not.toHaveBeenCalledWith(fourthResource.url, expect.anything());
  expect(listFileNames(result)).toEqual(['first.txt', 'second.txt', 'third.txt']);
  expect(progress).toHaveBeenCalledTimes(3);
});
