import { useEffect, useRef, useState } from 'react';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n';
import type { VideoProject } from '../../../../../features/video/project/types';
import {
  VideoEditorSelectionKind,
  type VideoEditorSelection,
} from '../../../../contracts/selection';
import {
  getAutoProcessingClipChoices,
  type AutoProcessingActions,
  type AutoProcessingPreview,
  type AutoProcessingRequest,
} from '../../../../project/operations/auto-transform';

export interface AutoProcessingWorkflowProps {
  project: VideoProject;
  selection: VideoEditorSelection | null;
  actions: AutoProcessingActions;
  onSeek: (time: number) => void;
  onClose: () => void;
}
const defaults = (): VideoAutoProcessingSettings => ({
  ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS,
  enabled: true,
  stableSegments: {
    ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS.stableSegments,
    speedUpPlaybackRate: 4,
  },
});

function defaultClipId(selection: VideoEditorSelection | null) {
  return selection &&
    (selection.kind === VideoEditorSelectionKind.CLIP ||
      selection.kind === VideoEditorSelectionKind.ACTION_OCCURRENCE ||
      selection.kind === VideoEditorSelectionKind.HISTORY_SPAN)
    ? selection.clipId
    : null;
}
interface AutoProcessingWorkflowState {
  step: 'setup' | 'review';
  scope: string[];
  settings: VideoAutoProcessingSettings;
  camera: boolean;
  analysis: AutoProcessingPreview | null;
  preview: AutoProcessingPreview | null;
  selectedIds: string[];
  phase: 'idle' | 'preparing' | 'applying';
  originalInterval: { start: number; end: number } | null;
  message: string;
}

export function useAutoProcessingWorkflow(props: AutoProcessingWorkflowProps) {
  const choices = getAutoProcessingClipChoices(props.project);
  const [state, setState] = useState(() => initialWorkflowState(props.selection, choices));
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
    },
    []
  );
  const patch = (next: Partial<AutoProcessingWorkflowState>) =>
    setState((current) => ({ ...current, ...next }));
  const invalidate = (
    change: (current: AutoProcessingWorkflowState) => Partial<AutoProcessingWorkflowState>
  ) => {
    epoch.current++;
    setState((current) => ({
      ...current,
      phase: 'idle',
      preview: null,
      analysis: null,
      selectedIds: [],
      message: '',
      ...change(current),
    }));
  };
  const { preview, analysis, selectedIds, scope, camera, settings } = state;
  const stale = preview !== null && !props.actions.isCurrent(preview);
  const busy = state.phase !== 'idle';
  const prepare = async () => {
    const revision = ++epoch.current;
    patch({ phase: 'preparing', preview: null, message: '' });
    const request: AutoProcessingRequest = {
      targets: choices
        .filter((choice) => scope.includes(choice.clipId))
        .map(({ clipId, recordingId, sourceInstanceId }) => ({
          clipId,
          recordingId,
          sourceInstanceId,
        })),
      settings,
      camera,
    };
    try {
      const result = await props.actions.prepare(request, analysis ? selectedIds : undefined);
      if (revision !== epoch.current) return;
      if (result.status === 'stale') {
        patch({ message: translate('videoEditor.timeline.autoStale'), analysis: null });
        return;
      }
      patch({
        analysis: result,
        preview: result,
        selectedIds: result.selectedIds,
        step: 'review',
        message:
          result.status === 'blocked' ? translate('videoEditor.timeline.autoBatchBlocked') : '',
      });
    } catch {
      if (revision === epoch.current)
        patch({ message: translate('videoEditor.timeline.autoTransformUnavailable') });
    } finally {
      if (revision === epoch.current) patch({ phase: 'idle' });
    }
  };
  const apply = async () => {
    if (!preview || preview.status !== 'ready' || !preview.selectedIds.length || stale || busy)
      return;
    const revision = ++epoch.current;
    patch({ phase: 'applying' });
    try {
      const result = await props.actions.apply(preview);
      if (revision !== epoch.current) return;
      if (result === 'applied') {
        props.onClose();
        return;
      }
      patch({
        preview: null,
        message: translate(
          result === 'stale'
            ? 'videoEditor.timeline.autoStale'
            : 'videoEditor.timeline.autoBatchBlocked'
        ),
      });
    } catch {
      if (revision === epoch.current)
        patch({
          preview: null,
          message: translate('videoEditor.timeline.autoTransformUnavailable'),
        });
    } finally {
      if (revision === epoch.current) patch({ phase: 'idle' });
    }
  };
  return {
    ...state,
    choices,
    stale,
    busy,
    applying: state.phase === 'applying',
    prepare,
    apply,
    status: stale ? translate('videoEditor.timeline.autoStale') : state.message,
    selectionChanged: analysis !== null && preview === null,
    close: () => {
      if (state.phase !== 'applying') props.onClose();
    },
    setOriginalInterval: (originalInterval: AutoProcessingWorkflowState['originalInterval']) =>
      patch({ originalInterval }),
    setStep: (step: AutoProcessingWorkflowState['step']) => patch({ step }),
    patchSettings: (next: Partial<VideoAutoProcessingSettings['stableSegments']>) =>
      invalidate((current) => ({
        settings: {
          ...current.settings,
          stableSegments: { ...current.settings.stableSegments, ...next },
        },
      })),
    toggleScope: (clipId: string) =>
      invalidate((current) => ({
        scope: current.scope.includes(clipId)
          ? current.scope.filter((id) => id !== clipId)
          : [...current.scope, clipId],
      })),
    toggleCamera: () => invalidate((current) => ({ camera: !current.camera })),
    toggleSuggestion: (id: string) =>
      setState((current) => ({
        ...current,
        preview: null,
        message: '',
        selectedIds: current.selectedIds.includes(id)
          ? current.selectedIds.filter((value) => value !== id)
          : [...current.selectedIds, id],
      })),
    viewOriginal: (start: number, end: number) => {
      props.onSeek(start);
      patch({ originalInterval: { start, end } });
    },
  };
}

function initialWorkflowState(
  selection: VideoEditorSelection | null,
  choices: ReturnType<typeof getAutoProcessingClipChoices>
): AutoProcessingWorkflowState {
  const id = defaultClipId(selection);
  const scope =
    id &&
    choices.some((choice) => choice.clipId === id && choice.recordingId && choice.sourceInstanceId)
      ? [id]
      : [];
  return {
    step: 'setup',
    scope,
    settings: defaults(),
    camera: false,
    analysis: null,
    preview: null,
    selectedIds: [],
    phase: 'idle',
    originalInterval: null,
    message: '',
  };
}
