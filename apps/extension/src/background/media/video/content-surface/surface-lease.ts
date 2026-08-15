// policyStateId: video-recording-surface-lease - serialized durable content surface authority.
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { closeVideoRecordingCameraPeerForLease } from './camera-peer';

const STORAGE_KEY = 'video-recording-content-surface-lease';
const SURFACE_LEASE_TTL_MS = 12 * 60 * 60 * 1000;

type VideoRecordingSurfaceLifecycle = 'requested' | 'binding' | 'ready' | 'degraded';

export type VideoRecordingSurfaceLease = {
  capabilityEpoch: number;
  documentGeneration: number;
  entry: 'manual' | 'popup';
  expiresAt: number;
  lifecycle: VideoRecordingSurfaceLifecycle;
  peerGeneration: number;
  recordingId: string | null;
  surfaceSessionId: string;
  surfaceToken: string;
  tabId: number;
  toolbarRequested: boolean;
};

type PersistedSurfaceLease = VideoRecordingSurfaceLease & { version: 1 };

let activeLease: VideoRecordingSurfaceLease | null = null;
let hydrated = false;
let hydrationPromise: Promise<VideoRecordingSurfaceLease | null> | null = null;
let mutationTail: Promise<void> = Promise.resolve();

function serializeLeaseMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationTail.then(operation, operation);
  mutationTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSurfaceLease(value: unknown): VideoRecordingSurfaceLease | null {
  if (!isRecord(value) || value['version'] !== 1) return null;
  if (
    typeof value['capabilityEpoch'] !== 'number' ||
    !Number.isInteger(value['capabilityEpoch']) ||
    value['capabilityEpoch'] < 1 ||
    typeof value['documentGeneration'] !== 'number' ||
    !Number.isInteger(value['documentGeneration']) ||
    value['documentGeneration'] < 0 ||
    (value['entry'] !== 'manual' && value['entry'] !== 'popup') ||
    typeof value['expiresAt'] !== 'number' ||
    !Number.isFinite(value['expiresAt']) ||
    value['expiresAt'] <= 0 ||
    (value['lifecycle'] !== 'requested' &&
      value['lifecycle'] !== 'binding' &&
      value['lifecycle'] !== 'ready' &&
      value['lifecycle'] !== 'degraded') ||
    typeof value['peerGeneration'] !== 'number' ||
    !Number.isInteger(value['peerGeneration']) ||
    value['peerGeneration'] < 0 ||
    !(value['recordingId'] === null || typeof value['recordingId'] === 'string') ||
    typeof value['surfaceSessionId'] !== 'string' ||
    typeof value['surfaceToken'] !== 'string' ||
    typeof value['tabId'] !== 'number' ||
    !Number.isInteger(value['tabId']) ||
    value['tabId'] < 0 ||
    typeof value['toolbarRequested'] !== 'boolean'
  ) {
    return null;
  }
  return {
    capabilityEpoch: value['capabilityEpoch'],
    documentGeneration: value['documentGeneration'],
    entry: value['entry'],
    expiresAt: value['expiresAt'],
    lifecycle: value['lifecycle'],
    peerGeneration: value['peerGeneration'],
    recordingId: value['recordingId'],
    surfaceSessionId: value['surfaceSessionId'],
    surfaceToken: value['surfaceToken'],
    tabId: value['tabId'],
    toolbarRequested: value['toolbarRequested'],
  };
}

function isExpired(lease: VideoRecordingSurfaceLease): boolean {
  return lease.expiresAt <= Date.now();
}

async function persist(lease: VideoRecordingSurfaceLease | null): Promise<void> {
  if (!browserStorage.session.isAvailable()) return;
  if (!lease) {
    await browserStorage.session.remove(STORAGE_KEY);
    return;
  }
  await browserStorage.session.set({
    [STORAGE_KEY]: { ...lease, version: 1 } satisfies PersistedSurfaceLease,
  });
}

async function readPersisted(): Promise<VideoRecordingSurfaceLease | null> {
  if (!browserStorage.session.isAvailable()) return null;
  const payload = await browserStorage.session.get([STORAGE_KEY]);
  return parseSurfaceLease(payload[STORAGE_KEY]);
}

export async function ensureVideoRecordingSurfaceLeaseHydrated(): Promise<VideoRecordingSurfaceLease | null> {
  let lease: VideoRecordingSurfaceLease | null;
  if (activeLease) {
    lease = activeLease;
  } else if (hydrated) {
    lease = null;
  } else {
    hydrationPromise ??= readPersisted()
      .then(async (persisted) => {
        activeLease = persisted;
        hydrated = true;
        return persisted;
      })
      .finally(() => {
        hydrationPromise = null;
      });
    lease = await hydrationPromise;
  }
  return lease;
}

export function requestVideoRecordingSurface(args: {
  entry: 'manual' | 'popup';
  recordingId?: string | null;
  tabId: number;
  toolbarRequested?: boolean;
}): Promise<VideoRecordingSurfaceLease> {
  return serializeLeaseMutation(async () => {
    let current = activeLease ?? (await ensureVideoRecordingSurfaceLeaseHydrated());
    if (current && isExpired(current)) {
      await closeVideoRecordingCameraPeerForLease(current);
      current = null;
    }
    let lease: VideoRecordingSurfaceLease;
    if (current?.tabId === args.tabId) {
      lease = {
        ...current,
        capabilityEpoch: current.capabilityEpoch + 1,
        entry: args.entry,
        expiresAt: Date.now() + SURFACE_LEASE_TTL_MS,
        lifecycle: 'requested',
        recordingId: args.recordingId ?? current.recordingId,
        surfaceToken: crypto.randomUUID(),
        toolbarRequested: args.toolbarRequested ?? true,
      };
    } else {
      if (current) await closeVideoRecordingCameraPeerForLease(current);
      lease = {
        capabilityEpoch: 1,
        documentGeneration: 0,
        entry: args.entry,
        expiresAt: Date.now() + SURFACE_LEASE_TTL_MS,
        lifecycle: 'requested',
        peerGeneration: 0,
        recordingId: args.recordingId ?? null,
        surfaceSessionId: crypto.randomUUID(),
        surfaceToken: crypto.randomUUID(),
        tabId: args.tabId,
        toolbarRequested: args.toolbarRequested ?? true,
      };
    }
    await persist(lease);
    activeLease = lease;
    hydrated = true;
    return lease;
  });
}

export function updateVideoRecordingSurface(
  surfaceSessionId: string,
  update: Partial<
    Pick<
      VideoRecordingSurfaceLease,
      'documentGeneration' | 'lifecycle' | 'peerGeneration' | 'recordingId' | 'toolbarRequested'
    >
  >,
  options: { isCurrent?: () => boolean } = {}
): Promise<VideoRecordingSurfaceLease | null> {
  return serializeLeaseMutation(async () => {
    const current = activeLease ?? (await ensureVideoRecordingSurfaceLeaseHydrated());
    if (
      !current ||
      isExpired(current) ||
      current.surfaceSessionId !== surfaceSessionId ||
      options.isCurrent?.() === false
    )
      return null;
    const next = { ...current, ...update, expiresAt: Date.now() + SURFACE_LEASE_TTL_MS };
    await persist(next);
    if (options.isCurrent?.() === false) {
      await persist(current);
      return null;
    }
    activeLease = next;
    return next;
  });
}

export function beginVideoRecordingSurfaceRebind(
  tabId: number,
  options: { isCurrent?: () => boolean } = {}
): Promise<VideoRecordingSurfaceLease | null> {
  return serializeLeaseMutation(async () => {
    const current = activeLease ?? (await ensureVideoRecordingSurfaceLeaseHydrated());
    if (
      !current ||
      isExpired(current) ||
      current.tabId !== tabId ||
      options.isCurrent?.() === false
    )
      return null;
    const next: VideoRecordingSurfaceLease = {
      ...current,
      capabilityEpoch: current.capabilityEpoch + 1,
      documentGeneration: current.documentGeneration + 1,
      expiresAt: Date.now() + SURFACE_LEASE_TTL_MS,
      lifecycle: 'binding',
      peerGeneration: current.peerGeneration + 1,
      surfaceToken: crypto.randomUUID(),
    };
    await persist(next);
    if (options.isCurrent?.() === false) {
      await persist(current);
      return null;
    }
    activeLease = next;
    return next;
  });
}

export function releaseVideoRecordingSurface(
  args: {
    recordingId?: string;
    surfaceSessionId?: string;
    surfaceToken?: string;
    tabId?: number;
  } = {}
): Promise<boolean> {
  return serializeLeaseMutation(async () => {
    const current = activeLease ?? (await ensureVideoRecordingSurfaceLeaseHydrated());
    if (!current) return false;
    if (args.recordingId !== undefined && current.recordingId !== args.recordingId) return false;
    if (args.surfaceSessionId !== undefined && current.surfaceSessionId !== args.surfaceSessionId) {
      return false;
    }
    if (args.surfaceToken !== undefined && current.surfaceToken !== args.surfaceToken) return false;
    if (args.tabId !== undefined && current.tabId !== args.tabId) return false;
    // Peer cleanup is retained for retry by the camera-peer owner. A missing or
    // restarting offscreen document must never keep the content toolbar lease alive.
    await closeVideoRecordingCameraPeerForLease(current).catch(() => undefined);
    await persist(null);
    activeLease = null;
    hydrated = true;
    return true;
  });
}

export function getVideoRecordingSurfaceLeaseSnapshot(): VideoRecordingSurfaceLease | null {
  return activeLease && activeLease.expiresAt > Date.now() ? activeLease : null;
}

export function validateVideoRecordingSurfaceCapability(args: {
  capabilityEpoch?: number;
  documentGeneration?: number;
  recordingId: string | null;
  surfaceToken: string;
  tabId: number;
}): boolean {
  const lease = getVideoRecordingSurfaceLeaseSnapshot();
  return Boolean(
    lease &&
    lease.tabId === args.tabId &&
    lease.recordingId === args.recordingId &&
    lease.surfaceToken === args.surfaceToken &&
    (args.capabilityEpoch === undefined || lease.capabilityEpoch === args.capabilityEpoch) &&
    (args.documentGeneration === undefined || lease.documentGeneration === args.documentGeneration)
  );
}

export function resetVideoRecordingSurfaceLeaseForTests(): void {
  activeLease = null;
  hydrated = false;
  hydrationPromise = null;
  mutationTail = Promise.resolve();
}
