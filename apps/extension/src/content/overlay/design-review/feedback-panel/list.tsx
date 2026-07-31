import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import type { BrowserDomAnnotationRecord } from '../../../parser/page-preparation/annotations';
import { getDesignReviewActionOption, getDesignReviewActionTone } from '../action-catalog';
import { getDesignReviewRecordAction } from '../records';
import type { FeedbackActionFilter } from './filter';

function getElementLabel(record: BrowserDomAnnotationRecord): string {
  const selectorTag = record.evidence.targetSelector.match(/^[a-z][a-z0-9-]*/iu)?.[0] ?? 'element';
  const tag = selectorTag.toUpperCase();
  const name = record.evidence.targetText.trim().replace(/\s+/gu, ' ').slice(0, 42);
  return name ? `${tag} · ${name}` : tag;
}

function getPageLabel(record: BrowserDomAnnotationRecord): string {
  try {
    const url = new URL(record.evidence.pageUrl);
    return url.pathname === '/' ? url.hostname : url.pathname;
  } catch {
    return record.evidence.fileLabel;
  }
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

function FeedbackPreview(props: { record: BrowserDomAnnotationRecord; rect: DOMRect }) {
  const action = getDesignReviewRecordAction(props.record);
  const option = getDesignReviewActionOption(action);
  const Icon = option.icon;
  const width = Math.min(300, Math.max(0, window.innerWidth - 24));
  const position = {
    left:
      props.rect.right + 12 + width <= window.innerWidth - 12
        ? props.rect.right + 12
        : Math.max(12, props.rect.left - width - 12),
    top: Math.min(Math.max(12, props.rect.top), Math.max(12, window.innerHeight - 260)),
    width,
  };
  return (
    <aside
      className={[
        'pointer-events-none fixed z-[2147483647] rounded-[12px] border p-4 shadow-2xl',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      data-ui="content.design-review.feedback-preview"
      style={position}
    >
      <div
        className={`flex items-center gap-2 text-sm font-bold ${getDesignReviewActionTone(action)}`}
      >
        <Icon size={18} />
        {translate(option.labelKey)}
      </div>
      <div className="mt-2 text-xs text-[var(--sniptale-color-text-secondary)]">
        {getElementLabel(props.record)}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-[var(--sniptale-color-text-dim)]">
        {props.record.evidence.targetPath}
      </div>
      <div className="my-3 border-t border-[color:var(--sniptale-color-border-soft)]" />
      <p className="whitespace-pre-wrap break-words text-xs leading-5">
        {getRecordSummary(props.record)}
      </p>
      <div className="mt-3 text-right text-[10px] text-[var(--sniptale-color-text-dim)]">
        {translate('content.designReview.panelClickHint')}
      </div>
    </aside>
  );
}

export function FeedbackList(props: {
  filter: FeedbackActionFilter;
  onOpenRecord: (annotationId: number) => boolean;
  query: string;
  records: BrowserDomAnnotationRecord[];
}) {
  const [hovered, setHovered] = useState<{
    record: BrowserDomAnnotationRecord;
    rect: DOMRect;
  } | null>(null);
  const query = props.query.trim().toLocaleLowerCase();
  const visibleRecords = props.records.filter(
    (record) =>
      (props.filter === 'all' || getDesignReviewRecordAction(record) === props.filter) &&
      matchesQuery(record, query)
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
      {visibleRecords.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-[var(--sniptale-color-text-dim)]">
          {props.records.length === 0
            ? translate('content.designReview.panelEmpty')
            : translate('content.designReview.panelNoResults')}
        </div>
      ) : (
        visibleRecords.map((record) => {
          const action = getDesignReviewRecordAction(record);
          const option = getDesignReviewActionOption(action);
          const Icon = option.icon;
          return (
            <button
              key={record.annotationId}
              type="button"
              className={[
                'block w-full rounded-[9px] border-l-2 px-3 py-3 text-left',
                'border-transparent hover:bg-[var(--sniptale-color-surface-input)]',
                'focus-visible:border-[color:var(--sniptale-color-accent)] focus-visible:outline-none',
              ].join(' ')}
              data-annotation-id={record.annotationId}
              data-ui="content.design-review.feedback-item"
              onClick={() => {
                setHovered(null);
                props.onOpenRecord(record.annotationId);
              }}
              onMouseEnter={(event) =>
                setHovered({ record, rect: event.currentTarget.getBoundingClientRect() })
              }
              onMouseLeave={() => setHovered(null)}
              onFocus={(event) =>
                setHovered({ record, rect: event.currentTarget.getBoundingClientRect() })
              }
              onBlur={() => setHovered(null)}
            >
              <span className="flex items-center gap-2">
                <Icon className={getDesignReviewActionTone(action)} size={17} />
                <strong className={`text-xs ${getDesignReviewActionTone(action)}`}>
                  {translate(option.labelKey)}
                </strong>
                <span className="ml-auto truncate text-[10px] text-[var(--sniptale-color-text-dim)]">
                  {getElementLabel(record)}
                </span>
              </span>
              <span
                className="mt-2 block overflow-hidden pl-6 text-xs leading-5"
                data-ui="content.design-review.feedback-summary"
                style={{
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 3,
                  display: '-webkit-box',
                }}
              >
                {getRecordSummary(record)}
              </span>
              <span className="mt-1 block pl-6 text-[10px] text-[var(--sniptale-color-text-dim)]">
                {translate('content.designReview.panelPage')} {getPageLabel(record)}
              </span>
            </button>
          );
        })
      )}
      {hovered ? <FeedbackPreview record={hovered.record} rect={hovered.rect} /> : null}
    </div>
  );
}
