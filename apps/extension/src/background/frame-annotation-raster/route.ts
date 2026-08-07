// policyStateId: frame-annotation-raster-jobs - the worker lease and pending preparation
// are disposable facets of the bounded staged raster job authority.
import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { ensureOffscreenDocument, waitForOffscreenReady } from '../offscreen-document/service';
import { getBackgroundRuntimeMessaging } from '../routing-contracts/runtime-messaging/services';
import type { FrameAnnotationRasterReferencePayload } from '../../contracts/messaging/contracts/runtime-message/frame-annotation-raster.types';
import { deleteFrameAnnotationRasterJob } from '../../composition/persistence/frame-annotation-raster-jobs';
import { acquireMediaMutationPermit } from '../mutation-exclusion/media-activity';

const LEASE_TIMEOUT_MS = 2 * 60 * 1_000;
const PREPARE_TIMEOUT_MS = 10_000;
let activeLease: {
  id: string;
  phase: 'prepared' | 'running';
  releaseMutationPermit: () => void;
  timeout: ReturnType<typeof setTimeout>;
} | null = null;
let pendingPreparation: {
  cancelled: boolean;
  id: string;
  releaseMutationPermit: () => void;
} | null = null;

export function routeFrameAnnotationRasterMessage(
  message: { type: string; operation?: unknown; leaseId?: unknown; reference?: unknown },
  sendResponse: ResponseSender
): boolean {
  if (message.type !== MessageType.FRAME_ANNOTATION_RASTERIZE) return false;
  if (message.operation === 'prepare' && isLeaseId(message.leaseId)) {
    const leaseId = message.leaseId;
    void acquireFrameAnnotationRasterLease(leaseId).then(
      (leaseId) => sendResponse({ success: true, result: leaseId }),
      (error) => sendResponse({ success: false, error: toErrorMessage(error) })
    );
    return true;
  }
  if (message.operation === 'cancel' && isLeaseId(message.leaseId)) {
    const leaseId = message.leaseId;
    void cancelFrameAnnotationRasterLease(leaseId).then(
      () => {
        sendResponse({ success: true, result: 'cancelled' });
      },
      (error) => {
        sendResponse({ success: false, error: toErrorMessage(error) });
      }
    );
    return true;
  }
  if (message.operation !== 'rasterize') return false;
  if (!isFrameAnnotationRasterReference(message.reference)) return false;
  void runFrameAnnotationRaster(message.reference).then(
    () => sendResponse({ success: true, result: 'completed' }),
    (error) =>
      sendResponse({
        success: false,
        error: toErrorMessage(error),
      })
  );
  return true;
}

async function runFrameAnnotationRaster(
  reference: FrameAnnotationRasterReferencePayload
): Promise<void> {
  if (!activeLease || activeLease.id !== reference.jobId) {
    throw new Error('Frame annotation raster lease mismatch');
  }
  if (activeLease.phase !== 'prepared') {
    throw new Error('Frame annotation raster lease is already running');
  }
  activeLease.phase = 'running';
  try {
    await ensureOffscreenDocument('Render frame annotations for image export');
    await waitForOffscreenReady();
    const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
        reference,
      })
    );
    if (!response || typeof response !== 'object' || response['success'] !== true) {
      throw new Error(
        response && typeof response === 'object' && typeof response['error'] === 'string'
          ? response['error']
          : 'Frame annotation rasterization failed'
      );
    }
  } finally {
    releaseFrameAnnotationRasterLease(reference.jobId);
  }
}

async function acquireFrameAnnotationRasterLease(id: string): Promise<string> {
  if (activeLease || pendingPreparation) {
    throw new Error('Frame annotation raster export is already in progress');
  }
  const releaseMutationPermit = acquireMediaMutationPermit();
  if (!releaseMutationPermit) throw new Error('privacy-erasure-in-progress');
  pendingPreparation = { cancelled: false, id, releaseMutationPermit };
  let transferredToLease = false;
  try {
    await withTimeout(initializeFrameAnnotationRasterLease(id), PREPARE_TIMEOUT_MS);
    assertPreparationIsCurrent(id);
    const timeout = setTimeout(() => {
      void expireFrameAnnotationRasterLease(id);
    }, LEASE_TIMEOUT_MS);
    activeLease = { id, phase: 'prepared', releaseMutationPermit, timeout };
    transferredToLease = true;
    return id;
  } finally {
    if (pendingPreparation?.id === id) pendingPreparation = null;
    if (!transferredToLease) releaseMutationPermit();
  }
}

async function initializeFrameAnnotationRasterLease(id: string): Promise<void> {
  await ensureOffscreenDocument('Prepare frame annotation image export');
  assertPreparationIsCurrent(id);
  await waitForOffscreenReady();
  assertPreparationIsCurrent(id);
}

function assertPreparationIsCurrent(id: string): void {
  if (!pendingPreparation || pendingPreparation.id !== id || pendingPreparation.cancelled) {
    throw new Error('Frame annotation raster preparation was cancelled');
  }
}

async function cancelFrameAnnotationRasterLease(id: string): Promise<void> {
  const preparation = pendingPreparation?.id === id ? pendingPreparation : null;
  if (preparation) preparation.cancelled = true;
  try {
    await deleteFrameAnnotationRasterJob(id);
  } finally {
    preparation?.releaseMutationPermit();
    if (activeLease?.id === id && activeLease.phase === 'prepared') {
      releaseFrameAnnotationRasterLease(id);
    }
  }
}

async function expireFrameAnnotationRasterLease(id: string): Promise<void> {
  try {
    await deleteFrameAnnotationRasterJob(id);
  } finally {
    releaseFrameAnnotationRasterLease(id);
  }
}

function releaseFrameAnnotationRasterLease(id: string): void {
  if (!activeLease || activeLease.id !== id) return;
  const lease = activeLease;
  activeLease = null;
  clearTimeout(lease.timeout);
  lease.releaseMutationPermit();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Frame annotation raster preparation timed out')),
      timeoutMs
    );
  });
  return Promise.race([work, timeoutResult]).finally(() => clearTimeout(timeout));
}

function isLeaseId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isFrameAnnotationRasterReference(
  value: unknown
): value is FrameAnnotationRasterReferencePayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['jobId'] === 'string' &&
    record['jobId'].length > 0 &&
    typeof record['inputSha256'] === 'string' &&
    /^[a-f0-9]{64}$/.test(record['inputSha256']) &&
    Number.isSafeInteger(record['revision']) &&
    Number(record['revision']) >= 0
  );
}
