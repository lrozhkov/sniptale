import { beforeEach, expect, it, vi } from 'vitest';
import { recordingLease } from './cleanup.test-support';

const {
  clearActiveVideoRecordingLeaseMock,
  clearProjectExportJobLedgerForPrivacyErasureMock,
  closeOffscreenDocumentForPrivacyErasureMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  finishVideoRecordingStopMock,
  getCurrentRecordingIdMock,
  inspectActiveProjectExportJobLedgerEntryMock,
  inspectPersistedLeaseMock,
  resetRecordingIdMock,
  resetRecordingTabIdMock,
  resetVideoRecordingRuntimeStateMock,
  resetVideoRecordingStartSessionMock,
  stopRecordingForPrivacyErasureMock,
  waitForStopSideEffectsMock,
} = vi.hoisted(() => ({
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  clearProjectExportJobLedgerForPrivacyErasureMock: vi.fn(),
  closeOffscreenDocumentForPrivacyErasureMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  finishVideoRecordingStopMock: vi.fn(),
  getCurrentRecordingIdMock: vi.fn(),
  inspectActiveProjectExportJobLedgerEntryMock: vi.fn(),
  inspectPersistedLeaseMock: vi.fn(),
  resetRecordingIdMock: vi.fn(),
  resetRecordingTabIdMock: vi.fn(),
  resetVideoRecordingRuntimeStateMock: vi.fn(),
  resetVideoRecordingStartSessionMock: vi.fn(),
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
}));
vi.mock('../../../composition/persistence/export-ledger/privacy-erasure', () => ({
  clearProjectExportJobLedgerForPrivacyErasure: clearProjectExportJobLedgerForPrivacyErasureMock,
}));
vi.mock('../../storage/video/recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/video/recording-control-lease')>()),
  inspectPersistedLease: inspectPersistedLeaseMock,
}));

import { mediaPrivacyErasureCleanupAdapter } from './cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
  clearProjectExportJobLedgerForPrivacyErasureMock.mockResolvedValue(undefined);
  closeOffscreenDocumentForPrivacyErasureMock.mockResolvedValue(undefined);
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  getCurrentRecordingIdMock.mockReturnValue(null);
  inspectActiveProjectExportJobLedgerEntryMock.mockResolvedValue({ status: 'absent' });
  inspectPersistedLeaseMock.mockResolvedValue({ status: 'absent' });
  stopRecordingForPrivacyErasureMock.mockResolvedValue({ result: 'no-active-recording' });
  waitForStopSideEffectsMock.mockResolvedValue(undefined);
});

it('drains delayed stop persistence before clearing the recording authority', async () => {
  let releaseSideEffects!: () => void;
  waitForStopSideEffectsMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      releaseSideEffects = resolve;
    })
  );
  inspectPersistedLeaseMock
    .mockResolvedValueOnce({ lease: recordingLease, status: 'entry' })
    .mockResolvedValueOnce({ status: 'absent' });
  ensureActiveVideoRecordingLeaseHydratedMock
    .mockResolvedValueOnce(recordingLease)
    .mockResolvedValueOnce(null);
  getCurrentRecordingIdMock.mockReturnValue(recordingLease.recordingId);
  stopRecordingForPrivacyErasureMock.mockResolvedValueOnce({ result: 'accepted' });

  const cleanup = mediaPrivacyErasureCleanupAdapter.cleanup();
  await vi.waitFor(() => expect(waitForStopSideEffectsMock).toHaveBeenCalledOnce());

  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();

  releaseSideEffects();
  await expect(cleanup).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'recording-runtime-state', status: 'verified-empty' }),
    ])
  );
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith(recordingLease.recordingId);
  expect(finishVideoRecordingStopMock).toHaveBeenCalledOnce();
});

it('preserves the durable lease when strict offscreen termination is not acknowledged', async () => {
  inspectPersistedLeaseMock.mockResolvedValueOnce({ lease: recordingLease, status: 'entry' });
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValueOnce(recordingLease);
  getCurrentRecordingIdMock.mockReturnValue(recordingLease.recordingId);
  stopRecordingForPrivacyErasureMock.mockResolvedValueOnce({
    error: 'Offscreen recording stop acknowledgement missing',
    result: 'failed',
  });

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toContainEqual(
    expect.objectContaining({
      error: 'recording-stop-failed',
      id: 'recording-runtime-state',
      status: 'failed',
    })
  );
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
});

it('quiesces offscreen work and removes corrupt durable media authorities before retry', async () => {
  inspectPersistedLeaseMock.mockResolvedValueOnce({ status: 'invalid' });
  inspectActiveProjectExportJobLedgerEntryMock.mockResolvedValueOnce({ status: 'invalid' });

  const recovered = await mediaPrivacyErasureCleanupAdapter.cleanup();
  const retried = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(recovered.every((participant) => participant.status === 'verified-empty')).toBe(true);
  expect(retried).toEqual(recovered);
  expect(closeOffscreenDocumentForPrivacyErasureMock).toHaveBeenCalledTimes(2);
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledOnce();
  expect(clearProjectExportJobLedgerForPrivacyErasureMock).toHaveBeenCalledOnce();
  expect(closeOffscreenDocumentForPrivacyErasureMock.mock.invocationCallOrder[0]).toBeLessThan(
    clearActiveVideoRecordingLeaseMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(finishVideoRecordingStopMock).toHaveBeenCalledTimes(2);
});

it('waits for verified offscreen closure before reporting media cleanup success', async () => {
  let resolveClose!: () => void;
  closeOffscreenDocumentForPrivacyErasureMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveClose = resolve;
    })
  );

  const cleanup = mediaPrivacyErasureCleanupAdapter.cleanup();
  await vi.waitFor(() =>
    expect(closeOffscreenDocumentForPrivacyErasureMock).toHaveBeenCalledOnce()
  );
  let settled = false;
  void cleanup.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);

  resolveClose();
  await expect(cleanup).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'recording-runtime-state', status: 'verified-empty' }),
    ])
  );
});

it('fails closed when the offscreen context cannot be verified absent', async () => {
  closeOffscreenDocumentForPrivacyErasureMock.mockRejectedValueOnce(
    new Error('offscreen remained active')
  );

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toContainEqual({
    error: 'offscreen-media-close-failed',
    id: 'recording-runtime-state',
    severity: 'required',
    status: 'failed',
  });
});

it('does not claim recovery when a corrupt authority remains after removal', async () => {
  inspectPersistedLeaseMock
    .mockResolvedValueOnce({ status: 'invalid' })
    .mockResolvedValueOnce({ status: 'invalid' });
  inspectActiveProjectExportJobLedgerEntryMock
    .mockResolvedValueOnce({ status: 'invalid' })
    .mockResolvedValueOnce({ status: 'absent' });

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toContainEqual(
    expect.objectContaining({
      error: 'invalid-media-state-recovery-unverified',
      id: 'recording-runtime-state',
      status: 'failed',
    })
  );
  expect(finishVideoRecordingStopMock).not.toHaveBeenCalled();
});

it('keeps corrupt durable state visible when offscreen quiescence cannot be verified', async () => {
  inspectPersistedLeaseMock.mockResolvedValueOnce({ status: 'invalid' });
  inspectActiveProjectExportJobLedgerEntryMock.mockResolvedValueOnce({ status: 'invalid' });
  closeOffscreenDocumentForPrivacyErasureMock.mockRejectedValueOnce(
    new Error('context inspection unavailable')
  );

  const result = await mediaPrivacyErasureCleanupAdapter.cleanup();

  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        error: 'invalid-media-state-recovery-failed',
        status: 'failed',
      }),
    ])
  );
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(clearProjectExportJobLedgerForPrivacyErasureMock).not.toHaveBeenCalled();
});
