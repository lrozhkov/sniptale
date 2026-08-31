import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
  WritableStream as NodeWritableStream,
} from 'node:stream/web';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
  writable: true,
});

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
    writable: true,
  });
}

for (const [name, implementation] of [
  ['ReadableStream', NodeReadableStream],
  ['TransformStream', NodeTransformStream],
  ['WritableStream', NodeWritableStream],
] as const) {
  if (typeof globalThis[name] !== 'undefined') continue;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: implementation,
    writable: true,
  });
}

const nativeDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);

Object.defineProperty(globalThis.crypto.subtle, 'digest', {
  configurable: true,
  value(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
    const bytes = ArrayBuffer.isView(data)
      ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : Buffer.from(new Uint8Array(data));
    return nativeDigest(algorithm, bytes);
  },
  writable: true,
});
