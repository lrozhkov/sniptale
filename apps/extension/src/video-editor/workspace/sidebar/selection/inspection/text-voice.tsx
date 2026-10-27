import { getVideoAIProviderFailureKey } from './ai-provider-error';
import { OriginalAudioPlacementFields } from '../inputs/original-audio';
import { useVideoEditorPlaybackPort } from '../../../../runtime/controller/store';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, FolderOpen, LoaderCircle, Play, Square } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { formatNumber, translate, useAppLocale } from '../../../../../platform/i18n';
import { SpeechSynthesisProfileFields } from '../../../../../ui/video-text/speech/profile';
import { SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import type { VideoProjectTextVoiceController } from '../../../../runtime/session/text-voice';
import { InspectorActionButton } from '../shared/actions';
import { AudioRecordingDownloadButton } from '../../../../../composition/audio-recording/dialog/controls';
import { AudioLibrarySelection } from '../../../../../composition/audio-library/selection';
import { ProjectTextVoiceRecording } from './text-voice-recording';
import { NumberInput } from '../inputs/number';
import { ProjectTextVoiceBatch, projectVoiceItemText } from './text-voice-batch';

/** Montage supplies explicit result-clock placement independently of text source ranges. */
export function ProjectTextVoicePanel(props: {
  project: VideoProject;
  operation: VideoProjectTextVoiceController;
  onClose(): void;
}) {
  const { operation: op } = props;
  const { source } = op;
  const active = op.items.find(
    (item) => item.documentId === op.target?.documentId && item.fragmentId === op.target.fragmentId
  );
  const text = active ? projectVoiceItemText(props.project, active, op.consent) : '';
  const pending = op.items.filter((item) => item.selected && !item.preview && !item.accepted);
  const hasText =
    pending.length > 0 &&
    pending.every((item) => !!projectVoiceItemText(props.project, item, null).trim());
  const locked =
    op.running ||
    op.recording.session.isSaving ||
    op.items.some((item) => !!item.preview) ||
    !!op.consent;
  return (
    <section
      data-ui="video-editor.text-voice.panel"
      className="sniptale-parameter-stack min-w-0 pe-2"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <InspectorActionButton
          autoFocus
          iconOnly
          disabled={op.running || op.recording.session.isSaving}
          title={translate('gallery.videoReview.textVoiceBack')}
          aria-label={translate('gallery.videoReview.textVoiceBack')}
          onClick={props.onClose}
        >
          <ArrowLeft size={14} aria-hidden="true" />
        </InspectorActionButton>
        <span className="text-sm font-medium">
          {translate('gallery.videoReview.speechSynthesis')}
        </span>
      </div>
      {!op.batch ? <VoiceText text={text} /> : null}
      {!op.batch ? (
        <SegmentedRow
          value={source}
          ariaLabel={translate('gallery.videoReview.textVoiceSource')}
          columns={3}
          options={[
            { value: 'ai', label: translate('gallery.videoReview.textVoiceAI'), disabled: locked },
            {
              value: 'microphone',
              label: translate('gallery.videoReview.textVoiceMicrophone'),
              disabled: locked,
            },
            {
              value: 'gallery',
              label: translate('gallery.videoReview.textVoiceGallery'),
              disabled: locked,
            },
          ]}
          onChange={op.changeSource}
        />
      ) : null}
      <VoiceSourceControls operation={op} hasText={hasText} />
      {op.batch ? (
        <>
          <ProjectTextVoiceBatch project={props.project} operation={op} />
          {!op.consent ? <VoiceText text={text} /> : null}
          <VoiceRequest operation={op} hasText={hasText} />
        </>
      ) : null}
      {op.preview ? (
        <>
          <VoiceAudition
            key={op.preview.url}
            url={op.preview.url}
            duration={op.preview.duration}
            focusOnMount={source !== 'ai'}
            suspended={
              !op.inspectorVisible || op.recording.obscured || op.recording.confirmation.open
            }
            actions={
              source === 'microphone' ? (
                <AudioRecordingDownloadButton
                  iconOnly
                  disabled={op.running || op.recording.session.isDownloading}
                  onDownload={op.recording.session.downloadTake}
                />
              ) : undefined
            }
          />
          <VoicePlacement project={props.project} operation={op} />
          {op.accepted ? (
            <div role="status" className="flex items-center gap-2 text-xs">
              <Check size={14} aria-hidden="true" />
              {translate('videoEditor.sidebar.textVoiceSaved')}
            </div>
          ) : !op.batch ? (
            <InspectorActionButton
              disabled={op.running || !!op.consent || !op.canApply}
              onClick={() => {
                void op.apply();
              }}
            >
              {translate(
                op.preview.attachment?.receipt
                  ? 'gallery.videoReview.speechRetrySave'
                  : 'gallery.videoReview.speechApply'
              )}
            </InspectorActionButton>
          ) : null}
        </>
      ) : null}
      {op.batch &&
      (op.pendingApply ||
        op.items.some((item) => item.preview && item.selected && !item.accepted)) ? (
        <InspectorActionButton
          disabled={op.running || !!op.consent || !op.canApply}
          onClick={() => {
            void op.apply();
          }}
        >
          {translate(
            op.items.some((item) => item.preview?.attachment?.receipt && !item.accepted)
              ? 'gallery.videoReview.speechRetrySave'
              : 'gallery.videoReview.speechApplySelected'
          )}
        </InspectorActionButton>
      ) : null}
      <VoiceRequestStatus operation={op} />
    </section>
  );
}

function VoiceText({ text }: { text: string }) {
  return (
    <blockquote
      className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs select-text"
      style={{ fontFamily: 'var(--sniptale-font-document-sans)' }}
      data-ui="video-editor.text-voice.text"
    >
      {text}
    </blockquote>
  );
}

/** Each source keeps its own parameters and acquisition controls within the common take panel. */
function VoiceSourceControls({
  operation: op,
  hasText,
}: {
  operation: VideoProjectTextVoiceController;
  hasText: boolean;
}) {
  const { source } = op;
  const pauseTimeline = useVideoEditorPlaybackPort((port) => port.setPlaying);
  const locked =
    op.running ||
    op.recording.session.isSaving ||
    op.items.some((item) => !!item.preview) ||
    !!op.consent;
  if (source === 'microphone')
    return op.preview ? null : <ProjectTextVoiceRecording recording={op.recording} />;
  return source === 'ai' ? (
    <>
      <fieldset disabled={locked || op.selectionPending} className="min-w-0">
        <SpeechSynthesisProfileFields
          catalog={op.catalog}
          profile={op.profile}
          onChange={op.changeProfile}
          onSelectModel={op.chooseModel}
          onOpenModels={() => {
            void op.loadModels();
          }}
          preferenceId="project-text-voice.profile.advanced"
        />
      </fieldset>
      {op.configurationFailed || op.selectionFailed || op.selectionUnavailable ? (
        <p role="alert" className="text-xs">
          {translate(
            op.configurationFailed
              ? 'aiModal.modelCatalogFailed'
              : op.selectionFailed
                ? 'aiModal.modelSelectionSaveFailed'
                : 'aiModal.modelSelectionUnavailable'
          )}
          {op.selectionUnavailable && op.unavailableModelName ? (
            <>
              {' '}
              <bdi className="[overflow-wrap:anywhere]">{op.unavailableModelName}</bdi>
            </>
          ) : null}
        </p>
      ) : null}
      {op.selectionPending ? (
        <p role="status" className="text-xs">
          {translate('common.states.saving')}
        </p>
      ) : null}
      {(!op.catalog?.models.length || op.configurationFailed || op.selectionUnavailable) &&
      !locked ? (
        <InspectorActionButton
          onClick={() => {
            void op.loadModels();
          }}
        >
          {translate('gallery.videoReview.speechReloadModels')}
        </InspectorActionButton>
      ) : null}
      {!op.batch ? <VoiceRequest operation={op} hasText={hasText} /> : null}
    </>
  ) : !op.preview ? (
    <AudioLibrarySelection
      onSelect={op.prepareLocal}
      onClose={op.cancel}
      onBeforePreview={() => pauseTimeline(false)}
      trigger={(open) => (
        <InspectorActionButton
          disabled={op.running}
          onClick={open}
          aria-label={translate('gallery.videoReview.textVoiceChooseAudio')}
        >
          <FolderOpen size={14} aria-hidden="true" />
          {translate('gallery.videoReview.textVoiceChooseAudio')}
        </InspectorActionButton>
      )}
    />
  ) : (
    <div className="truncate text-xs" title={op.preview.filename}>
      {op.preview.filename}
    </div>
  );
}

function VoicePlacement({
  project,
  operation: op,
}: {
  project: VideoProject;
  operation: VideoProjectTextVoiceController;
}) {
  const tracks = project.tracks.filter((track) => track.kind === 'AUDIO' && !track.locked);
  const track = tracks.find((entry) => entry.id === op.placement.trackId);
  const lanes = track?.logicalLanes ?? [{ id: 'line-1' }];
  const locked = op.running || op.pendingApply || op.accepted;
  return (
    <fieldset disabled={locked} className="sniptale-parameter-stack min-w-0">
      <NumberInput
        label={translate('videoEditor.sidebar.textVoicePosition')}
        unit="s"
        min={0}
        max={86400}
        step={0.01}
        scrub={false}
        value={op.placement.start}
        disabled={locked}
        onChange={(start) => op.changePlacement({ ...op.placement, start })}
      />
      <SegmentedRow
        label={translate('videoEditor.sidebar.textVoiceTrack')}
        ariaLabel={translate('videoEditor.sidebar.textVoiceTrack')}
        value={op.placement.trackId ?? ''}
        options={[
          { value: '', label: translate('videoEditor.sidebar.textVoiceNewTrack') },
          ...tracks.map((entry) => ({ value: entry.id, label: entry.name })),
        ]}
        onChange={(id) => {
          const selected = tracks.find((entry) => entry.id === id);
          const { trackId: _track, timelineLaneId: _lane, ...placement } = op.placement;
          op.changePlacement({
            ...placement,
            ...(selected
              ? { trackId: selected.id, timelineLaneId: selected.logicalLanes?.[0]?.id ?? 'line-1' }
              : {}),
          });
        }}
      />
      <OriginalAudioPlacementFields
        project={project}
        value={op.placement.originalAudioMute}
        disabled={locked}
        onChange={(originalAudioMute) => op.changePlacement({ ...op.placement, originalAudioMute })}
      />
      {track && lanes.length > 1 ? (
        <SegmentedRow
          label={translate('videoEditor.sidebar.textVoiceLane')}
          ariaLabel={translate('videoEditor.sidebar.textVoiceLane')}
          value={op.placement.timelineLaneId ?? 'line-1'}
          options={lanes.map((lane, index) => ({ value: lane.id, label: String(index + 1) }))}
          onChange={(timelineLaneId) => op.changePlacement({ ...op.placement, timelineLaneId })}
        />
      ) : null}
    </fieldset>
  );
}

function VoiceAudition({
  url,
  duration,
  focusOnMount,
  suspended,
  actions,
}: {
  url: string;
  duration: number;
  focusOnMount: boolean;
  suspended: boolean;
  actions?: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) surface.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [url, focusOnMount]);
  const locale = useAppLocale();
  const setPlayingTimeline = useVideoEditorPlaybackPort((port) => port.setPlaying);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (suspended) audio.current?.pause();
  }, [suspended]);
  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
    };
  }, [url]);
  const label = translate(
    playing ? 'videoEditor.sidebar.textVoiceStop' : 'gallery.videoReview.speechPreview'
  );
  return (
    <div ref={surface} className="space-y-2">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <InspectorActionButton
          aria-label={label}
          title={label}
          onClick={() => {
            const element = audio.current;
            if (!element) return;
            setFailed(false);
            if (playing) {
              element.pause();
              element.currentTime = 0;
            } else {
              setPlayingTimeline(false);
              element.currentTime = 0;
              void element.play().catch(() => setFailed(true));
            }
          }}
        >
          {playing ? (
            <Square size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          {label}
        </InspectorActionButton>
        <span className="text-xs tabular-nums text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.textVoiceDuration').replace(
            '{duration}',
            formatNumber(duration, { maximumFractionDigits: 2 }, locale)
          )}
        </span>
        {actions}
      </div>
      {failed ? (
        <p role="alert" className="text-sm">
          {translate('videoEditor.sidebar.textVoiceAuditionFailed')}
        </p>
      ) : null}
    </div>
  );
}

function VoiceRequest({
  operation: op,
  hasText,
}: {
  operation: VideoProjectTextVoiceController;
  hasText: boolean;
}) {
  return (
    <>
      {op.consent ? (
        <div className="space-y-2" data-ui="video-editor.text-voice.consent">
          <p className="text-sm break-words">
            {translate('gallery.videoReview.speechConsentText').replace(
              '{provider}',
              op.consent.providerName
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <InspectorActionButton
              onClick={() => {
                void op.start();
              }}
            >
              {translate('gallery.videoReview.speechConsentContinue')}
            </InspectorActionButton>
            <InspectorActionButton onClick={op.cancel}>
              {translate('common.actions.cancel')}
            </InspectorActionButton>
          </div>
        </div>
      ) : !op.running &&
        !op.pendingApply &&
        op.items.some((item) => item.selected && !item.preview && !item.accepted) ? (
        <InspectorActionButton
          disabled={
            !op.profile?.voiceId.trim() ||
            op.profile.modelId !== op.modelId ||
            op.selectionPending ||
            !hasText
          }
          onClick={() => {
            void op.prepare();
          }}
        >
          {translate(
            op.batch
              ? 'gallery.videoReview.speechGenerateSelected'
              : 'gallery.videoReview.speechGenerate'
          )}
        </InspectorActionButton>
      ) : null}
    </>
  );
}
function VoiceRequestStatus({ operation: op }: { operation: VideoProjectTextVoiceController }) {
  return (
    <>
      {op.running ? (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          {translate('gallery.videoReview.speechWorking')}
          {op.progress ? (
            <span className="tabular-nums">
              {op.progress.completed} / {op.progress.total}
            </span>
          ) : null}
          {!op.applying ? (
            <InspectorActionButton onClick={op.cancel}>
              {translate('common.actions.cancel')}
            </InspectorActionButton>
          ) : null}
        </div>
      ) : null}
      {op.error ? (
        <p role="alert" className="text-sm break-words">
          {translate(
            getVideoAIProviderFailureKey(op.providerFailureReason) ??
              (op.error === 'selection'
                ? 'videoEditor.sidebar.textVoicePlacementConflict'
                : op.error === 'stale'
                  ? 'videoEditor.sidebar.textVoiceStale'
                  : op.error === 'model-unavailable'
                    ? 'gallery.videoReview.speechMissingModel'
                    : 'videoEditor.sidebar.recognitionFailed')
          )}
        </p>
      ) : null}
    </>
  );
}
