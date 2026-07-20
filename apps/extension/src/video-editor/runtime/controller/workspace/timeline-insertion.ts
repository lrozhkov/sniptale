import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoBlockKind } from '../../../../features/video/project/types/index';
import type { VideoEditorControllerStorePort } from '../../../contracts/controller-store';
import { translate } from '../../../../platform/i18n';

export function createWorkspaceTimelineInsertionActions(
  store: VideoEditorControllerStorePort,
  actions: Pick<
    VideoEditorActionHandlers,
    'handleImportAudio' | 'handleImportImage' | 'handleImportVideo'
  >,
  projectUpdaters: {
    addActionEvent: (
      preset: NonNullable<
        NonNullable<VideoEditorControllerStorePort['project']>['actionEvents'][number]['preset']
      >
    ) => void;
    addMotionRegion: (startTime?: number) => void;
    enableCursorTrack: () => void;
  }
) {
  return {
    onAddActionEvent: projectUpdaters.addActionEvent,
    onAddAnnotationOverlay: store.addAnnotationOverlay,
    onAddMotionRegion: projectUpdaters.addMotionRegion,
    onAddVideoBlock: (blockKind: VideoBlockKind) => store.addVideoBlock(blockKind),
    onAddShapeOverlay: store.addShapeOverlay,
    onAddSubtitleOverlay: () => store.addSubtitleOverlay(),
    onAddTextOverlay: () => store.addTextOverlay(),
    onAddTrack: store.addTrack,
    onEnableCursorTrack: projectUpdaters.enableCursorTrack,
    onImport: {
      audio: actions.handleImportAudio,
      image: actions.handleImportImage,
      video: actions.handleImportVideo,
    },
    onUnsupportedFileDrop: () =>
      store.setError(translate('videoEditor.timeline.fileDropUnsupported')),
  };
}
