import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string, locale?: string) => `${key}:${locale ?? 'current'}`,
}));
vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  appendPopupExportJobWarning: vi.fn(async () => undefined),
  updatePagePackageJobStatus: vi.fn(async () => undefined),
}));
vi.mock('./visible', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./visible')>()),
  activatePopupExportCaptureTarget: vi.fn(async () => undefined),
}));
vi.mock('./page-readiness', () => ({
  waitForPagePackageCaptureReadiness: vi.fn(async () => undefined),
}));
import type { ActivePopupExportJob, PopupExportJobContentPort } from './runtime-state';
import { translate } from '../../../../platform/i18n';
import { appendPopupExportJobWarning, updatePagePackageJobStatus } from './runtime-state';
import { parsePagePackageJobStatusV1 } from './status';
import { collectPopupExportPagePackages } from './page-phase';
import { activatePopupExportCaptureTarget } from './visible';
import { waitForPagePackageCaptureReadiness } from './page-readiness';

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
    locale: 'en',
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
      progress: {
        current: 0,
        errors: [],
        message: '',
        phase: 'scanning',
        total: 2,
      },
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
    producerStats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    stagedBlobId: `stage-${ordinal}`,
    title: `Page ${ordinal}`,
    totalBytes: 20,
  };
}

function expectedPageError(
  title: string,
  detailKey: Parameters<typeof translate>[0] = 'popup.export.pagePreparationErrorDetail'
): string {
  return `${translate('content.runtime.exportPrepareFailed', 'en')}. ${translate(
    detailKey,
    'en'
  )} (${title})`;
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
  expect(result.errors).toEqual([expectedPageError('Two')]);
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

it('publishes page collection as a partial progress patch', async () => {
  const request = vi.fn().mockResolvedValue({ success: true, stagedPagePackage: descriptor(0) });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];
  active.status.progress = {
    ...active.status.progress,
    activeStepKey: 'files',
    completedStepKeys: ['json', 'markdown'],
    failedStepKeys: ['images'],
  };

  await collectPopupExportPagePackages(active, new Map([[7, { id: 7 } as chrome.tabs.Tab]]));

  expect(updatePagePackageJobStatus).toHaveBeenCalledWith(active, {
    progress: {
      current: 0,
      errors: [],
      message: `${translate('popup.export.batchCollectingMessage', 'en')} One`,
      phase: 'downloading',
      total: 1,
    },
  });
});

it('keeps progress copy in the locale captured for the active job', async () => {
  const request = vi.fn().mockResolvedValue({ success: true, stagedPagePackage: descriptor(0) });
  const active = job(request);
  active.locale = 'ru';
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  await collectPopupExportPagePackages(active, new Map([[7, { id: 7 } as chrome.tabs.Tab]]));

  expect(updatePagePackageJobStatus).toHaveBeenCalledWith(
    active,
    expect.objectContaining({
      progress: expect.objectContaining({
        message: `${translate('popup.export.batchCollectingMessage', 'ru')} One`,
      }),
    })
  );
});

it('does not expose a raw page-readiness error through progress UI', async () => {
  vi.mocked(waitForPagePackageCaptureReadiness).mockRejectedValueOnce(
    new Error('net::ERR_PRIVATE_DETAIL')
  );
  const active = job(vi.fn());
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result.errors).toEqual([
    expectedPageError('One', 'popup.export.pageReadinessErrorDetail'),
  ]);
  expect(result.errors.join(' ')).not.toContain('ERR_PRIVATE_DETAIL');
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

it('localizes a screenshot activation warning and continues collecting the page', async () => {
  vi.mocked(activatePopupExportCaptureTarget).mockRejectedValueOnce(
    new Error('private activation detail')
  );
  const request = vi.fn().mockResolvedValue({ success: true, stagedPagePackage: descriptor(0) });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result.packages).toHaveLength(1);
  expect(appendPopupExportJobWarning).toHaveBeenCalledWith(
    active,
    `One: ${translate('content.runtime.captureFullPageScreenshotFailed', 'en')}`
  );
  expect(JSON.stringify(vi.mocked(appendPopupExportJobWarning).mock.calls)).not.toContain(
    'private activation detail'
  );
});

it('replaces a thrown string with localized page-preparation detail', async () => {
  const request = vi.fn().mockRejectedValue('private producer detail');
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result.errors).toEqual([expectedPageError('One')]);
  expect(result.errors.join(' ')).not.toContain('private producer detail');
});

it('adds localized page-preparation detail when a failed response has no error text', async () => {
  const request = vi.fn().mockResolvedValue({ success: false });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result.errors).toEqual([expectedPageError('One')]);
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

it('starts readiness waits for every available page before collecting the first package', async () => {
  const sequence: string[] = [];
  vi.mocked(waitForPagePackageCaptureReadiness).mockImplementation(async ({ tabId }) => {
    sequence.push(`ready-${tabId}`);
  });
  const request = vi.fn(async ({ ordinal }: { ordinal: number }) => {
    sequence.push(`build-${ordinal}`);
    return { success: true, stagedPagePackage: descriptor(ordinal) };
  });

  await collectPopupExportPagePackages(
    job(request),
    new Map([
      [7, { id: 7 } as chrome.tabs.Tab],
      [8, { id: 8 } as chrome.tabs.Tab],
    ])
  );

  expect(sequence).toEqual(['ready-7', 'ready-8', 'build-0', 'build-1']);
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

it('does not turn an expected in-flight cancellation into a page failure', async () => {
  let active: ActivePopupExportJob;
  const request = vi.fn(async () => {
    active.cancelled = true;
    throw new Error('Full-page capture cancelled');
  });
  active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result).toEqual({ errors: [], packages: [] });
  expect(active.status.pageOutcomes).toEqual([{ ordinal: 0, status: 'pending', tabId: 7 }]);
});

it('stops waiting for an unresolved page producer when the job is cancelled', async () => {
  const request = vi.fn(() => new Promise<never>(() => undefined));
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];
  active.status.pageOutcomes = [{ ordinal: 0, status: 'pending', tabId: 7 }];

  const collection = collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  active.cancelled = true;
  active.abortController.abort(new Error('Popup export cancelled'));

  await expect(collection).resolves.toEqual({ errors: [], packages: [] });
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

  expect(result.errors).toEqual([expectedPageError('One')]);
  expect(result.errors.join(' ')).not.toContain(privateDetail);
});

it('retains only the bounded preparation diagnostic code from a content failure', async () => {
  const request = vi.fn().mockResolvedValue({
    success: false,
    error: 'Не удалось подготовить экспорт [ARCHIVE_STAGING]',
  });
  const active = job(request);
  active.status.orderedTabs = [{ tabId: 7, title: 'One' }];

  const result = await collectPopupExportPagePackages(
    active,
    new Map([[7, { id: 7 } as chrome.tabs.Tab]])
  );

  expect(result.errors).toEqual([
    expectedPageError('One', 'popup.export.temporaryStorageErrorDetail'),
  ]);
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
  expect(result.errors).toEqual([expectedPageError('One')]);
});
