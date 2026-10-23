import { useState } from 'react';
import { ProductSelect, type ProductSelectOption } from '@sniptale/ui/product-form-controls';
import { X } from 'lucide-react';
import type { ReviewTextContext, ReviewTextProposal } from '../../../contracts/ai/review-text';
import { TextareaField } from '../../compact-inspector-controls';
import { translate, formatNumber, useAppLocale } from '../../../platform/i18n';
import { TextRewriteButton, TextRewriteDetails, TextRewriteNumberRow } from './controls';

interface TextRewriteProposalProps {
  context: ReviewTextContext;
  proposal: ReviewTextProposal;
  running: boolean;
  accepted: boolean;
  receiptMode?: 'replace' | 'variant' | undefined;
  disabled?: boolean | undefined;
  onEdit(updater: (current: ReviewTextProposal) => ReviewTextProposal): void;
  onApply(mode: 'replace' | 'variant'): void;
  onDiscard(): void;
}

/** Disposable result editing and pagination do not own provider requests or durable Apply. */
export function TextRewriteProposal(props: TextRewriteProposalProps) {
  const [limit, setLimit] = useState(50);
  const locale = useAppLocale();
  const { context, proposal } = props;
  const number = (value: number) => formatNumber(value, { maximumFractionDigits: 2 }, locale);
  const seconds = translate('videoEditor.timeline.secondsSuffix');
  const sourceOptions = context.fragments.map((entry, index) => {
    const ranges = (entry.ranges ?? [entry])
      .map((range) => `${number(range.start)}–${number(range.end)}`)
      .join(', ');
    return {
      value: entry.id,
      label: `${number(index + 1)}. ${ranges} ${seconds} · ${entry.text.slice(0, 90)}`,
    };
  });
  return (
    <div data-ui="video.text-rewrite.proposal" className="min-w-0 sniptale-parameter-stack">
      <p className="text-xs">
        {translate('gallery.videoReview.textRewritePreview').replace(
          '{count}',
          String(proposal.fragments.length)
        )}
      </p>
      <p className="text-xs">{translate('gallery.videoReview.textRewriteTakeHint')}</p>
      <fieldset
        disabled={!!props.disabled || props.running || props.accepted || !!props.receiptMode}
        className="min-w-0 space-y-2"
      >
        {proposal.fragments.slice(0, limit).map((fragment, index) => (
          <RewriteProposalPhrase
            key={index}
            props={props}
            fragment={fragment}
            index={index}
            sourceOptions={sourceOptions}
          />
        ))}
      </fieldset>
      {proposal.fragments.length > limit && (
        <TextRewriteButton
          label={translate('gallery.videoReview.textFragmentMore')}

          onClick={() => setLimit((value) => value + 50)}
        >
          {translate('gallery.videoReview.textFragmentMore')}
        </TextRewriteButton>
      )}
      {props.accepted ? (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.textRewriteApplied')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          <TextRewriteButton
            label={translate('gallery.videoReview.textRewriteReplace')}

            disabled={!!props.disabled || props.running || props.receiptMode === 'variant'}
            onClick={() => props.onApply('replace')}
          >
            {translate('gallery.videoReview.textRewriteReplace')}
          </TextRewriteButton>
          <TextRewriteButton
            label={translate('gallery.videoReview.textRewriteVariant')}

            disabled={!!props.disabled || props.running || props.receiptMode === 'replace'}
            onClick={() => props.onApply('variant')}
          >
            {translate('gallery.videoReview.textRewriteVariant')}
          </TextRewriteButton>
        </div>
      )}
      <TextRewriteButton
        label={translate('gallery.videoReview.recognitionDiscard')}

        disabled={props.running}
        onClick={props.onDiscard}
      >
        {translate('gallery.videoReview.recognitionDiscard')}
      </TextRewriteButton>
    </div>
  );
}

function RewriteProposalPhrase({
  props,
  fragment,
  index,
  sourceOptions,
}: {
  props: TextRewriteProposalProps;
  fragment: ReviewTextProposal['fragments'][number];
  index: number;
  sourceOptions: ProductSelectOption[];
}) {
  const { context } = props;
  const locale = useAppLocale();
  const number = (value: number) => formatNumber(value, { maximumFractionDigits: 2 }, locale);
  return (
    <div className="min-w-0 space-y-1 rounded border border-[var(--sniptale-color-border)] p-2">
      <span className="text-xs tabular-nums">
        {number(index + 1)}.{' '}
        {fragment.start !== undefined && fragment.end !== undefined
          ? `${number(fragment.start)}–${number(fragment.end)} ${translate('videoEditor.timeline.secondsSuffix')}`
          : ''}
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
          props.onEdit((proposal) => ({
            ...proposal,
            fragments: proposal.fragments.map((entry, item) =>
              item === index ? { ...entry, text } : entry
            ),
          }))
        }
      />
      {context.changeIntervals && fragment.start !== undefined && fragment.end !== undefined && (
        <>
          <RewriteIntervalFields
            value={{ start: fragment.start, end: fragment.end }}
            bounds={context.window}
            onChange={(change) =>
              props.onEdit((proposal) => ({
                ...proposal,
                fragments: proposal.fragments.map((entry, item) =>
                  item === index ? { ...entry, ...change } : entry
                ),
              }))
            }
          />
        </>
      )}
      <TextRewriteDetails
        label={translate('gallery.videoReview.textRewriteBefore')}
        preferenceId={`text-rewrite-before-${index}`}
      >
        <p className="whitespace-pre-wrap text-xs">
          {fragment.fromIds
            .map((id) => context.fragments.find((entry) => entry.id === id)?.text)
            .join('\n')}
        </p>
      </TextRewriteDetails>
      {context.resegment && (
        <TextRewriteDetails
          label={translate('gallery.videoReview.textRewriteMapping')}
          preferenceId={`text-rewrite-mapping-${index}`}
        >
          <RewriteSourceMapping
            sourceOptions={sourceOptions}
            fromIds={fragment.fromIds}
            index={index}
            onChange={(fromIds) =>
              props.onEdit((proposal) => ({
                ...proposal,
                fragments: proposal.fragments.map((entry, item) =>
                  item === index ? { ...entry, fromIds } : entry
                ),
              }))
            }
          />
        </TextRewriteDetails>
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
          <TextRewriteButton
            label={label('textRewriteSourceRemove')}
            disabled={fromIds.length === 1}
            onClick={() => onChange(fromIds.filter((_, item) => item !== position))}
          >
            <X size={14} />
          </TextRewriteButton>
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
    <TextRewriteNumberRow
      key={key}
      label={translate(label)}
      unit="s"
      step={0.1}
      {...field}
      onChange={(number) => onChange({ [key]: number })}
    />
  ));
}
