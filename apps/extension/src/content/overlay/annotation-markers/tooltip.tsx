import type { KeyboardEvent, RefObject } from 'react';
import { translate } from '../../../platform/i18n';
import type { BrowserDomAnnotationRecord } from '../../parser/page-preparation/annotations';
import {
  getDesignReviewActionOption,
  getDesignReviewActionTone,
} from '../design-review/action-catalog';
import { getDesignReviewRecordAction } from '../design-review/records';
import type { AnnotationMarkerPosition } from './position';

function handleTooltipScroll(event: KeyboardEvent<HTMLElement>, tooltip: HTMLElement | null): void {
  if (!tooltip) return;
  const page = Math.max(24, tooltip.clientHeight - 16);
  const commands: Partial<Record<string, number>> = {
    ArrowDown: 24,
    ArrowUp: -24,
    PageDown: page,
    PageUp: -page,
  };
  let nextScrollTop: number | undefined;
  if (event.key === 'Home') nextScrollTop = 0;
  else if (event.key === 'End') nextScrollTop = tooltip.scrollHeight;
  else if (commands[event.key] !== undefined)
    nextScrollTop = tooltip.scrollTop + commands[event.key]!;
  if (nextScrollTop === undefined) return;
  event.preventDefault();
  tooltip.scrollTop = Math.max(
    0,
    Math.min(nextScrollTop, Math.max(0, tooltip.scrollHeight - tooltip.clientHeight))
  );
}

export function AnnotationMarkerTooltip(props: {
  id: string;
  position: AnnotationMarkerPosition;
  record: BrowserDomAnnotationRecord;
  scrollRef: RefObject<HTMLSpanElement | null>;
}) {
  const action = getDesignReviewRecordAction(props.record);
  const option = getDesignReviewActionOption(action);
  const Icon = option.icon;
  const summary =
    props.record.comment ||
    (props.record.propertyChanges.length > 0
      ? `${translate('content.designReview.panelPropertiesChanged')}: ${props.record.propertyChanges.length}`
      : translate('content.designReview.panelNoComment'));

  return (
    <span
      className={[
        'sniptale-annotation-marker-tooltip pointer-events-auto invisible fixed',
        'z-[2147483647] opacity-0 transition-opacity',
        'group-hover:visible group-hover:opacity-100 group-focus-within:visible',
        'group-focus-within:opacity-100 motion-reduce:transition-none',
        ...(props.position.tooltipCorridor === 'none'
          ? []
          : [
              'before:pointer-events-auto before:absolute before:left-0 before:right-0',
              "before:h-2 before:content-['']",
              props.position.tooltipCorridor === 'below' ? 'before:-top-2' : 'before:-bottom-2',
            ]),
      ].join(' ')}
      id={props.id}
      role="tooltip"
      style={{
        bottom: props.position.tooltipBottom ?? undefined,
        left: props.position.tooltipLeft ?? undefined,
        right: props.position.tooltipRight ?? undefined,
        top: props.position.tooltipTop ?? undefined,
      }}
    >
      <span
        className={[
          'block box-border max-w-[300px] overscroll-contain overflow-y-auto',
          'whitespace-pre-wrap break-words rounded-[10px] border shadow-xl',
          'border-[color:var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-panel)] text-xs',
          'text-[var(--sniptale-color-text-primary)]',
          props.position.compactTooltip ? 'p-1' : 'px-3 py-2.5',
        ].join(' ')}
        data-ui="content.annotation-marker-tooltip-scroll"
        ref={props.scrollRef}
        style={{
          maxHeight: props.position.tooltipMaxHeight,
          maxWidth: props.position.tooltipMaxWidth,
        }}
      >
        <span className={`flex items-center gap-2 font-bold ${getDesignReviewActionTone(action)}`}>
          <Icon size={16} />
          {translate(option.labelKey)}
        </span>
        <span className="mt-1 block truncate text-[10px] text-[var(--sniptale-color-text-dim)]">
          {props.record.evidence.targetPath}
        </span>
        <span className="my-2 block border-t border-[color:var(--sniptale-color-border-soft)]" />
        <span className="block leading-5">{summary}</span>
        <span className="mt-2 block text-right text-[10px] text-[var(--sniptale-color-text-dim)]">
          {translate('content.designReview.panelClickHint')}
        </span>
      </span>
    </span>
  );
}

export { handleTooltipScroll };
