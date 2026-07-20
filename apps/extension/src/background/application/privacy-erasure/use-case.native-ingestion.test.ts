import { expect, it, vi } from 'vitest';

import { PrivacyErasureUseCase } from './use-case';
import { createErasureRequest, createPorts, failed } from './use-case.test-support';

it('short-circuits before runtime and storage when native ingestion cannot be quiesced', async () => {
  const ports = createPorts();
  vi.mocked(ports.nativeIngestion.cleanup).mockResolvedValueOnce([
    failed('native-ingestion-runtime-state'),
  ]);

  const result = await new PrivacyErasureUseCase(ports).execute(createErasureRequest());

  expect(result.failedRequiredParticipantIds).toEqual(['native-ingestion-runtime-state']);
  expect(ports.runtime.cleanup).not.toHaveBeenCalled();
  expect(ports.storage.cleanup).not.toHaveBeenCalled();
});

it('uses a fixed failure code when native runtime quiescence throws', async () => {
  const ports = createPorts();
  vi.mocked(ports.nativeIngestion.cleanup).mockRejectedValueOnce(new Error('native secret'));

  const result = await new PrivacyErasureUseCase(ports).execute(createErasureRequest());

  expect(result.participants).toContainEqual(
    expect.objectContaining({
      error: 'native-ingestion-cleanup-failed',
      id: 'native-ingestion-runtime-state',
    })
  );
  expect(JSON.stringify(result)).not.toContain('native secret');
});
