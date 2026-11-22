import { ReviewAnnotationEffectsTrack } from './annotation-effects-track';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';
import type { ComponentProps } from 'react';
import { ReviewZoomTrack } from './zoom-track';
import { ReviewAudioTrack } from './audio-track';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewTrackProjection } from './track-projection';
import type {
  QuickEditAdvancedState,
  QuickEditAudioState,
} from '../../features/video/review/advanced/types';
import type { ReviewEdit, ReviewAnchor } from '../../features/video/review/types';
import type { useReviewZoomEditor } from './zoom-editor';
import type { useReviewAudio, ReviewAudioLane } from './use-review-audio';
import type { ReviewWaveform } from '../../workflows/video-review/waveform';
const EMPTY_ANNOTATION_SNAPSHOTS: ComponentProps<typeof ReviewAnnotationEffectsTrack>['snapshots'] =
  [];

const EMPTY_ANNOTATION_INSTANCES: ComponentProps<typeof ReviewAnnotationEffectsTrack>['instances'] =
  [];

/** Zoom lane on the result-time scale with shared snap candidates. */
export function ReviewZoomLane(props: {
  compact: boolean;
  beforeAction?: ReviewBeforeAction | undefined;
  advanced: QuickEditAdvancedState;
  onToggleActions?: (() => void) | undefined;
  projection?: ReviewTrackProjection;
  resultDuration: number;
  outputTime: number | null;
  edits: readonly ReviewEdit[];
  snapTimes?: readonly number[] | undefined;
  zoom: ReturnType<typeof useReviewZoomEditor>;
  sourceSelection?: ReviewAnchor | undefined;
  toOutputTime(source: number): number | null;
}) {
  return (
    <ReviewZoomTrack
      compact={props.compact}
      beforeAction={props.beforeAction}
      projection={props.projection}
      sourceSelection={props.sourceSelection}
      enabled={props.advanced.zoom.enabled}
      onToggleEnabled={() =>
        (props.beforeAction ?? ((action) => action()))(props.zoom.toggleEnabled)
      }
      duration={props.resultDuration}
      time={props.outputTime}
      regions={props.advanced.zoom.regions}
      edits={props.edits}
      snapTimes={props.snapTimes}
      toOutputTime={props.toOutputTime}
      selectedId={props.zoom.selection}
      onSelect={props.zoom.setSelection}
      onLink={(id, linkTo) =>
        (props.beforeAction ?? ((action) => action()))(() => props.zoom.change(id, { linkTo }))
      }
      linkSelectedId={props.zoom.linkSelection}
      onSelectLink={(id) =>
        (props.beforeAction ?? ((action) => action()))(() => props.zoom.setLinkSelection(id))
      }
      onDragCommit={props.zoom.commitDrag}
    />
  );
}

/** Audio lane on the result-time scale with bounded clip mutations. */
export function ReviewAudioLane(props: {
  lane?: 'originalAudio' | 'voiceover' | 'music';
  compact?: boolean | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
  edits: readonly ReviewEdit[];
  selectedEditId: string | undefined;
  onOriginalRange(range: ReviewAnchor): void;
  onSelectSpeed(edit: ReviewEdit): void;
  hasOriginalAudio: boolean;
  showAddedAudio: boolean;
  snapTimes: readonly number[];
  audioState: QuickEditAudioState;
  waveforms?: ReadonlyMap<string, ReviewWaveform> | undefined;
  projection?: ReviewTrackProjection;
  resultDuration: number;
  audio: ReturnType<typeof useReviewAudio>;
  busy: boolean;
  onImportFile(file: File, lane: ReviewAudioLane, timelineTime?: number): void;
}) {
  const selectedId = props.audio.selectedId;
  const selectedClipId =
    props.lane === 'originalAudio'
      ? null
      : selectedId &&
          (props.lane
            ? props.audioState[props.lane]
            : [...props.audioState.voiceover, ...props.audioState.music]
          ).some((clip) => clip.id === selectedId)
        ? selectedId
        : null;
  const selectedEditId =
    props.selectedEditId &&
    props.edits.some((edit) => edit.id === props.selectedEditId && edit.kind === 'speed')
      ? props.selectedEditId
      : undefined;
  return (
    <ReviewAudioTrack
      lane={props.lane}
      compact={props.compact}
      beforeAction={props.beforeAction}
      originalEditor={props.audio}
      selectedEditId={selectedEditId}
      edits={props.edits}
      onOriginalRange={props.onOriginalRange}
      onSelectSpeed={props.onSelectSpeed}
      hasOriginalAudio={props.hasOriginalAudio}
      showAddedAudio={props.showAddedAudio}
      projection={props.projection}
      waveforms={props.waveforms}
      assets={props.audio.assets}
      onMuteLane={props.audio.toggleLaneMute}
      snapTimes={props.snapTimes}
      audio={props.audioState}
      duration={props.resultDuration}
      selectedId={selectedClipId}
      busy={props.busy}
      onSelect={props.audio.setSelectedId}
      onMoveClip={props.audio.moveClip}
      onTrimClip={props.audio.trimClip}
      onOriginal={props.audio.setOriginal}
      onImportFile={props.onImportFile}
    />
  );
}

/** Annotation lane maps the retained editor gestures to the same timeline interval contract. */
export function ReviewAnnotationLane({
  sourceId,
  tool,
  editor,
  advanced,
  onSelect,
  ...lane
}: Omit<
  ComponentProps<typeof ReviewAnnotationEffectsTrack>,
  | 'instances'
  | 'enabled'
  | 'onEnabled'
  | 'onBegin'
  | 'onPreview'
  | 'onCommit'
  | 'onCancel'
  | 'onSelect'
> & {
  sourceId: string | undefined;
  tool: string;
  editor: ReturnType<typeof useReviewAnnotationEffects>;
  advanced: QuickEditAdvancedState;
  onSelect: ((id: string) => void) | undefined;
}) {
  return (
    <ReviewAnnotationEffectsTrack
      {...lane}
      snapshots={lane.snapshots.length ? lane.snapshots : EMPTY_ANNOTATION_SNAPSHOTS}
      key={JSON.stringify([sourceId, tool])}
      instances={advanced.annotationEffects?.instances ?? EMPTY_ANNOTATION_INSTANCES}
      textClips={advanced.annotationEffects?.textClips}
      enabled={advanced.annotationEffects?.enabled !== false}
      onEnabled={editor.enabled}
      onSelect={(id) => onSelect?.(id)}
      onBegin={editor.beginGesture}
      onPreview={editor.previewGesture}
      onCommit={editor.commitGesture}
      onCancel={editor.cancelGesture}
    />
  );
}
