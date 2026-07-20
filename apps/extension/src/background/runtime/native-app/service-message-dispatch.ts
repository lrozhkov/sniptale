import { openSettingsPage } from '../../../platform/navigation/extension-pages';
import type {
  NativeAppInboundMessage,
  NativeAppOutboundMessage,
} from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import type { NativeAppIngestionController } from '../../capture/native-app/controller';
import { postNativeResponses } from './response-posting';
import {
  applyNativeControllerLeaseAuthority,
  shouldAcceptNativeOperationFailure,
} from './service-authority';
import { applyNativeHelloAuthority } from './service-hello';
import { dispatchNativeMediaMessage, type NativeMediaMessage } from './service-media';
import type { NativeControllerAcquireReason } from './service-types';
import type { NativeSettingsSyncTracker } from './settings-sync-state';
import {
  applyNativeOperationFailedStatus,
  applyNativeSettingsAcceptedStatus,
} from './status-updates';
import { updateNativeRecordingStatus } from './service-recording-status';
import { handleNativeTrayAction } from './tray-actions';

interface DispatchContext {
  acceptLeaseGeneration(): void;
  acquire(reason: NativeControllerAcquireReason): void;
  clearPendingReason(): void;
  consumeInvocation(message: {
    controllerLeaseId: string;
    invocationId: string;
    requestedAtEpochMs: number;
  }): boolean;
  getConnectionId(): string;
  getHandshakeAccepted(): boolean;
  getPendingReason(): NativeControllerAcquireReason | null;
  getStatus(): NativeAppRuntimeStatus;
  ingestion: NativeAppIngestionController;
  notePong(): void;
  ownsLease(message: { controllerLeaseId: string }): boolean;
  post(message: NativeAppOutboundMessage): void;
  setHandshakeAccepted(accepted: boolean): void;
  setStatus(status: NativeAppRuntimeStatus): void;
  settingsSync: NativeSettingsSyncTracker;
  sync(): Promise<void>;
  warn(message: string): void;
}

type NativeRuntimeControlMessage = Exclude<NativeAppInboundMessage, NativeMediaMessage>;

export function dispatchNativeRuntimeMessage(
  ctx: DispatchContext,
  message: NativeAppInboundMessage
): void {
  if (isNativeMediaMessage(message)) {
    handleMediaMessage(ctx, message);
    return;
  }
  dispatchNativeControlMessage(ctx, message);
}

function dispatchNativeControlMessage(
  ctx: DispatchContext,
  message: NativeRuntimeControlMessage
): void {
  switch (message.type) {
    case 'app.hello':
      handleHello(ctx, message);
      return;
    case 'app.controller.lease':
      handleLease(ctx, message);
      return;
    case 'app.settings.accepted':
      handleSettingsAccepted(ctx, message);
      return;
    case 'app.pong':
      handlePong(ctx, message);
      return;
    case 'app.tray.actionRequested':
      handleTrayAction(ctx, message);
      return;
    case 'app.openSettings.requested':
      handleOpenSettings(ctx, message);
      return;
    case 'app.operation.failed':
      handleOperationFailed(ctx, message);
      return;
    case 'app.command.accepted':
      handleCommandAccepted(ctx, message);
      return;
    case 'app.recording.started':
      handleRecordingStarted(ctx, message);
      return;
    case 'app.recording.progress':
      handleRecordingProgress(ctx, message);
      return;
  }
}

function isNativeMediaMessage(message: NativeAppInboundMessage): message is NativeMediaMessage {
  return (
    message.type === 'app.screenshot.start' ||
    message.type === 'app.screenshot.chunk' ||
    message.type === 'app.screenshot.commit' ||
    message.type === 'app.recording.stopped' ||
    message.type === 'app.recording.chunk'
  );
}

function handleHello(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.hello' }>
): void {
  const next = applyNativeHelloAuthority({
    message,
    pendingReason: ctx.getPendingReason(),
    status: ctx.getStatus(),
  });
  ctx.setStatus(next.status);
  ctx.setHandshakeAccepted(next.handshakeAccepted);
  ctx.clearPendingReason();
  if (next.acquireReason) {
    ctx.acquire(next.acquireReason);
  }
}

function handleLease(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.controller.lease' }>
): void {
  const next = applyNativeControllerLeaseAuthority({
    connectionId: ctx.getConnectionId(),
    extensionId: chrome.runtime.id,
    handshakeAccepted: ctx.getHandshakeAccepted(),
    message,
    settingsSync: ctx.settingsSync,
    status: ctx.getStatus(),
    warn: ctx.warn,
  });
  if (!next.accepted) {
    return;
  }
  ctx.setStatus(next.status);
  ctx.acceptLeaseGeneration();
  void ctx.sync();
  if (next.resumeLeaseId) {
    postNativeResponses(
      ctx.ingestion.resumePendingTransfers(next.resumeLeaseId),
      ctx.post,
      ctx.warn
    );
  }
}

function handleSettingsAccepted(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.settings.accepted' }>
): void {
  if (!ctx.ownsLease(message)) {
    ctx.warn('Stale settings');
    return;
  }
  if (!ctx.settingsSync.acceptRevision(message.revision)) {
    ctx.warn('Settings revision');
    return;
  }
  ctx.setStatus(applyNativeSettingsAcceptedStatus(ctx.getStatus(), message));
}

function handlePong(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.pong' }>
): void {
  if (!ctx.getHandshakeAccepted()) {
    ctx.warn('Early pong');
    return;
  }
  ctx.notePong();
  ctx.setStatus({ ...ctx.getStatus(), appStatus: message.appStatus, lastHeartbeatAt: Date.now() });
}

function handleTrayAction(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.tray.actionRequested' }>
): void {
  if (!ctx.ownsLease(message)) {
    ctx.warn('Stale tray action');
    return;
  }
  if (!ctx.consumeInvocation(message)) {
    return;
  }
  void handleNativeTrayAction({
    getStatus: ctx.getStatus,
    message,
    post: ctx.post,
    status: ctx.getStatus(),
  });
}

function handleOpenSettings(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.openSettings.requested' }>
): void {
  if (!ctx.ownsLease(message)) {
    ctx.warn('Stale open-settings');
    return;
  }
  if (!ctx.consumeInvocation(message)) {
    return;
  }
  void openSettingsPage({ section: message.section });
}

function handleOperationFailed(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.operation.failed' }>
): void {
  const accepted = shouldAcceptNativeOperationFailure({
    handshakeAccepted: ctx.getHandshakeAccepted(),
    hasGrantedLease: ctx.ownsLease,
    message,
    warn: ctx.warn,
  });
  if (accepted) {
    ctx.setStatus(applyNativeOperationFailedStatus(ctx.getStatus(), message));
  }
}

function handleCommandAccepted(ctx: DispatchContext, message: { controllerLeaseId: string }): void {
  if (!ctx.getHandshakeAccepted()) {
    ctx.warn('Early status');
    return;
  }
  if (!ctx.ownsLease(message)) {
    ctx.warn('Stale command accepted');
  }
}

function handleRecordingStarted(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.recording.started' }>
): void {
  if (!updateNativeRecordingStatus(ctx, message, 'recording', 0)) {
    return;
  }
  postNativeResponses(ctx.ingestion.handleRecordingStarted(message), ctx.post, ctx.warn);
}

function handleRecordingProgress(
  ctx: DispatchContext,
  message: Extract<NativeAppInboundMessage, { type: 'app.recording.progress' }>
): void {
  updateNativeRecordingStatus(ctx, message, message.status, message.durationMs);
}

function handleMediaMessage(ctx: DispatchContext, message: NativeMediaMessage): void {
  dispatchNativeMediaMessage({
    hasGrantedLease: ctx.ownsLease,
    ingestion: ctx.ingestion,
    message,
    postResponses: (responses) => postNativeResponses(responses, ctx.post, ctx.warn),
    warn: ctx.warn,
  });
}
