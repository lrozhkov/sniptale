import { Check, ClipboardCopy, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { describeDesignReviewElement } from './element-label';

function useElementCopyFeedback(element: Element | undefined, copy: () => Promise<boolean>) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'copied'>('idle');
  const revision = useRef(0);
  const pending = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    revision.current += 1;
    pending.current = false;
    setStatus('idle');
    return () => {
      revision.current += 1;
      clearTimeout(timeout.current);
    };
  }, [element]);
  async function onCopy() {
    if (pending.current) return;
    pending.current = true;
    clearTimeout(timeout.current);
    const request = ++revision.current;
    setStatus('pending');
    let copied = false;
    try {
      copied = await copy();
    } catch {
      copied = false;
    }
    if (request !== revision.current) return;
    pending.current = false;
    setStatus(copied ? 'copied' : 'idle');
    if (copied)
      timeout.current = setTimeout(() => {
        if (request === revision.current) setStatus('idle');
      }, 2000);
  }
  return { status, onCopy };
}

export function DesignReviewElementBar(props: {
  deleteRequested: boolean;
  hasFeedback: boolean;
  onCopyElement: () => Promise<boolean>;
  onCopyPath: () => void;
  onDeleteRequest: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  selection: PageStyleSelectionSnapshot | null;
  settingsOpen: boolean;
}) {
  const selection = props.selection;
  const copy = useElementCopyFeedback(selection?.element, props.onCopyElement);
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
        disabled={copy.status === 'pending'}
        label={translate('content.designReview.copyElement')}
        onClick={() => void copy.onCopy()}
      >
        {copy.status === 'copied' ? <Check size={16} /> : <ClipboardCopy size={16} />}
      </ElementActionButton>
      <span className="sr-only" role="status">
        {copy.status === 'copied' ? translate('content.designReview.elementCopied') : ''}
      </span>
      <ElementActionButton
        active={props.settingsOpen}
        expanded={props.settingsOpen}
        label={translate('content.designReview.editProperties')}
        onClick={() => props.onSettingsOpenChange(!props.settingsOpen)}
      >
        <Pencil size={16} />
      </ElementActionButton>
      {props.hasFeedback ? (
        <ElementActionButton
          danger
          expanded={props.deleteRequested}
          label={translate('content.designReview.deleteFeedback')}
          onClick={props.onDeleteRequest}
        >
          <Trash2 size={16} />
        </ElementActionButton>
      ) : null}
    </div>
  );
}

function ElementActionButton(props: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  expanded?: boolean;
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
        'disabled:cursor-default disabled:opacity-50',
        props.danger
          ? 'ml-1 text-[var(--sniptale-color-danger)] hover:bg-[var(--sniptale-color-danger-soft)]'
          : props.active
            ? 'text-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-surface-input)]'
            : 'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
      aria-label={props.label}
      aria-expanded={props.expanded}
      aria-pressed={props.active}
      disabled={props.disabled}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
