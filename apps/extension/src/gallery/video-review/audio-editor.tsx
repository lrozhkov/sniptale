import { ReviewNumberRow } from './number-row';
import { translate } from '../../platform/i18n';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { VolumeX, Trash2 } from 'lucide-react';
import {
  ReviewInterval,
  ReviewButton,
  reviewTextButtonClassName,
  reviewDeleteButtonClassName,
} from './controls';
import type { useReviewAudio } from './use-review-audio';

/** Editor for the selected audio clip: level, mute, fades, and the delete action. */
export function ReviewAudioClipEditor(props: {
  clip: QuickEditAudioClip;
  busy: boolean;
  onPatch(patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>): void;
  onDelete(): void;
}) {
  return (
    <div data-ui="gallery.videoReview.audioInspector" className="min-w-0 space-y-3">
      <ReviewInterval
        start={props.clip.timelineStart}
        end={props.clip.timelineStart + props.clip.duration}
      />
      <ReviewNumberRow
        label={translate('gallery.videoReview.audioClipVolume')}
        unit="%"
        min={0}
        max={200}
        step={1}
        value={props.clip.volume * 100}
        disabled={props.busy}
        onChange={(value) => props.onPatch({ volume: value / 100 })}
      />
      {(['fadeIn', 'fadeOut'] as const).map((key) => (
        <ReviewNumberRow
          key={key}
          label={translate(
            key === 'fadeIn'
              ? 'gallery.videoReview.audioFadeIn'
              : 'gallery.videoReview.audioFadeOut'
          )}
          unit="s"
          min={0}
          max={Math.min(60, props.clip.duration)}
          step={0.1}
          precision={2}
          value={props.clip[key]}
          disabled={props.busy}
          onChange={(value) => props.onPatch({ [key]: value })}
        />
      ))}
      <div className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <ReviewButton
          label={translate('gallery.videoReview.audioClipMute')}
          aria-pressed={props.clip.muted}
          disabled={props.busy}
          className={`${reviewTextButtonClassName} !w-full justify-start`}
          onClick={() => props.onPatch({ muted: !props.clip.muted })}
        >
          <VolumeX size={15} aria-hidden="true" />
          <span>{translate('gallery.videoReview.audioClipMute')}</span>
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.audioClipDelete')}
          disabled={props.busy}
          className={`${reviewDeleteButtonClassName} !w-full justify-start`}
          onClick={props.onDelete}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>{translate('gallery.videoReview.audioClipDelete')}</span>
        </ReviewButton>
      </div>
    </div>
  );
}

/** Inspector wrapper bound to the audio hook's current selection. */
export function ReviewAudioInspectorSection(props: {
  audio: ReturnType<typeof useReviewAudio>;
  busy: boolean;
}) {
  const selected = props.audio.selected;
  if (!selected) return null;
  return (
    <ReviewAudioClipEditor
      clip={selected.clip}
      busy={props.busy}
      onPatch={(patch) => void props.audio.patchClip(selected.lane, selected.clip.id, patch)}
      onDelete={() => void props.audio.removeClip(selected.lane, selected.clip.id)}
    />
  );
}
