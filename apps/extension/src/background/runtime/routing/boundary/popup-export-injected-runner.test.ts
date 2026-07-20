import { beforeEach, expect, it, vi } from 'vitest';
import { INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY } from '../../../../features/web-snapshot/injected-runner-contract';

const { browserScriptingExecuteScriptMock } = vi.hoisted(() => ({
  browserScriptingExecuteScriptMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/scripting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/scripting')>()),
  browserScripting: {
    executeScript: browserScriptingExecuteScriptMock,
  },
}));

import { executeInjectedWebSnapshotContentExport } from './popup-export-injected-runner';

function getInjectedState(): Record<string, unknown> | undefined {
  const state = (globalThis as Record<string, unknown>)[INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY];
  return typeof state === 'object' && state !== null
    ? (state as Record<string, unknown>)
    : undefined;
}

function installExecutableInjectedRunnerMock(args: {
  result: unknown;
  resultFrameId: number;
}): void {
  browserScriptingExecuteScriptMock.mockImplementation(async (details: unknown) => {
    if (typeof details !== 'object' || details === null) {
      return [];
    }
    const record = details as Record<string, unknown>;
    if (Array.isArray(record['files'])) {
      const state = getInjectedState();
      if (state) {
        state['result'] = Promise.resolve(args.result);
      }
      return [{ frameId: 0, result: undefined }];
    }
    const scriptArgs = Array.isArray(record['args']) ? record['args'] : [];
    const scriptFunc = record['func'];
    if (typeof scriptFunc === 'function') {
      const result = await (scriptFunc as (arg: unknown) => unknown)(scriptArgs[0]);
      return [{ frameId: args.resultFrameId, result }];
    }
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  browserScriptingExecuteScriptMock.mockResolvedValue([
    { frameId: 0, result: { assetId: 'snapshot-1', success: true, warnings: [] } },
  ]);
});

it('rejects overlapping injected web snapshot exports for the same tab', async () => {
  let releaseFirstPrepare: (() => void) | undefined;
  const firstPrepare = new Promise<Array<chrome.scripting.InjectionResult<unknown>>>((resolve) => {
    releaseFirstPrepare = () =>
      resolve([{ documentId: 'document-1', frameId: 0, result: undefined }]);
  });
  browserScriptingExecuteScriptMock.mockReturnValueOnce(firstPrepare);

  const firstExport = executeInjectedWebSnapshotContentExport({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-web',
    resolvedTabId: 62,
  });
  await Promise.resolve();

  await expect(
    executeInjectedWebSnapshotContentExport({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-web-2',
      resolvedTabId: 62,
    })
  ).rejects.toThrow('Web snapshot export is already running for this tab.');

  releaseFirstPrepare?.();
  await expect(firstExport).resolves.toEqual({
    assetId: 'snapshot-1',
    success: true,
    warnings: [],
  });
});

it('passes content intent grant into injected web snapshot runner state', async () => {
  await executeInjectedWebSnapshotContentExport({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    contentIntentGrant: { grantToken: 'grant-1' },
    requestId: 'req-web',
    resolvedTabId: 62,
  });

  expect(browserScriptingExecuteScriptMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      args: [
        expect.objectContaining({
          request: expect.objectContaining({
            contentIntentGrant: { grantToken: 'grant-1' },
          }),
        }),
      ],
    })
  );
});

it('executes injected runner state lifecycle and reads fallback frame results', async () => {
  installExecutableInjectedRunnerMock({
    result: { assetId: 'snapshot-from-runner', success: true, warnings: [] },
    resultFrameId: 2,
  });

  await expect(
    executeInjectedWebSnapshotContentExport({
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: false,
      contentIntentGrant: { grantToken: 'grant-1' },
      requestId: 'req-web',
      resolvedTabId: 62,
    })
  ).resolves.toEqual({
    assetId: 'snapshot-from-runner',
    success: true,
    warnings: [],
  });
  expect(getInjectedState()).toBeUndefined();
});
