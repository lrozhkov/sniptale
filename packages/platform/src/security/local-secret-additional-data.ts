export type SecretAdditionalData = Record<string, string>;

export function isSecretAdditionalData(value: unknown): value is SecretAdditionalData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function toCryptoBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function orderedAdditionalData(additionalData: SecretAdditionalData): Array<[string, string]> {
  return Object.entries(additionalData).sort(([left], [right]) => left.localeCompare(right));
}

export function encodeSecretAdditionalData(additionalData: SecretAdditionalData): ArrayBuffer {
  return toCryptoBuffer(
    new TextEncoder().encode(
      JSON.stringify(Object.fromEntries(orderedAdditionalData(additionalData)))
    )
  );
}

export function hasMatchingAdditionalData(
  actual: SecretAdditionalData,
  expected: SecretAdditionalData
): boolean {
  return (
    JSON.stringify(orderedAdditionalData(actual)) ===
    JSON.stringify(orderedAdditionalData(expected))
  );
}
