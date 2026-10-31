import type { NativeAppInboundMessage } from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { applyNativeLeaseStatus } from './status-updates';
import { getNativeIngestionAuthorityGeneration } from '../../capture/native-app/lifecycle-gate';
import { NativeInvocationReplayGuard } from './service-invocations';
import type { NativeControllerAcquireReason } from './service-types';

type ControllerLeaseMessage = Extract<NativeAppInboundMessage, { type: 'app.controller.lease' }>;
type OperationFailedMessage = Extract<NativeAppInboundMessage, { type: 'app.operation.failed' }>;

export class NativeServiceAuthorityState {
  private controllerLeaseGeneration: number | null = null;
  private handshakeAccepted = false;
  private pendingReason: NativeControllerAcquireReason | null = null;
  private readonly invocations = new NativeInvocationReplayGuard();

  acceptLeaseGeneration(): void {
    this.controllerLeaseGeneration = getNativeIngestionAuthorityGeneration();
  }

  clear(): void {
    this.controllerLeaseGeneration = null;
    this.handshakeAccepted = false;
    this.pendingReason = null;
    this.invocations.reset();
  }

  consumeInvocation(
    message: {
      controllerLeaseId: string;
      invocationId: string;
      requestedAtEpochMs: number;
    },
    warn: (message: string) => void
  ): boolean {
    return this.invocations.consume(message, warn);
  }

  getHandshakeAccepted(): boolean {
    return this.handshakeAccepted;
  }

  getPendingReason(): NativeControllerAcquireReason | null {
    return this.pendingReason;
  }

  ownsLease(status: NativeAppRuntimeStatus, message: { controllerLeaseId: string }): boolean {
    return (
      this.handshakeAccepted &&
      status.connectionState === 'connected' &&
      status.controllerLease?.status === 'granted' &&
      status.controllerLease.selectionStatus === 'selected' &&
      status.controllerLease.expiresAtEpochMs > Date.now() &&
      this.controllerLeaseGeneration === getNativeIngestionAuthorityGeneration() &&
      status.controllerLease.controllerLeaseId === message.controllerLeaseId
    );
  }

  setHandshakeAccepted(accepted: boolean): void {
    this.handshakeAccepted = accepted;
  }

  setPendingReason(reason: NativeControllerAcquireReason | null): void {
    this.pendingReason = reason;
  }
}

function isLeaseForCurrentConnection(args: {
  connectionId: string;
  extensionId: string;
  message: ControllerLeaseMessage;
}): boolean {
  return (
    args.message.controller.extensionId === args.extensionId &&
    args.message.controller.connectionId === args.connectionId
  );
}

export function applyNativeControllerLeaseAuthority(args: {
  connectionId: string;
  extensionId: string;
  handshakeAccepted: boolean;
  message: ControllerLeaseMessage;
  status: NativeAppRuntimeStatus;
  warn: (message: string) => void;
}):
  | { accepted: false }
  | { accepted: true; resumeLeaseId: string | null; status: NativeAppRuntimeStatus } {
  if (!args.handshakeAccepted) {
    args.warn('Rejected native controller lease before accepted handshake');
    return { accepted: false };
  }
  if (!isLeaseForCurrentConnection(args) || args.message.expiresAtEpochMs <= Date.now()) {
    args.warn('Rejected native controller lease for another connection');
    return { accepted: false };
  }

  return {
    accepted: true,
    resumeLeaseId: args.message.status === 'granted' ? args.message.controllerLeaseId : null,
    status: applyNativeLeaseStatus(args.status, args.message),
  };
}

export function shouldAcceptNativeOperationFailure(args: {
  handshakeAccepted: boolean;
  hasGrantedLease: (message: { controllerLeaseId: string }) => boolean;
  message: OperationFailedMessage;
  warn: (message: string) => void;
}): boolean {
  if (!args.handshakeAccepted) {
    args.warn('Rejected native operation failure before accepted handshake');
    return false;
  }
  if (
    args.message.controllerLeaseId !== undefined &&
    !args.hasGrantedLease({ controllerLeaseId: args.message.controllerLeaseId })
  ) {
    args.warn('Rejected stale native operation failure');
    return false;
  }
  return true;
}
