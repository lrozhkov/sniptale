import { useLayoutEffect, useMemo, useRef } from 'react';
import { Lock, Mic } from 'lucide-react';
import {
  projectSourceVoiceoverViews,
  type VideoProjectSourceVoiceoverView,
} from '../../../../../features/video/project/source-voiceover-views';
import { isProjectSourceVoiceoverEditable } from '../../../../../features/video/project/source-voiceover';
import { getProjectAudioWaveformPeaks } from '../../../../../features/video/project/timeline/audio';
import type { VideoProject } from '../../../../../features/video/project/types';
import type { VideoEditorSelection } from '../../../../contracts/selection';
import { useVideoEditorTimelineController } from '../../../../runtime/controller/composition/hooks';
import { translate, useAppLocale } from '../../../../../platform/i18n';
import { AudioClipWaveform } from '../../clip/waveform';
import {
  projectTimelineInterval,
  type TimelineProjection,
} from '../../interaction-state/projection';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../hover-preview';

interface VoiceViewsProps {
  project: VideoProject;
  trackId: string;
  selection: VideoEditorSelection;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  height: number;
}

/** Timeline views select one authored take without becoming montage clips. */
export function ProjectTimelineSourceVoiceoverViews(props: VoiceViewsProps) {
  if (
    !props.project.tracks.some((track) => track.id === props.trackId && track.kind === 'AUDIO') ||
    !props.project.sourceVoiceoverDocuments?.some((document) => document.trackId === props.trackId)
  )
    return null;
  return <SourceVoiceoverTrackViews {...props} />;
}

function SourceVoiceoverTrackViews(props: VoiceViewsProps) {
  const controller = useVideoEditorTimelineController();
  const controllerRef = useRef(controller);
  useLayoutEffect(() => {
    controllerRef.current = controller;
  });
  const locale = useAppLocale();
  const { project, trackId, pixelsPerSecond, projection, height } = props;
  const selectedDocumentId =
    props.selection.kind === 'source-voiceover' ? props.selection.documentId : null;
  return useMemo(() => {
    const track = project.tracks.find((track) => track.id === trackId);
    if (track?.kind !== 'AUDIO') return null;
    return (
      <>
        {(project.sourceVoiceoverDocuments ?? [])
          .filter((document) => document.trackId === trackId)
          .flatMap((document) => {
            const selected = selectedDocumentId === document.id;
            const locked = !isProjectSourceVoiceoverEditable(project, document);
            return projectSourceVoiceoverViews(project, document).map((view) => (
              <VoiceView
                key={view.clip.id}
                project={project}
                trackId={trackId}
                pixelsPerSecond={pixelsPerSecond}
                projection={projection}
                height={height}
                locale={locale}
                view={view}
                selected={selected}
                locked={locked}
                inactive={
                  !document.enabled || document.take.muted || !track.visible || !view.sourceVisible
                }
                onSelect={() => controllerRef.current?.actions.onSelectSourceVoiceover(document.id)}
              />
            ));
          })}
      </>
    );
  }, [project, trackId, pixelsPerSecond, projection, height, selectedDocumentId, locale]);
}

function VoiceView(
  props: Omit<VoiceViewsProps, 'selection'> & {
    locale: ReturnType<typeof useAppLocale>;
    view: VideoProjectSourceVoiceoverView;
    selected: boolean;
    locked: boolean;
    inactive: boolean;
    onSelect(): void;
  }
) {
  const clip = props.view.clip;
  const interval = props.projection
    ? projectTimelineInterval(
        props.projection,
        clip.timelineStart,
        clip.timelineStart + clip.duration
      )
    : {
        left: clip.timelineStart * props.pixelsPerSecond,
        width: clip.duration * props.pixelsPerSecond,
        offsetSeconds: 0,
        durationSeconds: clip.duration,
      };
  const { project } = props;
  const { assetId } = clip;
  const rate = clip.playbackRate ?? 1;
  const sourceStart = clip.sourceOffset + (interval?.offsetSeconds ?? 0) * rate;
  const sourceDuration = (interval?.durationSeconds ?? 0) * rate;
  const sampleCount = interval ? Math.ceil(interval.width) : 0;
  const peaks = useMemo(
    () =>
      sampleCount > 0
        ? getProjectAudioWaveformPeaks(
            project,
            {
              assetId,
              sourceStart,
              sourceDuration,
            },
            sampleCount
          )
        : [],
    [project, assetId, sourceStart, sourceDuration, sampleCount]
  );
  if (!interval) return null;
  const asset = project.assets.find((asset) => asset.id === assetId);
  const name = asset?.name ?? translate('gallery.videoReview.audioVoiceover', props.locale);
  const label = `${translate('gallery.videoReview.audioVoiceover', props.locale)}: ${name}`;
  return (
    <button
      {...TIMELINE_OBJECT_MARKER_PROPS}
      type="button"
      data-source-voiceover-view={clip.id}
      data-source-voiceover-document={props.view.documentId}
      data-source-voiceover-inactive={props.inactive || undefined}
      aria-label={label}
      aria-pressed={props.selected}
      title={label}
      className={[
        'video-editor-timeline-item pointer-events-auto absolute overflow-hidden rounded-[4px] border text-left',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-focus-ring)]',
        props.selected ? 'video-editor-timeline-item-selected' : '',
      ].join(' ')}
      style={{
        left: interval.left,
        width: Math.max(4, interval.width),
        top: 4,
        height: Math.max(16, props.height - 8),
        opacity: props.inactive ? 0.55 : 1,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
    >
      <span className="absolute inset-x-1 bottom-1 top-5" aria-hidden="true">
        <AudioClipWaveform
          peaks={peaks}
          envelopeStart={clip.volume}
          envelopeEnd={clip.volume}
          muted={props.inactive}
        />
      </span>
      <span
        className={[
          'absolute inset-x-1.5 top-1 flex min-w-0 items-center gap-1',
          'text-[10px] leading-3 text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        <Mic size={12} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {props.locked && <Lock size={11} aria-hidden="true" className="shrink-0" />}
      </span>
    </button>
  );
}
