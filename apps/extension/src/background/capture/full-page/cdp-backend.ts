// policyStateId: full-page-capture-leases - volatile CDP ownership mirrors the durable full-page recovery lease.
import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { armDebuggerActivation } from '../../debugger/session/activation';
import { attachDebugger } from '../../debugger/session/attach';
import { detachDebugger } from '../../debugger/session/detach';
import { detachPersistedDebuggerClient } from '../../debugger/session/detach-core';
import { parseCaptureScreenshotResult } from './helpers';
import type { FullPageRasterBackend } from './raster';
import { withTimeout } from '../../debugger/infra';
import { DEBUGGER_TIMEOUT_MS } from '../../debugger/constants';

const ownedLeases = new Map<number, string>();

function withAbortSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined, stage: string) {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new Error(`${stage} was cancelled`)
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(signal.reason instanceof Error ? signal.reason : new Error(`${stage} was cancelled`));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

export async function createCdpFullPageRasterBackend(args: {
  ownerToken: string;
  tabId: number;
}): Promise<FullPageRasterBackend> {
  const currentOwner = ownedLeases.get(args.tabId);
  if (currentOwner && currentOwner !== args.ownerToken) {
    throw new Error('Full-page CDP raster backend is busy');
  }
  await attachDebugger(
    args.tabId,
    'screenshot',
    armDebuggerActivation({
      client: 'screenshot',
      reason: 'unattended-full-page-archive-capture',
      tabId: args.tabId,
    })
  );
  ownedLeases.set(args.tabId, args.ownerToken);
  try {
    await withTimeout(
      browserDebugger.sendCommand({ tabId: args.tabId }, 'Page.enable'),
      DEBUGGER_TIMEOUT_MS,
      'Page.enable for full-page capture'
    );
  } catch (error) {
    try {
      await releaseOwnedCdpLease(args.tabId, args.ownerToken);
    } catch (detachError) {
      throw new AggregateError(
        [error, detachError],
        `Full-page CDP initialization and detach failed: ${String(error)}; ${String(detachError)}`,
        { cause: detachError }
      );
    }
    throw error;
  }
  return {
    async captureFrame(signal) {
      if (ownedLeases.get(args.tabId) !== args.ownerToken) {
        throw new Error('Full-page CDP raster lease is stale');
      }
      const result = await withAbortSignal(
        withTimeout(
          browserDebugger.sendCommand<unknown>({ tabId: args.tabId }, 'Page.captureScreenshot', {
            captureBeyondViewport: false,
            format: 'png',
            fromSurface: true,
          }),
          DEBUGGER_TIMEOUT_MS,
          'Page.captureScreenshot for full-page capture'
        ),
        signal,
        'Page.captureScreenshot for full-page capture'
      );
      return `data:image/png;base64,${parseCaptureScreenshotResult(result).data}`;
    },
    release: () => releaseOwnedCdpLease(args.tabId, args.ownerToken),
  };
}

export async function releaseOwnedCdpLease(tabId: number, ownerToken: string): Promise<void> {
  if (ownedLeases.get(tabId) !== ownerToken) return;
  await detachDebugger(tabId, 'screenshot');
  if (ownedLeases.get(tabId) === ownerToken) ownedLeases.delete(tabId);
}

export async function recoverOwnedCdpLease(tabId: number, ownerToken: string): Promise<void> {
  const currentOwner = ownedLeases.get(tabId);
  if (currentOwner && currentOwner !== ownerToken) {
    throw new Error('Persisted full-page CDP lease conflicts with a current owner');
  }
  if (currentOwner === ownerToken) {
    await detachPersistedDebuggerClient(tabId, 'screenshot');
    if (ownedLeases.get(tabId) === ownerToken) ownedLeases.delete(tabId);
    return;
  }
  await detachPersistedDebuggerClient(tabId, 'screenshot');
}

export function hasOwnedCdpLease(tabId: number, ownerToken: string): boolean {
  return ownedLeases.get(tabId) === ownerToken;
}
