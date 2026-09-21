import { Trash2, VolumeX } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { useReviewAudio } from './use-review-audio';
import { ReviewNumberRow } from './number-row';
import {
  ReviewButton,
  ReviewInterval,
  reviewDeleteButtonClassName,
  reviewTextButtonClassName,
} from './controls';

/** Manual source gain is independent from the speed edit's linked mute. */
export function ReviewOriginalAudioInspector(props: {
  audio: ReturnType<typeof useReviewAudio>;
  duration: number;
  speedMuted: boolean;
}) {
  const range = props.audio.selectedOriginal;
  if (!range) return null;
  return (
    <div className="space-y-3">
      <ReviewInterval start={range.start} end={range.end} />
      <ReviewNumberRow
        label={translate('gallery.videoReview.volume')}
        unit="%"
        min={0}
        max={200}
        step={1}
        precision={0}
        value={range.volume * 100}
        onChange={(value) => props.audio.patchOriginal(range.id, { volume: value / 100 })}
      />
      <ReviewButton
        label={translate('gallery.videoReview.muteAudioRange')}
        className={`${reviewTextButtonClassName} !w-full`}
        onClick={() => props.audio.patchOriginal(range.id, { volume: 0 })}
      >
        <VolumeX size={15} />
        <span>{translate('gallery.videoReview.muteAudioRange')}</span>
      </ReviewButton>
      {props.speedMuted ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.audioRangeSpeedHint')}
        </p>
      ) : null}
      <div className="space-y-3 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        {(['start', 'end'] as const).map((edge) => (
          <ReviewNumberRow
            key={edge}
            label={translate(
              edge === 'start' ? 'gallery.videoReview.rangeStart' : 'gallery.videoReview.rangeEnd'
            )}
            unit="s"
            min={edge === 'start' ? 0 : range.start + 0.001}
            max={edge === 'end' ? props.duration : range.end - 0.001}
            step={0.01}
            precision={2}
            value={range[edge]}
            onChange={(value) => props.audio.patchOriginal(range.id, { [edge]: value })}
          />
        ))}
      </div>
      <div className="border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <ReviewButton
          label={translate('gallery.videoReview.removeEdit')}
          className={`${reviewDeleteButtonClassName} !w-full justify-start`}
          onClick={() => props.audio.removeOriginal(range.id)}
        >
          <Trash2 size={15} />
          <span>{translate('gallery.videoReview.removeEdit')}</span>
        </ReviewButton>
      </div>
    </div>
  );
}
