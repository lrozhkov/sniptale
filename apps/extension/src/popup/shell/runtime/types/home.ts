import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../../contracts/settings';

export interface PopupRuntimeHomeView {
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  displayMode: QuickActionsDisplayMode;
  viewportPresets: ViewportPreset[];
  homeError: string | null;
}
