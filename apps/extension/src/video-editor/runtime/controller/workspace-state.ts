import { useCallback, useEffect, useRef, useState } from 'react';
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

  return {
    confirmDialog,
    onConfirmDialogCancel: () => closeDialog(false),
    onConfirmDialogConfirm: () => closeDialog(true),
    requestConfirm: (dialog: VideoEditorConfirmDialogState) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setConfirmDialog(dialog);
      }),
  };
}

function useVideoEditorLibraryPanelState() {
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);

  return {
    libraryPanelOpen,
    closeLibraryPanel: () => setLibraryPanelOpen(false),
    openLibraryPanel: () => setLibraryPanelOpen(true),
    toggleLibraryPanel: () => setLibraryPanelOpen((value) => !value),
  };
}

function useAudioRecordingDialogState() {
  const [audioRecordingDialogOpen, setAudioRecordingDialogOpen] = useState(false);

  return {
    audioRecordingDialogOpen,
    closeAudioRecordingDialog: () => setAudioRecordingDialogOpen(false),
    openAudioRecordingDialog: () => setAudioRecordingDialogOpen(true),
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

  return {
    preview,
    recentColors: recentColorState.recentColors,
    rememberRecentColor: recentColorState.rememberRecentColor,
    resetPreview: () => setPreview(null),
    setPreview,
  };
}

function useVideoEditorInspectorState(): VideoEditorWorkspaceInspectorState {
  const [mode, setMode] = useState<VideoEditorInspectorMode>('selection');

  return {
    mode,
    openGridSettings: () => setMode('grid'),
    openSelection: () => setMode('selection'),
  };
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

  return {
    audioRecordingDialogOpen: audioRecordingDialog.audioRecordingDialogOpen,
    confirm: {
      dialog: confirmDialog.confirmDialog,
      onCancel: confirmDialog.onConfirmDialogCancel,
      onConfirm: confirmDialog.onConfirmDialogConfirm,
      request: confirmDialog.requestConfirm,
    },
    inspector,
    libraryPanelOpen: libraryPanel.libraryPanelOpen,
    leftSidebarCollapsed,
    grid,
    playbackRange,
    sceneBackgroundColors,
    clearPlaybackRange: () => setPlaybackRange(null),
    closeAudioRecordingDialog: audioRecordingDialog.closeAudioRecordingDialog,
    closeLibraryPanel: libraryPanel.closeLibraryPanel,
    openAudioRecordingDialog: audioRecordingDialog.openAudioRecordingDialog,
    openLibraryPanel: libraryPanel.openLibraryPanel,
    preview,
    setPlaybackRange,
    toggleLibraryPanel: libraryPanel.toggleLibraryPanel,
    toggleSidebarCollapsed,
  };
}
