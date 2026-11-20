import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from './shared';

const InspectorLayoutContext = React.createContext(false);
type RowMeasurement = () => (() => void) | null;

/** Use the same option minimum before stacking and before replacing segments with a menu. */
export function measureSegmentWidth(context: CanvasRenderingContext2D, labels: readonly string[]) {
  return (
    labels.reduce(
      (width, label) => width + Math.max(32, context.measureText(label).width + 12),
      0
    ) +
    2 * (labels.length - 1)
  );
}

/** One mounted inspector batches connected layout reads before row writes. */
function createInspectorRowFitting(invalidate: () => void) {
  const pending = new Set<RowMeasurement>();
  let frame: number | null = null;
  let mounted = false;
  let requested = false;
  const flush = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    requested = false;
    const jobs = [...pending];
    pending.clear();
    const changes = jobs.map((measure) => measure());
    for (const apply of changes) apply?.();
  };
  return {
    beforePaint(measure: RowMeasurement) {
      pending.add(measure);
      // Descendant-only mounts do not run this provider's layout effect by themselves.
      if (mounted && !requested) {
        requested = true;
        invalidate();
      }
    },
    schedule(measure: RowMeasurement) {
      pending.add(measure);
      if (frame === null) frame = requestAnimationFrame(flush);
    },
    cancel(measure: RowMeasurement) {
      pending.delete(measure);
      if (!pending.size && frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
    commit() {
      mounted = true;
      flush();
    },
    dispose() {
      mounted = false;
      pending.clear();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      requested = false;
    },
  };
}
const InspectorRowFittingContext = React.createContext<ReturnType<
  typeof createInspectorRowFitting
> | null>(null);

/** Enables the canonical parameter construction for a migrated inspector owner. */
export function InspectorLayout({ children }: { children: React.ReactNode }) {
  const [, invalidate] = React.useReducer((revision: number) => revision + 1, 0);
  const [fitting] = React.useState(() => createInspectorRowFitting(invalidate));
  React.useLayoutEffect(() => fitting.commit());
  React.useLayoutEffect(() => () => fitting.dispose(), [fitting]);
  return (
    <InspectorLayoutContext value>
      <InspectorRowFittingContext value={fitting}>{children}</InspectorRowFittingContext>
    </InspectorLayoutContext>
  );
}

/** Opts a surface into canonical inspector geometry and pointer-aware keyboard focus. */
export function InspectorSurface({
  children,
  className,
  onPointerDownCapture,
  onMouseDownCapture,
  onKeyDownCapture,
  onFocusCapture,
  onBlurCapture,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const [modality, setModality] = React.useState<'pointer' | 'keyboard'>('pointer');
  const pointerFocus = React.useRef(false);
  const markPointerInput = () => {
    pointerFocus.current = true;
    setModality('pointer');
  };
  return (
    <InspectorLayout>
      <div
        {...props}
        className={cx('sniptale-compact-workspace sniptale-inspector-surface', className)}
        data-focus-modality={modality}
        onPointerDownCapture={(event) => {
          markPointerInput();
          onPointerDownCapture?.(event);
        }}
        onMouseDownCapture={(event) => {
          markPointerInput();
          onMouseDownCapture?.(event);
        }}
        onKeyDownCapture={(event) => {
          pointerFocus.current = false;
          setModality('keyboard');
          onKeyDownCapture?.(event);
        }}
        onFocusCapture={(event) => {
          if (!pointerFocus.current && event.target.matches(':focus-visible'))
            setModality('keyboard');
          onFocusCapture?.(event);
        }}
        onBlurCapture={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            pointerFocus.current = false;
          onBlurCapture?.(event);
        }}
      >
        {children}
      </div>
    </InspectorLayout>
  );
}

export function useInspectorLayout() {
  return React.useContext(InspectorLayoutContext);
}

/** Internal measurement port for controls in this mounted inspector. */
export function useInspectorFitting() {
  return React.useContext(InspectorRowFittingContext);
}

/** Keep the value in its column unless the field declares a stacked layout. */
export function InspectorParameterRow(props: {
  label: string;
  labelAccessory?: React.ReactNode;
  labelModified?: boolean | undefined;
  children: React.ReactNode;
  stacked?: boolean;
  className?: string | undefined;
  dataUi?: string;
  onActivate?(): void;
}) {
  const isActivation = (target: EventTarget) =>
    target instanceof Element && !target.closest('button,input,textarea,select,a,[role="slider"]');
  return (
    <div
      data-ui={props.dataUi}
      data-compact-select-menu-bounds="parameter"
      data-layout={props.stacked ? 'stacked' : 'inline'}
      data-activates={props.onActivate ? 'true' : undefined}
      className={cx('sniptale-parameter-row', props.className)}
      onPointerDown={(event) => {
        if (props.onActivate && event.button === 0 && isActivation(event.target))
          event.preventDefault();
      }}
      onClick={(event) => {
        const activate = props.onActivate;
        if (activate && isActivation(event.target)) {
          event.stopPropagation();
          activate();
        }
      }}
    >
      <span
        data-compact-select-menu-label=""
        title={props.label}
        className={cx(
          'sniptale-parameter-name',
          props.labelModified && '!text-[var(--sniptale-color-accent)]'
        )}
      >
        <span>{props.label}</span>
        {props.labelAccessory ? (
          <span data-parameter-label-accessory className="ml-1 inline-flex shrink-0">
            {props.labelAccessory}
          </span>
        ) : null}
      </span>
      <div className="sniptale-parameter-value">{props.children}</div>
    </div>
  );
}

export interface InspectorPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function InspectorPanel({ children, className, ...props }: InspectorPanelProps) {
  return (
    <div
      {...props}
      className={cx(
        'rounded-[14px] border p-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
        'text-[color:var(--sniptale-color-text-primary)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface PanelHeaderProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function PanelHeader({ children, className, ...props }: PanelHeaderProps) {
  return (
    <h3
      {...props}
      className={cx(
        'm-0 text-[12px] font-bold uppercase leading-4',
        'text-[color:var(--sniptale-color-text-secondary)]',
        className
      )}
    >
      {children}
    </h3>
  );
}

export interface PanelSectionProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  label: React.ReactNode;
  value?: React.ReactNode;
}

export function PanelSection({ children, className, label, value, ...props }: PanelSectionProps) {
  return (
    <section
      {...props}
      className={cx(
        'rounded-[10px] border px-3 py-2',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        className
      )}
    >
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span className="min-w-0 text-[12px] font-semibold text-[color:var(--sniptale-color-text-secondary)]">
          {label}
        </span>
        {value === undefined ? null : (
          <span
            className={[
              'shrink-0 text-right text-[12px] font-semibold',
              'text-[color:var(--sniptale-color-text-primary)]',
            ].join(' ')}
          >
            {value}
          </span>
        )}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}

export interface CollapsibleSectionProps extends Omit<PanelSectionProps, 'children'> {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CollapsibleSection({
  children,
  defaultOpen = true,
  label,
  onOpenChange,
  open,
  value,
  ...props
}: CollapsibleSectionProps) {
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const resolvedOpen = open ?? localOpen;
  const toggleOpen = () => {
    const nextOpen = !resolvedOpen;
    setLocalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <section {...props} className={cx('space-y-2', props.className)}>
      <button
        type="button"
        aria-expanded={resolvedOpen}
        className={cx(
          'flex min-h-9 w-full items-center justify-between gap-3 rounded-[10px] border px-3',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
          'text-left transition hover:border-[color:var(--sniptale-color-border-strong)]'
        )}
        onClick={toggleOpen}
      >
        <span className="flex min-w-0 items-center gap-2">
          {resolvedOpen ? (
            <ChevronDown size={14} strokeWidth={2.3} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} strokeWidth={2.3} aria-hidden="true" />
          )}
          <span className="text-[12px] font-bold uppercase text-[color:var(--sniptale-color-text-secondary)]">
            {label}
          </span>
        </span>
        {value === undefined ? null : (
          <span className="shrink-0 text-[12px] font-semibold text-[color:var(--sniptale-color-accent)]">
            {value}
          </span>
        )}
      </button>
      {resolvedOpen ? <div className="space-y-2">{children}</div> : null}
    </section>
  );
}
