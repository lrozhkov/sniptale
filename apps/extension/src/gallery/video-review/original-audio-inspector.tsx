import { reviewInspectorActions, ReviewInspectorSections } from './inspector-sections';
import { Trash2, VolumeX, AudioLines } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { useReviewAudio } from './use-review-audio';
import { DraftNumericRow as ReviewNumberRow } from '../../ui/compact-inspector-controls/numeric-preview';
import {
  ReviewButton,
  ReviewInterval,
  reviewDeleteButtonClassName,
  reviewTextButtonClassName,
} from './controls';

/** Manual source gain is independent from the speed edit's linked mute. */
export function ReviewOriginalAudioInspector(props: {
  audio: Pick<
    ReturnType<typeof useReviewAudio>,
    'selectedOriginal' | 'patchOriginal' | 'removeOriginal'
  >;
  duration: number;
  speedMuted: boolean;
  originalMuted?: boolean;
}) {
  const range = props.audio.selectedOriginal;
  if (!range) return null;
  return (
    <div className="space-y-3">
      <ReviewInterval start={range.start} end={range.end} />
      <ReviewInspectorSections
        sections={[
          {
            id: 'audio',
            label: translate('gallery.videoReview.volume'),
            icon: AudioLines,
            content: (
              <>
                <ReviewNumberRow
                  label={translate('gallery.videoReview.volume')}
                  rangePresentation="field"
                  unit="%"
                  min={0}
                  max={range.origin && range.origin !== 'manual' ? 100 : 200}
                  step={1}
                  precision={0}
                  value={range.volume * 100}
                  onChange={(value) => props.audio.patchOriginal(range.id, { volume: value / 100 })}
                />
                {range.origin === 'take' && (
                  <p className="text-xs text-[var(--sniptale-color-text-muted)]">
                    {translate('gallery.videoReview.textVoiceMuteLinked')}
                  </p>
                )}

                {props.speedMuted ? (
                  <p className="text-xs text-[var(--sniptale-color-text-muted)]">
                    {translate('gallery.videoReview.audioRangeSpeedHint')}
                  </p>
                ) : null}
                {props.originalMuted ? (
                  <p role="status" className="review-inspector-notice">
                    {translate('gallery.videoReview.originalAudioMutedHint')}
                  </p>
                ) : null}
              </>
            ),
          },
          reviewInspectorActions(
            <>
              <ReviewButton
                label={translate('gallery.videoReview.muteAudioRange')}
                className={`${reviewTextButtonClassName} !w-full justify-start`}
                onClick={() => props.audio.patchOriginal(range.id, { volume: 0 })}
              >
                <VolumeX size={15} />
                <span>{translate('gallery.videoReview.muteAudioRange')}</span>
              </ReviewButton>
              <ReviewButton
                selectionAction="delete"
                label={translate('gallery.videoReview.removeEdit')}
                className={`${reviewDeleteButtonClassName} !w-full justify-start`}
                onClick={() => props.audio.removeOriginal(range.id)}
              >
                <Trash2 size={15} />
                <span>{translate('gallery.videoReview.removeEdit')}</span>
              </ReviewButton>
            </>
          ),
        ]}
      />
    </div>
  );
}
