import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { ToggleField, SelectField, TextareaField } from '../../ui/compact-inspector-controls';
import { AIModelSelector } from '../../features/ai/model-selector';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { ReviewPreviewNumberRow } from './number-row';
import { useReviewTextRewrite } from './use-text-rewrite';
import { ReviewTextRewritePreview } from './text-rewrite-preview';
import type { ReviewTextVoiceAccess } from './use-text-voice';
import { translate } from '../../platform/i18n';

const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;
const errors = {
  stale: 'gallery.videoReview.speechChanged',
  'model-unavailable': 'gallery.videoReview.speechMissingModel',
  'too-large': 'gallery.videoReview.textRewriteBudget',
  invalid: 'gallery.videoReview.textRewriteInvalid',
  'invalid-response': 'gallery.videoReview.textRewriteInvalid',
  failed: 'gallery.videoReview.speechFailed',
} as const;

/** Uses the current inspector, existing fields and one disposable proposal, with no second dialog. */
export function ReviewTextRewriteForm(props: {
  access: ReviewTextVoiceAccess;
  ids: readonly string[];
  wholeDocument: boolean;
  onClose(): void;
  disabled?: boolean | undefined;
}) {
  const operation = useReviewTextRewrite(props);
  const { preview } = operation;
  const error = operation.error ?? operation.disclosureError;
  const label = (key: keyof typeof errors) => translate(errors[key]);
  return (
    <section
      data-ui="gallery.videoReview.textRewrite"
      className="min-w-0 sniptale-parameter-stack"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <ReviewButton
          autoFocus
          label={translate('gallery.videoReview.textVoiceBack')}
          className={buttonClass}
          disabled={operation.running}
          onClick={props.onClose}
        >
          <ArrowLeft size={14} />
        </ReviewButton>
        <span className="text-xs font-medium">
          {translate('gallery.videoReview.textRewriteTitle')}
        </span>
      </div>
      {props.wholeDocument || props.ids.length > 1 ? (
        <p className="text-xs">
          {translate(
            props.wholeDocument
              ? 'gallery.videoReview.textRewriteAllScope'
              : 'gallery.videoReview.textRewriteSelectedScope'
          ).replace('{count}', String(props.ids.length))}
        </p>
      ) : null}
      <RewriteSettings
        operation={operation}
        disabled={props.disabled}
        wholeDocument={props.wholeDocument}
      />
      <p className="text-xs">{translate('gallery.videoReview.textRewriteDisclosure')}</p>
      {!props.access.session.getSnapshot().autosaveEnabled ? (
        <p className="text-xs">{translate('gallery.videoReview.textVoiceSaveDisclosure')}</p>
      ) : null}
      {error && (
        <p role="alert" className="text-xs">
          {label(error in errors ? (error as keyof typeof errors) : 'failed')}
        </p>
      )}
      {operation.running ? (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
          <LoaderCircle size={14} className="animate-spin" />
          {translate('gallery.videoReview.textRewriteWaiting').replace(
            '{seconds}',
            String(operation.elapsed)
          )}
          {!operation.applying && (
            <ReviewButton
              label={translate('common.actions.cancel')}
              className={buttonClass}
              onClick={operation.cancel}
            >
              {translate('common.actions.cancel')}
            </ReviewButton>
          )}
        </div>
      ) : (
        !preview && (
          <ReviewButton
            label={translate('gallery.videoReview.textRewriteStart')}
            className={buttonClass}
            disabled={!!props.disabled || !operation.disclosure || !operation.modelId}
            onClick={operation.start}
          >
            {translate('gallery.videoReview.textRewriteStart')}
          </ReviewButton>
        )
      )}
      <ReviewTextRewritePreview operation={operation} disabled={props.disabled} />
    </section>
  );
}

type RewriteOperation = ReturnType<typeof useReviewTextRewrite>;

function RewriteSettings({
  operation,
  disabled,
  wholeDocument,
}: {
  operation: RewriteOperation;
  disabled?: boolean | undefined;
  wholeDocument: boolean;
}) {
  const { options, preview } = operation;
  const locked = !!disabled || operation.running || !!preview;
  const window = options.window ?? (preview?.context ?? operation.disclosure?.context)?.window;
  const patch = (change: Partial<typeof options>) =>
    operation.setOptions((current) => ({ ...current, ...change }));
  return (
    <fieldset disabled={locked} className="min-w-0 sniptale-parameter-stack">
      <InspectorParameterRow stacked label={translate('gallery.videoReview.textRewriteModel')}>
        {operation.catalog ? (
          <AIModelSelector
            models={operation.catalog.models}
            providers={operation.catalog.providers}
            onOpen={operation.reloadModels}
            selectedModelId={operation.modelId || null}
            onSelect={(id) => operation.setModelId(id ?? '')}
            disabled={locked}
          />
        ) : (
          !operation.error && (
            <span role="status" className="flex items-center gap-1 text-xs">
              <LoaderCircle size={14} className="animate-spin" />
              {translate('common.states.loading')}
            </span>
          )
        )}
      </InspectorParameterRow>
      {((!operation.catalog && operation.error) || operation.catalog?.models.length === 0) && (
        <ReviewButton
          label={translate('gallery.videoReview.speechReloadModels')}
          className={buttonClass}
          onClick={operation.reloadModels}
        >
          {translate('gallery.videoReview.speechReloadModels')}
        </ReviewButton>
      )}
      <TextareaField
        label={translate('gallery.videoReview.textRewritePrompt')}
        rows={3}
        value={options.prompt}
        maxLength={4_000}
        onChange={(prompt) => patch({ prompt })}
      />
      <SelectField
        label={translate('gallery.videoReview.textRewriteMode')}
        value={options.mode}
        options={[
          { value: 'phrases', label: translate('gallery.videoReview.textRewritePhrases') },
          { value: 'script', label: translate('gallery.videoReview.textRewriteScript') },
        ]}
        onChange={(mode: 'phrases' | 'script') => patch({ mode, resegment: false })}
      />
      <ToggleField
        label={translate('gallery.videoReview.textRewriteTiming')}
        value={options.changeIntervals}
        onChange={(changeIntervals) => patch({ changeIntervals, resegment: false })}
      />
      {options.changeIntervals && window && (
        <>
          <p className="text-xs">{translate('gallery.videoReview.textRewriteWindow')}</p>
          <ReviewPreviewNumberRow
            label={translate('gallery.videoReview.selectionStart')}
            unit="s"
            min={0}
            max={window.end}
            step={0.1}
            value={window.start}
            onChange={(start) => patch({ window: { start, end: window.end } })}
          />
          <ReviewPreviewNumberRow
            label={translate('gallery.videoReview.selectionEnd')}
            unit="s"
            min={window.start}
            max={operation.resultDuration}
            step={0.1}
            value={window.end}
            onChange={(end) => patch({ window: { start: window.start, end } })}
          />
        </>
      )}
      {wholeDocument && options.mode === 'script' && options.changeIntervals && (
        <ToggleField
          label={translate('gallery.videoReview.textRewriteStructure')}
          value={options.resegment}
          onChange={(resegment) => patch({ resegment })}
        />
      )}
    </fieldset>
  );
}
