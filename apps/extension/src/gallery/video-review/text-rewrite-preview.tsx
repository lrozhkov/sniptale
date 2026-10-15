import { TextareaField } from '../../ui/compact-inspector-controls';
import { useState } from 'react';
import { ProductSelect, type ProductSelectOption } from '@sniptale/ui/product-form-controls';
import { X } from 'lucide-react';
import { ReviewButton, ReviewDetails, reviewTextButtonClassName } from './controls';
import { ReviewPreviewNumberRow } from './number-row';
import type { useReviewTextRewrite } from './use-text-rewrite';
import { translate } from '../../platform/i18n';

const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;
type RewriteOperation = ReturnType<typeof useReviewTextRewrite>;

/** Disposable result editing and pagination do not own provider requests or durable Apply. */
export function ReviewTextRewritePreview({
  operation,
  disabled,
}: {
  operation: RewriteOperation;
  disabled?: boolean | undefined;
}) {
  const [limit, setLimit] = useState(50);
  const { preview } = operation;
  if (!preview?.proposal) return null;
  const sourceOptions = preview.fragments.map((entry, index) => ({
    value: entry.id,
    label: `${index + 1}. ${entry.start}–${entry.end} s · ${entry.text.slice(0, 90)}`,
  }));
  return (
    <>
      <p className="text-xs">
        {translate('gallery.videoReview.textRewritePreview').replace(
          '{count}',
          String(preview.proposal.fragments.length)
        )}
      </p>
      <p className="text-xs">{translate('gallery.videoReview.textRewriteTakeHint')}</p>
      <fieldset
        disabled={!!disabled || operation.running || operation.accepted || !!preview.receipt}
        className="min-w-0 space-y-2"
      >
        {preview.proposal.fragments.slice(0, limit).map((fragment, index) => (
          <RewriteProposalPhrase
            key={index}
            operation={operation}
            preview={preview}
            fragment={fragment}
            index={index}
            sourceOptions={sourceOptions}
          />
        ))}
      </fieldset>
      {preview.proposal.fragments.length > limit && (
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentMore')}
          className={buttonClass}
          onClick={() => setLimit((value) => value + 50)}
        >
          {translate('gallery.videoReview.textFragmentMore')}
        </ReviewButton>
      )}
      {operation.accepted ? (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.textRewriteApplied')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          <ReviewButton
            label={translate('gallery.videoReview.textRewriteReplace')}
            className={buttonClass}
            disabled={!!disabled || operation.running || preview.receiptMode === 'variant'}
            onClick={() => operation.apply('replace')}
          >
            {translate('gallery.videoReview.textRewriteReplace')}
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.textRewriteVariant')}
            className={buttonClass}
            disabled={!!disabled || operation.running || preview.receiptMode === 'replace'}
            onClick={() => operation.apply('variant')}
          >
            {translate('gallery.videoReview.textRewriteVariant')}
          </ReviewButton>
        </div>
      )}
      <ReviewButton
        label={translate('gallery.videoReview.recognitionDiscard')}
        className={buttonClass}
        disabled={operation.running}
        onClick={operation.discard}
      >
        {translate('gallery.videoReview.recognitionDiscard')}
      </ReviewButton>
    </>
  );
}

function RewriteProposalPhrase({
  operation,
  preview,
  fragment,
  index,
  sourceOptions,
}: {
  operation: RewriteOperation;
  preview: NonNullable<RewriteOperation['preview']>;
  fragment: NonNullable<NonNullable<RewriteOperation['preview']>['proposal']>['fragments'][number];
  index: number;
  sourceOptions: ProductSelectOption[];
}) {
  const { options } = operation;
  return (
    <div className="min-w-0 space-y-1 rounded border border-[var(--sniptale-color-border)] p-2">
      <span className="text-xs tabular-nums">
        {index + 1}. {fragment.start !== undefined ? `${fragment.start}–${fragment.end} s` : ''}
      </span>
      <TextareaField
        label={translate('gallery.videoReview.textRewriteResult').replace(
          '{index}',
          String(index + 1)
        )}
        rows={2}
        value={fragment.text}
        maxLength={16_000}
        onChange={(text) =>
          operation.edit((proposal) => ({
            ...proposal,
            fragments: proposal.fragments.map((entry, item) =>
              item === index ? { ...entry, text } : entry
            ),
          }))
        }
      />
      {options.changeIntervals && fragment.start !== undefined && fragment.end !== undefined && (
        <>
          <RewriteIntervalFields
            value={{ start: fragment.start, end: fragment.end }}
            bounds={preview.context.window}
            onChange={(change) =>
              operation.edit((proposal) => ({
                ...proposal,
                fragments: proposal.fragments.map((entry, item) =>
                  item === index ? { ...entry, ...change } : entry
                ),
              }))
            }
          />
        </>
      )}
      <ReviewDetails
        label={translate('gallery.videoReview.textRewriteBefore')}
        preferenceId={`text-rewrite-before-${index}`}
      >
        <p className="whitespace-pre-wrap text-xs">
          {fragment.fromIds
            .map((id) => preview.fragments.find((entry) => entry.id === id)?.text)
            .join('\n')}
        </p>
      </ReviewDetails>
      {preview.context.resegment && (
        <ReviewDetails
          label={translate('gallery.videoReview.textRewriteMapping')}
          preferenceId={`text-rewrite-mapping-${index}`}
        >
          <RewriteSourceMapping
            sourceOptions={sourceOptions}
            fromIds={fragment.fromIds}
            index={index}
            onChange={(fromIds) =>
              operation.edit((proposal) => ({
                ...proposal,
                fragments: proposal.fragments.map((entry, item) =>
                  item === index ? { ...entry, fromIds } : entry
                ),
              }))
            }
          />
        </ReviewDetails>
      )}
    </div>
  );
}

/** Mapping uses only the disclosed source choices; final coverage is validated at Apply. */
function RewriteSourceMapping({
  sourceOptions,
  fromIds,
  index,
  onChange,
}: {
  sourceOptions: ProductSelectOption[];
  fromIds: string[];
  index: number;
  onChange(ids: string[]): void;
}) {
  const label = (key: 'textRewriteSource' | 'textRewriteSourceAdd' | 'textRewriteSourceRemove') =>
    translate(`gallery.videoReview.${key}`).replace('{index}', String(index + 1));
  return (
    <div className="min-w-0 space-y-1">
      {fromIds.map((id, position) => (
        <div key={position} className="flex min-w-0 gap-1">
          <ProductSelect
            menuClassName="sniptale-parameter-menu"
            aria-label={label('textRewriteSource')}
            value={id}
            controlSize="sm"
            containerClassName="min-w-0 flex-1"
            menuScrollable
            options={sourceOptions.map((entry) => ({
              ...entry,
              disabled: entry.value !== id && fromIds.includes(entry.value),
            }))}
            onChange={(value) =>
              onChange(fromIds.map((entry, item) => (item === position ? value : entry)))
            }
          />
          <ReviewButton
            label={label('textRewriteSourceRemove')}
            disabled={fromIds.length === 1}
            onClick={() => onChange(fromIds.filter((_, item) => item !== position))}
          >
            <X size={14} />
          </ReviewButton>
        </div>
      ))}
      {fromIds.length < sourceOptions.length && (
        <ProductSelect
          menuClassName="sniptale-parameter-menu"
          aria-label={label('textRewriteSourceAdd')}
          value=""
          controlSize="sm"
          menuScrollable
          placeholder={label('textRewriteSourceAdd')}
          options={sourceOptions.filter((entry) => !fromIds.includes(entry.value))}
          onChange={(value) => onChange([...fromIds, value])}
        />
      )}
    </div>
  );
}

/** Both disclosed windows and editable result intervals use the existing result-clock fields. */
function RewriteIntervalFields({
  value,
  bounds,
  onChange,
}: {
  value: { start: number; end: number };
  bounds: { start: number; end: number };
  onChange(change: Partial<{ start: number; end: number }>): void;
}) {
  const fields = [
    {
      key: 'start' as const,
      label: 'gallery.videoReview.selectionStart' as const,
      value: value.start,
      min: bounds.start,
      max: value.end,
    },
    {
      key: 'end' as const,
      label: 'gallery.videoReview.selectionEnd' as const,
      value: value.end,
      min: value.start,
      max: bounds.end,
    },
  ];
  return fields.map(({ key, label, ...field }) => (
    <ReviewPreviewNumberRow
      key={key}
      label={translate(label)}
      unit="s"
      step={0.1}
      {...field}
      onChange={(number) => onChange({ [key]: number })}
    />
  ));
}
