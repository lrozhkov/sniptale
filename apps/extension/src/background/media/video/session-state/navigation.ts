import { videoManagerSession } from '../manager/session';

export function freezeViewportNavigation(): number {
  videoManagerSession.viewportNavigationEpoch += 1;
  videoManagerSession.viewportNavigationPending = true;
  return videoManagerSession.viewportNavigationEpoch;
}

export function clearViewportNavigationPending(): void {
  videoManagerSession.viewportNavigationPending = false;
}
