import { ChevronRight, X } from 'lucide-react';
import { type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const INLINE_CURTAIN_BUTTON_CLASS_NAME = [
  'group flex h-8 w-full min-w-0 items-center gap-2 rounded-[8px] px-2 text-left',
  'text-[var(--sniptale-color-text-primary)] transition-colors',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_68%,transparent)]',
].join(' ');

export const INLINE_CURTAIN_PANEL_CLASS_NAME = [
  'absolute inset-y-0 right-0 z-20 w-[78%] min-w-[248px] max-w-[calc(100%-76px)]',
  'overflow-y-auto border-l border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] px-2 py-3',
].join(' ');

export type InlineCurtainSecondaryAction = {
  ariaLabel: string;
  disabled?: boolean;
  label: string;
  panel: ReactNode;
  title?: string;
};

export function InlineCurtainCustomPanel({ children, id }: { children: ReactNode; id: string }) {
  return (
    <div id={id} className={INLINE_CURTAIN_PANEL_CLASS_NAME}>
      {children}
    </div>
  );
}

export function InlineCurtainPanelCloseButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={[
        'absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-[7px]',
        'text-[var(--sniptale-color-text-secondary)] transition-colors',
        'hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      onClick={onClick}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export function InlineCurtainTrigger({
  ariaControls,
  ariaExpanded,
  ariaLabel,
  label,
  onClick,
  onPointerDown,
  onSecondaryClick,
  secondaryAction,
  valueLabel,
}: {
  ariaControls: string;
  ariaExpanded: boolean;
  ariaLabel: string;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSecondaryClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  secondaryAction?: InlineCurtainSecondaryAction;
  valueLabel: string;
}) {
  return (
    <div className={INLINE_CURTAIN_BUTTON_CLASS_NAME}>
      <InlineCurtainPrimaryButton
        ariaControls={ariaControls}
        ariaExpanded={ariaExpanded}
        ariaLabel={ariaLabel}
        label={label}
        onClick={onClick}
        onPointerDown={onPointerDown}
        valueLabel={valueLabel}
      />
      {secondaryAction ? (
        <InlineCurtainSecondaryButton
          ariaControls={ariaControls}
          secondaryAction={secondaryAction}
          {...(onSecondaryClick === undefined ? {} : { onClick: onSecondaryClick })}
        />
      ) : null}
      <InlineCurtainChevron expanded={ariaExpanded} />
    </div>
  );
}

function InlineCurtainPrimaryButton({
  ariaControls,
  ariaExpanded,
  ariaLabel,
  label,
  onClick,
  onPointerDown,
  valueLabel,
}: {
  ariaControls: string;
  ariaExpanded: boolean;
  ariaLabel: string;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  valueLabel: string;
}) {
  return (
    <button
      type="button"
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      className="flex min-w-0 flex-1 items-center gap-2 text-left"
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className="min-w-[60px] shrink-0 text-[11px] font-medium text-[var(--sniptale-color-text-secondary)]">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={valueLabel}>
        {valueLabel}
      </span>
    </button>
  );
}

function InlineCurtainChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cx(
        'h-3.5 w-3.5 shrink-0 opacity-0 transition-[opacity,transform]',
        'group-hover:opacity-100 group-focus-visible:opacity-100',
        expanded && 'rotate-90 opacity-100'
      )}
    />
  );
}

function InlineCurtainSecondaryButton({
  ariaControls,
  onClick,
  secondaryAction,
}: {
  ariaControls: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  secondaryAction: InlineCurtainSecondaryAction;
}) {
  return (
    <button
      type="button"
      aria-controls={ariaControls}
      aria-label={secondaryAction.ariaLabel}
      className={[
        'shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-medium',
        'text-[var(--sniptale-color-text-secondary)] transition-colors',
        'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_70%,transparent)]',
        'hover:text-[var(--sniptale-color-text-primary)]',
        'disabled:pointer-events-none disabled:opacity-45',
      ].join(' ')}
      disabled={secondaryAction.disabled}
      onClick={onClick}
      title={secondaryAction.title ?? secondaryAction.label}
    >
      {secondaryAction.label}
    </button>
  );
}
