import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { useState } from 'react';
import { SpeechProfileFields } from './speech-profile';
import { PhraseRow } from './speech-phrase';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import { translate } from '../../platform/i18n';
import { ReviewDetails, ReviewButton, reviewTextButtonClassName } from './controls';
import { useReviewSpeech } from './use-speech';

type Controller = ReturnType<typeof useReviewSpeech>;
type Props = Parameters<typeof useReviewSpeech>[0] & { tempo?: number };
const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;

/** Speech editing is available only for the selected existing voiceover clip. */
export function ReviewSpeechPanel(props: Props) {
  const speech = useReviewSpeech(props);
  const [selected, setSelected] = useState<string[]>([]);
  const busy = speech.running || speech.saving || speech.dirty;
  const selectedIds = selected.filter((id) =>
    speech.transcript.phrases.some((phrase) => phrase.id === id)
  );
  return (
    <ReviewDetails
      level="section"
      label={translate('gallery.videoReview.speechTitle')}
      preferenceId="gallery.videoReview.speech"
    >
      <section
        className="min-w-0 space-y-3"
        data-ui="gallery.videoReview.speechPanel"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <SpeechProfileFields speech={speech} />
        {speech.profile &&
        speech.catalogs &&
        !speech.catalogs.speech.models.some((entry) => entry.id === speech.profile?.modelId) ? (
          <p role="status">{translate('gallery.videoReview.speechMissingModel')}</p>
        ) : null}
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.speechDisclosure')}
        </p>
        <div className="flex flex-wrap gap-1">
          <ReviewButton
            label={translate('gallery.videoReview.speechRecognize')}
            className={buttonClass}
            disabled={
              busy ||
              !speech.catalogs?.transcription.models.some((model) => model.id === speech.modelId)
            }
            onClick={speech.recognize}
          >
            {translate('gallery.videoReview.speechRecognize')}
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.speechReloadModels')}
            className={buttonClass}
            disabled={speech.running}
            onClick={speech.reloadModels}
          >
            {translate('gallery.videoReview.speechReloadModels')}
          </ReviewButton>
          {speech.running ? (
            <ReviewButton
              label={translate('common.actions.cancel')}
              className={buttonClass}
              onClick={speech.cancel}
            >
              {translate('common.actions.cancel')}
            </ReviewButton>
          ) : null}
        </div>
        <SpeechFeedback speech={speech} />
        {speech.transcript.phrases.length ? (
          <>
            <p className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.speechOriginalWaveform')}
            </p>
            <SpeechBatchActions speech={speech} selectedIds={selectedIds} busy={busy} />
          </>
        ) : (
          <p className="text-xs">{translate('gallery.videoReview.speechEmpty')}</p>
        )}
        {speech.transcript.phrases.map((phrase, index) => (
          <PhraseRow
            key={phrase.id}
            phrase={phrase}
            next={speech.transcript.phrases[index + 1]}
            speech={speech}
            tempo={props.tempo ?? 1}
            selected={selectedIds.includes(phrase.id)}
            onSelect={() =>
              setSelected((current) =>
                current.includes(phrase.id)
                  ? current.filter((id) => id !== phrase.id)
                  : [...current, phrase.id]
              )
            }
          />
        ))}
        {speech.transcript.replacements.length ? (
          <ReviewButton
            label={translate('gallery.videoReview.speechRestore')}
            className={buttonClass}
            disabled={busy}
            onClick={() =>
              speech.restore(speech.transcript.replacements.map((replacement) => replacement.id))
            }
          >
            {translate('gallery.videoReview.speechRestore')}
          </ReviewButton>
        ) : null}
      </section>
    </ReviewDetails>
  );
}

function SpeechFeedback({ speech }: { speech: Controller }) {
  const [discarding, setDiscarding] = useState(false);
  const errorKey = {
    interrupted: 'gallery.videoReview.speechInterrupted',
    invalid: 'gallery.videoReview.speechInvalid',
    canceled: 'gallery.videoReview.speechCanceled',
    duration: 'gallery.videoReview.speechOverflow',
    'partial-replacement': 'gallery.videoReview.speechPartialReplacement',
    stale: 'gallery.videoReview.speechChanged',
    failed: 'gallery.videoReview.speechFailed',
  } as const;
  return (
    <>
      <p role="status" className="text-xs">
        {translate(
          speech.running
            ? 'gallery.videoReview.speechWorking'
            : speech.saving || speech.dirty
              ? 'gallery.videoReview.speechSaving'
              : 'gallery.videoReview.speechSaved'
        )}
      </p>
      {speech.error ? (
        <div role="alert" className="text-xs text-[var(--sniptale-color-danger-text)]">
          {translate(errorKey[speech.error])}
          {speech.dirty ? (
            <ReviewButton
              label={translate('gallery.videoReview.speechRetrySave')}
              className={buttonClass}
              onClick={speech.retrySave}
            >
              {translate('gallery.videoReview.speechRetrySave')}
            </ReviewButton>
          ) : null}
        </div>
      ) : null}
      {speech.dirty && !speech.saving ? (
        <ReviewButton
          label={translate('gallery.videoReview.speechDiscardDraft')}
          className={buttonClass}
          onClick={() => setDiscarding(true)}
        >
          {translate('gallery.videoReview.speechDiscardDraft')}
        </ReviewButton>
      ) : null}
      {discarding ? (
        <ProductConfirmDialog
          title={translate('gallery.videoReview.speechDiscardDraft')}
          message={translate('gallery.videoReview.speechDiscardConfirm')}
          confirmText={translate('gallery.videoReview.speechDiscardDraft')}
          cancelText={translate('common.actions.cancel')}
          onConfirm={() => {
            speech.discardDraft();
            setDiscarding(false);
          }}
          onCancel={() => setDiscarding(false)}
        />
      ) : null}
    </>
  );
}

function SpeechBatchActions({
  speech,
  selectedIds,
  busy,
}: {
  speech: Controller;
  selectedIds: string[];
  busy: boolean;
}) {
  const available =
    !!speech.profile &&
    !!parseReviewSpeechProfile(speech.profile) &&
    !!speech.catalogs?.speech.models.some((model) => model.id === speech.profile?.modelId);
  const selectedPreviews = speech.previews.filter((preview) =>
    selectedIds.includes(preview.replacement.phraseId)
  );
  const overflow = selectedPreviews.some(
    (preview) =>
      preview.replacement.duration > preview.replacement.end - preview.replacement.start + 1e-7
  );
  return (
    <div className="flex flex-wrap gap-1">
      <ReviewButton
        label={translate('gallery.videoReview.speechGenerateSelected')}
        className={buttonClass}
        disabled={busy || !available || !selectedIds.length}
        onClick={() => speech.generate(selectedIds)}
      >
        {translate('gallery.videoReview.speechGenerateSelected')}
      </ReviewButton>
      <ReviewButton
        label={translate('gallery.videoReview.speechGenerateChanged')}
        className={buttonClass}
        disabled={busy || !available}
        onClick={() =>
          speech.generate(
            speech.transcript.phrases
              .filter((phrase) => speech.isChanged(phrase.id))
              .map((phrase) => phrase.id)
          )
        }
      >
        {translate('gallery.videoReview.speechGenerateChanged')}
      </ReviewButton>
      <ReviewButton
        label={translate('gallery.videoReview.speechApplySelected')}
        className={buttonClass}
        disabled={
          busy ||
          overflow ||
          !selectedPreviews.length ||
          selectedPreviews.length !== selectedIds.length
        }
        onClick={() => speech.apply(selectedPreviews)}
      >
        {translate('gallery.videoReview.speechApplySelected')}
      </ReviewButton>
    </div>
  );
}
