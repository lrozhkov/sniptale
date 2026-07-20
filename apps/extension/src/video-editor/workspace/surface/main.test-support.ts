import { vi } from 'vitest';

export function createHeaderController() {
  return {
    inspectorMode: 'selection' as const,
    libraryPanelOpen: true,
    leftSidebarCollapsed: true,
    onCloseLibraryPanel: vi.fn(),
    onOpenAudioRecordingDialog: vi.fn(),
    onOpenExportDialog: vi.fn(),
    onOpenGridSettings: vi.fn(),
    onOpenLibraryPanel: vi.fn(),
    onRenameProject: vi.fn(),
    onSelectScene: vi.fn(),
    onToggleLibraryPanel: vi.fn(),
    onToggleSidebar: vi.fn(),
    grid: {
      magnetEnabled: true,
      onToggleMagnet: vi.fn(),
    },
    projectExportsCount: 2,
    projectName: 'Workspace Main',
    saveStateMeta: { className: 'is-saved', label: 'Saved' },
  };
}

export function createPreviewController() {
  return {
    assetUrls: { asset: 'blob:asset' },
    editing: createPreviewEditingController(),
    grid: {
      color: '#94a3b8',
      enabled: false,
      magnetEnabled: true,
      size: 80,
      snapEnabled: true,
    },
    onImport: {
      audio: vi.fn(),
      image: vi.fn(),
      video: vi.fn(),
    },
    pointAuthoring: {
      onClearPlacementMode: vi.fn(),
      onUpdateActionEventDetails: vi.fn(),
      onUpdateMotionRegion: vi.fn(),
      onUpsertObjectTrackCorrectionAnchor: vi.fn(),
    },
    preferences: createPreviewPreferencesController(),
    project: { clips: [], id: 'project-1', tracks: [], transitions: [] },
    transport: {
      currentTime: 8,
      isPlaying: false,
      onPausePlayback: vi.fn(),
      onSeek: vi.fn(),
      onTogglePlay: vi.fn(),
      playbackRange: null,
      registerPreviewRuntime: vi.fn(),
    },
    selection: createPreviewSelectionController(),
  } as never;
}

function createPreviewPreferencesController() {
  return {
    mode: 'live',
    onModeChange: vi.fn(),
    onRasterPresetChange: vi.fn(),
    onRetrySave: vi.fn(),
    onZoomChange: vi.fn(),
    rasterPreset: '720p',
    saveFailed: false,
    zoom: 'fit',
  };
}

function createPreviewSelectionController() {
  return {
    onSelectClip: vi.fn(),
    onSelectScene: vi.fn(),
    placementMode: null,
    selectedActionEvent: null,
    selectedClipId: 'clip-1',
    selectedMotionRegion: null,
  };
}

function createPreviewEditingController() {
  return {
    onAddActionEvent: vi.fn(),
    onAddAnnotationOverlay: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onAddShapeOverlay: vi.fn(),
    onAddSubtitleOverlay: vi.fn(),
    onAddTextOverlay: vi.fn(),
    onAddTrack: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    onUpdateClipTransform: vi.fn(),
  };
}
