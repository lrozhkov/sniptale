import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn(), update: vi.fn() }));

vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  updatePopupExportJobStatus: mocks.update,
}));

import { collectPopupExportPagePackages } from './package-phase';
import type { ActivePopupExportJob } from './runtime-state';

function createJob(): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    contentPort: {
      cancelPagePackage: vi.fn(),
      requestPagePackage: mocks.request,
    },
    completion: null,
    expectedActivation: null,
    lastActivatedByWindow: new Map(),
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      activatedTabIds: [],
      effectiveOptions: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: true,
        includeFullPageScreenshot: true,
        includeImages: true,
        includeJson: true,
        includeMarkdown: true,
        includePageDiagnostics: false,
      },
      jobId: 'job-1',
      orderedTabs: [
        { tabId: 1, title: 'One' },
        { tabId: 2, title: 'Two' },
        { tabId: 3, title: 'Missing' },
      ],
      originalActiveTabs: [],
      phase: 'running',
      progress: { current: 0, errors: [], message: '', phase: 'scanning', total: 3 },
      revision: 1,
      warnings: [],
    },
    unsubscribeActivation: null,
  };
}

beforeEach(() => vi.clearAllMocks());

it('collects valid packages and records owner and protocol failures', async () => {
  mocks.request
    .mockResolvedValueOnce({
      success: true,
      pagePackage: {
        archiveBaseName: 'one',
        entries: [{ path: 'one.json', textContent: '{}' }],
        errors: ['asset failed'],
        stats: { filesCount: 1, filesFailed: 1, rowsCount: 1, sectionsCount: 1 },
      },
    })
    .mockResolvedValueOnce({ success: false, error: 'package denied' });

  const result = await collectPopupExportPagePackages(
    createJob(),
    new Map([
      [1, { id: 1 } as chrome.tabs.Tab],
      [2, { id: 2 } as chrome.tabs.Tab],
    ])
  );

  expect(result.packages).toHaveLength(1);
  expect(result.errors).toEqual(['One: asset failed', 'Two: package denied']);
  expect(mocks.request).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      options: expect.objectContaining({ includeFullPageScreenshot: false }),
    })
  );
});

it('rejects invalid responses and skips all work after cancellation', async () => {
  mocks.request.mockResolvedValueOnce({ unexpected: true });
  const job = createJob();
  const result = await collectPopupExportPagePackages(
    job,
    new Map([[1, { id: 1 } as chrome.tabs.Tab]])
  );
  expect(result.errors).toEqual(['One: Invalid page package response']);

  job.cancelled = true;
  mocks.request.mockClear();
  await expect(
    collectPopupExportPagePackages(job, new Map([[1, { id: 1 } as chrome.tabs.Tab]]))
  ).resolves.toEqual({ errors: [], packages: [] });
  expect(mocks.request).not.toHaveBeenCalled();
});

it('rejects an unsafe package while retaining the next valid package', async () => {
  mocks.request
    .mockResolvedValueOnce({
      success: true,
      pagePackage: {
        archiveBaseName: 'unsafe',
        entries: [{ path: '../escape.txt', textContent: 'unsafe' }],
        errors: [],
        stats: { filesCount: 1, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
      },
    })
    .mockResolvedValueOnce({
      success: true,
      pagePackage: {
        archiveBaseName: 'safe',
        entries: [{ path: 'safe.txt', textContent: 'safe' }],
        errors: [],
        stats: { filesCount: 1, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
      },
    });

  const result = await collectPopupExportPagePackages(
    createJob(),
    new Map([
      [1, { id: 1 } as chrome.tabs.Tab],
      [2, { id: 2 } as chrome.tabs.Tab],
    ])
  );

  expect(result.errors).toEqual(['One: Unsafe popup export package entry path']);
  expect(result.packages).toEqual([
    expect.objectContaining({ pagePackage: expect.objectContaining({ archiveBaseName: 'safe' }) }),
  ]);
});

it('rejects only the package that exceeds the aggregate entry budget', async () => {
  mocks.request.mockImplementation(async (_request: unknown) => ({
    success: true,
    pagePackage: {
      archiveBaseName: 'page',
      entries: Array.from({ length: 2_000 }, (_, index) => ({
        path: `entry-${index}.txt`,
        textContent: '',
      })),
      errors: [],
      stats: { filesCount: 2_000, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
    },
  }));
  const job = createJob();
  job.status.orderedTabs = Array.from({ length: 6 }, (_, index) => ({
    tabId: index + 1,
    title: `Tab ${index + 1}`,
  }));

  const result = await collectPopupExportPagePackages(
    job,
    new Map(job.status.orderedTabs.map(({ tabId }) => [tabId, { id: tabId } as chrome.tabs.Tab]))
  );

  expect(result.packages).toHaveLength(5);
  expect(result.errors).toEqual(['Tab 6: Popup export aggregate exceeds 10000 entries']);
});
