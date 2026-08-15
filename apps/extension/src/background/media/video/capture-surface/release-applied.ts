import { getCaptureSurfaceService, type AppliedCaptureSurface } from '../../../capture-surface';

export async function releaseAppliedVideoCaptureSurface(
  applied: AppliedCaptureSurface,
  _tabId: number | null
): Promise<void> {
  await getCaptureSurfaceService().release(applied);
}
