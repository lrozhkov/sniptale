import { expect, it, vi } from 'vitest';

import { FakeRuntimeMessagingTransport } from '../../../../platform/runtime-messaging/fake';
import { handleRegionCaptureMessage } from '.';

it('responds to region-capture support checks through sendResponse', () => {
  const getSupport = vi.fn(() => ({ cropTo: true, produceCropTarget: true, supported: true }));
  const sendResponse = vi.fn();

  expect(
    handleRegionCaptureMessage({ type: 'CHECK_REGION_CAPTURE_SUPPORT' }, sendResponse, {
      getSupport,
      logger: { debug: vi.fn() },
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      transport: new FakeRuntimeMessagingTransport(),
    })
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    support: {
      cropTo: true,
      produceCropTarget: true,
      supported: true,
    },
  });
});
