import type { FullPageCaptureBackendKind } from '../../../contracts/full-page-capture';
// policyStateId: full-page-capture-leases - storage-backed job/document lease with bounded recovery.
import {
  clearStoredFullPageCaptureLease,
  readStoredFullPageCaptureLease,
  writeStoredFullPageCaptureLease,
  type StoredFullPageCaptureLease,
} from '../../storage/full-page-capture';
import { requirePolicyStateTtlMs } from '../../routing-contracts/capabilities/policy/ttl';

const FULL_PAGE_CAPTURE_LEASE_POLICY_ID = 'full-page-capture-leases';
let mutationQueue = Promise.resolve<unknown>(undefined);
let jobQueue = Promise.resolve<unknown>(undefined);

function enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
  const next = mutationQueue.catch(() => undefined).then(work);
  mutationQueue = next;
  return next;
}

export function runFullPageCaptureExclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = jobQueue.catch(() => undefined).then(work);
  jobQueue = next;
  return next;
}

export async function acquireFullPageCaptureLease(args: {
  backendKind: FullPageCaptureBackendKind;
  documentId: string;
  exportRunId?: string;
  jobId: string;
  ownerToken: string;
  runtimeGeneration: string;
  tabId: number;
}): Promise<StoredFullPageCaptureLease> {
  return enqueueMutation(async () => {
    const current = await readStoredFullPageCaptureLease();
    if (current && current.ownerToken !== args.ownerToken) {
      throw new Error('Another full-page capture requires recovery');
    }
    const lease: StoredFullPageCaptureLease = {
      backendKind: args.backendKind,
      documentId: args.documentId,
      expiresAtEpochMs: Date.now() + requirePolicyStateTtlMs(FULL_PAGE_CAPTURE_LEASE_POLICY_ID),
      ...(args.exportRunId === undefined ? {} : { exportRunId: args.exportRunId }),
      jobId: args.jobId,
      ownerToken: args.ownerToken,
      runtimeGeneration: args.runtimeGeneration,
      tabId: args.tabId,
    };
    await writeStoredFullPageCaptureLease(lease);
    return lease;
  });
}

export async function renewFullPageCaptureLease(ownerToken: string): Promise<void> {
  await enqueueMutation(async () => {
    const current = await readStoredFullPageCaptureLease();
    if (!current || current.ownerToken !== ownerToken) {
      throw new Error('Full-page capture lease is missing or stale');
    }
    await writeStoredFullPageCaptureLease({
      ...current,
      expiresAtEpochMs: Date.now() + requirePolicyStateTtlMs(FULL_PAGE_CAPTURE_LEASE_POLICY_ID),
    });
  });
}

export async function releaseFullPageCaptureLease(ownerToken: string): Promise<void> {
  await enqueueMutation(() => clearStoredFullPageCaptureLease(ownerToken));
}

export { readStoredFullPageCaptureLease };
