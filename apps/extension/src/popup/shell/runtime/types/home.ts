import type { QuickAction, ViewportPreset } from '../../../../contracts/settings';
import type {
  ScreenshotSetupMode,
  ScreenshotSetupState,
} from '../../../../composition/persistence/capture-settings';

export interface PopupRuntimeHomeView {
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  viewportPresets: ViewportPreset[];
  homeError: string | null;
  screenshotStartupMode: ScreenshotSetupMode | null;
  initialScreenshotSetupState: ScreenshotSetupState;
  clearScreenshotStartupMode: () => void;
}
