import type { ScenarioSessionService } from '../../../scenario/session-service/index';
import type { PageAccessPort } from '../../../routing-contracts/page-access-port';
import type { WebSnapshotViewerPorts } from '../../page-preparation/viewer-ports';
import type {
  CaptureGuardState,
  CaptureRouteContext,
  RouteCaptureMessage,
  SendResponse,
  ViewportState,
} from '../types';

export type RouteCaptureMessageArgs = {
  message: RouteCaptureMessage;
  resolvedTabId: number;
  sender?: chrome.runtime.MessageSender | undefined;
  sendResponse: SendResponse;
  viewportState: ViewportState;
  screenshotModeState: Map<number, boolean>;
  captureGuardState: CaptureGuardState;
  pageAccessPort?: PageAccessPort | undefined;
  scenarioSessionService: ScenarioSessionService;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts | undefined;
};

export type CaptureRouteAdapterContext = {
  context: CaptureRouteContext;
  routeArgs: RouteCaptureMessageArgs;
};
