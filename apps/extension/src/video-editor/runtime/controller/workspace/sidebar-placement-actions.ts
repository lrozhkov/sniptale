import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';

type PlacementCommands = Pick<
  VideoEditorSessionActions,
  | 'clearPlacementMode'
  | 'startActionPointPlacement'
  | 'startMotionAreaPlacement'
  | 'startMotionFocusPlacement'
> &
  Pick<VideoEditorProjectActions, 'startObjectTrackAnchorPlacement'>;

export function createWorkspaceSidebarPlacementActions(store: PlacementCommands) {
  return {
    onClearPlacementMode: store.clearPlacementMode,
    onStartActionPointPlacement: store.startActionPointPlacement,
    onStartMotionAreaPlacement: store.startMotionAreaPlacement,
    onStartMotionFocusPlacement: store.startMotionFocusPlacement,

    onStartObjectTrackAnchorPlacement: store.startObjectTrackAnchorPlacement,
  };
}
