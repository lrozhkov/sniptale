import {
  openGalleryPage,
  openSettingsPage,
  openVideoEditorPage,
} from '../../../platform/navigation/extension-pages';
import type {
  AppTrayActionRequestedMessage,
  NativeAppOutboundMessage,
} from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';

/** Admits browser navigation only. Desktop executes its own capture and recording actions. */
export async function handleNativeTrayAction(args: {
  getStatus?: () => NativeAppRuntimeStatus;
  message: AppTrayActionRequestedMessage;
  post(message: NativeAppOutboundMessage): void;
  status: NativeAppRuntimeStatus;
}): Promise<void> {
  const status = args.getStatus?.() ?? args.status;
  const lease = status.controllerLease;
  const openPage =
    args.message.actionId === 'open-gallery'
      ? openGalleryPage
      : args.message.actionId === 'open-settings'
        ? openSettingsPage
        : args.message.actionId === 'open-video-editor'
          ? openVideoEditorPage
          : null;
  let error: string | undefined;
  if (
    !openPage ||
    lease?.status !== 'granted' ||
    lease.selectionStatus !== 'selected' ||
    lease.controllerLeaseId !== args.message.controllerLeaseId
  ) {
    error = 'Unavailable or stale browser action';
  } else {
    try {
      await openPage();
    } catch {
      error = 'Failed to open extension page';
    }
  }
  args.post({
    type: 'extension.tray.actionResult',
    protocolVersion: args.message.protocolVersion,
    controllerLeaseId: args.message.controllerLeaseId,
    invocationId: args.message.invocationId,
    accepted: error === undefined,
    ...(error ? { error } : {}),
  });
}
