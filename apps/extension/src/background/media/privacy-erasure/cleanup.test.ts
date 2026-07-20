import { beforeEach, expect, it, vi } from 'vitest';
import {
  createRunningExportLedger as runningExport,
  recordingLease as lease,
} from './cleanup.test-support';

const {
  clearActiveVideoRecordingLeaseMock,
  closeOffscreenDocumentForPrivacyErasureMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  finishVideoRecordingStopMock,
  getCurrentRecordingIdMock,
  inspectActiveProjectExportJobLedgerEntryMock,
  inspectPersistedLeaseMock,
  requestProjectExportJobCancelMock,
  resetRecordingIdMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  resetVideoRecordingStartSessionMock,
  sendRuntimeMessageMock,
  stopRecordingForPrivacyErasureMock,
  waitForStopSideEffectsMock,
} = vi.hoisted(() => ({
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  closeOffscreenDocumentForPrivacyErasureMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  getCurrentRecordingIdMock: vi.fn(),
  inspectActiveProjectExportJobLedgerEntryMock: vi.fn(),
  inspectPersistedLeaseMock: vi.fn(),
  requestProjectExportJobCancelMock: vi.fn(),
  resetRecordingIdMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  resetVideoRecordingStartSessionMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  stopRecordingForPrivacyErasureMock: vi.fn(),
  waitForStopSideEffectsMock: vi.fn(),
}));

vi.mock('../video/recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../video/recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
}));
vi.mock('../video/runtime/manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../video/runtime/manager')>()),
  getCurrentRecordingId: getCurrentRecordingIdMock,
  resetRecordingId: resetRecordingIdMock,
  resetRecordingTabId: resetRecordingTabIdMock,
  stopRecordingForPrivacyErasure: stopRecordingForPrivacyErasureMock,
}));
vi.mock('../video/runtime/manager/controls.stop/effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../video/runtime/manager/controls.stop/effects')>()),
  waitForStopSideEffects: waitForStopSideEffectsMock,
}));
vi.mock('../video/runtime/offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../video/runtime/offscreen-manager')>()),
  closeOffscreenDocumentForPrivacyErasure: closeOffscreenDocumentForPrivacyErasureMock,
}));
vi.mock('../video/runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../video/runtime/session-state')>()),
  resetVideoRecordingRuntimeState: resetVideoRecordingRuntimeStateMock,
}));
vi.mock('../video/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../video/session-state')>()),
  finishVideoRecordingStop: finishVideoRecordingStopMock,
  resetVideoRecordingStartSession: resetVideoRecordingStartSessionMock,
}));
vi.mock('../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/export-ledger')>()),
  inspectActiveProjectExportJobLedgerEntry: inspectActiveProjectExportJobLedgerEntryMock,
  requestProjectExportJobCancel: requestProjectExportJobCancelMock,
}));
vi.mock('../../storage/video/recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/video/recording-control-lease')>()),
  inspectPersistedLease: inspectPersistedLeaseMock,
}));
vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { mediaPrivacyErasureCleanupAdapter } from './cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
  closeOffscreenDocumentForPrivacyErasureMock.mockResolvedValue(undefined);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  getCurrentRecordingIdMock.mockReturnValue(null);
  inspectActiveProjectExportJobLedgerEntryMock.mockResolvedValue({ status: 'absent' });
  inspectPersistedLeaseMock.mockResolvedValue({ status: 'absent' });
  requestProjectExportJobCancelMock.mockResolvedValue(null);
  sendRuntimeMessageMock.mockResolvedValue({ success: true, result: 'accepted' });
  stopRecordingForPrivacyErasureMock.mockResolvedValue({ result: 'no-active-recording' });
  waitForStopSideEffectsMock.mockResolvedValue(undefined);
});

it('hydrates and terminates a persisted recording before clearing its durable lease', async () => {
  inspectPersistedLeaseMock
    .mockResolvedValueOnce({ lease, status: 'entry' })
    .mockResolvedValueOnce({ status: 'absent' });
  ensureActiveVideoRecordingLeaseHydratedMock
    .mockResolvedValueOnce(lease)
    .mockResolvedValueOnce(null);
  getCurrentRecordingIdMock.mockReturnValue('recording-1');
  stopRecordingForPrivacyErasureMock.mockResolvedValueOnce({ result: 'accepted' });

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(stopRecordingForPrivacyErasureMock).toHaveBeenCalledOnce();
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('recording-1');
  expect(ensureActiveVideoRecordingLeaseHydratedMock).toHaveBeenCalledTimes(2);
  expect(result).toContainEqual(
    expect.objectContaining({ id: 'recording-runtime-state', status: 'verified-empty' })
  );
  expect(resetRecordingIdMock).toHaveBeenCalledOnce();
  expect(resetRecordingTabIdMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingStartSessionMock).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeStateMock).toHaveBeenCalledOnce();
});

it('closes detached offscreen persistence without a lease and stays idempotent', async () => {
  const first = await mediaPrivacyErasureCleanupAdapter.cleanup();
  const second = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(first).toEqual(second);
  expect(stopRecordingForPrivacyErasureMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(closeOffscreenDocumentForPrivacyErasureMock).toHaveBeenCalledTimes(2);
  expect(first).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'recording-runtime-state', status: 'verified-empty' }),
      expect.objectContaining({ id: 'project-export-runtime-state', status: 'verified-empty' }),
      expect.objectContaining({ id: 'offscreen-export-runtime-state', status: 'verified-empty' }),
    ])
  );
});

it('durably requests export cancellation and verifies the terminal ledger', async () => {
  inspectActiveProjectExportJobLedgerEntryMock
    .mockResolvedValueOnce({ entry: runningExport(), status: 'entry' })
    .mockResolvedValueOnce({
      entry: { ...runningExport(), cancelRequested: true, status: 'cancelled' },
      status: 'entry',
    });
  requestProjectExportJobCancelMock.mockResolvedValueOnce({
    ...runningExport(),
    cancelRequested: true,
  });

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(requestProjectExportJobCancelMock).toHaveBeenCalledWith('job-1');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      capabilityToken: expect.any(String),
      jobId: 'job-1',
      type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
    })
  );
  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'project-export-runtime-state', status: 'verified-empty' }),
      expect.objectContaining({ id: 'offscreen-export-runtime-state', status: 'verified-empty' }),
    ])
  );
});

it('returns retryable failures for in-progress or inconsistent recording state', async () => {
  inspectPersistedLeaseMock.mockResolvedValue({ lease, status: 'entry' });
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(lease);
  getCurrentRecordingIdMock.mockReturnValue('recording-1');
  stopRecordingForPrivacyErasureMock.mockResolvedValueOnce({ result: 'already-stopping' });

  const stopping = await mediaPrivacyErasureCleanupAdapter.cleanup();
  expect(stopping).toContainEqual(
    expect.objectContaining({
      error: 'recording-stop-in-progress',
      id: 'recording-runtime-state',
      status: 'failed',
    })
  );
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();

  stopRecordingForPrivacyErasureMock.mockResolvedValueOnce({ result: 'no-active-recording' });
  const unavailable = await mediaPrivacyErasureCleanupAdapter.cleanup();
  expect(unavailable).toContainEqual(
    expect.objectContaining({
      error: 'recording-runtime-state-unavailable',
      id: 'recording-runtime-state',
      status: 'failed',
    })
  );
});

it('does not claim recording cleanup when required lease removal fails', async () => {
  inspectPersistedLeaseMock.mockResolvedValueOnce({ lease, status: 'entry' });
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValueOnce(lease);
  stopRecordingForPrivacyErasureMock.mockResolvedValueOnce({ result: 'accepted' });
  clearActiveVideoRecordingLeaseMock.mockRejectedValueOnce(new Error('sensitive storage error'));

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toContainEqual(
    expect.objectContaining({
      error: 'recording-lease-cleanup-failed',
      id: 'recording-runtime-state',
      status: 'failed',
    })
  );
  expect(resetRecordingIdMock).not.toHaveBeenCalled();
});

it('returns a fixed partial failure when offscreen export cancellation fails', async () => {
  inspectActiveProjectExportJobLedgerEntryMock.mockResolvedValueOnce({
    entry: runningExport(),
    status: 'entry',
  });
  requestProjectExportJobCancelMock.mockResolvedValueOnce({
    ...runningExport(),
    cancelRequested: true,
  });
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('secret-bearing failure'));

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toContainEqual({
    id: 'project-export-runtime-state',
    remainingCount: 0,
    severity: 'required',
    status: 'verified-empty',
  });
  expect(result).toContainEqual(
    expect.objectContaining({
      error: 'offscreen-export-cancel-failed',
      id: 'offscreen-export-runtime-state',
      status: 'failed',
    })
  );
  expect(JSON.stringify(result)).not.toContain('secret-bearing');
});

it('requires a terminal export ledger before reporting media cleanup success', async () => {
  inspectActiveProjectExportJobLedgerEntryMock
    .mockResolvedValueOnce({ entry: runningExport(), status: 'entry' })
    .mockResolvedValueOnce({
      entry: { ...runningExport(), cancelRequested: true },
      status: 'entry',
    });
  requestProjectExportJobCancelMock.mockResolvedValueOnce({
    ...runningExport(),
    cancelRequested: true,
  });

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        error: 'project-export-terminal-verification-failed',
        id: 'project-export-runtime-state',
        status: 'failed',
      }),
      expect.objectContaining({
        error: 'project-export-terminal-verification-failed',
        id: 'offscreen-export-runtime-state',
        status: 'failed',
      }),
    ])
  );
});

it('fails closed when durable media storage is unavailable', async () => {
  inspectPersistedLeaseMock.mockResolvedValueOnce({ status: 'unavailable' });
  inspectActiveProjectExportJobLedgerEntryMock.mockResolvedValueOnce({ status: 'unavailable' });

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        error: 'media-authority-read-unavailable',
        id: 'recording-runtime-state',
        status: 'failed',
      }),
      expect.objectContaining({
        error: 'media-authority-read-unavailable',
        id: 'project-export-runtime-state',
        status: 'failed',
      }),
    ])
  );
  expect(stopRecordingForPrivacyErasureMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});
