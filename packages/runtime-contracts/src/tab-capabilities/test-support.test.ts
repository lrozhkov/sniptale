import { expect, it } from 'vitest';
import { CaptureMode } from '../video/types/types';
import { createVideoCapabilities } from './test-support';

it('creates a capability record for every video capture mode', () => {
  const capability = { reason: null, supported: true };

  expect(createVideoCapabilities(capability)).toEqual({
    [CaptureMode.SCREEN]: capability,
    [CaptureMode.TAB]: capability,
    [CaptureMode.TAB_CROP]: capability,
    [CaptureMode.CAMERA]: capability,
    [CaptureMode.VIEWPORT_EMULATION]: capability,
  });
});
