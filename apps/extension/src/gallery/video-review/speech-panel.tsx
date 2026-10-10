import { useRef, useState, type ReactNode } from 'react';
import { AudioLines, FileText, LoaderCircle } from 'lucide-react';
import { ProductField, ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { ReviewInspectorSections } from './inspector-sections';
import { ReviewPreviewNumberRow } from './number-row';
import { SpeechTranscriptionModelField } from './speech-profile';
import { ReviewTextPhrase } from './speech-phrase';
import { useReviewText } from './use-review-text';
import { useReviewRecognition, type ReviewRecognitionAccess } from './use-recognition';
import type { ReviewTextFragment } from '../../features/video/review/text-document';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewTextButtonClassName } from './controls';

type Props = ReviewRecognitionAccess & {
  sound?: (applying: boolean) => ReactNode;
  mainVideo?: HTMLVideoElement | undefined;
  resultTime?: number | undefined;
  onJump?(time: number): void;
  onSelectText?(id: string): void;
  onEnableAdvanced?(): void;
};
type Recognition = ReturnType<typeof useReviewRecognition>;
const buttonClass = reviewTextButtonClassName + ' !h-auto min-h-8! whitespace-normal text-left';

/** Original gain stays under the ordinary audio owner while recognition only proposes text. */
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
      sound={(applying) => (
        <ReviewPreviewNumberRow
          label={translate('gallery.videoReview.volume')}
          unit="%"
          min={0}
          max={200}
          step={1}
          precision={0}
          enterBehavior="blur"
          disabled={masterDisabled || applying}
          value={masterAudio.muted ? 0 : masterAudio.volume * 100}
          onChange={(value) => {
            if (!masterDisabled && !applying) onMasterVolumeChange(value / 100);
          }}
        />
      )}
    />
  );
}

/** Explicit source and selected voiceover commands share one canonical recognition workflow. */
export function ReviewSpeechPanel(props: Props) {
  const recognition = useReviewRecognition(props);
  const linkedTextId =
    props.target.kind === 'voiceover'
      ? recognition.snapshot.document.advancedContent.audio.voiceover.find(
          (clip) => props.target.kind === 'voiceover' && clip.id === props.target.clipId
        )?.textSnapshot?.textId
      : undefined;
  const related =
    recognition.snapshot.document.advancedContent.text?.fragments.filter(
      (fragment) =>
        fragment.id === linkedTextId ||
        (fragment.origin?.kind === props.target.kind &&
          (props.target.kind === 'original' || fragment.origin.clipId === props.target.clipId))
    ) ?? [];
  return (
    <section
      className="min-w-0 space-y-3"
      data-ui="gallery.videoReview.speechPanel"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ReviewInspectorSections
        sections={[
          ...(props.sound
            ? [
                {
                  id: 'audio',
                  label: translate('gallery.videoReview.volume'),
                  icon: AudioLines,
                  content: props.sound(recognition.applying),
                },
              ]
            : []),
          {
            id: 'recognition',
            label: translate('gallery.videoReview.recognitionTitle'),
            icon: FileText,
            content: (
              <div className="min-w-0 space-y-2">
                <RecognitionSettings recognition={recognition} access={props} />
                <RecognitionFeedback recognition={recognition} />
                {recognition.proposal && (
                  <RecognitionResult
                    key={recognition.proposal.job.id}
                    recognition={recognition}
                    access={props}
                  />
                )}
                {related.length > 0 && props.onSelectText && (
                  <RecognitionRelatedText
                    fragments={related}
                    onSelect={props.onSelectText}
                    disabled={recognition.running}
                  />
                )}
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}

/** Related authored and recognized text share the existing compact navigation controls. */
function RecognitionRelatedText(props: {
  fragments: readonly ReviewTextFragment[];
  onSelect(id: string): void;
  disabled: boolean;
}) {
  const [limit, setLimit] = useState(50);
  return (
    <div className="space-y-1">
      <p className="text-xs">{translate('gallery.videoReview.recognitionRelatedText')}</p>
      {props.fragments.slice(0, limit).map((fragment) => (
        <ReviewButton
          key={fragment.id}
          label={fragment.text}
          className={buttonClass}
          disabled={props.disabled}
          onClick={() => props.onSelect(fragment.id)}
        >
          <span className="block truncate">{fragment.text}</span>
        </ReviewButton>
      ))}
      {props.fragments.length > limit && (
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentMore')}
          className={buttonClass}
          onClick={() => setLimit((value) => value + 50)}
        >
          {translate('gallery.videoReview.textFragmentMore')}
        </ReviewButton>
      )}
    </div>
  );
}

/** Source disclosure stays independent of model/provider consent and never widens a lost selection. */
function recognitionSourceDisclosure(
  recognition: Pick<Recognition, 'selectionOnly' | 'selectionUnavailable'>,
  access: Pick<Props, 'target' | 'selection'>
) {
  return {
    selectable:
      access.target.kind === 'original' && !!(access.selection || recognition.selectionOnly),
    label: recognition.selectionUnavailable
      ? 'gallery.videoReview.recognitionSelectionMissing'
      : recognition.selectionOnly
        ? 'gallery.videoReview.recognitionScopeSelection'
        : 'gallery.videoReview.recognitionScopeAll',
  } as const;
}

/** Approval is bound to the displayed provider and captured model, never inferred from a changed selector. */
function RecognitionSettings({ recognition, access }: { recognition: Recognition; access: Props }) {
  const [consenting, setConsenting] = useState<string | null>(null);
  const approved = useRef(new Set<string>());
  const model = recognition.catalogs?.transcription.models.find(
    (entry) => entry.id === recognition.modelId
  );
  const provider = recognition.catalogs?.transcription.providers.find(
    (entry) => entry.id === model?.providerId
  );
  const disabled = recognition.running || !!consenting;
  const scope = recognitionSourceDisclosure(recognition, access);
  const label = translate(
    recognition.snapshot.autosaveEnabled
      ? 'gallery.videoReview.recognitionStart'
      : 'gallery.videoReview.recognitionSaveStart'
  );
  return (
    <div className="space-y-2">
      <fieldset disabled={disabled} className="min-w-0 space-y-2">
        <SpeechTranscriptionModelField speech={recognition} />
        <ProductField label={translate('gallery.videoReview.recognitionGrouping')}>
          <ProductSelect
            aria-label={translate('gallery.videoReview.recognitionGrouping')}
            value={recognition.grouping}
            options={[
              { value: 'sentences', label: translate('gallery.videoReview.recognitionSentences') },
              {
                value: 'sentences-pauses',
                label: translate('gallery.videoReview.recognitionPauses'),
              },
            ]}
            onChange={(value) => {
              if (value === 'sentences' || value === 'sentences-pauses')
                recognition.setGrouping(value);
            }}
          />
        </ProductField>
        {recognition.grouping === 'sentences-pauses' && (
          <p className="text-xs">{translate('gallery.videoReview.recognitionPauseHint')}</p>
        )}
        {scope.selectable && (
          <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
            <span>{translate('gallery.videoReview.recognitionSelection')}</span>
            <ProductGlassSwitch
              role="switch"
              aria-checked={recognition.selectionOnly}
              on={recognition.selectionOnly}
              onClick={() => recognition.setSelectionOnly(!recognition.selectionOnly)}
              aria-label={translate('gallery.videoReview.recognitionSelection')}
            />
          </div>
        )}
        <p className="text-xs">{translate(scope.label)}</p>
        {!recognition.snapshot.autosaveEnabled && (
          <p className="text-xs">{translate('gallery.videoReview.textVoiceSaveDisclosure')}</p>
        )}
        <div className="flex flex-wrap gap-1">
          <ReviewButton
            label={label}
            className={buttonClass}
            disabled={
              !model ||
              !provider ||
              access.sourceAudioAvailable === false ||
              recognition.selectionUnavailable
            }
            onClick={() => {
              if (!provider) return;
              if (approved.current.has(provider.id)) recognition.recognize(provider.id);
              else setConsenting(provider.id);
            }}
          >
            {label}
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.speechReloadModels')}
            className={buttonClass}
            onClick={() => {
              recognition.clearError();
              recognition.reloadModels();
            }}
          >
            {translate('gallery.videoReview.speechReloadModels')}
          </ReviewButton>
        </div>
      </fieldset>
      {consenting && provider && (
        <div className="space-y-2 rounded border border-[var(--sniptale-color-border-soft)] p-2 text-xs">
          <p>
            {translate('gallery.videoReview.speechConsentAudio').replace(
              '{provider}',
              provider.name
            )}{' '}
            · {model?.displayName}
          </p>
          <p>{translate('gallery.videoReview.recognitionHistoryDisclosure')}</p>
          <div className="flex flex-wrap gap-1">
            <ReviewButton
              label={translate('gallery.videoReview.speechConsentContinue')}
              className={buttonClass}
              disabled={
                consenting !== provider.id ||
                recognition.running ||
                recognition.selectionUnavailable
              }
              onClick={() => {
                if (consenting !== provider.id) return;
                approved.current.add(provider.id);
                setConsenting(null);
                recognition.recognize(provider.id);
              }}
            >
              {translate('gallery.videoReview.speechConsentContinue')}
            </ReviewButton>
            <ReviewButton
              label={translate('common.actions.cancel')}
              className={buttonClass}
              onClick={() => setConsenting(null)}
            >
              {translate('common.actions.cancel')}
            </ReviewButton>
          </div>
        </div>
      )}
    </div>
  );
}

function RecognitionFeedback({ recognition }: { recognition: Recognition }) {
  return (
    <>
      {recognition.running && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
          <LoaderCircle size={14} className="animate-spin" />
          {translate('gallery.videoReview.textVoiceWaiting').replace(
            '{seconds}',
            String(recognition.elapsed)
          )}
          <span>
            {recognition.completed} / {recognition.total}
          </span>
          {!recognition.applying && (
            <ReviewButton
              label={translate('common.actions.cancel')}
              className={buttonClass}
              onClick={recognition.cancel}
            >
              {translate('common.actions.cancel')}
            </ReviewButton>
          )}
        </div>
      )}
      {recognition.error && (
        <p role="alert" className="text-xs">
          {translate(
            recognition.error === 'selection'
              ? 'gallery.videoReview.recognitionSelectionMissing'
              : recognition.error === 'stale'
                ? 'gallery.videoReview.speechChanged'
                : recognition.error === 'model'
                  ? 'gallery.videoReview.speechMissingModel'
                  : 'gallery.videoReview.speechFailed'
          )}
        </p>
      )}
    </>
  );
}

/** Existing phrase editing mutates only the disposable proposal; one accordion keeps large results compact. */
function RecognitionResult({ recognition, access }: { recognition: Recognition; access: Props }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const editor = useReviewText({
    document: recognition.proposal?.document,
    setText: recognition.setText,
    sourceDuration: recognition.snapshot.snapshot.workspace.source.duration,
    edits: recognition.snapshot.document.edits,
    sourceTime: access.mainVideo?.currentTime ?? 0,
    select: () => undefined,
    seek: (time) => access.onJump?.(time),
    pause: () => access.mainVideo?.pause(),
  });
  const proposal = recognition.proposal;
  if (!proposal) return null;
  const busy = recognition.running || recognition.accepted || !!proposal.receipt;
  const applyLabel = translate(
    recognition.snapshot.autosaveEnabled
      ? 'gallery.videoReview.recognitionApply'
      : 'gallery.videoReview.recognitionSaveApply'
  );
  return (
    <section className="min-w-0 space-y-2" data-ui="gallery.videoReview.recognitionResult">
      <p className="text-xs">{translate('gallery.videoReview.recognitionPreviewHint')}</p>
      {editor.document.fragments.some((fragment) => fragment.alignment !== 'word') && (
        <p className="text-xs">{translate('gallery.videoReview.recognitionApproximate')}</p>
      )}
      {!editor.document.fragments.length && (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.recognitionEmpty')}
        </p>
      )}
      {editor.error && (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.textFragmentInvalid')}
        </p>
      )}
      {editor.document.fragments.slice(0, limit).map((fragment, index) => (
        <ReviewTextPhrase
          key={fragment.id}
          fragment={fragment}
          next={editor.document.fragments[index + 1]}
          editor={editor}
          expanded={expanded === fragment.id}
          index={index}
          busy={busy}
          limit={
            fragment.timeDomain === 'source'
              ? recognition.snapshot.snapshot.workspace.source.duration
              : editor.projection.resultDuration
          }
          onToggle={() => setExpanded((current) => (current === fragment.id ? null : fragment.id))}
          onJump={() => {
            access.mainVideo?.pause();
            access.onJump?.(editor.sourceInterval(fragment).start);
          }}
        />
      ))}
      {editor.document.fragments.length > limit && (
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentMore')}
          className={buttonClass}
          onClick={() => setLimit((current) => current + 50)}
        >
          {translate('gallery.videoReview.textFragmentMore')}
        </ReviewButton>
      )}
      {proposal.job.relatedIds.length > 0 && (
        <ProductField label={translate('gallery.videoReview.recognitionMode')}>
          <ProductSelect
            aria-label={translate('gallery.videoReview.recognitionMode')}
            value={recognition.mode}
            disabled={busy}
            options={[
              { value: 'add', label: translate('gallery.videoReview.recognitionAdd') },
              { value: 'replace', label: translate('gallery.videoReview.recognitionReplace') },
            ]}
            onChange={(value) => {
              if (value === 'add' || value === 'replace') recognition.setMode(value);
            }}
          />
        </ProductField>
      )}
      {recognition.mode === 'replace' && (
        <p className="text-xs">{translate('gallery.videoReview.recognitionReplaceHint')}</p>
      )}
      {proposal.receipt && !recognition.accepted && (
        <p className="text-xs">{translate('gallery.videoReview.recognitionReceiptHint')}</p>
      )}
      {recognition.accepted ? (
        <div className="space-y-1">
          <p role="status" className="text-xs">
            {translate('gallery.videoReview.recognitionAdded')}
          </p>
          {access.onEnableAdvanced && (
            <ReviewButton
              label={translate('gallery.videoReview.advancedEditing')}
              className={buttonClass}
              disabled={recognition.running}
              onClick={() => access.beforeAction(() => access.onEnableAdvanced?.())}
            >
              {translate('gallery.videoReview.advancedEditing')}
            </ReviewButton>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          <ReviewButton
            label={applyLabel}
            className={buttonClass}
            disabled={recognition.running || !editor.document.fragments.length}
            onClick={recognition.apply}
          >
            {applyLabel}
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.recognitionDiscard')}
            className={buttonClass}
            disabled={busy}
            onClick={recognition.discard}
          >
            {translate('gallery.videoReview.recognitionDiscard')}
          </ReviewButton>
        </div>
      )}
    </section>
  );
}
