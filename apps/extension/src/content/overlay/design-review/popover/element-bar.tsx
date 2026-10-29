import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  RotateCcw,
  TextCursorInput,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import type { DesignReviewTextViewState, DesignReviewViewState } from '../types';

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
  onNavigateElement: (target: Element) => void;
  navigation: DesignReviewViewState['treeNavigation'];
  onDeleteRequest: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  onEditText: () => void;
  onResetText: () => void;
  selection: PageStyleSelectionSnapshot | null;
  settingsOpen: boolean;
  text: DesignReviewTextViewState;
}) {
  const selection = props.selection;
  const copy = useElementCopyFeedback(selection?.element, props.onCopyElement);
  if (!selection) {
    return null;
  }
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-1">
      <div
        className="inline-flex shrink-0 items-center gap-0.5"
        data-ui="content.design-review.tree-navigation"
      >
        {[
          {
            Icon: ChevronUp,
            target: props.navigation.parent,
            label: translate('content.designReview.selectParentElement'),
          },
          {
            Icon: ChevronDown,
            target: props.navigation.child,
            label: translate('content.designReview.selectChildElement'),
          },
        ].map(({ Icon, target, label }) => (
          <ContentToolbarButton
            key={label}
            tone="utility"
            type="button"
            className="!h-6 !min-h-6 !w-5 !min-w-5 shrink-0 !p-0 [&_svg]:!size-3"
            aria-label={label}
            title={label}
            disabled={!target}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (target) props.onNavigateElement(target);
            }}
          >
            <Icon size={12} />
          </ContentToolbarButton>
        ))}
      </div>
      <button
        type="button"
        className={[
          'min-w-0 flex-1 text-left font-mono text-xs leading-4',
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
      {props.text.modified ? (
        <ContentToolbarButton
          tone="utility"
          type="button"
          className="!h-6 !w-6 shrink-0 !p-0 [&_svg]:!size-3"
          dataUi="content.design-review.reset-text"
          disabled={!props.text.resettable}
          aria-label={translate('content.designReview.resetText')}
          title={translate('content.designReview.resetText')}
          onClick={props.onResetText}
        >
          <RotateCcw size={12} />
        </ContentToolbarButton>
      ) : null}
      <ElementActionButton
        disabled={copy.status === 'pending'}
        label={translate('content.designReview.copyElement')}
        onClick={() => void copy.onCopy()}
      >
        {copy.status === 'copied' ? <Check size={16} /> : <Copy size={16} />}
      </ElementActionButton>
      <span className="sr-only" role="status">
        {copy.status === 'copied' ? translate('content.designReview.elementCopied') : ''}
      </span>
      <ElementActionButton
        disabled={!props.text.editable}
        label={translate('content.designReview.editText')}
        onClick={props.onEditText}
      >
        <TextCursorInput size={16} />
      </ElementActionButton>
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
          <Trash2 size={16} className="text-[var(--sniptale-color-danger)]" />
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
    <ContentToolbarButton
      tone={props.active ? 'property' : 'utility'}
      active={props.active ?? false}
      type="button"
      className={[
        'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px]',
        'border border-transparent active:bg-[var(--sniptale-color-surface-hover)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
        'disabled:cursor-default disabled:opacity-50',
        props.danger
          ? 'text-[var(--sniptale-color-danger)] hover:bg-[var(--sniptale-color-danger-soft)]'
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
    </ContentToolbarButton>
  );
}
