import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { useEffect, useRef, useState } from 'react';
import { ReviewNumberRow } from './number-row';
import { SpeechProfileFields } from './speech-profile';
import { PhraseRow } from './speech-phrase';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import { formatNumber, translate } from '../../platform/i18n';
import { ReviewDetails, ReviewButton, reviewTextButtonClassName } from './controls';
import { useReviewSpeech } from './use-speech';

type Controller = ReturnType<typeof useReviewSpeech>;
type Props = Parameters<typeof useReviewSpeech>[0] & {
  tempo?: number;
  selectedReplacementId?: string | undefined;
  originalSpeechEnabled?: boolean;
  onToggleOriginalSpeech?(enabled: boolean): void;
};
const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;

/** One speech editor serves explicit original and recorded voiceover targets. */
export function ReviewSpeechPanel(props: Props) {
  const speech = useReviewSpeech(props);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = Array.from(
      section.current?.querySelectorAll<HTMLElement>('[data-speech-replacement-id]') ?? []
    ).find((entry) => entry.dataset['speechReplacementId'] === props.selectedReplacementId);
    node?.scrollIntoView({ block: 'nearest' });
  }, [props.selectedReplacementId]);
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
      initiallyOpen={props.target.kind === 'original'}
    >
      <section
        ref={section}
        className="min-w-0 space-y-3"
        data-ui="gallery.videoReview.speechPanel"
        onKeyDown={(event) => event.stopPropagation()}
      >
        {props.target.kind === 'original' ? (
          <p className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.audioOriginal')} ·{' '}
            {formatNumber(speech.recognitionDuration, {
              style: 'unit',
              unit: 'second',
              unitDisplay: 'short',
              maximumFractionDigits: 2,
            })}
            {props.selection ? (
              <>
                {' '}
                · {translate('gallery.videoReview.speechSelectionDuration')}:{' '}
                {formatNumber(speech.selectionDuration, {
                  style: 'unit',
                  unit: 'second',
                  unitDisplay: 'short',
                  maximumFractionDigits: 2,
                })}
              </>
            ) : null}
          </p>
        ) : null}
        <SpeechProfileFields speech={speech} />
        {speech.profile &&
        speech.catalogs &&
        !speech.catalogs.speech.models.some((entry) => entry.id === speech.profile?.modelId) ? (
          <p role="status">{translate('gallery.videoReview.speechMissingModel')}</p>
        ) : null}
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.speechDisclosure')}
        </p>
        <SpeechRecognitionActions speech={speech} busy={busy} />
        {props.sourceAudioAvailable === false ? (
          <p role="status" className="text-xs">
            {translate('gallery.videoReview.speechNoSourceAudio')}
          </p>
        ) : null}
        <SpeechFeedback speech={speech} />
        {props.target.kind === 'original' ? (
          <OriginalSpeechControls
            speech={speech}
            enabled={props.originalSpeechEnabled}
            onToggle={props.onToggleOriginalSpeech}
          />
        ) : null}
        {speech.transcript.phrases.length ? (
          <>
            <p className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.speechOriginalWaveform')}
            </p>
            <ReviewButton
              label={translate('gallery.videoReview.speechSelectAll')}
              className={buttonClass}
              onClick={() =>
                setSelected(
                  selectedIds.length === speech.transcript.phrases.length
                    ? []
                    : speech.transcript.phrases.map((phrase) => phrase.id)
                )
              }
            >
              {translate(
                selectedIds.length === speech.transcript.phrases.length
                  ? 'gallery.videoReview.speechDeselectAll'
                  : 'gallery.videoReview.speechSelectAll'
              )}
            </ReviewButton>
            <SpeechBatchActions speech={speech} selectedIds={selectedIds} busy={busy} />
          </>
        ) : (
          <p className="text-xs">{translate('gallery.videoReview.speechEmpty')}</p>
        )}
        {speech.transcript.phrases.map((phrase, index) => (
          <PhraseRow
            key={phrase.id}
            phrase={phrase}
            resultInterval={
              props.target.kind === 'original'
                ? speech.resultInterval(phrase.start, phrase.end)
                : undefined
            }
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
    timeout: 'gallery.videoReview.speechInterrupted',
    cancelled: 'gallery.videoReview.speechCanceled',
    'provider-auth': 'gallery.videoReview.speechProviderAuth',
    'provider-rate-limit': 'gallery.videoReview.speechProviderRateLimit',
    'provider-request': 'gallery.videoReview.speechProviderRequest',
    'provider-not-found': 'gallery.videoReview.speechProviderNotFound',
    'provider-failed': 'gallery.videoReview.speechProviderFailed',
    'network-failed': 'gallery.videoReview.speechNetworkFailed',
    'permission-denied': 'gallery.videoReview.speechPermissionDenied',
    'model-unavailable': 'gallery.videoReview.speechModelUnavailable',
    'secret-unavailable': 'gallery.videoReview.speechSecretUnavailable',
    'invalid-response': 'gallery.videoReview.speechInvalidResponse',
    'storage-failed': 'gallery.videoReview.speechStorageFailed',
    'decode-failed': 'gallery.videoReview.speechDecodeFailed',
    unauthorized: 'gallery.videoReview.speechUnauthorized',
    'invalid-request': 'gallery.videoReview.speechInvalidRequest',
    'too-large': 'gallery.videoReview.speechTooLarge',
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

function OriginalSpeechControls({
  speech,
  enabled,
  onToggle,
}: {
  speech: Controller;
  enabled: boolean | undefined;
  onToggle: ((enabled: boolean) => void) | undefined;
}) {
  const busy = speech.running || speech.saving || speech.dirty;
  return (
    <div className="space-y-3 border-t border-[var(--sniptale-color-border-soft)] pt-3">
      <ReviewNumberRow
        disabled={busy}
        label={translate('gallery.videoReview.speechOriginalUnderNew')}
        unit="%"
        min={0}
        max={100}
        step={1}
        precision={0}
        value={speech.originalVolume * 100}
        onChange={(value) => speech.setOriginalVolume(value / 100)}
      />
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.speechOriginalMixHint')}
      </p>
      {speech.transcript.replacements.length ? (
        <>
          {onToggle ? (
            <ReviewButton
              label={translate('gallery.videoReview.speechRevoice')}
              className={buttonClass}
              aria-pressed={enabled !== false}
              disabled={busy}
              onClick={() => onToggle(enabled === false)}
            >
              {translate(
                enabled === false
                  ? 'gallery.videoReview.speechEnableRevoice'
                  : 'gallery.videoReview.speechDisableRevoice'
              )}
            </ReviewButton>
          ) : null}
          {speech.transcript.replacements.map((replacement) => (
            <article
              key={replacement.id}
              className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-2"
              data-speech-replacement-id={replacement.id}
            >
              <p className="text-xs">{replacement.text}</p>
              <div className="flex flex-wrap gap-1">
                <ReviewButton
                  className={buttonClass}
                  label={translate('gallery.videoReview.speechToggleReplacement')}
                  aria-pressed={'enabled' in replacement && replacement.enabled === true}
                  disabled={busy}
                  onClick={() =>
                    speech.patchReplacement(replacement.id, {
                      enabled: !('enabled' in replacement && replacement.enabled === true),
                    })
                  }
                >
                  {translate(
                    'enabled' in replacement && replacement.enabled === true
                      ? 'gallery.videoReview.speechDisableRevoice'
                      : 'gallery.videoReview.speechEnableRevoice'
                  )}
                </ReviewButton>
                <ReviewButton
                  className={buttonClass}
                  label={translate('gallery.videoReview.speechRestorePhrase')}
                  disabled={busy}
                  onClick={() => speech.restore([replacement.id])}
                >
                  {translate('gallery.videoReview.speechRestorePhrase')}
                </ReviewButton>
              </div>
              <ReviewNumberRow
                disabled={busy}
                label={translate('gallery.videoReview.speechOriginalUnderNew')}
                unit="%"
                min={0}
                max={100}
                step={1}
                precision={0}
                value={
                  'originalVolume' in replacement && typeof replacement.originalVolume === 'number'
                    ? replacement.originalVolume * 100
                    : 0
                }
                onChange={(value) =>
                  speech.patchReplacement(replacement.id, { originalVolume: value / 100 })
                }
              />
            </article>
          ))}
        </>
      ) : null}
    </div>
  );
}

function SpeechRecognitionActions({ speech, busy }: { speech: Controller; busy: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      <ReviewButton
        label={translate(
          speech.target.kind === 'original'
            ? 'gallery.videoReview.speechRecognizeAll'
            : 'gallery.videoReview.speechRecognize'
        )}
        className={buttonClass}
        disabled={
          busy ||
          speech.sourceAudioAvailable === false ||
          (speech.target.kind === 'original' && speech.recognitionDuration <= 0) ||
          !speech.catalogs?.transcription.models.some((model) => model.id === speech.modelId)
        }
        onClick={() => speech.recognize()}
      >
        {translate(
          speech.target.kind === 'original'
            ? 'gallery.videoReview.speechRecognizeAll'
            : 'gallery.videoReview.speechRecognize'
        )}
      </ReviewButton>
      {speech.target.kind === 'original' && speech.selection ? (
        <ReviewButton
          label={translate('gallery.videoReview.speechRecognizeSelection')}
          className={buttonClass}
          disabled={
            busy ||
            speech.sourceAudioAvailable === false ||
            speech.selectionDuration <= 0 ||
            !speech.catalogs?.transcription.models.some((model) => model.id === speech.modelId)
          }
          onClick={() => speech.recognize(true)}
        >
          {translate('gallery.videoReview.speechRecognizeSelection')}
        </ReviewButton>
      ) : null}
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
  );
}
