import { quickEditFocusType } from './focus-layout';
import { resolveReviewSceneCameraPlan } from './scene';
import type { QuickEditZoomRegion, QuickEditCameraSceneInput } from './types';

/** Prepare active follow effects when scene geometry changes, before their first playback frame. */
export function prepareReviewCameraPlans(
  regions: readonly QuickEditZoomRegion[],
  scene: QuickEditCameraSceneInput
): void {
  for (const region of regions) {
    if (
      !region.dormant &&
      quickEditFocusType(region) === 'zoom' &&
      region.cursorFocus?.path.mode === 'follow'
    )
      resolveReviewSceneCameraPlan(regions, region, scene);
  }
}
