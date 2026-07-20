import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { parseBackgroundRuntimeMessage } from './boundary';

describe('local data erasure boundary parsing', () => {
  it('accepts settings privacy erasure requests at the background runtime boundary', () => {
    expect(
      parseBackgroundRuntimeMessage({
        type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
        includeAiProviderSecrets: false,
        preservePreferences: true,
      })
    ).toEqual({
      type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
      includeAiProviderSecrets: false,
      preservePreferences: true,
    });
  });

  it('rejects malformed settings privacy erasure requests before background dispatch', () => {
    expect(() =>
      parseBackgroundRuntimeMessage({
        type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
        includeAiProviderSecrets: false,
      })
    ).toThrow(MessageContractError);
  });
});
