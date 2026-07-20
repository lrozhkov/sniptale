import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoExportMessageContracts } from './export';

it('parses owner-scoped start export responses', () => {
  expect(
    runtimeVideoExportMessageContracts[VideoMessageType.START_PROJECT_EXPORT].parseResponse({
      success: true,
      capabilityToken: 'cancel-token-1',
      jobId: 'job-1',
      ownerDocumentId: 'editor-doc-1',
    })
  ).toEqual(
    expect.objectContaining({
      capabilityToken: 'cancel-token-1',
      jobId: 'job-1',
      ownerDocumentId: 'editor-doc-1',
    })
  );
});
