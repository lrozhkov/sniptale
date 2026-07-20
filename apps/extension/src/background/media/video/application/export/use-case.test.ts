import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { cancelProjectExportUseCase, startProjectExportUseCase } from './use-case';
import { reserveMediaErasureExclusion } from '../../../lifecycle-gate';
import {
  createProjectExportInputReference as createInputReference,
  createProjectExportPorts as createPorts,
  createProjectExportSettings as createSettings,
  PROJECT_EXPORT_OWNER as owner,
} from './use-case.test-support';

beforeEach(() => {
  vi.clearAllMocks();
});

it('reserves the ledger and sends an offscreen start command', async () => {
  const ports = createPorts();
  const settings = createSettings();

  await expect(
    startProjectExportUseCase(
      { input: createInputReference(), jobId: 'job-1', settings },
      owner,
      ports
    )
  ).resolves.toEqual({
    success: true,
    capabilityToken: 'cancel-token',
    jobId: 'job-1',
    ownerDocumentId: 'document-1',
  });

  expect(ports.reserveProjectExportJobLedgerEntry).toHaveBeenCalledWith({
    jobId: 'job-1',
    ownerDocumentId: 'document-1',
    ownerSenderUrl: owner.senderUrl,
    projectId: 'project-1',
  });
  expect(ports.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      capabilityToken: 'offscreen',
      input: createInputReference(),
      jobId: 'job-1',
      settings,
    })
  );
});

it('rejects export start before side effects while local data erasure owns media lifecycle', async () => {
  const ports = createPorts();
  let releaseErasure!: () => void;
  const erasureGate = new Promise<void>((resolve) => {
    releaseErasure = resolve;
  });
  const exclusion = reserveMediaErasureExclusion();
  const erasure = erasureGate.finally(() => exclusion.release());

  await expect(
    startProjectExportUseCase(
      {
        input: createInputReference('job-blocked'),
        jobId: 'job-blocked',
        settings: createSettings(),
      },
      owner,
      ports
    )
  ).rejects.toThrow('Local data erasure is in progress');
  expect(ports.ensureOffscreenDocument).not.toHaveBeenCalled();
  expect(ports.reserveProjectExportJobLedgerEntry).not.toHaveBeenCalled();
  expect(ports.sendRuntimeMessage).not.toHaveBeenCalled();

  releaseErasure();
  await erasure;
});

it('requests cancellation and rejects failed offscreen cancel acknowledgements', async () => {
  const ports = createPorts();
  vi.mocked(ports.sendRuntimeMessage).mockResolvedValueOnce({
    error: 'cancel rejected',
    success: false,
  });

  await expect(cancelProjectExportUseCase({ jobId: 'job-4' }, ports)).rejects.toThrow(
    'cancel rejected'
  );

  expect(ports.requestProjectExportJobCancel).toHaveBeenCalledWith('job-4');
  expect(ports.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
      jobId: 'job-4',
    })
  );
});
