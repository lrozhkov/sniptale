import { ClipboardCopy, Pencil, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { describeDesignReviewElement } from './element-label';

const TOOLTIP_CLASS_NAME = [
  'pointer-events-none invisible absolute bottom-full z-40 mb-2 w-max rounded-[7px] border',
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
  'px-2 py-1.5 text-[10px] font-normal shadow-lg',
].join(' ');

export function DesignReviewElementBar(props: {
  onCopyElement: () => void;
  onCopyPath: () => void;
  onDeleteRequest: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  selection: PageStyleSelectionSnapshot | null;
  settingsOpen: boolean;
}) {
  const tagTooltipId = useId();
  const pathTooltipId = useId();
  const selection = props.selection;
  if (!selection) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-1">
      <span
        className="group relative shrink-0 text-xs text-[var(--sniptale-color-text-dim)] outline-none"
        aria-describedby={tagTooltipId}
        tabIndex={0}
      >
        {selection.tagName.toUpperCase()}
        <span
          className={`${TOOLTIP_CLASS_NAME} left-0 max-w-72 group-hover:visible group-focus:visible`}
          data-ui="content.design-review.element-tag-tooltip"
          id={tagTooltipId}
          role="tooltip"
        >
          {describeDesignReviewElement(selection.tagName)}
        </span>
      </span>
      <strong className="max-w-32 truncate text-xs">
        {selection.textPreview || selection.tagName}
      </strong>
      <button
        type="button"
        className={[
          'group relative min-w-0 flex-1 overflow-visible text-left font-mono text-[10px]',
          'text-[var(--sniptale-color-text-dim)]',
          'hover:text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
        aria-describedby={pathTooltipId}
        aria-label={translate('content.designReview.copyFullPath')}
        onClick={props.onCopyPath}
      >
        <span className="block truncate" data-ui="content.design-review.element-selector">
          {selection.selectorLabel}
        </span>
        <span
          className={[
            TOOLTIP_CLASS_NAME,
            'left-1/2 max-w-96 -translate-x-1/2 whitespace-normal break-all text-left font-mono',
            'group-hover:visible group-focus-visible:visible',
          ].join(' ')}
          data-ui="content.design-review.full-path-tooltip"
          id={pathTooltipId}
          role="tooltip"
        >
          {selection.domPath}
        </span>
      </button>
      <ElementActionButton
        label={translate('content.designReview.copyElement')}
        onClick={props.onCopyElement}
      >
        <ClipboardCopy size={16} />
      </ElementActionButton>
      <ElementActionButton
        active={props.settingsOpen}
        label={translate('content.designReview.editProperties')}
        onClick={() => props.onSettingsOpenChange(!props.settingsOpen)}
      >
        <Pencil size={16} />
      </ElementActionButton>
      <ElementActionButton
        danger
        label={translate('content.designReview.deleteFeedback')}
        onClick={props.onDeleteRequest}
      >
        <Trash2 size={16} />
      </ElementActionButton>
    </div>
  );
}

function ElementActionButton(props: {
  active?: boolean;
  children: ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border',
        'border-[color:var(--sniptale-color-border-soft)]',
        props.danger ? 'text-[var(--sniptale-color-danger)]' : '',
      ].join(' ')}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
