import { useEffect, useRef, type PointerEvent } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnnotationEffectTransform } from '../../features/video/review/annotation-effects/types';
import type { ReviewAnnotationEditing } from './annotation-effects-overlay';
import { deferReviewGesture } from './note-transitions';

type Drag = {
  node: SVGRectElement;
  pointerId: number;
  start: { x: number; y: number };
  delta: { x: number; y: number };
  transform: ReviewAnnotationEffectTransform;
  size: { width: number; height: number };
  ready: boolean;
  ended: boolean;
  moved: boolean;
  admission?: ReturnType<typeof deferReviewGesture>;
};

function move(transform: ReviewAnnotationEffectTransform, x: number, y: number) {
  return {
    ...transform,
    x: Math.max(-16, Math.min(16, transform.x + x)),
    y: Math.max(-16, Math.min(16, transform.y + y)),
  };
}

/** Selected native text uses the viewport plane and the annotation gesture transaction. */
export function ReviewAnnotationTextOverlay({
  binding,
  size,
}: {
  binding: ReviewAnnotationEditing;
  size: { width: number; height: number };
}) {
  const drag = useRef<Drag | null>(null);
  const editorRef = useRef(binding.editor);
  editorRef.current = binding.editor;
  const clip = binding.editor.previewLane?.textClips?.find(
    (item) => item.id === binding.selectedId
  );
  const clipId = clip?.id;
  useEffect(() => {
    if (!clipId) return;
    const cancel = () => {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      current.admission?.cancel();
      if (current.ready) editorRef.current.cancelGesture();
      if (current.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
      cancel();
    };
  }, [clipId]);
  if (!clip?.enabled || binding.time < clip.start || binding.time >= clip.end) return null;
  const { transform } = clip;
  const x = transform.x * size.width;
  const y = transform.y * size.height;
  const width = transform.width * size.width;
  const height = transform.height * size.height;
  const preview = (current: Drag) => {
    if (!current.ready || !current.moved) return;
    editorRef.current.previewGesture({
      transform: move(
        current.transform,
        current.delta.x / current.size.width,
        current.delta.y / current.size.height
      ),
    });
  };
  const update = (event: PointerEvent<SVGRectElement>, current: Drag) => {
    const x = event.clientX - current.start.x;
    const y = event.clientY - current.start.y;
    current.delta = { x, y };
    if (Math.hypot(x, y) >= 2) current.moved = true;
    preview(current);
  };
  const finish = (event: PointerEvent<SVGRectElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || current.ended || current.pointerId !== event.pointerId) return;
    current.ended = true;
    if (!cancelled) update(event, current);
    if (cancelled || !current.moved) {
      drag.current = null;
      current.admission?.cancel();
      if (current.ready) editorRef.current.cancelGesture();
    } else {
      current.admission?.commit(() => {
        if (drag.current !== current) return;
        drag.current = null;
        if (current.ready) void editorRef.current.commitGesture();
      });
    }
    if (current.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
  };
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${size.width} ${size.height}`}
      data-ui="gallery.videoReview.annotationTextOverlay"
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        transform={`rotate(${(transform.rotation * 180) / Math.PI} ${x + width / 2} ${y + height / 2})`}
        fill="transparent"
        stroke="var(--sniptale-color-accent)"
        vectorEffect="non-scaling-stroke"
        className={binding.busy ? undefined : 'pointer-events-auto touch-none cursor-move'}
        role="button"
        tabIndex={binding.busy ? -1 : 0}
        aria-label={translate('gallery.videoReview.annotationTextMove')}
        aria-disabled={binding.busy}
        onPointerDown={(event) => {
          if (binding.busy || event.button !== 0) return;
          const pending = drag.current;
          if (pending && !pending.ended) return;
          // Save admission can drop an ended gesture without invoking its continuation.
          pending?.admission?.cancel();
          drag.current = null;
          const node = event.currentTarget;
          const bounds = node.ownerSVGElement?.getBoundingClientRect();
          if (!bounds?.width || !bounds.height) return;
          event.stopPropagation();
          const current: Drag = {
            node,
            pointerId: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            delta: { x: 0, y: 0 },
            transform,
            size: { width: bounds.width, height: bounds.height },
            ready: false,
            ended: false,
            moved: false,
          };
          drag.current = current;
          node.setPointerCapture(event.pointerId);
          current.admission = deferReviewGesture(binding.beforeAction, () => {
            if (drag.current !== current) return;
            current.ready = editorRef.current.beginGesture(clip.id);
            preview(current);
          });
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (current?.pointerId === event.pointerId && !current.ended) update(event, current);
        }}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onKeyDown={(event) => {
          const delta = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          const key = event.key;
          if (
            binding.busy ||
            !(
              key === 'ArrowLeft' ||
              key === 'ArrowRight' ||
              key === 'ArrowUp' ||
              key === 'ArrowDown'
            )
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? 10 : 1;
          const [x, y] = delta[key];
          const apply = () => {
            if (!editorRef.current.beginGesture(clip.id)) return;
            editorRef.current.previewGesture({
              transform: move(transform, (x! * step) / size.width, (y! * step) / size.height),
            });
            void editorRef.current.commitGesture();
          };
          if (binding.beforeAction) binding.beforeAction(apply);
          else apply();
        }}
      />
    </svg>
  );
}
