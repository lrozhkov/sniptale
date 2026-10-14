import type { RefObject, CSSProperties } from 'react';
import { translate } from '../../platform/i18n';
import {
  computeQuickEditSceneCamera,
  type computeQuickEditSceneLayout,
} from '../../features/video/review/advanced/scene';
import { resolveQuickEditShadow } from '../../features/video/review/advanced/shadow';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import type { ReviewRegion } from '../../features/video/review/types';
import type { useReviewWindowHeader } from './use-window-header';
import {
  ReviewCutTransitionPreview,
  type ReviewCutPreviewBinding,
  type ReviewCutPreviewRaster,
} from './cut-transition-preview';

/** One composition-space video: fitted inside the padded content rect, cropped by the clip. */
export function ReviewSceneVideo(props: {
  manual: boolean;
  cutPreview?: ReviewCutPreviewBinding | undefined;
  onCutRaster?: ((raster: ReviewCutPreviewRaster) => void) | undefined;
  url: string;
  video: RefObject<HTMLVideoElement | null>;
  scene?: {
    background: QuickEditBackgroundSettings;
    canvas?: { width: number; height: number } | undefined;
    windowHeader?:
      | import('../../features/video/review/advanced/types').QuickEditWindowHeader
      | undefined;
    camera: QuickEditCameraTransform;
  };
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  previewScale: number;
  header: ReturnType<typeof useReviewWindowHeader>;
  drawing: boolean;
  projected: ReviewRegion | null;
  onReady(): void;
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onEnded?: (() => void) | undefined;
  onError(): void;
}) {
  const geometry = reviewNativeVideoGeometry(props);
  return (
    <div style={geometry.container}>
      <ReviewWindowHeader
        header={props.header}
        layout={props.layout}
        transform={geometry.transform}
      />
      <video
        ref={props.video}
        src={props.url}
        controls={false}
        playsInline
        preload="metadata"
        className="pointer-events-none"
        style={geometry.video}
        onLoadedMetadata={props.onReady}
        onTimeUpdate={(event) => props.onTime(event.currentTarget.currentTime)}
        onPlay={() => props.onPlaying(true)}
        onPause={() => props.onPlaying(false)}
        onEnded={() => (props.onEnded ? props.onEnded() : props.onPlaying(false))}
        onError={props.onError}
      />
      {!props.manual && props.cutPreview && props.layout ? (
        <ReviewCutTransitionPreview
          binding={props.cutPreview}
          onRaster={props.onCutRaster}
          video={props.video}
          style={geometry.content}
        />
      ) : null}
      {props.projected ? (
        <ReviewRegionOverlay
          drawing={props.drawing}
          offset={geometry.offset}
          projected={props.projected}
        />
      ) : null}
    </div>
  );
}

/** Normalize fitting once so native video, header, transition and selection use the same represented plane. */
function reviewNativeVideoGeometry(
  props: Pick<
    Parameters<typeof ReviewSceneVideo>[0],
    'layout' | 'scene' | 'manual' | 'previewScale'
  >
): {
  container: CSSProperties;
  video: CSSProperties;
  content: CSSProperties;
  offset: { x: number; y: number };
  transform: string;
} {
  const scale = props.scene?.camera.scale ?? 1;
  const background = props.scene?.background ?? { enabled: false };
  const layout = props.layout;
  const motion = layout && props.scene ? computeQuickEditSceneCamera(layout, background) : null;
  const cameraScale = motion?.scale ?? 1;
  const shadow = resolveQuickEditShadow(background, props.previewScale * cameraScale);
  const container: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    opacity: props.manual ? 0 : undefined,
    pointerEvents: props.manual ? 'none' : undefined,
    boxShadow: shadow
      ? `0 0 ${shadow.blur}px color-mix(in srgb, ${shadow.color} ${shadow.opacity * 100}%, transparent)`
      : undefined,
    borderRadius: background.enabled
      ? background.layout.cornerRadius * props.previewScale * cameraScale
      : undefined,
  };
  if (!layout)
    return {
      container,
      content: {},
      offset: { x: 0, y: 0 },
      transform: `translate3d(0px, 0px, 0) scale(${scale})`,
      video: {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        pointerEvents: 'none',
      },
    };
  const videoClip = motion?.windowClip ?? layout.windowRect;
  const offsetX = layout.videoTransform.x - videoClip.x;
  const offsetY = layout.videoTransform.y - videoClip.y;
  const transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
  const content: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: layout.videoRect.width,
    height: layout.videoRect.height,
    transformOrigin: '0 0',
    transform,
    maxWidth: 'none',
    ...(layout.sourceCrop
      ? {
          clipPath: `inset(${[
            layout.sourceCrop.y,
            1 - layout.sourceCrop.x - layout.sourceCrop.width,
            1 - layout.sourceCrop.y - layout.sourceCrop.height,
            layout.sourceCrop.x,
          ]
            .map((value) => `${value * 100}%`)
            .join(' ')})`,
        }
      : {}),
  };
  return {
    container: {
      ...container,
      left: videoClip.x,
      top: videoClip.y,
      width: videoClip.width,
      height: videoClip.height,
    },
    // Geometry already fits the source; native contain can expose a raster seam.
    video: { ...content, objectFit: 'fill', pointerEvents: 'none' },
    content,
    offset: { x: videoClip.x, y: videoClip.y },
    transform,
  };
}

/** Artwork and its opaque join ride the same transform as the native video. */
function ReviewWindowHeader({
  header,
  layout,
  transform,
}: {
  header: ReturnType<typeof useReviewWindowHeader>;
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  transform: string;
}) {
  if (!header.image || !layout) return null;
  const visible = layout.visibleVideoRect ?? layout.videoRect;
  const x = visible.x - layout.videoRect.x;
  const y = visible.y - layout.videoRect.y;
  const headerTransform = layout.sourceCrop ? `${transform} translate(${x}px, ${y}px)` : transform;
  const common = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: visible.width,
    transformOrigin: '0 0',
    pointerEvents: 'none' as const,
  };
  return (
    <>
      {/* Back both sides of the join; independently antialiased textures can otherwise expose the scene. */}
      <div
        style={{
          ...common,
          height: 2,
          background: header.joinColor,
          transform: `${headerTransform} translateY(-1px)`,
        }}
      />
      <img
        alt=""
        src={header.url ?? undefined}
        draggable={false}
        style={{
          ...common,
          height: visible.y - layout.windowRect.y,
          // Layout-sized zooming rounds each edge separately and rerasterizes the SVG each frame.
          transform: `${headerTransform} translateY(-100%)`,
          maxWidth: 'none',
        }}
      />
    </>
  );
}

/** Display the represented selection without changing the authored source region. */
export function ReviewRegionOverlay(props: {
  drawing: boolean;
  offset: { x: number; y: number };
  projected: ReviewRegion;
}) {
  return (
    <div
      aria-label={translate('gallery.videoReview.selectedRegion')}
      className={`${props.drawing ? 'cursor-move' : 'pointer-events-none'}
          absolute border-2 border-[var(--sniptale-color-accent)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]`}
      style={{
        left: props.projected.x - props.offset.x,
        top: props.projected.y - props.offset.y,
        width: props.projected.width,
        height: props.projected.height,
      }}
    >
      {props.drawing
        ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <span
              key={corner}
              data-region-corner={corner}
              className={[
                'absolute h-2.5 w-2.5 rounded-sm border border-[var(--sniptale-color-accent)]',
                'bg-[var(--sniptale-color-surface-panel)]',
              ].join(' ')}
              style={{
                left: corner.endsWith('w') ? -5 : undefined,
                right: corner.endsWith('e') ? -5 : undefined,
                top: corner.startsWith('n') ? -5 : undefined,
                bottom: corner.startsWith('s') ? -5 : undefined,
                cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
              }}
            />
          ))
        : null}
    </div>
  );
}
