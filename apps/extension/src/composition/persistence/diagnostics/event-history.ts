import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  isActivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import { parseRuntimeLog, runtimeLogJsonl } from './model';
import {
  maintenanceLogJsonl,
  parseMaintenanceLog,
} from '../library-lifecycle/maintenance-log-model';
import { createEventHistoryDatabase, type EventHistoryDatabase } from './event-history-database';
import {
  compressEventSegment,
  EVENT_SEGMENT_BYTES,
  exportEventSegments,
  readEventSegment,
  sanitizeEventLines,
} from './event-history-zip';

export const EVENT_HISTORY_DAYS = 14;
export const EVENT_HISTORY_ARCHIVE_BYTES = 50 * 1024 * 1024;
const AGE = EVENT_HISTORY_DAYS * 86_400_000;
const LOCK = 'sniptale:event-history';
interface Archive {
  id: string;
  createdAt: number;
  bytes: number;
}
interface State {
  version: 1;
  bytes: number;
  day: string;
  lastTime: number;
}
interface Dependencies {
  database?: EventHistoryDatabase;
  now?: () => number;
  withLock?: <T>(work: () => Promise<T>) => Promise<T>;
  legacy?: () => Promise<string>;
  compress?: typeof compressEventSegment;
}
function parseArchive(raw: unknown): Archive {
  if (
    !isRecord(raw) ||
    typeof raw['id'] !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(raw['id']) ||
    typeof raw['createdAt'] !== 'number' ||
    !Number.isSafeInteger(raw['createdAt']) ||
    raw['createdAt'] < 0 ||
    typeof raw['bytes'] !== 'number' ||
    !Number.isSafeInteger(raw['bytes']) ||
    raw['bytes'] <= 0 ||
    raw['bytes'] > EVENT_SEGMENT_BYTES + 4096
  )
    throw new Error('Invalid event catalog');
  return { id: raw['id'], createdAt: raw['createdAt'], bytes: raw['bytes'] };
}
function parseState(raw: unknown): State | null {
  if (raw === undefined) return null;
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    typeof raw['bytes'] !== 'number' ||
    !Number.isSafeInteger(raw['bytes']) ||
    raw['bytes'] < 0 ||
    raw['bytes'] > EVENT_SEGMENT_BYTES ||
    typeof raw['lastTime'] !== 'number' ||
    !Number.isSafeInteger(raw['lastTime']) ||
    typeof raw['day'] !== 'string' ||
    !/^\d{4}-\d\d-\d\d$/.test(raw['day'])
  )
    throw new Error('Invalid event state');
  return { version: 1, bytes: raw['bytes'], lastTime: raw['lastTime'], day: raw['day'] };
}
async function legacyEvents(): Promise<string> {
  const values = await browserStorage.local.get([
    'sniptale_runtime_diagnostic_log',
    'sniptale_library_maintenance_log',
  ]);
  return (
    runtimeLogJsonl(parseRuntimeLog(values['sniptale_runtime_diagnostic_log'])) +
    maintenanceLogJsonl(parseMaintenanceLog(values['sniptale_library_maintenance_log']))
  );
}
/** Advisory append history; recent browser-storage keys are UI tails, not archive authority. */
export function createEventHistory(dependencies: Dependencies = {}) {
  const db = dependencies.database ?? createEventHistoryDatabase();
  const now = dependencies.now ?? Date.now;
  const legacy = dependencies.legacy ?? legacyEvents;
  const compress = dependencies.compress ?? compressEventSegment;
  const lock =
    dependencies.withLock ??
    (async <T>(work: () => Promise<T>): Promise<T> => {
      if (typeof navigator === 'undefined' || !navigator.locks)
        throw new Error('Event history coordination unavailable');
      return navigator.locks.request(LOCK, work);
    });
  async function activeText(): Promise<string> {
    const chunks = await db.readActive();
    let bytes = 0;
    const strings: string[] = [];
    for (const chunk of chunks) {
      if (typeof chunk !== 'string') throw new Error('Invalid active event chunk');
      bytes += new TextEncoder().encode(chunk).byteLength;
      if (bytes > EVENT_SEGMENT_BYTES) throw new Error('Active event budget exceeded');
      strings.push(chunk);
    }
    return strings.join('');
  }
  return {
    /** Caller must admit before queueing; erasure drains compression and atomic publication. */
    async append(text: string, permit: PersistenceMutationPermit): Promise<boolean> {
      if (!isActivePersistenceMutationPermit(permit)) return false;
      try {
        return await lock(async () => {
          const timestamp = now();
          const cutoff = timestamp - AGE;
          const day = new Date(timestamp).toISOString().slice(0, 10);
          const previous = parseState(await db.readState());
          const expired = previous !== null && previous.lastTime <= cutoff;
          const incoming = sanitizeEventLines((previous ? '' : await legacy()) + text, cutoff);
          const incomingBytes = new TextEncoder().encode(incoming).byteLength;
          const rotate =
            previous !== null &&
            !expired &&
            previous.bytes > 0 &&
            (previous.day !== day || previous.bytes + incomingBytes > EVENT_SEGMENT_BYTES);
          const blob = rotate
            ? await compress(sanitizeEventLines(await activeText(), cutoff))
            : null;
          const archive =
            blob && previous
              ? { id: crypto.randomUUID(), createdAt: previous.lastTime, bytes: blob.size }
              : null;
          const catalog =
            rotate || expired || previous?.day !== day ? (await db.list()).map(parseArchive) : [];
          if (archive) catalog.push(archive);
          catalog.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
          let bytes = catalog.reduce((sum, entry) => sum + entry.bytes, 0);
          const remove: string[] = [];
          for (const entry of catalog) {
            if (entry.createdAt > cutoff && bytes <= EVENT_HISTORY_ARCHIVE_BYTES) break;
            remove.push(entry.id);
            bytes -= entry.bytes;
          }
          await db.commit(
            {
              version: 1,
              day,
              lastTime: timestamp,
              bytes: (rotate || expired ? 0 : (previous?.bytes ?? 0)) + incomingBytes,
            },
            incoming,
            rotate || expired,
            archive && blob ? { id: archive.id, metadata: archive, blob } : null,
            remove
          );
          return true;
        });
      } catch {
        return false;
      }
    },
    /** Read-only snapshot, captured under the same archive lock; no migration or expiry writes. */
    async exportZip(): Promise<Blob> {
      const cutoff = now() - AGE;
      const snapshot = await lock(async () => {
        const state = parseState(await db.readState());
        const catalog = (await db.list())
          .map(parseArchive)
          .filter((entry) => entry.createdAt > cutoff)
          .sort((a, b) => a.createdAt - b.createdAt);
        if (catalog.reduce((sum, entry) => sum + entry.bytes, 0) > EVENT_HISTORY_ARCHIVE_BYTES)
          throw new Error('Event archive budget exceeded');
        const blobs: Blob[] = [];
        for (const entry of catalog) {
          const blob = await db.readArchive(entry.id);
          if (!(blob instanceof Blob) || blob.size !== entry.bytes)
            throw new Error('Event archive unavailable');
          blobs.push(blob);
        }
        return { blobs, text: state ? await activeText() : await legacy() };
      });
      async function* segments() {
        for (const blob of snapshot.blobs) yield await readEventSegment(blob);
        yield snapshot.text;
      }
      return exportEventSegments(segments(), cutoff);
    },
  };
}
