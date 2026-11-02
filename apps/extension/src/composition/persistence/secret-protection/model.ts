import type { IDBPTransaction } from 'idb';
import type {
  EncryptedSecretEnvelope,
  Pbkdf2AesGcmKeyParams,
} from '@sniptale/platform/security/local-secret-crypto';

export type SecretParticipantId = 'ai' | 'webdav';
export interface SecretProtectionProfile {
  version: 1;
  mode: 'passphrase';
  kdf: Pbkdf2AesGcmKeyParams;
  verifier: EncryptedSecretEnvelope;
  enabledAt: number;
  updatedAt: number;
}
export interface SecretWebdavBinding {
  incarnation: string;
  credentialId: string;
}
export interface SecretProtectionControl {
  version: 1;
  epoch: number;
  phase: 'stable' | 'transitioning';
  participants: { ai: boolean; webdav: SecretWebdavBinding | null };
}
export interface PreparedSecretParticipant {
  payload: unknown;
  nativeKey?: CryptoKey;
}
export interface SecretParticipantPreparation {
  action: 'protect' | 'unprotect' | 'rekey' | 'reset';
  sourceKey: CryptoKey | null;
  targetKey: CryptoKey | null;
  sourceProfileBinding: string | null;
  targetProfileBinding: string | null;
}
export interface SecretProtectionParticipant {
  id: SecretParticipantId;
  prepare(input: SecretParticipantPreparation): Promise<PreparedSecretParticipant>;
  apply(
    prepared: PreparedSecretParticipant,
    tx?: IDBPTransaction<unknown, string[], 'readwrite'>,
    targetProfile?: SecretProtectionProfile | null
  ): Promise<void>;
  binding?(): Promise<SecretWebdavBinding | null>;
}
export class SecretProtectionLockedError extends Error {
  readonly reason = 'secrets-locked' as const;
  constructor() {
    super('Secrets are locked');
    this.name = 'SecretProtectionLockedError';
  }
}
export class SecretProtectionInvalidPassphraseError extends Error {
  readonly reason = 'invalid-secret-passphrase' as const;
  constructor() {
    super('Invalid secret passphrase');
    this.name = 'SecretProtectionInvalidPassphraseError';
  }
}
export interface SecretProtectionStatus {
  isEnabled: boolean;
  isUnlocked: boolean;
  mode: 'transparent' | 'passphrase';
  participants: { ai: boolean; webdav: boolean };
}
/** A live in-process writer admission cannot cross IPC or outlive its callback. */
export class SecretProtectionAdmissionPermit {
  #active = true;
  private constructor() {}
  static isActive(value: unknown): value is SecretProtectionAdmissionPermit {
    return value instanceof SecretProtectionAdmissionPermit && value.#active;
  }
  static async run<T>(
    operation: (permit: SecretProtectionAdmissionPermit) => Promise<T>
  ): Promise<T> {
    const permit = new SecretProtectionAdmissionPermit();
    try {
      return await operation(permit);
    } finally {
      permit.#active = false;
    }
  }
}
export interface SecretProtectionPort {
  readKey(participant: SecretParticipantId): Promise<CryptoKey | null>;
  withAdmission<T>(
    participant: SecretParticipantId,
    operation: (key: CryptoKey | null, permit: SecretProtectionAdmissionPermit) => Promise<T>
  ): Promise<T>;
}
export interface SecretProtectionCommands {
  prepare(): Promise<void>;
  enable(participant: SecretParticipantId, passphrase?: string): Promise<void>;
  disable(participant: SecretParticipantId, passphrase?: string): Promise<void>;
  unlock(passphrase: string, admit?: () => Promise<boolean>): Promise<void>;
  lock(): Promise<void>;
  changePassphrase(input: { currentPassphrase: string; nextPassphrase: string }): Promise<void>;
  reset(): Promise<void>;
  resetParticipant(participant: SecretParticipantId): Promise<void>;
  readStatus(): Promise<SecretProtectionStatus>;
  /** Advisory status from an existing worker session and native handle; unavailable state is null. */
  readPreparedStatus(): Promise<SecretProtectionStatus | null>;
  getEpoch(): Promise<number>;
  clearMemory(): void;
  reserveErasure(): {
    release(): void;
    prepare(options: { includeAiProviderSecrets: boolean }): Promise<void>;
  };
}
export type SecretProtectionService = SecretProtectionPort & SecretProtectionCommands;
