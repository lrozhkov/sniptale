// @vitest-environment jsdom
import { act, createRef, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import type { VideoEditorPreviewController } from '../../runtime/controller/contracts/preview';
import { useVideoEditorPlaybackPort } from '../../runtime/controller/store';
import { useVideoEditorStore } from '../../state/store';
import { createHeaderController, createPreviewController } from './main.test-support';
import { VideoEditorWorkspaceCanvas } from './canvas';

const preview: VideoEditorPreviewController = createPreviewController();
const upperRender = vi.fn();
const materialsRender = vi.fn();
const layout = {
  workspaceSplitRef: createRef<HTMLDivElement>(),
  audioRecordingDialogOpen: false,
};
const viewer = { sourceViewerActive: false, setSourceViewerActive: vi.fn() };

vi.mock('../../runtime/controller/composition/hooks', async (original) => ({
  ...(await original<typeof import('../../runtime/controller/composition/hooks')>()),
  useWorkspacePreviewContext: () => viewer,
  useVideoEditorBlockingOverlayContext: () => false,
  useVideoEditorHeaderController: () => createHeaderController(),
  useVideoEditorLayoutController: () => layout,
  useVideoEditorTimelineController: () => null,
  useVideoEditorPreviewController: (followPlaybackTime = true) => {
    useVideoEditorPlaybackPort((port) => (followPlaybackTime ? port.currentTime : null));
    upperRender();
    return preview;
  },
}));
vi.mock('./effects-library', () => ({ VideoEditorWorkspaceEffectsLibrary: () => null }));
vi.mock('./materials', () => ({
  VideoEditorMaterials: () => {
    materialsRender();
    return <div data-testid="materials" />;
  },
}));
vi.mock('../../preview/stage', () => ({
  PreviewStage: ({ currentTime }: { currentTime: number }) => (
    <output data-testid="stage-time">{currentTime}</output>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function workspaceProps(): ComponentProps<typeof VideoEditorWorkspaceCanvas> {
  return {
    onRevealWatermark: vi.fn(),
    onRevealBookends: vi.fn(),
    inspectorPanel: { isOpen: false, onToggle: vi.fn() },
    onMaterialsOpenChange: vi.fn(),
    materialsPanel: {
      resize: {
        width: 280,
        min: 240,
        max: 400,
        onPointerDown: vi.fn(),
        onKeyDown: vi.fn(),
        onDoubleClick: vi.fn(),
      },
      fullHeight: false,
      onToggle: vi.fn(),
    },
    materialsOpen: true,
    inspector: null,
    activeInsertKind: null,
    effectBundles: {
      catalogs: [],
      errorCode: null,
      isLoading: false,
      onDeleteEffectBundle: async () => undefined,
      onImportEffectFiles: async () => [],
      onSetEffectBundleEnabled: async () => undefined,
    },
    effectOperations: { disabled: false, operationError: null, run: async () => undefined },
    effectsLibraryDockOpen: false,
    previewHeightStyle: { height: '280px' },
    onClearActiveInsertKind: vi.fn(),
    onEffectsLibraryDockOpenChange: vi.fn(),
  };
}

it('updates the stage across forward and backward seeks without rerendering its materials owner', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useVideoEditorStore.getState().setProject(
    createVideoProjectFromRecording({
      recordingId: 'workspace-clock-source',
      filename: 'clock.webm',
      width: 160,
      height: 90,
      duration: 10,
      mimeType: 'video/webm',
      size: 1,
    })
  );
  useVideoEditorStore.getState().setCurrentTime(8);
  Object.defineProperty(preview.transport, 'currentTime', {
    get: () => useVideoEditorStore.getState().currentTime,
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<VideoEditorWorkspaceCanvas {...workspaceProps()} />));
    const upperRenders = upperRender.mock.calls.length;
    const materialRenders = materialsRender.mock.calls.length;
    expect(materialRenders).toBeGreaterThan(0);
    for (const time of [8.5, 2]) {
      act(() => useVideoEditorStore.getState().setCurrentTime(time));
      expect(container.querySelector('[data-testid="stage-time"]')?.textContent).toBe(String(time));
      expect(upperRender).toHaveBeenCalledTimes(upperRenders);
      expect(materialsRender).toHaveBeenCalledTimes(materialRenders);
    }
  } finally {
    act(() => root.unmount());
  }
});
