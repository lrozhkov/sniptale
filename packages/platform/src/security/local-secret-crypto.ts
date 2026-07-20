import {
  encodeSecretAdditionalData,
  hasMatchingAdditionalData,
  isSecretAdditionalData,
  type SecretAdditionalData,
} from './local-secret-additional-data';

export type { SecretAdditionalData } from './local-secret-additional-data';

export interface LegacyEncryptedSecretEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  iv: string;
  ciphertext: string;
}

export interface ContextBoundEncryptedSecretEnvelope {
  version: 2;
  algorithm: 'AES-GCM';
  iv: string;
  ciphertext: string;
  additionalData: SecretAdditionalData;
}

export type EncryptedSecretEnvelope =
  | LegacyEncryptedSecretEnvelope
  | ContextBoundEncryptedSecretEnvelope;

export interface Pbkdf2AesGcmKeyParams {
  algorithm: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  keyLengthBits: 256;
  salt: string;
}

const AES_GCM_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const IV_LENGTH_BYTES = 12;
const PASSPHRASE_SALT_LENGTH_BYTES = 16;
const PASSPHRASE_KDF_ALGORITHM = 'PBKDF2';
const PASSPHRASE_KDF_HASH = 'SHA-256';
const PASSPHRASE_KDF_ITERATIONS = 600_000;

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoding is unavailable in this runtime');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new Error('Base64 decoding is unavailable in this runtime');
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function isBase64Bytes(value: string, expectedByteLength: number): boolean {
  try {
    return base64ToBytes(value).byteLength === expectedByteLength;
  } catch {
    return false;
  }
}

function createIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
}

function createSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(PASSPHRASE_SALT_LENGTH_BYTES));
}

function toCryptoBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function getTextEncoder(): TextEncoder {
  return new TextEncoder();
}

function getTextDecoder(): TextDecoder {
  return new TextDecoder();
}

export function isEncryptedSecretEnvelope(value: unknown): value is EncryptedSecretEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as EncryptedSecretEnvelope).algorithm === AES_GCM_ALGORITHM &&
    typeof (value as EncryptedSecretEnvelope).iv === 'string' &&
    typeof (value as EncryptedSecretEnvelope).ciphertext === 'string' &&
    ((value as EncryptedSecretEnvelope).version === 1 ||
      ((value as EncryptedSecretEnvelope).version === 2 &&
        isSecretAdditionalData((value as ContextBoundEncryptedSecretEnvelope).additionalData)))
  );
}

export async function createAesGcmKeyMaterial(): Promise<{
  key: CryptoKey;
  material: string;
}> {
  const key = await crypto.subtle.generateKey(
    {
      name: AES_GCM_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);

  return {
    key,
    material: bytesToBase64(new Uint8Array(raw)),
  };
}

export async function importAesGcmKey(material: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toCryptoBuffer(base64ToBytes(material)),
    {
      name: AES_GCM_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export function createPbkdf2AesGcmKeyParams(): Pbkdf2AesGcmKeyParams {
  return {
    algorithm: PASSPHRASE_KDF_ALGORITHM,
    hash: PASSPHRASE_KDF_HASH,
    iterations: PASSPHRASE_KDF_ITERATIONS,
    keyLengthBits: AES_KEY_LENGTH,
    salt: bytesToBase64(createSalt()),
  };
}

export function isPbkdf2AesGcmKeyParams(value: unknown): value is Pbkdf2AesGcmKeyParams {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Pbkdf2AesGcmKeyParams).algorithm === PASSPHRASE_KDF_ALGORITHM &&
    (value as Pbkdf2AesGcmKeyParams).hash === PASSPHRASE_KDF_HASH &&
    (value as Pbkdf2AesGcmKeyParams).keyLengthBits === AES_KEY_LENGTH &&
    typeof (value as Pbkdf2AesGcmKeyParams).salt === 'string' &&
    Number.isInteger((value as Pbkdf2AesGcmKeyParams).iterations) &&
    (value as Pbkdf2AesGcmKeyParams).iterations === PASSPHRASE_KDF_ITERATIONS &&
    isBase64Bytes((value as Pbkdf2AesGcmKeyParams).salt, PASSPHRASE_SALT_LENGTH_BYTES)
  );
}

export async function deriveAesGcmKeyMaterialFromPassphrase(
  passphrase: string,
  params: Pbkdf2AesGcmKeyParams
): Promise<{ key: CryptoKey; material: string }> {
  const sourceKey = await crypto.subtle.importKey(
    'raw',
    toCryptoBuffer(getTextEncoder().encode(passphrase)),
    PASSPHRASE_KDF_ALGORITHM,
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: PASSPHRASE_KDF_ALGORITHM,
      hash: params.hash,
      iterations: params.iterations,
      salt: toCryptoBuffer(base64ToBytes(params.salt)),
    },
    sourceKey,
    params.keyLengthBits
  );
  const material = bytesToBase64(new Uint8Array(derivedBits));

  return {
    key: await importAesGcmKey(material),
    material,
  };
}

export async function encryptSecret(
  value: string,
  key: CryptoKey,
  additionalData?: SecretAdditionalData
): Promise<EncryptedSecretEnvelope> {
  const iv = createIv();
  const plaintext = getTextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_GCM_ALGORITHM,
      iv: toCryptoBuffer(iv),
      ...(additionalData ? { additionalData: encodeSecretAdditionalData(additionalData) } : {}),
    },
    key,
    toCryptoBuffer(plaintext)
  );

  const encrypted = {
    algorithm: AES_GCM_ALGORITHM,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  } as const;

  return additionalData
    ? { ...encrypted, additionalData, version: 2 }
    : { ...encrypted, version: 1 };
}

export async function decryptSecret(
  envelope: EncryptedSecretEnvelope,
  key: CryptoKey,
  additionalData?: SecretAdditionalData
): Promise<string> {
  if (envelope.version === 2 && !additionalData) {
    throw new Error('AAD required');
  }
  if (
    envelope.version === 2 &&
    !hasMatchingAdditionalData(envelope.additionalData, additionalData!)
  ) {
    throw new Error('AAD mismatch');
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_GCM_ALGORITHM,
      iv: toCryptoBuffer(base64ToBytes(envelope.iv)),
      ...(envelope.version === 2
        ? { additionalData: encodeSecretAdditionalData(additionalData!) }
        : {}),
    },
    key,
    toCryptoBuffer(base64ToBytes(envelope.ciphertext))
  );

  return getTextDecoder().decode(plaintext);
}
