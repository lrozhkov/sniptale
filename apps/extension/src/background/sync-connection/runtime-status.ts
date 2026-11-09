import {
  sameConnectionBinding,
  sameConnectionScope,
  sameSyncConnectionIdentity,
  type SyncConnectionMetadata,
} from '../../composition/persistence/remote-connection/model';
import type { SyncQueueSummary } from '../../composition/persistence/sync-capture/queue-summary';
import type {
  SecretProtectionControl,
  SecretProtectionStatus,
} from '../../composition/persistence/secret-protection/model';
import type {
  SyncExecutorBinding,
  SyncPopupRuntimeStatus,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { SyncActivityObservation } from './coordinator';

/** All effect ports are readonly; this observer never prepares storage or starts work. */
export interface SyncRuntimeStatusDependencies {
  captureDatabase(): object | null;
  readSummary(): Promise<SyncQueueSummary>;
  readConnection(): Promise<SyncConnectionMetadata | null>;
  readProtectionControl(): Promise<SecretProtectionControl | null>;
  readProtection(): Promise<SecretProtectionStatus | null>;
  hasOriginPermission(origin: string): Promise<boolean>;
  observeActivity(binding: SyncExecutorBinding): Promise<SyncActivityObservation>;
}
function unknown(issue: SyncPopupRuntimeStatus['issue']): SyncPopupRuntimeStatus {
  return {
    configuration: 'unknown',
    connection: null,
    localPublication: 'unknown',
    activity: 'unknown',
    remote: { knowledge: 'unknown' },
    protection: 'unknown',
    issue,
    repair: 'connection',
  };
}
function unconfigured(): SyncPopupRuntimeStatus {
  return { ...unknown(null), configuration: 'unconfigured', repair: null };
}
type ConfiguredSummary = Extract<SyncQueueSummary, { configured: true }>;
function selected(
  summary: ConfiguredSummary,
  connection: SyncConnectionMetadata | null
): connection is SyncConnectionMetadata {
  return (
    !!connection &&
    sameConnectionScope(summary.scope, connection.binding) &&
    sameSyncConnectionIdentity(summary.authorization, connection.identity)
  );
}
function sameSelection(
  before: SyncConnectionMetadata,
  after: SyncConnectionMetadata | null
): boolean {
  return (
    !!after &&
    sameConnectionBinding(before.binding, after.binding) &&
    sameSyncConnectionIdentity(before.identity, after.identity) &&
    before.credentialId === after.credentialId &&
    before.phase === after.phase &&
    before.updateNonce === after.updateNonce &&
    (before.workspace?.fingerprint ?? null) === (after.workspace?.fingerprint ?? null)
  );
}
function sameControl(
  before: SecretProtectionControl | null,
  after: SecretProtectionControl | null
): boolean {
  return (
    !!before &&
    !!after &&
    before.epoch === after.epoch &&
    before.phase === after.phase &&
    before.participants.ai === after.participants.ai &&
    before.participants.webdav?.incarnation === after.participants.webdav?.incarnation &&
    before.participants.webdav?.credentialId === after.participants.webdav?.credentialId
  );
}
/** Retained cancelled/failed history cannot prove that the current accepted head is unpublished. */
function localPublication(summary: ConfiguredSummary): SyncPopupRuntimeStatus['localPublication'] {
  if (summary.counts.pendingRoots > 0) return 'waiting';
  if (!summary.enrollmentComplete) return 'discovering';
  return summary.localPublication === 'published' ? 'published' : 'unknown';
}
function protectionState(
  status: SecretProtectionStatus | null,
  control: SecretProtectionControl | null,
  connection: SyncConnectionMetadata
): SyncPopupRuntimeStatus['protection'] {
  if (!status || !control || control.phase !== 'stable') return 'unknown';
  const participant = control.participants.webdav;
  if (!participant) return status.participants.webdav ? 'unknown' : 'not-enrolled';
  if (
    !status.isEnabled ||
    !status.participants.webdav ||
    participant.incarnation !== connection.identity.incarnation ||
    participant.credentialId !== connection.credentialId
  )
    return 'unknown';
  return status.isUnlocked ? 'unlocked' : 'locked';
}
function repairFor(issue: SyncPopupRuntimeStatus['issue']): SyncPopupRuntimeStatus['repair'] {
  if (issue === 'not-ready' || issue === 'unavailable' || issue === 'index-coverage')
    return 'connection';
  if (issue === 'secrets-locked') return 'security';
  if (issue === 'storage-full') return 'queue-problems';
  if (
    issue === 'authentication' ||
    issue === 'permission-required' ||
    issue === 'access-denied' ||
    issue === 'invalid-workspace'
  )
    return 'connection';
  if (issue === 'selection-changed' || issue === 'invalid-data') return 'queue-action-required';
  return issue ? 'queue-problems' : 'queue';
}
function project(
  summary: ConfiguredSummary,
  protection: SyncPopupRuntimeStatus['protection'],
  activity: SyncActivityObservation,
  permission: boolean | null
): SyncPopupRuntimeStatus {
  let issue: SyncPopupRuntimeStatus['issue'];
  if (summary.connection === 'credentials-required' || summary.connection === 'updating-auth')
    issue = 'authentication';
  else if (permission === false) issue = 'permission-required';
  else if (summary.connection === 'paused') issue = null;
  else if (permission === null || protection === 'unknown') issue = 'not-ready';
  else if (protection === 'locked') issue = 'secrets-locked';
  else
    issue =
      activity.failureCode ??
      (summary.counts.queue.failed > 0 || summary.counts.queue.interrupted > 0
        ? 'queue-problem'
        : null);
  return {
    configuration: 'configured',
    connection: summary.connection,
    localPublication: localPublication(summary),
    activity: activity.activity,
    remote: activity.remote,
    protection,
    issue,
    repair: summary.connection === 'paused' ? 'connection' : repairFor(issue),
  };
}
const unknownActivity: SyncActivityObservation = {
  activity: 'unknown',
  remote: { knowledge: 'unknown' },
  failureCode: null,
};
/** One observation retains a prepared handle and rechecks native identity around external waits. */
export function createSyncRuntimeStatusReader(
  deps: SyncRuntimeStatusDependencies
): () => Promise<SyncPopupRuntimeStatus> {
  return async () => {
    const db = deps.captureDatabase();
    if (!db) return unknown('not-ready');
    const current = () => deps.captureDatabase() === db;
    try {
      const first = await deps.readSummary();
      if (!current()) return unknown('selection-changed');
      if (first.knowledge !== 'complete')
        return unknown(
          first.knowledge === 'unknown' && first.reason === 'index-coverage'
            ? 'index-coverage'
            : 'not-ready'
        );
      if (!first.configured) return unconfigured();
      const rawConnection = await deps.readConnection();
      if (!current() || !selected(first, rawConnection)) return unknown('selection-changed');
      const connection = structuredClone(rawConnection);
      const rawControl = await deps.readProtectionControl();
      if (!current()) return unknown('selection-changed');
      const control = rawControl ? structuredClone(rawControl) : null;
      const observations = await Promise.allSettled([
        deps.readProtection(),
        deps.hasOriginPermission(new URL(connection.binding.rootUrl).origin),
        deps.observeActivity({ scope: first.scope, authorization: first.authorization }),
      ]);
      if (!current()) return unknown('selection-changed');
      const finalConnection = await deps.readConnection();
      if (!current() || !sameSelection(connection, finalConnection))
        return unknown('selection-changed');
      const finalSummary = await deps.readSummary();
      if (
        !current() ||
        finalSummary.knowledge !== 'complete' ||
        !finalSummary.configured ||
        !selected(finalSummary, finalConnection)
      )
        return unknown('selection-changed');
      const finalControl = await deps.readProtectionControl();
      if (!current() || !sameControl(control, finalControl)) return unknown('selection-changed');
      const [secret, permission, activity] = observations;
      return project(
        finalSummary,
        protectionState(
          secret.status === 'fulfilled' ? secret.value : null,
          finalControl,
          connection
        ),
        activity.status === 'fulfilled' ? activity.value : unknownActivity,
        permission.status === 'fulfilled' ? permission.value : null
      );
    } catch {
      return unknown('unavailable');
    }
  };
}
