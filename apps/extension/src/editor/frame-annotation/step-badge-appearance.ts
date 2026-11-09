import { getRepresentativeColor } from '@sniptale/foundation/paint';
import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';

/** Projects frame border settings into optional badge appearance props. */
export function getFrameStepBadgeAppearance(snapshot: FrameAnnotationSnapshotV1) {
  return {
    ...(snapshot.borderSettings?.fillPaint
      ? { fillColor: getRepresentativeColor(snapshot.borderSettings.fillPaint) }
      : {}),
    ...(snapshot.borderSettings?.shadow === undefined
      ? {}
      : { shadow: snapshot.borderSettings.shadow }),
  };
}
