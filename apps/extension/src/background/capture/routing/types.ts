import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureActionType } from '../../../contracts/settings';
import type { RuntimeRequestByType } from '../../../contracts/messaging/contracts/runtime-message';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import type { WebSnapshotViewerPorts } from '../page-preparation/viewer-ports';
import type { PreauthorizedContentActionBinding } from '../../routing-contracts/capabilities/content-action/route';

export type ViewportState = import('../../routing-contracts/tab-mode-state').ViewportState;

export type CaptureGuardState = { isCapturing: boolean };

export type SendResponse = ResponseSender;

export type CaptureRouteContext = {
  contentPreauthorization?: PreauthorizedContentActionBinding | undefined;
  message?: Partial<RouteCaptureMessage> &
    Record<string, unknown> & {
      actionType?: CaptureActionType;
      scenarioCapture?: ScenarioRuntimeCapturePayload;
    };
  resolvedTabId: number;
  sendResponse: SendResponse;
  viewportState: ViewportState;
  screenshotModeState: Map<number, boolean>;
  captureGuardState: CaptureGuardState;
  pageAccessPort?: PageAccessPort | undefined;
  scenarioSessionService: ScenarioSessionService;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts | undefined;
};

type CaptureIngressRouteGroup = Extract<
  (typeof import('../../../contracts/messaging/contracts/runtime/background-ingress.tab.data').backgroundIngressTabRouteGroups)[number],
  { readonly handlerId: 'capture' }
>;

type CaptureIngressMessageType = CaptureIngressRouteGroup['messageTypes'][number];

export type RouteCaptureMessage = RuntimeRequestByType[CaptureIngressMessageType];
