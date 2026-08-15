import { Archive, ExternalLink, Images, Loader2 } from 'lucide-react';

import { cx } from '../selection/utils';
import {
  footerCopyButtonBaseClassName,
  footerCopyButtonDisabledClassName,
  footerCopyButtonEnabledClassName,
} from './tokens';

export function ExportFooterSnapshotButton(props: {
  disabled: boolean;
  isSaving: boolean;
  mode?: 'gallery' | 'open' | 'save';
  onClick: () => void;
  title: string;
}) {
  const Icon = props.isSaving
    ? Loader2
    : props.mode === 'open'
      ? ExternalLink
      : props.mode === 'gallery'
        ? Images
        : Archive;

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled || props.isSaving}
      title={props.title}
      aria-label={props.title}
      className={cx(
        footerCopyButtonBaseClassName,
        props.disabled ? footerCopyButtonDisabledClassName : footerCopyButtonEnabledClassName
      )}
    >
      <Icon
        className={cx(
          'h-[18px] w-[18px] shrink-0 text-[var(--sniptale-color-text-primary)]',
          'transition-transform duration-200 ease-out',
          'group-hover:-translate-y-px group-focus-visible:-translate-y-px',
          'group-disabled:translate-y-0 motion-reduce:transition-none',
          props.isSaving && 'animate-spin'
        )}
      />
    </button>
  );
}
