import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  updatePagePackageJobStatus: vi.fn(async () => undefined),
}));
vi.mock('./visible', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./visible')>()),
  activatePopupExportCaptureTarget: vi.fn(async () => undefined),
}));
import type { ActivePopupExportJob, PopupExportJobContentPort } from './runtime-state';
import { translate } from '../../../../platform/i18n';
import { updatePagePackageJobStatus } from './runtime-state';
import { parsePagePackageJobStatusV1 } from './status';
import { collectPopupExportPagePackages } from './page-phase';
import { activatePopupExportCaptureTarget } from './visible';

beforeEach(() => {
  vi.clearAllMocks();
});

function job(
  requestPagePackage: PopupExportJobContentPort['requestPagePackage']
): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    cancellationCleanupComplete: false,
    cancellationCleanupError: null,
    cancellationQueue: Promise.resolve(),
    completion: null,
    finishCancellation: null,
    contentPort: { cancelPagePackage: vi.fn(), requestPagePackage },
    expectedActivation: null,
    lastActivatedByWindow: new Map(),
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      activatedTabIds: [],
      intent: 'export',
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
      effectiveComponentPlan: {
        components: {
          attachments: true,
          diagnostics: false,
          images: true,
          pageData: true,
          webCopy: false,
        },
        diagnosticsLevel: 'none',
        includeScreenshot: true,
      },
      jobId: 'job-1',
      orderedTabs: [
        { tabId: 7, title: 'One' },
        { tabId: 8, title: 'Two' },
      ],
      pageOutcomes: [
        { ordinal: 0, status: 'pending', tabId: 7 },
        { ordinal: 1, status: 'pending', tabId: 8 },
      ],
      originalActiveTabs: [],
      phase: 'running',
      progress: { current: 0, errors: [], message: '', phase: 'scanning', total: 2 },
      revision: 1,
      warnings: [],
    },
    unsubscribeActivation: null,
  };
}

function descriptor(ordinal: number) {
  return {
    jobId: 'job-1',
    manifestSha256: 'a'.repeat(64),
    manifestSize: 10,
    ordinal,
    pageId: `page-${ordinal}`,
    producerStats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
    stagedBlobId: `stage-${ordinal}`,
    title: `Page ${ordinal}`,
    totalBytes: 20,
  };
}

it('retains only fixed staged descriptors and continues after a page failure', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ success: true, stagedPagePackage: descriptor(0) })
    .mockResolvedValueOnce({ success: false, error: 'capture failed' });
  const result = await collectPopupExportPagePackages(
    job(request),
    new Map([
      [7, { id: 7 } as chrome.tabs.Tab],
      [8, { id: 8 } as chrome.tabs.Tab],
    ])
  );

  expect(result.packages).toEqual([{ descriptor: descriptor(0), tab: { tabId: 7, title: 'One' } }]);
  expect(result.errors).toEqual([`Two: ${translate('content.runtime.exportPrepareFailed')}`]);
  expect(request).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      batchRequestId: 'job-1',
      includeWebCopy: false,
      ordinal: 0,
      tabId: 7,
      options: expect.objectContaining({ includeFullPageScreenshot: true }),
    })
  );
});

it('activates and requests the retained Web-copy producer without the legacy screenshot flag', async () => {
  const request = vi.fn().mockResolvedValue({ success: true, stagedPagePackage: descriptor(0) });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];
  active.status.effectiveOptions.includeFullPageScreenshot = false;
  active.status.effectiveComponentPlan = {
    components: {
      attachments: true,
      diagnostics: false,
      images: true,
      pageData: true,
      webCopy: true,
    },
    diagnosticsLevel: 'none',
    includeScreenshot: true,
  };

  await collectPopupExportPagePackages(active, new Map([[7, { id: 7 } as chrome.tabs.Tab]]));

  expect(activatePopupExportCaptureTarget).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      includeWebCopy: true,
      options: expect.objectContaining({ includeFullPageScreenshot: false }),
    })
  );
});

it('interleaves each Save build with its publication callback', async () => {
  const sequence: string[] = [];
  const request = vi.fn(async ({ ordinal }: { ordinal: number }) => {
    sequence.push(`build-${ordinal}`);
    return { success: true, stagedPagePackage: descriptor(ordinal) };
  });
  const active = job(request);
  active.status.intent = 'save';

  const result = await collectPopupExportPagePackages(
    active,
    new Map([
      [7, { id: 7 } as chrome.tabs.Tab],
      [8, { id: 8 } as chrome.tabs.Tab],
    ]),
    async (item) => {
      sequence.push(`publish-${item.descriptor.ordinal}`);
    }
  );

  expect(sequence).toEqual(['build-0', 'publish-0', 'build-1', 'publish-1']);
  expect(result).toEqual({ errors: [], packages: [] });
});

it('does not request the next Save page after cancellation settles the current callback', async () => {
  const request = vi.fn(async ({ ordinal }: { ordinal: number }) => ({
    success: true,
    stagedPagePackage: descriptor(ordinal),
  }));
  const active = job(request);
  active.status.intent = 'save';

  await collectPopupExportPagePackages(
    active,
    new Map([
      [7, { id: 7 } as chrome.tabs.Tab],
      [8, { id: 8 } as chrome.tabs.Tab],
    ]),
    async () => {
      active.cancelled = true;
    }
  );

  expect(request).toHaveBeenCalledOnce();
});

it('does not surface a content-world failure detail through the public job status', async () => {
  const privateDetail = 'private/account/token?secret=123';
  const request = vi.fn().mockResolvedValue({ success: false, error: privateDetail });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result.errors).toEqual([`One: ${translate('content.runtime.exportPrepareFailed')}`]);
  expect(result.errors.join(' ')).not.toContain(privateDetail);
});

it('keeps exact-bound titles closed under generated progress and failure composition', async () => {
  const request = vi.fn().mockResolvedValue({ success: false, error: 'ignored detail' });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'x'.repeat(2 * 1024) }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  await collectPopupExportPagePackages(active, new Map([[7, { id: 7 } as chrome.tabs.Tab]]));

  for (const [, patch] of vi.mocked(updatePagePackageJobStatus).mock.calls) {
    expect(
      parsePagePackageJobStatusV1({
        ...active.status,
        ...patch,
        revision: active.status.revision + 1,
      })
    ).not.toBeNull();
  }
});

it('rejects a replayed descriptor bound to another ordinal', async () => {
  const request = vi.fn().mockResolvedValue({ success: true, stagedPagePackage: descriptor(1) });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result.packages).toEqual([]);
  expect(result.errors).toEqual(['One: Page Package response is bound to another job page.']);
});
