import { resolveCameraFollowPolicy } from '../../project/camera/cursor-policy';
import {
  createCursorActivationPlan,
  evaluateCursorActivation,
} from '../../composition/motion/cursor-orientation';
import { reviewCursorSpatialSettings } from './cursor-focus-path';
import { quickEditFocusType, resolveQuickEditFocusLink } from './focus-layout';
import type { QuickEditCameraTransform, QuickEditZoomRegion } from './types';
import {
  hasCameraPerspective as hasQuickEditPerspective,
  hasCursorComposition,
  interpolateCameraSpatial as interpolateQuickEditSpatial,
} from '../../project/motion/spatial';

/** Admit the renderer for effective zoom settings, including disposable cursor composition. */
export function quickEditRegionNeedsSpatialRenderer(region: QuickEditZoomRegion): boolean {
  if (region.dormant || quickEditFocusType(region) !== 'zoom') return false;
  if (region.cursorFocus && region.cursorComposition)
    return hasCursorComposition(region.cursorComposition);
  return hasQuickEditPerspective(region.perspective) || region.depthOfField?.enabled === true;
}

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
      active
        .slice(start, end + 1)
        .some((r) =>
          r.cursorFocus && r.cursorComposition
            ? hasCursorComposition(r.cursorComposition)
            : hasQuickEditPerspective(r.perspective)
        )
    )
      return true;
    start = end + 1;
  }
  return false;
}

/** Target authoring deliberately bypasses enter/exit without altering saved timing. */
export function quickEditSpatialTargetCamera(
  region: QuickEditZoomRegion,
  timelineTime = region.start
): QuickEditCameraTransform {
  region = reviewCursorSpatialSettings(region, timelineTime);
  if (!quickEditRegionNeedsSpatialRenderer(region)) return region.transform;
  return {
    ...region.transform,
    spatial: interpolateQuickEditSpatial(null, region, 1, {
      from: false,
      to: !!region.cursorFocus && hasCursorComposition(region.cursorComposition),
    }),
  };
}

/** Spatial activation and endpoint clocks use the same effective settings as the renderer. */
export function applyReviewCameraSpatial(
  regions: readonly QuickEditZoomRegion[],
  timelineTime: number,
  sample: {
    from: QuickEditZoomRegion | null;
    to: QuickEditZoomRegion;
    progress: number;
    phase: string;
  },
  camera: QuickEditCameraTransform
): QuickEditCameraTransform {
  const spatialFrom = sample.from
    ? reviewCursorSpatialSettings(
        sample.from,
        sample.phase === 'link' ? sample.from.end : timelineTime
      )
    : null;
  const spatialTo = reviewCursorSpatialSettings(
    sample.to,
    sample.phase === 'link' ? sample.to.start : timelineTime
  );
  const lockBackground = quickEditSpatialSpan(regions, timelineTime);
  if (lockBackground || spatialFrom?.depthOfField?.enabled || spatialTo.depthOfField?.enabled)
    return {
      ...camera,
      spatial: {
        ...interpolateQuickEditSpatial(spatialFrom, spatialTo, sample.progress, {
          from: !!sample.from?.cursorFocus && hasCursorComposition(sample.from.cursorComposition),
          to: !!sample.to.cursorFocus && hasCursorComposition(sample.to.cursorComposition),
          ...(sample.phase !== 'link' &&
          sample.to.cursorFocus &&
          hasCursorComposition(sample.to.cursorComposition)
            ? {
                progress: evaluateCursorActivation(
                  createCursorActivationPlan({
                    start: sample.to.start,
                    end: sample.to.end,
                    enterDuration: sample.to.enter.duration,
                    exitDuration: sample.to.exit.duration,
                    amount: sample.to.cursorComposition?.amount,
                    movementDuration: (
                      sample.to.cursorFocus?.policy ?? resolveCameraFollowPolicy({})
                    ).settings.transitionDuration,
                    connectedIn: regions.some(
                      (item) =>
                        resolveQuickEditFocusLink(regions, item.id)?.target.id === sample.to.id
                    ),
                    connectedOut: !!resolveQuickEditFocusLink(regions, sample.to.id),
                  }),
                  timelineTime
                ),
              }
            : {}),
        }),
        lockBackground,
      },
    };
  return camera;
}
