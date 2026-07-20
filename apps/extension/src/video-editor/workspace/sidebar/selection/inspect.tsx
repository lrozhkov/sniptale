import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { WorkspaceSidebarSelectionPanelProps } from '../contracts/selection-panel';
import { SelectionEmptyState } from './inspection/helpers';
import { InspectCursorPanel } from './inspection/cursor';
import { InspectActionPanel, InspectTransitionPanel } from './inspection/effects';
import { InspectClipPanel } from './inspection/clip';
import { InspectMotionPanel } from './inspection/motion';
import { InspectObjectTrackPanel } from './inspection/object-track';
import { InspectScenePanel } from './inspection/scene';
import { InspectTrackPanel } from './inspection/track';

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
    case VideoEditorSelectionKind.ACTION_SEGMENT:
      return props.selectedActionEvent ? (
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
