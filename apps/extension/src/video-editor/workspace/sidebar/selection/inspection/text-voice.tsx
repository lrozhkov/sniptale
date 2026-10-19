import { useVideoEditorPlaybackPort } from '../../../../runtime/controller/store';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, FolderOpen, LoaderCircle, Play, Square } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { formatNumber, translate, useAppLocale } from '../../../../../platform/i18n';
import { SpeechSynthesisProfileFields } from '../../../../../ui/video-text/speech/profile';
import { SegmentedRow, SelectField } from '../../../../../ui/compact-inspector-controls';
import type { VideoProjectTextVoiceController } from '../../../../runtime/session/text-voice';
import { InspectorActionButton } from '../shared/actions';
import { AudioLibrarySelection } from '../../../../../composition/audio-library/selection';
import { NumberInput } from '../inputs/number';

/** Montage supplies explicit result-clock placement independently of text source ranges. */
export function ProjectTextVoicePanel(props: {
  project: VideoProject;
  operation: VideoProjectTextVoiceController;
  onClose(): void;
}) {
  const { operation: op } = props;
  const { source } = op;
  const fragment = props.project.textDocuments
    ?.find((entry) => entry.id === op.target?.documentId)
    ?.document.fragments.find((entry) => entry.id === op.target?.fragmentId);
  const text =
    op.preview?.textSnapshot.text.text ?? op.consent?.capture.basis.fragment.text ?? fragment?.text;
  const locked = op.running || !!op.preview || !!op.consent;
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
          disabled={op.running}
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
      <blockquote
        className={[
          'max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs select-text',
          'font-[family-name:var(--sniptale-font-document-sans)]',
        ].join(' ')}
        data-ui="video-editor.text-voice.text"
      >
        {text}
      </blockquote>
      <SegmentedRow
        value={source}
        ariaLabel={translate('gallery.videoReview.textVoiceSource')}
        columns={2}
        options={[
          { value: 'ai', label: translate('gallery.videoReview.textVoiceAI'), disabled: locked },
          {
            value: 'gallery',
            label: translate('gallery.videoReview.textVoiceGallery'),
            disabled: locked,
          },
        ]}
        onChange={op.changeSource}
      />
      <VoiceSourceControls operation={op} hasText={!!fragment?.text.trim()} />
      {op.preview ? (
        <>
          <VoiceAudition
            url={op.preview.url}
            duration={op.preview.duration}
            focusOnMount={source === 'gallery'}
          />
          <VoicePlacement project={props.project} operation={op} />
          {op.accepted ? (
            <div role="status" className="flex items-center gap-2 text-xs">
              <Check size={14} aria-hidden="true" />
              {translate('videoEditor.sidebar.textVoiceSaved')}
            </div>
          ) : (
            <InspectorActionButton
              disabled={op.running}
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
          )}
        </>
      ) : null}
      <VoiceRequestStatus operation={op} />
    </section>
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
  const { loadModels, source } = op;
  const pauseTimeline = useVideoEditorPlaybackPort((port) => port.setPlaying);
  const locked = op.running || !!op.preview || !!op.consent;
  useEffect(() => {
    if (source === 'ai') void loadModels();
  }, [loadModels, source]);
  return source === 'ai' ? (
    <>
      <fieldset disabled={locked} className="min-w-0">
        <SpeechSynthesisProfileFields
          catalog={op.catalog}
          profile={op.profile}
          onChange={op.changeProfile}
          onOpenModels={() => {
            void op.loadModels();
          }}
          preferenceId="project-text-voice.profile.advanced"
        />
      </fieldset>
      {!op.catalog?.models.length && !locked ? (
        <InspectorActionButton
          onClick={() => {
            void op.loadModels();
          }}
        >
          {translate('gallery.videoReview.speechReloadModels')}
        </InspectorActionButton>
      ) : null}
      <VoiceRequest operation={op} hasText={hasText} />
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
  const locked = op.running || !!op.preview?.attachment?.receipt;
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
      <SelectField
        label={translate('videoEditor.sidebar.textVoiceTrack')}
        value={op.placement.trackId ?? ''}
        options={[
          { value: '', label: translate('videoEditor.sidebar.textVoiceNewTrack') },
          ...tracks.map((entry) => ({ value: entry.id, label: entry.name })),
        ]}
        onChange={(id) => {
          const selected = tracks.find((entry) => entry.id === id);
          op.changePlacement({
            start: op.placement.start,
            ...(selected
              ? { trackId: selected.id, timelineLaneId: selected.logicalLanes?.[0]?.id ?? 'line-1' }
              : {}),
          });
        }}
      />
      {track && lanes.length > 1 ? (
        <SelectField
          label={translate('videoEditor.sidebar.textVoiceLane')}
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
}: {
  url: string;
  duration: number;
  focusOnMount: boolean;
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
      ) : !op.preview && !op.running ? (
        <InspectorActionButton
          disabled={!op.profile || !hasText}
          onClick={() => {
            void op.prepare();
          }}
        >
          {translate('gallery.videoReview.speechGenerate')}
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
            op.error === 'selection'
              ? 'videoEditor.sidebar.textVoicePlacementConflict'
              : op.error === 'stale'
                ? 'videoEditor.sidebar.textVoiceStale'
                : op.error === 'model-unavailable'
                  ? 'gallery.videoReview.speechMissingModel'
                  : 'videoEditor.sidebar.recognitionFailed'
          )}
        </p>
      ) : null}
    </>
  );
}
