import { expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createVideoCapabilities } from './video-capabilities';

it('creates a capability record for every video capture mode', () => {
  const capability = { reason: null, supported: true };

  expect(createVideoCapabilities(capability)).toEqual({
    [CaptureMode.SCREEN]: capability,
    [CaptureMode.TAB]: capability,
    [CaptureMode.TAB_CROP]: capability,
    [CaptureMode.CAMERA]: capability,
  });
});
