import type { TabModeMessage } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  backgroundIngressContracts,
  collectBackgroundIngressRouteTypes,
} from '../../../../../contracts/messaging/contracts/runtime';
import type { VideoControlMessage } from '../../../../../contracts/video/types/messages';
import type { RouteCaptureMessage } from '../../../../capture/routes';
import type {
  BackgroundInternalSignalMessage,
  BackgroundTabMessage,
  PopupExportViewerMessage,
  RuntimeMessageEnvelope,
  ScenarioMessage,
  VideoRecordingSurfaceMessage,
} from './shared';

const backgroundInternalSignalTypes = backgroundIngressContracts
  .filter((entry) => entry.classification !== 'routed' && entry.disposition === 'internal-signal')
  .map((entry) => entry.type) as readonly BackgroundInternalSignalMessage['type'][];

const captureMessageTypes = collectBackgroundIngressRouteTypes({
  handlerId: 'capture',
}) as readonly RouteCaptureMessage['type'][];

const scenarioMessageTypes = collectBackgroundIngressRouteTypes({
  handlerId: 'scenario',
}) as readonly ScenarioMessage['type'][];

const tabModeMessageTypes = collectBackgroundIngressRouteTypes({
  handlerId: 'tab-mode',
}) as readonly TabModeMessage['type'][];

const popupExportViewerMessageTypes = collectBackgroundIngressRouteTypes({
  handlerId: 'popup-export',
}) as readonly PopupExportViewerMessage['type'][];

type SupportedPopupExportViewerType = (typeof popupExportViewerMessageTypes)[number];
type SupportedPopupExportViewerMessage = Extract<
  PopupExportViewerMessage,
  { type: SupportedPopupExportViewerType }
>;

type SupportedTabModeType = (typeof tabModeMessageTypes)[number];
type SupportedTabModeMessage = Extract<TabModeMessage, { type: SupportedTabModeType }>;

const videoControlMessageTypes = collectBackgroundIngressRouteTypes({
  handlerId: 'video-control',
}) as readonly VideoControlMessage['type'][];

const videoRecordingSurfaceMessageTypes = collectBackgroundIngressRouteTypes({
  handlerId: 'video-recording-surface',
}) as readonly VideoRecordingSurfaceMessage['type'][];

const backgroundTabMessageTypes = collectBackgroundIngressRouteTypes({
  actionKind: 'tab',
}) as readonly BackgroundTabMessage['type'][];

export function isBackgroundInternalSignalMessage(
  message: RuntimeMessageEnvelope
): message is BackgroundInternalSignalMessage {
  return backgroundInternalSignalTypes.includes(
    message.type as BackgroundInternalSignalMessage['type']
  );
}

export function isTabModeMessage(
  message: RuntimeMessageEnvelope
): message is SupportedTabModeMessage {
  return tabModeMessageTypes.includes(message.type as SupportedTabModeType);
}

export function isRouteCaptureMessage(
  message: RuntimeMessageEnvelope
): message is RouteCaptureMessage {
  return captureMessageTypes.includes(message.type as RouteCaptureMessage['type']);
}

export function isPopupExportViewerMessage(
  message: RuntimeMessageEnvelope
): message is SupportedPopupExportViewerMessage {
  return popupExportViewerMessageTypes.includes(message.type as SupportedPopupExportViewerType);
}

export function isScenarioMessage(message: RuntimeMessageEnvelope): message is ScenarioMessage {
  return scenarioMessageTypes.includes(message.type as ScenarioMessage['type']);
}

export function isVideoControlMessage(
  message: RuntimeMessageEnvelope
): message is VideoControlMessage {
  return videoControlMessageTypes.includes(message.type as VideoControlMessage['type']);
}

export function isVideoRecordingSurfaceMessage(
  message: RuntimeMessageEnvelope
): message is VideoRecordingSurfaceMessage {
  return videoRecordingSurfaceMessageTypes.includes(
    message.type as VideoRecordingSurfaceMessage['type']
  );
}

export function isBackgroundTabMessage(
  message: RuntimeMessageEnvelope
): message is BackgroundTabMessage {
  return backgroundTabMessageTypes.includes(message.type as BackgroundTabMessage['type']);
}
