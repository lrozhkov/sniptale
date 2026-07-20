import {
  openGalleryPage,
  openSettingsPage,
  openVideoEditorPage,
} from '../../../platform/navigation/extension-pages';
import type {
  NativeAppInboundMessage,
  NativeAppOutboundMessage,
  NativeCaptureMode,
  NativeRecordingMode,
} from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { createNativeCommandId } from './ids';
import {
  createNativeRequestedQualitySettings,
  loadNativeSettingsSnapshot,
} from './settings-snapshot';
import { nativeTrayActionCommands } from './tray-action-commands';

type NativeTrayActionMessage = Extract<
  NativeAppInboundMessage,
  { type: 'app.tray.actionRequested' }
>;

interface NativeTrayActionArgs {
  getStatus?: () => NativeAppRuntimeStatus;
  message: NativeTrayActionMessage;
  post: (message: NativeAppOutboundMessage) => void;
  status: NativeAppRuntimeStatus;
}

function findTrayActionCommand(actionId: string) {
  return Object.values(nativeTrayActionCommands).find((command) => command.id === actionId);
}

function postTrayActionResult(
  args: NativeTrayActionArgs,
  result: { accepted: boolean; error?: string }
): void {
  args.post({
    accepted: result.accepted,
    controllerLeaseId: args.message.controllerLeaseId,
    ...(result.error ? { error: result.error } : {}),
    invocationId: args.message.invocationId,
    protocolVersion: args.message.protocolVersion,
    type: 'extension.tray.actionResult',
  });
}

function handleRecordingControlAction(args: NativeTrayActionArgs, actionKind: string): void {
  const recordingId = args.status.appStatus?.recording?.recordingId;
  if (!recordingId) {
    postTrayActionResult(args, { accepted: false, error: 'Recording is not active' });
    return;
  }
  args.post({
    commandId: createNativeCommandId(actionKind),
    control: actionKind.replace('-recording', '') as 'pause' | 'resume' | 'stop',
    controllerLeaseId: args.message.controllerLeaseId,
    protocolVersion: args.message.protocolVersion,
    recordingId,
    requestedAtEpochMs: Date.now(),
    type: 'extension.recording.control',
  });
  postTrayActionResult(args, { accepted: true });
}

async function handlePageOpenAction(
  args: NativeTrayActionArgs,
  openPage: () => Promise<void>,
  error: string
): Promise<void> {
  try {
    await openPage();
    postTrayActionResult(args, { accepted: true });
  } catch {
    postTrayActionResult(args, { accepted: false, error });
  }
}

function handleScreenshotAction(args: NativeTrayActionArgs, mode: NativeCaptureMode): void {
  if (!isScreenshotModeSupported(args.status, mode)) {
    postTrayActionResult(args, { accepted: false, error: 'Screenshot mode is unavailable' });
    return;
  }
  args.post({
    commandId: createNativeCommandId('screenshot'),
    controllerLeaseId: args.message.controllerLeaseId,
    mode,
    openEditor: true,
    protocolVersion: args.message.protocolVersion,
    requestedAtEpochMs: Date.now(),
    settingsRevision: args.status.settingsRevision ?? 'unknown',
    type: 'extension.screenshot.capture',
  });
  postTrayActionResult(args, { accepted: true });
}

async function handleStartRecordingAction(
  args: NativeTrayActionArgs,
  mode: NativeRecordingMode
): Promise<void> {
  if (!isRecordingModeSupported(args.status, mode)) {
    postTrayActionResult(args, { accepted: false, error: 'Recording mode is unavailable' });
    return;
  }
  const snapshot = await loadNativeSettingsSnapshot();
  const freshStatus = args.getStatus?.() ?? args.status;
  if (!isTrayActionStillAvailable(args, freshStatus, 'start-recording', mode)) {
    postTrayActionResult(args, { accepted: false, error: 'Unavailable or stale tray action' });
    return;
  }
  args.post({
    commandId: createNativeCommandId('recording'),
    controllerLeaseId: args.message.controllerLeaseId,
    openEditor: true,
    protocolVersion: args.message.protocolVersion,
    requestedAtEpochMs: Date.now(),
    requestedQuality: createNativeRequestedQualitySettings(snapshot.native, snapshot.quality),
    settingsRevision: freshStatus.settingsRevision ?? snapshot.revision,
    source: { mode },
    type: 'extension.recording.start',
  });
  postTrayActionResult(args, { accepted: true });
}

function isScreenshotModeSupported(
  status: NativeAppRuntimeStatus,
  mode: NativeCaptureMode
): boolean {
  return status.capabilities?.capture.screenshotModes.includes(mode) ?? true;
}

function isRecordingModeSupported(
  status: NativeAppRuntimeStatus,
  mode: NativeRecordingMode
): boolean {
  return status.capabilities?.capture.videoModes.includes(mode) ?? true;
}

function isTrayActionStillAvailable(
  args: NativeTrayActionArgs,
  status: NativeAppRuntimeStatus,
  kind: 'start-recording',
  mode: NativeRecordingMode
): boolean {
  const action = status.trayActions?.actions.find((entry) => entry.id === args.message.actionId);
  return (
    status.controllerLease?.controllerLeaseId === args.message.controllerLeaseId &&
    action?.enabled === true &&
    action.kind === kind &&
    isRecordingModeSupported(status, mode)
  );
}

export async function handleNativeTrayAction(args: NativeTrayActionArgs): Promise<void> {
  const action = args.status.trayActions?.actions.find(
    (entry) => entry.id === args.message.actionId
  );
  const leaseId = args.status.controllerLease?.controllerLeaseId;
  if (!action?.enabled || leaseId !== args.message.controllerLeaseId) {
    postTrayActionResult(args, { accepted: false, error: 'Unavailable or stale tray action' });
    return;
  }

  if (
    action.kind === 'stop-recording' ||
    action.kind === 'pause-recording' ||
    action.kind === 'resume-recording'
  ) {
    handleRecordingControlAction(args, action.kind);
  } else if (action.kind === 'open-settings') {
    await handlePageOpenAction(args, openSettingsPage, 'Failed to open settings');
  } else if (action.kind === 'open-gallery') {
    await handlePageOpenAction(args, openGalleryPage, 'Failed to open gallery');
  } else if (action.kind === 'open-video-editor') {
    await handlePageOpenAction(args, openVideoEditorPage, 'Failed to open video editor');
  } else if (action.kind === 'capture-screenshot') {
    const command = findTrayActionCommand(action.id);
    if (command?.kind === 'capture-screenshot') {
      handleScreenshotAction(args, command.mode);
    } else {
      postTrayActionResult(args, { accepted: false, error: 'Unsupported screenshot action' });
    }
  } else if (action.kind === 'start-recording') {
    const command = findTrayActionCommand(action.id);
    if (command?.kind === 'start-recording') {
      await handleStartRecordingAction(args, command.mode);
    } else {
      postTrayActionResult(args, { accepted: false, error: 'Unsupported recording action' });
    }
  }
}
