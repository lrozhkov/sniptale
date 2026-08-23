import {
  useVideoEditorPreviewController,
  useVideoEditorSelectionsContext,
} from '../../runtime/controller/composition/hooks';
import { useVideoEditorEffectEditingPort } from '../../runtime/controller/store';
import { VideoEditorEffectsLibraryDock } from '../../library/effects-dock';
import type { WorkspaceEffectBundlesState } from './effect-bundles';
import { buildProjectTransitionSegments } from '../../../features/video/project/transition/project';
import { VideoProjectClipType } from '../../../features/video/project/types';
import type { EffectLibraryOperations } from '../../library/effects-dock/operations';

export function VideoEditorWorkspaceEffectsLibrary(props: {
  effectBundles: WorkspaceEffectBundlesState;
  effectOperations: EffectLibraryOperations;
  isOpen: boolean;
  onOpenChange(open: boolean): void;
}): React.JSX.Element | null {
  const preview = useVideoEditorPreviewController();
  const selections = useVideoEditorSelectionsContext();
  const onApplyEffect = useVideoEditorEffectEditingPort((port) => port.applyEffectDocument);
  if (!preview) return null;
  const selectedClip = preview.project.clips.find(
    ({ id }) => id === preview.selection.selectedClipId
  );
  const selectedTransitionId = resolveEffectTransitionTargetId(
    preview.project,
    preview.transport.currentTime,
    selections.selectedTransition?.id ?? null
  );
  return (
    <VideoEditorEffectsLibraryDock
      catalogs={props.effectBundles.catalogs}
      currentTime={preview.transport.currentTime}
      errorCode={props.effectBundles.errorCode}
      isLoading={props.effectBundles.isLoading}
      isOpen={props.isOpen}
      operations={props.effectOperations}
      onApplyEffect={onApplyEffect}
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
  project: NonNullable<ReturnType<typeof useVideoEditorPreviewController>>['project'],
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
