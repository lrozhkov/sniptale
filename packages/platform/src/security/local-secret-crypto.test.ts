import { describe, expect, it } from 'vitest';

import {
  createAesGcmKeyMaterial,
  createPbkdf2AesGcmKeyParams,
  decryptSecret,
  deriveAesGcmKeyMaterialFromPassphrase,
  encryptSecret,
  importAesGcmKey,
  isEncryptedSecretEnvelope,
  isPbkdf2AesGcmKeyParams,
} from './local-secret-crypto';

describe('local-secret-crypto', () => {
  it('encrypts and decrypts a secret with exported key material', async () => {
    const created = await createAesGcmKeyMaterial();
    const imported = await importAesGcmKey(created.material);
    const envelope = await encryptSecret('super-secret', imported);

    await expect(decryptSecret(envelope, imported)).resolves.toBe('super-secret');
    expect(isEncryptedSecretEnvelope(envelope)).toBe(true);
  });

  it('rejects decryption when the key material does not match', async () => {
    const first = await createAesGcmKeyMaterial();
    const second = await createAesGcmKeyMaterial();
    const envelope = await encryptSecret('super-secret', first.key);

    await expect(decryptSecret(envelope, second.key)).rejects.toThrow();
  });

  it('rejects malformed secret envelopes', async () => {
    const created = await createAesGcmKeyMaterial();

    expect(
      isEncryptedSecretEnvelope({
        version: 1,
        algorithm: 'AES-GCM',
        iv: 'iv',
      })
    ).toBe(false);

    await expect(
      decryptSecret(
        {
          version: 1,
          algorithm: 'AES-GCM',
          iv: 'broken',
          ciphertext: 'broken',
        },
        created.key
      )
    ).rejects.toThrow();
  });
});

describe('local-secret-crypto additional authenticated data', () => {
  it('binds versioned secrets to additional authenticated data', async () => {
    const created = await createAesGcmKeyMaterial();
    const additionalData = {
      connectionType: 'openai-compatible',
      providerId: 'provider-1',
      providerOrigin: 'https://api.example.com',
      version: 'ai-provider-secret:v1',
    };
    const envelope = await encryptSecret('super-secret', created.key, additionalData);

    expect(envelope).toEqual(
      expect.objectContaining({
        additionalData,
        algorithm: 'AES-GCM',
        version: 2,
      })
    );
    await expect(decryptSecret(envelope, created.key, additionalData)).resolves.toBe(
      'super-secret'
    );
    await expect(
      decryptSecret(envelope, created.key, {
        ...additionalData,
        providerOrigin: 'https://other.example.com',
      })
    ).rejects.toThrow();
    await expect(decryptSecret(envelope, created.key)).rejects.toThrow();
  });
});

describe('local-secret-crypto passphrase keys', () => {
  it('derives stable AES-GCM material from a passphrase and KDF params', async () => {
    const params = {
      ...createPbkdf2AesGcmKeyParams(),
      iterations: 1,
    };

    expect(isPbkdf2AesGcmKeyParams(params)).toBe(false);
    const first = await deriveAesGcmKeyMaterialFromPassphrase('passphrase', params);
    const second = await deriveAesGcmKeyMaterialFromPassphrase('passphrase', params);
    const wrong = await deriveAesGcmKeyMaterialFromPassphrase('wrong', params);

    expect(first.material).toBe(second.material);
    expect(first.material).not.toBe(wrong.material);
    const envelope = await encryptSecret('protected-secret', first.key);
    await expect(decryptSecret(envelope, second.key)).resolves.toBe('protected-secret');
    await expect(decryptSecret(envelope, wrong.key)).rejects.toThrow();
  });

  it('accepts only versioned passphrase KDF metadata for stored protection', () => {
    const params = createPbkdf2AesGcmKeyParams();

    expect(isPbkdf2AesGcmKeyParams(params)).toBe(true);
    expect(isPbkdf2AesGcmKeyParams({ ...params, iterations: 1 })).toBe(false);
    expect(isPbkdf2AesGcmKeyParams({ ...params, iterations: 10_000_000 })).toBe(false);
    expect(isPbkdf2AesGcmKeyParams({ ...params, salt: 'not base64 !' })).toBe(false);
    expect(isPbkdf2AesGcmKeyParams({ ...params, salt: btoa('short') })).toBe(false);
    expect(isPbkdf2AesGcmKeyParams({ ...params, salt: btoa('12345678901234567') })).toBe(false);
  });
});
