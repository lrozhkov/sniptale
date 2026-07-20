import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';

type PlacementCommands = Pick<
  VideoEditorSessionActions,
  | 'clearPlacementMode'
  | 'startActionPointPlacement'
  | 'startMotionAreaPlacement'
  | 'startMotionFocusPlacement'
  | 'startMotionPathStopAreaPlacement'
  | 'startMotionPathStopPointPlacement'
> &
  Pick<VideoEditorProjectActions, 'startObjectTrackAnchorPlacement'>;

export function createWorkspaceSidebarPlacementActions(store: PlacementCommands) {
  return {
    onClearPlacementMode: store.clearPlacementMode,
    onStartActionPointPlacement: store.startActionPointPlacement,
    onStartMotionAreaPlacement: store.startMotionAreaPlacement,
    onStartMotionFocusPlacement: store.startMotionFocusPlacement,
    onStartMotionPathStopAreaPlacement: store.startMotionPathStopAreaPlacement,
    onStartMotionPathStopPointPlacement: store.startMotionPathStopPointPlacement,
    onStartObjectTrackAnchorPlacement: store.startObjectTrackAnchorPlacement,
  };
}
