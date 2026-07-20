import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { applyPopupExportRuntimeMessage, parsePopupExportRuntimeMessage } from './message-listener';

function createPopupExportResult(success: boolean, errors: string[]) {
  return {
    success,
    errors,
    stats: {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    },
  };
}

it('parses popup export progress/runtime messages and rejects unrelated payloads', () => {
  expect(
    parsePopupExportRuntimeMessage({
      type: MessageType.EXPORT_POPUP_PROGRESS,
      requestId: 'req-1',
      progress: {
        phase: 'scanning',
        message: 'Scanning',
        current: 1,
        total: 2,
        errors: [],
      },
    })
  ).toEqual(
    expect.objectContaining({
      type: MessageType.EXPORT_POPUP_PROGRESS,
      requestId: 'req-1',
    })
  );

  expect(parsePopupExportRuntimeMessage({ type: MessageType.ENABLE_SCREENSHOT_MODE })).toBeNull();
});

it('applies result messages only for the active request id', () => {
  const setProgress = vi.fn();
  const setResult = vi.fn();
  const clearRequestId = vi.fn();

  expect(
    applyPopupExportRuntimeMessage({
      message: {
        type: MessageType.EXPORT_POPUP_RESULT,
        requestId: 'req-1',
        result: createPopupExportResult(true, []),
      },
      requestId: 'req-2',
      setProgress,
      setResult,
      clearRequestId,
    })
  ).toBe(false);

  expect(setProgress).not.toHaveBeenCalled();
  expect(setResult).not.toHaveBeenCalled();
  expect(clearRequestId).not.toHaveBeenCalled();
});

it('applies the active result message and clears the request id', () => {
  const setProgress = vi.fn();
  const setResult = vi.fn();
  const clearRequestId = vi.fn();

  expect(
    applyPopupExportRuntimeMessage({
      message: {
        type: MessageType.EXPORT_POPUP_RESULT,
        requestId: 'req-1',
        result: createPopupExportResult(false, ['failure']),
      },
      requestId: 'req-1',
      setProgress,
      setResult,
      clearRequestId,
    })
  ).toBe(true);

  expect(setResult).toHaveBeenCalledWith(createPopupExportResult(false, ['failure']));
  expect(setProgress).toHaveBeenCalled();
  expect(clearRequestId).toHaveBeenCalled();
});
