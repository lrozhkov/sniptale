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
      capturePreviewFrame={captureCatalogFrame}
      currentTime={preview.transport.currentTime}
      errorCode={props.effectBundles.errorCode}
      isLoading={props.effectBundles.isLoading}
      isOpen={props.isOpen}
      operations={props.effectOperations}
      onApplyEffect={onApplyEffect}
      onDeleteEffectBundle={props.effectBundles.onDeleteEffectBundle}
      onImportEffectFiles={props.effectBundles.onImportEffectFiles}
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

/** Snapshot the displayed surface once per hover; never seek or invalidate the preview renderer. */
function captureCatalogFrame(): HTMLCanvasElement | null {
  const cached = document.querySelector<HTMLVideoElement>('[data-preview-stage-cached-video]');
  const live = document.querySelector<HTMLCanvasElement>('[data-preview-stage-canvas]');
  const source =
    cached && cached.readyState >= 2 && getComputedStyle(cached).visibility !== 'hidden'
      ? cached
      : live;
  if (!source) return null;
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!width || !height) return null;
  const frame = document.createElement('canvas');
  frame.width = 320;
  frame.height = Math.max(1, Math.round((320 * height) / width));
  try {
    frame.getContext('2d')?.drawImage(source, 0, 0, frame.width, frame.height);
    return frame;
  } catch {
    return null;
  }
}
