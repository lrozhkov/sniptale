import { CaptureMode } from '../video/types/types';
import type { CapabilityState } from './types';

export function createVideoCapabilities(
  capability: CapabilityState
): Record<CaptureMode, CapabilityState> {
  return {
    [CaptureMode.SCREEN]: capability,
    [CaptureMode.TAB]: capability,
    [CaptureMode.TAB_CROP]: capability,
    [CaptureMode.CAMERA]: capability,
    [CaptureMode.VIEWPORT_EMULATION]: capability,
  };
}
