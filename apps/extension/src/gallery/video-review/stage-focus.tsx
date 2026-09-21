import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { translate } from '../../platform/i18n';
import { ReviewFocusArea } from './focus-area';
import { useReviewCameraGesture } from './camera-gesture';
import type { ZoomPreviewLayout } from './zoom-preview-paint';

/** Disposable preview and committed change stay separate on both editing surfaces. */
export type ReviewStageFocus = {
  region: QuickEditZoomRegion;
  onPreview(patch: QuickEditZoomRegionPatch | null): void;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onInteract(): void;
};

/** Direct scene manipulation uses the same normalized area and camera gesture as the inspector. */
export function ReviewStageFocusControl(props: {
  focus: ReviewStageFocus;
  layout: ZoomPreviewLayout;
  output: { width: number; height: number };
}) {
  const { focus, layout, output } = props;
  const gesture = useReviewCameraGesture({
    camera: focus.region.transform,
    videoRect: { ...layout.videoRect, x: 0, y: 0 },
    output: layout.videoRect,
    view: 'result',
    onCommit: focus.onChange,
    onPreview: focus.onPreview,
    onInteract: focus.onInteract,
  });
  if (focus.region.spotlight)
    return (
      <ReviewFocusArea
        spotlight={focus.region.spotlight}
        output={output}
        video={layout.videoRect}
        onInteract={focus.onInteract}
        onPreview={(spotlight) => focus.onPreview(spotlight ? { spotlight } : null)}
        onChange={(spotlight) => focus.onChange({ spotlight })}
      />
    );
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        data-ui="gallery.videoReview.zoomTarget"
        role="group"
        tabIndex={0}
        aria-label={translate('gallery.videoReview.zoomStageTarget')}
        title={translate('gallery.videoReview.zoomPanHint')}
        className="pointer-events-auto absolute cursor-grab outline-none active:cursor-grabbing
          focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]"
        style={{ ...rectStyle(layout.videoRect), touchAction: 'none' }}
        {...gesture.handlers}
      />
    </div>
  );
}

function rectStyle(rect: ZoomPreviewLayout['videoRect']) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}
