import { getReviewAIProviderFailureKey } from './ai-provider-error';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { TextRewriteSettings } from '../../ui/video-text/rewrite/settings';
import { useReviewTextRewrite } from './use-text-rewrite';
import { TextRewriteProposal } from '../../ui/video-text/rewrite/proposal';
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
  const providerFailureKey = getReviewAIProviderFailureKey(operation.providerFailureReason);
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
      <TextRewriteSettings
        options={operation.options}
        catalog={operation.catalog}
        modelId={operation.modelId}
        locked={!!props.disabled || operation.running || !!preview}
        wholeDocument={props.wholeDocument}
        windowFallback={(preview?.context ?? operation.disclosure?.context)?.window}
        resultDuration={operation.resultDuration}
        catalogError={operation.catalogError}
        selectionPending={operation.selectionPending}
        selectionUnavailable={operation.selectionUnavailable}
        unavailableModelName={operation.unavailableModelName}
        selectionFailed={operation.selectionFailed}
        onOptionsChange={(change) => operation.setOptions((current) => ({ ...current, ...change }))}
        onModelChange={operation.setModelId}
        onReloadModels={operation.reloadModels}
      />
      <p className="text-xs">{translate('gallery.videoReview.textRewriteDisclosure')}</p>
      {!props.access.session.getSnapshot().autosaveEnabled ? (
        <p className="text-xs">{translate('gallery.videoReview.textVoiceSaveDisclosure')}</p>
      ) : null}
      {error && (
        <p role="alert" className="text-xs">
          {providerFailureKey
            ? translate(providerFailureKey)
            : label(error in errors ? (error as keyof typeof errors) : 'failed')}
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
            disabled={
              !!props.disabled ||
              !operation.disclosure ||
              !operation.modelId ||
              operation.selectionPending
            }
            onClick={operation.start}
          >
            {translate('gallery.videoReview.textRewriteStart')}
          </ReviewButton>
        )
      )}
      {preview?.proposal && (
        <TextRewriteProposal
          context={preview.context}
          proposal={preview.proposal}
          running={operation.running}
          accepted={operation.accepted}
          receiptMode={preview.receiptMode}
          disabled={props.disabled}
          onEdit={operation.edit}
          onApply={operation.apply}
          onDiscard={operation.discard}
        />
      )}
    </section>
  );
}
