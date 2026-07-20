// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoExportScope,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { UseVideoEditorActionHandlersParams } from './types';
import { useExportHandlers } from './export';

const { cancelProjectExportMock, startProjectExportMock } = vi.hoisted(() => ({
  cancelProjectExportMock: vi.fn(),
  startProjectExportMock: vi.fn(),
}));

vi.mock('../../project/operations/ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../project/operations/ops')>();
  return {
    ...actual,
    cancelProjectExport: cancelProjectExportMock,
    startProjectExport: startProjectExportMock,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHandlers: ReturnType<typeof useExportHandlers> | null = null;

function renderHook(params: Parameters<typeof useExportHandlers>[0]) {
  function Harness() {
    latestHandlers = useExportHandlers(params);
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

function createSelectedClip(trackId: string) {
  return {
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip',
    playbackRate: 1,
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 3,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
    assetId: 'asset-1',
  } satisfies VideoProjectVideoClip;
}

function createExportState() {
  return {
    dialogOpen: true,
    error: null,
    isRunning: false,
    jobId: null,
    lastResult: null,
    settings: {
      downloadAfterExport: true,
      format: VideoExportFormat.MP4,
      fps: 30,
      height: 720,
      quality: VideoExportQualityPreset.BALANCED,
      scope: VideoExportScope.SELECTED_CLIP,
      width: 1280,
    },
    status: null,
  };
}

function createParams(): UseVideoEditorActionHandlersParams {
  const project = createEmptyVideoProject('Export selection');
  project.clips = [createSelectedClip(project.tracks[0]!.id)];

  return {
    applyLoadedProject: vi.fn(),
    cancelExport: vi.fn(),
    currentTime: 0,
    exportState: createExportState(),
    failExportCancellation: vi.fn(),
    failExport: vi.fn(),
    libraries: {
      projectExports: [],
      projects: [],
      recordings: [],
      refreshProjectExports: vi.fn().mockResolvedValue(undefined),
      refreshProjects: vi.fn().mockResolvedValue(undefined),
      refreshRecordings: vi.fn().mockResolvedValue(undefined),
    },
    moveClip: vi.fn(),
    project,
    projects: [],
    selectedClipId: 'clip-1',
    setError: vi.fn(),
    startExport: vi.fn(),
    trimClipEnd: vi.fn(),
    trimClipStart: vi.fn(),
    upsertAsset: vi.fn(),
    addAssetClip: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'job-1'),
  });
  latestHandlers = null;
  startProjectExportMock.mockResolvedValue({ success: true });
  cancelProjectExportMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestHandlers = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('exports only the selected clip range when the dialog scope targets a clip', async () => {
  const params = createParams();
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleStartExport();
  });

  expect(params.startExport).toHaveBeenCalledWith('job-1');
  expect(startProjectExportMock).toHaveBeenCalledWith(
    'job-1',
    params.project,
    expect.objectContaining({
      rangeEndSeconds: 7,
      rangeStartSeconds: 3,
      selectedClipIds: ['clip-1'],
      scope: VideoExportScope.SELECTED_CLIP,
    })
  );
});

it('fails export when selected-clip scope is requested without an active clip', async () => {
  const params = createParams();
  params.selectedClipId = null;
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleStartExport();
  });

  expect(params.failExport).toHaveBeenCalledWith(
    translate('videoEditor.exportDialog.selectedClipMissing')
  );
  expect(params.startExport).not.toHaveBeenCalled();
  expect(startProjectExportMock).not.toHaveBeenCalled();
});

it('surfaces synchronous project handoff failures after entering export progress', async () => {
  const params = createParams();
  startProjectExportMock.mockRejectedValueOnce(
    new Error('Project export input handoff failed: inputIntegrityFailure')
  );
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleStartExport();
  });

  expect(params.startExport).toHaveBeenCalledWith('job-1');
  expect(params.failExport).toHaveBeenCalledWith(
    'Project export input handoff failed: inputIntegrityFailure'
  );
});

it('keeps the active export state when cancellation fails', async () => {
  const params = createParams();
  params.exportState = { ...params.exportState, isRunning: true, jobId: 'job-1' };
  cancelProjectExportMock.mockRejectedValueOnce(new Error('worker restarted'));
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleCancelExport();
  });

  expect(cancelProjectExportMock).toHaveBeenCalledWith('job-1');
  expect(params.cancelExport).not.toHaveBeenCalled();
  expect(params.failExportCancellation).toHaveBeenCalledWith('worker restarted');
  expect(params.failExport).not.toHaveBeenCalled();
});

it('allows cancellation to be retried after a cancel request failure', async () => {
  const params = createParams();
  params.exportState = { ...params.exportState, isRunning: true, jobId: 'job-1' };
  cancelProjectExportMock
    .mockRejectedValueOnce(new Error('worker restarted'))
    .mockResolvedValueOnce(undefined);
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleCancelExport();
    await latestHandlers?.handleCancelExport();
  });

  expect(cancelProjectExportMock).toHaveBeenCalledTimes(2);
  expect(cancelProjectExportMock).toHaveBeenNthCalledWith(1, 'job-1');
  expect(cancelProjectExportMock).toHaveBeenNthCalledWith(2, 'job-1');
  expect(params.failExportCancellation).toHaveBeenCalledWith('worker restarted');
  expect(params.cancelExport).toHaveBeenCalledOnce();
});

it('clears the active export state only after cancellation is accepted', async () => {
  const params = createParams();
  params.exportState = { ...params.exportState, isRunning: true, jobId: 'job-1' };
  renderHook(params);

  await act(async () => {
    await latestHandlers?.handleCancelExport();
  });

  expect(cancelProjectExportMock).toHaveBeenCalledWith('job-1');
  expect(params.cancelExport).toHaveBeenCalledOnce();
  expect(params.failExport).not.toHaveBeenCalled();
});
