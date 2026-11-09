import { useCallback, useEffect, useRef, useState } from 'react';
import { Captions, Mic, Music, Plus } from 'lucide-react';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import type { ReviewAnchor } from '../../features/video/review/types';
import type { ReviewBeforeAction } from './note-transitions';
import type { useReviewText } from './use-review-text';
import type { ReviewAudioLane } from './use-review-audio';
import { ReviewButton, ReviewToolGroup, reviewIconButtonClassName } from './controls';
import { translate } from '../../platform/i18n';

type CreationInput = {
  sourceId: string | undefined;
  track: QuickEditTrack;
  blocked: boolean;
  beforeAction: ReviewBeforeAction | undefined;
  range: Extract<ReviewAnchor, { kind: 'range' }> | undefined;
  text: ReturnType<typeof useReviewText> | undefined;
  onRecordVoiceover(): void;
  onImportFile(file: File, lane: ReviewAudioLane): void;
  onOpenAudio: ((anchor: HTMLElement, lane: ReviewAudioLane) => void) | undefined;
};

/** Placement is transient; text and audio commands keep their existing mutation owners. */
export function useReviewTrackCreation(input: CreationInput) {
  const [drawing, setDrawing] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const current = useRef(input);
  current.current = input;
  const clear = useCallback(() => setDrawing(false), []);
  useEffect(clear, [input.sourceId, input.track, input.blocked, clear]);
  useEffect(() => {
    if (!drawing) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      clear();
      if (anchor.current?.isConnected) anchor.current.focus();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [drawing, clear]);
  const active = drawing && input.track === 'text' && !input.blocked;
  const admit = (action: () => void) =>
    (input.beforeAction ?? ((accepted) => accepted()))(() => {
      if (current.current.sourceId === input.sourceId && !current.current.blocked) action();
    });
  const addText = (trigger: HTMLElement) => {
    anchor.current = trigger;
    admit(() => {
      if (!current.current.text) return;
      if (input.range) {
        clear();
        current.current.text.add(true, input.range);
      } else setDrawing((value) => !value);
    });
  };
  const commitText = (range: Extract<ReviewAnchor, { kind: 'range' }>) => {
    if (!active || current.current.sourceId !== input.sourceId) return;
    input.text?.add(true, range);
    clear();
  };
  return {
    active,
    clear,
    commitText,
    tools: <ReviewTrackCreationTools {...input} active={active} addText={addText} admit={admit} />,
  };
}

/** Contextual commands replace lane-header creation buttons; picker intent captures its lane. */
function ReviewTrackCreationTools(
  props: CreationInput & {
    active: boolean;
    addText(anchor: HTMLElement): void;
    admit(action: () => void): void;
  }
) {
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<{ sourceId: string | undefined; lane: ReviewAudioLane } | null>(null);
  const lane = props.track === 'voiceover' || props.track === 'music' ? props.track : null;
  if (props.track === 'text' && props.text) {
    const available =
      !props.range ||
      props.text.projection.output(props.range.end) -
        props.text.projection.output(props.range.start) >=
        0.05;
    return (
      <ReviewToolGroup
        active={props.active}
        label={translate('gallery.videoReview.textFragmentAdd')}
      >
        <ReviewButton
          label={translate('gallery.videoReview.textFragmentAdd')}
          toolbarLabel={translate('gallery.videoReview.textFragmentAdd')}
          aria-pressed={props.active}
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
          if (file && intent && intent.sourceId === props.sourceId)
            props.admit(() => props.onImportFile(file, intent.lane));
        }}
      />
      {lane === 'voiceover' && (
        <ReviewButton
          label={translate('gallery.videoReview.recordVoiceover')}
          toolbarLabel={translate('gallery.videoReview.recordVoiceover')}
          className={reviewIconButtonClassName}
          disabled={props.blocked}
          onClick={() => props.admit(props.onRecordVoiceover)}
        >
          <Mic size={16} aria-hidden />
        </ReviewButton>
      )}
      <ReviewButton
        label={importLabel}
        toolbarLabel={importLabel}
        className={reviewIconButtonClassName}
        disabled={props.blocked}
        onClick={(event) => {
          const trigger = event.currentTarget;
          props.admit(() => {
            if (props.onOpenAudio) props.onOpenAudio(trigger, lane);
            else {
              picker.current = { sourceId: props.sourceId, lane };
              input.current?.click();
            }
          });
        }}
      >
        {lane === 'music' ? <Music size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
      </ReviewButton>
    </>
  );
}
