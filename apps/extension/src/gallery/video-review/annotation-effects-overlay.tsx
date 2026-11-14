import { animationRuntimeDuration } from '../../contracts/effect-runtime/animation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { type AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { resolveEffectLocaleText } from '@sniptale/runtime-contracts/effect-controls';
import { translate, useAppLocale } from '../../platform/i18n';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import {
  projectReviewAnnotationEffect,
  sampleReviewAnnotationEffect,
} from '../../features/video/review/annotation-effects/timing';
import { projectQuickEditPoint } from '../../features/video/composition/motion/spatial-geometry';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import {
  reviewAnnotationBodyGeometry,
  previewReviewAnnotationDrag,
  reviewAnnotationPlanePoint,
  type ReviewAnnotationGeometry,
} from './annotation-effects-geometry';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';

import {
  reviewAnnotationMagnetTargets,
  snapReviewAnnotation,
  type AnnotationMagnetGuide,
  type AnnotationMagnetLocks,
} from './annotation-effects-magnets';

type Editor = ReturnType<typeof useReviewAnnotationEffects>;
type Point = { x: number; y: number };
export type ReviewAnnotationEditing = {
  editor: Editor;
  selectedId: string | null;
  snapshots: readonly ReviewAnnotationEffectSnapshot[];
  segments: readonly ReviewTimeSegment[];
  time: number;
  busy: boolean;
  magnetEnabled?: boolean;
  beforeAction?: ReviewBeforeAction | undefined;
  onSelect(id: string): void;
};
type Drag = {
  instance: ReviewAnnotationEffect;
  document: AnimationTemplate;
  geometry: ReviewAnnotationGeometry;
  start: Point;
  point: Point;
  kind: 'move' | 'resize' | 'rotate' | { anchor: string };
  node: SVGSVGElement;
  pointerId: number;
  admission: ReturnType<typeof deferReviewGesture> | null;
  ended: boolean;
  ready: boolean;
  moved: boolean;
  bypass: boolean;
  targets: ReturnType<typeof reviewAnnotationMagnetTargets>;
  locks: AnnotationMagnetLocks;
};

function canonicalPointer(
  node: SVGSVGElement,
  geometry: ReviewAnnotationGeometry,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>
): Point | null {
  const bounds = node.getBoundingClientRect();
  if (!(bounds.width > 0 && bounds.height > 0)) return null;
  return {
    x: ((event.clientX - bounds.left) * geometry.viewport.width) / bounds.width,
    y: ((event.clientY - bounds.top) * geometry.viewport.height) / bounds.height,
  };
}

/** Only interaction geometry is SVG; the existing prepared compositor owns effect pixels. */
export function ReviewAnnotationOverlay({
  binding,
  geometry,
  size,
}: {
  binding: ReviewAnnotationEditing;
  geometry: ReviewAnnotationGeometry;
  size: { width: number; height: number };
}) {
  const locale = useAppLocale();
  const clipId = useId();
  const latest = useRef(binding);
  latest.current = binding;
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<AnnotationMagnetGuide[]>([]);
  const previewLatest = useRef<(current: Drag) => void>(() => undefined);
  const documents = useMemo(
    () =>
      new Map(
        binding.snapshots.map((snapshot) => [
          snapshot.id,
          readReviewAnnotationEffectDocument(snapshot.source),
        ])
      ),
    [binding.snapshots]
  );
  const cancel = () => {
    const current = drag.current;
    drag.current = null;
    setGuides([]);
    current?.admission?.cancel();
    latest.current.editor.cancelGesture();
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Alt' && drag.current) {
        drag.current.bypass = event.type === 'keydown';
        previewLatest.current(drag.current);
      }
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('keyup', escape, true);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('keyup', escape, true);
      cancel();
    };
  }, []);
  const preview = (current: Drag) => {
    if (!current.ready) return;
    const movement = previewReviewAnnotationDrag(current);
    if (movement) current.moved = true;
    const patch =
      movement ??
      (current.moved && current.kind === 'move'
        ? { transform: current.instance.transform }
        : undefined);
    if (patch?.transform && current.kind === 'move' && latest.current.magnetEnabled) {
      const snapped = snapReviewAnnotation({
        instance: { ...current.instance, transform: patch.transform },
        document: current.document,
        geometry: current.geometry,
        size,
        targets: current.targets,
        locks: current.locks,
        bypass: current.bypass,
      });
      current.locks = snapped.locks;
      setGuides(snapped.guides);
      patch.transform = snapped.transform;
    }
    if (patch) latest.current.editor.previewGesture(patch);
  };
  previewLatest.current = preview;
  const begin = (
    event: PointerEvent<SVGElement>,
    instance: ReviewAnnotationEffect,
    document: AnimationTemplate,
    kind: Drag['kind']
  ) => {
    if (event.button !== 0 || binding.busy || binding.editor.pending || drag.current) return;
    const node = event.currentTarget.ownerSVGElement;
    const canonical = node && canonicalPointer(node, geometry, event);
    const start = canonical && reviewAnnotationPlanePoint(geometry, instance.attachment, canonical);
    if (!node || !start) return;
    event.preventDefault();
    event.stopPropagation();
    const current: Drag = {
      instance: structuredClone(instance),
      document,
      geometry,
      start,
      point: start,
      kind,
      node,
      pointerId: event.pointerId,
      admission: null,
      ended: false,
      ready: false,
      moved: false,
      bypass: event.altKey,
      locks: {},
      targets: reviewAnnotationMagnetTargets(
        instance,
        (binding.editor.previewLane?.instances ?? []).flatMap((peer) => {
          const doc = documents.get(peer.snapshotId);
          return doc &&
            sampleReviewAnnotationEffect(
              projectReviewAnnotationEffect(peer, binding.segments),
              animationRuntimeDuration(doc),
              binding.time
            )
            ? [{ instance: peer, document: doc }]
            : [];
        }),
        geometry
      ),
    };
    drag.current = current;
    node.setPointerCapture(event.pointerId);
    current.admission = deferReviewGesture(binding.beforeAction, () => {
      if (drag.current !== current) return;
      latest.current.onSelect(instance.id);
      if (!latest.current.editor.beginGesture(instance.id)) {
        cancel();
        return;
      }
      current.ready = true;
      preview(current);
    });
  };
  const keyboard = (
    event: ReactKeyboardEvent<SVGElement>,
    instance: ReviewAnnotationEffect,
    document: AnimationTemplate,
    kind: Drag['kind'],
    point: Point
  ) => {
    if (binding.busy || binding.editor.pending) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (binding.beforeAction) binding.beforeAction(() => binding.onSelect(instance.id));
      else binding.onSelect(instance.id);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const node = event.currentTarget.ownerSVGElement;
    const start = reviewAnnotationPlanePoint(geometry, instance.attachment, point);
    if (!node || !start) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    let next = {
      x: start.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      y: start.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
    };
    if (kind === 'rotate') {
      const plane = geometry[instance.attachment];
      const cx = (instance.transform.x + instance.transform.width / 2) * plane.width,
        cy = (instance.transform.y + instance.transform.height / 2) * plane.height;
      const angle =
        ((event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -step : step) * Math.PI) / 180;
      const dx = start.x - cx,
        dy = start.y - cy;
      next = {
        x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
      };
    }
    const current: Drag = {
      instance: structuredClone(instance),
      document,
      geometry,
      start,
      point: next,
      kind,
      node,
      pointerId: 0,
      admission: null,
      ended: true,
      ready: true,
      moved: true,
      bypass: true,
      locks: {},
      targets: { x: [], y: [] },
    };
    const edit = () => {
      if (!latest.current.editor.beginGesture(instance.id)) return;
      latest.current.onSelect(instance.id);
      preview(current);
      void latest.current.editor.commitGesture();
    };
    (binding.beforeAction ?? ((action) => action()))(edit);
  };
  const finish = () => {
    const current = drag.current;
    if (!current || current.ended) return;
    current.ended = true;
    setGuides([]);
    if (current.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    current.admission?.commit(() => {
      if (drag.current !== current) return;
      drag.current = null;
      void latest.current.editor.commitGesture();
    });
  };
  const clip = useMemo(() => {
    const { rect, radius, projection } = geometry.clip;
    const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
    const points: Point[] = [];
    for (const [x, y, start] of [
      [rect.x + rect.width - r, rect.y + r, -Math.PI / 2],
      [rect.x + rect.width - r, rect.y + rect.height - r, 0],
      [rect.x + r, rect.y + rect.height - r, Math.PI / 2],
      [rect.x + r, rect.y + r, Math.PI],
    ]) {
      if (x === undefined || y === undefined || start === undefined) continue;
      for (let index = 0; index <= 12; index++) {
        const angle = start + (index * Math.PI) / 24;
        const point = projectQuickEditPoint(projection, {
          x: x + r * Math.cos(angle),
          y: y + r * Math.sin(angle),
        });
        if (point) points.push(point);
      }
    }
    return points.map((point) => `${point.x},${point.y}`).join(' ');
  }, [geometry]);
  const rx = (5 * geometry.viewport.width) / Math.max(1, size.width),
    ry = (5 * geometry.viewport.height) / Math.max(1, size.height);
  const crop = geometry.clip.crop;
  const cropClip = crop
    ? [
        { x: crop.x, y: crop.y },
        { x: crop.x + crop.width, y: crop.y },
        { x: crop.x + crop.width, y: crop.y + crop.height },
        { x: crop.x, y: crop.y + crop.height },
      ]
        .map((point) => projectQuickEditPoint(geometry.clip.projection, point))
        .filter((point) => point !== null)
        .map((point) => `${point.x},${point.y}`)
        .join(' ')
    : null;
  return (
    <svg
      data-ui="gallery.videoReview.annotationOverlay"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${geometry.viewport.width} ${geometry.viewport.height}`}
      preserveAspectRatio="none"
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.ended || current.pointerId !== event.pointerId) return;
        const canonical = canonicalPointer(current.node, current.geometry, event);
        const point =
          canonical &&
          reviewAnnotationPlanePoint(current.geometry, current.instance.attachment, canonical);
        if (point) {
          current.point = point;
          current.bypass = event.altKey;
          preview(current);
        }
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) finish();
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (drag.current && !drag.current.ended) cancel();
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={clip} />
        </clipPath>
        {cropClip ? (
          <clipPath id={`${clipId}-crop`}>
            <polygon points={cropClip} clipPath={`url(#${clipId})`} />
          </clipPath>
        ) : null}
      </defs>
      <g
        data-ui="gallery.videoReview.annotationMagnetGuides"
        stroke="var(--sniptale-color-accent)"
        strokeWidth={1}
        strokeDasharray="4 3"
      >
        {guides.map((guide, index) => (
          <line
            key={index}
            x1={guide.start.x}
            y1={guide.start.y}
            x2={guide.end.x}
            y2={guide.end.y}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      {binding.editor.previewLane?.instances.map((instance) => {
        const document = documents.get(instance.snapshotId);
        if (
          !document ||
          !sampleReviewAnnotationEffect(
            projectReviewAnnotationEffect(instance, binding.segments),
            animationRuntimeDuration(document),
            binding.time
          )
        )
          return null;
        const body = reviewAnnotationBodyGeometry(instance, document, geometry);
        if (!body) return null;
        const selected = binding.selectedId === instance.id;
        const resize = body.corners[2];
        const top = body.corners[0],
          right = body.corners[1];
        const rotate =
          top && right ? { x: (top.x + right.x) / 2, y: (top.y + right.y) / 2 - ry * 4 } : null;
        const label = resolveEffectLocaleText(document.label, locale);
        const handle = (point: Point, kind: Drag['kind'], name: string, key: string) => (
          <ellipse
            key={key}
            data-handle={key}
            role="button"
            tabIndex={binding.busy ? -1 : 0}
            aria-label={name}
            aria-disabled={binding.busy || binding.editor.pending}
            cx={point.x}
            cy={point.y}
            rx={rx}
            ry={ry}
            fill="var(--sniptale-color-surface-panel)"
            stroke="var(--sniptale-color-accent)"
            vectorEffect="non-scaling-stroke"
            className="pointer-events-auto"
            onPointerDown={(event) => begin(event, instance, document, kind)}
            onKeyDown={(event) => keyboard(event, instance, document, kind, point)}
          />
        );
        return (
          <g
            key={instance.id}
            clipPath={
              instance.attachment === 'content'
                ? `url(#${clipId}${cropClip ? '-crop' : ''})`
                : undefined
            }
          >
            <polygon
              data-annotation-id={instance.id}
              role="button"
              tabIndex={binding.busy ? -1 : 0}
              aria-label={label}
              aria-pressed={selected}
              aria-disabled={binding.busy || binding.editor.pending}
              points={body.corners.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="transparent"
              stroke={selected ? 'var(--sniptale-color-accent)' : 'transparent'}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              className="pointer-events-auto"
              onPointerDown={(event) => begin(event, instance, document, 'move')}
              onKeyDown={(event) => {
                const point = body.corners[0];
                if (point) keyboard(event, instance, document, 'move', point);
              }}
            />
            {selected &&
              resize &&
              handle(resize, 'resize', translate('gallery.videoReview.annotationResize'), 'resize')}
            {selected &&
              rotate &&
              handle(rotate, 'rotate', translate('gallery.videoReview.annotationRotate'), 'rotate')}
            {selected &&
              body.handles.map(
                (item) =>
                  item.point &&
                  handle(
                    item.point,
                    { anchor: item.id },
                    resolveEffectLocaleText(item.label, locale),
                    item.id
                  )
              )}
          </g>
        );
      })}
    </svg>
  );
}
