import React from 'react';
import { Link2 } from 'lucide-react';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { cx } from '../../chrome/ui';

export function getAspectRatio(width: number, height: number): number | null {
  if (width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

export function updateLockedDraft(
  current: { width: number; height: number },
  field: 'width' | 'height',
  nextValue: number,
  keepAspect: boolean,
  aspectRatio: number | null
): { width: number; height: number } {
  const safeValue = Math.max(1, Math.round(nextValue));
  if (!keepAspect || !aspectRatio || aspectRatio <= 0) {
    return { ...current, [field]: safeValue };
  }

  if (field === 'width') {
    return { width: safeValue, height: Math.max(1, Math.round(safeValue / aspectRatio)) };
  }

  return { width: Math.max(1, Math.round(safeValue * aspectRatio)), height: safeValue };
}

export function getFramePaddingSummary(frame: EditorFrameSettings): string {
  return [frame.paddingTop, frame.paddingRight, frame.paddingBottom, frame.paddingLeft].join(' / ');
}

type AspectToggleProps = {
  checked: boolean;
  compact?: boolean;
  onClick: () => void;
};

function CompactAspectToggle({ checked, onClick }: AspectToggleProps) {
  const title = translate('editor.compact.keepAspectRatio');
  const compactClass = [
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border',
    'border-[color:var(--sniptale-color-border-soft)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_86%,transparent)]',
    'text-[color:var(--sniptale-color-text-muted)] transition hover:brightness-110',
  ].join(' ');
  const compactActiveClass =
    'border-[color:var(--sniptale-color-border-accent-strong)] bg-[color:var(--sniptale-color-accent-soft)] ' +
    'text-[color:var(--sniptale-color-accent)]';

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={checked}
      className={cx(compactClass, checked && compactActiveClass)}
      onClick={onClick}
    >
      <Link2 size={16} strokeWidth={2} />
    </button>
  );
}

function FullAspectToggle({ checked, onClick }: AspectToggleProps) {
  const baseClass =
    'flex h-[4.5rem] w-full items-center justify-between gap-3 rounded-[14px] ' +
    'border border-[color:var(--sniptale-color-border-soft)] border-t-[color:var(--sniptale-color-border-strong)] ' +
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_68%,transparent)] ' +
    'px-3.5 text-left transition ' +
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]';
  const activeClass =
    'border-[color:var(--sniptale-color-border-accent-strong)] bg-[color:var(--sniptale-color-accent-soft)] ' +
    'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]';
  const iconClass = [
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border',
    'border-[color:var(--sniptale-color-border-soft)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_86%,transparent)]',
    'text-[color:var(--sniptale-color-text-muted)] transition',
  ].join(' ');
  const iconActiveClass =
    'border-[color:var(--sniptale-color-border-accent-strong)] bg-[color:var(--sniptale-color-accent-soft)] ' +
    'text-[color:var(--sniptale-color-accent)]';
  const statusBaseClass =
    'inline-flex h-8 shrink-0 items-center rounded-full border px-2.5 ' +
    'text-[12px] font-semibold uppercase transition';
  const statusActiveClass =
    'border-[color:var(--sniptale-color-border-accent-strong)] ' +
    'bg-[color:var(--sniptale-color-accent-soft)] text-[color:var(--sniptale-color-accent)]';
  const statusIdleClass =
    'border-[color:var(--sniptale-color-border-soft)] ' +
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_86%,transparent)] ' +
    'text-[color:var(--sniptale-color-text-muted)]';

  return (
    <button type="button" className={cx(baseClass, checked && activeClass)} onClick={onClick}>
      <span className="flex min-w-0 items-center gap-3">
        <span className={cx(iconClass, checked && iconActiveClass)}>
          <Link2 size={16} strokeWidth={2} />
        </span>
        <span className="min-w-0 text-sm font-medium text-[color:var(--sniptale-color-text-primary)]">
          {translate('editor.compact.keepAspectRatio')}
        </span>
      </span>
      <span className={cx(statusBaseClass, checked ? statusActiveClass : statusIdleClass)}>
        {checked ? translate('editor.compact.linked') : translate('editor.compact.unlocked')}
      </span>
    </button>
  );
}

export const AspectToggle: React.FC<AspectToggleProps> = (props) =>
  props.compact ? <CompactAspectToggle {...props} /> : <FullAspectToggle {...props} />;
