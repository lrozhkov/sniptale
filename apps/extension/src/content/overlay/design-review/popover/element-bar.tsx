import { ClipboardCopy, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { describeDesignReviewElement } from './element-label';

export function DesignReviewElementBar(props: {
  hasFeedback: boolean;
  onCopyElement: () => void;
  onCopyPath: () => void;
  onDeleteRequest: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  selection: PageStyleSelectionSnapshot | null;
  settingsOpen: boolean;
}) {
  const selection = props.selection;
  if (!selection) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-1">
      <span
        className={[
          'shrink-0 rounded-[4px] text-xs text-[var(--sniptale-color-text-dim)] outline-none',
          'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
        ].join(' ')}
        data-ui="content.design-review.element-tag"
        tabIndex={0}
        title={describeDesignReviewElement(selection.tagName)}
      >
        {selection.tagName.toUpperCase()}
      </span>
      <strong className="max-w-32 truncate text-xs">
        {selection.textPreview || selection.tagName}
      </strong>
      <button
        type="button"
        className={[
          'min-w-0 flex-1 text-left font-mono text-[10px]',
          'text-[var(--sniptale-color-text-dim)]',
          'hover:text-[var(--sniptale-color-text-primary)]',
          'rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
        ].join(' ')}
        aria-label={translate('content.designReview.copyFullPath')}
        title={selection.domPath}
        onClick={props.onCopyPath}
      >
        <span className="block truncate" data-ui="content.design-review.element-selector">
          {selection.selectorLabel}
        </span>
      </button>
      <ElementActionButton
        label={translate('content.designReview.copyElement')}
        onClick={props.onCopyElement}
      >
        <ClipboardCopy size={16} />
      </ElementActionButton>
      {props.settingsOpen ? (
        props.hasFeedback ? (
          <ElementActionButton
            danger
            label={translate('content.designReview.deleteFeedback')}
            onClick={props.onDeleteRequest}
          >
            <Trash2 size={16} />
          </ElementActionButton>
        ) : null
      ) : (
        <ElementActionButton
          label={translate('content.designReview.editProperties')}
          onClick={() => props.onSettingsOpenChange(true)}
        >
          <Pencil size={16} />
        </ElementActionButton>
      )}
    </div>
  );
}

function ElementActionButton(props: {
  children: ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[7px]',
        'border border-transparent active:bg-[var(--sniptale-color-surface-hover)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
        props.danger
          ? 'ml-1 text-[var(--sniptale-color-danger)] hover:bg-[var(--sniptale-color-danger-soft)]'
          : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
