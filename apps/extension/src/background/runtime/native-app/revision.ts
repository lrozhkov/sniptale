function stringifyCanonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stringifyCanonical).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stringifyCanonical(record[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export async function createNativeCanonicalRevision(
  prefix: string,
  value: unknown
): Promise<string> {
  const encoded = new TextEncoder().encode(stringifyCanonical(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}-sha256-${hex}`;
}
