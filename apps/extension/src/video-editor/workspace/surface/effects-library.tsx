import {
  useVideoEditorPreviewController,
  useVideoEditorSelectionsContext,
} from '../../runtime/controller/composition/hooks';
import {
  useVideoEditorClipSelectionPort,
  useVideoEditorEffectEditingPort,
} from '../../runtime/controller/store';
import { VideoEditorEffectsLibraryDock } from '../../library/effects-dock';
import type { WorkspaceEffectBundlesState } from './effect-bundles';
import { buildProjectTransitionSegments } from '../../../features/video/project/transition/project';
import { VideoProjectClipType } from '../../../features/video/project/types';
import type { EffectLibraryOperations } from '../../library/effects-dock/operations';

export function VideoEditorWorkspaceEffectsLibrary(props: {
  effectBundles: WorkspaceEffectBundlesState;
  effectOperations: EffectLibraryOperations;
  isOpen: boolean;
  kind: 'standalone' | 'targetEffect' | 'transition';
}): React.JSX.Element | null {
  const preview = useVideoEditorPreviewController();
  const selections = useVideoEditorSelectionsContext();
  const editorSelection = useVideoEditorClipSelectionPort((port) => port.selection);
  const onApplyEffect = useVideoEditorEffectEditingPort((port) => port.applyEffectDocument);
  if (!preview) return null;
  const selectedEffectTarget =
    editorSelection.kind === 'effect-instance'
      ? preview.project.effectInstances?.find(
          (instance) => instance.id === editorSelection.effectInstanceId
        )?.target
      : undefined;
  const selectedClip = preview.project.clips.find(
    ({ id }) =>
      id ===
      (selectedEffectTarget?.kind === 'clip'
        ? selectedEffectTarget.clipId
        : preview.selection.selectedClipId)
  );
  const selectedTransitionId = resolveEffectTransitionTargetId(
    preview.project,
    preview.transport.currentTime,
    selections.selectedTransition?.id ?? null
  );
  return (
    <VideoEditorEffectsLibraryDock
      effectTarget={selectedEffectTarget ?? null}
      catalogs={props.effectBundles.catalogs}
      kind={props.kind}
      capturePreviewFrame={captureCatalogFrame}
      currentTime={preview.transport.currentTime}
      appendTime={Math.max(
        0,
        ...preview.project.clips
          .filter((clip) =>
            selections.selectedTrack?.kind === 'PRIMARY' &&
            selections.selectedTrack.role !== 'CAMERA'
              ? clip.trackId === selections.selectedTrack.id
              : true
          )
          .map((clip) => clip.startTime + clip.duration)
      )}
      errorCode={props.effectBundles.errorCode}
      isLoading={props.effectBundles.isLoading}
      isOpen={props.isOpen}
      operations={props.effectOperations}
      onApplyEffect={onApplyEffect}
      onDeleteEffectBundle={props.effectBundles.onDeleteEffectBundle}
      onImportEffectFiles={props.effectBundles.onImportEffectFiles}
      onSetEffectBundleEnabled={props.effectBundles.onSetEffectBundleEnabled}
      selectedTrackId={
        selections.selectedTrack?.kind === 'PRIMARY' && selections.selectedTrack.role !== 'CAMERA'
          ? selections.selectedTrack.id
          : null
      }
      selectedClipId={
        selectedClip && selectedClip.type !== VideoProjectClipType.AUDIO ? selectedClip.id : null
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
  const segments = buildProjectTransitionSegments(project);
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
