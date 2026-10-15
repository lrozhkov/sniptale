import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ProductDropdownMenu, ProductDropdownItem } from '@sniptale/ui/product-menus/dropdown';
import { resolveThemeSafePortalTarget } from '@sniptale/ui/theme/safe-portal';
import { translate, formatNumber } from '../platform/i18n';
import {
  nearestRecordedCursorKey,
  adjacentCursorFocusKey,
  type CursorFocusTimelineKey,
} from '../features/video/project/cursor-focus-path/timeline';

interface CursorFocusTimelineProps {
  keys: readonly CursorFocusTimelineKey[];
  selectedId?: string | undefined;
  time: number;
  duration: number;
  pixelsPerSecond: number;
  disabled?: boolean;
  top?: number;
  height?: number;
  children?: ReactNode;
  toX?: ((time: number) => number | null) | undefined;
  toTime?: ((offset: number) => number) | undefined;
  playing?: boolean | undefined;
  onNavigate?(time: number, key?: CursorFocusTimelineKey): void;
  onMove?(key: CursorFocusTimelineKey, time: number): void;
  onSelect(key: CursorFocusTimelineKey): void;
  onAdd(time: number): void;
}
type CursorKeyContext = { x: number; y: number; time: number };

/** Editable focus keys share the same row as observed cursor coverage. */
export function CursorFocusTimelineKeys(props: CursorFocusTimelineProps) {
  const host = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<CursorKeyContext | null>(null);
  const closeContext = useCallback((restoreFocus = false) => {
    setContext(null);
    if (restoreFocus) host.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  const [inspection, setInspection] = useState<number | null>(null);
  useEffect(() => {
    if (props.playing) setInspection(null);
    else setInspection((current) => (current === null ? null : props.time));
  }, [props.time, props.playing]);
  const interaction = useCursorRowInteraction(props, host, setContext, setInspection);
  const drag = useCursorKeyDrag(props, host);
  const visible = useMemo(() => {
    const recorded =
      !props.playing && inspection !== null
        ? nearestRecordedCursorKey(props.keys, inspection, props.pixelsPerSecond, props.toX)
        : undefined;
    return props.keys.filter((key) => key.anchor === 'manual' || key.authored || key === recorded);
  }, [props.keys, props.playing, props.pixelsPerSecond, props.toX, inspection]);
  return (
    <div
      ref={host}
      className="pointer-events-none absolute inset-x-0 z-20 h-6"
      style={{ top: props.top ?? 0, height: props.height ?? 24 }}
      data-ui="cursorFocusPath.timelineKeys"
      onDoubleClick={interaction.onDoubleClick}
      onKeyDown={interaction.onKeyDown}
    >
      {props.children}
      <button
        type="button"
        aria-label={translate('videoEditor.sidebar.cursorFocusPathTitle')}
        title={translate('videoEditor.sidebar.cursorFocusRowHint')}
        disabled={props.disabled}
        className="pointer-events-auto absolute inset-0 w-full bg-transparent"
        onPointerDown={(event) => event.stopPropagation()}
        {...interaction}
      />
      {visible.map((key) => {
        const time = drag.preview?.key.timelineId === key.timelineId ? drag.preview.time : key.time;
        const left = props.toX ? props.toX(time) : time * props.pixelsPerSecond;
        if (left === null) return null;
        const authored =
          key.anchor === 'manual' ||
          key.authored ||
          drag.preview?.key.timelineId === key.timelineId;
        return (
          <button
            key={key.timelineId}
            type="button"
            data-cursor-focus-key={key.id}
            data-authored={authored ? 'true' : 'false'}
            aria-label={cursorKeyLabel(key)}
            aria-pressed={key.id === props.selectedId}
            disabled={props.disabled || props.playing}
            className="pointer-events-auto absolute z-30 flex w-3 items-center justify-center touch-none"
            style={{ left: left - 6, height: props.height ?? 24 }}
            onPointerDown={(event) => drag.start(event, key)}
            onDoubleClick={(event) => {
              if (key.anchor !== 'manual' && !key.authored) interaction.onDoubleClick(event);
              else event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (!drag.consumeClick()) props.onSelect(key);
            }}
          >
            <span
              className={[
                authored ? 'h-2 w-2 rotate-45' : 'h-1.5 w-1.5 rounded-full',
                'border border-[var(--sniptale-color-text-secondary)]',
                authored
                  ? 'bg-[var(--sniptale-color-text-secondary)]'
                  : 'bg-[var(--sniptale-color-surface-panel)]',
                key.id === props.selectedId ? '!border-[var(--sniptale-color-accent)]' : '',
              ].join(' ')}
            />
          </button>
        );
      })}
      {context && host.current && (
        <CursorKeyContextMenu
          props={props}
          context={context}
          host={host.current}
          onClose={closeContext}
        />
      )}
    </div>
  );
}

function useCursorRowInteraction(
  props: CursorFocusTimelineProps,
  host: React.RefObject<HTMLDivElement | null>,
  onContext: (context: CursorKeyContext) => void,
  inspect: (time: number) => void
) {
  const timeAt = (event: MouseEvent) => {
    const offset = event.clientX - host.current!.getBoundingClientRect().left;
    const time = props.toTime ? props.toTime(offset) : offset / props.pixelsPerSecond;
    return Math.max(0, Math.min(props.duration, time));
  };
  return {
    onClick: (event: MouseEvent) => {
      event.stopPropagation();
      if (event.detail > 1) return;
      const time = timeAt(event);
      if (props.disabled) return;
      inspect(time);
      const nearest = nearestRecordedCursorKey(props.keys, time, props.pixelsPerSecond, props.toX);
      props.onNavigate?.(time, nearest);
    },
    onDoubleClick: (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!props.disabled) props.onAdd(timeAt(event));
    },
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onContext({ x: event.clientX, y: event.clientY, time: timeAt(event) });
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      const next = adjacentCursorFocusKey(
        props.keys.filter((key) => key.anchor === 'manual' || key.authored),
        props.selectedId,
        props.time,
        event.key === 'ArrowLeft' ? -1 : 1
      );
      if (next) props.onSelect(next);
    },
  };
}

function cursorKeyLabel(key: CursorFocusTimelineKey): string {
  const kind = translate(
    key.anchor === 'manual' || key.authored
      ? 'videoEditor.sidebar.cursorFocusManualKey'
      : 'videoEditor.sidebar.cursorFocusRecordedKey'
  );
  return `${kind} · ${formatNumber(key.time, { maximumFractionDigits: 3 })}`;
}

/** Pointer preview is disposable; only a completed drag calls the existing authoring owner. */
function useCursorKeyDrag(
  props: CursorFocusTimelineProps,
  host: React.RefObject<HTMLDivElement | null>
) {
  const [preview, setPreview] = useState<{ key: CursorFocusTimelineKey; time: number } | null>(
    null
  );
  const cleanup = useRef(() => {});
  const suppress = useRef(false);
  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    if (props.disabled || props.playing) {
      cleanup.current();
      setPreview(null);
    }
  }, [props.disabled, props.playing]);
  return {
    preview,
    consumeClick: () => {
      const value = suppress.current;
      suppress.current = false;
      return value;
    },
    start: (event: ReactPointerEvent<HTMLButtonElement>, key: CursorFocusTimelineKey) => {
      event.stopPropagation();
      if (event.button !== 0 || props.disabled || props.playing || !props.onMove) return;
      cleanup.current();
      const node = event.currentTarget;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const origin = host.current!.getBoundingClientRect().left;
      const at = (x: number) =>
        props.toTime ? props.toTime(x - origin) : (x - origin) / props.pixelsPerSecond;
      const startTime = at(startX);
      let time = key.time;
      let moved = false;
      const move = (next: globalThis.PointerEvent) => {
        if (next.pointerId !== pointerId) return;
        if (Math.abs(next.clientX - startX) >= 3) moved = true;
        if (!moved) return;
        time = Math.max(0, Math.min(props.duration, key.time + at(next.clientX) - startTime));
        setPreview({ key, time });
      };
      const stop = (commit: boolean) => {
        cleanup.current();
        setPreview(null);
        suppress.current = moved;
        if (commit && moved && time !== key.time) props.onMove?.(key, time);
      };
      const up = (next: globalThis.PointerEvent) => {
        if (next.pointerId === pointerId) {
          move(next);
          stop(true);
        }
      };
      const cancel = () => stop(false);
      const escape = (next: globalThis.KeyboardEvent) => {
        if (next.key === 'Escape') {
          next.preventDefault();
          next.stopPropagation();
          cancel();
        }
      };
      cleanup.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', escape, true);
        if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
        cleanup.current = () => {};
      };
      node.setPointerCapture?.(pointerId);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', escape, true);
    },
  };
}

function CursorKeyContextMenu({
  props,
  context,
  host,
  onClose,
}: {
  props: CursorFocusTimelineProps;
  context: CursorKeyContext;
  host: HTMLDivElement;
  onClose(restoreFocus?: boolean): void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node && menu.current?.contains(event.target))) onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose(true);
      }
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [host, onClose]);
  return createPortal(
    <div
      ref={menu}
      role="menu"
      className="fixed z-[100]"
      style={{
        left: Math.min(context.x, window.innerWidth - 220),
        top: Math.min(context.y, window.innerHeight - 48),
      }}
    >
      <ProductDropdownMenu>
        <ProductDropdownItem
          disabled={props.disabled ?? false}
          onClick={() => {
            try {
              props.onAdd(context.time);
            } finally {
              onClose(true);
            }
          }}
        >
          {translate('videoEditor.sidebar.cursorFocusAdd')}
        </ProductDropdownItem>
      </ProductDropdownMenu>
    </div>,
    resolveThemeSafePortalTarget(host) ?? document.body
  );
}
