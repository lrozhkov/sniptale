import { describe, expect, it, vi } from 'vitest';
import { VideoProjectExportPhase } from '../../../features/video/project/types';
import type { VideoEditorExportRuntimeState } from '../../contracts/export-state';
import { createExportStateActions } from './actions';
import {
  createInitialExportState,
  failExportCancellationState,
  startExportState,
} from './transitions';

function createRenderingExportState(): VideoEditorExportRuntimeState {
  return {
    ...startExportState(createInitialExportState(), 'job-1'),
    status: {
      phase: VideoProjectExportPhase.RENDERING,
      progress: 45,
      message: 'Rendering',
    },
  };
}

function expectActiveCancelFailureState(state: VideoEditorExportRuntimeState): void {
  expect(state).toMatchObject({
    error: 'cancel failed',
    isRunning: true,
    jobId: 'job-1',
    status: {
      phase: VideoProjectExportPhase.RENDERING,
      progress: 45,
      message: 'Rendering',
    },
  });
}

describe('video editor export cancellation state', () => {
  it('keeps active export identity when a cancel request fails', () => {
    expectActiveCancelFailureState(
      failExportCancellationState(createRenderingExportState(), 'cancel failed')
    );
  });

  it('exposes a non-terminal cancellation failure action', () => {
    const set = vi.fn();
    const actions = createExportStateActions(set);

    actions.failExportCancellation('cancel failed');

    const updater = set.mock.calls[0]?.[0] as
      | ((state: { exportState: VideoEditorExportRuntimeState }) => {
          exportState: VideoEditorExportRuntimeState;
        })
      | undefined;
    expect(updater).toBeTypeOf('function');
    expectActiveCancelFailureState(
      updater!({ exportState: createRenderingExportState() }).exportState
    );
  });
});
