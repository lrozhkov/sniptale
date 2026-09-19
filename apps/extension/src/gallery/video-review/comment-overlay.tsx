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
  canvasCommentText,
  isCanvasCommentVisibleAt,
  overlayPulsePhase,
} from '../../features/video/review/comments';
import {
  computeQuickEditSceneLayout,
  quickEditCanvasPointToContent,
  quickEditContentPointToCanvas,
} from '../../features/video/review/advanced/scene';

type VideoRect = { x: number; y: number; width: number; height: number };

/** One overlay bubble with its media-time pulse and pointer drag commit. */
function OverlayComment(props: {
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
}) {
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
      }
      return;
    }
    const next = {
      x: Math.max(0, Math.min(1, origin.current.position.x + dx / props.output.width)),
      y: Math.max(0, Math.min(1, origin.current.position.y + dy / props.output.height)),
    };
    dragPositionRef.current = next;
    setDragPosition(next);
  };
  const finish = () => {
    origin.current = null;
    if (dragPositionRef.current) props.onMove(props.comment.id, dragPositionRef.current);
    dragPositionRef.current = null;
    setDragPosition(null);
  };
  useEffect(() => {
    if (!dragPosition) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      origin.current = null;
      dragPositionRef.current = null;
      setDragPosition(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [dragPosition]);
  const phase = overlayPulsePhase(props.sourceTime, props.comment.start);
  const below = props.comment.placement === 'below';
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
      {props.resolvedText.trim() ? (
        <div
          data-ui="gallery.videoReview.canvasCommentBubble"
          className="pointer-events-none absolute left-1/2 w-max max-w-56
              -translate-x-1/2 whitespace-pre-wrap break-words
              px-2.5 py-1.5 text-xs leading-snug shadow-sm"
          style={{
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
      <button
        type="button"
        aria-label={translate('gallery.videoReview.overlayPoint')}
        aria-pressed={props.selected}
        className="pointer-events-auto relative block h-3.5 w-3.5 cursor-grab touch-none
            rounded-full border-2 border-[var(--sniptale-color-surface)]
            bg-[var(--sniptale-color-accent)] shadow-sm"
        onClick={props.onSelect}
        onPointerDown={(event) => {
          if (props.busy) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = {
            pointer: { x: event.clientX, y: event.clientY },
            position: { ...props.comment.position },
          };
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          event.preventDefault();
          preview(
            event.clientX - origin.current.pointer.x,
            event.clientY - origin.current.pointer.y
          );
        }}
        onPointerUp={(event) => {
          if (!origin.current) return;
          event.stopPropagation();
          finish();
        }}
        onPointerCancel={() => {
          origin.current = null;
          dragPositionRef.current = null;
          setDragPosition(null);
        }}
      >
        <span
          className="absolute inset-0 -z-10 rounded-full
            bg-[var(--sniptale-color-accent)]"
          style={{
            opacity: 0.35 * (1 - phase),
            transform: `scale(${1 + 1.4 * phase})`,
          }}
        />
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
  comments: readonly CanvasComment[];
  annotations?: readonly ReviewAnnotation[];
  output: { width: number; height: number };
  source: { width: number; height: number };
  background: QuickEditBackgroundSettings;
  camera: QuickEditCameraTransform | null;
  time: number;
  selectedId: string | null;
  onSelect(id: string): void;
  onMove(id: string, position: { x: number; y: number }): void;
  busy: boolean;
}) {
  const layout = computeQuickEditSceneLayout({
    output: props.output,
    source: props.source,
    background: props.background,
    camera: props.camera ?? { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  return (
    <div
      data-ui="gallery.videoReview.commentOverlay"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {props.comments
        .filter((comment) => isCanvasCommentVisibleAt(comment, props.time))
        .map((comment) => {
          const content = comment.attachment === 'content';
          return (
            <OverlayComment
              key={comment.id}
              comment={comment}
              resolvedText={canvasCommentText(comment, props.annotations ?? [])}
              videoTransform={content ? layout.videoTransform : null}
              scale={content ? (props.camera?.scale ?? 1) : 1}
              layer={content ? 5 : 9}
              selected={comment.id === props.selectedId}
              busy={props.busy}
              output={props.output}
              sourceTime={props.time}
              onSelect={() => props.onSelect(comment.id)}
              onMove={props.onMove}
            />
          );
        })}
    </div>
  );
}
