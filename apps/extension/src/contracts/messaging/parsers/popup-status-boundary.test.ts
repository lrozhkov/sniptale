import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseBackgroundRuntimeMessage, parsePopupRuntimeMessage } from './boundary';

function createExportStats() {
  return {
    filesCount: 0,
    filesFailed: 0,
    rowsCount: 0,
    sectionsCount: 0,
  };
}

it('accepts popup export result broadcasts at the background and popup runtime boundaries', () => {
  const message = {
    type: MessageType.EXPORT_POPUP_RESULT,
    requestId: 'req-1',
    result: {
      errors: [],
      filename: 'export.zip',
      stats: createExportStats(),
      success: true,
    },
  };

  expect(parseBackgroundRuntimeMessage(message)).toEqual(message);
  expect(parsePopupRuntimeMessage(message)).toEqual(message);
});

it('accepts popup export progress broadcasts at the background and popup runtime boundaries', () => {
  const message = {
    type: MessageType.EXPORT_POPUP_PROGRESS,
    requestId: 'req-1',
    progress: {
      current: 1,
      errors: [],
      message: 'Exporting',
      phase: 'zipping',
      total: 1,
    },
  };

  expect(parseBackgroundRuntimeMessage(message)).toEqual(message);
  expect(parsePopupRuntimeMessage(message)).toEqual(message);
});
