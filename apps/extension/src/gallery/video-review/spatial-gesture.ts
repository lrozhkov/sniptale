import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type RefObject,
} from 'react';
import type {
  QuickEditDepthOfField,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import {
  DEFAULT_CAMERA_DEPTH as DEFAULT_QUICK_EDIT_DEPTH,
  DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE,
} from '../../features/video/project/motion/spatial';
import {
  resolveReviewSpatialFocusGeometry,
  reviewSpatialFocusPatch,
  type ReviewSpatialControlGeometryInput,
} from './spatial-control-geometry';

export type SpatialTool = 'position' | 'tilt' | 'rotation' | 'focus';
export type SpatialAxis = 'both' | 'x' | 'y';
export type SpatialHandle = 'tilt' | 'rotation' | 'center' | 'width' | 'softness';
type Point = { x: number; y: number };
type Patch = QuickEditZoomRegionPatch;
type Props = {
  region: QuickEditZoomRegion;
  revision: string;
  tool: SpatialTool;
  axis: SpatialAxis;
  geometry: ReviewSpatialControlGeometryInput | null;
  output: { width: number; height: number };
  enabled: boolean;
  bounds: RefObject<HTMLElement | null>;
  onPreview(patch: Patch | null): void;
  onCommit(revision: string, patch: Patch): void;
  onInteract(): void;
};
type Transaction = {
  authoredPerspectiveEnabled: boolean | undefined;
  authoredDepthEnabled: boolean | undefined;
  handle: SpatialHandle;
  side: -1 | 1 | undefined;
  regionId: string;
  revision: string;
  tool: SpatialTool;
  axis: SpatialAxis;
  initial: Patch;
  patch: Patch;
  rect: { left: number; top: number; width: number; height: number };
  output: Props['output'];
  geometry: Props['geometry'];
  previous: Point;
  angle: number | null;
  focusSample: Partial<QuickEditDepthOfField> | null;
  pointer: { id: number; node: HTMLButtonElement } | null;
  dirty: boolean;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;
const directions: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function admitted(props: Props, handle: SpatialHandle) {
  if (!props.enabled) return false;
  if (handle === 'tilt' || handle === 'rotation') return props.tool === handle;
  return props.tool === 'focus' && !!props.geometry;
}

function current(props: Props, transaction: Transaction) {
  return (
    admitted(props, transaction.handle) &&
    props.region.id === transaction.regionId &&
    props.revision === transaction.revision &&
    props.tool === transaction.tool &&
    props.axis === transaction.axis &&
    props.region.perspective?.enabled === transaction.authoredPerspectiveEnabled &&
    props.region.depthOfField?.enabled === transaction.authoredDepthEnabled
  );
}

function angleAt(transaction: Transaction, point: Point) {
  const x = point.x - transaction.rect.left - transaction.rect.width / 2;
  const y = point.y - transaction.rect.top - transaction.rect.height / 2;
  return Math.hypot(x, y) < 12 ? null : (Math.atan2(y, x) * 180) / Math.PI;
}

function focusAt(transaction: Transaction, point: Point) {
  if (!transaction.geometry || transaction.handle === 'tilt' || transaction.handle === 'rotation')
    return null;
  return reviewSpatialFocusPatch(
    transaction.geometry,
    transaction.handle,
    {
      x: ((point.x - transaction.rect.left) * transaction.output.width) / transaction.rect.width,
      y: ((point.y - transaction.rect.top) * transaction.output.height) / transaction.rect.height,
    },
    transaction.side
  );
}

function updatePatch(transaction: Transaction, patch: Patch) {
  if (JSON.stringify(patch) === JSON.stringify(transaction.patch)) return;
  transaction.patch = patch;
  transaction.dirty = true;
}

function tiltBy(transaction: Transaction, degrees: Point) {
  const perspective = transaction.patch.perspective;
  if (!perspective) return;
  const rotateX = clamp(perspective.rotateX + (transaction.axis === 'y' ? 0 : degrees.x), -60, 60);
  const rotateY = clamp(perspective.rotateY + (transaction.axis === 'x' ? 0 : degrees.y), -60, 60);
  if (rotateX === perspective.rotateX && rotateY === perspective.rotateY) return;
  updatePatch(transaction, { perspective: { ...perspective, enabled: true, rotateX, rotateY } });
}

function rotateBy(transaction: Transaction, degrees: number) {
  const perspective = transaction.patch.perspective;
  if (!perspective || degrees === 0) return;
  updatePatch(transaction, {
    perspective: { ...perspective, enabled: true, rotateZ: wrap(perspective.rotateZ + degrees) },
  });
}

function focusBy(transaction: Transaction, delta: Partial<QuickEditDepthOfField>) {
  const depth = transaction.patch.depthOfField;
  if (!depth) return;
  const next = { ...depth };
  for (const key of ['x', 'y', 'width', 'softness'] as const) {
    const change = delta[key];
    if (change !== undefined)
      next[key] = clamp(next[key] + change, key === 'softness' ? 0.01 : 0, 1);
  }
  if (JSON.stringify(next) === JSON.stringify(depth)) return;
  updatePatch(transaction, { depthOfField: { ...next, enabled: true } });
}

function sampleRotation(transaction: Transaction, point: Point, scale: number) {
  const angle = angleAt(transaction, point);
  if (angle !== null && transaction.angle !== null)
    rotateBy(transaction, wrap(angle - transaction.angle) * scale);
  transaction.angle = angle;
}

function sampleFocus(transaction: Transaction, point: Point, scale: number) {
  const sample = focusAt(transaction, point);
  if (!sample) return;
  const previous = transaction.focusSample;
  transaction.focusSample = sample;
  if (!previous) return;
  const delta: Partial<QuickEditDepthOfField> = {};
  for (const key of ['x', 'y', 'width', 'softness'] as const) {
    const value = sample[key],
      prior = previous[key];
    if (value !== undefined && prior !== undefined) delta[key] = (value - prior) * scale;
  }
  focusBy(transaction, delta);
}

function pointerSample(transaction: Transaction, point: Point, fine: boolean) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const scale = fine ? 0.2 : 1;
  switch (transaction.handle) {
    case 'tilt':
      tiltBy(transaction, {
        x: ((-(point.y - transaction.previous.y) * 90) / transaction.rect.height) * scale,
        y: (((point.x - transaction.previous.x) * 90) / transaction.rect.width) * scale,
      });
      break;
    case 'rotation':
      sampleRotation(transaction, point, scale);
      break;
    default:
      sampleFocus(transaction, point, scale);
  }
  transaction.previous = point;
}

function keyboardSample(transaction: Transaction, direction: Point, fine: boolean) {
  const step = fine ? 0.2 : 1;
  switch (transaction.handle) {
    case 'tilt':
      tiltBy(transaction, { x: -direction.y * step, y: direction.x * step });
      break;
    case 'rotation':
      rotateBy(transaction, (direction.x - direction.y) * step);
      break;
    case 'center':
      focusBy(transaction, { x: (direction.x * step) / 100, y: (direction.y * step) / 100 });
      break;
    default:
      focusBy(transaction, { [transaction.handle]: ((direction.x - direction.y) * step) / 100 });
  }
}

function changedPose(transaction: Transaction) {
  if (transaction.handle === 'tilt') {
    const before = transaction.initial.perspective!;
    const after = transaction.patch.perspective!;
    return before.rotateX !== after.rotateX || before.rotateY !== after.rotateY;
  }
  if (transaction.handle !== 'rotation') {
    const before = transaction.initial.depthOfField!;
    const after = transaction.patch.depthOfField!;
    return (['x', 'y', 'width', 'softness'] as const).some((key) => before[key] !== after[key]);
  }
  const before = transaction.initial.perspective;
  const after = transaction.patch.perspective;
  if (!before || !after) return false;
  // Full turns and the two ±180 representations are the same authored pose.
  // Ignore only arithmetic roundoff; keep the untouched authored fields exact.
  return Math.abs(wrap(after.rotateZ - before.rotateZ)) > 1e-9;
}

function captureBounds(value: Props) {
  const rect = value.bounds.current?.getBoundingClientRect();
  if (!rect || ![rect.left, rect.top].every(Number.isFinite)) return null;
  const sizes = [rect.width, rect.height, value.output.width, value.output.height];
  if (!sizes.every((size) => Number.isFinite(size) && size > 0)) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function captureTransaction(
  value: Props,
  handle: SpatialHandle,
  side: -1 | 1 | undefined,
  point: Point,
  pointer: Transaction['pointer']
): Transaction | null {
  if (!admitted(value, handle)) return null;
  const rect = captureBounds(value);
  if (!rect) return null;
  const initial: Patch =
    handle === 'tilt' || handle === 'rotation'
      ? { perspective: { ...(value.region.perspective ?? DEFAULT_QUICK_EDIT_PERSPECTIVE) } }
      : { depthOfField: { ...(value.region.depthOfField ?? DEFAULT_QUICK_EDIT_DEPTH) } };
  const pending: Transaction = {
    handle,
    side,
    regionId: value.region.id,
    revision: value.revision,
    tool: value.tool,
    axis: value.axis,
    authoredPerspectiveEnabled: value.region.perspective?.enabled,
    authoredDepthEnabled: value.region.depthOfField?.enabled,
    initial,
    patch: initial,
    rect,
    output: { ...value.output },
    geometry: value.geometry
      ? {
          plane: { ...value.geometry.plane },
          projection: [...value.geometry.projection],
          rotation: [...value.geometry.rotation],
          focus: { ...(value.region.depthOfField ?? DEFAULT_QUICK_EDIT_DEPTH) },
        }
      : null,
    previous: point,
    angle: null,
    focusSample: null,
    pointer,
    dirty: false,
  };
  pending.angle = angleAt(pending, point);
  if (value.tool !== 'focus') return pending;
  const geometry = pending.geometry && resolveReviewSpatialFocusGeometry(pending.geometry);
  if (!geometry || (geometry.flat && handle !== 'center')) return null;
  pending.focusSample = focusAt(pending, point);
  return pointer && !pending.focusSample ? null : pending;
}

/** One disposable edit transaction; the zoom owner admits its captured revision at commit. */
export function useSpatialGesture(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const transaction = useRef<Transaction | null>(null);
  const frame = useRef<number | null>(null);
  const [active, setActive] = useState<SpatialHandle | null>(null);
  const finish = useCallback((commit: boolean) => {
    const pending = transaction.current;
    transaction.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!pending) return;
    const pointer = pending.pointer;
    if (pointer?.node.hasPointerCapture(pointer.id)) pointer.node.releasePointerCapture(pointer.id);
    setActive(null);
    if (commit && current(latest.current, pending) && changedPose(pending)) {
      if (pending.dirty) latest.current.onPreview(pending.patch);
      latest.current.onCommit(pending.revision, pending.patch);
    }
    latest.current.onPreview(null);
  }, []);
  const cancel = useCallback(() => finish(false), [finish]);
  useLayoutEffect(() => {
    if (transaction.current && !current(props, transaction.current)) cancel();
  });
  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('blur', cancel);
      cancel();
    };
  }, [cancel]);
  const schedule = () => {
    if (frame.current !== null || !transaction.current?.dirty) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const pending = transaction.current;
      if (!pending) return;
      if (!current(latest.current, pending)) return cancel();
      pending.dirty = false;
      latest.current.onPreview(pending.patch);
    });
  };
  const begin = (
    handle: SpatialHandle,
    side: -1 | 1 | undefined,
    point: Point,
    pointer: Transaction['pointer']
  ) => {
    if (transaction.current) return null;
    const pending = captureTransaction(latest.current, handle, side, point, pointer);
    if (!pending) return null;
    transaction.current = pending;
    setActive(handle);
    latest.current.onInteract();
    return pending;
  };
  const bind = (handle: SpatialHandle, side?: -1 | 1): ButtonHTMLAttributes<HTMLButtonElement> => ({
    disabled: !admitted(props, handle),
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      const pending = begin(
        handle,
        side,
        { x: event.clientX, y: event.clientY },
        { id: event.pointerId, node: event.currentTarget }
      );
      if (!pending) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      const pending = transaction.current;
      if (!pending?.pointer || pending.pointer.id !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      if (!current(latest.current, pending)) return cancel();
      pointerSample(pending, { x: event.clientX, y: event.clientY }, event.shiftKey);
      schedule();
    },
    onPointerUp: (event) => {
      const pending = transaction.current;
      if (!pending?.pointer || pending.pointer.id !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      if (current(latest.current, pending))
        pointerSample(pending, { x: event.clientX, y: event.clientY }, event.shiftKey);
      finish(true);
    },
    onPointerCancel: (event) => {
      if (transaction.current?.pointer?.id === event.pointerId) cancel();
    },
    onLostPointerCapture: (event) => {
      if (transaction.current?.pointer?.id === event.pointerId) cancel();
    },
    onBlur: () => {
      if (transaction.current && !transaction.current.pointer) finish(true);
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
      const pending = transaction.current;
      if (event.key === 'Escape' && pending) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key === 'Enter' && pending && !pending.pointer) {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
        return;
      }
      const direction = directions[event.key];
      if (!direction || pending?.pointer || (pending && pending.handle !== handle)) return;
      const edit = pending ?? begin(handle, side, { x: 0, y: 0 }, null);
      if (!edit) return;
      event.preventDefault();
      event.stopPropagation();
      if (!current(latest.current, edit)) return cancel();
      keyboardSample(edit, direction, event.shiftKey);
      schedule();
    },
  });
  return { active, bind, cancel };
}
