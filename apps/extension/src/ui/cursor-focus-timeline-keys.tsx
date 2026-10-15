import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductDropdownMenu, ProductDropdownItem } from '@sniptale/ui/product-menus/dropdown';
import { resolveThemeSafePortalTarget } from '@sniptale/ui/theme/safe-portal';
import { translate, formatNumber } from '../platform/i18n';
import {
  layoutCursorFocusKeyGroups,
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
  const interaction = useCursorRowInteraction(props, host, setContext);
  const [settled, setSettled] = useState(props.pixelsPerSecond);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(props.pixelsPerSecond), 250);
    return () => clearTimeout(timer);
  }, [props.pixelsPerSecond]);
  const groups = useMemo(
    () => layoutCursorFocusKeyGroups(props.keys, settled),
    [props.keys, settled]
  );
  return (
    <div
      ref={host}
      className="pointer-events-none absolute inset-x-0 h-6"
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
      {groups.map((group) => (
        <CursorKeyGroup
          key={group.members[0]!.timelineId}
          group={group}
          props={props}
          settled={settled}
        />
      ))}
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
  onContext: (context: CursorKeyContext) => void
) {
  const click = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (click.current) clearTimeout(click.current);
    },
    []
  );
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
      if (click.current) clearTimeout(click.current);
      click.current = setTimeout(() => {
        const nearest = props.keys.toSorted(
          (a, b) => Math.abs(a.time - time) - Math.abs(b.time - time)
        )[0];
        if (nearest) props.onSelect(nearest);
      }, 220);
    },
    onDoubleClick: (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (click.current) clearTimeout(click.current);
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
        props.keys,
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
    key.anchor === 'manual'
      ? 'videoEditor.sidebar.cursorFocusManualKey'
      : 'videoEditor.sidebar.cursorFocusRecordedKey'
  );
  return `${kind} · ${formatNumber(key.time, { maximumFractionDigits: 3 })}`;
}

function CursorKeyGroup({
  group,
  props,
  settled,
}: {
  group: ReturnType<typeof layoutCursorFocusKeyGroups>[number];
  props: CursorFocusTimelineProps;
  settled: number;
}) {
  const label = cursorKeyLabel;
  const selected = group.members.some((key) => key.id === props.selectedId);
  const authored = group.members.some((key) => key.anchor === 'manual' || key.authored);
  const time = group.left / settled;
  const projected = props.toX ? props.toX(time) : time * props.pixelsPerSecond;
  if (projected === null) return null;
  const left = projected - 4;
  return group.members.length === 1 ? (
    <button
      key={group.members[0]!.timelineId}
      type="button"
      data-cursor-focus-key={group.members[0]!.id}
      data-authored={authored ? 'true' : 'false'}
      aria-label={label(group.members[0]!)}
      aria-pressed={selected}
      disabled={props.disabled}
      className="pointer-events-auto absolute z-20 flex w-2 items-center justify-center"
      style={{ left, height: props.height ?? 24 }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(group.members[0]!);
      }}
    >
      <span
        className={[
          authored ? 'h-2 w-2 rotate-45' : 'h-1.5 w-1.5 rounded-full',
          'border',
          selected
            ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent)]'
            : 'border-[var(--sniptale-color-text-secondary)] bg-[var(--sniptale-color-surface-panel)]',
        ].join(' ')}
      />
    </button>
  ) : (
    <div
      key={group.members[0]!.timelineId}
      className="pointer-events-auto absolute z-20"
      style={{ left: left - 6, width: 20 }}
      data-cursor-focus-group="true"
      data-authored={authored ? 'true' : 'false'}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ProductSelect
        value=""
        placeholder=""
        aria-label={`${translate('videoEditor.sidebar.cursorFocusKey')} · ${group.members.length}`}
        aria-pressed={selected}
        controlSize="sm"
        menuWidth={320}
        style={{
          height: props.height ?? 24,
          minHeight: props.height ?? 24,
          width: 20,
          minWidth: 20,
          background: 'transparent',
          borderColor: 'transparent',
          boxShadow: 'none',
        }}
        className="!px-1 !text-[10px] [&_.sniptale-select-chevron]:!hidden"
        options={group.members.map((key) => ({ value: key.timelineId, label: label(key) }))}
        onChange={(id) => {
          const key = group.members.find((item) => item.timelineId === id);
          if (key) props.onSelect(key);
        }}
      />
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 border',
          authored ? 'rotate-45' : 'rounded-full',
          selected
            ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent)]'
            : 'border-[var(--sniptale-color-text-secondary)] bg-[var(--sniptale-color-surface-panel)]',
          'shadow-[2px_2px_0_var(--sniptale-color-border-soft)]',
        ].join(' ')}
      />
    </div>
  );
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
