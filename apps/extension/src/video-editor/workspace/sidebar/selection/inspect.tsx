import { InspectFxPanel } from './inspection/fx';
import './inspector.css';
import { InspectorSelectionFamilyContext } from './grouped-inspector/presentation';
import { InspectorDetails } from './shared/details';
import { translate } from '../../../../platform/i18n';
import { buildClipLabel } from '../../../../features/video/project/timeline';
import { PANEL_META_CLASS_NAME } from './shared/panel';
import { InspectHistorySpanPanel } from './inspection/history-span';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { WorkspaceSidebarSelectionPanelProps } from '../contracts/selection-panel';
import { SelectionEmptyState } from './inspection/helpers';
import { InspectCursorPanel } from './inspection/cursor';
import { InspectActionPanel, InspectTransitionPanel } from './inspection/effects';
import { InspectClipPanel } from './inspection/clip';
import { InspectMotionPanel, InspectMotionConnectionPanel } from './inspection/motion';
import { InspectObjectTrackPanel } from './inspection/object-track';
import { InspectScenePanel } from './inspection/scene';
import { InspectTrackPanel } from './inspection/track';
import { InspectHistoryLanePanel } from './inspection/history-lane';
import { InspectMotionLanePanel } from './inspection/motion-lane';

const PANEL_STACK_CLASS_NAME = 'space-y-3';

export function WorkspaceSidebarInspectPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const clipTrack = props.selectedClip
    ? props.project.tracks.find((track) => track.id === props.selectedClip?.trackId)
    : undefined;
  const family =
    props.selection.kind === 'clip'
      ? `clip:${props.selectedClip?.type}:${clipTrack?.role ?? ''}`
      : props.selection.kind === 'track'
        ? `track:${props.selectedTrack?.kind}`
        : props.selection.kind;
  return (
    <InspectorSelectionFamilyContext.Provider value={family}>
      <div
        data-ui="video-editor.inspector.content"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3"
      >
        <div className={PANEL_STACK_CLASS_NAME}>
          <SelectionBody {...props} />
        </div>
      </div>
    </InspectorSelectionFamilyContext.Provider>
  );
}

function SelectionBody(props: WorkspaceSidebarSelectionPanelProps) {
  switch (props.selection.kind) {
    case VideoEditorSelectionKind.EFFECT_INSTANCE:
      return <InspectFxPanel {...props} instanceId={props.selection.effectInstanceId} />;
    case VideoEditorSelectionKind.HISTORY_SPAN:
      return (
        <InspectHistorySpanPanel
          key={JSON.stringify(props.selection)}
          {...props}
          target={props.selection}
        />
      );
    case VideoEditorSelectionKind.HISTORY_LANE:
      return <InspectHistoryLanePanel {...props} />;
    case VideoEditorSelectionKind.MOTION_CONNECTION:
      return <InspectMotionConnectionPanel {...props} />;
    case VideoEditorSelectionKind.MOTION_LANE:
      return <InspectMotionLanePanel {...props} />;
    case VideoEditorSelectionKind.SCENE:
      return <InspectScenePanel {...props} />;
    case VideoEditorSelectionKind.CLIP_GROUP: {
      const ids = props.selection.clipIds;
      const clips = props.project.clips.filter((clip) => ids.includes(clip.id));
      return (
        <section data-ui="video-editor.inspector.clip-group" className="space-y-3">
          <p className={PANEL_META_CLASS_NAME}>
            {translate('videoEditor.sidebar.clipGroup')}: {clips.length}
          </p>
          <InspectorDetails label={translate('videoEditor.sidebar.inspectorMoreDetails')}>
            <ul className="space-y-2 text-sm text-[var(--sniptale-color-text-primary)]">
              {clips.map((clip) => (
                <li key={clip.id} className="truncate" title={buildClipLabel(props.project, clip)}>
                  {buildClipLabel(props.project, clip)}
                </li>
              ))}
            </ul>
          </InspectorDetails>
        </section>
      );
    }
    case VideoEditorSelectionKind.CLIP:
      return props.selectedClip ? <InspectClipPanel {...props} /> : <SelectionEmptyState />;
    case VideoEditorSelectionKind.TRACK:
      return props.selectedTrack ? <InspectTrackPanel {...props} /> : <SelectionEmptyState />;
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return props.selectedTransition ? (
        <InspectTransitionPanel {...props} />
      ) : (
        <SelectionEmptyState />
      );
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
      return props.selectedCursorSample ? (
        <InspectCursorPanel {...props} />
      ) : (
        <SelectionEmptyState />
      );
    case VideoEditorSelectionKind.OBJECT_TRACK:
      return props.selectedObjectTrack ? (
        <InspectObjectTrackPanel {...props} />
      ) : (
        <SelectionEmptyState />
      );
    case VideoEditorSelectionKind.ACTION_OCCURRENCE:
      return props.selectedActionOccurrence ? (
        <InspectActionPanel {...props} />
      ) : (
        <SelectionEmptyState />
      );
    case VideoEditorSelectionKind.MOTION_REGION:
      return props.selectedMotionRegion ? (
        <InspectMotionPanel {...props} />
      ) : (
        <SelectionEmptyState />
      );
  }
}
