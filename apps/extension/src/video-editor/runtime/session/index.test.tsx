import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { UseVideoEditorRuntimeParams } from './types';

const mocks = vi.hoisted(() => ({
  createApplyLoadedProject: vi.fn(),
  useVideoEditorAssetUrls: vi.fn(),
  useVideoEditorPlayback: vi.fn(),
  useVideoEditorRuntimeEffects: vi.fn(),
  useTimelineClipPreviews: vi.fn(),
}));

vi.mock('./asset-urls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./asset-urls')>()),
  useVideoEditorAssetUrls: mocks.useVideoEditorAssetUrls,
}));
vi.mock('./playback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./playback')>()),
  useVideoEditorPlayback: mocks.useVideoEditorPlayback,
}));
vi.mock('./effects', () => ({
  createApplyLoadedProject: mocks.createApplyLoadedProject,
  useVideoEditorRuntimeEffects: mocks.useVideoEditorRuntimeEffects,
}));
vi.mock('./timeline-previews', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./timeline-previews')>()),
  useTimelineClipPreviews: mocks.useTimelineClipPreviews,
}));

import { useVideoEditorRuntime, type VideoEditorRuntimeController } from '.';

const fn = () => vi.fn();

function createPlaybackParams(): UseVideoEditorRuntimeParams['playback'] {
  return {
    currentTime: 2,
    isPlaying: false,
    playbackRange: null,
    placementMode: null,
    selection: { kind: VideoEditorSelectionKind.SCENE },
    selectedActionEvent: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    deleteSelection: {
      actionEvent: fn(),
      clip: fn(),
      cursorSample: fn(),
      motionRegion: fn(),
      objectTrack: fn(),
    },
    clearPlacementMode: fn(),
    setCurrentTime: fn(),
    setPlaying: fn(),
    splitClipAt: fn(),
    updateActionEventDetails: fn(),
    updateClipTransform: fn(),
    updateMotionRegion: fn(),
  };
}

function createProjectState(): UseVideoEditorRuntimeParams['projectState'] {
  return {
    setProject: fn(),
    updateProject: fn(),
    setReady: fn(),
    setError: fn(),
    setSaveState: fn(),
    setDiagnosticsOpen: fn(),
  };
}

function createExportState(): UseVideoEditorRuntimeParams['exportState'] {
  return {
    getActiveJobId: () => null,
    updateExportStatus: fn(),
    failExport: fn(),
    completeExport: fn(),
    cancelExport: fn(),
  };
}

function createLibraries(): UseVideoEditorRuntimeParams['libraries'] {
  return {
    recordings: [],
    projects: [],
    projectExports: [],
    refreshRecordings: async () => undefined,
    refreshProjects: async () => undefined,
    refreshProjectExports: async () => undefined,
  };
}

function createParams(): UseVideoEditorRuntimeParams {
  return {
    project: createEmptyVideoProject('Runtime session'),
    recordingId: 'recording-1',
    pixelsPerSecond: 80,
    playback: createPlaybackParams(),
    projectState: createProjectState(),
    exportState: createExportState(),
    libraries: createLibraries(),
  };
}

it('composes asset, preview, playback, load, and lifecycle owners into one runtime controller', () => {
  const params = createParams();
  const applyLoadedProject = vi.fn();
  const playback = {
    registerPreviewRuntime: vi.fn(),
    seekTo: vi.fn(),
    setPlaybackPlaying: vi.fn(),
    togglePlayback: vi.fn(),
  };
  mocks.useVideoEditorAssetUrls.mockReturnValue({ 'asset-1': 'blob:asset-1' });
  mocks.useTimelineClipPreviews.mockReturnValue({ 'clip-1': 'blob:preview-1' });
  mocks.createApplyLoadedProject.mockReturnValue(applyLoadedProject);
  mocks.useVideoEditorPlayback.mockReturnValue(playback);

  let controller: VideoEditorRuntimeController | null = null;
  function Probe() {
    controller = useVideoEditorRuntime(params);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  const renderedController = controller as VideoEditorRuntimeController | null;
  if (renderedController === null) {
    throw new Error('Runtime controller probe did not render.');
  }

  expect(renderedController).toMatchObject({
    applyLoadedProject: expect.any(Function),
    assetUrls: { 'asset-1': 'blob:asset-1' },
    timelinePreviews: { 'clip-1': 'blob:preview-1' },
    registerPreviewRuntime: playback.registerPreviewRuntime,
    seekTo: playback.seekTo,
    setPlaybackPlaying: playback.setPlaybackPlaying,
    togglePlayback: playback.togglePlayback,
  });
  expect(mocks.useVideoEditorPlayback).toHaveBeenCalledOnce();
  expect(mocks.useVideoEditorRuntimeEffects).toHaveBeenCalledWith(
    expect.objectContaining({
      project: params.project,
      recordingId: 'recording-1',
      applyLoadedProject: expect.any(Function),
    })
  );
  renderedController.applyLoadedProject(params.project!, 'recording-2');
  expect(mocks.createApplyLoadedProject).toHaveBeenCalledWith(
    params.projectState.setProject,
    params.projectState.setError,
    params.projectState.setDiagnosticsOpen
  );
  expect(applyLoadedProject).toHaveBeenCalledWith(params.project, 'recording-2');
});
