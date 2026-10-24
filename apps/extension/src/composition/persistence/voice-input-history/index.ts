import {
  VOICE_HISTORY_LIMIT,
  VOICE_HISTORY_MAX_AUDIO_BYTES,
  VOICE_HISTORY_MAX_DURATION_SECONDS,
  isVoiceHistoryMimeType,
  isVoiceHistoryText,
  parseVoiceCaptureToken,
  parseVoiceInputHistoryScope,
} from '@sniptale/runtime-contracts/voice-input';
import type {
  VoiceCaptureToken,
  VoiceHistoryEntry,
  VoiceHistoryScope,
  VoiceInputLanguage,
} from '@sniptale/runtime-contracts/voice-input';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { audioIdentity, createVoiceHistoryCatalogStorage } from './catalog';
import type { VoiceHistoryCatalog, VoiceHistoryCatalogStorage } from './catalog';
import { createVoiceHistoryAudioStorage } from './opfs';
import type { VoiceHistoryAudioStorage } from './opfs';

/** Fixed codes are safe to classify; storage exceptions never carry user data outward. */
export class VoiceHistoryError extends Error {
  constructor(readonly code: 'stale' | 'storage-failed' | 'too-large') {
    super(code);
    this.name = 'VoiceHistoryError';
  }
}

interface VoiceInputHistoryOptions {
  catalog?: VoiceHistoryCatalogStorage;
  audio?: VoiceHistoryAudioStorage;
  withLock?: <T>(operation: () => Promise<T>) => Promise<T>;
  withMutation?: <T>(operation: (permit?: PersistenceMutationPermit) => Promise<T>) => Promise<T>;
  uuid?: () => string;
  now?: () => number;
}

async function withNativeLock<T>(operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new VoiceHistoryError('storage-failed');
  return navigator.locks.request('sniptale:voice-input:history', { mode: 'exclusive' }, operation);
}

function assertCurrent(
  catalog: VoiceHistoryCatalog | null,
  scope: VoiceHistoryScope,
  revision = true
): VoiceHistoryEntry {
  const entry = catalog?.entries.find((item) => item.entryId === scope.entryId);
  if (
    !parseVoiceInputHistoryScope(scopeOf(scope)) ||
    !entry ||
    catalog?.epoch !== scope.epoch ||
    entry.incarnation !== scope.incarnation ||
    entry.audioDigest !== scope.audioDigest ||
    (revision && entry.revision !== scope.revision)
  )
    throw new VoiceHistoryError('stale');
  return entry;
}

function scopeOf(entry: VoiceHistoryScope): VoiceHistoryScope {
  return {
    entryId: entry.entryId,
    incarnation: entry.incarnation,
    epoch: entry.epoch,
    revision: entry.revision,
    audioDigest: entry.audioDigest,
  };
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new VoiceHistoryError('stale');
}

async function digestAudio(audio: Blob): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', await audio.arrayBuffer());
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

class VoiceHistoryOwner {
  private readonly catalogStorage: VoiceHistoryCatalogStorage;
  private readonly audio: VoiceHistoryAudioStorage;
  private readonly withLock: NonNullable<VoiceInputHistoryOptions['withLock']>;
  private readonly withMutation: NonNullable<VoiceInputHistoryOptions['withMutation']>;
  private readonly uuid: () => string;
  private readonly now: () => number;

  constructor(options: VoiceInputHistoryOptions) {
    this.catalogStorage = options.catalog ?? createVoiceHistoryCatalogStorage();
    this.audio = options.audio ?? createVoiceHistoryAudioStorage();
    this.withLock = options.withLock ?? withNativeLock;
    this.withMutation = options.withMutation ?? runWithPersistenceMutationPermit;
    this.uuid = options.uuid ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
  }

  private async guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof VoiceHistoryError) throw error;
      throw new VoiceHistoryError('storage-failed');
    }
  }

  private async mutate<T>(
    operation: (
      catalog: VoiceHistoryCatalog | null,
      permit?: PersistenceMutationPermit
    ) => Promise<T>
  ): Promise<T> {
    // Prepare database admission before the shared barrier; cold admission needs its exclusive gate.
    await this.guarded(() => this.catalogStorage.read());
    return this.guarded(() =>
      this.withMutation((permit) =>
        this.withLock(async () => operation(await this.catalogStorage.read(permit), permit))
      )
    );
  }

  private async drain(
    catalog: VoiceHistoryCatalog,
    permit?: PersistenceMutationPermit
  ): Promise<void> {
    if (!catalog.pendingDeletes.length) return;
    for (const identity of catalog.pendingDeletes) await this.audio.remove(identity);
    catalog.pendingDeletes = [];
    await this.catalogStorage.write(catalog, permit);
  }

  private async recoverAudio(
    catalog: VoiceHistoryCatalog,
    permit?: PersistenceMutationPermit
  ): Promise<void> {
    await this.drain(catalog, permit);
    const retained = new Set(catalog.entries.map(audioIdentity));
    for (const identity of await this.audio.list())
      if (!retained.has(identity)) await this.audio.remove(identity);
  }

  private async update(
    scope: VoiceHistoryScope,
    change: (entry: VoiceHistoryEntry) => void
  ): Promise<VoiceHistoryEntry> {
    return this.mutate(async (catalog, permit) => {
      const entry = assertCurrent(catalog, scope);
      change(entry);
      entry.revision += 1;
      await this.catalogStorage.write(catalog!, permit);
      return structuredClone(entry);
    });
  }

  private async retireBrowserEntries(
    catalog: VoiceHistoryCatalog,
    permit?: PersistenceMutationPermit
  ): Promise<void> {
    const browser = catalog.entries.filter((entry) => entry.backend === 'browser');
    if (browser.length) {
      catalog.entries = catalog.entries.filter((entry) => entry.backend === 'model');
      catalog.pendingDeletes.push(...browser.map(audioIdentity));
      await this.catalogStorage.write(catalog, permit);
    }
    await this.drain(catalog, permit);
  }

  async initialize(): Promise<void> {
    await this.mutate(async (catalog, permit) => {
      if (catalog) {
        await this.retireBrowserEntries(catalog, permit);
        return;
      }
      await this.catalogStorage.write(
        {
          id: 'catalog',
          version: 1,
          epoch: this.uuid(),
          nextSequence: 1,
          entries: [],
          captures: [],
          pendingDeletes: [],
        },
        permit
      );
    });
  }
  async beginCapture(): Promise<VoiceCaptureToken> {
    const observed = await this.guarded(() => this.catalogStorage.read());
    if (!observed) throw new VoiceHistoryError('stale');
    return this.mutate(async (catalog, permit) => {
      if (!catalog || catalog.epoch !== observed.epoch) throw new VoiceHistoryError('stale');
      // The owner lock excludes active publication; only uncommitted bytes can be orphaned.
      await this.recoverAudio(catalog, permit);
      const token = {
        entryId: this.uuid(),
        incarnation: this.uuid(),
        epoch: catalog.epoch,
        sequence: catalog.nextSequence++,
        createdAt: this.now(),
      };
      if (!parseVoiceCaptureToken(token)) throw new VoiceHistoryError('storage-failed');
      catalog.captures.push(token);
      catalog.captures = catalog.captures.slice(-VOICE_HISTORY_LIMIT);
      await this.catalogStorage.write(catalog, permit);
      return token;
    });
  }
  async publishAudio(
    token: VoiceCaptureToken,
    input: {
      audio: Blob;
      durationSeconds: number;
      backend: 'browser' | 'model';
      language: VoiceInputLanguage;
    },
    signal?: AbortSignal
  ): Promise<VoiceHistoryScope> {
    if (input.backend !== 'model' || !parseVoiceCaptureToken(token))
      throw new VoiceHistoryError('stale');
    const mimeType = input.audio.type;
    if (
      input.audio.size > VOICE_HISTORY_MAX_AUDIO_BYTES ||
      input.durationSeconds > VOICE_HISTORY_MAX_DURATION_SECONDS
    )
      throw new VoiceHistoryError('too-large');
    if (
      !input.audio.size ||
      !isVoiceHistoryMimeType(mimeType) ||
      !Number.isFinite(input.durationSeconds) ||
      input.durationSeconds <= 0
    )
      throw new VoiceHistoryError('storage-failed');
    checkSignal(signal);
    const audioDigest = await this.guarded(() => digestAudio(input.audio));
    return this.mutate(async (catalog, permit) => {
      checkSignal(signal);
      if (
        !catalog ||
        catalog.epoch !== token.epoch ||
        token.sequence >= catalog.nextSequence ||
        !catalog.captures.some(
          (capture) =>
            capture.entryId === token.entryId &&
            capture.incarnation === token.incarnation &&
            capture.sequence === token.sequence &&
            capture.createdAt === token.createdAt
        ) ||
        catalog.entries.some(
          (entry) => entry.entryId === token.entryId || entry.sequence === token.sequence
        )
      )
        throw new VoiceHistoryError('stale');
      await this.drain(catalog, permit);
      const retained = new Set(catalog.entries.map(audioIdentity));
      if ((await this.audio.list()).some((identity) => !retained.has(identity)))
        throw new VoiceHistoryError('storage-failed');
      if (
        catalog.entries.length === VOICE_HISTORY_LIMIT &&
        catalog.entries.every((entry) => entry.sequence > token.sequence)
      )
        throw new VoiceHistoryError('stale');
      const entry: VoiceHistoryEntry = {
        ...token,
        revision: 1,
        audioDigest,
        backend: input.backend,
        language: input.language,
        durationSeconds: input.durationSeconds,
        byteLength: input.audio.size,
        mimeType,
        rawTranscript: null,
        transcript: null,
        status: 'recorded',
        correctionStatus: 'off',
        failureCode: null,
      };
      await this.audio.write(audioIdentity(entry), input.audio);
      checkSignal(signal);
      catalog.captures = catalog.captures.filter(
        (capture) => capture.incarnation !== token.incarnation
      );
      catalog.entries.push(entry);
      catalog.entries.sort((left, right) => right.sequence - left.sequence);
      catalog.pendingDeletes.push(
        ...catalog.entries.splice(VOICE_HISTORY_LIMIT).map(audioIdentity)
      );
      await this.catalogStorage.write(catalog, permit);
      // Publication is accepted. Failed physical cleanup remains explicit debt for recover/retry.
      await this.drain(catalog, permit).catch(() => undefined);
      return scopeOf(entry);
    });
  }
  async list(): Promise<VoiceHistoryEntry[]> {
    return this.guarded(async () =>
      structuredClone((await this.catalogStorage.read())?.entries ?? [])
    );
  }
  async get(scope: VoiceHistoryScope): Promise<VoiceHistoryEntry> {
    return this.guarded(async () =>
      structuredClone(assertCurrent(await this.catalogStorage.read(), scope))
    );
  }
  async readAudio(scope: VoiceHistoryScope, signal?: AbortSignal): Promise<File> {
    return this.guarded(async () => {
      checkSignal(signal);
      const entry = assertCurrent(await this.catalogStorage.read(), scope, false);
      const file = await this.audio.read(audioIdentity(entry));
      if (file.size !== entry.byteLength || (await digestAudio(file)) !== entry.audioDigest)
        throw new VoiceHistoryError('storage-failed');
      checkSignal(signal);
      assertCurrent(await this.catalogStorage.read(), scope, false);
      return new File([file], entry.mimeType === 'audio/wav' ? 'voice.wav' : 'voice.webm', {
        type: entry.mimeType,
      });
    });
  }
  async beginProcessing(scope: VoiceHistoryScope): Promise<VoiceHistoryScope> {
    return scopeOf(
      await this.update(scope, (entry) => {
        entry.status = 'processing';
        entry.failureCode = null;
      })
    );
  }
  async saveRawTranscript(
    scope: VoiceHistoryScope,
    rawTranscript: string
  ): Promise<VoiceHistoryScope> {
    if (!isVoiceHistoryText(rawTranscript)) throw new VoiceHistoryError('too-large');
    return scopeOf(
      await this.update(scope, (entry) => {
        entry.rawTranscript = rawTranscript;
      })
    );
  }
  async complete(
    scope: VoiceHistoryScope,
    result: {
      rawTranscript: string;
      transcript: string;
      correctionStatus: VoiceHistoryEntry['correctionStatus'];
    }
  ): Promise<VoiceHistoryEntry> {
    if (!isVoiceHistoryText(result.rawTranscript) || !isVoiceHistoryText(result.transcript))
      throw new VoiceHistoryError('too-large');
    return this.update(scope, (entry) => {
      Object.assign(entry, result, { status: 'ready', failureCode: null });
    });
  }
  async fail(
    scope: VoiceHistoryScope,
    result: { status: 'failed' | 'cancelled'; failureCode: VoiceHistoryEntry['failureCode'] }
  ): Promise<VoiceHistoryEntry> {
    return this.update(scope, (entry) => {
      Object.assign(entry, result);
    });
  }
  async remove(scope: VoiceHistoryScope): Promise<void> {
    await this.mutate(async (catalog, permit) => {
      if (!catalog || !parseVoiceInputHistoryScope(scopeOf(scope)) || catalog.epoch !== scope.epoch)
        throw new VoiceHistoryError('stale');
      const identity = audioIdentity(scope);
      if (catalog.entries.some((entry) => entry.entryId === scope.entryId)) {
        assertCurrent(catalog, scope);
        catalog.entries = catalog.entries.filter((entry) => entry.entryId !== scope.entryId);
        catalog.pendingDeletes.push(identity);
        await this.catalogStorage.write(catalog, permit);
      }
      await this.drain(catalog, permit);
    });
  }
  async recover(): Promise<void> {
    await this.mutate(async (catalog, permit) => {
      if (!catalog) return;
      await this.retireBrowserEntries(catalog, permit);
      await this.recoverAudio(catalog, permit);
    });
  }
  async erase(): Promise<void> {
    await this.mutate(async (catalog, permit) => {
      if (!catalog) return;
      await this.catalogStorage.write(
        {
          id: 'catalog',
          version: 1,
          epoch: this.uuid(),
          nextSequence: 1,
          entries: [],
          captures: [],
          pendingDeletes: [
            ...new Set([...catalog.pendingDeletes, ...catalog.entries.map(audioIdentity)]),
          ],
        },
        permit
      );
      await this.audio.erase();
      const empty = await this.catalogStorage.read(permit);
      if (empty) {
        empty.pendingDeletes = [];
        await this.catalogStorage.write(empty, permit);
      }
    });
  }
  async verifyEmpty(): Promise<boolean> {
    return this.guarded(async () => {
      const catalog = await this.catalogStorage.read();
      return (
        !catalog?.entries.length &&
        !catalog?.pendingDeletes.length &&
        (await this.audio.list()).length === 0
      );
    });
  }
}

/** Creates the single mutation owner for private voice audio and revisioned results. */
export function createVoiceInputHistory(options: VoiceInputHistoryOptions = {}) {
  return new VoiceHistoryOwner(options);
}

export type VoiceInputHistory = ReturnType<typeof createVoiceInputHistory>;
