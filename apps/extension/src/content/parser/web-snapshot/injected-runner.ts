import { saveCurrentPageWebSnapshot } from './save';
import type { ContentWebSnapshotSaveRequest, ContentWebSnapshotSaveResponse } from './save';
import {
  INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY,
  type InjectedWebSnapshotRunnerState,
} from '../../../features/web-snapshot/injected-runner-contract';

type InjectedWebSnapshotFailureResponse = { error: string; success: false; warnings: [] };

function getInjectedRunnerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runInjectedWebSnapshotSave(
  request: ContentWebSnapshotSaveRequest
): Promise<ContentWebSnapshotSaveResponse | InjectedWebSnapshotFailureResponse> {
  try {
    return await saveCurrentPageWebSnapshot(request);
  } catch (error) {
    return {
      error: getInjectedRunnerErrorMessage(error),
      success: false,
      warnings: [],
    };
  }
}

function createInjectedRunnerFailure(error: Error): InjectedWebSnapshotFailureResponse {
  return {
    error: getInjectedRunnerErrorMessage(error),
    success: false,
    warnings: [],
  };
}

function readInjectedRunnerState(): InjectedWebSnapshotRunnerState | null {
  const state = (globalThis as Record<string, unknown>)[INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY];
  if (typeof state !== 'object' || state === null || !('request' in state)) {
    return null;
  }

  return state as InjectedWebSnapshotRunnerState;
}

export function runInjectedWebSnapshotSaveFromPreparedState(): void {
  const state = readInjectedRunnerState();
  if (!state) {
    (globalThis as Record<string, unknown>)[INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY] = {
      result: Promise.resolve(
        createInjectedRunnerFailure(new Error('Injected web snapshot runner state is unavailable.'))
      ),
    };
    return;
  }

  state.result = runInjectedWebSnapshotSave(state.request);
}

runInjectedWebSnapshotSaveFromPreparedState();
