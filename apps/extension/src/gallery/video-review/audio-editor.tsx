import { translate } from '../../platform/i18n';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { reviewTimeLabel } from './controls';
import { ReviewButton } from './controls';
import type { useReviewAudio } from './use-review-audio';

const fieldClass =
  'w-full rounded-md border border-[var(--sniptale-color-border-soft)] bg-transparent px-2 py-1 text-sm';
const number = (value: string) => (value === '' ? undefined : Number(value));

/** Editor for the selected audio clip: level, mute, fades, and the delete action. */
export function ReviewAudioClipEditor(props: {
  clip: QuickEditAudioClip;
  laneLabel: string;
  busy: boolean;
  onPatch(patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>): void;
  onDelete(): void;
}) {
  return (
    <div
      data-ui="gallery.videoReview.audioInspector"
      className="space-y-3 rounded-lg border border-[var(--sniptale-color-border-soft)] p-3"
    >
      <h4 className="truncate text-sm font-semibold">
        {props.laneLabel} {reviewTimeLabel(props.clip.timelineStart)}–
        {reviewTimeLabel(props.clip.timelineStart + props.clip.duration)}
      </h4>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.audioClipVolume')}
          </span>
          <input
            aria-label={translate('gallery.videoReview.audioClipVolume')}
            className={`${fieldClass} tabular-nums`}
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={props.clip.volume}
            onChange={(event) => {
              const volume = number(event.target.value);
              if (volume !== undefined) props.onPatch({ volume });
            }}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.audioFadeIn')}
          </span>
          <input
            aria-label={translate('gallery.videoReview.audioFadeIn')}
            className={`${fieldClass} tabular-nums`}
            type="number"
            min={0}
            max={60}
            step={0.1}
            value={props.clip.fadeIn}
            onChange={(event) => {
              const fadeIn = number(event.target.value);
              if (fadeIn !== undefined) props.onPatch({ fadeIn });
            }}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.audioFadeOut')}
          </span>
          <input
            aria-label={translate('gallery.videoReview.audioFadeOut')}
            className={`${fieldClass} tabular-nums`}
            type="number"
            min={0}
            max={60}
            step={0.1}
            value={props.clip.fadeOut}
            onChange={(event) => {
              const fadeOut = number(event.target.value);
              if (fadeOut !== undefined) props.onPatch({ fadeOut });
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.audioClipMute')}
          aria-pressed={props.clip.muted}
          disabled={props.busy}
          className="!text-xs aria-pressed:!bg-[var(--sniptale-color-accent-soft)]"
          onClick={() => props.onPatch({ muted: !props.clip.muted })}
        />
        <ReviewButton
          label={translate('gallery.videoReview.audioClipDelete')}
          disabled={props.busy}
          className="!border-0 !bg-transparent !shadow-none !text-xs"
          onClick={props.onDelete}
        >
          {translate('gallery.videoReview.audioClipDelete')}
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
      laneLabel={
        selected.lane === 'music'
          ? translate('gallery.videoReview.audioMusic')
          : translate('gallery.videoReview.audioVoiceover')
      }
      busy={props.busy}
      onPatch={(patch) => void props.audio.patchClip(selected.lane, selected.clip.id, patch)}
      onDelete={() => void props.audio.removeClip(selected.lane, selected.clip.id)}
    />
  );
}
