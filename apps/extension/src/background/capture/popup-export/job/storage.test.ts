import { beforeEach, expect, it, vi } from 'vitest';
import type { PopupExportJobStatus } from '@sniptale/runtime-contracts/export';

const mocks = vi.hoisted(() => ({
  available: vi.fn(() => true),
  get: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: mocks.get,
      isAvailable: mocks.available,
      remove: mocks.remove,
      set: mocks.set,
    },
  },
}));

import {
  clearPopupExportJobStatus,
  interruptStoredPopupExportJob,
  readPopupExportJobStatus,
  writePopupExportJobStatus,
} from './storage';
import { reservePopupExportErasureExclusion } from './lifecycle-gate';

beforeEach(() => vi.clearAllMocks());

function createStoredStatus(
  phase: PopupExportJobStatus['phase'],
  overrides: Partial<PopupExportJobStatus> = {}
): PopupExportJobStatus {
  return {
    activatedTabIds: [],
    effectiveOptions: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: phase === 'running',
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
      includePageDiagnostics: false,
    },
    jobId: 'job-fixture',
    orderedTabs: [],
    originalActiveTabs: [],
    phase,
    progress: {
      current: phase === 'completed' ? 1 : 0,
      errors: [],
      message: phase === 'completed' ? 'Done' : 'Running',
      phase: phase === 'completed' ? 'done' : 'scanning',
      total: 1,
    },
    revision: 1,
    warnings: [],
    ...overrides,
  };
}

it('marks unfinished session metadata interrupted after a worker restart', async () => {
  mocks.get.mockResolvedValue({
    sniptale_popup_export_job: createStoredStatus('running', {
      jobId: 'job-1',
      revision: 3,
      orderedTabs: [{ tabId: 11, title: 'One' }],
    }),
  });

  await interruptStoredPopupExportJob();

  expect(mocks.set).toHaveBeenCalledWith({
    sniptale_popup_export_job: expect.objectContaining({
      phase: 'interrupted',
      revision: 4,
      progress: expect.objectContaining({ phase: 'error' }),
    }),
  });
});

it('does not recreate interrupted metadata while privacy erasure is reserved', async () => {
  const erasure = reservePopupExportErasureExclusion();
  mocks.get.mockResolvedValue({
    sniptale_popup_export_job: createStoredStatus('running', {
      jobId: 'job-erased',
      orderedTabs: [{ tabId: 11, title: 'Erased' }],
    }),
  });

  try {
    await interruptStoredPopupExportJob();
  } finally {
    erasure.release();
  }

  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});

it('ignores invalid and terminal metadata and supports unavailable session storage', async () => {
  mocks.get.mockResolvedValueOnce({ sniptale_popup_export_job: { phase: 'running' } });
  await expect(readPopupExportJobStatus()).resolves.toBeNull();

  mocks.get.mockResolvedValueOnce({
    sniptale_popup_export_job: createStoredStatus('completed', {
      jobId: 'job-2',
    }),
  });
  await interruptStoredPopupExportJob();
  expect(mocks.set).not.toHaveBeenCalled();

  mocks.available.mockReturnValue(false);
  await expect(readPopupExportJobStatus()).resolves.toBeNull();
  await writePopupExportJobStatus(createStoredStatus('completed'));
  await clearPopupExportJobStatus();
  expect(mocks.remove).not.toHaveBeenCalled();
});
