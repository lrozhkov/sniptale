import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';
import { useEffect, useRef, useState } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import type { CanvasComment, ReviewAnnotation } from '../../features/video/review/types';
import {
  CANVAS_COMMENT_BUBBLE,
  canvasCommentBubble,
  canvasCommentText,
  isCanvasCommentVisibleAt,
  overlayPulsePhase,
} from '../../features/video/review/comments';
import {
  computeQuickEditSceneLayout,
  quickEditCanvasPointToContent,
  quickEditContentPointToCanvas,
  quickEditVisibleVideoTransform,
} from '../../features/video/review/advanced/scene';

type VideoRect = { x: number; y: number; width: number; height: number };

/** Appearance and clipping share the export bubble bounds, independently of marker dragging. */
function OverlayCommentBubble(props: {
  comment: CanvasComment;
  resolvedText: string;
  scale: number;
  output: { width: number; height: number };
  selected: boolean;
}) {
  const bubble = canvasCommentBubble(props.comment.style, {
    width: props.output.width / props.scale,
    height: props.output.height / props.scale,
  });
  const below = props.comment.placement === 'below';
  return (
    <>
      {props.resolvedText.trim() ? (
        <div
          data-ui="gallery.videoReview.canvasCommentBubble"
          className="pointer-events-none absolute left-1/2 w-max max-w-56
              -translate-x-1/2 whitespace-pre-wrap break-words
              px-2.5 py-1.5 text-xs leading-snug shadow-sm"
          style={{
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: bubble.fontSize,
            maxWidth: bubble.maxWidth,
            maxHeight: bubble.maxHeight,
            overflow: 'hidden',
            boxSizing: 'border-box',
            padding: `${bubble.paddingY}px ${bubble.paddingX}px`,
            lineHeight: `${bubble.lineHeight}px`,
            background: serializePaintToCss(props.comment.style.fillPaint),
            color: props.comment.style.textColor,
            borderRadius: props.comment.style.radius,
            ...(below
              ? { top: `calc(100% + ${CANVAS_COMMENT_BUBBLE.gap}px)` }
              : { bottom: `calc(100% + ${CANVAS_COMMENT_BUBBLE.gap}px)` }),
            ...(props.selected
              ? { outline: '2px solid var(--sniptale-color-accent)', outlineOffset: 1 }
              : {}),
          }}
        >
          {props.resolvedText}
        </div>
      ) : null}
    </>
  );
}

/** One overlay bubble with its media-time pulse and pointer drag commit. */
type OverlayCommentProps = {
  projection?: QuickEditHomography | undefined;
  comment: CanvasComment;
  resolvedText: string;
  scale: number;
  layer: number;
  selected: boolean;
  busy: boolean;
  videoTransform: VideoRect | null;
  output: { width: number; height: number };
  sourceTime: number;
  onSelect(): void;
  onMove(id: string, position: { x: number; y: number }): void;
  visualMode?: 'handles' | undefined;
  onPreviewPosition?: ((id: string, position: { x: number; y: number } | null) => void) | undefined;
};

function useCommentDrag(props: OverlayCommentProps) {
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const dragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const origin = useRef<{
    pointer: { x: number; y: number };
    position: CanvasComment['position'];
  } | null>(null);
  const position = dragPosition ?? props.comment.position;
  const point = props.videoTransform
    ? quickEditContentPointToCanvas(position, props.videoTransform)
    : { x: position.x * props.output.width, y: position.y * props.output.height };
  const preview = (dx: number, dy: number) => {
    if (!origin.current) return;
    if (props.comment.attachment === 'content' && props.videoTransform) {
      const anchor = quickEditContentPointToCanvas(origin.current.position, props.videoTransform);
      const next = quickEditCanvasPointToContent(
        { x: anchor.x + dx, y: anchor.y + dy },
        props.videoTransform
      );
      if (next) {
        dragPositionRef.current = next;
        setDragPosition(next);
        props.onPreviewPosition?.(props.comment.id, next);
      }
      return;
    }
    const next = {
      x: Math.max(0, Math.min(1, origin.current.position.x + dx / props.output.width)),
      y: Math.max(0, Math.min(1, origin.current.position.y + dy / props.output.height)),
    };
    dragPositionRef.current = next;
    setDragPosition(next);
    props.onPreviewPosition?.(props.comment.id, next);
  };
  const pointer = (event: React.PointerEvent<HTMLElement>) => {
    const stage = event.currentTarget
      .closest('[data-ui="gallery.videoReview.stage"]')
      ?.getBoundingClientRect();
    const point = { x: event.clientX - (stage?.left ?? 0), y: event.clientY - (stage?.top ?? 0) };
    const inverse = props.projection ? invertQuickEditProjection(props.projection) : null;
    return inverse ? (projectQuickEditPoint(inverse, point) ?? point) : point;
  };
  const finish = () => {
    origin.current = null;
    if (dragPositionRef.current) props.onMove(props.comment.id, dragPositionRef.current);
    dragPositionRef.current = null;
    setDragPosition(null);
    props.onPreviewPosition?.(props.comment.id, null);
  };
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!dragPosition) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      origin.current = null;
      dragPositionRef.current = null;
      setDragPosition(null);
      latest.current.onPreviewPosition?.(latest.current.comment.id, null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [dragPosition]);

  useEffect(
    () => () => {
      if (dragPositionRef.current)
        latest.current.onPreviewPosition?.(latest.current.comment.id, null);
    },
    []
  );
  const cancel = () => {
    origin.current = null;
    dragPositionRef.current = null;
    setDragPosition(null);
    props.onPreviewPosition?.(props.comment.id, null);
  };
  return { point, origin, pointer, preview, finish, cancel };
}

function OverlayComment(props: OverlayCommentProps) {
  const { point, origin, pointer, preview, finish, cancel } = useCommentDrag(props);
  const phase = overlayPulsePhase(props.sourceTime, props.comment.start);
  return (
    <div
      data-ui="gallery.videoReview.canvasComment"
      className="absolute"
      style={{
        left: `${point.x}px`,
        top: `${point.y}px`,
        transform: `translate(-50%, -50%) scale(${props.scale})`,
        zIndex: props.layer,
      }}
    >
      {props.visualMode !== 'handles' ? (
        <OverlayCommentBubble
          comment={props.comment}
          resolvedText={props.resolvedText}
          scale={props.scale}
          output={props.output}
          selected={props.selected}
        />
      ) : null}
      <button
        type="button"
        aria-label={translate('gallery.videoReview.overlayPoint')}
        aria-pressed={props.selected}
        className="pointer-events-auto relative block h-3.5 w-3.5 cursor-grab touch-none
            rounded-full border-2 border-[var(--sniptale-color-surface)]
            bg-[var(--sniptale-color-accent)] shadow-sm"
        style={
          props.visualMode === 'handles'
            ? { background: 'transparent', boxShadow: 'none' }
            : undefined
        }
        onClick={props.onSelect}
        onPointerDown={(event) => {
          if (props.busy) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = {
            pointer: pointer(event),
            position: { ...props.comment.position },
          };
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          event.preventDefault();
          preview(
            pointer(event).x - origin.current.pointer.x,
            pointer(event).y - origin.current.pointer.y
          );
        }}
        onPointerUp={(event) => {
          if (!origin.current) return;
          event.stopPropagation();
          finish();
        }}
        onPointerCancel={cancel}
      >
        {props.visualMode !== 'handles' ? (
          <span
            className="absolute inset-0 -z-10 rounded-full
            bg-[var(--sniptale-color-accent)]"
            style={{
              opacity: 0.35 * (1 - phase),
              transform: `scale(${1 + 1.4 * phase})`,
            }}
          />
        ) : null}
      </button>
    </div>
  );
}

/**
 * Overlay comments in the renderer stack: content-attached bubbles ride the camera
 * transform and viewport-attached ones stay fixed to the output frame. The pulse
 * phase is a function of media time, so a paused seek and the export agree.
 */
export function ReviewCommentOverlay(props: {
  clip?:
    | { rect: { x: number; y: number; width: number; height: number }; radius: number }
    | undefined;
  projection?: QuickEditHomography | undefined;
  comments: readonly CanvasComment[];
  layout?: ReturnType<typeof computeQuickEditSceneLayout> | undefined;
  annotations?: readonly ReviewAnnotation[];
  output: { width: number; height: number };
  source: { width: number; height: number };
  background: QuickEditBackgroundSettings;
  camera: QuickEditCameraTransform | null;
  time: number;
  selectedId: string | null;
  onSelect(id: string): void;
  onMove(id: string, position: { x: number; y: number }): void;
  visualMode?: 'handles' | undefined;
  onPreviewPosition?: ((id: string, position: { x: number; y: number } | null) => void) | undefined;
  busy: boolean;
}) {
  const layout =
    props.layout ??
    computeQuickEditSceneLayout({
      output: props.output,
      source: props.source,
      background: props.background,
      camera: props.camera ?? { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
  const clip = props.projection || layout.sourceCrop ? props.clip?.rect : null;
  const radius = props.clip?.radius ?? 0;
  const visible = quickEditVisibleVideoTransform(layout);
  const cropClip = layout.sourceCrop
    ? `polygon(${[
        { x: visible.x, y: visible.y },
        { x: visible.x + visible.width, y: visible.y },
        { x: visible.x + visible.width, y: visible.y + visible.height },
        { x: visible.x, y: visible.y + visible.height },
      ]
        .map((point) => (props.projection ? projectQuickEditPoint(props.projection, point) : point))
        .filter((point) => point !== null)
        .map((point) => `${point.x}px ${point.y}px`)
        .join(',')})`
    : undefined;
  return (
    <div
      style={
        clip
          ? {
              clipPath: `inset(${[
                clip.y,
                props.output.width - clip.x - clip.width,
                props.output.height - clip.y - clip.height,
                clip.x,
              ]
                .map((v) => `${v}px`)
                .join(' ')} round ${radius}px)`,
            }
          : undefined
      }
      data-ui="gallery.videoReview.commentOverlay"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {props.comments
        .filter((comment) => isCanvasCommentVisibleAt(comment, props.time))
        .map((comment) => {
          const content = comment.attachment === 'content';
          return (
            <div
              key={comment.id}
              className="pointer-events-none absolute inset-0"
              style={content && cropClip ? { clipPath: cropClip } : undefined}
            >
              <OverlayComment
                visualMode={props.visualMode}
                onPreviewPosition={props.onPreviewPosition}
                projection={content ? props.projection : undefined}
                comment={comment}
                resolvedText={canvasCommentText(comment, props.annotations ?? [])}
                videoTransform={content ? layout.videoTransform : null}
                scale={
                  (props.output.width / Math.max(1, props.source.width)) *
                  (content ? (props.camera?.scale ?? 1) : 1)
                }
                layer={content ? 5 : 9}
                selected={comment.id === props.selectedId}
                busy={props.busy}
                output={props.output}
                sourceTime={props.time}
                onSelect={() => props.onSelect(comment.id)}
                onMove={props.onMove}
              />
            </div>
          );
        })}
    </div>
  );
}
