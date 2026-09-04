import { expect, it, vi } from 'vitest';
import { applyPopupExportRuntimeMessage } from './apply';

it('keeps raw background job failures out of popup progress and results', () => {
  const setProgress = vi.fn();
  const setResult = vi.fn();
  const rawFailure = 'PAGE_READINESS: chrome-extension://secret/path';
  const status = {
    jobId: 'job-1',
    revision: 1,
    phase: 'failed',
    orderedTabs: [],
    effectiveOptions: {},
    effectiveComponentPlan: { components: {}, includeScreenshot: false },
    progress: { current: 0, errors: [rawFailure], message: rawFailure, phase: 'error', total: 1 },
    warnings: [],
    originalActiveTabs: [],
    activatedTabIds: [],
    result: { errors: [rawFailure], packages: [], success: false },
  };

  applyPopupExportRuntimeMessage({
    clearRequestId: vi.fn(),
    latestStatus: null,
    message: { locale: 'en', status, type: 'PAGE_PACKAGE_JOB_STATUS_UPDATED' },
    requestId: 'job-1',
    setLatestStatus: vi.fn(),
    setProgress,
    setResult,
  } as never);

  expect(JSON.stringify(setProgress.mock.calls)).not.toContain(rawFailure);
  expect(JSON.stringify(setResult.mock.calls)).not.toContain(rawFailure);
  expect(JSON.stringify(setProgress.mock.calls)).toContain('Failed to prepare export');
  expect(JSON.stringify(setResult.mock.calls)).toContain('Failed to prepare export');
  expect(setProgress).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('Failed to prepare export') })
  );
});
