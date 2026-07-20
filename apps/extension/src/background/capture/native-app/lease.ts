import type { NativeAppIngestionControllerDeps } from './ingestion-types';

export function isCurrentLease(
  deps: NativeAppIngestionControllerDeps,
  controllerLeaseId: string
): boolean {
  const currentLeaseId = deps.getCurrentControllerLeaseId?.() ?? null;
  return currentLeaseId === controllerLeaseId;
}

export function sessionMatchesLease(
  session: { controllerLeaseId: string },
  message: { controllerLeaseId: string }
): boolean {
  return session.controllerLeaseId === message.controllerLeaseId;
}
