import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { getAudioFadeLimitSeconds } from '../../features/video/audio/fades';
import { translate } from '../../platform/i18n';
import { DraftNumericRow } from '../compact-inspector-controls/numeric-preview';

interface TakeFieldProps {
  clip: QuickEditAudioClip;
  disabled: boolean;
  onPatch(patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>): void;
}

/** Authored take parameters share bounds and numeric draft behavior across editors. */
export function AudioTakeLevelFields(props: TakeFieldProps & { showTempo?: boolean }) {
  return (
    <>
      {props.showTempo && (
        <DraftNumericRow
          label={translate('gallery.videoReview.voiceoverTempo')}
          unit="x"
          min={0.25}
          max={4}
          step={0.05}
          precision={2}
          value={props.clip.tempo ?? 1}
          disabled={props.disabled}
          onChange={(tempo) => props.onPatch({ tempo })}
        />
      )}
      <DraftNumericRow
        label={translate('gallery.videoReview.audioClipVolume')}
        unit="%"
        min={0}
        max={200}
        step={1}
        value={props.clip.volume * 100}
        disabled={props.disabled}
        onChange={(value) => props.onPatch({ volume: value / 100 })}
      />
    </>
  );
}

/** Fade durations remain in the native sample clock. */
export function AudioTakeFadeFields(props: TakeFieldProps) {
  return (
    <>
      {(['fadeIn', 'fadeOut'] as const).map((key) => (
        <DraftNumericRow
          key={key}
          label={translate(
            key === 'fadeIn'
              ? 'gallery.videoReview.audioFadeIn'
              : 'gallery.videoReview.audioFadeOut'
          )}
          unit="s"
          min={0}
          max={getAudioFadeLimitSeconds(props.clip.duration)}
          scrubMax={Math.min(5, props.clip.duration)}
          step={0.1}
          precision={2}
          value={props.clip[key]}
          disabled={props.disabled}
          onChange={(value) => props.onPatch({ [key]: value })}
        />
      ))}
    </>
  );
}
