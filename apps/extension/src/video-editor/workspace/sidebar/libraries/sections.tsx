import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { cx } from './helpers';

const SIDEBAR_BUTTON_BASE_CLASS_NAME = [
  'border-none bg-transparent transition-colors',
  'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
].join(' ');
const SIDEBAR_BUTTON_ACCENT_CLASS_NAME = 'bg-transparent';
const SIDEBAR_BUTTON_ACCENT_TEXT_CLASS_NAME = 'text-[var(--sniptale-color-text-primary-strong)]';
const SIDEBAR_BUTTON_ACCENT_HOVER_CLASS_NAME = [
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_78%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_78%,transparent)]',
  'hover:text-[var(--sniptale-color-accent-emphasis)]',
  'focus-visible:text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');
const SIDEBAR_BUTTON_NEUTRAL_CLASS_NAME = 'bg-transparent';
const SIDEBAR_BUTTON_NEUTRAL_TEXT_CLASS_NAME = 'text-[var(--sniptale-color-text-secondary)]';
const SIDEBAR_BUTTON_NEUTRAL_HOVER_CLASS_NAME = [
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
  'focus-visible:text-[var(--sniptale-color-text-primary)]',
].join(' ');

export function CollapsibleSection({
  title,
  meta,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  meta: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'shrink-0 border-t border-[color:var(--sniptale-color-border-subtle)] transition-[height] duration-200',
        expanded ? 'h-[17rem]' : 'h-14'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={[
          'flex h-14 w-full items-center justify-between gap-3 px-4 text-left transition',
          'hover:bg-[color:var(--sniptale-color-surface-panel)]',
        ].join(' ')}
      >
        <CollapsibleSectionHeader icon={icon} meta={meta} title={title} />
        <CollapsibleSectionChevron expanded={expanded} />
      </button>
      {expanded ? <CollapsibleSectionBody>{children}</CollapsibleSectionBody> : null}
    </div>
  );
}

function CollapsibleSectionHeader({
  icon,
  meta,
  title,
}: {
  icon: ReactNode;
  meta: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border',
          'border-[color:var(--sniptale-color-border-subtle)] bg-[color:var(--sniptale-color-surface-panel)]',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {title}
        </div>
        <div className="truncate text-xs uppercase tracking-[0.12em] text-[var(--sniptale-color-text-dim)]">
          {meta}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSectionChevron({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <ChevronDown size={16} className="text-[var(--sniptale-color-text-dim)]" />
  ) : (
    <ChevronRight size={16} className="text-[var(--sniptale-color-text-dim)]" />
  );
}

function CollapsibleSectionBody({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        'h-[calc(100%-3.5rem)] min-h-0 overflow-y-auto border-t',
        'border-[color:var(--sniptale-color-border-subtle)] bg-[color:var(--sniptale-color-surface-panel)]',
        'px-3 pb-3',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function ActionButton({
  title,
  icon,
  onClick,
  accent = false,
  fullWidth = false,
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
  accent?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <ProductActionButton
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      tone={accent ? 'primary' : 'secondary'}
      data-ui="video-editor.sidebar.library-action"
      className={cx('gap-2 text-[12px]', fullWidth ? 'w-full justify-start' : 'justify-center')}
    >
      {icon}
      <span>{title}</span>
    </ProductActionButton>
  );
}

export function CollapsedSelectionCard({
  selectedClipLabel,
  selectedClipIcon,
}: {
  selectedClipLabel: string;
  selectedClipIcon: ReactNode;
}) {
  return (
    <div
      className={[
        'mt-auto flex w-full flex-col gap-2 rounded-[12px] border',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_88%,transparent)]',
        'px-2 py-3 text-center',
      ].join(' ')}
    >
      <div className="text-xs uppercase tracking-[0.12em] text-[var(--sniptale-color-text-dim)]">
        {translate('videoEditor.sidebar.collapsedSelectionTitle')}
      </div>
      <div className="flex justify-center text-[var(--sniptale-color-text-primary)]">
        {selectedClipIcon}
      </div>
      <div className="text-xs font-semibold leading-4 text-[var(--sniptale-color-text-primary)]">
        {selectedClipLabel}
      </div>
    </div>
  );
}

export {
  SIDEBAR_BUTTON_ACCENT_CLASS_NAME,
  SIDEBAR_BUTTON_ACCENT_HOVER_CLASS_NAME,
  SIDEBAR_BUTTON_ACCENT_TEXT_CLASS_NAME,
  SIDEBAR_BUTTON_BASE_CLASS_NAME,
  SIDEBAR_BUTTON_NEUTRAL_CLASS_NAME,
  SIDEBAR_BUTTON_NEUTRAL_HOVER_CLASS_NAME,
  SIDEBAR_BUTTON_NEUTRAL_TEXT_CLASS_NAME,
};
