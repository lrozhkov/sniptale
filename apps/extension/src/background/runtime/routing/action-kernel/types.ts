import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import type { BackgroundRuntimeMessageDeps } from '../boundary/shared';
import type { BackgroundTabMessage, RuntimeMessageEnvelope } from '../message-guards/guards/shared';

export type LegacyRouteName =
  | `background-owned:${string}`
  | `tab:${string}`
  | `video-runtime:${string}`
  | 'internal-signal'
  | 'unknown';

export type ActionKind =
  | 'background-owned'
  | 'internal-signal'
  | 'tab'
  | 'unknown'
  | 'video-runtime';

type ActionRouteSupport = 'internal' | 'parser-supported' | 'unsupported';

export type ActionRouteHandlerAdapter =
  | 'routeBackgroundOwnedAction'
  | 'routeInternalSignalAction'
  | 'routeTabAction'
  | 'routeUnknownAction'
  | 'routeVideoRuntimeAction';

export type ActionRouteAuthorityFamily =
  | 'background-owned-ipc'
  | 'capture-privileged-tab-route'
  | 'content-action-capability-issuance'
  | 'content-runtime-wakeup'
  | 'diagnostic-content-runtime'
  | 'gallery-update-capability'
  | 'gallery-update-capability-issuance'
  | 'internal-signal'
  | 'offscreen-runtime-capability'
  | 'page-access-owner'
  | 'page-style-privileged-tab-route'
  | 'popup-export-archive-download'
  | 'popup-export-tab-route-capability'
  | 'popup-tab-route-capability-issuance'
  | 'project-export-capability'
  | 'project-export-capability-issuance'
  | 'quick-action-privileged-tab-route'
  | 'scenario-privileged-tab-route'
  | 'tab-mode-privileged-tab-route'
  | 'unsupported'
  | 'video-control-camera-recorder-route'
  | 'video-control-no-tab-route'
  | 'video-control-owner-no-tab-route'
  | 'video-control-privileged-tab-route'
  | 'video-runtime-owner-policy';

export type ActionRouteKeepChannelBehaviorSource =
  | 'action-kernel-fixed-closed'
  | 'background-owned-route-handler'
  | 'popup-tab-route-capability-issuer'
  | 'tab-routing-adapter'
  | 'video-runtime-project-export-authority'
  | 'video-runtime-router-result';

export type ActionRouteMetadata = {
  readonly acceptedSenderClass: string;
  readonly actionKind: ActionKind;
  readonly alternateAuthorityFamilies?: readonly ActionRouteAuthorityFamily[];
  readonly authorityFamily: ActionRouteAuthorityFamily;
  readonly errorShape: string;
  readonly freshnessReplayPolicy: string;
  readonly handlerAdapter: ActionRouteHandlerAdapter;
  readonly keepChannelBehaviorSource: ActionRouteKeepChannelBehaviorSource;
  readonly messageType: string | null;
  readonly ownerModule: string;
  readonly requiredAuthority: string;
  readonly responseShape: string;
  readonly routeName: LegacyRouteName;
  readonly sideEffects: string;
  readonly support: ActionRouteSupport;
  readonly transitiveStateOwner: string;
};

export type ActionContext = {
  documentId: string | null;
  frameId: number | null;
  logger: { error?: (...value: unknown[]) => void; warn: (...value: unknown[]) => void };
  origin: string | null;
  runtimeState: BackgroundRuntimeMessageDeps;
  sendResponse: ResponseSender;
  sender: chrome.runtime.MessageSender;
  senderUrl: string | null;
  tabId: number | null;
};

export type InternalSignalAction = {
  actionKind: 'internal-signal';
  context: ActionContext;
  routeName: 'internal-signal';
};

export type UnknownAction = {
  actionKind: 'unknown';
  context: ActionContext;
  message: RuntimeMessageEnvelope;
  routeName: 'unknown';
};

export type BackgroundOwnedAction = {
  actionKind: 'background-owned';
  context: ActionContext;
  message: RuntimeMessageEnvelope;
  routeName: `background-owned:${string}`;
};

export type VideoRuntimeAction = {
  actionKind: 'video-runtime';
  context: ActionContext;
  message: VideoRuntimeMessage;
  routeName: `video-runtime:${string}`;
};

export type TabAction = {
  actionKind: 'tab';
  context: ActionContext;
  message: BackgroundTabMessage;
  resolvedTabId: number | undefined;
  routeName: `tab:${string}`;
};

export type Action =
  | BackgroundOwnedAction
  | InternalSignalAction
  | TabAction
  | UnknownAction
  | VideoRuntimeAction;

export type ActionResult = { handled: true; keepChannelOpen: boolean } | { handled: false };

export type ActionHandler<TAction extends Action = Action> = (action: TAction) => ActionResult;
