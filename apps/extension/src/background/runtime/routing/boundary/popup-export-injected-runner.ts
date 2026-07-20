import { browserScripting } from '@sniptale/platform/browser/scripting';
import {
  INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY,
  WEB_SNAPSHOT_INJECTED_RUNNER_PATH,
  type InjectedWebSnapshotRunnerState,
  type InjectedWebSnapshotSaveRequest,
} from '../../../../features/web-snapshot/injected-runner-contract';

type InjectedWebSnapshotRunnerArgs = {
  request: InjectedWebSnapshotSaveRequest;
  stateKey: string;
};

const activeInjectedWebSnapshotExportTabs = new Set<number>();

function prepareInjectedWebSnapshotRunner(args: InjectedWebSnapshotRunnerArgs): void {
  const state: InjectedWebSnapshotRunnerState = {
    request: args.request,
  };
  (globalThis as Record<string, unknown>)[args.stateKey] = state;
}

async function readInjectedWebSnapshotRunnerResult(args: { stateKey: string }): Promise<unknown> {
  const state = (globalThis as Record<string, unknown>)[args.stateKey];
  if (typeof state !== 'object' || state === null || !('result' in state)) {
    return {
      error: 'Injected web snapshot runner did not complete.',
      success: false,
      warnings: [],
    };
  }

  try {
    return await (state as { result: unknown }).result;
  } finally {
    delete (globalThis as Record<string, unknown>)[args.stateKey];
  }
}

function getInjectedWebSnapshotResult(
  results: Array<chrome.scripting.InjectionResult<unknown>>
): unknown {
  return results.find((result) => result.frameId === 0)?.result ?? results[0]?.result;
}

export async function executeInjectedWebSnapshotContentExport(args: {
  allowAnonymousCrossOriginAssets: boolean;
  allowAuthenticatedSameOriginAssets: boolean;
  contentIntentGrant?: InjectedWebSnapshotSaveRequest['contentIntentGrant'];
  requestId: string;
  resolvedTabId: number;
}): Promise<unknown> {
  if (activeInjectedWebSnapshotExportTabs.has(args.resolvedTabId)) {
    throw new Error('Web snapshot export is already running for this tab.');
  }

  activeInjectedWebSnapshotExportTabs.add(args.resolvedTabId);
  const target = { frameIds: [0], tabId: args.resolvedTabId };
  const loaderArgs: InjectedWebSnapshotRunnerArgs = {
    request: {
      allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
      allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
      ...(args.contentIntentGrant === undefined
        ? {}
        : { contentIntentGrant: args.contentIntentGrant }),
      requestId: args.requestId,
    },
    stateKey: INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY,
  };

  try {
    await browserScripting.executeScript({
      args: [loaderArgs],
      func: prepareInjectedWebSnapshotRunner,
      target,
    });
    await browserScripting.executeScript({ files: [WEB_SNAPSHOT_INJECTED_RUNNER_PATH], target });
    const results = await browserScripting.executeScript({
      args: [{ stateKey: INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY }],
      func: readInjectedWebSnapshotRunnerResult,
      target,
    });

    return getInjectedWebSnapshotResult(results);
  } finally {
    activeInjectedWebSnapshotExportTabs.delete(args.resolvedTabId);
  }
}
