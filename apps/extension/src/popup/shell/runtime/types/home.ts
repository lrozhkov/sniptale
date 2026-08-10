import type { QuickAction, ViewportPreset } from '../../../../contracts/settings';

export interface PopupRuntimeHomeView {
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  viewportPresets: ViewportPreset[];
  homeError: string | null;
}
