import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import { VideoEditorEffectsLibraryDock } from '../../library/effects-dock';
import type { WorkspaceEffectBundlesState } from './effect-bundles';
import { buildProjectTransitionSegments } from '../../../features/video/project/transition/project';
import { VideoProjectClipType } from '../../../features/video/project/types';
import type { EffectLibraryOperations } from '../../library/effects-dock/operations';

export function VideoEditorWorkspaceEffectsLibrary(props: {
  controller: VideoEditorWorkspaceController;
  effectBundles: WorkspaceEffectBundlesState;
  effectOperations: EffectLibraryOperations;
  isOpen: boolean;
  onOpenChange(open: boolean): void;
}): React.JSX.Element | null {
  const controller = props.controller;
  const selectedClip = controller.preview.project.clips.find(
    ({ id }) => id === controller.preview.selection.selectedClipId
  );
  const selectedTransitionId = resolveEffectTransitionTargetId(
    controller.preview.project,
    controller.preview.transport.currentTime,
    controller.sidebar.state.selectedTransition?.id ?? null
  );
  return (
    <VideoEditorEffectsLibraryDock
      catalogs={props.effectBundles.catalogs}
      currentTime={controller.preview.transport.currentTime}
      errorCode={props.effectBundles.errorCode}
      isLoading={props.effectBundles.isLoading}
      isOpen={props.isOpen}
      operations={props.effectOperations}
      onAddAnnotation={(input) =>
        controller.preview.editing.onAddAnnotationOverlay(
          undefined,
          controller.preview.transport.currentTime,
          input
        )
      }
      onApplyEffect={controller.sidebar.projectActions.onApplyEffectDocument}
      onClose={() => props.onOpenChange(false)}
      onDeleteEffectBundle={props.effectBundles.onDeleteEffectBundle}
      onImportEffectFile={props.effectBundles.onImportEffectFile}
      onSetEffectBundleEnabled={props.effectBundles.onSetEffectBundleEnabled}
      selectedClipId={
        selectedClip &&
        selectedClip.type !== VideoProjectClipType.AUDIO &&
        selectedClip.type !== VideoProjectClipType.EFFECT
          ? selectedClip.id
          : null
      }
      selectedTransitionId={selectedTransitionId}
    />
  );
}

export function resolveEffectTransitionTargetId(
  project: VideoEditorWorkspaceController['preview']['project'],
  currentTime: number,
  selectedTransitionId: string | null
): string | null {
  const occupiedTransitionIds = new Set(
    (project.effectInstances ?? []).flatMap((instance) =>
      instance.kind === 'transition' && instance.target.kind === 'transition'
        ? [instance.target.transitionId]
        : []
    )
  );
  const segments = buildProjectTransitionSegments(project).filter(
    ({ id }) => !occupiedTransitionIds.has(id)
  );
  if (selectedTransitionId && segments.some(({ id }) => id === selectedTransitionId)) {
    return selectedTransitionId;
  }
  const active = segments.find(({ end, start }) => currentTime >= start && currentTime < end);
  if (active) return active.id;
  return segments.length === 1 ? segments[0]!.id : null;
}
