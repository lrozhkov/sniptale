import {
  parseVoiceHistoryEntry,
  parseVoiceCaptureToken,
  isVoiceHistoryIdentity,
  VOICE_HISTORY_LIMIT,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceHistoryEntry, VoiceCaptureToken } from '@sniptale/runtime-contracts/voice-input';
import { initDB, VOICE_INPUT_HISTORY_STORE } from '../infrastructure/indexed-db/core';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';

export interface VoiceHistoryCatalog {
  id: 'catalog';
  version: 1;
  epoch: string;
  nextSequence: number;
  entries: VoiceHistoryEntry[];
  captures: VoiceCaptureToken[];
  pendingDeletes: string[];
}

export interface VoiceHistoryCatalogStorage {
  read(permit?: PersistenceMutationPermit): Promise<VoiceHistoryCatalog | null>;
  write(value: VoiceHistoryCatalog, permit?: PersistenceMutationPermit): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Invalid authoritative metadata is an error; reads never reset it. */
export function parseVoiceHistoryCatalog(value: unknown): VoiceHistoryCatalog | null {
  if (!isRecord(value)) return null;
  const source = value;
  if (
    Object.keys(source).some(
      (key) =>
        ![
          'id',
          'version',
          'epoch',
          'nextSequence',
          'entries',
          'captures',
          'pendingDeletes',
        ].includes(key)
    ) ||
    source['id'] !== 'catalog' ||
    source['version'] !== 1 ||
    !isVoiceHistoryIdentity(source['epoch']) ||
    typeof source['nextSequence'] !== 'number' ||
    !Number.isSafeInteger(source['nextSequence']) ||
    source['nextSequence'] < 1 ||
    !Array.isArray(source['entries']) ||
    source['entries'].length > VOICE_HISTORY_LIMIT ||
    !Array.isArray(source['captures']) ||
    source['captures'].length > VOICE_HISTORY_LIMIT ||
    !Array.isArray(source['pendingDeletes']) ||
    source['pendingDeletes'].length > VOICE_HISTORY_LIMIT + 1
  )
    return null;
  const entries: VoiceHistoryEntry[] = [];
  for (const value of source['entries']) {
    const entry = parseVoiceHistoryEntry(value);
    if (!entry || entry.epoch !== source['epoch'] || entry.sequence >= source['nextSequence'])
      return null;
    entries.push(entry);
  }
  if (
    new Set(entries.map((entry) => entry.entryId)).size !== entries.length ||
    new Set(entries.map((entry) => entry.sequence)).size !== entries.length
  )
    return null;
  const captures: VoiceCaptureToken[] = [];
  for (const value of source['captures']) {
    const token = parseVoiceCaptureToken(value);
    if (!token || token.epoch !== source['epoch'] || token.sequence >= source['nextSequence'])
      return null;
    captures.push(token);
  }
  if (
    new Set([...entries, ...captures].map((item) => item.sequence)).size !==
    entries.length + captures.length
  )
    return null;
  const pendingDeletes: string[] = [];
  for (const value of source['pendingDeletes']) {
    if (
      typeof value !== 'string' ||
      !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/u.test(value) ||
      value.length > 386
    )
      return null;
    pendingDeletes.push(value);
  }
  if (
    new Set(pendingDeletes).size !== pendingDeletes.length ||
    entries.some((entry) => pendingDeletes.includes(audioIdentity(entry)))
  )
    return null;
  return {
    id: 'catalog',
    version: 1,
    epoch: source['epoch'],
    nextSequence: source['nextSequence'],
    entries,
    captures,
    pendingDeletes,
  };
}

export function audioIdentity(entry: {
  epoch: string;
  entryId: string;
  incarnation: string;
}): string {
  return `${entry.epoch}.${entry.entryId}.${entry.incarnation}`;
}

export function createVoiceHistoryCatalogStorage(): VoiceHistoryCatalogStorage {
  return {
    async read(permit) {
      const value: unknown = await (await initDB(permit)).get(VOICE_INPUT_HISTORY_STORE, 'catalog');
      if (value === undefined) return null;
      const parsed = parseVoiceHistoryCatalog(value);
      if (!parsed) throw new Error('storage-failed');
      return parsed;
    },
    async write(value, permit) {
      const db = await initDB(permit);
      const tx = db.transaction(VOICE_INPUT_HISTORY_STORE, 'readwrite', { durability: 'strict' });
      await tx.store.put(value);
      await tx.done;
    },
  };
}
