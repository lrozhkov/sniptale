import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, FileText, Mic, Sparkles } from 'lucide-react';
import { ReviewInspectorSections } from './inspector-sections';
import { ReviewNumberRow, ReviewPreviewNumberRow } from './number-row';
import { SpeechProfileFields } from './speech-profile';
import { PhraseRow } from './speech-phrase';
import { SpeechBatchWorkspace } from './speech-batch';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { useReviewSpeech } from './use-speech';
import { sameReviewSpeechTarget } from '../../contracts/ai/audio';

type Controller = ReturnType<typeof useReviewSpeech>;
type Props = Parameters<typeof useReviewSpeech>[0] & {
  tempo?: number;
  sound?: ReactNode;
  mainVideo?: HTMLVideoElement | undefined;
  resultTime?: number | undefined;
  assetNames?: ReadonlyMap<string, { filename: string }> | undefined;
  onJump?(time: number): void;
  selectedReplacementId?: string | undefined;
  originalSpeechEnabled?: boolean;
  onToggleOriginalSpeech?(enabled: boolean): void;
};
const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;

/** Source gain composes with speech without changing the replacement's ducking control. */
export function ReviewOriginalSpeechPanel(
  props: Omit<Props, 'target' | 'sound'> & {
    masterAudio: { volume: number; muted: boolean };
    onMasterVolumeChange(volume: number): void;
    masterDisabled: boolean;
  }
) {
  const { masterAudio, onMasterVolumeChange, masterDisabled, ...speech } = props;
  return (
    <ReviewSpeechPanel
      {...speech}
      target={{ kind: 'original' }}
      sound={
        <ReviewPreviewNumberRow
          label={translate('gallery.videoReview.volume')}
          unit="%"
          min={0}
          max={200}
          step={1}
          precision={0}
          enterBehavior="blur"
          disabled={masterDisabled}
          value={masterAudio.muted ? 0 : masterAudio.volume * 100}
          onChange={(value) => onMasterVolumeChange(value / 100)}
        />
      }
    />
  );
}

/** One speech editor serves explicit original and recorded voiceover targets. */
export function ReviewSpeechPanel(props: Props) {
  const controller = useReviewSpeech(props);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState(false);
  const [active, setActive] = useState<string>();
  const approved = useRef(new Set<string>());
  const [request, setRequest] = useState<{ key: string; message: string; run(): void } | null>(
    null
  );
  const authorize = (operation: 'transcription' | 'speech', run: () => void) => {
    const catalog = controller.catalogs?.[operation];
    const modelId =
      operation === 'transcription' ? controller.modelId : controller.profile?.modelId;
    const model = catalog?.models.find((entry) => entry.id === modelId);
    if (!model) return;
    const provider = catalog?.providers.find((entry) => entry.id === model.providerId);
    const key = `${operation}:${model.providerId}`;
    if (approved.current.has(key)) {
      run();
      return;
    }
    const message = translate(
      operation === 'transcription'
        ? 'gallery.videoReview.speechConsentAudio'
        : 'gallery.videoReview.speechConsentText'
    ).replace('{provider}', provider?.name ?? model.displayName);
    setRequest({ key, message, run });
  };
  const speech: Controller = {
    ...controller,
    recognize: (selection) => authorize('transcription', () => controller.recognize(selection)),
    generate: (ids) => authorize('speech', () => controller.generate([...ids])),
    generateQueue: (selected) =>
      authorize('speech', () => controller.generateQueue(structuredClone([...selected]))),
  };
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = Array.from(
      section.current?.querySelectorAll<HTMLElement>('[data-speech-replacement-id]') ?? []
    ).find((entry) => entry.dataset['speechReplacementId'] === props.selectedReplacementId);
    node?.scrollIntoView({ block: 'nearest' });
  }, [props.selectedReplacementId]);
  const busy = speech.running || speech.saving || speech.dirty;
  return (
    <section
      ref={section}
      className="min-w-0 space-y-3"
      data-ui="gallery.videoReview.speechPanel"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <SpeechFeedback speech={speech} assetNames={props.assetNames} />
      <fieldset disabled={!!request} className="min-w-0">
        <ReviewInspectorSections
          sections={[
            ...(props.sound || props.target.kind === 'original'
              ? [
                  {
                    id: 'audio',
                    label: translate('gallery.videoReview.volume'),
                    icon: AudioLines,
                    content: (
                      <>
                        {props.sound}
                        {props.target.kind === 'original' && (
                          <OriginalSpeechControls
                            speech={speech}
                            enabled={props.originalSpeechEnabled}
                            onToggle={props.onToggleOriginalSpeech}
                          />
                        )}
                      </>
                    ),
                  },
                ]
              : []),
            {
              id: 'recognition',
              label: translate('gallery.videoReview.speechRecognition'),
              icon: Mic,
              content: (
                <>
                  <fieldset disabled={busy}>
                    <SpeechProfileFields speech={speech} operation="transcription" />
                  </fieldset>
                  <SpeechRecognitionActions speech={speech} busy={busy} />
                  {props.sourceAudioAvailable === false && (
                    <p role="status" className="text-xs">
                      {translate('gallery.videoReview.speechNoSourceAudio')}
                    </p>
                  )}
                </>
              ),
            },
            {
              id: 'text',
              label: translate('gallery.videoReview.speechTranscript'),
              icon: FileText,
              content: (
                <SpeechTranscript
                  speech={speech}
                  props={props}
                  selected={selected}
                  setSelected={setSelected}
                  batch={batch}
                  setBatch={setBatch}
                  active={active}
                  setActive={setActive}
                />
              ),
            },
            {
              id: 'synthesis',
              label: translate('gallery.videoReview.speechSynthesis'),
              icon: Sparkles,
              content: (
                <>
                  <fieldset disabled={busy}>
                    <SpeechProfileFields speech={speech} operation="speech" />
                  </fieldset>
                  {speech.profile &&
                    speech.catalogs &&
                    !speech.catalogs.speech.models.some(
                      (entry) => entry.id === speech.profile?.modelId
                    ) && <p role="status">{translate('gallery.videoReview.speechMissingModel')}</p>}
                </>
              ),
            },
          ]}
        />
      </fieldset>
      {request && (
        <ProductConfirmDialog
          title={translate('gallery.videoReview.speechConsentTitle')}
          message={request.message}
          confirmText={translate('gallery.videoReview.speechConsentContinue')}
          cancelText={translate('common.actions.cancel')}
          onConfirm={() => {
            approved.current.add(request.key);
            setRequest(null);
            request.run();
          }}
          onCancel={() => setRequest(null)}
        />
      )}
    </section>
  );
}

function SpeechTranscript({
  speech,
  props,
  selected,
  setSelected,
  batch,
  setBatch,
  active,
  setActive,
}: {
  speech: Controller;
  props: Props;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  batch: boolean;
  setBatch: React.Dispatch<React.SetStateAction<boolean>>;
  active: string | undefined;
  setActive: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
  const phrases = speech.transcript.phrases;
  const opened = phrases.find((phrase) => phrase.id === active)?.id ?? phrases[0]?.id;
  const busy = speech.running || speech.saving || speech.dirty;
  const total = speech.groups.reduce((count, group) => count + group.transcript.phrases.length, 0);
  const choosing = batch && total > 1;
  const nativePlayhead =
    props.resultTime === undefined ? null : speech.nativeTimeAtResult(props.resultTime);
  return (
    <div className="min-w-0 space-y-3">
      {total > 1 && (
        <ReviewButton
          label={translate(
            choosing ? 'gallery.videoReview.speechBatchDone' : 'gallery.videoReview.speechBatch'
          )}
          className={buttonClass}
          data-speech-batch="toggle"
          onClick={() => setBatch(!batch)}
        >
          {translate(
            choosing ? 'gallery.videoReview.speechBatchDone' : 'gallery.videoReview.speechBatch'
          )}
        </ReviewButton>
      )}
      {choosing && (
        <SpeechBatchWorkspace
          speech={speech}
          selected={selected}
          onSelect={setSelected}
          mainVideo={props.mainVideo}
          assetNames={props.assetNames}
        />
      )}
      {!phrases.length && <p className="text-xs">{translate('gallery.videoReview.speechEmpty')}</p>}
      {!choosing &&
        phrases.map((phrase, index) => {
          const resultInterval = speech.resultInterval(phrase.start, phrase.end);
          return (
            <PhraseRow
              key={phrase.id}
              phrase={phrase}
              index={index}
              expanded={opened === phrase.id}
              resultInterval={resultInterval}
              nativePlayhead={nativePlayhead}
              bounds={{
                start: phrases[index - 1]?.end ?? speech.nativeBounds?.start ?? phrase.start,
                end: phrases[index + 1]?.start ?? speech.nativeBounds?.end ?? phrase.end,
              }}
              next={phrases[index + 1]}
              speech={speech}
              tempo={props.tempo ?? 1}
              mainVideo={props.mainVideo}
              selected={false}
              onToggle={() => setActive(phrase.id)}
              {...(props.onJump && resultInterval
                ? { onJump: () => props.onJump?.(resultInterval.start) }
                : {})}
              onSelect={() =>
                setSelected((current) =>
                  current.includes(phrase.id)
                    ? current.filter((id) => id !== phrase.id)
                    : [...current, phrase.id]
                )
              }
            />
          );
        })}
      {!choosing && !!speech.transcript.replacements.length && (
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
      )}
    </div>
  );
}

function SpeechFeedback({
  speech,
  assetNames,
}: {
  speech: Controller;
  assetNames?: Props['assetNames'];
}) {
  const [discarding, setDiscarding] = useState(false);
  const currentGroup = speech.queueProgress
    ? speech.groups.find((group) =>
        sameReviewSpeechTarget(group.target, speech.queueProgress!.current.target)
      )
    : undefined;
  const currentName = currentGroup
    ? (assetNames?.get(currentGroup.assetId)?.filename ??
      translate(
        currentGroup.target.kind === 'original'
          ? 'gallery.videoReview.audioOriginal'
          : 'gallery.videoReview.audioVoiceover'
      ))
    : '';
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
      {(speech.running ||
        speech.saving ||
        speech.dirty ||
        (speech.queueProgress?.total ?? 0) > 1) && (
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <p role="status" className="min-w-0 flex-1">
            {speech.queueProgress && speech.queueProgress.total > 1
              ? translate('gallery.videoReview.speechQueueProgress')
                  .replace('{completed}', String(speech.queueProgress.completed))
                  .replace('{total}', String(speech.queueProgress.total)) +
                (speech.running && currentName ? ` · ${currentName}` : '')
              : translate(
                  speech.running
                    ? 'gallery.videoReview.speechWorking'
                    : speech.saving || speech.dirty
                      ? 'gallery.videoReview.speechSaving'
                      : 'gallery.videoReview.speechSaved'
                )}
          </p>
          {speech.running && (
            <ReviewButton
              label={translate('common.actions.cancel')}
              className={reviewTextButtonClassName}
              onClick={speech.cancel}
            />
          )}
        </div>
      )}
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
    </div>
  );
}
