import { browserStorage } from '../infrastructure/browser-storage';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import {
  SECRET_PROTECTION_WRITER_LOCK,
  LEGACY_SECRET_PROTECTION_TRANSITION_KEY,
} from './constants';
import {
  readSecretProtectionProfile,
  writeSecretProtectionProfile,
  createSecretProtectionProfile,
  verifySecretProtectionPassphrase,
  secretProtectionProfileBinding,
  removeLegacySecretSessionMaterial,
} from './profile.store';
import {
  createNativeSecretProtectionJournalStore,
  readPreparedSecretProtectionControl,
  recoverLegacySecretProtectionTransition,
  type SecretProtectionJournalStore,
  type SecretProtectionBundle,
  type SecretProtectionJournal,
} from './transition.store';
import { clearStoredAISecretUnlockRequests } from './secret-unlock-requests.store';
import {
  SecretProtectionAdmissionPermit,
  SecretProtectionLockedError,
  type SecretParticipantId,
  type SecretProtectionService,
  type SecretProtectionParticipant,
  type SecretProtectionControl,
  type SecretProtectionProfile,
} from './model';

export interface SecretProtectionServiceDependencies {
  participants: readonly SecretProtectionParticipant[];
  journal?: SecretProtectionJournalStore;
  containSync(): Promise<void>;
  revokeLeases(): void;
  onUnlocked?(): Promise<void> | void;
  withWriter?<T>(
    mode: 'shared' | 'exclusive',
    operation: () => Promise<T>,
    ifAvailable?: boolean
  ): Promise<T>;
  readProfile?: typeof readSecretProtectionProfile;
  writeProfile?: typeof writeSecretProtectionProfile;
  recoverLegacy?: typeof recoverLegacySecretProtectionTransition;
  clearUnlockRequests?: typeof clearStoredAISecretUnlockRequests;
  removeLegacySession?: typeof removeLegacySecretSessionMaterial;
}
/** One explicit background instance owns profile transitions and the only unlocked session. */
export function createSecretProtectionService(
  deps: SecretProtectionServiceDependencies
): SecretProtectionService {
  const journal = deps.journal ?? createNativeSecretProtectionJournalStore();
  const readProfile = deps.readProfile ?? readSecretProtectionProfile;
  const writeProfile = deps.writeProfile ?? writeSecretProtectionProfile;
  const clearRequests = deps.clearUnlockRequests ?? clearStoredAISecretUnlockRequests;
  const clearLegacy = deps.removeLegacySession ?? removeLegacySecretSessionMaterial;
  const recoverLegacy = deps.recoverLegacy ?? recoverLegacySecretProtectionTransition;
  const withWriter =
    deps.withWriter ??
    (<T>(mode: 'shared' | 'exclusive', operation: () => Promise<T>, ifAvailable = false) =>
      navigator.locks.request(
        SECRET_PROTECTION_WRITER_LOCK,
        { mode, ...(ifAvailable ? { ifAvailable: true } : {}) },
        (lock) => {
          if (lock === null) throw new SecretProtectionLockedError();
          return operation();
        }
      ));
  let key: CryptoKey | null = null;
  let keyBinding: string | null = null;
  let closed = false;
  let prepared = false;
  let queue: Promise<unknown> = Promise.resolve();
  let reservationCount = 0;
  const participant = (id: SecretParticipantId) => {
    const found = deps.participants.find((p) => p.id === id);
    if (!found) throw new Error('Secret participant unavailable');
    return found;
  };
  const enrolled = (control: SecretProtectionControl, id: SecretParticipantId) =>
    id === 'ai' ? control.participants.ai : control.participants.webdav !== null;
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation, operation);
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
  function clearMemory() {
    key = null;
    keyBinding = null;
    closed = true;
    deps.revokeLeases();
  }
  async function contain(_control: SecretProtectionControl) {
    deps.revokeLeases();
    await deps.containSync();
  }
  async function applyDecided(selected: SecretProtectionJournal): Promise<void> {
    let current = selected;
    const bundle = await journal.decode(current);
    if (current.phase === 'committing') {
      if (bundle.participants.ai)
        await participant('ai').apply(bundle.participants.ai, undefined, bundle.profile);
      else await writeProfile(bundle.profile);
      current = await journal.commit(current, async (target, tx) => {
        if (target.participants.webdav)
          await participant('webdav').apply(target.participants.webdav, tx);
      });
    }
    await browserStorage.local.remove(LEGACY_SECRET_PROTECTION_TRANSITION_KEY);
    await clearLegacy();
    await journal.finish(current, bundle.control);
  }
  async function recover(): Promise<void> {
    await recoverLegacy();
    const control = await journal.readControl();
    const pending = await journal.readJournal();
    if (pending) {
      await contain(control);
      if (pending.phase === 'prepared') await journal.abort(control);
      else await applyDecided(pending);
    } else if (control.phase === 'transitioning') {
      await contain(control);
      await journal.abort(control);
    }
  }
  async function prepareInternal(): Promise<void> {
    if (prepared) return;
    clearMemory();
    await clearLegacy();
    await recover();
    const source = await journal.readControl();
    const profile = await readProfile();
    if (!profile && (source.participants.ai || source.participants.webdav))
      throw new Error('Secret protection profile unavailable');
    const control = await journal.close(source);
    await deps.containSync();
    // A fresh worker changes the durable epoch before an old offscreen lease can dispatch again.
    if (profile && source.epoch === 0 && !source.participants.ai && !source.participants.webdav) {
      const target: SecretProtectionControl = {
        ...control,
        participants: { ...control.participants, ai: true },
      };
      let entry = await journal.prepare(control, 'adopt-legacy-ai', {
        profile,
        control: target,
        participants: {},
      });
      entry = await journal.decide(entry);
      await applyDecided(entry);
    } else await journal.abort(control);
    prepared = true;
    closed = false;
  }
  async function prepare() {
    if (prepared) return;
    await serial(() => withWriter('exclusive', prepareInternal));
  }
  async function readKey(id: SecretParticipantId): Promise<CryptoKey | null> {
    if (reservationCount || !prepared) throw new SecretProtectionLockedError();
    const control = await journal.readControl();
    if (control.phase !== 'stable') throw new SecretProtectionLockedError();
    if (!enrolled(control, id)) return null;
    const profile = await readProfile();
    const binding = await secretProtectionProfileBinding(profile);
    if (closed || !profile || !key || keyBinding !== binding)
      throw new SecretProtectionLockedError();
    return key;
  }
  async function command<T>(operation: () => Promise<T>): Promise<T> {
    return serial(() =>
      withWriter('exclusive', async () => {
        if (reservationCount) throw new SecretProtectionLockedError();
        await prepareInternal();
        return operation();
      })
    );
  }
  async function afterCommand(operation: () => Promise<void>): Promise<void> {
    await command(operation);
    const control = await journal.readControl();
    if (control.phase === 'stable' && (!control.participants.webdav || (!closed && key)))
      await deps.onUnlocked?.();
  }
  async function resolveProfileKey(
    profile: SecretProtectionProfile | null,
    passphrase?: string
  ): Promise<CryptoKey> {
    if (!profile) throw new Error('Secret protection is not enabled');
    if (passphrase !== undefined) return verifySecretProtectionPassphrase(passphrase, profile);
    if (!key || keyBinding !== (await secretProtectionProfileBinding(profile)) || closed)
      throw new SecretProtectionLockedError();
    return key;
  }
  async function transition(
    operation: string,
    actions: Partial<Record<SecretParticipantId, 'protect' | 'unprotect' | 'rekey' | 'reset'>>,
    targetProfile: SecretProtectionProfile | null,
    sourceKey: CryptoKey | null,
    targetKey: CryptoKey | null
  ): Promise<void> {
    const source = await journal.readControl();
    const sourceProfile = await readProfile();
    const sourceBinding = await secretProtectionProfileBinding(sourceProfile);
    const targetBinding = await secretProtectionProfileBinding(targetProfile);
    closed = true;
    deps.revokeLeases();
    const control = await journal.close(source);
    let decided = false;
    try {
      await contain(control);
      const targets: SecretProtectionBundle['participants'] = {};
      const flags = { ...control.participants };
      for (const id of ['ai', 'webdav'] as const) {
        const action = actions[id];
        if (!action) continue;
        const adapter = participant(id);
        targets[id] = await adapter.prepare({
          action,
          sourceKey: enrolled(source, id) ? sourceKey : null,
          targetKey,
          sourceProfileBinding: sourceBinding,
          targetProfileBinding: targetBinding,
        });
        if (id === 'ai') flags.ai = action === 'protect' || action === 'rekey';
        else if (action === 'protect' || action === 'rekey') {
          const binding = await adapter.binding?.();
          if (!binding) throw new Error('WebDAV credential selection unavailable');
          flags.webdav = binding;
        } else flags.webdav = null;
      }
      const bundle: SecretProtectionBundle = {
        profile: targetProfile,
        control: { ...control, participants: flags },
        participants: targets,
      };
      let entry = await journal.prepare(control, operation, bundle);
      entry = await journal.decide(entry);
      decided = true;
      await applyDecided(entry);
      key = targetKey;
      keyBinding = targetKey ? targetBinding : null;
      closed = false;
    } catch (error) {
      key = null;
      keyBinding = null;
      closed = true;
      if (!decided) {
        try {
          await journal.abort(control);
          closed = false;
        } catch {
          /* Preserve closed admission until explicit recovery. */
        }
      }
      prepared = false;
      throw error;
    }
  }
  return {
    prepare,
    readKey,
    clearMemory,
    async getEpoch() {
      return (await journal.readControl()).epoch;
    },
    async withAdmission(id, operation) {
      if (!prepared || closed || reservationCount) throw new SecretProtectionLockedError();
      return withWriter(
        'shared',
        async () => {
          const before = await journal.readControl();
          const selected = await readKey(id);
          const result = await SecretProtectionAdmissionPermit.run((permit) =>
            operation(selected, permit)
          );
          const after = await journal.readControl();
          if (
            before.epoch !== after.epoch ||
            after.phase !== 'stable' ||
            reservationCount ||
            (enrolled(before, id) && (closed || selected !== key))
          )
            throw new SecretProtectionLockedError();
          return result;
        },
        true
      );
    },
    enable: (id, passphrase) =>
      afterCommand(async () => {
        const control = await journal.readControl();
        if (enrolled(control, id))
          throw new Error('Secret participant protection is already enabled');
        const profile = await readProfile();
        const next = profile
          ? { profile, key: await resolveProfileKey(profile, passphrase) }
          : await createSecretProtectionProfile(passphrase ?? '');
        await transition(
          'enable-' + id,
          { [id]: 'protect' },
          next.profile,
          profile ? next.key : null,
          next.key
        );
      }),
    disable: (id, passphrase) =>
      afterCommand(async () => {
        const control = await journal.readControl();
        if (!enrolled(control, id)) throw new Error('Secret participant protection is not enabled');
        const profile = await readProfile();
        const existing = await resolveProfileKey(profile, passphrase);
        await transition('disable-' + id, { [id]: 'unprotect' }, profile, existing, existing);
      }),
    async unlock(passphrase, admit) {
      await command(async () => {
        const profile = await readProfile();
        if (!profile) return;
        const control = await journal.readControl();
        const verified = await verifySecretProtectionPassphrase(passphrase, profile);
        if (control.epoch !== (await journal.readControl()).epoch)
          throw new SecretProtectionLockedError();
        const binding = await secretProtectionProfileBinding(profile);
        if (reservationCount || (admit && !(await admit())))
          throw new SecretProtectionLockedError();
        key = verified;
        keyBinding = binding;
        closed = false;
      });
      await deps.onUnlocked?.();
    },
    async lock() {
      let drainAttempted = false;
      async function drain() {
        drainAttempted = true;
        await deps.containSync();
      }
      try {
        await command(async () => {
          clearMemory();
          const source = await journal.readControl();
          const control = await journal.close(source);
          await drain();
          await clearLegacy();
          await clearRequests();
          await journal.abort(control);
          closed = false;
        });
      } catch (error) {
        prepared = false;
        if (!drainAttempted) {
          await drain();
        }
        throw error;
      }
      // Resumption cannot invalidate completed lock and containment work.
      const control = await journal.readControl();
      if (!control.participants.webdav) {
        await deps.onUnlocked?.();
      }
    },
    changePassphrase: (input) =>
      afterCommand(async () => {
        const profile = await readProfile();
        const existing = await resolveProfileKey(profile, input.currentPassphrase);
        const next = await createSecretProtectionProfile(input.nextPassphrase);
        if (profile) next.profile.enabledAt = profile.enabledAt;
        const control = await journal.readControl();
        await transition(
          'change-passphrase',
          {
            ...(control.participants.ai ? { ai: 'rekey' as const } : {}),
            ...(control.participants.webdav ? { webdav: 'rekey' as const } : {}),
          },
          next.profile,
          existing,
          next.key
        );
      }),
    reset: () =>
      command(async () => {
        const control = await journal.readControl();
        await transition(
          'reset',
          {
            ...(control.participants.ai ? { ai: 'reset' as const } : {}),
            ...(control.participants.webdav ? { webdav: 'reset' as const } : {}),
          },
          null,
          null,
          null
        );
        await clearRequests();
      }),
    resetParticipant: (id) =>
      afterCommand(async () => {
        const profile = await readProfile();
        await transition('reset-' + id, { [id]: 'reset' }, profile, null, key);
      }),
    async readPreparedStatus() {
      const db = capturePreparedDatabase();
      if (!db || !prepared || closed || reservationCount) return null;
      try {
        const profile = await readProfile();
        if (capturePreparedDatabase() !== db) return null;
        const binding = await secretProtectionProfileBinding(profile);
        if (capturePreparedDatabase() !== db) return null;
        const control = await readPreparedSecretProtectionControl();
        if (!control || capturePreparedDatabase() !== db || !prepared || closed || reservationCount)
          return null;
        return {
          isEnabled: profile !== null,
          isUnlocked:
            profile === null ||
            (key !== null && control.phase === 'stable' && keyBinding === binding),
          mode: profile ? 'passphrase' : 'transparent',
          participants: {
            ai: control.participants.ai,
            webdav: control.participants.webdav !== null,
          },
        };
      } catch {
        return null;
      }
    },
    async readStatus() {
      const profile = await readProfile();
      const control = await journal.readControl();
      return {
        isEnabled: profile !== null,
        isUnlocked:
          profile === null ||
          (!closed &&
            key !== null &&
            control.phase === 'stable' &&
            keyBinding === (await secretProtectionProfileBinding(profile))),
        mode: profile ? 'passphrase' : 'transparent',
        participants: { ai: control.participants.ai, webdav: control.participants.webdav !== null },
      };
    },
    reserveErasure() {
      reservationCount++;
      clearMemory();
      let releaseLock!: () => void;
      let acquired!: () => void;
      const entered = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const held = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      let flight: Promise<void> | null = null;
      let released = false;
      function acquire() {
        flight ??= serial(() =>
          withWriter('exclusive', async () => {
            acquired();
            await held;
          })
        );
        void flight.catch(() => undefined);
      }
      return {
        release() {
          if (released) return;
          released = true;
          reservationCount--;
          prepared = false;
          releaseLock();
        },
        async prepare(options) {
          if (released) throw new SecretProtectionLockedError();
          acquire();
          await entered;
          clearMemory();
          await recover();
          const control = await journal.readControl();
          if (control.phase === 'stable') await journal.close(control);
          if (options.includeAiProviderSecrets || !control.participants.ai)
            await writeProfile(null);
          await clearRequests();
          await clearLegacy();
        },
      };
    },
  };
}

/** Join an existing checked writer permit or reserve a short ordinary participant mutation. */
export function withSecretProtectionWriter<T>(
  operation: (permit: SecretProtectionAdmissionPermit) => Promise<T>,
  permit?: SecretProtectionAdmissionPermit
): Promise<T> {
  async function admitted(selected: SecretProtectionAdmissionPermit) {
    const control = await readPreparedSecretProtectionControl();
    if (control && control.phase !== 'stable') throw new SecretProtectionLockedError();
    return operation(selected);
  }
  if (permit !== undefined) {
    if (!SecretProtectionAdmissionPermit.isActive(permit))
      return Promise.reject(new SecretProtectionLockedError());
    return admitted(permit);
  }
  return navigator.locks.request(
    SECRET_PROTECTION_WRITER_LOCK,
    { mode: 'shared', ifAvailable: true },
    (lock) => {
      if (lock === null) throw new SecretProtectionLockedError();
      return SecretProtectionAdmissionPermit.run(admitted);
    }
  );
}
