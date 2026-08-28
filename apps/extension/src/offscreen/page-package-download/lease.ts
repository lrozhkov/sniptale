import { parseAssetRef, readAssetFile, type AssetRef } from '../../composition/persistence/assets';

const MAX_PAGE_PACKAGE_DOWNLOAD_LEASES = 8;
const UNCONFIRMED_LEASE_TTL_MS = 60_000;

type DownloadLease = {
  confirmed: boolean;
  leaseId: string;
  operationId: string;
  reference: AssetRef;
  timer: ReturnType<typeof setTimeout> | null;
  url: string;
};

// policyStateId: page-package-download-leases
const leases = new Map<string, DownloadLease>();
const leaseCreations = new Map<string, { promise: Promise<DownloadLease>; reference: AssetRef }>();

function sameReference(left: AssetRef, right: AssetRef): boolean {
  return (
    left.assetId === right.assetId &&
    left.createdAt === right.createdAt &&
    left.location.objectKey === right.location.objectKey &&
    left.mimeType === right.mimeType &&
    left.size === right.size &&
    left.sha256 === right.sha256
  );
}

function revokeLease(lease: DownloadLease): void {
  if (lease.timer) clearTimeout(lease.timer);
  lease.timer = null;
  URL.revokeObjectURL(lease.url);
  if (leases.get(lease.operationId) === lease) leases.delete(lease.operationId);
}

export async function createPagePackageDownloadLease(args: {
  downloadOperationId: string;
  filename: string;
  reference: unknown;
}): Promise<{ leaseId: string; result: 'leased'; url: string }> {
  const reference = parseAssetRef(args.reference);
  if (!reference) throw new Error('Invalid Page Package download asset reference.');
  const existing = leases.get(args.downloadOperationId);
  if (existing) {
    if (!sameReference(existing.reference, reference)) {
      throw new Error('Page Package download operation changed its asset reference.');
    }
    return { leaseId: existing.leaseId, result: 'leased', url: existing.url };
  }
  const pending = leaseCreations.get(args.downloadOperationId);
  if (pending) {
    if (!sameReference(pending.reference, reference)) {
      throw new Error('Page Package download operation changed its asset reference.');
    }
    const lease = await pending.promise;
    return { leaseId: lease.leaseId, result: 'leased', url: lease.url };
  }
  if (leases.size + leaseCreations.size >= MAX_PAGE_PACKAGE_DOWNLOAD_LEASES) {
    throw new Error('Page Package download lease capacity exceeded.');
  }

  const creation = (async (): Promise<DownloadLease> => {
    const file = await readAssetFile(reference, args.filename);
    if (file.size !== reference.size || file.type !== reference.mimeType) {
      throw new Error('Page Package download asset no longer matches its reference.');
    }
    const lease: DownloadLease = {
      confirmed: false,
      leaseId: crypto.randomUUID(),
      operationId: args.downloadOperationId,
      reference,
      timer: null,
      url: URL.createObjectURL(file),
    };
    lease.timer = setTimeout(() => revokeLease(lease), UNCONFIRMED_LEASE_TTL_MS);
    leases.set(lease.operationId, lease);
    return lease;
  })();
  const reservation = { promise: creation, reference };
  leaseCreations.set(args.downloadOperationId, reservation);
  try {
    const lease = await creation;
    return { leaseId: lease.leaseId, result: 'leased', url: lease.url };
  } finally {
    if (leaseCreations.get(args.downloadOperationId) === reservation) {
      leaseCreations.delete(args.downloadOperationId);
    }
  }
}

export function confirmPagePackageDownloadLease(args: {
  downloadOperationId: string;
  leaseId: string;
}): { result: 'confirmed' | 'stale' } {
  const lease = leases.get(args.downloadOperationId);
  if (!lease || lease.leaseId !== args.leaseId) return { result: 'stale' };
  if (lease.timer) clearTimeout(lease.timer);
  lease.timer = null;
  lease.confirmed = true;
  return { result: 'confirmed' };
}

export function releasePagePackageDownloadLease(args: {
  downloadOperationId: string;
  leaseId: string;
}): { result: 'released' | 'stale' } {
  const lease = leases.get(args.downloadOperationId);
  if (!lease || lease.leaseId !== args.leaseId) return { result: 'stale' };
  revokeLease(lease);
  return { result: 'released' };
}

export async function releaseAllPagePackageDownloadLeases(): Promise<void> {
  await Promise.allSettled([...leaseCreations.values()].map((creation) => creation.promise));
  for (const lease of [...leases.values()]) revokeLease(lease);
}

export const PAGE_PACKAGE_DOWNLOAD_LEASE_LIMITS_FOR_TESTS = {
  maxLeases: MAX_PAGE_PACKAGE_DOWNLOAD_LEASES,
  unconfirmedTtlMs: UNCONFIRMED_LEASE_TTL_MS,
} as const;
