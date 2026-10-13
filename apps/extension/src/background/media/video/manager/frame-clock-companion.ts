import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import {
  matchesRecordingFrameClockBinding,
  normalizeRecordingFrameClockLease,
  RECORDING_FRAME_CLOCK_LEASE_MS,
  RECORDING_FRAME_CLOCK_PURPOSE,
  type RecordingFrameClockBinding,
  type RecordingFrameClockLease,
} from '../../../../contracts/video/recording-frame-clock';

const COMPANION_PATH = 'apps/extension/src/recording-clock/index.html';

function parseCompanionLease(url: string | undefined): RecordingFrameClockLease | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const expected = new URL(browserRuntime.getURL(COMPANION_PATH));
    if (
      parsed.protocol !== expected.protocol ||
      parsed.host !== expected.host ||
      parsed.pathname !== expected.pathname ||
      parsed.search !== ''
    )
      return null;
    return normalizeRecordingFrameClockLease(JSON.parse(decodeURIComponent(parsed.hash.slice(1))));
  } catch {
    return null;
  }
}

async function closeIssuedTab(tabId: number, lease: RecordingFrameClockLease): Promise<void> {
  try {
    const tab = await browserTabs.get(tabId);
    const actual = parseCompanionLease(tab.url ?? tab.pendingUrl);
    if (actual?.nonce === lease.nonce && matchesRecordingFrameClockBinding(actual, lease))
      await browserTabs.remove(tabId);
  } catch {
    /* A user-closed or already cleaned helper is settled. */
  }
}

/** Background alone owns privileged acquisition. Failure only removes optional synchronization. */
export async function createRecordingFrameClockCompanion(
  binding: RecordingFrameClockBinding
): Promise<RecordingFrameClockLease | null> {
  const lease: RecordingFrameClockLease = {
    ...binding,
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    nonce: crypto.randomUUID(),
    expiresAtEpochMs: Date.now() + RECORDING_FRAME_CLOCK_LEASE_MS,
  };
  try {
    // Browser inventory is the restart-safe resource owner; no additional singleton facade.
    for (const tab of await browserTabs.query({})) {
      const existing = parseCompanionLease(tab.url ?? tab.pendingUrl);
      if (existing && tab.id !== undefined && existing.expiresAtEpochMs <= Date.now())
        await closeIssuedTab(tab.id, existing);
    }
    const url =
      browserRuntime.getURL(COMPANION_PATH) + '#' + encodeURIComponent(JSON.stringify(lease));
    const tab = await browserTabs.create({ url, active: false });
    const tabId = tab.id;
    if (tabId === undefined) return null;
    setTimeout(() => {
      void closeIssuedTab(tabId, lease);
    }, RECORDING_FRAME_CLOCK_LEASE_MS);
    return lease;
  } catch {
    return null;
  }
}

/** Exact extension path and issued identity only; unrelated extension/user tabs are preserved. */
export async function closeRecordingFrameClockCompanions(
  recordingId: string | null
): Promise<void> {
  if (!recordingId) return;
  try {
    for (const tab of await browserTabs.query({})) {
      const lease = parseCompanionLease(tab.url ?? tab.pendingUrl);
      if (lease?.recordingId === recordingId && tab.id !== undefined)
        await closeIssuedTab(tab.id, lease);
    }
  } catch {
    /* Optional resource cleanup must not fail the primary lifecycle. */
  }
}
