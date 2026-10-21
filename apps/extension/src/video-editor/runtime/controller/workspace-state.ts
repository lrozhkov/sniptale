import { editMotionTransitionPhase } from '../../../features/video/project/motion/timing';
import { editMotionFocus } from '../../../features/video/project/motion/focus-appearance';
import { editMotionSpatialSettings } from '../../../features/video/project/motion/spatial';
import { isVideoProjectUtilityLaneLocked } from '../../../features/video/project/utility-lanes';
import type { VideoProject } from '../../../features/video/project/types';
import type {
  VideoEditorWatermarkPreview,
  VideoEditorSceneEdgesPreview,
  VideoEditorMotionPreview,
} from '../../contracts/workspace';
import { VideoEditorSelectionKind, type VideoEditorSelection } from '../../contracts/selection';
import { useWorkspacePreference } from './workspace-preferences';
import type { VideoEditorAudioRecordingTarget } from '../../contracts/insertion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadRecentColors, pushRecentColor } from '../../../composition/persistence/recent-colors';
import type { VideoProjectSceneBackground } from '../../../features/video/project/types/index';
import type { VideoEditorInspectorMode } from '../../contracts/workspace';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';
import { useWorkspaceGridState, type VideoEditorWorkspaceGridState } from './workspace-grid-state';
import { useVideoEditorWorkspacePreviewState } from './workspace-preview-state';

export interface VideoEditorConfirmDialogState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
}

interface VideoEditorWorkspaceColorState {
  preview: VideoProjectSceneBackground | null;
  recentColors: string[];
  rememberRecentColor: (color: string) => Promise<void>;
  resetPreview: () => void;
  setPreview: (sceneBackground: VideoProjectSceneBackground | null) => void;
}

interface VideoEditorWorkspaceConfirmState {
  dialog: VideoEditorConfirmDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
  request: (dialog: VideoEditorConfirmDialogState) => Promise<boolean>;
}

interface VideoEditorWorkspaceInspectorState {
  sceneEdgesPreview: VideoEditorSceneEdgesPreview | null;
  previewSceneEdges: (preview: VideoEditorSceneEdgesPreview | null) => void;
  watermarkPreview: VideoEditorWatermarkPreview | null;
  previewWatermark: (preview: VideoEditorWatermarkPreview | null) => void;
  registerWatermarkAbort: (abort: () => void) => () => void;
  cancelWatermarkAcquisition: () => void;
  mode: VideoEditorInspectorMode;
  openSelection: () => void;
  motionPreview: VideoEditorMotionPreview | null;
  previewMotion: (preview: VideoEditorMotionPreview | null) => void;
}

export interface VideoEditorWorkspaceState {
  projectDialogOpen: boolean;
  setProjectDialogOpen: (open: boolean) => void;
  autoProcessingModalOpen: boolean;
  setAutoProcessingModalOpen: (open: boolean) => void;
  audioRecordingDialogOpen: boolean;
  audioRecordingTarget: VideoEditorAudioRecordingTarget | null;
  openTrackAudioRecordingDialog: (target: VideoEditorAudioRecordingTarget) => void;
  confirm: VideoEditorWorkspaceConfirmState;
  voiceRecording: ReturnType<typeof useVoiceRecordingAdmission>;
  inspector: VideoEditorWorkspaceInspectorState;
  libraryPanelOpen: boolean;
  leftSidebarCollapsed: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  preview: ReturnType<typeof useVideoEditorWorkspacePreviewState>;
  grid: VideoEditorWorkspaceGridState;
  sceneBackgroundColors: VideoEditorWorkspaceColorState;
  clearPlaybackRange: () => void;
  closeAudioRecordingDialog: () => void;
  closeLibraryPanel: () => void;
  openAudioRecordingDialog: () => void;
  openLibraryPanel: () => void;
  setPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
  toggleLibraryPanel: () => void;
  toggleSidebarCollapsed: () => void;
}

function useVideoEditorConfirmDialogState() {
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<VideoEditorConfirmDialogState | null>(null);

  const closeDialog = useCallback((confirmed: boolean) => {
    setConfirmDialog(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(confirmed);
  }, []);

  const onConfirmDialogCancel = useCallback(() => closeDialog(false), [closeDialog]);
  const onConfirmDialogConfirm = useCallback(() => closeDialog(true), [closeDialog]);
  const requestConfirm = useCallback(
    (dialog: VideoEditorConfirmDialogState) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setConfirmDialog(dialog);
      }),
    []
  );

  return {
    confirmDialog,
    onConfirmDialogCancel,
    onConfirmDialogConfirm,
    requestConfirm,
  };
}

function useVideoEditorLibraryPanelState() {
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);

  const closeLibraryPanel = useCallback(() => setLibraryPanelOpen(false), []);
  const openLibraryPanel = useCallback(() => setLibraryPanelOpen(true), []);
  const toggleLibraryPanel = useCallback(() => setLibraryPanelOpen((value) => !value), []);

  return {
    libraryPanelOpen,
    closeLibraryPanel,
    openLibraryPanel,
    toggleLibraryPanel,
  };
}

function useAudioRecordingDialogState() {
  const [audioRecordingDialogOpen, setAudioRecordingDialogOpen] = useState(false);

  const [audioRecordingTarget, setAudioRecordingTarget] =
    useState<VideoEditorAudioRecordingTarget | null>(null);
  const closeAudioRecordingDialog = useCallback(() => {
    setAudioRecordingDialogOpen(false);
    setAudioRecordingTarget(null);
  }, []);
  const openAudioRecordingDialog = useCallback(() => {
    setAudioRecordingTarget(null);
    setAudioRecordingDialogOpen(true);
  }, []);
  const openTrackAudioRecordingDialog = useCallback((target: VideoEditorAudioRecordingTarget) => {
    setAudioRecordingTarget({ ...target });
    setAudioRecordingDialogOpen(true);
  }, []);

  return {
    audioRecordingDialogOpen,
    audioRecordingTarget,
    openTrackAudioRecordingDialog,
    closeAudioRecordingDialog,
    openAudioRecordingDialog,
  };
}

function useRecentColorsState() {
  const [recentColors, setRecentColors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void loadRecentColors()
      .then((colors) => {
        if (!cancelled) {
          setRecentColors(colors);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentColors([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rememberRecentColor = useCallback(async (color: string) => {
    try {
      const nextColors = await pushRecentColor(color);
      setRecentColors(nextColors);
    } catch {
      // Shared selector recent-color persistence should not block the editing flow.
    }
  }, []);

  return {
    recentColors,
    rememberRecentColor,
  };
}

function useSceneBackgroundColorState(): VideoEditorWorkspaceColorState {
  const recentColorState = useRecentColorsState();
  const [preview, setPreview] = useState<VideoProjectSceneBackground | null>(null);

  const resetPreview = useCallback(() => setPreview(null), []);

  return useMemo(
    () => ({
      preview,
      recentColors: recentColorState.recentColors,
      rememberRecentColor: recentColorState.rememberRecentColor,
      resetPreview,
      setPreview,
    }),
    [preview, recentColorState.recentColors, recentColorState.rememberRecentColor, resetPreview]
  );
}

function useVideoEditorInspectorState(
  setCollapsed: (collapsed: boolean) => void
): VideoEditorWorkspaceInspectorState {
  const [sceneEdgesPreview, previewSceneEdges] = useState<VideoEditorSceneEdgesPreview | null>(
    null
  );
  const [watermarkPreview, previewWatermark] = useState<VideoEditorWatermarkPreview | null>(null);
  const watermarkAbort = useRef<(() => void) | null>(null);
  const registerWatermarkAbort = useCallback((abort: () => void) => {
    watermarkAbort.current = abort;
    return () => {
      if (watermarkAbort.current === abort) watermarkAbort.current = null;
    };
  }, []);
  const cancelWatermarkAcquisition = useCallback(() => {
    const abort = watermarkAbort.current;
    watermarkAbort.current = null;
    abort?.();
    previewWatermark(null);
  }, []);
  const [mode, setMode] = useState<VideoEditorInspectorMode>('selection');
  const [motionPreview, previewMotion] = useState<VideoEditorMotionPreview | null>(null);

  const openSelection = useCallback(() => {
    setMode('selection');
    setCollapsed(false);
  }, [setCollapsed]);

  return useMemo(
    () => ({
      mode,
      openSelection,
      motionPreview,
      previewMotion,
      sceneEdgesPreview,
      previewSceneEdges,
      watermarkPreview,
      previewWatermark,
      registerWatermarkAbort,
      cancelWatermarkAcquisition,
    }),
    [
      mode,
      openSelection,
      motionPreview,
      sceneEdgesPreview,
      watermarkPreview,
      registerWatermarkAbort,
      cancelWatermarkAcquisition,
    ]
  );
}

/** The mounted recorder owns the take; the workspace only admits leaving its project. */
function useVoiceRecordingAdmission(obscured: boolean) {
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const [capturing, setCapturing] = useState(false);
  const register = useCallback((request: () => Promise<boolean>) => {
    guard.current = request;
    return () => {
      if (guard.current === request) guard.current = null;
    };
  }, []);
  const request = useCallback(async () => (guard.current ? guard.current() : true), []);
  return useMemo(
    () => ({ register, request, capturing, setCapturing, obscured }),
    [register, request, capturing, obscured]
  );
}

/**
 * Holds local shell-only UI state such as sidebar collapse and preview resizing.
 */
export function useVideoEditorWorkspaceState(): VideoEditorWorkspaceState {
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [autoProcessingModalOpen, setAutoProcessingModalOpen] = useState(false);
  const confirmDialog = useVideoEditorConfirmDialogState();
  const libraryPanel = useVideoEditorLibraryPanelState();
  const audioRecordingDialog = useAudioRecordingDialogState();
  const voiceRecording = useVoiceRecordingAdmission(
    projectDialogOpen ||
      autoProcessingModalOpen ||
      libraryPanel.libraryPanelOpen ||
      audioRecordingDialog.audioRecordingDialogOpen ||
      confirmDialog.confirmDialog !== null
  );
  const sceneBackgroundColors = useSceneBackgroundColorState();
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] =
    useWorkspacePreference('inspectorCollapsed');
  const inspector = useVideoEditorInspectorState(setLeftSidebarCollapsed);
  const [playbackRange, setPlaybackRange] = useState<VideoEditorPlaybackRange | null>(null);
  const preview = useVideoEditorWorkspacePreviewState();
  const grid = useWorkspaceGridState();

  const toggleSidebarCollapsed = useCallback(() => {
    setLeftSidebarCollapsed((value) => !value);
  }, [setLeftSidebarCollapsed]);

  const clearPlaybackRange = useCallback(() => setPlaybackRange(null), []);
  const confirm = useMemo(
    () => ({
      dialog: confirmDialog.confirmDialog,
      onCancel: confirmDialog.onConfirmDialogCancel,
      onConfirm: confirmDialog.onConfirmDialogConfirm,
      request: confirmDialog.requestConfirm,
    }),
    [
      confirmDialog.confirmDialog,
      confirmDialog.onConfirmDialogCancel,
      confirmDialog.onConfirmDialogConfirm,
      confirmDialog.requestConfirm,
    ]
  );

  return useMemo(
    () => ({
      projectDialogOpen,
      autoProcessingModalOpen,
      setProjectDialogOpen,
      setAutoProcessingModalOpen,
      audioRecordingDialogOpen: audioRecordingDialog.audioRecordingDialogOpen,
      audioRecordingTarget: audioRecordingDialog.audioRecordingTarget,
      openTrackAudioRecordingDialog: audioRecordingDialog.openTrackAudioRecordingDialog,
      confirm,
      voiceRecording,
      inspector,
      libraryPanelOpen: libraryPanel.libraryPanelOpen,
      leftSidebarCollapsed,
      grid,
      playbackRange,
      sceneBackgroundColors,
      clearPlaybackRange,
      closeAudioRecordingDialog: audioRecordingDialog.closeAudioRecordingDialog,
      closeLibraryPanel: libraryPanel.closeLibraryPanel,
      openAudioRecordingDialog: audioRecordingDialog.openAudioRecordingDialog,
      openLibraryPanel: libraryPanel.openLibraryPanel,
      preview,
      setPlaybackRange,
      toggleLibraryPanel: libraryPanel.toggleLibraryPanel,
      toggleSidebarCollapsed,
    }),
    [
      projectDialogOpen,
      autoProcessingModalOpen,
      audioRecordingDialog.audioRecordingDialogOpen,
      audioRecordingDialog.audioRecordingTarget,
      audioRecordingDialog.openTrackAudioRecordingDialog,
      audioRecordingDialog.closeAudioRecordingDialog,
      audioRecordingDialog.openAudioRecordingDialog,
      clearPlaybackRange,
      confirm,
      voiceRecording,
      grid,
      inspector,
      leftSidebarCollapsed,
      libraryPanel.closeLibraryPanel,
      libraryPanel.libraryPanelOpen,
      libraryPanel.openLibraryPanel,
      libraryPanel.toggleLibraryPanel,
      playbackRange,
      preview,
      sceneBackgroundColors,
      toggleSidebarCollapsed,
    ]
  );
}

/** Project identity invalidates a draft after Undo, restore, replacement or accepted edits. */
export function presentWorkspaceMotionPreview(
  project: VideoProject,
  selection: VideoEditorSelection,
  preview: VideoEditorMotionPreview | null
): VideoProject {
  if (
    !preview ||
    preview.project !== project ||
    selection.kind !== VideoEditorSelectionKind.MOTION_REGION ||
    selection.motionRegionId !== preview.regionId ||
    isVideoProjectUtilityLaneLocked(project, 'camera')
  )
    return project;
  const region = project.motionRegions?.find((item) => item.id === preview.regionId);
  if (!region) return project;
  if (preview.kind === 'focus') {
    const focus = editMotionFocus(project, region, preview.edit);
    if (!focus) return project;
    const edited = preview.transition
      ? editMotionTransitionPhase(focus, preview.transition)
      : focus;
    if (!edited || edited === region) return project;
    const version = edited.spotlight ? 22 : 21;
    return {
      ...project,
      version: project.version >= version ? project.version : version,
      motionRegions: project.motionRegions!.map((item) => (item === region ? edited : item)),
    };
  }
  const edited = editMotionSpatialSettings(region, preview.edit);
  if (!edited || edited === region) return project;
  const { spatialReference: _reference, ...retained } = region;
  return {
    ...project,
    version: project.version >= 19 ? project.version : 19,
    motionRegions: project.motionRegions!.map((item) =>
      item === region ? { ...retained, ...edited } : item
    ),
  };
}

/** Present a scene gesture without changing the source document or its history. */
export function presentWorkspaceWatermarkPreview(
  project: VideoProject,
  selection: VideoEditorSelection,
  preview: VideoEditorWatermarkPreview | null
): VideoProject {
  if (!preview || preview.project !== project || selection.kind !== VideoEditorSelectionKind.SCENE)
    return project;
  return {
    ...project,
    version: project.version >= 20 ? project.version : 20,
    watermark: preview.settings,
  };
}

/** Only the current accepted scene can present a disposable final-output gesture. */
export function presentWorkspaceSceneEdgesPreview(
  project: VideoProject,
  selection: VideoEditorSelection,
  preview: VideoEditorSceneEdgesPreview | null
): VideoProject {
  if (!preview || preview.project !== project || selection.kind !== VideoEditorSelectionKind.SCENE)
    return project;
  return {
    ...project,
    version: project.version >= 24 ? project.version : 24,
    sceneEdges: preview.settings,
  };
}
