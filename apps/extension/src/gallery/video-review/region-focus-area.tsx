import type { QuickEditHomography } from '../../features/video/composition/motion/spatial-geometry';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import {
  resolveQuickEditLensArea,
  authorQuickEditLensArea,
  constrainQuickEditLensArea,
  areQuickEditSpotlightAreasEqual,
} from '../../features/video/project/scene/focus-appearance';
import { translate } from '../../platform/i18n';
import { ReviewFocusArea } from './focus-area';

/** Region geometry and patch conversion are shared by stage and inspector gestures. */
export function ReviewRegionFocusArea(props: {
  region: QuickEditZoomRegion;
  video: QuickEditRect;
  output: { width: number; height: number };
  projection?: QuickEditHomography | undefined;
  disabled?: boolean;
  alwaysVisible?: boolean;
  onInteract?(): void;
  onPreview?(patch: QuickEditZoomRegionPatch | null): void;
  onChange(patch: QuickEditZoomRegionPatch): void;
}) {
  const { region, video } = props;
  const spotlight = region.spotlight;
  const overlay = spotlight ?? region.border;
  if (!overlay) return null;
  const area = spotlight ? resolveQuickEditLensArea(spotlight, video) : overlay.area;
  const circle = spotlight?.effect === 'magnify' && spotlight.lensShape === 'circle';
  const patchArea = (next: typeof area): QuickEditZoomRegionPatch =>
    region.border
      ? { border: { ...region.border, area: next } }
      : { spotlight: { ...spotlight!, area: authorQuickEditLensArea(spotlight!, next) } };
  return (
    <ReviewFocusArea
      projection={props.projection}
      area={area}
      aspectRatio={circle ? 1 : undefined}
      constrainArea={
        circle ? (next) => constrainQuickEditLensArea(spotlight, next, video) : undefined
      }
      label={translate(
        region.border
          ? 'gallery.videoReview.focusBorder'
          : spotlight?.effect === 'magnify'
            ? 'gallery.videoReview.focusLens'
            : 'gallery.videoReview.focusSpotlight'
      )}
      output={props.output}
      video={video}
      disabled={props.disabled ?? false}
      alwaysVisible={props.alwaysVisible ?? false}
      onInteract={() => props.onInteract?.()}
      onPreview={(next) =>
        props.onPreview?.(
          next && !(circle && areQuickEditSpotlightAreasEqual(next, area)) ? patchArea(next) : null
        )
      }
      onChange={(next) => props.onChange(patchArea(next))}
    />
  );
}
