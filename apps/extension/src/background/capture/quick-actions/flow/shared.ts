import type {
  CaptureActionType,
  QuickAction,
  QuickActionScreenshotMode,
  Settings as UserSettings,
} from '../../../../contracts/settings';
import type { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { WebSnapshotViewerPorts } from '../../page-preparation/viewer-ports';
import type { PageAccessPort } from '../../../routing-contracts/page-access-port';
import type { ViewportState } from '../../../routing-contracts/tab-mode-state';
import type { DesktopScreenshotSelection } from '@sniptale/runtime-contracts/capture/action';

export type { ViewportState } from '../../../routing-contracts/tab-mode-state';

export type ProcessQuickActionArgs = {
  actionId: string;
  desktopSelection?: DesktopScreenshotSelection;
  screenshotModeState: Map<number, boolean>;
  tabId: number;
  pageCapability?: TabRuntimeCapability;
  pageAccessPort?: PageAccessPort | undefined;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts | undefined;
  viewportState: ViewportState;
};

export type QuickActionRuntimeContext = {
  action: QuickAction;
  afterCapture: CaptureActionType;
  captureMode: QuickActionScreenshotMode;
  delaySeconds: number;
  viewportPresetId: string | null;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
  settings: UserSettings;
};

export type QuickActionFlowArgs = {
  action: QuickAction;
  afterCapture: CaptureActionType;
  delaySeconds: number;
  viewportPresetId: string | null;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
  settings: UserSettings;
  screenshotModeState: Map<number, boolean>;
  tabId: number;
  pageCapability?: TabRuntimeCapability;
  pageAccessPort?: PageAccessPort | undefined;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts | undefined;
  viewportState: ViewportState;
};

export function buildQuickActionOverlay(args: {
  action: QuickAction;
  afterCapture: CaptureActionType;
  delaySeconds: number;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
}) {
  return {
    afterCapture: args.afterCapture,
    delaySeconds: args.delaySeconds,
    exitAfterCapture: args.action.exitAfterCapture,
    imageFormat: args.imageFormat,
    imageQuality: args.imageQuality,
  };
}
