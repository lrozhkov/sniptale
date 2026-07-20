import { translate } from '../../../../platform/i18n';
import type { VideoEditorControllerStorePort } from '../../../contracts/controller-store';
import type { VideoEditorWorkspaceState } from '../workspace-state';

export function requestTrackDeletion(
  store: VideoEditorControllerStorePort,
  workspace: Pick<VideoEditorWorkspaceState, 'confirm'>,
  trackId: string
) {
  const project = store.project;
  if (!project) {
    return;
  }

  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) {
    return;
  }

  void workspace.confirm
    .request({
      cancelText: translate('common.actions.cancel'),
      confirmText: translate('common.actions.delete'),
      message: project.clips.some((clip) => clip.trackId === trackId)
        ? translate('videoEditor.timeline.deleteTrackWithClipsConfirm')
        : translate('videoEditor.timeline.deleteTrackConfirm'),
      title: `${translate('videoEditor.timeline.deleteTrackTitle')} · ${track.name}`,
    })
    .then((confirmed) => {
      if (confirmed) {
        store.deleteTrack(trackId);
      }
    });
}

export function createTimelineTrackActions(
  store: VideoEditorControllerStorePort,
  workspace: Pick<VideoEditorWorkspaceState, 'confirm'>
) {
  return {
    onAddTrackLogicalLane: store.addTrackLogicalLane,
    onDeleteTrack: (trackId: string) => requestTrackDeletion(store, workspace, trackId),
    onMoveTrack: store.moveTrack,
    onToggleTrackLock: store.toggleTrackLock,
    onToggleTrackVisibility: store.toggleTrackVisibility,
  };
}
