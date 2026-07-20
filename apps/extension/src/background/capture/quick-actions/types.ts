import type { ViewportState } from './flow/index';
import type { WebSnapshotViewerPorts } from '../page-preparation/viewer-ports';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';

export type HandleQuickActionArgs = {
  actionId: string;
  tabId: number;
  tab: chrome.tabs.Tab;
  viewportState: ViewportState;
  screenshotModeState: Map<number, boolean>;
  captureGuardState: { isCapturing: boolean };
  pageAccessPort?: PageAccessPort | undefined;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts | undefined;
};
