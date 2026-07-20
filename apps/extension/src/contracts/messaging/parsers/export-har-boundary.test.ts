import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseBackgroundRuntimeMessage } from './boundary';

it('accepts export HAR capability requests at the background runtime boundary', () => {
  const message = {
    type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
    sessionId: 'har-session-1',
  };

  expect(parseBackgroundRuntimeMessage(message)).toEqual(message);
});
