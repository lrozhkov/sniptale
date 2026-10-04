import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CloudAlert, CloudCheck, CloudOff, CloudSync, X } from 'lucide-react';
import { ContentToolbarButton } from '../content-toolbar';
import { useGlassSelectOverlay } from '../glass-select/overlay-state';
import { ContentPopoverAdapter } from '../content-popover-adapter';

type AutosaveControlProps = {
  enabled: boolean;
  state: 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
  onChange(enabled: boolean): void;
  actions?: ReactNode;
  openOnError?: boolean;
  labels: {
    title: string;
    switch: string;
    errorDescription: string;
    on: string;
    off: string;
    paused: string;
    dirty: string;
    saving: string;
    saved: string;
    error: string;
    conflict: string;
    close: string;
  };
};

function useSavingIndicator(saving: boolean) {
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    setSpinning(false);
    if (!saving) return;
    const timer = window.setTimeout(() => setSpinning(true), 350);
    return () => window.clearTimeout(timer);
  }, [saving]);
  return saving && spinning;
}

function statusPresentation(props: AutosaveControlProps, spinning: boolean) {
  if (props.state === 'error' || props.state === 'conflict') {
    return { label: props.labels[props.state], Icon: CloudAlert, tone: 'danger' as const };
  }
  if (!props.enabled) {
    return { label: props.labels.paused, Icon: CloudOff, tone: 'warning' as const };
  }
  if (props.state === 'saving') {
    return {
      label: props.labels.saving,
      Icon: CloudSync,
      tone: spinning ? ('sync' as const) : ('neutral' as const),
    };
  }
  return { label: props.labels[props.state], Icon: CloudCheck, tone: 'success' as const };
}

function AutosaveStatusIcon(props: {
  props: AutosaveControlProps;
  spinning: boolean;
  size: number;
}) {
  const { Icon, tone } = statusPresentation(props.props, props.spinning);
  return (
    <Icon
      size={props.size}
      aria-hidden="true"
      className={
        tone === 'success'
          ? '[&>path:first-child]:stroke-[var(--sniptale-color-success)]'
          : tone === 'sync'
            ? [
                '[&>path:not(:nth-child(3))]:motion-safe:animate-spin',
                '[&>path:not(:nth-child(3))]:[transform-origin:12px_16px]',
              ].join(' ')
            : tone === 'danger'
              ? 'text-[var(--sniptale-color-danger)]'
              : tone === 'warning'
                ? 'text-[var(--sniptale-color-warning)]'
                : undefined
      }
    />
  );
}

function useAutosavePopover() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const { portalStyle, menuPosition } = useGlassSelectOverlay({
    portal: true,
    isOpen: open,
    setIsOpen: (next) => {
      if (next === false) close();
      else setOpen(next);
    },
    containerRef: anchor,
    menuRef: layer,
    menuWidth: 340,
  });
  useEffect(() => {
    if (open) layer.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open]);
  return { open, setOpen, anchor, trigger, layer, id, portalStyle, menuPosition, close };
}

/** Controlled, persistence-free autosave disclosure shared by editor toolbars. */
export function AutosaveControl(props: AutosaveControlProps) {
  const popover = useAutosavePopover();
  const { open, setOpen, anchor, trigger, id } = popover;
  const spinning = useSavingIndicator(props.enabled && props.state === 'saving');
  const { label, tone } = statusPresentation(props, spinning);
  useEffect(() => {
    if (props.openOnError && (props.state === 'error' || props.state === 'conflict')) {
      setOpen(true);
    }
  }, [props.openOnError, props.state, setOpen]);
  return (
    <div ref={anchor} className="inline-flex shrink-0 items-center" data-ui="autosave-control">
      <ContentToolbarButton
        ref={trigger}
        type="button"
        title={`${props.labels.title}: ${label}`}
        aria-label={`${props.labels.title}: ${label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        className={[
          '!h-8 !w-8 !min-w-8 !px-0',
          tone === 'danger' ? '!text-[var(--sniptale-color-danger)]' : '',
          tone === 'warning' ? '!text-[var(--sniptale-color-warning)]' : '',
        ].join(' ')}
        onClick={() => setOpen(!open)}
      >
        <AutosaveStatusIcon props={props} spinning={spinning} size={17} />
      </ContentToolbarButton>
      <AutosavePopover props={props} popover={popover} spinning={spinning} />
    </div>
  );
}

function AutosavePopover({
  props,
  popover,
  spinning,
}: {
  props: AutosaveControlProps;
  popover: ReturnType<typeof useAutosavePopover>;
  spinning: boolean;
}) {
  const { open, anchor, layer, id, portalStyle, menuPosition, close } = popover;
  const { label, tone } = statusPresentation(props, spinning);
  const failed = tone === 'danger';
  const rect = anchor.current?.getBoundingClientRect();
  const arrow = Math.max(
    12,
    Math.min(320, (rect?.left ?? 0) + (rect?.width ?? 0) / 2 - Number(portalStyle.left ?? 0))
  );
  return (
    <ContentPopoverAdapter
      anchorEl={anchor.current}
      isOpen={open}
      popoverRef={layer}
      className={[
        'sniptale-content-popover--compact !w-[min(340px,calc(100vw-24px))]',
        '!bg-[var(--sniptale-color-surface-panel)] backdrop-blur-[12px]',
      ].join(' ')}
      style={portalStyle}
    >
      <span
        aria-hidden="true"
        className={[
          'absolute size-3 rotate-45 bg-[var(--sniptale-color-surface-panel)]',
          'border-[var(--sniptale-color-border-soft)]',
          menuPosition === 'top' ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-l border-t',
        ].join(' ')}
        style={{ left: arrow - 6 }}
      />
      <div
        id={id}
        role="dialog"
        aria-labelledby={id + '-title'}
        data-floating-ui-root="true"
        className="relative space-y-3 overflow-y-auto p-2"
        style={{ maxHeight: 'calc(100vh - 32px)' }}
        onKeyDown={(event) => handlePopoverKeyDown(event, close)}
      >
        <div className="flex items-start gap-2">
          <AutosaveStatusIcon props={props} spinning={spinning} size={16} />
          <h3
            id={id + '-title'}
            className="min-w-0 flex-1 text-sm font-medium text-[var(--sniptale-color-text-primary)]"
          >
            {failed ? props.labels.error : label}
          </h3>
          <ContentToolbarButton
            tone="close"
            title={props.labels.close}
            onClick={close}
            className="!h-6 !w-6 !min-w-6 !px-0"
          >
            <X size={14} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
        <p className="text-xs leading-relaxed text-[var(--sniptale-color-text-secondary)]">
          {props.enabled ? props.labels.on : props.labels.off}
        </p>
        <AutosaveSwitch props={props} />
        {failed && (
          <div role="alert" className="text-xs leading-relaxed text-[var(--sniptale-color-danger)]">
            {props.state === 'conflict' ? props.labels.conflict : props.labels.errorDescription}
          </div>
        )}
        {failed && props.actions ? (
          <div className="flex flex-wrap gap-2">{props.actions}</div>
        ) : null}
      </div>
    </ContentPopoverAdapter>
  );
}

function AutosaveSwitch({ props }: { props: AutosaveControlProps }) {
  return (
    <label
      className={[
        'flex cursor-pointer items-center justify-between gap-3 rounded px-1 py-1',
        'text-xs text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      {props.labels.switch}
      <input
        type="checkbox"
        role="switch"
        checked={props.enabled}
        aria-checked={props.enabled}
        className="peer sr-only"
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span
        aria-hidden="true"
        className={[
          'relative h-5 w-9 shrink-0 rounded-full border border-[var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-hover)] transition-colors',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
          'peer-checked:bg-[var(--sniptale-color-text-secondary)]',
          'before:absolute before:left-0.5 before:top-0.5 before:size-3.5 before:rounded-full',
          'before:bg-[var(--sniptale-color-surface-panel)] before:shadow-sm',
          'before:transition-transform peer-checked:before:translate-x-4',
        ].join(' ')}
      />
    </label>
  );
}

function handlePopoverKeyDown(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = event.currentTarget.querySelectorAll<HTMLElement>('button, input');
  const first = controls[0];
  const last = controls[controls.length - 1];
  const target = event.target;
  if ((event.shiftKey && target === first) || (!event.shiftKey && target === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
