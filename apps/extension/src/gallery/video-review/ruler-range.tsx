import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import { translate } from '../../platform/i18n';
import { formatPreciseTime } from '../../composition/library-preview/time-format';
import { createReviewPlaybackRange, type ReviewPlaybackRange } from './playback-range';
import type { ReviewBeforeAction } from './note-transitions';

type RulerOptions = {
  duration: number;
  time: number;
  busy?: boolean | undefined;
  range: ReviewPlaybackRange | null;
  navigation: { start: number; end: number };
  beforeAction?: ReviewBeforeAction | undefined;
  onPause?: (() => void) | undefined;
  onHoverIntent?: ((starting: boolean) => void) | undefined;
  onSeek(time: number, snap?: boolean): void;
  onChange(range: ReviewPlaybackRange | null): void;
};
type Draft = {
  anchor: number;
  target: number;
  pointer?: {
    id: number;
    x: number;
    node: HTMLDivElement;
    left: number;
    width: number;
    at?: number;
  };
  edge?: 'start' | 'end';
  moved: boolean;
};

/** One lifetime for pointer/keyboard drafting and deferred note admission. */
class RulerGestureSession {
  private draft: Draft | null = null;
  private pending: object | null = null;
  constructor(
    private read: () => RulerOptions,
    private publish: (range: ReviewPlaybackRange | null) => void
  ) {}
  get active() {
    return !!(this.draft || this.pending);
  }
  get resizing() {
    return this.draft?.edge;
  }
  cancel(publish = true) {
    this.pending = null;
    const pointer = this.draft?.pointer;
    const resizing = !!this.draft?.edge;
    this.draft = null;
    if (publish) this.publish(null);
    if (pointer?.node.hasPointerCapture(pointer.id)) pointer.node.releasePointerCapture(pointer.id);
    if (resizing) {
      if (pointer?.node === document.activeElement) pointer.node.blur();
      this.read().onHoverIntent?.(false);
    }
  }
  private admit(action: () => void) {
    const identity = {};
    this.pending = identity;
    (this.read().beforeAction ?? ((next) => next()))(() => {
      if (this.pending !== identity) return;
      this.pending = null;
      action();
    });
  }
  clear() {
    if (this.read().busy) return;
    this.cancel();
    this.admit(() => this.read().onChange(null));
  }
  private finish() {
    const value = this.draft;
    this.cancel();
    if (!value) return;
    const range = createReviewPlaybackRange(value.anchor, value.target, this.read().duration);
    if (value.moved && range) this.admit(() => this.read().onChange(range));
    else if (value.pointer && !value.edge)
      this.admit(() => this.read().onSeek(value.anchor, false));
  }
  private point(rect: { left: number; width: number }, x: number) {
    return Math.max(
      0,
      Math.min(
        this.read().duration,
        ((x - rect.left) / Math.max(1, rect.width)) * this.read().duration
      )
    );
  }
  beginPointer(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.button !== 0 || this.read().busy) return;
    event.preventDefault();
    this.cancel();
    event.currentTarget.focus({ preventScroll: true });
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = this.point(rect, event.clientX);
    this.draft = {
      anchor,
      target: anchor,
      moved: false,
      pointer: {
        id: event.pointerId,
        x: event.clientX,
        node: event.currentTarget,
        left: rect.left,
        width: rect.width,
      },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  beginEdge(
    event: PointerEvent<HTMLDivElement>,
    edge: 'start' | 'end',
    rect: { left: number; width: number }
  ) {
    event.stopPropagation();
    const options = this.read();
    if (event.button !== 0 || options.busy || !options.range) {
      options.onHoverIntent?.(false);
      return;
    }
    event.preventDefault();
    this.cancel();
    options.onPause?.();
    event.currentTarget.focus({ preventScroll: true });
    this.draft = {
      anchor: options.range[edge === 'start' ? 'end' : 'start'],
      target: options.range[edge],
      edge,
      moved: false,
      pointer: {
        id: event.pointerId,
        x: event.clientX,
        node: event.currentTarget,
        at: options.range[edge],
        ...rect,
      },
    };
    this.publish({ ...options.range });
    options.onHoverIntent?.(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  movePointer(event: PointerEvent<HTMLDivElement>) {
    const value = this.draft;
    if (!value?.pointer || value.pointer.id !== event.pointerId) return;
    value.moved ||= Math.abs(event.clientX - value.pointer.x) >= (value.edge ? 1 : 4);
    value.target =
      value.pointer.at === undefined
        ? this.point(event.currentTarget.getBoundingClientRect(), event.clientX)
        : Math.max(
            0,
            Math.min(
              this.read().duration,
              value.pointer.at +
                ((event.clientX - value.pointer.x) / Math.max(1, value.pointer.width)) *
                  this.read().duration
            )
          );
    if (value.edge === 'start') value.target = Math.min(value.target, value.anchor - 0.05);
    if (value.edge === 'end') value.target = Math.max(value.target, value.anchor + 0.05);
    if (value.moved)
      this.publish(createReviewPlaybackRange(value.anchor, value.target, this.read().duration));
  }
  endPointer(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (this.draft?.pointer?.id === event.pointerId) this.finish();
  }
  lostPointer() {
    if (this.draft?.pointer) this.cancel();
  }
  resizeKeyboard(event: KeyboardEvent<HTMLDivElement>, edge: 'start' | 'end') {
    const options = this.read();
    if (options.busy || !options.range || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
    options.onPause?.();
    const range = options.range;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.duration
          : range[edge] + (event.key === 'ArrowLeft' ? -0.1 : 0.1);
    const target =
      edge === 'start'
        ? Math.max(0, Math.min(range.end - 0.05, next))
        : Math.min(options.duration, Math.max(range.start + 0.05, next));
    const updated = { ...range, [edge]: target };
    this.admit(() => this.read().onChange(updated));
  }
  finishKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!this.draft || this.draft.pointer) return;
    event.preventDefault();
    event.stopPropagation();
    this.finish();
  }
  private extendKeyboard(direction: number) {
    const options = this.read();
    this.pending = null;
    const value = this.draft ?? { anchor: options.time, target: options.time, moved: true };
    if (value.pointer) return;
    value.target = Math.max(0, Math.min(options.duration, value.target + direction * 0.1));
    this.draft = value;
    this.publish(createReviewPlaybackRange(value.anchor, value.target, options.duration));
  }
  keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = this.read();
    if (options.busy || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      this.finishKeyboard(event);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    if (event.shiftKey && event.key.startsWith('Arrow')) {
      this.extendKeyboard(direction);
      return;
    }
    this.cancel();
    const time =
      event.key === 'Home'
        ? options.navigation.start
        : event.key === 'End'
          ? options.navigation.end
          : options.time + direction * 0.1;
    this.admit(() => this.read().onSeek(Math.max(0, Math.min(this.read().duration, time)), false));
  }
}

/** React publishes the session's draft while transport retains the committed range. */
export function useReviewRulerRange(options: RulerOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [draft, setDraft] = useState<ReviewPlaybackRange | null>(null);
  const session = useRef<RulerGestureSession | null>(null);
  session.current ??= new RulerGestureSession(() => latest.current, setDraft);
  const owner = session.current;
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !owner.active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      owner.cancel();
    };
    window.addEventListener('keydown', escape, true);
    const blur = () => owner.cancel();
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
      owner.cancel(false);
    };
  }, [owner]);
  const interaction: HTMLAttributes<HTMLDivElement> = {
    role: 'slider',
    tabIndex: 0,
    'aria-label': translate('gallery.videoReview.playbackRange'),
    'aria-valuemin': 0,
    'aria-valuemax': options.duration,
    'aria-valuenow': options.time,
    'aria-valuetext': formatPreciseTime(options.time),
    'aria-disabled': !!options.busy,
    onPointerDown: (event) => owner.beginPointer(event),
    onPointerMove: (event) => owner.movePointer(event),
    onPointerUp: (event) => owner.endPointer(event),
    onPointerCancel: () => owner.cancel(),
    onLostPointerCapture: () => owner.lostPointer(),
    onBlur: () => owner.cancel(),
    onKeyDown: (event) => owner.keyDown(event),
    onKeyUp: (event) => {
      if (event.key === 'Shift') owner.finishKeyboard(event);
    },
  };
  const edgeInteraction = (edge: 'start' | 'end') => ({
    'data-resizing': owner.resizing === edge ? 'true' : undefined,
    role: 'slider',
    tabIndex: options.busy ? -1 : 0,
    'aria-label': translate(
      edge === 'start' ? 'gallery.videoReview.rangeStart' : 'gallery.videoReview.rangeEnd'
    ),
    'aria-valuemin': 0,
    'aria-valuemax': options.duration,
    'aria-valuenow': (draft ?? options.range)?.[edge] ?? 0,
    'aria-disabled': !!options.busy,
    onPointerDown: (event: PointerEvent<HTMLDivElement>, rect: { left: number; width: number }) =>
      owner.beginEdge(event, edge, rect),
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      owner.movePointer(event);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => owner.endPointer(event),
    onPointerCancel: () => owner.cancel(),
    onLostPointerCapture: () => owner.lostPointer(),
    onBlur: () => owner.cancel(),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => owner.resizeKeyboard(event, edge),
  });
  return {
    interaction,
    edgeInteraction,
    range: draft ?? options.range,
    clear: () => owner.clear(),
  };
}

/** The fill passes pointer input through; only accepted interval edges can capture a resize. */
export function ReviewPlaybackRangeOverlay(props: {
  range: ReviewPlaybackRange | null;
  duration: number;
  gutter: number;
  width: number;
  edgeInteraction?: ReturnType<typeof useReviewRulerRange>['edgeInteraction'] | undefined;
}) {
  const range = props.range;
  if (!range) return null;
  const left = props.gutter + (range.start / props.duration) * props.width;
  const width = ((range.end - range.start) / props.duration) * props.width;
  return (
    <div
      data-ui="gallery.videoReview.playbackRangeOverlay"
      aria-hidden={props.edgeInteraction ? undefined : true}
      className="pointer-events-none absolute top-0 bottom-2 z-[18] border-x
        border-[var(--sniptale-color-accent-emphasis)] bg-[var(--sniptale-color-accent)]/5"
      style={{ left, width }}
    >
      {(['start', 'end'] as const).map((edge) => (
        <span
          key={edge}
          data-range-edge={edge}
          className={`absolute top-0 rounded bg-[var(--sniptale-color-surface-panel)] px-1
            text-[9px] leading-3 tabular-nums text-[var(--sniptale-color-accent-emphasis)]
            ${edge === 'start' ? 'left-1' : 'right-1'}`}
          style={{ visibility: width < (edge === 'start' ? 65 : 135) ? 'hidden' : 'visible' }}
        >
          {formatPreciseTime(range[edge])}
        </span>
      ))}
      {props.edgeInteraction &&
        (['start', 'end'] as const).map((edge) => {
          const { onPointerDown, ...interaction } = props.edgeInteraction!(edge);
          return (
            <div
              key={edge}
              {...interaction}
              data-playback-range-edge={edge}
              className={`pointer-events-auto absolute inset-y-0 w-3 cursor-ew-resize touch-none outline-none
                focus-visible:outline focus-visible:outline-1
                focus-visible:outline-[var(--sniptale-color-text-secondary)]
                after:pointer-events-none after:absolute after:inset-y-0 after:left-1/2 after:w-px
                after:-translate-x-1/2 data-[resizing=true]:after:bg-[var(--sniptale-color-text-primary)]`}
              style={edge === 'start' ? { left: -6 } : { right: -6 }}
              onPointerDown={(event) => {
                const plane =
                  event.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
                onPointerDown(event, {
                  left: plane.left + props.gutter,
                  width: Math.max(1, plane.width - props.gutter),
                });
              }}
            />
          );
        })}
    </div>
  );
}
