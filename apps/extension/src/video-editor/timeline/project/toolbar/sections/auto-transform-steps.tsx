import { ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ArrowLeft, ArrowRight, Check, Eye } from 'lucide-react';
import type { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n';
import type { AutoProcessingPreview } from '../../../../project/operations/auto-transform';

import { autoProcessingActionLabel } from './auto-transform-setup';

function reasonLabel(reason: string | null) {
  switch (reason) {
    case null:
      return translate('videoEditor.timeline.autoBlockedRange');
    case 'locked':
    case 'camera-locked':
      return translate('videoEditor.timeline.autoBlockedLocked');
    case 'missing-source':
      return translate('videoEditor.timeline.autoTransformUnavailable');
    case 'linked-timing':
      return translate('videoEditor.timeline.autoBlockedLinked');
    case 'overlap':
      return translate('videoEditor.timeline.autoBlockedOverlap');
    default:
      return translate('videoEditor.timeline.autoBlockedRange');
  }
}
export function AutoProcessingReview({
  analysis,
  preview,
  selectedIds,
  action,
  stale,
  selectionChanged,
  busy,
  seconds,
  onToggleSuggestion,
  onViewOriginal,
}: {
  analysis: AutoProcessingPreview | null;
  preview: AutoProcessingPreview | null;
  selectedIds: readonly string[];
  action: VideoAutoProcessingAction;
  stale: boolean;
  selectionChanged: boolean;
  busy: boolean;
  seconds: (value: number) => string;
  onToggleSuggestion: (id: string) => void;
  onViewOriginal: (start: number, end: number) => void;
}) {
  return (
    <>
      <div
        className="shrink-0 border-b border-[var(--sniptale-color-border-soft)] px-5 py-4"
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-6 text-xs text-[var(--sniptale-color-text-secondary)]">
          <span>
            {translate('videoEditor.timeline.autoSelected')}: {selectedIds.length}
          </span>
          <span>
            {translate('videoEditor.timeline.autoUnavailableCount')}:{' '}
            {analysis?.suggestions.filter((row) => row.status === 'blocked').length ?? 0}
          </span>
        </div>
        {preview?.status === 'ready' && !stale ? (
          <dl
            data-ui="video-editor.auto.preview"
            className="mt-3 flex items-center justify-between gap-6"
          >
            <div>
              <dt className="text-xs text-[var(--sniptale-color-text-secondary)]">
                {translate('videoEditor.timeline.autoProjectDuration')}
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-base font-medium tabular-nums">
                {seconds(preview.summary.beforeDuration)}
                <ArrowRight size={14} aria-hidden="true" />
                {seconds(preview.summary.afterDuration)}
              </dd>
            </div>
            <div className="text-right text-xs">
              <dt className="text-[var(--sniptale-color-text-secondary)]">
                {translate('videoEditor.timeline.autoShorterBy')}
              </dt>
              <dd className="mt-1 font-medium tabular-nums">
                {seconds(preview.summary.beforeDuration - preview.summary.afterDuration)}
              </dd>
            </div>
          </dl>
        ) : selectionChanged ? (
          <p className="mt-3 text-sm">{translate('videoEditor.timeline.autoSelectionChanged')}</p>
        ) : null}
      </div>
      {Object.values(analysis?.audio ?? {}).some((item) => item.status === 'unavailable') ? (
        <p role="status" className="px-5 py-3 text-xs leading-relaxed">
          {translate('videoEditor.timeline.autoAudioUnavailable')}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
        {analysis?.suggestions.map((row) => (
          <AutoProcessingSuggestionRow
            key={row.id}
            row={row}
            selectedIds={selectedIds}
            busy={busy}
            preview={preview}
            action={action}
            seconds={seconds}
            onToggleSuggestion={onToggleSuggestion}
            onViewOriginal={onViewOriginal}
          />
        ))}
        {!analysis?.suggestions.length ? (
          <p className="py-8 text-center text-sm text-[var(--sniptale-color-text-secondary)]">
            {translate('videoEditor.timeline.autoNoChanges')}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function AutoProcessingFooter({
  step,
  busy,
  applying,
  selectionChanged,
  stale,
  preview,
  selectedCount,
  hasScope,
  onBack,
  close,
  prepare,
  apply,
}: {
  step: 'setup' | 'review';
  busy: boolean;
  applying: boolean;
  selectionChanged: boolean;
  stale: boolean;
  preview: AutoProcessingPreview | null;
  selectedCount: number;
  hasScope: boolean;
  onBack: () => void;
  close: () => void;
  prepare: () => Promise<void>;
  apply: () => Promise<void>;
}) {
  return (
    <ProductModalFooter compact className="shrink-0">
      {step === 'review' ? (
        <ProductActionButton
          compact
          tone="secondary"
          data-ui="video-editor.auto.back"
          disabled={busy}
          onClick={onBack}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {translate('videoEditor.timeline.autoBack')}
        </ProductActionButton>
      ) : null}
      <span className="mr-auto text-xs text-[var(--sniptale-color-text-secondary)]">
        {step === 'review' && preview?.status === 'ready'
          ? translate('videoEditor.timeline.autoOneUndo')
          : ''}
      </span>
      <ProductActionButton compact tone="secondary" disabled={applying} onClick={close}>
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <AutoProcessingSubmitActions
        step={step}
        busy={busy}
        applying={applying}
        selectionChanged={selectionChanged}
        stale={stale}
        preview={preview}
        selectedCount={selectedCount}
        hasScope={hasScope}
        prepare={prepare}
        apply={apply}
      />
    </ProductModalFooter>
  );
}

function AutoProcessingSubmitActions({
  step,
  busy,
  applying,
  selectionChanged,
  stale,
  preview,
  selectedCount,
  hasScope,
  prepare,
  apply,
}: Pick<
  React.ComponentProps<typeof AutoProcessingFooter>,
  | 'step'
  | 'busy'
  | 'applying'
  | 'selectionChanged'
  | 'stale'
  | 'preview'
  | 'selectedCount'
  | 'hasScope'
  | 'prepare'
  | 'apply'
>) {
  const canApply = !busy && !stale && preview?.status === 'ready' && preview.selectedIds.length > 0;
  const applyLabel = translate(
    applying ? 'videoEditor.timeline.autoApplying' : 'videoEditor.timeline.autoTransformApply'
  );
  const countLabel = applying ? '' : ` · ${preview?.selectedIds.length ?? selectedCount}`;
  return (
    <>
      {step === 'setup' || selectionChanged || stale ? (
        <ProductActionButton
          compact
          tone="primary"
          data-ui="video-editor.auto.review"
          disabled={busy || !hasScope}
          onClick={() => void prepare()}
        >
          {translate(busy ? 'videoEditor.timeline.autoWorking' : 'videoEditor.timeline.autoReview')}
          <ArrowRight size={14} aria-hidden="true" />
        </ProductActionButton>
      ) : null}
      {step === 'review' ? (
        <ProductActionButton
          compact
          tone="primary"
          data-ui="video-editor.auto.apply"
          disabled={!canApply}
          onClick={() => void apply()}
        >
          {applyLabel}
          {countLabel}
          <Check size={14} aria-hidden="true" className="text-[var(--sniptale-color-accent)]" />
        </ProductActionButton>
      ) : null}
    </>
  );
}

function AutoProcessingSuggestionRow({
  row,
  selectedIds,
  busy,
  preview,
  action,
  seconds,
  onToggleSuggestion,
  onViewOriginal,
}: {
  row: AutoProcessingPreview['suggestions'][number];
  selectedIds: readonly string[];
  busy: boolean;
  preview: AutoProcessingPreview | null;
  action: VideoAutoProcessingAction;
  seconds: (value: number) => string;
  onToggleSuggestion: (id: string) => void;
  onViewOriginal: (start: number, end: number) => void;
}) {
  return (
    <div
      data-ui="video-editor.auto.suggestion"
      data-status={row.status}
      data-clip-id={row.target.clipId}
      className={`flex items-center gap-4 border-b
border-[var(--sniptale-color-border-soft)] py-3 last:border-0`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 has-[:disabled]:cursor-default">
        <input
          type="checkbox"
          className="sniptale-checkbox sniptale-checkbox-sm mt-0.5 shrink-0"
          checked={selectedIds.includes(row.id)}
          disabled={busy || row.status !== 'available'}
          onChange={() => onToggleSuggestion(row.id)}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium" title={row.label}>
            {row.category ? (
              <>
                {translate(
                  row.category === 'typing'
                    ? 'videoEditor.timeline.autoTyping'
                    : 'videoEditor.timeline.autoIdleDetected'
                )}{' '}
                ·{' '}
              </>
            ) : null}
            {row.label}
          </span>
          <span className="mt-1 block text-xs tabular-nums text-[var(--sniptale-color-text-secondary)]">
            {seconds(row.startTime)}–{seconds(row.endTime)}
          </span>
          {row.status !== 'available' ? (
            <span className="mt-1 block text-xs text-[var(--sniptale-color-text-secondary)]">
              {row.status === 'unchanged'
                ? translate('videoEditor.timeline.autoNoChanges')
                : reasonLabel(row.reason)}
            </span>
          ) : null}
          {preview?.blockedId === row.id ? (
            <span role="alert" className="mt-1 block text-xs">
              {translate('videoEditor.timeline.autoBatchBlocked')}
            </span>
          ) : null}
        </span>
      </label>
      <div className="shrink-0 text-right text-xs">
        <p>
          {row.kind === 'camera'
            ? translate('videoEditor.timeline.autoFraming')
            : autoProcessingActionLabel(row.timing?.action ?? action)}
        </p>
        {row.kind === 'timing' ? (
          <p className="mt-1 tabular-nums text-[var(--sniptale-color-text-secondary)]">
            {seconds(row.beforeDuration)} → {seconds(row.afterDuration)}
          </p>
        ) : null}
      </div>
      <ProductActionButton
        compact
        tone="secondary"
        disabled={busy}
        title={translate('videoEditor.timeline.autoViewOriginal')}
        aria-label={`${translate('videoEditor.timeline.autoViewOriginal')}: ${row.label}`}
        onClick={() => onViewOriginal(row.startTime, row.endTime)}
      >
        <Eye size={14} aria-hidden="true" />
      </ProductActionButton>
    </div>
  );
}
