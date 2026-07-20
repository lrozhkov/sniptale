import type { RuntimeRequestByType } from '../../../../contracts/messaging/contracts/runtime-message';
import type { TabRequestByType, TabResponseByType } from '../../../../contracts/messaging/tab';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getPopupRuntimeServices } from '../../runtime/services';

type PopupExportMessageType =
  | typeof MessageType.EXPORT_POPUP_PREVIEW
  | typeof MessageType.EXPORT_POPUP_START
  | typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT
  | typeof MessageType.EXPORT_POPUP_CANCEL;

type PopupExportDirectTabMessage =
  | TabRequestByType[typeof MessageType.EXPORT_POPUP_PREVIEW]
  | TabRequestByType[typeof MessageType.EXPORT_POPUP_START]
  | TabRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]
  | TabRequestByType[typeof MessageType.EXPORT_POPUP_CANCEL];

type PopupExportSaveWebSnapshotMessage = Omit<
  RuntimeRequestByType[typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT],
  'tabId' | 'tabRouteCapabilityToken' | 'tabRouteRequestId'
>;

type PopupExportTabMessage = PopupExportDirectTabMessage | PopupExportSaveWebSnapshotMessage;

function createPopupTabRouteRequestId(message: PopupExportTabMessage): string {
  return 'requestId' in message && typeof message.requestId === 'string'
    ? message.requestId
    : crypto.randomUUID();
}

async function requestPopupTabRouteCapability(
  tabId: number,
  message: PopupExportTabMessage
): Promise<{
  tabRouteCapabilityToken: string;
  tabRouteRequestId: string;
}> {
  const requestId = createPopupTabRouteRequestId(message);
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    operation: message.type,
    requestId,
    tabId,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  });

  if (!response.success || !response.capabilityToken) {
    throw new Error(response.error || 'Failed to authorize tab export route.');
  }

  return {
    tabRouteCapabilityToken: response.capabilityToken,
    tabRouteRequestId: requestId,
  };
}

async function attachTargetTabCapability(
  tabId: number,
  message: PopupExportTabMessage
): Promise<RuntimeRequestByType[PopupExportMessageType]> {
  return {
    ...message,
    tabId,
    ...(await requestPopupTabRouteCapability(tabId, message)),
  } as RuntimeRequestByType[PopupExportMessageType];
}

export async function sendPopupExportTabMessage<TMessage extends PopupExportTabMessage>(
  tabId: number,
  message: TMessage
): Promise<TabResponseByType[TMessage['type']]> {
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage(
    await attachTargetTabCapability(tabId, message)
  );
  return response as TabResponseByType[TMessage['type']];
}
