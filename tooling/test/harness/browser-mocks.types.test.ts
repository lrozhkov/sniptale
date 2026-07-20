import { describe, expect, it } from 'vitest';

import { DEFAULT_HARNESS_API_BEHAVIOR, createHarnessApiBehavior } from './browser-mocks.types';

describe('browser-mocks.types', () => {
  it('builds fail-closed harness API behavior by default', () => {
    expect(createHarnessApiBehavior()).toEqual(DEFAULT_HARNESS_API_BEHAVIOR);
  });

  it('merges partial behavior overrides on top of the previous harness behavior', () => {
    const permissiveBehavior = createHarnessApiBehavior({
      runtimeFallback: 'typed-success',
      tabSendMessage: 'success',
      permissions: {
        contains: true,
      },
    });

    expect(
      createHarnessApiBehavior(
        {
          mediaDevices: {
            getUserMedia: 'success',
          },
          permissions: {
            request: true,
          },
        },
        permissiveBehavior
      )
    ).toEqual({
      runtimeFallback: 'typed-success',
      tabSendMessage: 'success',
      permissions: {
        contains: true,
        request: true,
      },
      mediaDevices: {
        getUserMedia: 'success',
      },
    });
  });
});
