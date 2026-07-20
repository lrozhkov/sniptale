import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { emitPopupExportStartResult } from './emit';

it('emits the final popup export result message', async () => {
  const emitMessage = vi.fn().mockResolvedValue(undefined);

  await emitPopupExportStartResult({
    emitMessage,
    requestId: 'req-1',
    result: {
      errors: [],
      filename: 'popup-export.zip',
      stats: {
        filesCount: 1,
        filesFailed: 0,
        rowsCount: 2,
        sectionsCount: 1,
      },
      success: true,
    },
  });

  expect(emitMessage).toHaveBeenCalledWith({
    requestId: 'req-1',
    result: {
      errors: [],
      filename: 'popup-export.zip',
      stats: {
        filesCount: 1,
        filesFailed: 0,
        rowsCount: 2,
        sectionsCount: 1,
      },
      success: true,
    },
    type: MessageType.EXPORT_POPUP_RESULT,
  });
});

it('skips emission when settlement produced no popup result', async () => {
  const emitMessage = vi.fn().mockResolvedValue(undefined);

  await emitPopupExportStartResult({
    emitMessage,
    requestId: 'req-1',
    result: null,
  });

  expect(emitMessage).not.toHaveBeenCalled();
});
