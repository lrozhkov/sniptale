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
  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
      <div className={PANEL_STACK_CLASS_NAME}>
        <SelectionBody {...props} />
      </div>
    </div>
  );
}

function SelectionBody(props: WorkspaceSidebarSelectionPanelProps) {
  switch (props.selection.kind) {
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
