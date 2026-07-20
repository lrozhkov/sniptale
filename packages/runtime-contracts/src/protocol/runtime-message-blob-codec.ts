import { decodeBase64Bytes } from '../validation/base64';

const RUNTIME_MESSAGE_BLOB_ENVELOPE = '__sniptaleRuntimeBlob';
const MAX_RUNTIME_MESSAGE_BLOB_BYTES = 2 * 1024 * 1024;
const MAX_RUNTIME_MESSAGE_BLOB_BASE64_LENGTH = Math.ceil(MAX_RUNTIME_MESSAGE_BLOB_BYTES / 3) * 4;

interface RuntimeMessageBlobEnvelope {
  __sniptaleRuntimeBlob: true;
  base64: string;
  mimeType: string;
  size: number;
}

export async function encodeRuntimeMessageBlobs(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    return encodeBlob(value);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => encodeRuntimeMessageBlobs(item)));
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, entry]) => [key, await encodeRuntimeMessageBlobs(entry)])
  );
  return Object.fromEntries(entries);
}

export function decodeRuntimeMessageBlobs(value: unknown): unknown {
  if (isRuntimeMessageBlobEnvelope(value)) {
    return decodeBlob(value);
  }
  if (Array.isArray(value)) {
    return value.map(decodeRuntimeMessageBlobs);
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, decodeRuntimeMessageBlobs(entry)])
  );
}

async function encodeBlob(blob: Blob): Promise<RuntimeMessageBlobEnvelope> {
  assertBlobBudget(blob.size);
  return {
    [RUNTIME_MESSAGE_BLOB_ENVELOPE]: true,
    base64: arrayBufferToBase64(await blob.arrayBuffer()),
    mimeType: blob.type,
    size: blob.size,
  };
}

function decodeBlob(envelope: RuntimeMessageBlobEnvelope): Blob {
  assertBlobBudget(envelope.size);
  assertBase64Budget(envelope.base64);
  const bytes = decodeBase64Bytes(envelope.base64);
  if (bytes.byteLength !== envelope.size) {
    throw new Error('Runtime message blob payload size mismatch');
  }
  return new Blob([copyUint8ArrayToArrayBuffer(bytes)], { type: envelope.mimeType });
}

function assertBase64Budget(base64: string): void {
  if (base64.length > MAX_RUNTIME_MESSAGE_BLOB_BASE64_LENGTH) {
    throw new Error('Runtime message blob payload exceeds message budget');
  }
}

function assertBlobBudget(size: number): void {
  if (!Number.isInteger(size) || size < 0 || size > MAX_RUNTIME_MESSAGE_BLOB_BYTES) {
    throw new Error('Runtime message blob payload exceeds message budget');
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function copyUint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function isRuntimeMessageBlobEnvelope(value: unknown): value is RuntimeMessageBlobEnvelope {
  return (
    isPlainRecord(value) &&
    value[RUNTIME_MESSAGE_BLOB_ENVELOPE] === true &&
    typeof value['base64'] === 'string' &&
    typeof value['mimeType'] === 'string' &&
    typeof value['size'] === 'number'
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Blob) &&
    !(value instanceof Uint8Array)
  );
}
