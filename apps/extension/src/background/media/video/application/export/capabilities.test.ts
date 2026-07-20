import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { translate } from '../../../../../platform/i18n';
import { reserveMediaErasureExclusion } from '../../../lifecycle-gate';
import { getProjectExportCapabilitiesUseCase } from './capabilities';
import {
  createProjectExportPorts as createPorts,
  createProjectExportSettings as createSettings,
  PROJECT_EXPORT_OWNER as owner,
} from './use-case.test-support';

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects capability issuance while local data erasure owns media lifecycle', async () => {
  const ports = createPorts();
  let releaseErasure!: () => void;
  const erasureGate = new Promise<void>((resolve) => {
    releaseErasure = resolve;
  });
  const exclusion = reserveMediaErasureExclusion();
  const erasure = erasureGate.finally(() => exclusion.release());

  await expect(
    getProjectExportCapabilitiesUseCase(
      { jobId: 'job-blocked', settings: createSettings() },
      owner,
      ports
    )
  ).resolves.toEqual({
    error: 'Local data erasure is in progress',
    success: false,
  });
  expect(ports.ensureOffscreenDocument).not.toHaveBeenCalled();
  expect(ports.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(ports.issueProjectExportStartCapability).not.toHaveBeenCalled();
  expect(ports.issueProjectExportCancelCapability).not.toHaveBeenCalled();

  releaseErasure();
  await erasure;
});

it('returns a cancel capability for a running job owned by the requester', async () => {
  const ports = createPorts();
  vi.mocked(ports.loadActiveProjectExportJobLedgerEntry).mockResolvedValueOnce({
    jobId: 'job-2',
    ownerDocumentId: owner.documentId,
    ownerSenderUrl: owner.senderUrl,
    status: 'running',
  });
  vi.mocked(ports.issueProjectExportCancelCapability).mockResolvedValueOnce('cancel-token-2');

  await expect(
    getProjectExportCapabilitiesUseCase(
      { jobId: 'job-2', settings: createSettings() },
      owner,
      ports
    )
  ).resolves.toEqual({
    success: true,
    cancelCapabilityToken: 'cancel-token-2',
    ownerDocumentId: owner.documentId,
  });
});

it('returns probe failures without issuing project job capabilities', async () => {
  const ports = createPorts();
  vi.mocked(ports.sendRuntimeMessage).mockResolvedValueOnce({
    error: 'unsupported format',
    success: false,
  });

  await expect(
    getProjectExportCapabilitiesUseCase(
      { jobId: 'job-probe-failed', settings: createSettings() },
      owner,
      ports
    )
  ).resolves.toEqual({ error: 'unsupported format', success: false });

  expect(ports.loadActiveProjectExportJobLedgerEntry).not.toHaveBeenCalled();
  expect(ports.issueProjectExportStartCapability).not.toHaveBeenCalled();
  expect(ports.issueProjectExportCancelCapability).not.toHaveBeenCalled();
});

it('rejects capability issuance for a running export owned by another requester', async () => {
  const ports = createPorts();
  vi.mocked(ports.loadActiveProjectExportJobLedgerEntry).mockResolvedValueOnce({
    jobId: 'job-other-owner',
    ownerDocumentId: 'other-document',
    ownerSenderUrl: owner.senderUrl,
    status: 'running',
  });

  await expect(
    getProjectExportCapabilitiesUseCase(
      { jobId: 'job-other-owner', settings: createSettings() },
      owner,
      ports
    )
  ).resolves.toEqual({
    error: translate('offscreenExport.alreadyRunning'),
    success: false,
  });

  expect(ports.issueProjectExportCancelCapability).not.toHaveBeenCalled();
  expect(ports.issueProjectExportStartCapability).not.toHaveBeenCalled();
});

it('issues a start capability after a warm offscreen probe reconciles a stale ledger', async () => {
  const ports = createPorts();
  const loadLedger = vi.mocked(ports.loadActiveProjectExportJobLedgerEntry);
  const sendRuntimeMessage = vi.mocked(ports.sendRuntimeMessage);
  loadLedger.mockResolvedValue({
    jobId: 'job-stale',
    ownerDocumentId: 'stale-document',
    ownerSenderUrl: owner.senderUrl,
    status: 'running',
  });
  sendRuntimeMessage.mockImplementationOnce(async () => {
    loadLedger.mockResolvedValueOnce(null);
    return { success: true };
  });
  vi.mocked(ports.issueProjectExportStartCapability).mockResolvedValueOnce('start-token-new');

  await expect(
    getProjectExportCapabilitiesUseCase(
      { jobId: 'job-new', settings: createSettings() },
      owner,
      ports
    )
  ).resolves.toEqual({
    success: true,
    capabilityToken: 'start-token-new',
    ownerDocumentId: owner.documentId,
  });

  expect(sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
    })
  );
  expect(sendRuntimeMessage.mock.invocationCallOrder[0]).toBeLessThan(
    loadLedger.mock.invocationCallOrder[0] ?? 0
  );
});

it('does not return a job capability when probing without a job id', async () => {
  const ports = createPorts();

  await expect(
    getProjectExportCapabilitiesUseCase({ settings: createSettings() }, owner, ports)
  ).resolves.toEqual({ success: true });

  expect(ports.loadActiveProjectExportJobLedgerEntry).not.toHaveBeenCalled();
  expect(ports.issueProjectExportStartCapability).not.toHaveBeenCalled();
});

it('returns a start capability when no running ledger blocks the job', async () => {
  const ports = createPorts();
  vi.mocked(ports.issueProjectExportStartCapability).mockResolvedValueOnce('start-token-3');

  await expect(
    getProjectExportCapabilitiesUseCase(
      { jobId: 'job-3', settings: createSettings() },
      owner,
      ports
    )
  ).resolves.toEqual({
    success: true,
    capabilityToken: 'start-token-3',
    ownerDocumentId: owner.documentId,
  });
});
