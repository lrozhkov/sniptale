import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { performance as nodePerformance } from 'node:perf_hooks';
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

for (const name of [
  'clearMarks',
  'clearMeasures',
  'getEntriesByName',
  'getEntriesByType',
  'mark',
  'measure',
] as const) {
  if (typeof globalThis.performance[name] === 'function') continue;
  Object.defineProperty(globalThis.performance, name, {
    configurable: true,
    value: nodePerformance[name].bind(nodePerformance),
    writable: true,
  });
}

const digestNormalization = Symbol.for('sniptale.test.digest.buffer-normalization');
// WebCrypto is shared by VM contexts; repeated wrapping retains previous contexts.
if (!Object.hasOwn(globalThis.crypto.subtle.digest, digestNormalization)) {
  const nativeDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  const normalizedDigest = Object.assign(
    function digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
      const bytes = ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : Buffer.from(new Uint8Array(data));
      return nativeDigest(algorithm, bytes);
    },
    { [digestNormalization]: true }
  );
  Object.defineProperty(globalThis.crypto.subtle, 'digest', {
    configurable: true,
    value: normalizedDigest,
    writable: true,
  });
}
