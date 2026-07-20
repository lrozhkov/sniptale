export function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function readUint16Le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error('AUDIO_PROFILE_INVALID');
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

export function readUint32Le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error('AUDIO_PROFILE_INVALID');
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

export function readSafeUint64Le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 8 > bytes.byteLength) throw new Error('AUDIO_PROFILE_INVALID');
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]!);
  }
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}
