import { videoManagerSession } from '../manager/session';

export function resetViewportNavigationState(): void {
  videoManagerSession.viewportNavigationEpoch = 0;
  videoManagerSession.viewportNavigationPending = false;
}
