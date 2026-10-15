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
  onSeek(time: number, snap?: boolean): void;
  onChange(range: ReviewPlaybackRange | null): void;
};
type Draft = {
  anchor: number;
  target: number;
  pointer?: { id: number; x: number; node: HTMLDivElement };
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
  cancel(publish = true) {
    this.pending = null;
    const pointer = this.draft?.pointer;
    this.draft = null;
    if (publish) this.publish(null);
    if (pointer?.node.hasPointerCapture(pointer.id)) pointer.node.releasePointerCapture(pointer.id);
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
    else if (value.pointer) this.admit(() => this.read().onSeek(value.anchor, false));
  }
  private point(node: HTMLDivElement, x: number) {
    const rect = node.getBoundingClientRect();
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
    const anchor = this.point(event.currentTarget, event.clientX);
    this.draft = {
      anchor,
      target: anchor,
      moved: false,
      pointer: { id: event.pointerId, x: event.clientX, node: event.currentTarget },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  movePointer(event: PointerEvent<HTMLDivElement>) {
    const value = this.draft;
    if (!value?.pointer || value.pointer.id !== event.pointerId) return;
    value.moved ||= Math.abs(event.clientX - value.pointer.x) >= 4;
    value.target = this.point(event.currentTarget, event.clientX);
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
    return () => {
      window.removeEventListener('keydown', escape, true);
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
  return { interaction, range: draft ?? options.range, clear: () => owner.clear() };
}

/** Both interval boundaries and the quiet fill span all lanes without taking pointer input. */
export function ReviewPlaybackRangeOverlay(props: {
  range: ReviewPlaybackRange | null;
  duration: number;
  gutter: number;
  width: number;
}) {
  const range = props.range;
  if (!range) return null;
  const left = props.gutter + (range.start / props.duration) * props.width;
  const width = ((range.end - range.start) / props.duration) * props.width;
  return (
    <div
      data-ui="gallery.videoReview.playbackRangeOverlay"
      aria-hidden="true"
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
    </div>
  );
}
