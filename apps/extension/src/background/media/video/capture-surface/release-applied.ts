import { getCaptureSurfaceService, type AppliedCaptureSurface } from '../../../capture-surface';
import { disableViewportCursorProjection } from './cursor-projection';

export async function releaseAppliedVideoCaptureSurface(
  applied: AppliedCaptureSurface,
  tabId: number | null
): Promise<void> {
  if (applied.target === 'viewport') {
    if (tabId === null) {
      throw new Error('Viewport capture surface tab identity is unavailable');
    }
    await disableViewportCursorProjection(tabId, {
      generation: applied.generation,
      recordingId: applied.sessionId,
    });
  }
  await getCaptureSurfaceService().release(applied);
}
