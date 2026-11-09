import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ReviewSessionEntry } from '../../../application/design-review-session/runtime';
import { translate } from '../../../../platform/i18n';
import type { BrowserDomAnnotationRecord } from '../../../parser/page-preparation/annotations';
import { getDesignReviewActionOption, getDesignReviewActionTone } from '../action-catalog';
import { getDesignReviewRecordAction } from '../records';
import { FeedbackEvidenceText, FeedbackPreview } from './preview';
import type { FeedbackActionFilter } from './filter';

function getElementLabel(record: BrowserDomAnnotationRecord): string {
  const selectorTag = record.evidence.targetSelector.match(/^[a-z][a-z0-9-]*/iu)?.[0] ?? 'element';
  const tag = selectorTag.toUpperCase();
  const name = record.evidence.targetText.trim().replace(/\s+/gu, ' ').slice(0, 42);
  return name ? `${tag} · ${name}` : tag;
}

function getRecordSummary(record: BrowserDomAnnotationRecord): string {
  if (record.comment) return record.comment;
  if (record.propertyChanges.length > 0) {
    return `${translate('content.designReview.panelPropertiesChanged')}: ${record.propertyChanges.length}`;
  }
  return translate('content.designReview.panelNoComment');
}

function matchesQuery(record: BrowserDomAnnotationRecord, query: string): boolean {
  if (!query) return true;
  const action = getDesignReviewActionOption(getDesignReviewRecordAction(record));
  return [
    record.comment,
    record.evidence.targetPath,
    record.evidence.targetSelector,
    record.evidence.targetText,
    translate(action.labelKey),
  ]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase().includes(query));
}

export function FeedbackList(props: {
  filter: FeedbackActionFilter;
  onOpenRecord: (annotationId: number) => boolean;
  query: string;
  records: BrowserDomAnnotationRecord[];
  entries?: ReviewSessionEntry[];
  onOpenEntry?: (id: string) => void;
  onDeleteEntry?: (id: string) => void;
  pending?: boolean;
}) {
  const [hovered, setHovered] = useState<{
    record: BrowserDomAnnotationRecord;
    entry: ReviewSessionEntry | undefined;
    anchor: HTMLElement;
  } | null>(null);
  const query = props.query.trim().toLocaleLowerCase();
  const records = props.entries?.map((entry) => entry.record) ?? props.records;
  const visibleRecords = records.filter(
    (record) =>
      (props.filter === 'all' || getDesignReviewRecordAction(record) === props.filter) &&
      matchesQuery(record, query)
  );

  return (
    <div
      data-ui="content.design-review.feedback-list"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
    >
      {visibleRecords.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-[var(--sniptale-color-text-dim)]">
          {records.length === 0
            ? translate('content.designReview.panelEmpty')
            : translate('content.designReview.panelNoResults')}
        </div>
      ) : (
        visibleRecords.map((record) => {
          const entry = props.entries?.find((entry) => entry.record === record);
          const action = getDesignReviewRecordAction(record);
          const option = getDesignReviewActionOption(action);
          const Icon = option.icon;
          return (
            <div
              key={entry?.id ?? record.annotationId}
              className={[
                'group/feedback-item flex h-14 w-full items-center rounded-[4px] border-l text-left',
                'border-transparent hover:bg-[var(--sniptale-color-surface-input)]',
                'focus-visible:border-[color:var(--sniptale-color-accent)] focus-visible:outline-none',
              ].join(' ')}
              data-annotation-id={record.annotationId}
              data-ui="content.design-review.feedback-item"
              onMouseEnter={(event) => setHovered({ record, entry, anchor: event.currentTarget })}
              onMouseLeave={() => setHovered(null)}
              onFocus={(event) => setHovered({ record, entry, anchor: event.currentTarget })}
              onBlur={() => setHovered(null)}
            >
              <button
                type="button"
                className={[
                  'min-w-0 flex-1 rounded-[4px] px-2 py-2 text-left',
                  'focus-visible:outline focus-visible:outline-1',
                  'focus-visible:outline-[var(--sniptale-color-accent)]',
                ].join(' ')}
                disabled={props.pending}
                onClick={(event) => {
                  event.stopPropagation();
                  setHovered(null);
                  if (entry && props.onOpenEntry) props.onOpenEntry(entry.id);
                  else props.onOpenRecord(record.annotationId);
                }}
              >
                <span className="flex items-center gap-2">
                  <Icon className={getDesignReviewActionTone(action)} size={17} />
                  <strong className={`text-xs ${getDesignReviewActionTone(action)}`}>
                    {record.markerNumber !== undefined ? `${record.markerNumber} · ` : ''}
                    {translate(option.labelKey)}
                  </strong>
                </span>
                <span
                  className={[
                    'sniptale-design-review-authored-text mt-1 block truncate pl-6 text-xs leading-4',
                    'text-[var(--sniptale-color-text-secondary)]',
                  ].join(' ')}
                  data-ui="content.design-review.feedback-summary"
                >
                  <FeedbackEvidenceText record={record} text={getRecordSummary(record)} />
                </span>
              </button>
              {entry && props.onDeleteEntry ? (
                <ContentToolbarButton
                  type="button"
                  className={[
                    'mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px]',
                    'invisible group-hover/feedback-item:visible group-focus-within/feedback-item:visible',
                    'opacity-0 group-hover/feedback-item:opacity-100',
                    'group-focus-within/feedback-item:opacity-100 focus-visible:opacity-100',
                  ].join(' ')}
                  aria-label={translate('content.designReview.panelDelete')}
                  title={translate('content.designReview.panelDelete')}
                  disabled={props.pending}
                  onClick={(event) => {
                    event.stopPropagation();
                    setHovered(null);
                    props.onDeleteEntry?.(entry.id);
                  }}
                >
                  <Trash2 size={16} />
                </ContentToolbarButton>
              ) : null}
            </div>
          );
        })
      )}
      {hovered && visibleRecords.includes(hovered.record) ? (
        <FeedbackPreview
          record={hovered.record}
          {...(hovered.entry?.preview ? { preview: hovered.entry.preview } : {})}
          unavailable={hovered.entry?.unavailable ?? false}
          anchor={hovered.anchor}
          summary={getRecordSummary(hovered.record)}
          label={getElementLabel(hovered.record)}
        />
      ) : null}
    </div>
  );
}
