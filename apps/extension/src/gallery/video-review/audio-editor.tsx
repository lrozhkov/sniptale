import { useAudioPresets } from '../../composition/audio-preset-resources/use-audio-presets';
import { AudioPresetControls } from '../../ui/audio/preset-controls';
import { AudioTakeLevelFields, AudioTakeFadeFields } from '../../ui/audio/take-fields';
import {
  reviewInspectorActions,
  ReviewInspectorSections,
  ReviewInspectorColumns,
  type ReviewInspectorSection,
} from './inspector-sections';
import { useContext } from 'react';
import { ReviewIntervalMap } from './interval-timing';
import {
  reviewVoiceoverPlaybackDuration,
  reviewVoiceoverRange,
} from '../../features/video/review/voiceover-edits';
import { translate } from '../../platform/i18n';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { Trash2, AudioLines, Waves, VolumeX } from 'lucide-react';
import {
  ReviewInterval,
  ReviewButton,
  reviewDeleteButtonClassName,
  reviewTextButtonClassName,
} from './controls';
import type { useReviewAudio } from './use-review-audio';

/** Editor for the selected audio clip: level, fades, and the delete action. */
export function ReviewAudioClipEditor(props: {
  clip: QuickEditAudioClip;
  busy: boolean;
  lane?: 'voiceover' | 'music';
  cutSuppressed?: boolean;
  recognition?: ReviewInspectorSection;
  onPatch(patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>): void;
  onDelete(): void;
}) {
  const ownerKey = JSON.stringify(['gallery-take', props.clip.id, props.clip.assetId]);
  const presets = useAudioPresets(ownerKey, props.clip.audioProcessing);
  const map = useContext(ReviewIntervalMap);
  const sections = [
    {
      id: 'audio',
      label: translate('gallery.videoReview.volume'),
      icon: AudioLines,
      content: (
        <>
          <ReviewInspectorColumns>
            <AudioTakeLevelFields
              presetControls={
                <AudioPresetControls
                  key={ownerKey}
                  {...presets}
                  hasValue={!!props.clip.audioProcessing}
                  disabled={props.busy}
                  onApply={(audioProcessing) => props.onPatch({ audioProcessing })}
                />
              }
              createDefaultProcessing={presets.createDefaultProcessing}
              clip={props.clip}
              disabled={props.busy}
              showTempo={props.lane === 'voiceover'}
              onPatch={props.onPatch}
            />
          </ReviewInspectorColumns>
        </>
      ),
    },
    {
      id: 'animation',
      label: translate('videoEditor.sidebar.inspectorGroupAnimation'),
      icon: Waves,
      content: (
        <ReviewInspectorColumns>
          <AudioTakeFadeFields clip={props.clip} disabled={props.busy} onPatch={props.onPatch} />
        </ReviewInspectorColumns>
      ),
    },
  ];
  const actions = reviewInspectorActions(
    <>
      <ReviewButton
        label={translate('gallery.videoReview.audioClipMute')}
        disabled={props.busy || props.clip.volume === 0}
        className={`${reviewTextButtonClassName} !w-full justify-start`}
        onClick={() => props.onPatch({ volume: 0 })}
      >
        <VolumeX size={15} aria-hidden="true" />
        <span>{translate('gallery.videoReview.audioClipMute')}</span>
      </ReviewButton>
      <ReviewButton
        selectionAction="delete"
        label={translate('gallery.videoReview.audioClipDelete')}
        disabled={props.busy}
        className={`${reviewDeleteButtonClassName} !w-full justify-start`}
        onClick={props.onDelete}
      >
        <Trash2 size={15} aria-hidden="true" />
        <span>{translate('gallery.videoReview.audioClipDelete')}</span>
      </ReviewButton>
    </>
  );
  return (
    <div data-ui="gallery.videoReview.audioInspector" className="min-w-0 space-y-3">
      <ReviewInterval
        timeBasis={props.clip.sourceAnchor ? 'source' : 'result'}
        duration={props.clip.duration}
        resultDuration={reviewVoiceoverPlaybackDuration(
          props.clip,
          props.lane === 'voiceover' ? map : undefined
        )}
        start={reviewVoiceoverRange(props.clip).start}
        end={reviewVoiceoverRange(props.clip).end}
      />
      {props.cutSuppressed ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.voiceoverCut')}
        </p>
      ) : null}
      <ReviewInspectorSections
        sections={[...sections, ...(props.recognition ? [props.recognition] : []), actions]}
      />
    </div>
  );
}

/** Inspector wrapper bound to the audio hook's current selection. */
export function ReviewAudioInspectorSection(props: {
  audio: ReturnType<typeof useReviewAudio>;
  busy: boolean;
  recognition?: ReviewInspectorSection;
}) {
  const selected = props.audio.selected;
  if (!selected) return null;
  return (
    <ReviewAudioClipEditor
      {...(props.recognition ? { recognition: props.recognition } : {})}
      clip={selected.clip}
      lane={selected.lane}
      cutSuppressed={selected.cutSuppressed}
      busy={props.busy}
      onPatch={(patch) => void props.audio.patchClip(selected.lane, selected.clip.id, patch)}
      onDelete={() => void props.audio.removeClip(selected.lane, selected.clip.id)}
    />
  );
}
