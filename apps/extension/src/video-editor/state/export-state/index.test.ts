import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { translate } from '../../../platform/i18n';
import {
  VideoExportFormat,
  VideoMp4Codec,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
} from '../../../features/video/project/types';
import {
  createExportStateActions,
  cancelExportState,
  closeExportDialogState,
  completeExportState,
  createInitialExportState,
  openExportDialogState,
  startExportState,
  updateExportSettingsState,
} from './index';
import { useVideoEditorStore } from '../store';

describe('video editor store export state defaults', () => {
  it('creates a fresh initial export state object', () => {
    const first = createInitialExportState();
    const second = createInitialExportState();

    expect(first).toEqual({
      dialogOpen: false,
      isRunning: false,
      jobId: null,
      status: null,
      settings: null,
      error: null,
      lastResult: null,
    });
    expect(first).not.toBe(second);
  });
});

function verifyOpenExportDialogState() {
  const project = createEmptyVideoProject('Demo', 1280, 720);

  const nextState = openExportDialogState({
    exportState: createInitialExportState(),
    project,
  });

  expect(nextState.dialogOpen).toBe(true);
  expect(nextState.settings).toMatchObject({
    width: 1280,
    height: 720,
  });
}

function verifyUpdateExportSettingsState() {
  const baseState = openExportDialogState({
    exportState: createInitialExportState(),
    project: createEmptyVideoProject('Demo', 1920, 1080),
  });

  const nextState = updateExportSettingsState(baseState, {
    quality: VideoExportQualityPreset.DRAFT,
  });

  expect(nextState.settings).toMatchObject({
    width: 1920,
    height: 1080,
    quality: VideoExportQualityPreset.DRAFT,
  });
}

function verifyRejectInvalidNumericExportSettings() {
  const baseState = openExportDialogState({
    exportState: createInitialExportState(),
    project: createEmptyVideoProject('Demo', 1920, 1080),
  });

  const nextState = updateExportSettingsState(baseState, {
    fps: Number.NaN,
    width: Number.NaN,
  });

  expect(nextState.settings).toMatchObject({
    width: 1920,
    fps: 30,
  });
}

function verifyMp4CodecClearedOutsideMp4Format() {
  const baseState = openExportDialogState({
    exportState: createInitialExportState(),
    project: createEmptyVideoProject('Demo', 1920, 1080),
  });
  const mp4State = updateExportSettingsState(baseState, {
    mp4VideoCodec: VideoMp4Codec.HEVC,
  });

  const nextState = updateExportSettingsState(mp4State, {
    format: VideoExportFormat.WEBM,
  });

  expect(nextState.settings).toEqual(
    expect.not.objectContaining({ mp4VideoCodec: VideoMp4Codec.HEVC })
  );
}

function verifyNullExportSettingsWithoutProject() {
  const nextState = openExportDialogState({
    exportState: createInitialExportState(),
    project: null,
  });

  expect(nextState).toMatchObject({
    dialogOpen: true,
    settings: null,
  });
}

function verifyCloseExportFailureState() {
  const failed = { ...createInitialExportState(), error: 'render failed' };

  expect(closeExportDialogState(failed)).toMatchObject({ dialogOpen: false, error: null });
}

function runExportStateDialogSuite() {
  it(
    'hydrates export settings from the current project when opening the dialog',
    verifyOpenExportDialogState
  );
  it(
    'merges export setting patches without dropping the existing settings object',
    verifyUpdateExportSettingsState
  );
  it('ignores non-finite numeric export setting updates', verifyRejectInvalidNumericExportSettings);
  it(
    'clears MP4 codec state after switching away from MP4 format',
    verifyMp4CodecClearedOutsideMp4Format
  );
  it(
    'keeps settings null when the dialog opens without a project',
    verifyNullExportSettingsWithoutProject
  );
  it('dismisses a visible export failure while preserving settings', verifyCloseExportFailureState);
}

describe('video editor store export state dialog helpers', runExportStateDialogSuite);

function verifyStartExportState() {
  const nextState = startExportState(createInitialExportState(), 'job-1');

  expect(nextState).toMatchObject({
    dialogOpen: false,
    isRunning: true,
    jobId: 'job-1',
    error: null,
    lastResult: null,
    status: {
      phase: VideoProjectExportPhase.PREPARING,
      progress: 0,
      message: translate('offscreenExport.storePreparing'),
    },
  });
}

function verifyCompleteExportState() {
  const nextState = completeExportState(startExportState(createInitialExportState(), 'job-1'), {
    filename: 'demo.webm',
    recordingId: 'rec-1',
    exportId: 'exp-1',
  });

  expect(nextState.isRunning).toBe(false);
  expect(nextState.jobId).toBeNull();
  expect(nextState.lastResult).toEqual({
    filename: 'demo.webm',
    recordingId: 'rec-1',
    exportId: 'exp-1',
  });
  expect(nextState.status).toEqual({
    phase: VideoProjectExportPhase.DONE,
    progress: 100,
    message: `${translate('offscreenExport.storeCompletedPrefix')} demo.webm`,
  });
}

function verifyCancelExportState() {
  const nextState = cancelExportState(startExportState(createInitialExportState(), 'job-1'));

  expect(nextState.isRunning).toBe(false);
  expect(nextState.jobId).toBeNull();
  expect(nextState.status).toEqual({
    phase: VideoProjectExportPhase.CANCELLED,
    progress: 0,
    message: translate('offscreenExport.storeCancelled'),
  });
}

function runExportStateActions(actions: ReturnType<typeof createExportStateActions>) {
  actions.openExportDialog();
  actions.closeExportDialog();
  actions.updateExportSettings({ quality: VideoExportQualityPreset.DRAFT });
  actions.startExport('job-9');
  actions.updateExportStatus({
    phase: VideoProjectExportPhase.RENDERING,
    progress: 50,
    message: 'Rendering',
  });
  actions.failExport('failed');
  actions.completeExport({
    filename: 'done.webm',
    recordingId: 'rec-1',
    exportId: 'exp-1',
  });
  actions.cancelExport();
}

function expectRecordedExportStates(recordedStates: unknown[]) {
  expect(recordedStates).toHaveLength(8);
  expect(recordedStates[0]).toMatchObject({ dialogOpen: true });
  expect(recordedStates[1]).toMatchObject({ dialogOpen: false });
  expect(recordedStates[2]).toMatchObject({
    settings: expect.objectContaining({ quality: VideoExportQualityPreset.DRAFT }),
  });
  expect(recordedStates[3]).toMatchObject({
    isRunning: true,
    jobId: 'job-9',
  });
  expect(recordedStates[4]).toMatchObject({
    status: expect.objectContaining({ phase: VideoProjectExportPhase.RENDERING }),
  });
  expect(recordedStates[5]).toMatchObject({
    isRunning: false,
    jobId: null,
    error: 'failed',
  });
  expect(recordedStates[6]).toMatchObject({
    jobId: null,
    lastResult: expect.objectContaining({ filename: 'done.webm' }),
  });
  expect(recordedStates[7]).toMatchObject({
    isRunning: false,
    status: expect.objectContaining({ phase: VideoProjectExportPhase.CANCELLED }),
  });
}

function verifyExportStateActions() {
  const recordedStates: unknown[] = [];
  const set: Parameters<typeof createExportStateActions>[0] = (partial) => {
    const nextState = typeof partial === 'function' ? partial(createStoreState()) : partial;

    recordedStates.push((nextState as { exportState: unknown }).exportState);
  };
  const actions = createExportStateActions(set);

  runExportStateActions(actions);
  expectRecordedExportStates(recordedStates);
}

function runVideoEditorStoreExportStateRuntimeSuite() {
  it('marks the export as preparing when a job starts', verifyStartExportState);
  it('stores the final export result and completion status', verifyCompleteExportState);
  it('clears the active job id when export gets cancelled', verifyCancelExportState);
  it(
    'creates store actions that delegate every export transition through set()',
    verifyExportStateActions
  );
}

describe(
  'video editor store export state runtime helpers',
  runVideoEditorStoreExportStateRuntimeSuite
);

function createStoreState() {
  const project = createEmptyVideoProject('Demo', 1920, 1080);

  return {
    ...useVideoEditorStore.getState(),
    exportState: openExportDialogState({
      exportState: createInitialExportState(),
      project,
    }),
    project,
  };
}
