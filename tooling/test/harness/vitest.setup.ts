import { Buffer } from 'node:buffer';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
  writable: true,
});

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
