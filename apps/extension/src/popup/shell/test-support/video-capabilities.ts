import type { CapabilityState } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

export function createVideoCapabilities(
  capability: CapabilityState
): Record<CaptureMode, CapabilityState> {
  return {
    [CaptureMode.SCREEN]: capability,
    [CaptureMode.TAB]: capability,
    [CaptureMode.TAB_CROP]: capability,
    [CaptureMode.CAMERA]: capability,
  };
}
