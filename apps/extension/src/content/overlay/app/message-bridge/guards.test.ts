import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureActionType } from '../../../../contracts/settings';
import { parseRuntimeMessageRequest } from './guards';

describe('parseRuntimeMessageRequest', () => {
  it.each(['', 7, 'x'.repeat(161)])(
    'rejects malformed quick-action transaction identity %s',
    (transactionId) => {
      expect(
        parseRuntimeMessageRequest({
          type: MessageType.ENABLE_SCREENSHOT_MODE,
          quickActionOverlay: {
            afterCapture: 'copy',
            exitAfterCapture: true,
            imageFormat: 'png',
            imageQuality: 90,
            transactionId,
          },
        })
      ).toBeNull();
    }
  );
  it('preserves a valid quick-action transaction identity', () => {
    const request = {
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      quickActionOverlay: {
        afterCapture: 'copy',
        exitAfterCapture: true,
        imageFormat: 'png',
        imageQuality: 90,
        transactionId: 'capture-1',
      },
    };
    expect(parseRuntimeMessageRequest(request)).toEqual(request);
  });
  const captureActions: CaptureActionType[] = [
    'download_default',
    'ask_preset',
    'ask_system',
    'scenario',
    'edit',
    'copy',
    'save_to_library',
  ];

  it.each(captureActions)(
    'accepts ENABLE_SCREENSHOT_MODE with the %s delivery action',
    (afterCapture) => {
      const request = {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        autoStartCaptureType: 'visible' as const,
        quickActionOverlay: {
          afterCapture,
          exitAfterCapture: true,
          imageFormat: 'png' as const,
          imageQuality: 90,
          delaySeconds: 0,
        },
      };

      expect(parseRuntimeMessageRequest(request)).toEqual(request);
    }
  );
});
