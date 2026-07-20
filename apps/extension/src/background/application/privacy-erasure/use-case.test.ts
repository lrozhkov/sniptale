import { expect, it, vi } from 'vitest';

import { acquireDiagnosticsMutationPermit } from '../../diagnostics/lifecycle-gate';
import { acquireMediaMutationPermit } from '../../media/lifecycle-gate';
import { acquireNativeIngestionPermit } from '../../capture/native-app/lifecycle-gate';
import { PrivacyErasureUseCase } from './use-case';
import {
  createErasureRequest,
  createPorts,
  failed,
  storageResult,
  verified,
} from './use-case.test-support';

it('runs owner cleanup in the explicit order and merges the typed aggregate', async () => {
  const order: string[] = [];
  const useCase = new PrivacyErasureUseCase(createPorts(order));

  const result = await useCase.execute(createErasureRequest());

  expect(order).toEqual(['media', 'diagnostics', 'native-ingestion', 'runtime', 'storage']);
  expect(result).toEqual(
    expect.objectContaining({
      failedRequiredParticipantIds: [],
      indexedDbStoresCleared: 19,
      success: true,
      participants: [
        verified('recording-runtime-state'),
        verified('diagnostics-runtime-state'),
        verified('native-ingestion-runtime-state'),
        verified('background-runtime-state'),
        verified('indexed-db:core'),
      ],
    })
  );
});

it('returns a fixed typed partial result and short-circuits after a media failure', async () => {
  const ports = createPorts();
  vi.mocked(ports.media.cleanup).mockRejectedValueOnce(new Error('secret-bearing failure'));
  const useCase = new PrivacyErasureUseCase(ports);

  await expect(useCase.execute(createErasureRequest())).resolves.toEqual({
    failedRequiredParticipantIds: ['media-runtime-state'],
    indexedDbStoresCleared: 0,
    localStorageKeysRemoved: [],
    participants: [
      {
        error: 'media-cleanup-failed',
        id: 'media-runtime-state',
        severity: 'required',
        status: 'failed',
      },
    ],
    sessionStorageKeysRemoved: [],
    success: false,
    syncStorageKeysRemoved: [],
  });
  expect(ports.diagnostics.cleanup).not.toHaveBeenCalled();
  expect(ports.nativeIngestion.cleanup).not.toHaveBeenCalled();
  expect(ports.runtime.cleanup).not.toHaveBeenCalled();
  expect(ports.storage.cleanup).not.toHaveBeenCalled();
});

it('short-circuits after a typed diagnostics failure without resetting runtime state', async () => {
  const ports = createPorts();
  vi.mocked(ports.diagnostics.cleanup).mockResolvedValueOnce([failed('diagnostics-runtime-state')]);
  const useCase = new PrivacyErasureUseCase(ports);

  const result = await useCase.execute(createErasureRequest());

  expect(result.failedRequiredParticipantIds).toEqual(['diagnostics-runtime-state']);
  expect(ports.nativeIngestion.cleanup).not.toHaveBeenCalled();
  expect(ports.runtime.cleanup).not.toHaveBeenCalled();
  expect(ports.storage.cleanup).not.toHaveBeenCalled();
});

it('converts a runtime cleanup exception into a fixed participant failure', async () => {
  const ports = createPorts();
  vi.mocked(ports.runtime.cleanup).mockRejectedValueOnce(new Error('secret-bearing failure'));
  const useCase = new PrivacyErasureUseCase(ports);

  const result = await useCase.execute(createErasureRequest());

  expect(result.failedRequiredParticipantIds).toEqual(['background-runtime-state']);
  expect(result.participants).toContainEqual(
    expect.objectContaining({
      error: 'runtime-cleanup-failed',
      id: 'background-runtime-state',
      status: 'failed',
    })
  );
  expect(JSON.stringify(result)).not.toContain('secret-bearing');
  expect(ports.storage.cleanup).not.toHaveBeenCalled();
});

it('retries from the first phase after a typed partial failure', async () => {
  const ports = createPorts();
  vi.mocked(ports.media.cleanup)
    .mockResolvedValueOnce([failed('recording-runtime-state')])
    .mockResolvedValueOnce([verified('recording-runtime-state')]);
  const useCase = new PrivacyErasureUseCase(ports);

  const first = await useCase.execute(createErasureRequest());
  const second = await useCase.execute(createErasureRequest());

  expect(first.success).toBe(false);
  expect(second.success).toBe(true);
  expect(ports.media.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.storage.cleanup).toHaveBeenCalledOnce();
});

it('is idempotent when the full operation is repeated after success', async () => {
  const ports = createPorts();
  const useCase = new PrivacyErasureUseCase(ports);

  const first = await useCase.execute(createErasureRequest());
  const second = await useCase.execute(createErasureRequest());

  expect(second).toEqual(first);
  expect(ports.media.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.diagnostics.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.nativeIngestion.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.runtime.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.storage.cleanup).toHaveBeenCalledTimes(2);
});

it('serializes concurrent requests without interleaving cleanup phases', async () => {
  const ports = createPorts();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  vi.mocked(ports.media.cleanup)
    .mockImplementationOnce(async () => {
      await firstGate;
      return [verified('recording-runtime-state')];
    })
    .mockResolvedValue([verified('recording-runtime-state')]);
  const useCase = new PrivacyErasureUseCase(ports);

  const first = useCase.execute(createErasureRequest());
  const second = useCase.execute(createErasureRequest());
  await vi.waitFor(() => expect(ports.media.cleanup).toHaveBeenCalledOnce());
  expect(ports.diagnostics.cleanup).not.toHaveBeenCalled();

  releaseFirst();
  await Promise.all([first, second]);
  expect(ports.media.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.storage.cleanup).toHaveBeenCalledTimes(2);
});

it('drains all mutation owners and rejects late writers through storage', async () => {
  const ports = createPorts();
  const releaseExistingStart = acquireMediaMutationPermit();
  const releaseDiagnosticsWriter = acquireDiagnosticsMutationPermit();
  const releaseNativeWriter = acquireNativeIngestionPermit();
  expect(releaseExistingStart).not.toBeNull();
  expect(releaseDiagnosticsWriter).not.toBeNull();
  expect(releaseNativeWriter).not.toBeNull();
  let releaseStorage!: () => void;
  const storageGate = new Promise<void>((resolve) => {
    releaseStorage = resolve;
  });
  vi.mocked(ports.storage.cleanup).mockImplementationOnce(async () => {
    await storageGate;
    return storageResult();
  });
  const useCase = new PrivacyErasureUseCase(ports);

  const execution = useCase.execute(createErasureRequest());
  await Promise.resolve();
  expect(ports.media.cleanup).not.toHaveBeenCalled();

  releaseExistingStart?.();
  await Promise.resolve();
  expect(ports.media.cleanup).not.toHaveBeenCalled();
  releaseDiagnosticsWriter?.();
  await Promise.resolve();
  expect(ports.media.cleanup).not.toHaveBeenCalled();
  releaseNativeWriter?.();
  await vi.waitFor(() => expect(ports.storage.cleanup).toHaveBeenCalledOnce());
  expect(acquireMediaMutationPermit()).toBeNull();
  expect(acquireDiagnosticsMutationPermit()).toBeNull();
  expect(acquireNativeIngestionPermit()).toBeNull();

  releaseStorage();
  await expect(execution).resolves.toEqual(expect.objectContaining({ success: true }));
  const nextStart = acquireMediaMutationPermit();
  const nextDiagnosticsWriter = acquireDiagnosticsMutationPermit();
  const nextNativeWriter = acquireNativeIngestionPermit();
  expect(nextStart).not.toBeNull();
  expect(nextDiagnosticsWriter).not.toBeNull();
  expect(nextNativeWriter).not.toBeNull();
  nextStart?.();
  nextDiagnosticsWriter?.();
  nextNativeWriter?.();
});

it('keeps start admission closed while a second application request is queued', async () => {
  const ports = createPorts();
  let releaseFirstStorage!: () => void;
  let releaseSecondStorage!: () => void;
  const firstStorageGate = new Promise<void>((resolve) => {
    releaseFirstStorage = resolve;
  });
  const secondStorageGate = new Promise<void>((resolve) => {
    releaseSecondStorage = resolve;
  });
  vi.mocked(ports.storage.cleanup)
    .mockImplementationOnce(async () => {
      await firstStorageGate;
      return storageResult();
    })
    .mockImplementationOnce(async () => {
      await secondStorageGate;
      return storageResult();
    });
  const useCase = new PrivacyErasureUseCase(ports);

  const first = useCase.execute(createErasureRequest());
  const second = useCase.execute(createErasureRequest());
  await vi.waitFor(() => expect(ports.storage.cleanup).toHaveBeenCalledOnce());

  releaseFirstStorage();
  await first;
  await vi.waitFor(() => expect(ports.storage.cleanup).toHaveBeenCalledTimes(2));
  expect(acquireMediaMutationPermit()).toBeNull();

  releaseSecondStorage();
  await second;
  const nextStart = acquireMediaMutationPermit();
  expect(nextStart).not.toBeNull();
  nextStart?.();
});

it('reissues every idempotent phase in a fresh use case after storage interruption', async () => {
  const ports = createPorts();
  vi.mocked(ports.storage.cleanup)
    .mockRejectedValueOnce(new Error('worker interrupted'))
    .mockResolvedValueOnce(storageResult());

  const interrupted = await new PrivacyErasureUseCase(ports).execute(createErasureRequest());
  const resumed = await new PrivacyErasureUseCase(ports).execute(createErasureRequest());

  expect(interrupted.failedRequiredParticipantIds).toEqual(['persistent-storage']);
  expect(resumed.success).toBe(true);
  expect(ports.media.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.diagnostics.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.nativeIngestion.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.runtime.cleanup).toHaveBeenCalledTimes(2);
  expect(ports.storage.cleanup).toHaveBeenCalledTimes(2);
});
