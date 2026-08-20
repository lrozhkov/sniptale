import {
  abortArchiveRestoreSession,
  createArchiveRestoreSession,
  listArchiveRestoreSessions,
  readArchiveRestoreSession,
  type ArchiveRestoreSession,
  type ArchiveRestoreStrategy,
  type DurableAssetOperationPermit,
} from '../../../composition/persistence/assets';
import { inspectMediaHubBackupV6 } from './inspect';
import { recoverAssetPublications } from '../../../composition/persistence/asset-publication-recovery';

export interface RestoreSessionSummary {
  operationId: string;
  archiveFingerprint: string;
  strategy: ArchiveRestoreStrategy;
  status: ArchiveRestoreSession['status'];
  committedRootCount: number;
  currentRoot: string | null;
}

function summarize(session: ArchiveRestoreSession): RestoreSessionSummary {
  return {
    archiveFingerprint: session.archiveFingerprint,
    committedRootCount: session.committedRoots.length,
    currentRoot: session.currentRoot,
    operationId: session.operationId,
    status: session.status,
    strategy: session.strategy,
  };
}

export async function createMediaHubRestoreSession(args: {
  file: Blob;
  strategy: ArchiveRestoreStrategy;
}): Promise<{
  inspection: Awaited<ReturnType<typeof inspectMediaHubBackupV6>>;
  session: ArchiveRestoreSession;
}> {
  await recoverAssetPublications();
  const inspection = await inspectMediaHubBackupV6(args.file);
  const session = await createArchiveRestoreSession({
    archiveFingerprint: inspection.fingerprint,
    strategy: args.strategy,
  });
  return { inspection, session };
}

export async function verifyMediaHubRestoreResume(args: {
  file: Blob;
  operationId: string;
  permit?: DurableAssetOperationPermit;
}): Promise<{
  inspection: Awaited<ReturnType<typeof inspectMediaHubBackupV6>>;
  session: ArchiveRestoreSession;
}> {
  await recoverAssetPublications(args.permit);
  const session = await readArchiveRestoreSession(args.operationId);
  if (!session || session.status !== 'pending') {
    throw new Error('Resumable media backup restore session is unavailable.');
  }
  const inspection = await inspectMediaHubBackupV6(args.file);
  if (inspection.fingerprint !== session.archiveFingerprint) {
    throw new Error('Selected media backup does not match the resumable restore session.');
  }
  return { inspection, session };
}

export async function listResumableMediaHubRestores(): Promise<RestoreSessionSummary[]> {
  await recoverAssetPublications();
  return (await listArchiveRestoreSessions())
    .filter((session) => session.status === 'pending')
    .map(summarize);
}

export async function abortMediaHubBackupRestore(operationId: string): Promise<void> {
  await abortArchiveRestoreSession(operationId);
}
