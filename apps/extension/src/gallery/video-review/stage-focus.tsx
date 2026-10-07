import type { QuickEditHomography } from '../../features/video/review/advanced/spatial-geometry';
import { projectReviewFocus } from '../../features/video/review/focus-edits';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import { computeQuickEditWindowTransform } from '../../features/video/review/advanced/scene';
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
  projection?: QuickEditHomography | undefined;
  focus: ReviewStageFocus;
  layout: ZoomPreviewLayout;
  output: { width: number; height: number };
  behindTargets?: boolean;
}) {
  const { focus, layout, output } = props;
  const gesture = useReviewCameraGesture({
    pointerProjection: props.projection ? { matrix: props.projection, output } : undefined,
    camera: focus.region.transform,
    videoRect: { ...layout.windowRect, x: 0, y: 0 },
    output: layout.windowRect,
    view: 'result',
    onCommit: focus.onChange,
    onPreview: focus.onPreview,
    onInteract: focus.onInteract,
  });
  const overlay = focus.region.spotlight ?? focus.region.border;
  if (overlay)
    return (
      <ReviewFocusArea
        projection={props.projection}
        area={overlay.area}
        label={translate(
          focus.region.border
            ? 'gallery.videoReview.focusBorder'
            : 'gallery.videoReview.focusSpotlight'
        )}
        output={output}
        video={computeQuickEditWindowTransform(layout)}
        onInteract={focus.onInteract}
        onPreview={(area) =>
          focus.onPreview(
            area
              ? focus.region.border
                ? { border: { ...focus.region.border, area } }
                : { spotlight: { ...focus.region.spotlight!, area } }
              : null
          )
        }
        onChange={(area) =>
          focus.onChange(
            focus.region.border
              ? { border: { ...focus.region.border, area } }
              : { spotlight: { ...focus.region.spotlight!, area } }
          )
        }
      />
    );
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${props.behindTargets ? 'z-[8]' : 'z-10'}`}
    >
      <div
        data-ui="gallery.videoReview.zoomTarget"
        role="group"
        tabIndex={0}
        aria-label={translate('gallery.videoReview.zoomStageTarget')}
        title={translate('gallery.videoReview.zoomPanHint')}
        className="pointer-events-auto absolute cursor-grab outline-none active:cursor-grabbing
          focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]"
        style={{ ...rectStyle(layout.windowRect), touchAction: 'none' }}
        {...gesture.handlers}
      />
    </div>
  );
}

function rectStyle(rect: ZoomPreviewLayout['videoRect']) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

/** Picks retain authored identities even when cuts/speed split the displayed region into slices. */
export function reviewStagePickRegions(
  regions: readonly QuickEditZoomRegion[],
  segments: readonly ReviewTimeSegment[],
  time: number
): QuickEditZoomRegion[] {
  return regions.filter((region) =>
    projectReviewFocus([region], segments).some((part) => time >= part.start && time < part.end)
  );
}

export type ReviewStageFocusPicker = {
  regions: readonly QuickEditZoomRegion[];
  onSelect(id: string): void;
};

/** Picking precedes dragging: selection can seek/change camera without losing an active capture. */
export function ReviewStageFocusTargets(props: {
  picker: ReviewStageFocusPicker;
  selectedId?: string | undefined;
  video: QuickEditRect;
  clip?: { rect: QuickEditRect; radius: number } | undefined;
  output: { width: number; height: number };
}) {
  const { clip, output } = props;
  const insets = clip
    ? [
        clip.rect.y,
        output.width - clip.rect.x - clip.rect.width,
        output.height - clip.rect.y - clip.rect.height,
        clip.rect.x,
      ]
        .map((value) => `${value}px`)
        .join(' ')
    : null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[9]"
      style={clip && insets ? { clipPath: `inset(${insets} round ${clip.radius}px)` } : undefined}
    >
      {props.picker.regions
        .filter((region) => region.id !== props.selectedId)
        .toSorted(
          (a, b) => Number(!!(a.border || a.spotlight)) - Number(!!(b.border || b.spotlight))
        )
        .map((region) => {
          const area = (region.border ?? region.spotlight)?.area ?? {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          };
          const label = translate(
            region.border
              ? 'gallery.videoReview.focusBorder'
              : region.spotlight
                ? 'gallery.videoReview.focusSpotlight'
                : 'gallery.videoReview.zoomRegionLabel'
          );
          return (
            <button
              key={region.id}
              type="button"
              data-ui="gallery.videoReview.focusPick"
              aria-label={label}
              title={label}
              className="pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0 outline-none
                hover:ring-1 hover:ring-inset hover:ring-[var(--sniptale-color-accent)]
                focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--sniptale-color-accent)]"
              style={{
                left: props.video.x + props.video.width * area.x,
                top: props.video.y + props.video.height * area.y,
                width: props.video.width * area.width,
                height: props.video.height * area.height,
              }}
              onClick={() => props.picker.onSelect(region.id)}
            />
          );
        })}
    </div>
  );
}
