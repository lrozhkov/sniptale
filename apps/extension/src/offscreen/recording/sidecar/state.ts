import type { RecordingSidecarSession } from './types';

let activeSidecarSession: RecordingSidecarSession | null = null;

export function getActiveSidecarSession(): RecordingSidecarSession | null {
  return activeSidecarSession;
}

export function hasActiveSidecarSession(): boolean {
  return activeSidecarSession !== null;
}

export function setActiveSidecarSession(session: RecordingSidecarSession | null): void {
  activeSidecarSession = session;
}
