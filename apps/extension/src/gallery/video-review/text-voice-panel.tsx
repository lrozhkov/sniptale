import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { SegmentedRow, ToggleField } from '../../ui/compact-inspector-controls';
import { ReviewTextVoiceRecording } from './text-voice-recording';
import { ReviewTextVoiceGallery } from './text-voice-gallery';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import { useReviewTextVoiceOperation, type ReviewTextVoiceAccess } from './use-text-voice';
import { SpeechProfileFields } from './speech-profile';
import { useReviewSpeechCatalog } from './use-speech';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { formatNumber, translate, useAppLocale } from '../../platform/i18n';

type Props = {
  access: ReviewTextVoiceAccess;
  ids: readonly string[];
  recordingMaximum?: number | undefined;
  onClose(): void;
  disabled?: boolean | undefined;
};
const textVoiceErrors = {
  duration: 'gallery.videoReview.textVoiceProjectLimit',
  stale: 'gallery.videoReview.speechChanged',
  model: 'gallery.videoReview.speechMissingModel',
  failed: 'gallery.videoReview.speechFailed',
} as const;
const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;
type VoiceSource = 'ai' | 'microphone' | 'gallery';
const sourceLabel = {
  ai: 'gallery.videoReview.textVoiceAI',
  microphone: 'gallery.videoReview.textVoiceMicrophone',
  gallery: 'gallery.videoReview.textVoiceGallery',
} as const;

/** Authored AI operation occupies the current inspector context and reuses the existing voice fields. */
export function ReviewTextVoiceForm(props: Props) {
  const operation = useReviewTextVoiceOperation(props);
  const [source, setSource] = useState<VoiceSource>('ai');
  const navigate = (action: () => void) =>
    props.access.context ? props.access.context.beforeAction(action) : action();
  return (
    <section
      data-ui="gallery.videoReview.textVoice"
      className="min-w-0 space-y-2"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <ReviewButton
          autoFocus
          label={translate('gallery.videoReview.textVoiceBack')}
          className={buttonClass}
          onClick={() => navigate(props.onClose)}
        >
          <ArrowLeft size={14} />
        </ReviewButton>
        <span className="text-xs font-medium">
          {translate('gallery.videoReview.speechSynthesis')}
        </span>
      </div>
      {props.ids.length > 1 ? (
        <p className="text-xs">
          {translate('gallery.videoReview.textVoiceScope').replace(
            '{count}',
            String(props.ids.length)
          )}
        </p>
      ) : null}
      {!props.access.session.getSnapshot().autosaveEnabled && (
        <p className="text-xs">{translate('gallery.videoReview.textVoiceSaveDisclosure')}</p>
      )}
      <SegmentedRow
        value={source}
        ariaLabel={translate('gallery.videoReview.textVoiceSource')}
        columns={3}
        options={(['ai', 'microphone', 'gallery'] as const).map((id) => ({
          value: id,
          label: translate(sourceLabel[id]),
          disabled:
            !!props.disabled ||
            operation.running ||
            (id !== 'ai' && props.ids.length !== 1) ||
            (id === 'microphone' && !props.access.context),
        }))}
        onChange={(next) =>
          navigate(() => {
            operation.clearError();
            setSource(next);
          })
        }
      />
      {props.ids.length !== 1 && (
        <p className="text-xs">{translate('gallery.videoReview.textVoiceLocalSingle')}</p>
      )}
      <ToggleField
        label={translate('gallery.videoReview.textVoiceMuteSource')}
        value={operation.muteSource}
        disabled={
          props.disabled ||
          operation.running ||
          operation.pendingApplyIds.length > 0 ||
          (!props.access.sourceAudioAvailable?.() && !operation.muteSource)
        }
        onChange={operation.setMuteSource}
      />
      {!props.access.sourceAudioAvailable?.() && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.textVoiceMuteUnavailable')}
        </p>
      )}
      <div hidden={source !== 'ai'}>
        <TextVoiceSettings
          count={props.ids.length}
          operation={operation}
          disabled={props.disabled || source !== 'ai' || operation.pendingApplyIds.length > 0}
          autosaveEnabled={props.access.session.getSnapshot().autosaveEnabled}
        />
      </div>
      {source === 'microphone' && (
        <ReviewTextVoiceRecording
          access={props.access}
          fragmentId={props.ids[0]!}
          operation={operation}
          maximum={props.recordingMaximum}
          disabled={props.disabled}
        />
      )}
      {source === 'gallery' && (
        <ReviewTextVoiceGallery operation={operation} disabled={props.disabled} />
      )}
      {operation.running && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
          <LoaderCircle size={14} className="animate-spin" />
          {translate('gallery.videoReview.textVoiceWaiting').replace(
            '{seconds}',
            String(operation.elapsed)
          )}
          <span>
            {operation.completed} / {operation.total}
          </span>
          <ReviewButton
            label={translate('common.actions.cancel')}
            className={buttonClass}
            onClick={operation.cancel}
          >
            {translate('common.actions.cancel')}
          </ReviewButton>
        </div>
      )}
      {operation.error && (operation.error !== 'model' || source === 'ai') && (
        <p role="alert" className="text-xs">
          {translate(textVoiceErrors[operation.error])}
        </p>
      )}
      <TextVoiceResults operation={operation} disabled={props.disabled} source={source} />
    </section>
  );
}

/** Model/profile discovery can change without restarting the disposable take operation. */
function useTextVoiceProfile(onError: () => void) {
  const [modelId, setModelId] = useState('');
  const { catalogs, reloadModels } = useReviewSpeechCatalog(setModelId, onError);
  const [profile, setProfile] = useState<ReviewSpeechProfile>();
  const model = catalogs?.speech.models.find((entry) => entry.id === profile?.modelId);
  const provider = catalogs?.speech.providers.find((entry) => entry.id === model?.providerId);
  useEffect(() => {
    if (profile || !catalogs) return;
    const preferred = catalogs.speech.models.find(
      (entry) => entry.id === catalogs.speech.defaultModelId
    );
    const selected = preferred?.audio?.speech
      ? preferred
      : catalogs.speech.models.find((entry) => entry.audio?.speech);
    if (selected?.audio?.speech) setProfile({ modelId: selected.id, ...selected.audio.speech });
  }, [catalogs, profile]);
  return { catalogs, reloadModels, profile, setProfile, modelId, setModelId, provider, model };
}

type VoiceOperation = ReturnType<typeof useReviewTextVoiceOperation>;

/** Consent owns admission to the selected provider; it never saves on model selection. */
function TextVoiceSettings(props: {
  count: number;
  operation: VoiceOperation;
  disabled?: boolean | undefined;
  autosaveEnabled: boolean;
}) {
  const settings = useTextVoiceProfile(props.operation.modelError);
  const [consenting, setConsenting] = useState(false);
  const approved = useRef(new Set<string>());
  const { profile, provider, model } = settings;
  const start = () => {
    if (!profile || !provider || props.disabled) return;
    if (approved.current.has(provider.id)) props.operation.generate(profile, provider.id);
    else setConsenting(true);
  };
  return (
    <>
      <TextVoiceParameters {...props} settings={settings} consenting={consenting} start={start} />
      {consenting && provider && profile && (
        <TextVoiceConsent
          providerName={provider.name}
          modelName={model?.displayName}
          instructions={!!profile.instructions}
          disabled={props.disabled}
          onCancel={() => setConsenting(false)}
          onContinue={() => {
            approved.current.add(provider.id);
            setConsenting(false);
            props.operation.generate(profile, provider.id);
          }}
        />
      )}
    </>
  );
}

/** Existing voice selectors expose only capabilities of the chosen model. */
function TextVoiceParameters(props: {
  count: number;
  operation: VoiceOperation;
  settings: ReturnType<typeof useTextVoiceProfile>;
  disabled?: boolean | undefined;
  autosaveEnabled: boolean;
  consenting: boolean;
  start(): void;
}) {
  const { operation, settings } = props;
  const startLabel = translate(
    props.autosaveEnabled
      ? props.count === 1
        ? 'gallery.videoReview.speechGenerate'
        : 'gallery.videoReview.speechGenerateSelected'
      : 'gallery.videoReview.textVoiceSaveStart'
  );
  return (
    <fieldset
      disabled={props.disabled || operation.running || props.consenting}
      className="min-w-0 space-y-2"
    >
      <SpeechProfileFields
        speech={{
          catalogs: settings.catalogs,
          modelId: settings.modelId,
          setModelId: settings.setModelId,
          profile: settings.profile,
          changeProfile: (profile) => {
            operation.changeProfile(profile);
            settings.setProfile(profile);
          },
        }}
        operation="speech"
        onOpenModels={() => {
          operation.clearError();
          settings.reloadModels();
        }}
      />
      {!settings.catalogs && !operation.error && (
        <LoaderCircle
          className="animate-spin"
          size={14}
          aria-label={translate('common.states.loading')}
        />
      )}
      {!settings.catalogs?.speech.models.length ? (
        <ReviewButton
          label={translate('gallery.videoReview.speechReloadModels')}
          className={buttonClass}
          onClick={() => {
            operation.clearError();
            settings.reloadModels();
          }}
        >
          {translate('gallery.videoReview.speechReloadModels')}
        </ReviewButton>
      ) : null}
      <div className="review-recognition-commands border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <ReviewButton
          primary
          label={startLabel}
          className="!h-auto min-h-8! whitespace-normal text-left"
          disabled={!settings.profile || !settings.provider || operation.remaining === 0}
          onClick={props.start}
        >
          {startLabel}
        </ReviewButton>
      </div>
    </fieldset>
  );
}

/** Provider disclosure changes independently of take playback and uses the current selected parameters. */
function TextVoiceConsent(props: {
  providerName: string;
  modelName: string | undefined;
  instructions: boolean;
  disabled?: boolean | undefined;
  onCancel(): void;
  onContinue(): void;
}) {
  return (
    <div className="space-y-2 rounded border border-[var(--sniptale-color-border-soft)] p-2 text-xs">
      <p>
        {translate('gallery.videoReview.speechConsentText').replace(
          '{provider}',
          props.providerName
        )}
      </p>
      <p>{props.modelName}</p>
      <p>
        {translate(
          props.instructions
            ? 'gallery.videoReview.textVoicePromptSent'
            : 'gallery.videoReview.textVoiceNoPrompt'
        )}
      </p>
      <p>{translate('gallery.videoReview.textVoiceHistoryDisclosure')}</p>
      <div className="flex flex-wrap gap-1">
        <ReviewButton
          label={translate('common.actions.cancel')}
          className={buttonClass}
          onClick={props.onCancel}
        >
          {translate('common.actions.cancel')}
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.speechConsentContinue')}
          className={buttonClass}
          disabled={props.disabled}
          onClick={props.onContinue}
        >
          {translate('gallery.videoReview.speechConsentContinue')}
        </ReviewButton>
      </div>
    </div>
  );
}

/** Paging bounds playback elements; acceptance always uses the whole ready proposal set. */
function TextVoiceResults({
  operation,
  disabled,
  source,
}: {
  operation: Pick<
    ReturnType<typeof useReviewTextVoiceOperation>,
    'previews' | 'accepted' | 'running' | 'apply' | 'pendingApplyIds'
  >;
  disabled?: boolean | undefined;
  source: VoiceSource;
}) {
  const locale = useAppLocale();
  const [limit, setLimit] = useState(50);
  const accepted = new Set(operation.accepted);
  const visible = operation.previews.filter(
    (preview) =>
      source !== 'microphone' ||
      preview.textSnapshot.kind !== 'microphone' ||
      accepted.has(preview.clipId)
  );
  const pending = visible.filter((preview) => !accepted.has(preview.clipId));
  return (
    <>
      {visible.slice(0, limit).map((preview) => (
        <div
          key={preview.clipId}
          className="min-w-0 space-y-1 rounded border border-[var(--sniptale-color-border-soft)] p-2 text-xs"
        >
          <p className="truncate">{preview.textSnapshot.text}</p>
          <p>
            {translate(sourceLabel[preview.textSnapshot.kind])} ·{' '}
            {translate('gallery.videoReview.textVoiceDuration').replace(
              '{duration}',
              formatNumber(preview.duration, { maximumFractionDigits: 2 }, locale)
            )}
          </p>
          <audio
            className="h-8 w-full"
            controls
            src={preview.url}
            aria-label={translate('gallery.videoReview.speechPreview')}
          />
          {accepted.has(preview.clipId) ? (
            <p>{translate('gallery.videoReview.textVoiceAccepted')}</p>
          ) : (
            <ReviewButton
              label={translate('gallery.videoReview.speechApply')}
              className={buttonClass}
              disabled={
                disabled ||
                operation.running ||
                (operation.pendingApplyIds.length > 0 &&
                  (operation.pendingApplyIds.length !== 1 ||
                    operation.pendingApplyIds[0] !== preview.clipId))
              }
              onClick={() => operation.apply([preview])}
            >
              {translate('gallery.videoReview.speechApply')}
            </ReviewButton>
          )}
        </div>
      ))}
      {visible.length > limit && (
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentMore')}
          className={buttonClass}
          onClick={() => setLimit((value) => value + 50)}
        >
          {translate('gallery.videoReview.textFragmentMore')}
        </ReviewButton>
      )}
      {pending.length > 1 && operation.pendingApplyIds.length !== 1 && (
        <ReviewButton
          label={translate('gallery.videoReview.speechApplySelected')}
          className={buttonClass}
          disabled={disabled || operation.running}
          onClick={() =>
            operation.apply(
              operation.pendingApplyIds.length
                ? pending.filter((preview) => operation.pendingApplyIds.includes(preview.clipId))
                : pending
            )
          }
        >
          {translate('gallery.videoReview.speechApplySelected')}
        </ReviewButton>
      )}
    </>
  );
}
