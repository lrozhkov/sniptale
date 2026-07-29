// policyStateId: video-capture-surface-sessions
// The registry is reconstructed from the recording lease and surface WAL.
import type { AppliedCaptureSurface } from '../../../capture-surface';

export type VideoSurfaceSession = {
  applied: AppliedCaptureSurface | null;
  generation: number;
  recordingId: string;
  sourceReady: boolean;
  sourceVideoHeight: number | null;
  sourceVideoWidth: number | null;
  streamInstanceId: string | null;
  tabId: number | null;
};

const sessions = new Map<string, VideoSurfaceSession>();
const closedTabByRecording = new Map<string, number>();
const releasePromises = new Map<string, Promise<void>>();

export function createVideoSurfaceSession(args: {
  generation: number;
  recordingId: string;
  tabId: number | null;
}): VideoSurfaceSession {
  const session: VideoSurfaceSession = {
    applied: null,
    generation: args.generation,
    recordingId: args.recordingId,
    sourceReady: false,
    sourceVideoHeight: null,
    sourceVideoWidth: null,
    streamInstanceId: null,
    tabId: args.tabId,
  };
  sessions.set(args.recordingId, session);
  return session;
}

export function storeVideoSurfaceSession(session: VideoSurfaceSession): void {
  sessions.set(session.recordingId, session);
}

export function getVideoSurfaceSession(recordingId: string): VideoSurfaceSession | null {
  return sessions.get(recordingId) ?? null;
}

export function deleteVideoSurfaceSession(recordingId: string): void {
  sessions.delete(recordingId);
}

export function markVideoCaptureSurfaceTabClosed(recordingId: string, tabId: number): void {
  closedTabByRecording.set(recordingId, tabId);
}

export function getClosedVideoSurfaceTab(recordingId: string): number | null {
  return closedTabByRecording.get(recordingId) ?? null;
}

export function clearClosedVideoSurfaceTab(recordingId: string): void {
  closedTabByRecording.delete(recordingId);
}

export function getVideoSurfaceRelease(recordingId: string): Promise<void> | null {
  return releasePromises.get(recordingId) ?? null;
}

export function registerVideoSurfaceRelease(recordingId: string, release: Promise<void>): void {
  releasePromises.set(recordingId, release);
}

export function clearVideoSurfaceRelease(recordingId: string, release: Promise<void>): void {
  if (releasePromises.get(recordingId) === release) releasePromises.delete(recordingId);
}
