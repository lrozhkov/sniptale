import { measureReviewAnnotationBody } from '../../workflows/video-review/annotation-body-bounds';
import { createEffectRuntimeSandboxExecutor } from '../../workflows/video/effect-runtime-sandbox';
import { resolveReviewAnnotationEffectControls } from '../../features/video/review/annotation-effects/layout';
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
  setReviewAnnotationBodyBounds,
  reviewAnnotationBodyMeasurementKey,
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
  kind: Parameters<typeof previewReviewAnnotationDrag>[0]['kind'];
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
  const [movement, setMovement] = useState<ReviewAnnotationEffect | null>(null);
  const channel = binding.editor.movement;
  useEffect(
    () =>
      channel?.subscribe((value) => {
        setMovement(value);
      }),
    [channel]
  );
  const [guides, setGuides] = useState<AnnotationMagnetGuide[]>([]);
  const previewLatest = useRef<(current: Drag) => void>(() => undefined);
  const parsedDocuments = useRef(
    new Map<string, { source: string; document: AnimationTemplate | null }>()
  );
  const documents = useMemo(() => {
    const result = new Map<string, AnimationTemplate | null>();
    for (const snapshot of binding.snapshots) {
      let cached = parsedDocuments.current.get(snapshot.id);
      if (!cached || cached.source !== snapshot.source) {
        cached = {
          source: snapshot.source,
          document: readReviewAnnotationEffectDocument(snapshot.source, snapshot.sha256),
        };
        parsedDocuments.current.set(snapshot.id, cached);
      }
      result.set(snapshot.id, cached.document);
    }
    for (const id of parsedDocuments.current.keys())
      if (!result.has(id)) parsedDocuments.current.delete(id);
    return result;
  }, [binding.snapshots]);
  const [, refreshBody] = useState(0);
  const bodyCache = useRef(binding.editor.bodyMeasurements);
  const selectedBody = binding.editor.previewLane?.instances.find(
    (item) => item.id === binding.selectedId
  );
  const bodyDocument = selectedBody && documents.get(selectedBody.snapshotId);
  const bodyControls =
    selectedBody && bodyDocument
      ? resolveReviewAnnotationEffectControls(
          bodyDocument,
          selectedBody,
          geometry[selectedBody.attachment]
        )
      : null;
  const bodyKey =
    selectedBody && bodyControls
      ? reviewAnnotationBodyMeasurementKey(selectedBody, bodyControls)
      : null;
  const cachedBody = bodyKey ? bodyCache.current.get(bodyKey) : undefined;
  if (selectedBody && bodyDocument && cachedBody)
    setReviewAnnotationBodyBounds(bodyDocument, selectedBody.id, cachedBody);
  const bodyId = selectedBody?.id;
  const bodyGesture = binding.editor.gestureId;
  const bodyRequest = useRef({
    instance: selectedBody,
    document: bodyDocument,
    controls: bodyControls,
    key: bodyKey,
    snapshot: binding.snapshots.find((item) => item.id === selectedBody?.snapshotId),
  });
  bodyRequest.current = {
    instance: selectedBody,
    document: bodyDocument,
    controls: bodyControls,
    key: bodyKey,
    snapshot: binding.snapshots.find((item) => item.id === selectedBody?.snapshotId),
  };
  useEffect(() => {
    // Content key, immutable document, identity and gesture phase own this asynchronous measurement.
    // Root rerenders must not abort/restart it merely because their binding objects changed.
    const { instance, document, controls, key, snapshot } = bodyRequest.current;
    if (
      !instance ||
      !document ||
      !controls ||
      !key ||
      bodyGesture ||
      typeof OffscreenCanvas === 'undefined'
    )
      return;
    const cached = bodyCache.current.get(key);
    if (cached) {
      setReviewAnnotationBodyBounds(document, instance.id, cached);
      refreshBody((value) => value + 1);
      return;
    }
    if (!snapshot) return;
    const controller = new AbortController();
    const executor = createEffectRuntimeSandboxExecutor({ compositionBackend: 'gpu-preview' });
    void measureReviewAnnotationBody({
      executor,
      snapshot,
      document,
      controls,
      signal: controller.signal,
    })
      .then((bounds) => {
        if (!bounds || controller.signal.aborted) return;
        if (bodyCache.current.size >= 32) bodyCache.current.clear();
        bodyCache.current.set(key, bounds);
        setReviewAnnotationBodyBounds(document, instance.id, bounds);
        refreshBody((value) => value + 1);
        latest.current.editor.refreshBodyGeometry();
      })
      .catch(() => undefined)
      .finally(() => executor.dispose());
    return () => {
      controller.abort();
      executor.dispose();
    };
  }, [bodyDocument, bodyKey, bodyId, bodyGesture]);

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
    if (patch) {
      const editor = latest.current.editor;
      if (!(patch.transform && editor.previewMovement?.(patch.transform)))
        editor.previewGesture(patch);
    }
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
      const center = reviewAnnotationBodyGeometry(instance, document, geometry)?.center;
      if (!center) return;
      const cx = center.x,
        cy = center.y;
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
      {binding.editor.previewLane?.instances.map((entry) => {
        const instance = movement?.id === entry.id ? movement : entry;
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
        const top = body.corners[0],
          right = body.corners[1];
        const rotate =
          top && right ? { x: (top.x + right.x) / 2, y: (top.y + right.y) / 2 - ry * 4 } : null;
        const label = resolveEffectLocaleText(document.label, locale);
        const handle = (point: Point, kind: Drag['kind'], name: string, key: string) => {
          const resizing = kind === 'resize' || (typeof kind === 'object' && 'resize' in kind);
          const anchor = typeof kind === 'object' && 'anchor' in kind;
          let display = point;
          if (resizing) {
            const center = {
              x: body.corners.reduce((sum, p) => sum + p.x, 0) / 4,
              y: body.corners.reduce((sum, p) => sum + p.y, 0) / 4,
            };
            const dx = ((point.x - center.x) * size.width) / geometry.viewport.width;
            const dy = ((point.y - center.y) * size.height) / geometry.viewport.height;
            const length = Math.hypot(dx, dy);
            if (length > 0)
              display = {
                x: point.x + ((dx / length) * 6 * geometry.viewport.width) / size.width,
                y: point.y + ((dy / length) * 6 * geometry.viewport.height) / size.height,
              };
          }
          const Tag = resizing ? 'rect' : 'ellipse';
          return (
            <Tag
              key={key}
              data-handle={key}
              role="button"
              tabIndex={binding.busy ? -1 : 0}
              aria-label={name}
              aria-disabled={binding.busy || binding.editor.pending}
              {...(resizing
                ? {
                    x: display.x - rx * 0.8,
                    y: display.y - ry * 0.8,
                    width: rx * 1.6,
                    height: ry * 1.6,
                  }
                : { cx: display.x, cy: display.y })}
              rx={resizing ? rx / 5 : rx}
              ry={resizing ? ry / 5 : ry}
              fill={anchor ? 'var(--sniptale-color-accent)' : 'var(--sniptale-color-surface-panel)'}
              stroke={
                anchor ? 'var(--sniptale-color-surface-panel)' : 'var(--sniptale-color-accent)'
              }
              vectorEffect="non-scaling-stroke"
              className="pointer-events-auto"
              style={{
                cursor:
                  kind === 'rotate'
                    ? 'grab'
                    : anchor
                      ? 'move'
                      : typeof kind === 'object' && (kind.resize === 1 || kind.resize === 3)
                        ? 'nesw-resize'
                        : 'nwse-resize',
              }}
              onPointerDown={(event) => begin(event, instance, document, kind)}
              onKeyDown={(event) => keyboard(event, instance, document, kind, display)}
            >
              <title>{name}</title>
            </Tag>
          );
        };
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
              className="pointer-events-auto cursor-move"
              onPointerDown={(event) => begin(event, instance, document, 'move')}
              onKeyDown={(event) => {
                const point = body.corners[0];
                if (point) keyboard(event, instance, document, 'move', point);
              }}
            />
            {selected &&
              body.corners.map((point, index) => {
                if (index === 2)
                  return handle(
                    point,
                    'resize',
                    translate('gallery.videoReview.annotationResize'),
                    'resize'
                  );
                if (index !== 0 && index !== 1 && index !== 3) return null;
                return handle(
                  point,
                  { resize: index },
                  translate('gallery.videoReview.annotationResize'),
                  `resize-${index}`
                );
              })}
            {selected && rotate && top && right ? (
              <line
                x1={(top.x + right.x) / 2}
                y1={(top.y + right.y) / 2}
                x2={rotate.x}
                y2={rotate.y}
                stroke="var(--sniptale-color-accent)"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
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
