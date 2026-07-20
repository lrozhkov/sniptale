import { expect, it } from 'vitest';

import {
  applyNativeAcquireIdentityError,
  applyNativeParseErrorStatus,
} from './service-status-errors';
import { createInitialNativeAppRuntimeStatus } from './status';

it('marks oversized native parse errors as non-recoverable', () => {
  expect(
    applyNativeParseErrorStatus(createInitialNativeAppRuntimeStatus('native.host'), {
      error: 'too large',
      reason: 'native-message-too-large',
    })
  ).toEqual(
    expect.objectContaining({
      connectionState: 'error',
      error: expect.objectContaining({
        code: 'native-message-too-large',
        recoverable: false,
      }),
    })
  );
});

it('marks controller profile identity failures as recoverable storage errors', () => {
  expect(
    applyNativeAcquireIdentityError(createInitialNativeAppRuntimeStatus('native.host'))
  ).toEqual(
    expect.objectContaining({
      connectionState: 'error',
      error: expect.objectContaining({
        code: 'storage-failed',
        recoverable: true,
      }),
    })
  );
});
