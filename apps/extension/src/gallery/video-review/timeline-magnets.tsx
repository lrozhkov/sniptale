import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type PointerEvent,
} from 'react';
import { snapTimelineTime } from '../../features/video/review/snap';

export type ReviewTimelineSnap = (
  time: number,
  candidates: readonly number[],
  threshold: number,
  bounds?: { start: number; end: number }
) => { time: number; candidate: number | null };
type ReviewMagnetTarget = {
  time: number;
  displayTime?: number;
  y: number;
  priority?: number;
  element?: HTMLElement;
  edge?: 'start' | 'end' | 'point';
};
type Snapshot = {
  targets: readonly ReviewMagnetTarget[];
  y: number;
  pointerId: number;
  highlighted?: HTMLElement | undefined;
  bypass: boolean;
  distance?: number | undefined;
};
type Clock = { output(time: number): number; fromDisplay?(time: number): number };
const Context = createContext<{ current: Snapshot | null } | null>(null);

/** Within one pixel of the closest endpoint, prefer the nearest row, then the upper row. */
function pickReviewMagnet(
  time: number,
  targets: readonly ReviewMagnetTarget[],
  threshold: number,
  y: number
) {
  if (threshold <= 0) return null;
  const eligible = targets.filter((target) => Math.abs(target.time - time) <= threshold + 1e-9);
  if (!eligible.length) return null;
  const priority = Math.min(...eligible.map((target) => target.priority ?? 0));
  const preferred = eligible.filter((target) => (target.priority ?? 0) === priority);
  const nearest = Math.min(...preferred.map((target) => Math.abs(target.time - time)));
  const close = preferred.filter(
    (target) => Math.abs(target.time - time) <= nearest + threshold / 8 + 1e-9
  );
  close.sort((a, b) => {
    const dy = Math.abs(a.y - y) - Math.abs(b.y - y);
    if (Number.isFinite(dy) && Math.abs(dy) > 0.5) return dy;
    if (Number.isFinite(a.y) !== Number.isFinite(b.y)) return Number.isFinite(a.y) ? -1 : 1;
    return a.y - b.y || Math.abs(a.time - time) - Math.abs(b.time - time);
  });
  return close[0]!;
}

export function snapReviewMagnet(
  time: number,
  targets: readonly ReviewMagnetTarget[],
  threshold: number,
  y: number
) {
  const target = pickReviewMagnet(time, targets, threshold, y);
  return target ? { time: target.time, candidate: target.time } : { time, candidate: null };
}

const NON_MAGNET_TARGET_SELECTOR = [
  '[data-review-snap-priority="none"]',
  '[data-review-snap-priority="history"]',
  '[data-ui="cursorFocusPath.timelineKeys"]',
  '[data-ui="gallery.videoReview.historyStrip"]',
  '[data-history-family]',
].join(',');

/** Recorded interactions and cursor geometry do not provide timeline magnet targets. */
export function reviewTimelineMagnetPriority(node: HTMLElement): number | null {
  return node.closest(NON_MAGNET_TARGET_SELECTOR) ? null : 0;
}

function showTarget(snapshot: Snapshot, target?: ReviewMagnetTarget | null) {
  if (snapshot.highlighted && snapshot.highlighted !== target?.element)
    delete snapshot.highlighted.dataset['reviewMagnetEdge'];
  snapshot.highlighted = target?.element;
  if (target?.element && target.edge) target.element.dataset['reviewMagnetEdge'] = target.edge;
}

/** Snapshot authored endpoint attributes once per gesture; drag updates do not traverse the scene. */
export function ReviewTimelineMagnets({
  children,
  sourceTime,
}: {
  children: ReactNode;
  sourceTime?: ((display: number) => number) | undefined;
}) {
  const current = useRef<Snapshot | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const snapshot = current.current;
      if (event.key !== 'Alt' || !snapshot) return;
      snapshot.bypass = event.type === 'keydown';
      if (snapshot.bypass) showTarget(snapshot, null);
    };
    const cancel = () => {
      if (current.current) showTarget(current.current, null);
      current.current = null;
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
      window.removeEventListener('blur', cancel);
      cancel();
    };
  }, []);
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (current.current) showTarget(current.current, null);
    current.current = null;
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const plane = event.target.closest('[data-ui="gallery.videoReview.timePlane"]');
    if (!plane) return;
    const own = event.target.closest(
      '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
    );
    const targets: ReviewMagnetTarget[] = [];
    for (const node of plane.querySelectorAll<HTMLElement>('[data-review-snap-start]')) {
      if (own && (node === own || own.contains(node))) continue;
      const priority = reviewTimelineMagnetPriority(node);
      if (priority === null) continue;
      if (!node.getClientRects().length) continue;
      const rect = node.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      for (const [index, value] of [
        node.dataset['reviewSnapStart'],
        node.dataset['reviewSnapEnd'],
      ].entries()) {
        if (value === undefined || !value.trim()) continue;
        const valueTime = Number(value);
        const time =
          sourceTime && node.closest('[data-review-snap-domain="display"]')
            ? sourceTime(valueTime)
            : valueTime;
        if (Number.isFinite(time) && time >= 0)
          targets.push({
            time,
            ...(node.closest('[data-review-snap-domain="display"]')
              ? { displayTime: valueTime }
              : {}),
            y,
            priority,
            element: node,
            edge:
              node.dataset['reviewSnapStart'] === node.dataset['reviewSnapEnd']
                ? 'point'
                : index === 0
                  ? 'start'
                  : 'end',
          });
      }
    }
    current.current = {
      targets,
      y: event.clientY,
      pointerId: event.pointerId,
      bypass: event.altKey,
    };
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const snapshot = current.current;
    if (snapshot?.pointerId !== event.pointerId) return;
    // Keep the snapshot through the complete native capture/bubble dispatch.
    setTimeout(() => {
      showTarget(snapshot, null);
      if (current.current === snapshot) current.current = null;
    }, 0);
  };
  return (
    <Context value={current}>
      <div
        className="contents"
        onPointerDownCapture={begin}
        onPointerMoveCapture={(event) => {
          if (current.current?.pointerId === event.pointerId) {
            current.current.y = event.clientY;
            current.current.bypass = event.altKey;
            current.current.distance = undefined;
            showTarget(current.current, null);
          }
        }}
        onPointerUpCapture={end}
        onPointerCancelCapture={end}
      >
        {children}
      </div>
    </Context>
  );
}

/** Each consumer keeps its own source/result clock and existing bounds/commit policy. */
export function useReviewTimelineSnap(clock?: Clock): ReviewTimelineSnap {
  const owner = useContext(Context);
  return useCallback(
    (time, candidates, threshold, bounds) => {
      const snapshot = owner?.current;
      if (!snapshot) return snapTimelineTime(time, candidates, threshold);
      const shared = snapshot.targets
        .map((target) => ({
          ...target,
          time:
            target.displayTime !== undefined && clock?.fromDisplay
              ? clock.fromDisplay(target.displayTime)
              : clock
                ? clock.output(target.time)
                : target.time,
        }))
        .filter((target) => !bounds || (target.time >= bounds.start && target.time <= bounds.end));
      const target = snapshot.bypass
        ? null
        : pickReviewMagnet(
            time,
            [...shared, ...candidates.map((time) => ({ time, y: Infinity }))],
            threshold,
            snapshot.y
          );
      const distance = target ? Math.abs(target.time - time) : Infinity;
      if (target && (snapshot.distance === undefined || distance < snapshot.distance)) {
        snapshot.distance = distance;
        showTarget(snapshot, target);
      }
      return target ? { time: target.time, candidate: target.time } : { time, candidate: null };
    },
    [owner, clock]
  );
}
