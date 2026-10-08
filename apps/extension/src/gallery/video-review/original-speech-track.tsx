import { Captions, Volume2, VolumeX } from 'lucide-react';
import type { ReviewOriginalSpeech } from '../../features/video/review/original-speech';
import { translate } from '../../platform/i18n';
import {
  ReviewButton,
  reviewTimeLabel,
  reviewTimelineItemTone,
  reviewTrackStatusButtonClassName,
} from './controls';
import { ReviewTrackRow, ReviewTrackCuts } from './track-row';
import type { ReviewTrackProjection } from './track-projection';

/** Accepted speech stays on immutable source slots, including disabled and cut intervals. */
export function ReviewOriginalSpeechTrack(props: {
  speech: ReviewOriginalSpeech;
  duration: number;
  projection?: ReviewTrackProjection | undefined;
  selectedId?: string | undefined;
  busy: boolean;
  onSelect(id: string, time: number): void;
  onToggle(enabled: boolean): void;
}) {
  const replacements = props.speech.transcript.replacements;
  if (!replacements.length) return null;
  const duration = props.projection?.duration ?? props.duration;
  return (
    <ReviewTrackRow
      label={translate('gallery.videoReview.speechRevoice')}
      muted={!props.speech.enabled}
      icon={<Captions size={14} aria-hidden="true" />}
      controls={
        <ReviewButton
          label={translate('gallery.videoReview.audioEnabled')}
          aria-pressed={props.speech.enabled}
          disabled={props.busy}
          className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
          onClick={() => props.onToggle(!props.speech.enabled)}
        >
          {props.speech.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </ReviewButton>
      }
    >
      <div
        data-ui="gallery.videoReview.revoiceTrack"
        className="relative mt-1 h-8"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {replacements.map((replacement) => (
          <button
            key={replacement.id}
            type="button"
            disabled={props.busy}
            aria-pressed={props.selectedId === replacement.id}
            title={`${replacement.text} · ${reviewTimeLabel(replacement.start)}–${reviewTimeLabel(replacement.end)}`}
            onClick={() => props.onSelect(replacement.id, replacement.start)}
            className={[
              'absolute inset-y-0 min-w-px overflow-hidden rounded border px-1 text-left text-[11px]',
              reviewTimelineItemTone(props.selectedId === replacement.id),
              !props.speech.enabled || !replacement.enabled ? 'opacity-50' : '',
            ].join(' ')}
            style={{
              left: `${(replacement.start / duration) * 100}%`,
              width: `${((replacement.end - replacement.start) / duration) * 100}%`,
            }}
          >
            <span className="block truncate">{replacement.text}</span>
          </button>
        ))}
        <ReviewTrackCuts projection={props.projection} />
      </div>
    </ReviewTrackRow>
  );
}
