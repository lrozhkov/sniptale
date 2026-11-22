import { useRef } from 'react';
import { Captions, Mic, Music, Plus } from 'lucide-react';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import type { ReviewAnchor } from '../../features/video/review/types';
import type { useReviewText } from './use-review-text';
import type { ReviewAudioLane } from './use-review-audio';
import { ReviewButton, ReviewToolGroup, reviewIconButtonClassName } from './controls';
import { translate } from '../../platform/i18n';

type CreationInput = {
  sourceId: string | undefined;
  track: QuickEditTrack;
  blocked: boolean;
  atEnd: boolean;
  range: Extract<ReviewAnchor, { kind: 'range' }> | undefined;
  text: ReturnType<typeof useReviewText> | undefined;
  onRecordVoiceover(): void;
  onPrepareImportFile(
    lane: ReviewAudioLane,
    ready: (importFile: (file: File) => void) => void
  ): void;
  onOpenAudio: ((anchor: HTMLElement, lane: ReviewAudioLane) => void) | undefined;
};

/** Placement is transient; text and audio commands keep their existing mutation owners. */
export function useReviewTrackCreation(input: CreationInput) {
  const current = useRef(input);
  current.current = input;
  const addText = (_trigger: HTMLElement) => {
    if (!current.current.blocked) current.current.text?.add();
  };
  return {
    tools: <ReviewTrackCreationTools {...input} addText={addText} />,
  };
}

/** Contextual commands replace lane-header creation buttons; picker intent captures its lane. */
function ReviewTrackCreationTools(
  props: CreationInput & {
    addText(anchor: HTMLElement): void;
  }
) {
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<{ sourceId: string | undefined; importFile(file: File): void } | null>(
    null
  );
  const lane = props.track === 'voiceover' || props.track === 'music' ? props.track : null;
  if (props.track === 'text' && props.text) {
    const available = !!props.range && props.range.end - props.range.start + 1e-9 >= 0.05;
    return (
      <ReviewToolGroup active={false} label={translate('gallery.videoReview.textFragmentAdd')}>
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentAdd')}
          toolbarLabel={translate('gallery.videoReview.textFragmentAdd')}
          className={reviewIconButtonClassName}
          disabled={props.blocked || !available || props.text.projection.resultDuration < 0.05}
          onClick={(event) => props.addText(event.currentTarget)}
        >
          <Captions size={16} aria-hidden />
        </ReviewButton>
      </ReviewToolGroup>
    );
  }
  if (!lane) return null;
  const importLabel = translate(
    lane === 'music' && props.onOpenAudio
      ? 'gallery.videoReview.musicLibrary'
      : 'gallery.videoReview.audioImport'
  );
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const intent = picker.current;
          event.target.value = '';
          picker.current = null;
          if (file && intent && intent.sourceId === props.sourceId) intent.importFile(file);
        }}
      />
      {lane === 'voiceover' && (
        <ReviewButton
          label={translate('gallery.videoReview.recordVoiceover')}
          toolbarLabel={translate('gallery.videoReview.recordVoiceover')}
          className={reviewIconButtonClassName}
          disabled={props.blocked || props.atEnd}
          onClick={props.onRecordVoiceover}
        >
          <Mic size={16} aria-hidden />
        </ReviewButton>
      )}
      <ReviewButton
        label={importLabel}
        toolbarLabel={importLabel}
        className={reviewIconButtonClassName}
        disabled={props.blocked || props.atEnd}
        onClick={(event) => {
          const trigger = event.currentTarget;
          if (props.onOpenAudio) props.onOpenAudio(trigger, lane);
          else {
            props.onPrepareImportFile(lane, (importFile) => {
              picker.current = {
                sourceId: props.sourceId,
                importFile,
              };
              input.current?.click();
            });
          }
        }}
      >
        {lane === 'music' ? <Music size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
      </ReviewButton>
    </>
  );
}
