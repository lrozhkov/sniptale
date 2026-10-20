import { quickEditFocusType, resolveQuickEditFocusLink } from './focus-layout';
import type { QuickEditCameraTransform, QuickEditZoomRegion } from './types';
import {
  hasCameraPerspective as hasQuickEditPerspective,
  interpolateCameraSpatial as interpolateQuickEditSpatial,
} from '../../project/motion/spatial';

/** Fixed-background spans use the complete projected topology, including ordinary linked zooms. */
export function quickEditSpatialSpan(
  regions: readonly QuickEditZoomRegion[],
  time: number
): boolean {
  const active = regions
    .filter((r) => !r.dormant && quickEditFocusType(r) === 'zoom')
    .toSorted((a, b) => a.start - b.start);
  let start = 0;
  while (start < active.length) {
    let end = start;
    while (end + 1 < active.length) {
      const current = active[end]!,
        next = active[end + 1]!;
      const linked = resolveQuickEditFocusLink(regions, current.id)?.target.id === next.id;
      if (!linked && current.end !== next.start) break;
      end++;
    }
    if (
      time >= active[start]!.start &&
      time < active[end]!.end &&
      active.slice(start, end + 1).some((r) => hasQuickEditPerspective(r.perspective))
    )
      return true;
    start = end + 1;
  }
  return false;
}

/** Target authoring deliberately bypasses enter/exit without altering saved timing. */
export function quickEditSpatialTargetCamera(
  region: QuickEditZoomRegion
): QuickEditCameraTransform {
  if (
    quickEditFocusType(region) !== 'zoom' ||
    (!hasQuickEditPerspective(region.perspective) && !region.depthOfField?.enabled)
  )
    return region.transform;
  return { ...region.transform, spatial: interpolateQuickEditSpatial(null, region, 1) };
}
