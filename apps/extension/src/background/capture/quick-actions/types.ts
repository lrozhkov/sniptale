import type { ViewportState } from './flow/shared';
import type { WebSnapshotViewerPorts } from '../page-preparation/viewer-ports';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import type { QuickActionRuntimeContext } from './flow/shared';

export type HandleQuickActionArgs = {
  actionId: string;
  tabId: number;
  tab: chrome.tabs.Tab;
  viewportState: ViewportState;
  screenshotModeState: Map<number, boolean>;
  captureGuardState: { isCapturing: boolean };
  pageAccessPort?: PageAccessPort | undefined;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts | undefined;
  runtimeContext?: QuickActionRuntimeContext | undefined;
};
