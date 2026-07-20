import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createPopupExportProgressEmitter } from './progress';
import type { PopupExportState } from '../types';

function createState(requestId: string | null): PopupExportState {
  return {
    activeExportRequestId: requestId,
    isExportRunning: requestId !== null,
  };
}

it('emits progress for the active export request', () => {
  const emitMessage = vi.fn().mockResolvedValue(undefined);
  const onProgress = createPopupExportProgressEmitter({
    emitMessage,
    requestId: 'req-1',
    state: createState('req-1'),
  });

  onProgress({
    current: 1,
    errors: [],
    message: 'exporting',
    phase: 'zipping',
    total: 1,
  });

  expect(emitMessage).toHaveBeenCalledWith({
    progress: {
      current: 1,
      errors: [],
      message: 'exporting',
      phase: 'zipping',
      total: 1,
    },
    requestId: 'req-1',
    type: MessageType.EXPORT_POPUP_PROGRESS,
  });
});

it('ignores progress when the request becomes stale', () => {
  const emitMessage = vi.fn().mockResolvedValue(undefined);
  const state = createState('req-1');
  const onProgress = createPopupExportProgressEmitter({
    emitMessage,
    requestId: 'req-1',
    state,
  });

  state.activeExportRequestId = 'req-2';
  onProgress({
    current: 1,
    errors: [],
    message: 'exporting',
    phase: 'zipping',
    total: 1,
  });

  expect(emitMessage).not.toHaveBeenCalled();
});
