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
  mode: VideoEditorInspectorMode;
  openGridSettings: () => void;
  openSelection: () => void;
}

export interface VideoEditorWorkspaceState {
  audioRecordingDialogOpen: boolean;
  confirm: VideoEditorWorkspaceConfirmState;
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

  const closeAudioRecordingDialog = useCallback(() => setAudioRecordingDialogOpen(false), []);
  const openAudioRecordingDialog = useCallback(() => setAudioRecordingDialogOpen(true), []);

  return {
    audioRecordingDialogOpen,
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

function useVideoEditorInspectorState(): VideoEditorWorkspaceInspectorState {
  const [mode, setMode] = useState<VideoEditorInspectorMode>('selection');

  const openGridSettings = useCallback(() => setMode('grid'), []);
  const openSelection = useCallback(() => setMode('selection'), []);

  return useMemo(
    () => ({ mode, openGridSettings, openSelection }),
    [mode, openGridSettings, openSelection]
  );
}

/**
 * Holds local shell-only UI state such as sidebar collapse and preview resizing.
 */
export function useVideoEditorWorkspaceState(): VideoEditorWorkspaceState {
  const confirmDialog = useVideoEditorConfirmDialogState();
  const libraryPanel = useVideoEditorLibraryPanelState();
  const audioRecordingDialog = useAudioRecordingDialogState();
  const sceneBackgroundColors = useSceneBackgroundColorState();
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const inspector = useVideoEditorInspectorState();
  const [playbackRange, setPlaybackRange] = useState<VideoEditorPlaybackRange | null>(null);
  const preview = useVideoEditorWorkspacePreviewState();
  const grid = useWorkspaceGridState();

  const toggleSidebarCollapsed = useCallback(() => {
    setLeftSidebarCollapsed((value) => !value);
  }, []);

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
      audioRecordingDialogOpen: audioRecordingDialog.audioRecordingDialogOpen,
      confirm,
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
      audioRecordingDialog.audioRecordingDialogOpen,
      audioRecordingDialog.closeAudioRecordingDialog,
      audioRecordingDialog.openAudioRecordingDialog,
      clearPlaybackRange,
      confirm,
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
