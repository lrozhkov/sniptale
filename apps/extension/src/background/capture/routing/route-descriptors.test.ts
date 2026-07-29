import { expect, it } from 'vitest';

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { captureActionsRouteDescriptor } from './route-descriptors';

it('keeps trusted screenshot surface renewal in the capture action route family', () => {
  expect(captureActionsRouteDescriptor.messageTypes).toEqual([
    CaptureMessageType.CAPTURE_VISIBLE,
    CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    CaptureMessageType.CAPTURE_FULL,
    CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION,
  ]);
});
